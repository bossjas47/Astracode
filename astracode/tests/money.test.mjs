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

test('coupon with one use left: a second slip waiting for review cannot use it; rejecting the first gives it back', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), admin = await t.user({ role: 'admin' }), a = await t.user(), b = await t.user();
  t.DB.raw.prepare("INSERT INTO coupons (code,kind,value,max_uses,created_at) VALUES ('ONE','percent',50,1,?)").run(Date.now());
  assert.equal((await form(t, a, { plan_id: plan.id, coupon: 'ONE' }, 11)).status, 200);
  const r = await form(t, b, { plan_id: plan.id, coupon: 'ONE' }, 12);
  assert.equal(r.status, 400, 'coupon already taken by the pending slip');
  assert.equal(t.DB.raw.prepare("SELECT used FROM coupons WHERE code='ONE'").get().used, 1);
  const pid = t.DB.raw.prepare("SELECT id FROM payments WHERE user_id=? AND status='pending'").get(a.id).id;
  assert.equal((await t.json(`/api/admin/payments/${pid}/reject`, { method: 'POST', cookie: admin.cookie })).status, 200);
  assert.equal(t.DB.raw.prepare("SELECT used FROM coupons WHERE code='ONE'").get().used, 0, 'rejected slip releases the coupon');
  assert.equal((await form(t, b, { plan_id: plan.id, coupon: 'ONE' }, 13)).status, 200);
  const pb = t.DB.raw.prepare("SELECT id,amount FROM payments WHERE user_id=? AND status='pending'").get(b.id);
  assert.equal(pb.amount, 50);
  assert.equal((await t.json(`/api/admin/payments/${pb.id}/approve`, { method: 'POST', cookie: admin.cookie })).status, 200);
  assert.equal(t.DB.raw.prepare("SELECT used FROM coupons WHERE code='ONE'").get().used, 1, 'approval does not count it twice');
});

test('referral and first top-up bonus are paid once even when two payments are approved at the same moment', async () => {
  const t = await makeEnv(); t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('referral_bonus','15'),('first_topup_pct','10')").run();
  const admin = await t.user({ role: 'admin' }), inviter = await t.user(), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET referred_by=? WHERE id=?').run(inviter.id, u.id);
  const ins = k => t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at) VALUES (?,0,100,?,'pending','topup','month',?) RETURNING id").get(u.id, k, Date.now()).id;
  const ids = [ins('slip/r1'), ins('slip/r2')];
  const rs = await Promise.all(ids.map(id => t.json(`/api/admin/payments/${id}/approve`, { method: 'POST', cookie: admin.cookie })));
  assert.deepEqual(rs.map(r => r.status), [200, 200]);
  assert.equal(row(t, inviter.id).balance, 15, 'inviter paid once');
  assert.equal(row(t, u.id).balance, 200 + 10 + 15, 'two top-ups, one first-top-up bonus, one referral bonus');
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM wallet_tx WHERE user_id=? AND kind='first_bonus'").get(u.id).n, 1);
  assert.equal(t.DB.raw.prepare("SELECT balance_after FROM wallet_tx WHERE user_id=? AND kind='first_bonus'").get(u.id).balance_after > 0, true);
});

