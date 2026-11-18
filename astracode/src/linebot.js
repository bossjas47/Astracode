// คุยกับ AI ผ่าน LINE Official Account (Messaging API)
// ตั้ง secret ของ Worker: LINE_BOT_SECRET (Channel secret) และ LINE_BOT_TOKEN (Channel access token) แล้วใส่ Webhook URL = <เว็บ>/line/webhook
// ผูกบัญชี: ใช้ line_id จาก LINE Login (ถ้าอยู่ provider เดียวกัน) หรือส่งรหัส 6 หลักจากหน้าบัญชีให้ OA
// คิดเงินเหมือนแชตเว็บ: หักลิมิตแพลน · ลิมิตเต็มและเปิด "ใช้ Wallet เมื่อลิมิตเต็ม" = หัก Wallet
import { SYSTEM, allowedModels, err, json, limited, planOf, rand, usageStatus, WALLET_MIN } from './core.js';
import { callModel, logUsage } from './ai.js';
import { getSetting, siteUrl } from './billing.js';

const enc = new TextEncoder();
const ensure = env => env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS line_links (code TEXT PRIMARY KEY, user_id INTEGER NOT NULL, exp INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS line_bot_users (line_uid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, chat_id INTEGER, created_at INTEGER NOT NULL)'),
]);
export async function lineSigOk(secret, body, sig) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)))));
  return mac.length === String(sig || '').length && mac === sig;
}
const send = (env, path, body) => fetch('https://api.line.me/v2/bot/message/' + path, { method: 'POST', headers: { authorization: 'Bearer ' + env.LINE_BOT_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const say = async (env, ev, text) => { // ตอบด้วย replyToken (ฟรี) · หมดอายุ/ใช้ไม่ได้ = push
  const messages = [{ type: 'text', text: text.slice(0, 4900) || '…' }];
  const r = await send(env, 'reply', { replyToken: ev.replyToken, messages }).catch(() => null);
  if (!r?.ok && ev.source?.userId) await send(env, 'push', { to: ev.source.userId, messages }).catch(() => {});
};

// หน้าบัญชี: ขอรหัสผูก LINE (อายุ 10 นาที)
export async function lineLinkCode(env, u) {
  await ensure(env);
  const code = String(100000 + (parseInt(rand(4), 16) % 900000));
  await env.DB.batch([env.DB.prepare('DELETE FROM line_links WHERE user_id=? OR exp<?').bind(u.id, Date.now()), env.DB.prepare('INSERT OR REPLACE INTO line_links VALUES (?,?,?)').bind(code, u.id, Date.now() + 600e3)]);
  return json({ code, oa: (await getSetting(env, 'line_oa_id')) || '', ready: !!(env.LINE_BOT_SECRET && env.LINE_BOT_TOKEN) });
}

export async function lineWebhook(req, env, ctx) {
  if (!env.LINE_BOT_SECRET || !env.LINE_BOT_TOKEN) return err('LINE bot is not configured', 404);
  const body = await req.text();
  if (!await lineSigOk(env.LINE_BOT_SECRET, body, req.headers.get('x-line-signature'))) return err('bad signature', 401);
  let evs = []; try { evs = JSON.parse(body).events || []; } catch { return err('bad body', 400); }
  await ensure(env);
  ctx.waitUntil(Promise.all(evs.filter(e => e.type === 'message' && e.message?.type === 'text' && e.source?.userId).map(e => handle(env, e).catch(x => { console.log('line', x.message); return say(env, e, 'ขออภัย ตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง'); }))));
  return json({ ok: true }); // LINE ต้องได้ 200 เร็ว ๆ งานจริงทำต่อเบื้องหลัง
}

async function handle(env, ev) {
  const DB = env.DB, luid = ev.source.userId, text = ev.message.text.trim(), now = Date.now();
  if (/^\d{6}$/.test(text)) { // ผูกบัญชีด้วยรหัสจากหน้าบัญชี
    const l = await DB.prepare('DELETE FROM line_links WHERE code=? AND exp>? RETURNING user_id').bind(text, now).first();
    if (!l) return say(env, ev, 'รหัสไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่ที่หน้าบัญชีบนเว็บ');
    await DB.prepare('INSERT OR REPLACE INTO line_bot_users (line_uid,user_id,created_at) VALUES (?,?,?)').bind(luid, l.user_id, now).run();
    return say(env, ev, 'เชื่อมบัญชีแล้ว พิมพ์ถามได้เลย · พิมพ์ "ใหม่" เพื่อเริ่มเรื่องใหม่');
  }
  let link = await DB.prepare('SELECT * FROM line_bot_users WHERE line_uid=?').bind(luid).first();
  if (!link) { // ผู้ใช้ที่ล็อกอินด้วย LINE (provider เดียวกัน = userId เดียวกัน)
    const u0 = await DB.prepare('SELECT id FROM users WHERE line_id=?').bind(luid).first();
    if (u0) { await DB.prepare('INSERT OR REPLACE INTO line_bot_users (line_uid,user_id,created_at) VALUES (?,?,?)').bind(luid, u0.id, now).run(); link = { line_uid: luid, user_id: u0.id }; }
  }
  if (!link) return say(env, ev, `ยังไม่ได้เชื่อมบัญชี AstraCode\nเข้าเว็บ ${siteUrl(env)}/account → "เชื่อม LINE" แล้วส่งรหัส 6 หลักมาที่นี่`);
  if (/^(ใหม่|new|\/new)$/i.test(text)) { await DB.prepare('UPDATE line_bot_users SET chat_id=NULL WHERE line_uid=?').bind(luid).run(); return say(env, ev, 'เริ่มเรื่องใหม่แล้ว'); }
  if (await limited(env, 'line:' + link.user_id, 20, 60e3)) return say(env, ev, 'ส่งเร็วเกินไป รอสักครู่');
  const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(link.user_id).first();
  if (!u || u.banned) return say(env, ev, 'บัญชีนี้ใช้งานไม่ได้');
  const plan = await planOf(env, u), models = await allowedModels(env, plan.id), want = +(await getSetting(env, 'line_bot_model')) || 0;
  const pick = models.find(x => x.id === want) || models.filter(x => x.provider !== 'image').sort((a, b) => a.cost_in + a.cost_out - b.cost_in - b.cost_out)[0];
  const m = pick && await DB.prepare('SELECT * FROM models WHERE id=?').bind(pick.id).first(); // allowedModels ไม่มีคอลัมน์ที่ใช้เรียก API
  if (!m) return say(env, ev, 'แพลนของคุณยังไม่มีโมเดลที่ใช้ผ่าน LINE ได้');
  const st = await usageStatus(env, u, plan), full = st.pct4h >= 100 || st.pctWeek >= 100;
  const wallet = full ? (u.wallet_overflow && u.balance >= WALLET_MIN ? 'overflow' : null) : null;
  if (full && !wallet) return say(env, ev, `ลิมิตแพลนเต็มแล้ว รอรอบใหม่ หรือเปิด "ใช้ Wallet เมื่อลิมิตเต็ม" ที่ ${siteUrl(env)}/account`);
  let cid = link.chat_id;
  if (!cid) { cid = (await DB.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').bind(u.id, 'LINE ' + new Date(now + 7 * 3600e3).toISOString().slice(0, 10), now).first()).id; await DB.prepare('UPDATE line_bot_users SET chat_id=? WHERE line_uid=?').bind(cid, luid).run(); }
  await DB.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'user',?,?)").bind(cid, text.slice(0, 8000), now).run();
  const hist = (await DB.prepare('SELECT role,content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 12').bind(cid).all()).results.reverse();
  let out = '', usage = null;
  for await (const e of callModel(env, m, hist, { system: SYSTEM + (m.sys_prompt?.trim() ? '\n\n' + m.sys_prompt.trim() : '') + '\n\nThis conversation happens inside LINE chat: plain text only (no markdown tables or headings), keep answers short and mobile-friendly.', userId: u.id, signal: AbortSignal.timeout(25e3) })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; }
  out = out.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
  await DB.prepare("INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,'assistant',?,?,?)").bind(cid, out, m.id, Date.now()).run();
  if (usage) await logUsage(env, u.id, m, usage, { plan, wallet, units: !wallet, src: 'line' });
  await say(env, ev, out);
}
