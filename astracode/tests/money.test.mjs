// เส้นเงิน: จ่ายแพลนด้วย Wallet, เติมเงินด้วยสลิป + อนุมัติ, โบนัสชวนเพื่อน, ต่ออายุอัตโนมัติ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addPlan } from './helpers.mjs';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const form = (t, u, fields, slipSeed) => {
  const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  if (slipSeed != null) fd.set('slip', new File([PNG, new Uint8Array([slipSeed])], 's.png', { type: 'image/png' }));
  return t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', headers: { cookie: u.cookie }, body: fd }), t.env, t.ctx);
};
const row = (t, id) => t.DB.raw.prepare('SELECT * FROM users WHERE id=?').get(id);

test('plan paid from the wallet: balance drops once, parallel double-pay cannot overdraw', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), u = await t.user({ balance: 150 });
  const rs = await Promise.all([form(t, u, { plan_id: plan.id, wallet: 1 }), form(t, u, { plan_id: plan.id, wallet: 1 })]);
  const ok = rs.filter(r => r.status === 200).length;
  assert.equal(ok, 1, 'only one of two parallel payments succeeds');
  const after = row(t, u.id); assert.equal(after.balance, 50); assert.equal(after.plan_id, plan.id); assert.ok(after.plan_expires > Date.now() + 29 * 864e5);
  const poor = await t.user({ balance: 10 });
  assert.equal((await form(t, poor, { plan_id: plan.id, wallet: 1 })).status, 400); assert.equal(row(t, poor.id).balance, 10);
});

test('top-up by slip: pending until an admin approves, approved once, same slip refused, referral bonus paid once', async () => {
  const t = await makeEnv(); t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('referral_bonus','15')").run();
  const admin = await t.user({ role: 'admin' }), inviter = await t.user(), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET referred_by=? WHERE id=?').run(inviter.id, u.id);
  const r = await form(t, u, { kind: 'topup', amount: 200 }, 1); assert.equal(r.status, 200, await r.clone().text());
  assert.equal(row(t, u.id).balance, 0, 'not credited before approval');
  const pid = t.DB.raw.prepare("SELECT id FROM payments WHERE user_id=? AND status='pending'").get(u.id).id;
  assert.equal((await t.json(`/api/admin/payments/${pid}/approve`, { method: 'POST', cookie: u.cookie })).status >= 400, true, 'a normal user cannot approve');
  const [a, b] = await Promise.all([1, 2].map(() => t.json(`/api/admin/payments/${pid}/approve`, { method: 'POST', cookie: admin.cookie })));
  assert.equal([a, b].filter(x => x.status === 200).length, 1, 'approved exactly once');
  assert.equal(row(t, u.id).balance, 215); assert.equal(row(t, inviter.id).balance, 15);
  assert.equal((await form(t, u, { kind: 'topup', amount: 200 }, 1)).status, 400, 'same slip image is refused');
  const r2 = await form(t, u, { kind: 'topup', amount: 50 }, 2); assert.equal(r2.status, 200);
  const pid2 = t.DB.raw.prepare("SELECT id FROM payments WHERE user_id=? AND status='pending'").get(u.id).id;
  await t.json(`/api/admin/payments/${pid2}/approve`, { method: 'POST', cookie: admin.cookie });
  assert.equal(row(t, u.id).balance, 265); assert.equal(row(t, inviter.id).balance, 15, 'bonus only on the first payment');
  assert.equal((await form(t, u, { kind: 'topup', amount: 1 }, 3)).status, 400, 'below the minimum');
});

test('auto-renew: renews from the wallet when it can, leaves the plan alone when it cannot', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), soon = Date.now() + 3600e3;
  const rich = await t.user({ balance: 120 }), poor = await t.user({ balance: 20 });
  for (const u of [rich, poor]) t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=?, auto_renew=1 WHERE id=?').run(plan.id, soon, u.id);
  t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending);
  assert.equal(row(t, rich.id).balance, 20); assert.ok(row(t, rich.id).plan_expires > soon + 29 * 864e5);
  assert.equal(row(t, poor.id).balance, 20); assert.equal(row(t, poor.id).plan_expires, soon);
  t.ctx.pending.length = 0; t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending);
  assert.equal(row(t, rich.id).balance, 20, 'a second cron run does not charge again');
});

