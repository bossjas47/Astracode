// งานตามเวลา: ลูกค้าตั้งคำสั่งให้ AI ทำทุกวัน/วันทำงาน/สัปดาห์ละครั้ง ตามเวลาไทย · ผลเก็บเป็นแชตในเว็บ (+ แจ้งเตือน + อีเมลถ้าเลือก)
// ใช้เส้นทางแชตปกติ (chat()) จึงผ่านการตรวจแพลน/ลิมิต/ล็อก และนับการใช้งานเหมือนพิมพ์เอง · แพลนจ่ายเงินเท่านั้น สูงสุด 3 งาน
import { BKK, err, esc, json, planOf } from './core.js';
import { chat } from './ai.js';
import { mail, mailBox, siteUrl } from './billing.js';
import { sendPush } from './push.js';

export const SCHED_MAX = 3, SCHED_FRESH = 20; // ข้อความในแชตเกิน 20 = เริ่มแชตใหม่ (context ไม่โตไม่สิ้นสุด)
export const SCHED_TABLE = 'CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, model_id INTEGER NOT NULL, hour INTEGER NOT NULL, days TEXT NOT NULL DEFAULT \'daily\', email INTEGER NOT NULL DEFAULT 0, search INTEGER NOT NULL DEFAULT 1, chat_id INTEGER, last_run INTEGER, last_status TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)';
let tableDone = null;
const ensureTable = env => tableDone ||= env.DB.prepare(SCHED_TABLE).run().then(() => env.DB.prepare('ALTER TABLE schedules ADD COLUMN cowork INTEGER').run().catch(() => {})).catch(e => { tableDone = null; throw e; }); // cowork = 1: เปิดงาน Cowork ใหม่ตามเวลา
const DAYS = ['daily', 'weekdays', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const schedPaid = plan => plan?.price > 0 && !plan.once;
// ถึงรอบหรือยัง (เวลาไทย): ชั่วโมงตรง + วันตรง + ยังไม่รันใน 20 ชม.
export function due(s, now = Date.now()) {
  const d = new Date(now + BKK), wd = d.getUTCDay();
  if (!s.active || d.getUTCHours() !== s.hour || (s.last_run && now - s.last_run < 20 * 3600e3)) return false;
  return s.days === 'daily' || (s.days === 'weekdays' && wd >= 1 && wd <= 5) || DAYS.indexOf(s.days) - 2 === wd;
}
function clean(b) {
  const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 60), prompt = String(b.prompt || '').trim().slice(0, 4000);
  const hour = Math.floor(+b.hour), days = DAYS.includes(b.days) ? b.days : 'daily';
  if (!title || !prompt) throw new Error('ใส่ชื่องานและคำสั่ง');
  if (!(hour >= 0 && hour <= 23)) throw new Error('เวลาไม่ถูกต้อง');
  return { title, prompt, hour, days, model_id: +b.model_id || 0, email: b.email ? 1 : 0, search: b.search === false ? 0 : 1, cowork: b.cowork ? 1 : 0 };
}

