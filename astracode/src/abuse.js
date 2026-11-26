// ---------- จับแอคหลุม/บัญชีที่เอามาโจมตี (เช่น คู่แข่งเปิดหลายแอคมาโพสต์ด่า/รีวิวปลอม/ปั่นสลิป) + เก็บหลักฐาน ----------
// แนวคิด: ทุกครั้งที่มีการล็อกอิน/สมัคร เก็บสัญญาณต่ออุปกรณ์ (IP เต็ม, user-agent, ลายนิ้วมือเบราว์เซอร์) ไว้ในตารางที่เห็นเฉพาะแอดมิน
// แล้วหา "วง" (ring) ของบัญชีที่ใช้ IP/อุปกรณ์เดียวกัน สมัครไล่ๆ กัน หรือเชื่อมด้วยการแนะนำ/สลิปที่ถูกปฏิเสธ → ให้คะแนนความเสี่ยง + ส่งออกหลักฐาน
import { ip, json, err, coarseIp } from './core.js';

const TBL = `CREATE TABLE IF NOT EXISTS account_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, ip TEXT, ua TEXT, fp TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS account_signals_user ON account_signals(user_id, id);
CREATE INDEX IF NOT EXISTS account_signals_ip ON account_signals(ip);
CREATE INDEX IF NOT EXISTS account_signals_fp ON account_signals(fp);
CREATE TABLE IF NOT EXISTS abuse_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, user_ids TEXT NOT NULL, evidence TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'open', admin_id INTEGER, created_at INTEGER NOT NULL);`;
let made = false;
const ensure = async env => { if (made) return; for (const s of TBL.split(';').map(x => x.trim()).filter(Boolean)) await env.DB.prepare(s).run(); made = true; };

// เก็บสัญญาณหนึ่งครั้ง (เรียกตอนเริ่ม session และตอน client ส่งลายนิ้วมือมา) · เก็บ IP เต็มไว้เป็นหลักฐาน แต่ไม่โชว์ในที่อื่นนอกจากหน้าแอดมิน
export async function recordSignal(env, uid, req, kind = 'session', fp = null) {
  try {
    await ensure(env);
    const raw = ip(req, env), ua = String(req?.headers.get('user-agent') || '').slice(0, 200);
    if (raw === 'local' && !fp) return;
    // กันตารางบวม: ถ้า 10 นาทีที่ผ่านมามีสัญญาณชุดเดิม (IP+UA+fp) ของ user นี้แล้ว ไม่ต้องบันทึกซ้ำ
    const dup = await env.DB.prepare('SELECT 1 FROM account_signals WHERE user_id=? AND ip=? AND ua=? AND COALESCE(fp,\'\')=? AND created_at>?').bind(uid, raw, ua, fp || '', Date.now() - 6e5).first();
    if (dup) return;
    await env.DB.prepare('INSERT INTO account_signals (user_id,kind,ip,ua,fp,created_at) VALUES (?,?,?,?,?,?)').bind(uid, kind, raw, ua, fp, Date.now()).run();
  } catch { /* ไม่ให้ขัดการล็อกอิน */ }
}