test('overview and profit show the same revenue (money in) and profit (plans + wallet spend - cost); a plan bought from the wallet is not counted twice; API sales vs cost per user', async () => {
  const t = await makeEnv(), plan = addPlan(t.DB, { price: 100 }), u = await t.user(), admin = await t.user({ role: 'admin' }), now = Date.now();
  const pay = (kind, amount, slip) => t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,?,?,?,?,?,?)").run(u.id, kind === 'plan' ? plan.id : 0, amount, slip, 'approved', kind, 'month', now, now);
  pay('topup', 300, 'slip/a'); pay('plan', 100, 'wallet'); pay('plan', 200, 'slip/b'); // เติม 300 แล้วซื้อแพลน 100 จาก Wallet + โอนซื้อแพลน 200
  const tx = (kind, amount) => t.DB.raw.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').run(u.id, amount, 0, kind, '', now);
  tx('topup', 300); tx('plan', -100); tx('api', -12);
  const use = (src, units, cost, charge) => t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src,charge) VALUES (?,?,?,?,?,?,?,?,?,?)').run(u.id, 1, 10, 5, 0, units, cost, now, src, charge);
  use('api', 0, 5, 12); use('api', 1, 3, null); use('chat', 1, 2, null);
  const st = (await t.json('/api/admin/stats?days=7', { cookie: admin.cookie })).data.cur, pr = (await t.json('/api/admin/profit?days=7', { cookie: admin.cookie })).data.total;
  assert.equal(st.rev, 500, 'revenue shown = money transferred in: top-up 300 + plan 200 (the plan paid from the wallet is not counted again)');
  assert.equal(st.earned, 312, 'profit uses plans 300 + wallet spend 12'); assert.equal(pr.rev, st.rev); assert.equal(pr.cost, st.cost); assert.equal(pr.profit, st.earned - st.cost);
  t.DB.raw.prepare('INSERT INTO api_log (key_id,user_id,path,model,status,tin,tout,charge,ms,err,created_at) VALUES (1,?,?,?,?,?,?,?,?,?,?)').run(u.id, '/v1/credits', null, 404, 0, 0, 0, 5, 'not found', now);
  const a = (await t.json('/api/admin/apistats?days=30', { cookie: admin.cookie })).data;
  assert.equal(a.models.length, 0, 'rejected requests without a model are not a model row'); assert.equal(a.errors.length, 1);
  assert.deepEqual([a.sales[0].sold, a.sales[0].cost_wallet, a.sales[0].profit, a.sales[0].cost_plan], [12, 5, 7, 3]);
});

test('long-context price tier: a request from 272K input tokens costs input/cache x2 and output x1.5 (cost and wallet charge); shorter requests and only the long rounds of a chat answer', async () => {
  const t = await makeEnv(); await t.json('/api/version');
  const { logUsage } = await import('../src/ai.js');
  t.DB.raw.prepare("INSERT INTO models (name,provider,api_model,base_url,key_name,cost_in,cost_out,cost_cache,cost_cache_write,price_in,price_out,price_cache,price_cache_write,active,long_k) VALUES ('G','openai','g','http://x','K',4,20,0.2,5,8,40,0.4,10,1,272)").run();
  const m = t.DB.raw.prepare("SELECT * FROM models WHERE name='G'").get(), u = await t.user({ balance: 100 });
  const cost = () => t.DB.raw.prepare('SELECT cost, charge FROM usage ORDER BY id DESC LIMIT 1').get();
  await logUsage(t.env, u.id, m, { fresh: 100000, read: 0, write: 0, out: 1000 }, { units: false, wallet: 'api' });
  assert.deepEqual(Object.values(cost()).map(x => Math.round(x * 1e4) / 1e4), [0.42, 0.84], 'below 272K: base price');
  await logUsage(t.env, u.id, m, { fresh: 200000, read: 100000, write: 0, out: 1000 }, { units: false, wallet: 'api' });
  // ฐาน 0.8+0.02+0.02 = 0.84 · ขั้นที่ 2: ขาเข้า (0.8+0.02)×2 + ขาออก 0.02×1.5 = 1.67
  assert.equal(Math.round(cost().cost * 1e4) / 1e4, 1.67); assert.equal(Math.round(cost().charge * 1e4) / 1e4, 3.34, 'the wallet price rises by the same ratio');
  // คำตอบแชตที่มี 2 รอบ: รอบแรกสั้น รอบสองยาว → คิดราคาขั้นที่ 2 เฉพาะรอบสอง
  const long = { fresh: 300000, read: 0, write: 0, out: 1000 };
  await logUsage(t.env, u.id, m, { fresh: 400000, read: 0, write: 0, out: 2000, long }, { units: false });
  assert.equal(Math.round(cost().cost * 1e4) / 1e4, 2.85); // ฐาน 1.6+0.04 + ส่วนเพิ่มของรอบยาว 1.2+0.01
});