// รันหนึ่งงาน: ส่งคำสั่งเข้าแชตเหมือนผู้ใช้พิมพ์ แล้วรออ่านสตรีมจนจบ
export async function runSchedule(env, s, u) {
  if (s.cowork) { // งาน Cowork ตามเวลา: เปิดงานใหม่ในเครื่องเสมือน (แจ้งเตือนเมื่อเสร็จจาก finishCowork)
    const { coworkStart } = await import('./cowork.js'); let status = 'ok', id = null;
    try { id = await coworkStart(env, u, `[งาน Cowork ตามเวลา: ${s.title}]\n${s.prompt}`); } catch (e) { status = String(e.message).slice(0, 200); }
    await env.DB.prepare('UPDATE schedules SET last_run=?, last_status=? WHERE id=?').bind(Date.now(), status, s.id).run();
    if (status !== 'ok') await sendPush(env, u.id, { title: '⏰ ' + s.title, body: 'เริ่มงาน Cowork ไม่สำเร็จ: ' + status, url: '/chat?mode=cowork' });
    return { status, task_id: id };
  }
  let cid = s.chat_id;
  if (cid) { const n = await env.DB.prepare('SELECT COUNT(*) n FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.chat_id=? AND c.user_id=? AND c.deleted_at IS NULL').bind(cid, u.id).first(); if (!n?.n || n.n >= SCHED_FRESH) cid = null; }
  const pending = [], ctx = { waitUntil: p => pending.push(Promise.resolve(p).catch(() => {})) };
  const stamp = new Date(Date.now() + BKK).toISOString().slice(0, 16).replace('T', ' ');
  const req = new Request('https://internal/api/chat', { method: 'POST', body: JSON.stringify({ text: `[งานตามเวลา: ${s.title} · ${stamp}]\n${s.prompt}`, model_id: s.model_id, chat_id: cid || undefined, search: !!s.search }) });
  let status = 'ok', text = '';
  try {
    const res = await chat(req, env, u, ctx);
    if (!res.ok || !(res.headers.get('content-type') || '').includes('event-stream')) { status = (await res.json().catch(() => ({}))).error || 'HTTP ' + res.status; }
    else {
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).replace(/^data: /, ''); buf = buf.slice(i + 2);
          try { const d = JSON.parse(line); if (d.chat_id) cid = d.chat_id; if (d.t) text += d.t; if (d.error) status = String(d.error).slice(0, 200); } catch { /* ไม่ใช่ JSON */ }
        }
      }
    }
  } catch (e) { status = String(e.message || e).slice(0, 200); }
  await Promise.all(pending);
  if (cid && cid !== s.chat_id) await env.DB.prepare("UPDATE chats SET title=? WHERE id=? AND user_id=?").bind('⏰ ' + s.title, cid, u.id).run().catch(() => {});
  await env.DB.prepare('UPDATE schedules SET last_run=?, last_status=?, chat_id=? WHERE id=?').bind(Date.now(), status, cid || null, s.id).run();
  const url = cid ? '/chat?id=' + cid : '/chat';
  if (status === 'ok') {
    await sendPush(env, u.id, { title: '⏰ ' + s.title, body: text.replace(/\[\[[^\]]*\]\]/g, '').replace(/[#*`>]/g, '').trim().slice(0, 200) || 'เสร็จแล้ว', url });
    if (s.email) await mail(env, u.email, 'AstraCode: ' + s.title, mailBox(s.title, esc(text.replace(/\[\[[^\]]*\]\]/g, '').trim().slice(0, 20000)).replace(/\n/g, '<br>') + `<br><br><a href="${siteUrl(env)}${url}">เปิดในแชต</a>`));
  }
  return { status, chat_id: cid };
}

// cron ทุกชั่วโมง: รันงานที่ถึงรอบ (ไม่เกิน 20 งานต่อรอบ)
export async function cronSchedules(env, now = Date.now()) {
  await ensureTable(env);
  const rows = (await env.DB.prepare('SELECT * FROM schedules WHERE active=1 AND hour=? LIMIT 200').bind(new Date(now + BKK).getUTCHours()).all()).results.filter(s => due(s, now)).slice(0, 20);
  for (const s of rows) {
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=? AND banned=0').bind(s.user_id).first(); if (!u) continue;
    if (!schedPaid(await planOf(env, u))) { await env.DB.prepare("UPDATE schedules SET active=0, last_status='แพลนไม่รองรับงานตามเวลา (หยุดไว้)' WHERE id=?").bind(s.id).run(); continue; }
    await runSchedule(env, s, u);
  }
  return rows.length;
}

export async function schedApi(req, env, u, path, M) {
  if (!path.startsWith('/api/schedules')) return null;
  await ensureTable(env);
  const DB = env.DB, mine = () => DB.prepare('SELECT * FROM schedules WHERE user_id=? ORDER BY created_at').bind(u.id).all().then(r => r.results);
  if (path === '/api/schedules' && M === 'GET') return json({ items: await mine(), max: SCHED_MAX, allowed: schedPaid(await planOf(env, u)) });
  if (!schedPaid(await planOf(env, u))) return err('งานตามเวลาใช้ได้กับแพลนที่ชำระเงิน', 403);
  if (path === '/api/schedules' && M === 'POST') {
    let v; try { v = clean(await req.json()); } catch (e) { return err(e.message); }
    if ((await mine()).length >= SCHED_MAX) return err(`ตั้งได้สูงสุด ${SCHED_MAX} งาน`, 403);
    const row = await DB.prepare('INSERT INTO schedules (user_id,title,prompt,model_id,hour,days,email,search,created_at,cowork) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *').bind(u.id, v.title, v.prompt, v.model_id, v.hour, v.days, v.email, v.search, Date.now(), v.cowork).first();
    return json(row);
  }
  const m = path.match(/^\/api\/schedules\/(\d+)(\/run)?$/); if (!m) return err('not found', 404);
  const s = await DB.prepare('SELECT * FROM schedules WHERE id=? AND user_id=?').bind(+m[1], u.id).first(); if (!s) return err('ไม่พบงาน', 404);
  if (m[2] && M === 'POST') { // รันตอนนี้ (ทดสอบ) · กันกดรัว: ห่างกันอย่างน้อย 2 นาที
    if (s.last_run && Date.now() - s.last_run < 120e3) return err('เพิ่งรันไป รออีกสักครู่', 429);
    return json(await runSchedule(env, s, u));
  }
  if (M === 'DELETE') { await DB.prepare('DELETE FROM schedules WHERE id=?').bind(s.id).run(); return json({ ok: true }); }
  if (M === 'PUT') {
    const b = await req.json(); if (Object.keys(b).length === 1 && 'active' in b) { await DB.prepare('UPDATE schedules SET active=? WHERE id=?').bind(b.active ? 1 : 0, s.id).run(); return json({ ok: true }); }
    let v; try { v = clean({ ...s, ...b }); } catch (e) { return err(e.message); }
    await DB.prepare('UPDATE schedules SET title=?,prompt=?,model_id=?,hour=?,days=?,email=?,search=? WHERE id=?').bind(v.title, v.prompt, v.model_id, v.hour, v.days, v.email, v.search, s.id).run();
    return json({ ok: true });
  }
  return err('not found', 404);
}
