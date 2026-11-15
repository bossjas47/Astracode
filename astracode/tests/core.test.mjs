import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

const give = (DB, u, plan) => DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
const chat = (t, u, m, text = 'hi') => t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text } });

test('pricing: no cost prices leak; calculator runs on the server', async () => {
  const t = await makeEnv();
  const m = addModel(t.DB, { name: 'P1', base_url: 'http://x', cost_in: 5, cost_out: 10 }); const p = addPlan(t.DB, { models: [m.id], limit_week: 10 });
  const r = await t.json('/api/pricing');
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.data).includes('"lw"'), 'lw must not be exposed');
  const c = await t.json('/api/pricing/calc', { method: 'POST', body: { model_id: m.id, n: 10, i: 1000, o: 1000, c: 0 } });
  assert.equal(c.status, 200);
  assert.ok(c.data.per1 > 0 && c.data.month > 0);
  assert.equal(c.data.plans[0].id, p.id);
});

test('limits: week budget blocks chat, 4h switch off ignores the 4h window', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'L1', base_url: fm.url }); const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1, limit_week: 100, price: 0 });
  const u = await t.user(); give(t.DB, u, plan);
  const now = Date.now();
  t.DB.raw.prepare('UPDATE users SET sess_start=?,week_start=? WHERE id=?').run(now - 1000, now - 1000, u.id);
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,?,?,?)').run(u.id, m.id, 1.5, 1.5, now - 500);
  let me = await t.json('/api/me', { cookie: u.cookie });
  assert.equal(me.data.usage.pct4h, 100);
  assert.equal((await chat(t, u, m)).status, 429);
  t.DB.raw.prepare('UPDATE plans SET use_4h=0 WHERE id=?').run(plan.id);
  me = await t.json('/api/me', { cookie: u.cookie });
  assert.equal(me.data.usage.pct4h, 0); assert.equal(me.data.usage.use4h, false);
  const ok = await chat(t, u, m); assert.equal(ok.status, 200); await readSSE(ok);
  fm.close();
});

test('limit multiplier scales the units deducted, cost stays real', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok', { prompt_tokens: 1e6, completion_tokens: 0 }));
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'X', base_url: fm.url, cost_in: 2 }); t.DB.raw.prepare('UPDATE models SET use_mult=0.5 WHERE id=?').run(m.id);
  const plan = addPlan(t.DB, { models: [m.id], price: 0, limit_4h: 100, limit_week: 100 }); const u = await t.user(); give(t.DB, u, plan);
  await readSSE(await chat(t, u, m)); await Promise.all(t.ctx.pending);
  const row = t.DB.raw.prepare('SELECT units,cost FROM usage').get();
  assert.ok(Math.abs(row.cost - 2) < 1e-6, 'cost=' + row.cost); assert.ok(Math.abs(row.units - 1) < 1e-6, 'units=' + row.units);
  fm.close();
});

test('credit coupon can be redeemed only once even in parallel', async () => {
  const t = await makeEnv(); const u = await t.user();
  t.DB.raw.prepare("INSERT INTO coupons (code,kind,value,max_uses,created_at) VALUES ('GIFT','credit',50,0,?)").run(Date.now());
  const rs = await Promise.all(Array.from({ length: 5 }, () => t.json('/api/coupon/redeem', { method: 'POST', cookie: u.cookie, body: { code: 'GIFT' } })));
  assert.equal(rs.filter(r => r.status === 200).length, 1);
  assert.equal(t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance, 50);
});

