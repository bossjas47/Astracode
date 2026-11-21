// ---------- สร้างวิดีโอ (Seedance ผ่าน maxplus /v1/videos) ----------
// ลูกค้าจ่ายจาก Wallet ต่อคลิป (ตั้งราคาในหลังบ้าน) · สร้างไม่สำเร็จ = คืนเงินอัตโนมัติ · ไฟล์ mp4 เก็บใน R2 (SLIPS) video/<user>/<id>.mp4
// ต้นทุน ~฿37.5 ต่อคลิป 5 วินาที 1080p · key = Secret ตามชื่อในตั้งค่า video_key_name (ค่าเริ่มต้น VIDEO_KEY)
import { err, json, limited } from './core.js';
import { getSettings } from './billing.js';

export const VIDEO_BASE = 'https://api.maxplus-ai.cc', VIDEO_COST = 37.5;
const TABLE = 'CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, prompt TEXT NOT NULL, aspect TEXT NOT NULL, status TEXT NOT NULL, upstream_id TEXT, error TEXT, charged REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, checked_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)';
let vReady = null;
export const ensureVideos = env => vReady ||= env.DB.batch([env.DB.prepare(TABLE), env.DB.prepare('CREATE INDEX IF NOT EXISTS videos_user ON videos(user_id, id)')])
  .then(() => Promise.all(['chat_id INTEGER', 'duration INTEGER'].map(c => env.DB.prepare('ALTER TABLE videos ADD COLUMN ' + c).run().catch(() => {})))).catch(e => { vReady = null; throw e; });
export const VIDEO_MAX_S = 30, VIDEO_IMGS = 9, VIDEO_AUDIOS = 3;
// เครื่องมือของ AI (แชต / Code / Cowork): สร้างวิดีโอในเซสชันนั้นเลย · ราคาเหมาต่อคลิป (ไม่ขึ้นกับความยาว)
export const videoToolDef = price => ({ type: 'function', function: { name: 'generate_video', description: `Create a video clip (1080p, 4-30 seconds, Seedance) when the user asks for a video/clip/animation. Costs ฿${price} per clip from the user's Wallet, refunded automatically if it fails, so only call it when the user clearly wants a video, and at most 2 clips per answer. It takes 1-5 minutes; the clip appears under your answer by itself. Write the prompt in English: subject, action, camera movement, lighting, mood, style.`, parameters: { type: 'object', properties: {
  prompt: { type: 'string', description: 'Detailed English scene description' }, duration: { type: 'integer', description: 'Seconds, 4-30 (default 5)' }, aspect: { type: 'string', enum: ['16:9', '9:16'] },
  use_attached_images: { type: 'boolean', description: 'Use the images the user attached in this message as references (up to 9)' } }, required: ['prompt'] } } });
