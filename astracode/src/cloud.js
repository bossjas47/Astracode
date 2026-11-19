// ---------- Agent บนคลาวด์ (แบบ Codex Cloud): สั่งจากเว็บ/มือถือ ไม่ต้องลงแอป ----------
// งาน 1 งาน = Durable Object AgentBox 1 ตัว + เครื่องเสมือน (Cloudflare Container) 1 เครื่อง รันโปรแกรม container/server.js
// ไฟล์โปรเจกต์ (โหมด Code) ถูกส่งเข้าเครื่อง → Agent ทำเองทั้งหมด (เครื่องแยก ทิ้งหลังจบ) → ไฟล์ที่เปลี่ยนเขียนกลับเข้าโปรเจกต์ (มีประวัติให้ย้อน)
// ค่าโมเดล: เครื่องเรียก /v1 ด้วย key ชั่วคราวชื่อ "Cloud Agent" ของลูกค้า → หักแพลนที่รวม Agent / แพ็ก Agent / Wallet ตามจริง
import { err, json, planOf, projectFor, rand, sha } from './core.js';
import { applyChanges } from './agent.js';
import { slug } from './api.js';
import { siteUrl } from './billing.js';

const MAX_MS = 30 * 60e3, MAX_RUNNING = 5;
export const ensureCloud = env => env.DB.prepare('CREATE TABLE IF NOT EXISTS cloud_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, project_id INTEGER NOT NULL, key_id INTEGER, status TEXT NOT NULL, prompt TEXT, model TEXT, events TEXT, final TEXT, changed TEXT, error TEXT, created_at INTEGER, finished_at INTEGER)').run();

export class AgentBox {
  constructor(state, env) { this.s = state; this.env = env; }
  // ส่งคำขอเข้าเครื่องเสมือน (เปิดเครื่องถ้ายังไม่เปิด แล้วรอโปรแกรมพร้อม ~20 วินาที)
  async box(p, init) {
    const c = this.s.container; if (!c) throw new Error('บัญชีนี้ยังไม่เปิดใช้ Containers');
    if (!c.running) c.start({ enableInternet: true });
    let last; for (let i = 0; i < 40; i++) { try { return await c.getTcpPort(8080).fetch('http://box' + p, init); } catch (e) { last = e; await new Promise(ok => setTimeout(ok, 500)); } }
    throw last;
  }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/start') {
      const j = await req.json(); await this.s.storage.put('job', { id: j.id, t0: Date.now(), from: 0, err: 0 });
      const r = await this.box('/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(j.run) });
      if (!r.ok) throw new Error('เริ่มงานในเครื่องไม่สำเร็จ: ' + (await r.text()).slice(0, 200));
      await this.s.storage.setAlarm(Date.now() + 3000); return new Response('ok');
    }
    if (u.pathname === '/stop') { await this.box('/stop', { method: 'POST' }).catch(() => {}); return new Response('ok'); }
    return new Response('not found', { status: 404 });
  }
  // ทุก 4 วินาที: ดึงความคืบหน้าเข้า D1 (หน้าเว็บ/มือถือดูสด) · จบ/เกิน 30 นาที → เอาผลเขียนเข้าโปรเจกต์ แล้วปิดเครื่อง
  async alarm() {
    const job = await this.s.storage.get('job'); if (!job) return;
    try {
      const d = await (await this.box('/events?from=' + job.from)).json();
      if (d.events?.length) { await appendEvents(this.env, job.id, d.events); job.from += d.events.length; }
      const over = Date.now() - job.t0 > MAX_MS;
      if (d.status === 'done' || d.status === 'error' || over) {
        if (over) await this.box('/stop', { method: 'POST' }).catch(() => {});
        const res = await (await this.box('/result')).json();
        await finishJob(this.env, job.id, over ? { ...res, status: 'error', error: 'เกินเวลา 30 นาที หยุดให้แล้ว (ไฟล์ที่ทำถึงตรงนั้นบันทึกแล้ว)' } : res);
        await this.s.storage.delete('job'); try { this.s.container.destroy?.(); } catch { /* ปิดอยู่แล้ว */ } return;
      }
      job.err = 0; await this.s.storage.put('job', job); await this.s.storage.setAlarm(Date.now() + 4000);
    } catch (e) {
      job.err = (job.err || 0) + 1;
      if (job.err > 15) { await finishJob(this.env, job.id, { status: 'error', error: 'เครื่องเสมือนไม่ตอบ: ' + String(e.message).slice(0, 200), changed: [], deleted: [] }); await this.s.storage.delete('job'); return; }
      await this.s.storage.put('job', job); await this.s.storage.setAlarm(Date.now() + 5000);
    }
  }
}