test('circuit breaker: a model with 3 recent errors is skipped for its fallback', async () => {
  const a = await fakeModel((q, res) => a.sse(res, 'from A')), b = await fakeModel((q, res) => b.sse(res, 'from B'));
  const t = await makeEnv({ K: 'k' });
  const mb = addModel(t.DB, { name: 'B', base_url: b.url }); const ma = addModel(t.DB, { name: 'A', base_url: a.url, fallback_id: mb.id });
  const plan = addPlan(t.DB, { models: [ma.id, mb.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  for (let i = 0; i < 3; i++) t.DB.raw.prepare("INSERT INTO events (kind,model_id,detail,created_at) VALUES ('error',?,'boom',?)").run(ma.id, Date.now() - 1000 * i);
  const ev = await readSSE(await chat(t, u, ma)); await Promise.all(t.ctx.pending);
  assert.ok(ev.some(e => e.fallback === 'B'), JSON.stringify(ev));
  assert.equal(a.hits.length, 0); assert.ok(b.hits.length >= 1);
  a.close(); b.close();
});

test('shared-pool team: per-member cap makes that member full before the team budget', async () => {
  const t = await makeEnv();
  const plan = addPlan(t.DB, { seats: 5, shared_pool: 1, limit_week: 100, limit_4h: 100, price: 500 }); const owner = await t.user(), mem = await t.user();
  const now = Date.now();
  const tm = t.DB.raw.prepare('INSERT INTO teams (name,owner_id,plan_id,expires,invite_code,max_seats,shared_pool,created_at,week_start,sess_start) VALUES (?,?,?,?,?,5,1,?,?,?) RETURNING id').get('T', owner.id, plan.id, now + 864e5, 'CODE1234', now, now - 1000, now - 1000);
  t.DB.raw.prepare("INSERT INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?, 'owner', ?)").run(tm.id, owner.id, now);
  t.DB.raw.prepare("INSERT INTO team_members (team_id,user_id,role,joined_at,cap_pct) VALUES (?,?, 'member', ?, 10)").run(tm.id, mem.id, now);
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,?,?,?)').run(mem.id, 1, 10, 10, now - 500);
  const me = await t.json('/api/me', { cookie: mem.cookie });

  assert.equal(me.data.usage.pctWeek, 100);
  const own = await t.json('/api/me', { cookie: owner.cookie });
  assert.ok(own.data.usage.pctWeek < 100);
});

test('image provider model answers with a stored picture', async () => {
  const big = Buffer.alloc(500000, 1).toString('base64');
  const fm = await fakeModel((q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: big }] })); });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'IMG', provider: 'image', base_url: fm.url, cost_out: 3 }); const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  const ev = await readSSE(await chat(t, u, m, 'วาดแมว')); await Promise.all(t.ctx.pending);
  const txt = ev.filter(e => e.t).map(e => e.t).join('');
  const url = txt.match(/\((\/api\/img\/\d+\/[\w-]+\.(?:png|jpg))\)/)?.[1];
  assert.ok(url, txt.slice(0, 120));
  const img = await t.call(url, { cookie: u.cookie }); assert.equal(img.status, 200); assert.equal((await img.arrayBuffer()).byteLength, 500000);
  assert.equal((await t.call(url, { cookie: (await t.user()).cookie })).status, 404);
  fm.close();
});

test('effort rejected by the provider is retried with a supported level', async () => {
  let n = 0;
  const fm = await fakeModel((q, res, body) => {
    n++; if (body.reasoning_effort === 'minimal') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"x does not support reasoning effort \\"minimal\\"; use low, medium, high"}}'); }
    fm.sse(res, 'fine');
  });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'E', base_url: fm.url, effort: 'openai' }); const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  const res = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'hi', effort: 'minimal' } });
  const ev = await readSSE(res); assert.ok(ev.some(e => e.t === 'fine'), JSON.stringify(ev)); assert.equal(n, 2);
  assert.equal(fm.hits[1].body.reasoning_effort, 'low');
  fm.close();
});

test('watchdog: a model that stays silent is cut off, logged and reported', async () => {
  const fm = await fakeModel(() => { /* never answers */ });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'S', base_url: fm.url }); t.DB.raw.prepare('UPDATE models SET first_token_s=0.5 WHERE id=?').run(m.id);
  const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  const t0 = Date.now(), ev = await readSSE(await chat(t, u, m)); await Promise.all(t.ctx.pending);
  assert.ok(Date.now() - t0 < 5000, 'should be cut off quickly');
  assert.ok(ev.some(e => e.error), JSON.stringify(ev));
  assert.match(t.DB.raw.prepare("SELECT detail FROM events WHERE kind='error'").get().detail, /ไม่ตอบภายใน/);
  fm.close();
});