test('notifications list approved payments, an expiring plan and a key near its budget; admin API stats read the request log', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), u = await t.user(), admin = await t.user({ role: 'admin' }), now = Date.now();
  t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,?,?,?,?,?,?)").run(u.id, 0, 200, 'slip/x', 'approved', 'topup', 'month', now, now);
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, now + 864e5, u.id);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,budget,spent,spent_month) VALUES (?,?,?,?,?,?,?,?)').run(u.id, 'bot', 'h', 'sk-astra-x', now, 10, 9, new Date(now + 7 * 3600e3).toISOString().slice(0, 7));
  const n = await t.json('/api/notifications', { cookie: u.cookie });
  assert.equal(n.status, 200); assert.deepEqual(n.data.map(x => x.kind).sort(), ['ok', 'warn', 'warn']);
  assert.equal((await t.json('/api/notifications', { cookie: admin.cookie })).data.length, 0, 'other users see nothing of it');
  await t.json('/api/version'); // ให้ตาราง api_log ถูกสร้าง
  t.DB.raw.prepare('INSERT INTO api_log (key_id,user_id,path,model,status,tin,tout,charge,ms,err,created_at) VALUES (1,?,?,?,?,?,?,?,?,?,?)').run(u.id, '/v1/chat/completions', 'm1', 200, 10, 5, 0.5, 100, null, now);
  t.DB.raw.prepare('INSERT INTO api_log (key_id,user_id,path,model,status,tin,tout,charge,ms,err,created_at) VALUES (1,?,?,?,?,?,?,?,?,?,?)').run(u.id, '/v1/chat/completions', 'm1', 502, 0, 0, 0, 300, 'boom', now);
  const s = await t.json('/api/admin/apistats', { cookie: admin.cookie });
  assert.equal(s.status, 200); assert.equal(s.data.models[0].n, 2); assert.equal(s.data.models[0].errors, 1); assert.equal(s.data.errors[0].err, 'boom'); assert.equal(s.data.keys[0].name, 'bot');
  assert.ok((await t.json('/api/admin/apistats', { cookie: u.cookie })).status >= 400);
});

test('plan paid from the wallet: if saving the payment fails, the money and the coupon come back', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), u = await t.user({ balance: 150 });
  t.DB.raw.exec("CREATE TRIGGER boom BEFORE INSERT ON payments BEGIN SELECT RAISE(ABORT, 'boom'); END");
  const r = await form(t, u, { plan_id: plan.id, wallet: 1 });
  assert.equal(r.status, 500);
  const after = row(t, u.id); assert.equal(after.balance, 150, 'charged amount refunded'); assert.ok(!after.plan_id, 'no plan given');
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM wallet_tx WHERE kind='refund'").get().n, 1);
});

test('auto-renew: two cron runs at the same moment charge once', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), soon = Date.now() + 3600e3, u = await t.user({ balance: 250 });
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=?, auto_renew=1 WHERE id=?').run(plan.id, soon, u.id);
  t.worker.default.scheduled({}, t.env, t.ctx); t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending);
  assert.equal(row(t, u.id).balance, 150); assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM wallet_tx WHERE kind='renew'").get().n, 1);
});

test('trial plan: 7 days, once per account, never auto-renewed', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 49 }), u = await t.user({ balance: 200 });
  t.DB.raw.prepare('UPDATE plans SET days=7, once=1 WHERE id=?').run(plan.id);
  assert.equal((await form(t, u, { plan_id: plan.id, wallet: 1 })).status, 200);
  const exp = row(t, u.id).plan_expires; assert.ok(exp > Date.now() + 6.9 * 864e5 && exp < Date.now() + 7.1 * 864e5, 'expires in 7 days');
  const again = await form(t, u, { plan_id: plan.id, wallet: 1 }); assert.equal(again.status, 400); assert.match((await again.json()).error, /ครั้งเดียว/);
  assert.equal(row(t, u.id).balance, 151);
  t.DB.raw.prepare('UPDATE users SET auto_renew=1, plan_expires=? WHERE id=?').run(Date.now() + 3600e3, u.id);
  const { cron } = await import('../src/jobs.js'); await cron(t.env).catch(() => {});
  assert.equal(row(t, u.id).balance, 151, 'trial plan is not auto-renewed');
});