// client ส่งลายนิ้วมือเบราว์เซอร์ (hash จาก canvas/หน้าจอ/timezone ฯลฯ) มาผูกกับบัญชี
export async function signalApi(req, env, u) {
  const b = await req.json().catch(() => ({})), fp = String(b.fp || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
  if (fp.length >= 8) await recordSignal(env, u.id, req, 'fp', fp);
  return json({ ok: true });
}

const DAY = 864e5;
// หา "วง" ของบัญชีที่โยงกับ uid นี้: ใช้ IP เต็มเดียวกัน หรือลายนิ้วมือเดียวกัน · คืนรายการ user_id พร้อมเหตุผลที่โยง
export async function ringOf(env, uid, depth = 2) {
  await ensure(env);
  const seen = new Set([uid]), reasons = new Map(); // uid → Set(เหตุผล)
  let frontier = [uid];
  for (let d = 0; d < depth && frontier.length; d++) {
    const ph = frontier.map(() => '?').join(',');
    // บัญชีอื่นที่เคยใช้ IP เต็ม หรือ fp เดียวกับบัญชีในชั้นนี้
    const rows = (await env.DB.prepare(
      `SELECT DISTINCT b.user_id, CASE WHEN a.ip=b.ip AND a.ip IS NOT NULL AND a.ip<>'local' THEN 'ip:'||a.ip ELSE 'fp:'||a.fp END why
       FROM account_signals a JOIN account_signals b ON ((a.ip=b.ip AND a.ip IS NOT NULL AND a.ip<>'local') OR (a.fp=b.fp AND a.fp IS NOT NULL AND length(a.fp)>=8))
       WHERE a.user_id IN (${ph}) AND b.user_id NOT IN (${ph})`).bind(...frontier, ...frontier).all()).results;
    const next = [];
    for (const r of rows) { if (!reasons.has(r.user_id)) reasons.set(r.user_id, new Set()); reasons.get(r.user_id).add(r.why); if (!seen.has(r.user_id)) { seen.add(r.user_id); next.push(r.user_id); } }
    frontier = next;
  }
  // บัญชีที่ผู้ใช้คนเดียวกันแนะนำ (referred_by) ก็นับว่าโยงกัน
  return { ids: [...seen], reasons };
}

// ให้คะแนนความเสี่ยงของบัญชีกลุ่มหนึ่ง + สรุปธงเตือน (ใช้ทั้งในสแกนและหน้าเคส)
export async function scoreGroup(env, ids) {
  if (!ids.length) return { score: 0, flags: [] };
  const ph = ids.map(() => '?').join(',');
  const us = (await env.DB.prepare(`SELECT id,email,banned,created_at,referred_by,plan_id FROM users WHERE id IN (${ph})`).bind(...ids).all()).results;
  const rej = (await env.DB.prepare(`SELECT COUNT(*) n FROM payments WHERE user_id IN (${ph}) AND status='rejected'`).bind(...ids).first()).n;
  const rep = (await env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE user_id IN (${ph})`).bind(...ids).first()).n;
  const times = us.map(u => u.created_at).sort((a, b) => a - b);
  const burst = times.length >= 3 && times[times.length - 1] - times[0] < 2 * 3600e3; // สมัคร ≥3 บัญชีภายใน 2 ชม.
  const tempish = us.filter(u => /guerrilla|temp|disposable|trash|fake|burner|mailinator|yopmail|10min/i.test(u.email)).length;
  const banned = us.filter(u => u.banned).length;
  const flags = [];
  if (ids.length >= 3) flags.push(`${ids.length} บัญชีใช้อุปกรณ์/IP เดียวกัน`);
  if (burst) flags.push('สมัครไล่กันในเวลาสั้น');
  if (tempish) flags.push(`${tempish} บัญชีใช้อีเมลชั่วคราว`);
  if (rej) flags.push(`สลิปถูกปฏิเสธ ${rej} ครั้ง`);
  if (rep) flags.push(`ถูกผู้ใช้อื่นรายงาน ${rep} ครั้ง`);
  if (banned) flags.push(`ถูกแบนแล้ว ${banned} บัญชี`);
  const score = Math.min(100, ids.length * 8 + (burst ? 20 : 0) + tempish * 15 + rej * 6 + rep * 8 + banned * 10);
  return { score, flags, counts: { accounts: ids.length, rejected: rej, reports: rep, temp: tempish, banned } };
}

// สแกนทั้งระบบ: หากลุ่มบัญชีที่ใช้ IP เต็ม/ลายนิ้วมือเดียวกันตั้งแต่ 2 บัญชีขึ้นไป แล้วจัดอันดับตามความเสี่ยง
export async function abuseScan(env, { days = 30, min = 2 } = {}) {
  await ensure(env);
  const since = Date.now() - days * DAY;
  // กลุ่มดิบจาก IP เต็มและจาก fp (นับเฉพาะที่มีหลายบัญชี)
  const groups = (await env.DB.prepare(
    `SELECT 'ip' k, ip v, GROUP_CONCAT(DISTINCT user_id) ids, COUNT(DISTINCT user_id) n FROM account_signals WHERE ip IS NOT NULL AND ip<>'local' AND created_at>? GROUP BY ip HAVING n>=?
     UNION ALL
     SELECT 'fp' k, fp v, GROUP_CONCAT(DISTINCT user_id) ids, COUNT(DISTINCT user_id) n FROM account_signals WHERE fp IS NOT NULL AND length(fp)>=8 AND created_at>? GROUP BY fp HAVING n>=?`
  ).bind(since, min, since, min).all()).results;
  // รวมกลุ่มที่บัญชีซ้อนกันให้เป็นวงเดียว (union-find แบบง่าย)
  const parent = new Map(), find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const seed = id => { if (!parent.has(id)) parent.set(id, id); };
  const why = new Map(); // repId → Set(signal)
  for (const g of groups) { const ids = g.ids.split(',').map(Number); ids.forEach(seed); const r0 = find(ids[0]); for (const id of ids) parent.set(find(id), r0); }
  for (const g of groups) { const ids = g.ids.split(',').map(Number); const r = find(ids[0]); if (!why.has(r)) why.set(r, new Set()); why.get(r).add(g.k + ':' + g.v); }
  const clusters = new Map();
  for (const id of parent.keys()) { const r = find(id); if (!clusters.has(r)) clusters.set(r, new Set()); clusters.get(r).add(id); }
  const out = [];
  for (const [r, set] of clusters) {
    const ids = [...set]; if (ids.length < min) continue;
    const sc = await scoreGroup(env, ids);
    if (sc.score < 12) continue;
    const signals = [...(why.get(r) || [])];
    out.push({ ids, score: sc.score, flags: sc.flags, counts: sc.counts, signals: signals.slice(0, 20), shared_ips: signals.filter(s => s.startsWith('ip:')).length, shared_devices: signals.filter(s => s.startsWith('fp:')).length });
  }
  return out.sort((a, b) => b.score - a.score);
}

// หลักฐานเต็มของกลุ่มบัญชี: รายละเอียดแต่ละบัญชี + ไทม์ไลน์การกระทำ (สมัคร, สลิปถูกปฏิเสธ, ถูกแบน, รายงาน) + อุปกรณ์/IP ที่ใช้ร่วมกัน
export async function evidenceFor(env, ids) {
  await ensure(env);
  if (!ids.length) return { accounts: [], timeline: [], devices: [] };
  const ph = ids.map(() => '?').join(',');
  const accounts = (await env.DB.prepare(`SELECT id,email,banned,created_at,referred_by,plan_id,no_report FROM users WHERE id IN (${ph}) ORDER BY created_at`).bind(...ids).all()).results;
  const sig = (await env.DB.prepare(`SELECT user_id,kind,ip,ua,fp,created_at FROM account_signals WHERE user_id IN (${ph}) ORDER BY created_at`).bind(...ids).all()).results;
  const pays = (await env.DB.prepare(`SELECT user_id,amount,status,created_at FROM payments WHERE user_id IN (${ph}) ORDER BY created_at`).bind(...ids).all()).results;
  const reps = (await env.DB.prepare(`SELECT user_id,reason,snippet,created_at FROM reports WHERE user_id IN (${ph}) ORDER BY created_at`).bind(...ids).all()).results;
  // อุปกรณ์/IP ที่ใช้ร่วมกัน (บัญชีตั้งแต่ 2 ขึ้นไป)
  const devices = (await env.DB.prepare(
    `SELECT 'IP' t, ip v, COUNT(DISTINCT user_id) n, GROUP_CONCAT(DISTINCT user_id) ids FROM account_signals WHERE user_id IN (${ph}) AND ip IS NOT NULL AND ip<>'local' GROUP BY ip HAVING n>=2
     UNION ALL SELECT 'อุปกรณ์' t, fp v, COUNT(DISTINCT user_id) n, GROUP_CONCAT(DISTINCT user_id) ids FROM account_signals WHERE user_id IN (${ph}) AND fp IS NOT NULL AND length(fp)>=8 GROUP BY fp HAVING n>=2 ORDER BY n DESC`
  ).bind(...ids, ...ids).all()).results;
  const email = Object.fromEntries(accounts.map(a => [a.id, a.email]));
  const timeline = [
    ...accounts.map(a => ({ at: a.created_at, uid: a.id, email: a.email, event: 'สมัครบัญชี' + (a.referred_by ? ` (แนะนำโดย #${a.referred_by})` : '') })),
    ...pays.map(p => ({ at: p.created_at, uid: p.user_id, email: email[p.user_id], event: `ชำระเงิน ฿${p.amount} · ${p.status === 'rejected' ? 'สลิปถูกปฏิเสธ' : p.status}` })),
    ...reps.map(r => ({ at: r.created_at, uid: r.user_id, email: email[r.user_id], event: `ถูกรายงาน: ${(r.reason || '').slice(0, 60)}` })),
  ].sort((a, b) => a.at - b.at);
  // นับ session/สัญญาณต่อบัญชี + IP ล่าสุด (ไม่โชว์ UA ยาวในสรุป)
  for (const a of accounts) { const s = sig.filter(x => x.user_id === a.id); a.signals = s.length; a.last_ip = s.at(-1)?.ip || ''; a.last_ua = (s.at(-1)?.ua || '').slice(0, 80); a.devices = [...new Set(s.map(x => x.fp).filter(x => x && x.length >= 8))].length; }
  return { accounts, timeline, devices, signals: sig };
}

// ---------- หน้าแอดมิน ----------
export async function abuseApi(req, env, u, path, M) {
  if (u.role !== 'admin') return err('เฉพาะแอดมิน', 403);
  await ensure(env);
  if (path === '/api/admin/abuse/scan' && M === 'GET') {
    const q = new URL(req.url).searchParams;
    return json({ clusters: await abuseScan(env, { days: +q.get('days') || 30, min: +q.get('min') || 2 }) });
  }
  if (path === '/api/admin/abuse/evidence' && M === 'POST') {
    const b = await req.json().catch(() => ({})), ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(x => x > 0).slice(0, 500);
    if (!ids.length) return err('เลือกบัญชีก่อน');
    const ev = await evidenceFor(env, ids), sc = await scoreGroup(env, ids);
    return json({ ...ev, score: sc.score, flags: sc.flags });
  }
  if (path === '/api/admin/abuse/case' && M === 'POST') { // บันทึกเคส (เก็บหลักฐานไว้ ณ เวลานั้น) + สั่งแบนทั้งวงได้
    const b = await req.json().catch(() => ({})), ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(x => x > 0).slice(0, 500);
    if (!ids.length) return err('เลือกบัญชีก่อน');
    const ev = await evidenceFor(env, ids), sc = await scoreGroup(env, ids);
    const r = await env.DB.prepare('INSERT INTO abuse_cases (label,user_ids,evidence,note,admin_id,created_at) VALUES (?,?,?,?,?,?) RETURNING id')
      .bind(String(b.label || `แอคหลุม ${ids.length} บัญชี`).slice(0, 120), JSON.stringify(ids), JSON.stringify({ ...ev, score: sc.score, flags: sc.flags, saved_at: Date.now() }), String(b.note || '').slice(0, 2000), u.id, Date.now()).first();
    if (b.ban) { const ph = ids.map(() => '?').join(','); await env.DB.prepare(`UPDATE users SET banned=1, no_report=1 WHERE id IN (${ph}) AND role<>'admin'`).bind(...ids).run(); await env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (${ph})`).bind(...ids).run(); }
    return json({ ok: true, id: r.id, banned: !!b.ban });
  }
  if (path === '/api/admin/abuse/cases' && M === 'GET') {
    const rows = (await env.DB.prepare('SELECT id,label,user_ids,note,status,created_at FROM abuse_cases ORDER BY id DESC LIMIT 100').all()).results;
    return json({ cases: rows.map(r => ({ ...r, user_ids: JSON.parse(r.user_ids || '[]') })) });
  }
  const mCase = path.match(/^\/api\/admin\/abuse\/cases\/(\d+)$/);
  if (mCase && M === 'GET') { const r = await env.DB.prepare('SELECT * FROM abuse_cases WHERE id=?').bind(+mCase[1]).first(); if (!r) return err('ไม่พบเคส', 404); return json({ ...r, user_ids: JSON.parse(r.user_ids || '[]'), evidence: JSON.parse(r.evidence || '{}') }); }
  if (mCase && M === 'DELETE') { await env.DB.prepare('DELETE FROM abuse_cases WHERE id=?').bind(+mCase[1]).run(); return json({ ok: true }); }
  return err('ไม่พบ', 404);
}