test('health check pings idle models and records a failure as an error event', async () => {
  const bad = await fakeModel((q, res) => { res.writeHead(500); res.end('boom'); });
  const t = await makeEnv({ K: 'k' }); const m = addModel(t.DB, { name: 'H', base_url: bad.url });
  await t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending);
  const ev = t.DB.raw.prepare("SELECT detail FROM events WHERE model_id=?").all(m.id);
  assert.ok(ev.some(e => /health check/.test(e.detail)), JSON.stringify(ev));
  bad.close();
});

test('/api/me does not expose model cost prices', async () => {
  const t = await makeEnv(); const m = addModel(t.DB, { name: 'C', base_url: 'http://x', cost_in: 7.77 }); const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  const me = await t.json('/api/me', { cookie: u.cookie });
  assert.equal(me.data.models.length, 1); assert.ok(!JSON.stringify(me.data).includes('7.77') && !('cost_in' in me.data.models[0]));
});

test('sessions: list devices, revoke one, revoke all others', async () => {
  const t = await makeEnv(); const u = await t.user();
  const now = Date.now(), tok = n => n.repeat(64).slice(0, 64);
  for (const n of ['a', 'b']) t.DB.raw.prepare('INSERT INTO sessions (token,user_id,expires,created_at,ua,ip) VALUES (?,?,?,?,?,?)').run(tok(n), u.id, now + 1e6, now, 'UA-' + n, '1.2.x.x');
  let l = await t.json('/api/sessions', { cookie: u.cookie }); assert.equal(l.data.length, 3); assert.equal(l.data.filter(x => x.current).length, 1);
  const rev = await t.json('/api/sessions/' + tok('a').slice(0, 16), { method: 'DELETE', cookie: u.cookie }); assert.equal(rev.status, 200);
  l = await t.json('/api/sessions', { cookie: u.cookie }); assert.equal(l.data.length, 2);
  await t.json('/api/sessions', { method: 'DELETE', cookie: u.cookie });
  l = await t.json('/api/sessions', { cookie: u.cookie }); assert.equal(l.data.length, 1); assert.ok(l.data[0].current);
});

test('feedback votes and reports are stored per user and shown to admin', async () => {
  const t = await makeEnv(); const u = await t.user(), adm = await t.user({ role: 'admin' }), other = await t.user();
  const m = addModel(t.DB, { name: 'F', base_url: 'http://x' });
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 't', Date.now());
  const msg = t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?, 'assistant', 'คำตอบ', ?, ?) RETURNING id").get(c.id, m.id, Date.now());
  assert.equal((await t.json('/api/feedback', { method: 'POST', cookie: other.cookie, body: { message_id: msg.id, vote: 1 } })).status, 404);
  assert.equal((await t.json('/api/feedback', { method: 'POST', cookie: u.cookie, body: { message_id: msg.id, vote: -1 } })).status, 200);
  let ms = await t.json('/api/chats/' + c.id, { cookie: u.cookie }); assert.equal(ms.data[0].vote, -1);
  assert.equal((await t.json('/api/report', { method: 'POST', cookie: u.cookie, body: { message_id: msg.id, reason: 'ไม่เหมาะสม' } })).status, 200);
  const q = await t.json('/api/admin/quality', { cookie: adm.cookie });
  assert.equal(q.data.votes[0].down, 1); assert.equal(q.data.reports.length, 1); assert.equal(q.data.reports[0].status, 'open');
  await t.json('/api/admin/reports/' + q.data.reports[0].id, { method: 'PUT', cookie: adm.cookie, body: { status: 'done' } });
  assert.equal((await t.json('/api/admin/quality', { cookie: adm.cookie })).data.reports[0].status, 'done');
});