test('hourly alerts: a customer whose 30-day cost is above what they paid is reported to the admin once a day', async () => {
  const sent = []; const { fakeModel } = await import('./helpers.mjs');
  const hook = await fakeModel((q, res, body) => { sent.push(body.content); res.writeHead(204); res.end(); });
  const t = await makeEnv(), u = await t.user(), now = Date.now();
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('alert_discord',?)").run(hook.url);
  t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,?,?,?,?,?,?)").run(u.id, 1, 69, 'slip/x', 'approved', 'plan', 'month', now, now);
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,?,?,?,?,?,?)').run(u.id, 1, 10, 5, 0, 1, 90, now - 60e3);
  for (let i = 0; i < 2; i++) { t.ctx.pending.length = 0; await t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending); }
  const loss = sent.filter(x => /ขาดทุน/.test(x || ''));
  assert.equal(loss.length, 1, 'once a day: ' + JSON.stringify(sent)); assert.match(loss[0], /฿90\.00/); assert.match(loss[0], /฿69\.00/);
  hook.close();
});

test('/v1 paths with a trailing slash work (/v1/credits/)', async () => {
  const { sha } = await import('./helpers.mjs');
  const t = await makeEnv(), u = await t.user({ balance: 5 }), key = 'sk-astra-trailslash1';
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const r = await t.call('/v1/credits/', { headers: { authorization: 'Bearer ' + key } });
  assert.equal(r.status, 200); assert.equal((await r.json()).data.total_credits, 5);
});

test('server page check: JavaScript errors are read back from the rendered page; off without Browser Rendering settings', async () => {
  const { pageErrors } = await import('../src/agent.js'), files = new Map([['index.html', '<html><head></head><body><script>makeSea()</script></body></html>']]);
  assert.equal(await pageErrors({}, files), null, 'not configured = skipped');
  const real = globalThis.fetch; let sentHtml = '';
  globalThis.fetch = async (url, o) => { sentHtml = JSON.parse(o.body).html; return new Response(JSON.stringify({ success: true, result: '<html><body><pre id="__astra_errs" hidden="">["ReferenceError: makeSea is not defined @ index.html:1"]</pre></body></html>' }), { headers: { 'content-type': 'application/json' } }); };
  try {
    const errs = await pageErrors({ CF_ACCOUNT_ID: 'a', CF_BR_TOKEN: 'b' }, files);
    assert.deepEqual(errs, ['ReferenceError: makeSea is not defined @ index.html:1']); assert.match(sentHtml, /__astra_errs/, 'the error hook is injected');
  } finally { globalThis.fetch = real; }
});

test('fake-slip guard: temp-mail accounts cannot pay; 3 rejected slips in a day pause uploads; 5 rejected and never paid bans the account', async () => {
  const { makeEnv, addPlan } = await import('./helpers.mjs');
  const t = await makeEnv(); await t.json('/api/version'); const p = addPlan(t.DB, { price: 6790 });
  const send = u => { const fd = new FormData(); fd.append('kind', 'plan'); fd.append('plan_id', String(p.id)); fd.append('slip', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 's.jpg'); return t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', body: fd, headers: { cookie: u.cookie } }), t.env, t.ctx); };
  const tmp = await t.user({ email: 'abc@guerrillamailblock.com' });
  assert.equal((await send(tmp)).status, 403);
  const u = await t.user(), rej = n => { for (let i = 0; i < n; i++) t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,created_at,kind) VALUES (?,?,?,?,'rejected',?,'plan')").run(u.id, p.id, 6790, 'k' + Math.random(), Date.now() - i); };
  rej(3); assert.equal((await send(u)).status, 429);
  rej(2); assert.equal((await send(u)).status, 403);
  assert.equal(t.DB.raw.prepare('SELECT banned FROM users WHERE id=?').get(u.id).banned, 1);
});
