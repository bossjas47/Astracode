// ---------- ติดตั้งโปรแกรมเขียนโค้ดด้วยคำสั่งเดียว (Codex / Claude Code / OpenCode) ----------
// หน้าเว็บขอคำสั่ง → สร้าง API key ใหม่ + ลิงก์ใช้ครั้งเดียว (15 นาที) → ลูกค้าวาง `curl -fsSL <ลิงก์> | node` (Windows: `irm <ลิงก์> | node`)
// สคริปต์ที่ได้เป็น JavaScript ล้วน (Node มากับ Codex/Claude Code/OpenCode อยู่แล้ว) · สำรองไฟล์ตั้งค่าเดิมเป็น .bak ก่อนเขียน
import { err, json, rand, sha } from './core.js';
import { seal, unseal } from './projects.js';
// payload มี API key ตัวเต็ม: เข้ารหัสด้วย SECRET_KEY ก่อนเก็บ (ขึ้นต้น s: ) ถ้าไม่ได้ตั้ง SECRET_KEY เก็บแบบเดิม แต่ cron ลบทิ้งเมื่อหมดอายุ
const pack = async (env, p) => env.SECRET_KEY ? 's:' + await seal(env, JSON.stringify(p)) : JSON.stringify(p);
const unpack = async (env, t) => JSON.parse(t.startsWith('s:') ? await unseal(env, t.slice(2)) : t);

export const SETUP_TOOLS = ['Codex', 'Claude Code', 'OpenCode'], SETUP_TTL = 15 * 60e3, SETUP_USES = 3;
const TABLE = 'CREATE TABLE IF NOT EXISTS setup_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, payload TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)';
const slugRe = /^[a-z0-9][a-z0-9.\-]{0,80}$/;

