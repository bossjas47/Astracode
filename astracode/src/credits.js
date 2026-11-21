// แถมเครดิต Claude: สมัคร/ต่อแพลน Pro X2 ขึ้นไป (ไม่รวมแพลน 7 วัน/ทดลอง) ได้ต้นทุน ฿100 ต่อรอบ ใช้กับ Claude Eco เท่านั้น หมดอายุ 25 วัน
// เฉพาะลูกค้าใหม่: ใครเคยจ่ายแพลนระดับนี้ก่อนเริ่มโปร ไม่ได้ · ใช้เครดิตก่อน (ไม่หักลิมิต) หมดแล้วกลับไปหักลิมิตปกติ
export const CC = { amount: 100, days: 25, minPrice: 1490, start: Date.UTC(2026, 10, 21, 6), usdPerBaht: 1.5 }; // usdPerBaht: ต้นทุน ฿1 ของ Claude Eco ≈ $1.5 ตามราคา API ทางการ (Opus Eco, ค่าที่ต่ำสุด)
export const isClaudeEco = m => /^claude\b.*\beco$/i.test(String(m?.name || '').trim());
const TABLE = 'CREATE TABLE IF NOT EXISTS claude_credits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payment_id INTEGER UNIQUE, amount REAL NOT NULL, used REAL NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)';
let ready = null;
const ensure = env => ready ||= env.DB.prepare(TABLE).run().then(() => env.DB.prepare('CREATE INDEX IF NOT EXISTS claude_credits_user ON claude_credits(user_id, expires_at)').run()).catch(e => { ready = null; throw e; });

export const ccEligiblePlan = pl => !!pl && pl.price >= CC.minPrice && !pl.once && !(pl.days > 0 && pl.days <= 7);
// เรียกจาก applyPayment หลังเปิดแพลน · คืนจำนวนที่แถม (0 = ไม่เข้าเงื่อนไข)
export async function grantClaudeCredit(env, u, pl, p, now = Date.now()) {
  if (!ccEligiblePlan(pl) || now < CC.start || !p?.id) return 0;
  await ensure(env);
  const old = await env.DB.prepare(`SELECT 1 FROM payments pay JOIN plans x ON x.id=pay.plan_id WHERE pay.user_id=? AND pay.status='approved' AND pay.kind='plan' AND x.price>=? AND COALESCE(x.once,0)=0 AND NOT (COALESCE(x.days,0) BETWEEN 1 AND 7) AND COALESCE(pay.approved_at,pay.created_at)<? LIMIT 1`).bind(u.id, CC.minPrice, CC.start).first();
  if (old) return 0; // ลูกค้าเดิม (เคยจ่ายแพลนระดับนี้ก่อนเริ่มโปร)
  const r = await env.DB.prepare('INSERT OR IGNORE INTO claude_credits (user_id,payment_id,amount,expires_at,created_at) VALUES (?,?,?,?,?)').bind(u.id, p.id, CC.amount, now + CC.days * 864e5, now).run();
  return r.meta?.changes ? CC.amount : 0;
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