async function appendEvents(env, id, evs) {
  const row = await env.DB.prepare('SELECT events FROM cloud_jobs WHERE id=?').bind(id).first(); if (!row) return;
  const all = [...JSON.parse(row.events || '[]'), ...evs].slice(-400);
  await env.DB.prepare('UPDATE cloud_jobs SET events=? WHERE id=?').bind(JSON.stringify(all).slice(-500000), id).run();
}

export async function finishJob(env, id, res) {
  const job = await env.DB.prepare('SELECT * FROM cloud_jobs WHERE id=?').bind(id).first(); if (!job || job.status !== 'running') return;
  const changes = [...(res.changed || []).map(f => ({ path: f.path, content: f.content })), ...(res.deleted || []).map(p => ({ path: p, del: true }))];
  const ap = changes.length ? await applyChanges(env, job.project_id, changes, true).catch(e => ({ applied: [], problems: [e.message] })) : { applied: [], problems: [] };
  const error = [res.error, ...(ap.problems || [])].filter(Boolean).join(' · ') || null;
  await env.DB.batch([
    env.DB.prepare('UPDATE cloud_jobs SET status=?, final=?, changed=?, error=?, finished_at=? WHERE id=?').bind(res.status === 'done' && !ap.problems?.length ? 'done' : res.status === 'done' ? 'done' : 'failed', String(res.final || '').slice(0, 20000), JSON.stringify(ap.applied || []), error ? error.slice(0, 1000) : null, Date.now(), id),
    env.DB.prepare('UPDATE api_keys SET revoked=1 WHERE id=?').bind(job.key_id || 0), // key ชั่วคราวของงานนี้ใช้ไม่ได้อีก
  ]);
  try { const { sendPush } = await import('./push.js'); await sendPush(env, job.user_id, { title: 'Agent บนคลาวด์ ' + (res.status === 'done' ? 'เสร็จแล้ว' : 'หยุดแล้ว'), body: String(res.final || error || '').slice(0, 140), url: '/code?p=' + job.project_id }); } catch { /* ไม่ได้เปิดแจ้งเตือน */ }
}

