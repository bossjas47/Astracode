// แถมเครดิต Claude: สมัคร/ต่อแพลน Pro X2 ขึ้นไป (ไม่รวมแพลน 7 วัน/ทดลอง) ได้ต้นทุน ฿100 ต่อรอบ ใช้กับ Claude Eco เท่านั้น หมดอายุ 25 วัน
// เฉพาะลูกค้าใหม่: ใครเคยจ่ายแพลนระดับนี้ก่อนเริ่มโปร ไม่ได้ · ใช้เครดิตก่อน (ไม่หักลิมิต) หมดแล้วกลับไปหักลิมิตปกติ
import { mail, mailBox, siteUrl } from './billing.js';
import { sendPush } from './push.js';
export const CC = { amount: 100, days: 25, minPrice: 1490, start: Date.UTC(2026, 10, 21, 6), usdPerBaht: 1.5 }; // usdPerBaht: ต้นทุน ฿1 ของ Claude Eco ≈ $1.5 ตามราคา API ทางการ (Opus Eco, ค่าที่ต่ำสุด)
export const isClaudeEco = m => /^claude\b.*\beco$/i.test(String(m?.name || '').trim());
const TABLE = 'CREATE TABLE IF NOT EXISTS claude_credits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payment_id INTEGER UNIQUE, amount REAL NOT NULL, used REAL NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, reminded INTEGER)';
const ready = new WeakMap(); // ต่อฐานข้อมูล (เทสต์ใช้หลายฐานในโมดูลเดียว)
const ensure = env => { let p = ready.get(env.DB); if (!p) { p = env.DB.prepare(TABLE).run().then(() => env.DB.prepare('CREATE INDEX IF NOT EXISTS claude_credits_user ON claude_credits(user_id, expires_at)').run()).then(() => env.DB.prepare('ALTER TABLE claude_credits ADD COLUMN reminded INTEGER').run().catch(() => {})).catch(e => { ready.delete(env.DB); throw e; }); ready.set(env.DB, p); } return p; };

