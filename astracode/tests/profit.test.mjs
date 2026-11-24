// กำไร/คาดการณ์: ไม่นับบัญชีที่ติ๊ก "ไม่นับในรายงาน" และคำนวณหลังหมดโปร
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan } from './helpers.mjs';

test('profit forecast skips ticked accounts and projects numbers after the promos end', async () => {
  const t = await makeEnv({ K: 'k' }), now = Date.now(), at = now - 3600e3, D = t.DB.raw;
  const m = addModel(t.DB, { name: 'Promo model', base_url: 'http://x' });
  D.prepare('UPDATE models SET promo_pct=50, promo_mult=0.5, use_mult=1 WHERE id=?').run(m.id); // ลดราคา 50% + นับลิมิตครึ่งเดียว (ไม่ตั้งวันจบ)
  for (const [k, v] of [['promo_until', String(now + 5 * 864e5)], ['promo_xweek', '2'], ['promo_x4h', '2']]) D.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v); // ลิมิตสัปดาห์ ×2 อีก 5 วัน
  const P = addPlan(t.DB, { name: 'Pro', price: 300, limit_week: 10, limit_4h: 10, models: [m.id] });
  const a = await t.user(), b = await t.user(), c = await t.user({ balance: 50 }), adm = await t.user({ role: 'admin' });
  D.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id IN (?,?)').run(P.id, now + 20 * 864e5, a.id, b.id);
  D.prepare('UPDATE users SET no_report=1 WHERE id=?').run(b.id); // บัญชีที่ติ๊กไม่นับ
  const pay = (u, amt) => D.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,?, 'approved','plan','month',?,?)").run(u, P.id, amt, 'slip/' + u, at, at);
  pay(a.id, 300); pay(b.id, 9999);
  const use = (u, cost, units, charge = null) => D.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,charge) VALUES (?,?,0,0,0,?,?,?,?)').run(u, m.id, units, cost, at, charge);
  for (let i = 0; i < 6; i++) use(a.id, 1, 0.5); // ต้นทุน ฿6 · หน่วยช่วงโปร 3 (หลังโปรจะเป็น 6)
  use(b.id, 500, 250); // ติ๊กไว้: ต้องไม่ถูกนับ
  use(c.id, 1, 0, 2); D.prepare("INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)").run(c.id, -2, 48, 'wallet', 'x', at); // ลูกค้า Wallet จ่าย ฿2 ที่ราคาโปร
  D.prepare("INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)").run(b.id, -400, 0, 'wallet', 'x', at);
  const r = await t.json('/api/admin/profit?days=7', { cookie: adm.cookie });
  assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300));
  const f = r.data.forecast, close = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-6, `${msg}: ${x} vs ${y}`);
  assert.equal(f.subs.n, 1, 'ticked subscriber not counted');
  close(f.so_far.cost, 7, 'cost this month = A ฿6 + C ฿1 (B excluded)');
  close(f.so_far.plan_rev, 300, 'plan revenue excludes B'); close(f.so_far.wallet_rev, 2, 'wallet revenue excludes B');
  assert.equal(r.data.plans.find(p => p.id === P.id).subs, 1, 'plan subscriber count excludes B');
  assert.equal(f.promo.boost.xweek, 2); assert.equal(f.promo.price.length, 1); assert.equal(f.promo.mult.length, 1);
  close(f.after.wallet_day, 2 * f.rate.wallet_day, 'full price after a 50% promo doubles wallet charges');
  close(f.after.plan_cost_after, 10 / 7, 'after promo: A is capped at the normal weekly limit (฿10/7 a day)');
  assert.ok(f.after.plan_cost_now > f.after.plan_cost_after, 'boosted limit costs more than the normal one');
  const A = f.people.find(x => x.id === a.id); assert.ok(A.rate_after < A.rate);
  assert.ok(Math.abs(f.after.profit_30 - (f.after.plan_day + f.after.wallet_day - f.after.cost_day) * 30) < 1e-6);
});