export async function cloudApi(req, env, u, path, M) {
  const DB = env.DB; await ensureCloud(env);
  if (path === '/api/cloud-agent' && M === 'GET') {
    const pid = +new URL(req.url).searchParams.get('project');
    return json((await DB.prepare('SELECT id, project_id, status, prompt, model, error, created_at, finished_at FROM cloud_jobs WHERE user_id=? AND (?=0 OR project_id=?) ORDER BY id DESC LIMIT 20').bind(u.id, pid || 0, pid || 0).all()).results.map(j => ({ ...j, available: !!env.AGENTBOX })));
  }
  if (path === '/api/cloud-agent' && M === 'POST') {
    if (!env.AGENTBOX) return err('Agent บนคลาวด์ยังไม่เปิดใช้ในระบบ (รอเปิด Cloudflare Containers)', 503);
    const b = await req.json().catch(() => ({})), pid = +b.project_id, prompt = String(b.prompt || '').trim().slice(0, 20000);
    if (!prompt) return err('พิมพ์งานที่จะให้ Agent ทำ');
    const p = await projectFor(env, pid, u.id); if (!p) return err('ไม่พบโปรเจกต์', 404);
    if ((await DB.prepare("SELECT COUNT(*) n FROM cloud_jobs WHERE user_id=? AND status='running'").bind(u.id).first()).n) return err('มีงานบนคลาวด์ทำอยู่แล้ว รอให้เสร็จก่อน', 429);
    if ((await DB.prepare("SELECT COUNT(*) n FROM cloud_jobs WHERE status='running' AND created_at>?").bind(Date.now() - MAX_MS - 120e3).first()).n >= MAX_RUNNING) return err('เครื่องบนคลาวด์เต็ม ลองใหม่อีกสักครู่', 429);
    const plan = await planOf(env, u), packOk = u.agent_pack_until > Date.now();
    if (!plan?.agent && !packOk && !(u.balance >= 1)) return err('ใช้ Agent บนคลาวด์ได้กับแพลน Pro ขึ้นไป แพ็ก Agent หรือเติม Wallet ก่อน', 402);
    const m = await DB.prepare('SELECT * FROM models WHERE id=? AND active=1 AND public=1').bind(+b.model_id).first() || await DB.prepare("SELECT * FROM models WHERE active=1 AND public=1 AND name LIKE '%Sonnet%' ORDER BY id DESC LIMIT 1").first();
    if (!m) return err('ไม่พบโมเดล', 404);
    const files = (await DB.prepare('SELECT path, content FROM project_files WHERE project_id=?').bind(pid).all()).results;
    const key = 'sk-astra-' + rand(24), now = Date.now();
    const kid = (await DB.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,expires_at) VALUES (?,?,?,?,?,?) RETURNING id').bind(u.id, 'Cloud Agent', await sha(key), key.slice(0, 14), now, now + MAX_MS + 10 * 60e3).first()).id;
    const id = (await DB.prepare("INSERT INTO cloud_jobs (user_id,project_id,key_id,status,prompt,model,events,created_at) VALUES (?,?,?,'running',?,?,'[]',?) RETURNING id").bind(u.id, pid, kid, prompt, m.name, now).first()).id;
    try {
      const stub = env.AGENTBOX.get(env.AGENTBOX.idFromName('job:' + id));
      const r = await stub.fetch('https://box/start', { method: 'POST', body: JSON.stringify({ id, run: { site: siteUrl(env), key, model: slug(m), prompt, files, maxRounds: Math.min(150, +b.max_rounds || 80), effort: b.effort || null } }) });
      if (!r.ok) throw new Error(await r.text());
    } catch (e) { await finishJob(env, id, { status: 'error', error: 'เปิดเครื่องบนคลาวด์ไม่สำเร็จ: ' + String(e.message).slice(0, 300), changed: [], deleted: [] }); return err('เปิดเครื่องบนคลาวด์ไม่สำเร็จ ลองใหม่อีกครั้ง', 502); }
    return json({ id });
  }
  const r = path.match(/^\/api\/cloud-agent\/(\d+)(\/stop)?$/);
  if (r) {
    const j = await DB.prepare('SELECT * FROM cloud_jobs WHERE id=? AND user_id=?').bind(+r[1], u.id).first(); if (!j) return err('ไม่พบงาน', 404);
    if (r[2] && M === 'POST') { if (j.status === 'running' && env.AGENTBOX) await env.AGENTBOX.get(env.AGENTBOX.idFromName('job:' + j.id)).fetch('https://box/stop', { method: 'POST' }).catch(() => {}); return json({ ok: true }); }
    return json({ ...j, events: JSON.parse(j.events || '[]').slice(-150), changed: JSON.parse(j.changed || '[]') });
  }
  return null;
}

// งานที่ค้าง running นานเกิน (DO หายกลางทาง): ปิดเป็น failed และเพิกถอน key (เรียกจาก cron)
export async function reapCloud(env) {
  await ensureCloud(env);
  const old = (await env.DB.prepare("SELECT id FROM cloud_jobs WHERE status='running' AND created_at<?").bind(Date.now() - MAX_MS - 15 * 60e3).all()).results;
  for (const j of old) await finishJob(env, j.id, { status: 'error', error: 'งานค้างเกินเวลา ปิดให้แล้ว', changed: [], deleted: [] });
}
