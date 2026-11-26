// ตัวช่วยทดสอบ: รัน Worker จริงใน Node กับ D1 จำลอง (node:sqlite) และโมเดลปลอมในเครื่อง ไม่แตะบริการจริง
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map(x => x === undefined ? null : Array.isArray(x) ? new Uint8Array(x) : x); return this; } // D1 รับ array เป็น BLOB
  _s() { return this.db.prepare(this.sql); }
  async first(col) { const r = this._s().get(...this.args) ?? null; return col && r ? r[col] : r; }
  async all() { const results = this._s().all(...this.args); return { results, success: true, meta: { changes: 0 } }; }
  async run() { const r = this._s().run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
// D1 จำลอง: prepare().bind().first()/all()/run() และ batch() (ทำในทรานแซกชัน)
export function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
  db.exec("INSERT OR IGNORE INTO settings (key,value) VALUES ('open_until','')"); // ปิดโปรทดลองฟีเจอร์ที่ระบบตั้งค่าเริ่มต้นให้ (ทดสอบแต่ละเรื่องเปิดเอง)
  return {
    raw: db,
    prepare: sql => new Stmt(db, sql),
    // batch: statement ที่มี RETURNING/SELECT รันครั้งเดียวด้วย all() (เดิมรันซ้ำสองรอบ ต่างจาก D1 จริง)
    async batch(stmts) { db.exec('BEGIN'); try { const out = []; for (const s of stmts) out.push(await (/\bRETURNING\b|^\s*SELECT\b/i.test(s.sql) ? s.all() : s.run())); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async exec(sql) { db.exec(sql); },
  };
}

// แต่ละการทดสอบโหลด Worker ชุดใหม่ (ตัวแปรระดับโมดูลอย่างแคชตารางที่สร้างตอนรันจะไม่ข้ามฐานข้อมูล)
let seq = 0;
export async function loadWorker() {
  const dir = mkdtempSync(join(tmpdir(), `astra-${++seq}-`)); // คัดลอกทุกโมดูลใน src (แต่ละชุดมีตัวแปรระดับโมดูลของตัวเอง)
  cpSync(join(root, 'src'), dir, { recursive: true }); writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  return import(pathToFileURL(join(dir, 'worker.js')).href);
}

export const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export async function makeEnv(extra = {}) {
  const DB = makeDB();
  const env = { DB, ASSETS: { fetch: async () => new Response('asset') }, ...extra };
  const worker = await loadWorker();
  const ctx = { waitUntil: p => { ctx.pending.push(Promise.resolve(p).catch(() => {})); }, pending: [] };
  const call = (path, { method = 'GET', body, rawBody, cookie, headers = {} } = {}) => worker.default.fetch(new Request('https://t.test' + path, { // rawBody = FormData/Blob ส่งตรง (multipart)
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: rawBody ?? (body ? JSON.stringify(body) : undefined),
  }), env, ctx);
  const json = async (path, opt) => { const r = await call(path, opt); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d, res: r }; };
  const user = async (o = {}) => {
    const now = Date.now(), email = o.email || `u${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const row = DB.raw.prepare('INSERT INTO users (email,pass_hash,role,created_at,ref_code,email_verified,balance) VALUES (?,?,?,?,?,1,?) RETURNING *').get(email, 'x', o.role || 'user', now, Math.random().toString(36).slice(2, 6).toUpperCase(), o.balance ?? 0);
    const sid = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    DB.raw.prepare('INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)').run(await sha(sid), row.id, now + 864e5);
    if (row.role === 'admin' && !o.locked) { await call('/api/me', { cookie: 'sid=' + sid }); DB.raw.prepare('UPDATE sessions SET admin_ok=? WHERE token=?').run(now + 864e5, await sha(sid)); } // ทดสอบทั่วไปให้แอดมินปลดล็อกชั้นที่สองแล้ว (locked: true = ไม่ปลด)
    return { ...row, cookie: 'sid=' + sid };
  };
  return { env, DB, call, json, user, ctx, worker };
}

// โมเดลปลอมแบบ OpenAI-compatible: ตอบข้อความตามที่ตั้ง หรือค้าง (stall) หรือตอบ error
export async function fakeModel(handler) {
  const hits = [];
  const srv = createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { let body = {}; try { body = b ? JSON.parse(b) : {}; } catch { body = { raw: b }; } hits.push({ url: req.url, body }); handler(req, res, body); }); }); // body ที่ไม่ใช่ JSON (เช่น multipart สลิป) เก็บเป็น { raw }
  await new Promise(r => srv.listen(0, r));
  const sse = (res, text, usage = { prompt_tokens: 10, completion_tokens: 5 }) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage }) + '\n\n'); res.write('data: [DONE]\n\n'); res.end();
  };
  return { url: 'http://127.0.0.1:' + srv.address().port, hits, sse, close: () => { srv.closeAllConnections?.(); srv.close(); } };
}

export function addModel(DB, o) {
  return DB.raw.prepare('INSERT INTO models (name,provider,api_model,base_url,key_name,cost_in,cost_out,cost_cache,cost_cache_write,active,public,sort,fallback_id,effort) VALUES (?,?,?,?,?,?,?,?,?,1,1,?,?,?) RETURNING *')
    .get(o.name, o.provider || 'openai', o.api_model || 'm', o.base_url, o.key_name || 'K', o.cost_in ?? 1, o.cost_out ?? 2, o.cost_cache ?? 0.1, o.cost_cache_write ?? 1, o.sort || 0, o.fallback_id ?? null, o.effort || 'none');
}
export function addPlan(DB, o = {}) {
  const p = DB.raw.prepare('INSERT INTO plans (name,price,limit_4h,limit_week,seats,shared_pool,active,sort,api_limit) VALUES (?,?,?,?,?,?,1,?,?) RETURNING *').get(o.name || 'P', o.price ?? 100, o.limit_4h ?? 5, o.limit_week ?? 20, o.seats ?? 1, o.shared_pool ?? 0, o.sort ?? 1, o.api_limit ?? 0);
  for (const m of o.models || []) DB.raw.prepare('INSERT INTO plan_models VALUES (?,?)').run(p.id, m);
  return p;
}
// อ่านสตรีม SSE ของ /api/chat ให้เป็นรายการอีเวนต์
export async function readSSE(res) {
  const text = await res.text(), out = [];
  for (const line of text.split('\n')) if (line.startsWith('data:')) { try { out.push(JSON.parse(line.slice(5))); } catch { /* ข้าม */ } }
  return out;
}
