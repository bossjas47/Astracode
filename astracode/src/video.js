// ---------- สร้างวิดีโอ (Seedance ผ่าน maxplus /v1/videos) ----------
// ลูกค้าจ่ายจาก Wallet ต่อคลิป (ตั้งราคาในหลังบ้าน) · สร้างไม่สำเร็จ = คืนเงินอัตโนมัติ · ไฟล์ mp4 เก็บใน R2 (SLIPS) video/<user>/<id>.mp4
// ต้นทุน ~฿37.5 ต่อคลิป 5 วินาที 1080p · key = Secret ตามชื่อในตั้งค่า video_key_name (ค่าเริ่มต้น VIDEO_KEY)
import { err, json, limited } from './core.js';
import { getSettings } from './billing.js';

export const VIDEO_BASE = 'https://api.maxplus-ai.cc', VIDEO_COST = 37.5;
const TABLE = 'CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, prompt TEXT NOT NULL, aspect TEXT NOT NULL, status TEXT NOT NULL, upstream_id TEXT, error TEXT, charged REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, checked_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)';
export const ensureVideos = env => env.DB.batch([env.DB.prepare(TABLE), env.DB.prepare('CREATE INDEX IF NOT EXISTS videos_user ON videos(user_id, id)')]);
export async function videoConf(env) {
  const s = await getSettings(env, ['video_enabled', 'video_price', 'video_key_name', 'video_model']);
  const keyName = s.video_key_name || 'VIDEO_KEY';
  return { enabled: s.video_enabled === '1' && !!env[keyName], price: Math.max(1, +s.video_price || 59), key: env[keyName], model: s.video_model || 'sd26-seedance-2.5-2' };
}
const up = (c, p, init = {}) => fetch(VIDEO_BASE + p, { ...init, headers: { authorization: 'Bearer ' + c.key, ...(init.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(30e3) });
const upErr = async r => { const d = await r.json().catch(() => ({})); return `${r.status}: ${String(d.error?.message || d.error || d.message || d.code || 'request failed').slice(0, 200)}`; };

async function refund(env, v, why) {
  const now = Date.now();
  const done = await env.DB.prepare("UPDATE videos SET status='failed', error=?, updated_at=? WHERE id=? AND status IN ('queued','processing') RETURNING charged").bind(String(why).slice(0, 300), now, v.id).first();
  if (!done?.charged) return;
  const b = await env.DB.prepare('UPDATE users SET balance=balance+? WHERE id=? RETURNING balance').bind(done.charged, v.user_id).first();
  await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(v.user_id, done.charged, b?.balance ?? 0, 'refund', 'คืนเงินวิดีโอที่สร้างไม่สำเร็จ #' + v.id, now).run();
}
// ถามสถานะจากผู้ให้บริการ · เสร็จ = ดาวน์โหลด mp4 เก็บ R2 · ล้มเหลว = คืนเงิน
export async function checkVideo(env, v, c) {
  if (!['queued', 'processing'].includes(v.status) || !v.upstream_id) return v;
  if (v.checked_at && Date.now() - v.checked_at < 8000) return v;
  await env.DB.prepare('UPDATE videos SET checked_at=? WHERE id=?').bind(Date.now(), v.id).run();
  if (Date.now() - v.created_at > 60 * 60e3) { await refund(env, v, 'ใช้เวลานานเกิน 1 ชั่วโมง'); return { ...v, status: 'failed' }; }
  const r = await up(c, '/v1/videos/' + encodeURIComponent(v.upstream_id)).catch(() => null); if (!r?.ok) return v;
  const d = await r.json().catch(() => ({}));
  if (d.status === 'failed') { await refund(env, v, d.error?.message || 'ผู้ให้บริการสร้างไม่สำเร็จ'); return { ...v, status: 'failed' }; }
  if (d.status === 'completed' || d.status === 'succeeded' || (d.output?.url && !['queued', 'processing'].includes(d.status))) {
    const f = await fetch(d.output.url.startsWith('/') ? VIDEO_BASE + d.output.url : d.output.url, { headers: { authorization: 'Bearer ' + c.key } }).catch(() => null);
    if (!f?.ok) return v; // ลองใหม่รอบหน้า
    await env.SLIPS.put(`video/${v.user_id}/${v.id}.mp4`, await f.arrayBuffer(), { httpMetadata: { contentType: 'video/mp4' } });
    await env.DB.prepare("UPDATE videos SET status='done', updated_at=? WHERE id=?").bind(Date.now(), v.id).run();
    return { ...v, status: 'done' };
  }
  if (d.status && d.status !== v.status) await env.DB.prepare('UPDATE videos SET status=?, updated_at=? WHERE id=?').bind(d.status === 'queued' ? 'queued' : 'processing', Date.now(), v.id).run();
  return v;
}
const pub = v => ({ id: v.id, prompt: v.prompt, aspect: v.aspect, status: v.status, error: v.error, charged: v.charged, created_at: v.created_at, url: v.status === 'done' ? `/api/videos/${v.id}/file` : null });

export async function videoApi(req, env, u, path, M) {
  if (!path.startsWith('/api/videos')) return null;
  await ensureVideos(env); const c = await videoConf(env), DB = env.DB;
  if (path === '/api/videos' && M === 'GET') {
    const L = (await DB.prepare('SELECT * FROM videos WHERE user_id=? ORDER BY id DESC LIMIT 30').bind(u.id).all()).results;
    const out = []; for (const v of L) out.push(c.key && env.SLIPS ? await checkVideo(env, v, c) : v);
    return json({ enabled: c.enabled, price: c.price, duration: 5, items: out.map(pub) });
  }
  if (path === '/api/videos' && M === 'POST') {
    if (!c.enabled || !env.SLIPS) return err('ยังไม่เปิดระบบสร้างวิดีโอ', 503);
    if (await limited(env, 'video:' + u.id, 10, 3600e3)) return err('สร้างวิดีโอถี่เกินไป ลองใหม่ภายหลัง', 429);
    if ((await DB.prepare("SELECT COUNT(*) n FROM videos WHERE user_id=? AND status IN ('queued','processing')").bind(u.id).first()).n >= 2) return err('กำลังสร้างอยู่ 2 คลิปแล้ว รอให้เสร็จก่อน', 429);
    const b = await req.json().catch(() => ({})), prompt = String(b.prompt || '').trim().slice(0, 2000), aspect = b.aspect === '9:16' ? '9:16' : '16:9';
    if (prompt.length < 5) return err('อธิบายฉากที่ต้องการก่อน (มุมกล้อง แสง การเคลื่อนไหว อารมณ์ภาพ)');
    const now = Date.now(), took = await DB.prepare('UPDATE users SET balance=balance-?1 WHERE id=?2 AND balance>=?1 RETURNING balance').bind(c.price, u.id).first();
    if (!took) return err(`ยอดเงินใน Wallet ไม่พอ (คลิปละ ฿${c.price}) เติมเงินก่อน`, 402);
    const v = await DB.prepare("INSERT INTO videos (user_id,prompt,aspect,status,charged,cost,created_at,updated_at) VALUES (?,?,?,'queued',?,?,?,?) RETURNING *").bind(u.id, prompt, aspect, c.price, VIDEO_COST, now, now).first();
    await DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -c.price, took.balance, 'video', 'สร้างวิดีโอ #' + v.id, now).run();
    try {
      const r = await up(c, '/v1/videos', { method: 'POST', body: JSON.stringify({ channel_slug: 'unified-video', model: c.model, prompt, duration: 5, aspect_ratio: aspect, resolution: '1080p' }) });
      if (!r.ok) throw new Error(await upErr(r));
      const d = await r.json(); if (!d.id) throw new Error('ไม่ได้รับรหัสงาน');
      await DB.prepare("UPDATE videos SET upstream_id=?, status='processing', updated_at=? WHERE id=?").bind(String(d.id), Date.now(), v.id).run();
    } catch (e) { await refund(env, v, 'เริ่มสร้างไม่สำเร็จ: ' + e.message); return err('เริ่มสร้างวิดีโอไม่สำเร็จ (คืนเงินแล้ว): ' + e.message, 502); }
    return json({ id: v.id, balance: took.balance });
  }
  const m = path.match(/^\/api\/videos\/(\d+)(\/file)?$/); if (!m) return err('not found', 404);
  let v = await DB.prepare('SELECT * FROM videos WHERE id=? AND user_id=?').bind(+m[1], u.id).first(); if (!v) return err('ไม่พบวิดีโอ', 404);
  if (!m[2] && M === 'GET') { if (c.key && env.SLIPS) v = await checkVideo(env, v, c); return json(pub(v)); }
  if (m[2] && M === 'GET') {
    const o = v.status === 'done' && env.SLIPS && await env.SLIPS.get(`video/${v.user_id}/${v.id}.mp4`); if (!o) return err('ไม่พบไฟล์', 404);
    return new Response(o.body, { headers: { 'content-type': 'video/mp4', 'content-disposition': `inline; filename="astracode-video-${v.id}.mp4"`, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
  }
  if (!m[2] && M === 'DELETE') { if (['queued', 'processing'].includes(v.status)) return err('รอให้สร้างเสร็จก่อนจึงลบได้', 409); await env.SLIPS?.delete(`video/${v.user_id}/${v.id}.mp4`).catch(() => {}); await DB.prepare('DELETE FROM videos WHERE id=?').bind(v.id).run(); return json({ ok: true }); }
  return err('not found', 404);
}
// cron: งานที่ลูกค้าปิดหน้าไปแล้ว ยังเก็บไฟล์/คืนเงินให้ครบ
export async function cronVideos(env) {
  await ensureVideos(env); const c = await videoConf(env); if (!c.key || !env.SLIPS) return;
  for (const v of (await env.DB.prepare("SELECT * FROM videos WHERE status IN ('queued','processing') LIMIT 30").all()).results) await checkVideo(env, v, c).catch(() => {});
}