test('admin: approve a wrongly rejected slip, refund a top-up, refund a plan to the wallet; customer can ask for review once', async () => {
  const t = await makeEnv(), admin = await t.user({ role: 'admin' }), u = await t.user(), plan = addPlan(t.DB, { price: 100 });
  const ins = (o) => t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at) VALUES (?,?,?,?,?,?,'month',?) RETURNING id").get(u.id, o.plan || 0, o.amount, o.key, o.status, o.kind, Date.now()).id;
  const rej = ins({ amount: 10, key: 'slip/a', status: 'rejected', kind: 'topup' });
  assert.equal((await t.json(`/api/pay/${rej}/review`, { method: 'POST', cookie: u.cookie })).status, 200);
  assert.equal((await t.json(`/api/pay/${rej}/review`, { method: 'POST', cookie: u.cookie })).status, 409, 'only once');
  assert.equal((await t.json('/api/admin/payments', { cookie: admin.cookie })).data.find(p => p.id === rej).review, 1);
  assert.equal((await t.json(`/api/admin/payments/${rej}/approve`, { method: 'POST', cookie: admin.cookie })).status, 200);
  assert.equal(row(t, u.id).balance, 10);
  assert.equal((await t.json(`/api/admin/payments/${rej}/refund`, { method: 'POST', cookie: admin.cookie, body: {} })).status, 200);
  assert.equal(row(t, u.id).balance, 0); assert.equal(t.DB.raw.prepare('SELECT status FROM payments WHERE id=?').get(rej).status, 'refunded');
  assert.equal((await t.json(`/api/admin/payments/${rej}/refund`, { method: 'POST', cookie: admin.cookie, body: {} })).status, 404, 'no double refund');
  const pp = ins({ amount: 100, key: 'slip/b', status: 'approved', kind: 'plan', plan: plan.id });
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 20 * 864e5, u.id);
  await t.json(`/api/admin/payments/${pp}/refund`, { method: 'POST', cookie: admin.cookie, body: { wallet: true } });
  assert.ok(row(t, u.id).plan_expires <= Date.now()); assert.equal(row(t, u.id).balance, 100);
});

test('slipLooksOk flags a rejected slip paid to the shop bank account; daily wallet cap; loss-making prices are listed', async () => {
  const { slipLooksOk, dayCapHit } = await import('../src/billing.js'), { lossModels } = await import('../src/jobs.js');
  const check = JSON.stringify({ success: true, data: { rawSlip: { amount: { amount: 10 }, receiver: { account: { bank: { account: 'xxx-x-x3233-x' } } } } } });
  const st = { promptpay_id: '0629708835', bank_account: '193-1-13233-0' };
  assert.equal(slipLooksOk({ slip_check: check, kind: 'topup', amount: 10 }, st), true);
  assert.equal(slipLooksOk({ slip_check: check, kind: 'topup', amount: 10 }, { promptpay_id: '0629708835', bank_account: '111-1-11111-1' }), false);
  const t = await makeEnv(), u = await t.user();
  assert.equal(await dayCapHit(t.env, u.id), false, 'no cap = never hit');
  t.DB.raw.prepare('UPDATE users SET wallet_day_cap=5 WHERE id=?').run(u.id);
  t.DB.raw.prepare("INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,-6,0,'api','m',?)").run(u.id, Date.now());
  assert.equal(await dayCapHit(t.env, u.id), true);
  const { addModel } = await import('./helpers.mjs'); const m = addModel(t.DB, { name: 'Cheap', base_url: 'http://x', cost_in: 10, cost_out: 10 });
  t.DB.raw.prepare('UPDATE models SET price_in=5, price_out=20 WHERE id=?').run(m.id);
  const bad = await lossModels(t.env); assert.equal(bad.length, 1); assert.match(bad[0].parts[0], /input/);
});