export const ccEligiblePlan = pl => !!pl && pl.price >= CC.minPrice && !pl.once && !(pl.days > 0 && pl.days <= 7);
// เรียกจาก applyPayment หลังเปิดแพลน · คืนจำนวนที่แถม (0 = ไม่เข้าเงื่อนไข)
export async function grantClaudeCredit(env, u, pl, p, now = Date.now()) {
  if (!ccEligiblePlan(pl) || now < CC.start || !p?.id) return 0;
  await ensure(env);
  const old = await env.DB.prepare(`SELECT 1 FROM payments pay JOIN plans x ON x.id=pay.plan_id WHERE pay.user_id=? AND pay.status='approved' AND pay.kind='plan' AND x.price>=? AND COALESCE(x.once,0)=0 AND NOT (COALESCE(x.days,0) BETWEEN 1 AND 7) AND COALESCE(pay.approved_at,pay.created_at)<? LIMIT 1`).bind(u.id, CC.minPrice, CC.start).first();
  if (old) return 0; // ลูกค้าเดิม (เคยจ่ายแพลนระดับนี้ก่อนเริ่มโปร)
  const r = await env.DB.prepare('INSERT OR IGNORE INTO claude_credits (user_id,payment_id,amount,expires_at,created_at) VALUES (?,?,?,?,?)').bind(u.id, p.id, CC.amount, now + CC.days * 864e5, now).run();
  if (!r.meta?.changes) return 0;
  const usd = Math.round(CC.amount * CC.usdPerBaht);
  await sendPush(env, u.id, { title: '🎁 แถม Claude Eco เทียบเท่า $' + usd, body: `ใช้ Claude Opus / Sonnet / Fable (Eco) ได้ถึง ${new Date(now + CC.days * 864e5 + 7 * 3600e3).toISOString().slice(0, 10)} · ใช้เมื่อลิมิตเต็ม หรือตั้งให้ใช้ก่อนได้ที่หน้าบัญชี`, url: '/account' }).catch(() => {});
  await mail(env, u.email, 'AstraCode: แถม Claude Eco เทียบเท่า $' + usd, mailBox('แถม Claude Eco ให้แล้ว 🎁', `ใช้ Claude Opus / Sonnet / Fable (Eco) ได้เทียบเท่า $${usd} ตามราคา API ทางการ ภายใน ${CC.days} วัน<br>ค่าเริ่มต้นจะใช้ลิมิตแพลนก่อน แล้วใช้เครดิตนี้เมื่อลิมิตเต็ม · เปลี่ยนให้ใช้เครดิตก่อนได้ที่ <a href="${siteUrl(env)}/account">หน้าบัญชี</a> · ใช้กับ API ได้ด้วย`)).catch(() => {});
  return CC.amount;
}
// cron: เครดิตเหลือ ≥ ฿5 และจะหมดใน 5 วัน → เตือนครั้งเดียว
export async function remindClaudeCredits(env, now = Date.now()) {
  await ensure(env);
  const rows = (await env.DB.prepare('SELECT c.id, c.user_id, c.amount-c.used rem, c.expires_at, u.email FROM claude_credits c JOIN users u ON u.id=c.user_id WHERE c.reminded IS NULL AND c.expires_at BETWEEN ? AND ? AND c.amount-c.used>=5 LIMIT 100').bind(now, now + 5 * 864e5).all()).results;
  for (const r of rows) {
    if (!(await env.DB.prepare('UPDATE claude_credits SET reminded=? WHERE id=? AND reminded IS NULL').bind(now, r.id).run()).meta?.changes) continue;
    const usd = Math.round(r.rem * CC.usdPerBaht), day = new Date(r.expires_at + 7 * 3600e3).toISOString().slice(0, 10);
    await sendPush(env, r.user_id, { title: `⏳ Claude Eco ที่แถมเหลือ ≈$${usd}`, body: `ใช้ได้ถึง ${day} · ตั้งให้ใช้เครดิตก่อนได้ที่หน้าบัญชี`, url: '/account' }).catch(() => {});
    await mail(env, r.email, `AstraCode: Claude Eco ที่แถมเหลือ ≈$${usd} ใช้ได้ถึง ${day}`, mailBox('เครดิต Claude ใกล้หมดอายุ', `เหลือเทียบเท่า $${usd} ใช้ได้ถึง ${day}<br>อยากใช้ให้คุ้ม: เปิด "ใช้เครดิตแถมก่อนลิมิต" ที่ <a href="${siteUrl(env)}/account">หน้าบัญชี</a>`)).catch(() => {});
  }
  return rows.length;
}
export async function claudeCreditLeft(env, uid, now = Date.now()) {
  await ensure(env);
  const r = await env.DB.prepare('SELECT COALESCE(SUM(amount-used),0) rem, MIN(expires_at) exp FROM claude_credits WHERE user_id=? AND expires_at>? AND used<amount').bind(uid, now).first();
  return { left: Math.max(0, r?.rem || 0), exp: r?.exp || null };
}
// หักต้นทุนจากเครดิตที่ใกล้หมดอายุก่อน · คืน true ถ้าหักได้ (ส่วนที่เกินเครดิตเล็กน้อยในข้อความสุดท้ายปล่อยไป)
export async function useClaudeCredit(env, uid, cost, now = Date.now()) {
  await ensure(env);
  const rows = (await env.DB.prepare('SELECT id, amount-used rem FROM claude_credits WHERE user_id=? AND expires_at>? AND used<amount ORDER BY expires_at').bind(uid, now).all()).results;
  if (!rows.length) return false;
  let rest = cost;
  for (const r of rows) { if (rest <= 0) break; const take = Math.min(r.rem, rest); await env.DB.prepare('UPDATE claude_credits SET used=used+? WHERE id=?').bind(take, r.id).run(); rest -= take; }
  return true;
}