export const vidMarker = id => `\n\n[[vid:${id}]]\n`;
// สร้างคลิป: หัก Wallet → ส่งงานให้ผู้ให้บริการ → ไม่สำเร็จคืนเงิน · images/audios = data URL หรือ URL
export async function createVideo(env, u, { prompt, aspect, duration, images = [], audios = [], chat_id = null }) {
  await ensureVideos(env); const c = await videoConf(env), DB = env.DB;
  if (!c.enabled || !env.SLIPS) throw Object.assign(new Error('ยังไม่เปิดระบบสร้างวิดีโอ'), { status: 503 });
  if (await limited(env, 'video:' + u.id, 10, 3600e3)) throw Object.assign(new Error('สร้างวิดีโอถี่เกินไป ลองใหม่ภายหลัง'), { status: 429 });
  if ((await DB.prepare("SELECT COUNT(*) n FROM videos WHERE user_id=? AND status IN ('queued','processing')").bind(u.id).first()).n >= 2) throw Object.assign(new Error('กำลังสร้างอยู่ 2 คลิปแล้ว รอให้เสร็จก่อน'), { status: 429 });
  prompt = String(prompt || '').trim().slice(0, 2000); if (prompt.length < 5) throw Object.assign(new Error('อธิบายฉากที่ต้องการก่อน (มุมกล้อง แสง การเคลื่อนไหว อารมณ์ภาพ)'), { status: 400 });
  aspect = aspect === '9:16' ? '9:16' : '16:9'; duration = Math.min(VIDEO_MAX_S, Math.max(4, Math.round(+duration || 5)));
  images = (Array.isArray(images) ? images : []).filter(x => typeof x === 'string' && /^(data:image\/|https:\/\/)/.test(x)).slice(0, VIDEO_IMGS);
  audios = (Array.isArray(audios) ? audios : []).filter(x => typeof x === 'string' && /^(data:audio\/|https:\/\/)/.test(x)).slice(0, VIDEO_AUDIOS);
  const now = Date.now(), took = await DB.prepare('UPDATE users SET balance=balance-?1 WHERE id=?2 AND balance>=?1 RETURNING balance').bind(c.price, u.id).first();
  if (!took) throw Object.assign(new Error(`ยอดเงินใน Wallet ไม่พอ (คลิปละ ฿${c.price}) เติมเงินก่อน`), { status: 402 });
  const v = await DB.prepare("INSERT INTO videos (user_id,prompt,aspect,status,charged,cost,created_at,updated_at,chat_id,duration) VALUES (?,?,?,'queued',?,?,?,?,?,?) RETURNING *").bind(u.id, prompt, aspect, c.price, VIDEO_COST, now, now, chat_id || null, duration).first();
  await DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -c.price, took.balance, 'video', 'สร้างวิดีโอ #' + v.id, now).run();
  try {
    const r = await up(c, '/v1/videos', { method: 'POST', body: JSON.stringify({ channel_slug: 'unified-video', model: c.model, prompt, duration, aspect_ratio: aspect, resolution: '1080p', ...(images.length ? { images } : {}), ...(audios.length ? { audios } : {}) }) });
    if (!r.ok) throw new Error(await upErr(r));
    const d = await r.json(); if (!d.id) throw new Error('ไม่ได้รับรหัสงาน');
    await DB.prepare("UPDATE videos SET upstream_id=?, status='processing', updated_at=? WHERE id=?").bind(String(d.id), Date.now(), v.id).run();
  } catch (e) { await refund(env, v, 'เริ่มสร้างไม่สำเร็จ: ' + e.message); throw Object.assign(new Error('เริ่มสร้างวิดีโอไม่สำเร็จ (คืนเงินแล้ว): ' + e.message), { status: 502 }); }
  return { id: v.id, price: c.price, balance: took.balance, duration };
}
// เรียกจากลูปเครื่องมือของแชต/Code
export async function videoTool(env, u, cid, a, { images = [] } = {}) {
  try { const r = await createVideo(env, u, { prompt: a.prompt, aspect: a.aspect, duration: a.duration, images: a.use_attached_images ? images : [], chat_id: cid }); return { result: `Video #${r.id} (${r.duration}s) is being created; ฿${r.price} was charged to the Wallet (refunded if it fails). It appears under your answer in 1-5 minutes. Do not paste a link.`, emit: vidMarker(r.id), ok: true, label: 'สร้างวิดีโอ' }; }
  catch (e) { return { result: 'Error: ' + e.message, ok: false, label: 'สร้างวิดีโอ' }; }
}
export async function videoConf(env) {
  const s = await getSettings(env, ['video_enabled', 'video_price', 'video_key_name', 'video_model']);
  const keyName = s.video_key_name || 'VIDEO_KEY';
  const why = s.video_enabled !== '1' ? 'ยังไม่ได้ติ๊ก "เปิดให้สร้างวิดีโอ" ในหลังบ้าน → ตั้งค่า' : !env[keyName] ? `ยังไม่มี Secret ชื่อ ${keyName} ใน Cloudflare (Workers → astracode → Settings → Variables and Secrets)` : !env.SLIPS ? 'ยังไม่ได้ผูก R2 (SLIPS)' : null;
  return { enabled: s.video_enabled === '1' && !!env[keyName], why, price: Math.max(1, +s.video_price || 59), key: env[keyName], model: s.video_model || 'sd26-seedance-2.5-2' };
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
  if (['completed', 'succeeded'].includes(d.status) && !d.output?.url) return v; // เสร็จแต่ยังไม่มีลิงก์: รอรอบหน้า
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
const pub = v => ({ id: v.id, prompt: v.prompt, aspect: v.aspect, duration: v.duration || 5, status: v.status, error: v.error, charged: v.charged, created_at: v.created_at, url: v.status === 'done' ? `/api/videos/${v.id}/file` : null });

export async function videoApi(req, env, u, path, M) {
  if (!path.startsWith('/api/videos')) return null;
  await ensureVideos(env); const c = await videoConf(env), DB = env.DB;
  if (path === '/api/videos' && M === 'GET') {
    const L = (await DB.prepare('SELECT * FROM videos WHERE user_id=? ORDER BY id DESC LIMIT 30').bind(u.id).all()).results;
    const out = []; for (const v of L) out.push(c.key && env.SLIPS ? await checkVideo(env, v, c) : v);
    return json({ enabled: c.enabled && !!env.SLIPS, why: ['admin', 'support'].includes(u.role) ? c.why : undefined, price: c.price, max_s: VIDEO_MAX_S, max_images: VIDEO_IMGS, max_audios: VIDEO_AUDIOS, items: out.map(pub) });
  }
  if (path === '/api/videos' && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    try { return json(await createVideo(env, u, { prompt: b.prompt, aspect: b.aspect, duration: b.duration, images: b.images, audios: b.audios, chat_id: +b.chat_id || null })); } catch (x) { return err(x.message, x.status || 500); }
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

// /v1/videos สำหรับ API key (Cowork บนคลาวด์ และลูกค้า API): POST สร้าง · GET /v1/videos/:id สถานะ · GET /v1/videos/:id/content ไฟล์ mp4
export async function videoV1(req, env, k, path) {
  const u = { id: k.id };
  if (path === '/v1/videos' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    try { const r = await createVideo(env, u, { prompt: b.prompt, aspect: b.aspect_ratio || b.aspect, duration: b.duration, images: b.images, audios: b.audios }); return json({ id: String(r.id), object: 'video', status: 'processing', duration: r.duration, charged_thb: r.price }); }
    catch (x) { return json({ error: { message: x.message, type: 'video_error' } }, x.status || 500); }
  }
  const m = path.match(/^\/v1\/videos\/(\d+)(\/content)?$/); if (!m || req.method !== 'GET') return null;
  await ensureVideos(env); const c = await videoConf(env);
  let v = await env.DB.prepare('SELECT * FROM videos WHERE id=? AND user_id=?').bind(+m[1], k.id).first(); if (!v) return json({ error: { message: 'video not found' } }, 404);
  if (c.key && env.SLIPS) v = await checkVideo(env, v, c);
  if (m[2]) { const o = v.status === 'done' && await env.SLIPS.get(`video/${v.user_id}/${v.id}.mp4`); return o ? new Response(o.body, { headers: { 'content-type': 'video/mp4' } }) : json({ error: { message: 'not ready' } }, 409); }
  return json({ id: String(v.id), object: 'video', status: v.status === 'done' ? 'completed' : v.status, error: v.error ? { message: v.error } : null, output: v.status === 'done' ? { url: `/v1/videos/${v.id}/content` } : null });
}