export async function setupApi(req, env, u, base) {
  await env.DB.prepare(TABLE).run();
  const b = await req.json().catch(() => ({})), tool = SETUP_TOOLS.includes(b.tool) ? b.tool : null;
  if (!tool) return err('เลือกโปรแกรม Codex / Claude Code / OpenCode');
  const model = String(b.model || ''); if (!slugRe.test(model)) return err('เลือกโมเดลก่อน');
  const models = [...new Set([model, ...(Array.isArray(b.models) ? b.models : []).map(String).filter(x => slugRe.test(x))])].slice(0, 40);
  // key ใหม่ต่อการติดตั้ง (ชื่อ "Setup <โปรแกรม>") · ของเก่าชื่อเดียวกันถูกเพิกถอน กัน key รก
  await env.DB.prepare("UPDATE api_keys SET revoked=1 WHERE user_id=? AND name=? AND revoked=0").bind(u.id, 'Setup ' + tool).run();
  if ((await env.DB.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked=0').bind(u.id).first()).n >= 10) return err('มี API key ครบ 10 อันแล้ว ลบ key ที่ไม่ใช้ในแท็บ API Key ก่อน');
  const key = 'sk-astra-' + rand(24), now = Date.now();
  await env.DB.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').bind(u.id, 'Setup ' + tool, await sha(key), key.slice(0, 14), now).run();
  const token = rand(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM setup_tokens WHERE expires_at<?').bind(now),
    env.DB.prepare('INSERT INTO setup_tokens (token,user_id,payload,expires_at) VALUES (?,?,?,?)').bind(token, u.id, await pack(env, { tool, model, models, key, site: base }), now + SETUP_TTL),
  ]);
  const url = `${base}/setup/${token}`;
  return json({ key, url, unix: `curl -fsSL ${url} | node`, windows: `irm ${url} | node`, expires_at: now + SETUP_TTL });
}

// GET /setup/:token → สคริปต์ Node (ใช้ได้ 3 ครั้งภายใน 15 นาที)
export async function setupScript(env, token) {
  await env.DB.prepare(TABLE).run();
  const row = await env.DB.prepare('UPDATE setup_tokens SET uses=uses+1 WHERE token=? AND expires_at>? AND uses<? RETURNING payload').bind(String(token), Date.now(), SETUP_USES).first();
  const body = row ? script(await unpack(env, row.payload)) : `console.error("ลิงก์ติดตั้งหมดอายุหรือถูกใช้ครบแล้ว · กลับไปที่หน้า Developers แล้วกด 'สร้างคำสั่ง' ใหม่"); process.exit(1);\n`;
  return new Response(body, { status: row ? 200 : 410, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' } });
}

// สคริปต์ที่รันบนเครื่องลูกค้า: ค่าทั้งหมดฝังเป็น JSON (ไม่ต่อสตริงเป็นโค้ด)
export function script(p) {
  return `// Kyber: ตั้งค่า ${p.tool} ให้ใช้ Kyber อัตโนมัติ (สำรองไฟล์เดิมเป็น .bak)
const P = ${JSON.stringify(p)};
const fs = require('fs'), path = require('path'), os = require('os'), home = os.homedir();
const save = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); fs.writeFileSync(f, text); };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const q = s => JSON.stringify(String(s));
let file;
if (P.tool === 'Codex') {
  file = path.join(home, '.codex', 'config.toml');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', out = []; let top = true, skip = false;
  for (const l of old.split(/\\r?\\n/)) { // คงค่าอื่นของผู้ใช้ไว้ · แทนเฉพาะ model/provider ของเรา และ profile ที่เราสร้าง
    if (/^\\s*\\[/.test(l)) { top = false; skip = /^\\s*\\[(model_providers\\.astra|profiles\\.astra-[^\\]]+)\\]\\s*$/.test(l); }
    if (skip) continue; if (top && /^\\s*(model|model_provider)\\s*=/.test(l)) continue; out.push(l);
  }
  const prof = P.models.map(m => '\\n[profiles.astra-' + m.replace(/[^a-z0-9-]/g, '-') + ']\\nmodel = ' + q(m) + '\\nmodel_provider = "astra"\\n').join('');
  save(file, 'model = ' + q(P.model) + '\\nmodel_provider = "astra"\\n' + out.join('\\n').replace(/^\\n+/, '').replace(/\\n*$/, '\\n') + '\\n[model_providers.astra]\\nname = "Kyber"\\nbase_url = ' + q(P.site + '/v1') + '\\nexperimental_bearer_token = ' + q(P.key) + '\\nwire_api = "responses"\\n' + prof);
} else if (P.tool === 'Claude Code') {
  file = path.join(home, '.claude', 'settings.json'); const j = readJson(file);
  j.env = { ...(j.env || {}), ANTHROPIC_BASE_URL: P.site, ANTHROPIC_AUTH_TOKEN: P.key, ANTHROPIC_MODEL: P.model };
  save(file, JSON.stringify(j, null, 2) + '\\n');
} else {
  file = path.join(home, '.config', 'opencode', 'opencode.json'); const j = readJson(file);
  j.provider = { ...(j.provider || {}), astra: { npm: '@ai-sdk/openai-compatible', name: 'Kyber', options: { baseURL: P.site + '/v1', apiKey: P.key }, models: Object.fromEntries(P.models.map(m => [m, { limit: { context: 160000, output: 32000 } }])) } };
  j.model = 'astra/' + P.model; save(file, JSON.stringify(j, null, 2) + '\\n');
}
console.log('\\n✅ ตั้งค่า ' + P.tool + ' ให้ใช้ Kyber แล้ว');
console.log('   ไฟล์: ' + file + (fs.existsSync(file + '.bak') ? '  (ไฟล์เดิมสำรองไว้ที่ .bak)' : ''));
console.log('   โมเดลหลัก: ' + P.model);
if (P.tool === 'Codex' && P.models.length > 1) console.log('   สลับโมเดล: codex --profile astra-<ชื่อโมเดล> เช่น codex --profile astra-' + P.models[1].replace(/[^a-z0-9-]/g, '-'));
if (P.tool === 'OpenCode' && P.models.length > 1) console.log('   สลับโมเดล: พิมพ์ /models ใน OpenCode (มี ' + P.models.length + ' โมเดล)');
if (P.tool === 'Claude Code') console.log('   สลับโมเดล: พิมพ์ /model <ชื่อโมเดล> ใน Claude Code');
console.log('   ปิดโปรแกรมให้หมดแล้วเปิดใหม่\\n');
`;
}
