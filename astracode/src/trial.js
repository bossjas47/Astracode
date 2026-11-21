// เปลี่ยนคนทดลองเป็นลูกค้า: แพลนทดลอง (once) เหลือ ≤ 2 วัน → โค้ดลดเดือนแรก 20% (ใช้ได้ครั้งเดียว ถึง 3 วันหลังหมดทดลอง)
// แจ้ง 2 ครั้ง: ตอนเหลือ 2 วัน และหลังหมดทดลองแล้ว (ถ้ายังไม่ได้ซื้อ) · หน้าเว็บแสดงแถบโค้ดจาก /api/me (trial_offer)
import { mail, mailBox, siteUrl } from './billing.js';
import { sendPush } from './push.js';

export const TRIAL_PCT = 20, DAY = 864e5;
const TABLE = 'CREATE TABLE IF NOT EXISTS trial_offers (user_id INTEGER PRIMARY KEY, code TEXT NOT NULL, trial_end INTEGER NOT NULL, sent_before INTEGER, sent_after INTEGER, created_at INTEGER NOT NULL)';
const ready = new WeakMap();
const ensure = env => { let p = ready.get(env.DB); if (!p) { p = env.DB.prepare(TABLE).run().catch(e => { ready.delete(env.DB); throw e; }); ready.set(env.DB, p); } return p; };
const fmt = t => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);

export async function trialOffers(env, now = Date.now()) {
  await ensure(env);
  const DB = env.DB;
  // ก่อนหมด 2 วัน: สร้างโค้ด + แจ้ง
  const soon = (await DB.prepare(`SELECT u.id, u.email, u.plan_expires FROM users u JOIN plans p ON p.id=u.plan_id WHERE COALESCE(p.once,0)=1 AND u.banned=0 AND u.plan_expires BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM trial_offers o WHERE o.user_id=u.id) LIMIT 100`).bind(now, now + 2 * DAY).all()).results;
  for (const u of soon) {
    const code = 'UP' + u.id + Math.random().toString(36).slice(2, 6).toUpperCase(), exp = u.plan_expires + 3 * DAY;
    if (!(await DB.prepare('INSERT OR IGNORE INTO trial_offers (user_id,code,trial_end,sent_before,created_at) VALUES (?,?,?,?,?)').bind(u.id, code, u.plan_expires, now, now).run()).meta?.changes) continue;
    await DB.prepare("INSERT INTO coupons (code,kind,value,max_uses,expires,note,active,created_at) VALUES (?,'percent',?,1,?,?,1,?)").bind(code, TRIAL_PCT, exp, 'อัปเกรดจากทดลอง ' + u.email, now).run();
    await sendPush(env, u.id, { title: `ทดลองใช้เหลือ 2 วัน · อัปเกรดลด ${TRIAL_PCT}%`, body: `ใช้โค้ด ${code} ได้ถึง ${fmt(exp)}`, url: '/plans?coupon=' + code }).catch(() => {});
    await mail(env, u.email, `AstraCode: ทดลองใช้เหลือ 2 วัน · อัปเกรดลด ${TRIAL_PCT}%`, mailBox('อัปเกรดก่อนหมดทดลอง', `แพลนทดลองจะหมด ${fmt(u.plan_expires)}<br>อัปเกรดเป็นแพลนรายเดือนด้วยโค้ด <b>${code}</b> ลด ${TRIAL_PCT}% เดือนแรก (ใช้ได้ถึง ${fmt(exp)}) ที่ <a href="${siteUrl(env)}/plans?coupon=${code}">หน้าแพลน</a><br>แพลน Pro ขึ้นไปใช้ Claude Haiku 5.5 + ChatGPT Luna ฟรีไม่จำกัด`)).catch(() => {});
  }
  // หมดทดลองแล้ว ยังไม่ได้ซื้อ: เตือนอีกครั้ง (ครั้งเดียว) ถ้าโค้ดยังไม่ถูกใช้
  const after = (await DB.prepare(`SELECT o.user_id, o.code, o.trial_end, u.email FROM trial_offers o JOIN users u ON u.id=o.user_id JOIN coupons c ON c.code=o.code WHERE o.sent_after IS NULL AND o.trial_end < ? AND o.trial_end > ? AND c.used < c.max_uses AND NOT (u.plan_expires > ? AND u.plan_id IN (SELECT id FROM plans WHERE price>0 AND COALESCE(once,0)=0)) LIMIT 100`).bind(now, now - 2 * DAY, now).all()).results;
  for (const o of after) {
    if (!(await DB.prepare('UPDATE trial_offers SET sent_after=? WHERE user_id=? AND sent_after IS NULL').bind(now, o.user_id).run()).meta?.changes) continue;
    await sendPush(env, o.user_id, { title: `แพลนทดลองหมดแล้ว · โค้ดลด ${TRIAL_PCT}% ยังใช้ได้`, body: `${o.code} ถึง ${fmt(o.trial_end + 3 * DAY)}`, url: '/plans?coupon=' + o.code }).catch(() => {});
    await mail(env, o.email, `AstraCode: โค้ดลด ${TRIAL_PCT}% ของคุณยังใช้ได้อีก ${Math.max(1, Math.ceil((o.trial_end + 3 * DAY - now) / DAY))} วัน`, mailBox('กลับมาใช้ต่อ', `แพลนทดลองหมดแล้ว แต่โค้ด <b>${o.code}</b> ลด ${TRIAL_PCT}% ยังใช้ได้ถึง ${fmt(o.trial_end + 3 * DAY)} · <a href="${siteUrl(env)}/plans?coupon=${o.code}">เลือกแพลน</a>`)).catch(() => {});
  }
  return soon.length + after.length;
}
// สำหรับ /api/me: โค้ดที่ยังใช้ได้ (หน้าเว็บโชว์แถบอัปเกรด)
export async function trialOffer(env, uid, now = Date.now()) {
  await ensure(env);
  const r = await env.DB.prepare('SELECT o.code, o.trial_end FROM trial_offers o JOIN coupons c ON c.code=o.code WHERE o.user_id=? AND c.used < c.max_uses AND c.active=1 AND c.expires > ?').bind(uid, now).first();
  return r ? { code: r.code, pct: TRIAL_PCT, exp: r.trial_end + 3 * DAY, trial_end: r.trial_end } : null;
}
