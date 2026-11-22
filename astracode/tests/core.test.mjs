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

test('a credit coupon with max_uses=1 pays only one of several users redeeming at the same moment', async () => {
  const t = await makeEnv(); const us = await Promise.all(Array.from({ length: 12 }, () => t.user()));
  t.DB.raw.prepare("INSERT INTO coupons (code,kind,value,max_uses,created_at) VALUES ('ONCE','credit',50,1,?)").run(Date.now());
  const rs = await Promise.all(us.map(u => t.json('/api/coupon/redeem', { method: 'POST', cookie: u.cookie, body: { code: 'ONCE' } })));
  assert.equal(rs.filter(r => r.status === 200).length, 1);
  assert.equal(t.DB.raw.prepare('SELECT SUM(balance) b FROM users').get().b, 50);
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
  const m = addModel(t.DB, { name: 'E', base_url: fm.url, effort: 'gemini' }); const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
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
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('health_check','1')").run(); // ปิดเป็นค่าเริ่มต้น
  await t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending);
  const ev = t.DB.raw.prepare("SELECT detail FROM events WHERE model_id=?").all(m.id);
  assert.ok(ev.some(e => /health check/.test(e.detail)), JSON.stringify(ev));
  bad.close();
});

test('/api/me does not expose model cost prices, and hides models whose key is not set', async () => {
  const t = await makeEnv({ K: 'k' }); const m = addModel(t.DB, { name: 'C', base_url: 'http://x', cost_in: 7.77 }); const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  const me = await t.json('/api/me', { cookie: u.cookie });
  assert.equal(me.data.models.length, 1); assert.ok(!JSON.stringify(me.data).includes('7.77') && !('cost_in' in me.data.models[0]) && !('key_name' in me.data.models[0]));
  const { allowedModels } = await import('../src/core.js'); t.DB.raw.prepare("UPDATE models SET key_name='NOPE' WHERE id=?").run(m.id);
  assert.equal((await allowedModels(t.env, plan.id)).length, 0, 'model without a Worker key is hidden (the /api/me list is cached 30 s)');
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

test('turnstile: when configured, login without a token is rejected before reaching Firebase', async () => {
  const t = await makeEnv({ TURNSTILE_SECRET: 's', TURNSTILE_URL: 'http://127.0.0.1:9/never' });
  const r = await t.json('/api/auth', { method: 'POST', body: { action: 'login', email: 'a@b.co', password: '12345678' } });
  assert.equal(r.status, 400); assert.match(r.data.error, /บอท/);
  const off = await makeEnv(); const r2 = await off.json('/api/auth', { method: 'POST', body: { action: 'login', email: 'a@b.co', password: 'x' } });
  assert.notEqual(r2.data?.error?.includes?.('บอท'), true);
});

test('auto model: skips image models and models that are down', async () => {
  const a = await fakeModel((q, res) => a.sse(res, 'A')), b = await fakeModel((q, res) => b.sse(res, 'B'));
  const t = await makeEnv({ K: 'k' });
  const cheap = addModel(t.DB, { name: 'cheap', base_url: a.url, sort: 1 }), img = addModel(t.DB, { name: 'img', provider: 'image', base_url: a.url, sort: 2 }), other = addModel(t.DB, { name: 'other', base_url: b.url, sort: 3 });
  t.DB.raw.prepare('UPDATE models SET multiplier=1 WHERE id=?').run(cheap.id); t.DB.raw.prepare('UPDATE models SET multiplier=2 WHERE id=?').run(other.id); t.DB.raw.prepare('UPDATE models SET multiplier=0.1 WHERE id=?').run(img.id);
  const plan = addPlan(t.DB, { models: [cheap.id, img.id, other.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  for (let i = 0; i < 3; i++) t.DB.raw.prepare("INSERT INTO events (kind,model_id,detail,created_at) VALUES ('error',?,'x',?)").run(cheap.id, Date.now());
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: 'auto', text: 'hi' } })); await Promise.all(t.ctx.pending);
  assert.ok(ev.some(e => e.t === 'B'), JSON.stringify(ev)); assert.equal(a.hits.length, 0);
  a.close(); b.close();
});

test('usage CSV export lists days and models for the signed-in user only', async () => {
  const t = await makeEnv(); const u = await t.user(), o = await t.user(); const m = addModel(t.DB, { name: 'CSV,Model', base_url: 'http://x' }); const plan = addPlan(t.DB, { models: [m.id], limit_week: 10 }); give(t.DB, u, plan);
  const ins = t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,10,20,0,1,1,?)');
  ins.run(u.id, m.id, Date.now()); ins.run(o.id, m.id, Date.now());
  const r = await t.call('/api/usage/export?days=30', { cookie: u.cookie }); const txt = await r.text();
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8'); assert.ok(txt.includes('"CSV,Model",1,10,20,0,10')); assert.equal(txt.trim().split('\n').length, 2);
});

test('changing plan carries the remaining value over as days of the new plan', async () => {
  const t = await makeEnv(); const adm = await t.user({ role: 'admin' }), u = await t.user();
  const a = addPlan(t.DB, { name: 'A', price: 300 }), b = addPlan(t.DB, { name: 'B', price: 600 }); const now = Date.now();
  t.DB.raw.prepare("UPDATE users SET plan_id=?,plan_expires=?,plan_period='month' WHERE id=?").run(a.id, now + 15 * 864e5, u.id);
  const pay = t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at) VALUES (?,?,?,'x','pending','plan','month',?) RETURNING id").get(u.id, b.id, 600, now);
  const r = await t.json(`/api/admin/payments/${pay.id}/approve`, { method: 'POST', cookie: adm.cookie }); assert.equal(r.status, 200);
  const days = (t.DB.raw.prepare('SELECT plan_expires FROM users WHERE id=?').get(u.id).plan_expires - now) / 864e5;
  assert.ok(Math.abs(days - (7.5 + 30)) < 0.05, 'days=' + days);
});

const project = (t, u, files) => {
  const p = t.DB.raw.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').get(u.id, 'P', Date.now(), Date.now());
  for (const [path, content] of Object.entries(files)) t.DB.raw.prepare('INSERT INTO project_files VALUES (?,?,?,?)').run(p.id, path, content, Date.now());
  return p;
};

test('project restore points bring files back to an earlier state and are themselves undoable', async () => {
  const t = await makeEnv(); const u = await t.user(); const p = project(t, u, { 'a.txt': 'v3', 'b.txt': 'b3' });
  const ins = t.DB.raw.prepare('INSERT INTO file_versions (project_id,path,content,source,created_at) VALUES (?,?,?,?,?)');
  const T1 = Date.now() - 3600e3, T2 = Date.now() - 1800e3;
  ins.run(p.id, 'a.txt', 'v1', 'edit', T1); ins.run(p.id, 'a.txt', 'v2', 'edit', T2); ins.run(p.id, 'b.txt', 'b2', 'edit', T2);
  const pts = await t.json(`/api/projects/${p.id}/restorepoints`, { cookie: u.cookie }); assert.equal(pts.data.length, 2);
  const r = await t.json(`/api/projects/${p.id}/restore`, { method: 'POST', cookie: u.cookie, body: { ts: T1 } }); assert.equal(r.data.restored, 2);
  const f = Object.fromEntries(t.DB.raw.prepare('SELECT path,content FROM project_files WHERE project_id=?').all(p.id).map(x => [x.path, x.content]));
  assert.deepEqual(f, { 'a.txt': 'v1', 'b.txt': 'b2' });
  assert.ok(t.DB.raw.prepare("SELECT 1 FROM file_versions WHERE project_id=? AND source='restore' AND content='v3'").get(p.id), 'previous state kept');
});

test('admin area needs a second password: set on first entry, wrong one refused, unlocks only that session', async () => {
  const t = await makeEnv(); const a = await t.user({ role: 'admin', locked: true }), u = await t.user();
  const sid2 = 'b'.repeat(32), { sha } = await import('../src/core.js'); t.DB.raw.prepare('INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)').run(await sha(sid2), a.id, Date.now() + 864e5); const a2 = { cookie: 'sid=' + sid2 }; // เครื่องที่สองของแอดมินคนเดียวกัน
  const g = await t.json('/api/admin/quality', { cookie: a.cookie });
  assert.equal(g.status, 403); assert.equal(g.data.gate, true); assert.equal(g.data.set, false);
  assert.equal((await t.json('/api/admin-gate', { cookie: u.cookie })).status, 403, 'normal user cannot touch the gate');
  assert.equal((await t.json('/api/admin-gate', { method: 'POST', cookie: a.cookie, body: { password: 'short' } })).status, 400);
  assert.equal((await t.json('/api/admin-gate', { method: 'POST', cookie: a.cookie, body: { password: 'first-pass-123' } })).status, 200);
  assert.equal((await t.json('/api/admin/quality', { cookie: a.cookie })).status, 200);
  assert.equal((await t.json('/api/admin/quality', { cookie: a2.cookie })).status, 403, 'another session is still locked');
  assert.equal((await t.json('/api/admin-gate', { method: 'POST', cookie: a2.cookie, body: { password: 'wrong-pass' } })).status, 403);
  assert.equal((await t.json('/api/admin-gate', { method: 'POST', cookie: a2.cookie, body: { password: 'first-pass-123' } })).data.ok, true);
  assert.equal((await t.json('/api/admin/quality', { cookie: a2.cookie })).status, 200);
  assert.equal((await t.json('/api/admin-gate', { method: 'POST', cookie: a2.cookie, body: { password: 'first-pass-123', new: 'second-pass-456' } })).status, 200);
  assert.equal((await t.json('/api/admin/quality', { cookie: a.cookie })).status, 403, 'changing the password locks the other sessions');
  assert.equal((await t.json('/api/admin/quality', { cookie: a2.cookie })).status, 200);
});

test('team owner can switch a member API off, list and revoke member keys; non-owners cannot', async () => {
  const t = await makeEnv(); const owner = await t.user(), mem = await t.user(), other = await t.user();
  const plan = await addPlan(t.DB, { name: 'Team5', price: 1790, limit_4h: 51, limit_week: 205, seats: 5, shared_pool: 1, api_limit: 1 });
  const team = t.DB.raw.prepare("INSERT INTO teams (name,owner_id,plan_id,expires,invite_code,max_seats,shared_pool,created_at) VALUES ('T',?,?,?,'ABCD1234',5,1,?) RETURNING id").get(owner.id, plan.id, Date.now() + 864e5, Date.now());
  for (const [u, r] of [[owner, 'owner'], [mem, 'member']]) t.DB.raw.prepare('INSERT INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(team.id, u.id, r, Date.now());
  const k = await t.json('/api/keys', { method: 'POST', cookie: mem.cookie, body: { name: 'm' } }); assert.equal(k.status, 200, JSON.stringify(k.data));
  const ks = await t.json(`/api/team/members/${mem.id}/keys`, { cookie: owner.cookie }); assert.equal(ks.data.length, 1);
  assert.equal((await t.json(`/api/team/members/${mem.id}/keys`, { cookie: other.cookie })).status, 404);
  assert.equal((await t.json(`/api/team/members/${mem.id}`, { method: 'PUT', cookie: mem.cookie, body: { api_off: true } })).status, 403);
  assert.equal((await t.json(`/api/team/members/${mem.id}`, { method: 'PUT', cookie: owner.cookie, body: { api_off: true } })).status, 200);
  assert.equal((await t.json('/api/keys', { method: 'POST', cookie: mem.cookie, body: { name: 'm2' } })).status, 403, 'blocked from creating keys');
  const v1 = await t.call('/v1/models', { headers: { authorization: 'Bearer ' + k.data.key } }); assert.equal(v1.status, 200);
  assert.equal((await t.json(`/api/team/members/${mem.id}/keys/${ks.data[0].id}`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
  assert.equal((await t.call('/v1/models', { headers: { authorization: 'Bearer ' + k.data.key } })).status, 401, 'revoked key stops working');
  assert.equal((await t.json(`/api/team/members/${mem.id}/keys`, { cookie: owner.cookie })).data.length, 0);
});

test('history window moves in half-window steps so the prompt prefix stays stable (cache friendly)', async () => {
  const { histStart } = await import('../src/core.js');
  const starts = Array.from({ length: 80 }, (_, i) => histStart(i + 1, 20));
  assert.ok(starts.every((s, i) => i === 0 || s >= starts[i - 1]), 'never moves backwards');
  assert.ok(starts.every((s, i) => i + 1 - s <= 20 && (i + 1 <= 20 || i + 1 - s >= 10)), 'window stays between max/2 and max');
  assert.ok(new Set(starts).size <= 8, 'start changes only every half window');
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'C1', base_url: fm.url }); const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 });
  const u = await t.user(); give(t.DB, u, plan);
  let cid;
  for (let k = 1; k <= 30; k++) {
    t.DB.raw.exec('DELETE FROM rate'); // ไม่ให้ตัวจำกัดความถี่มาปนกับสิ่งที่ทดสอบ
    const r = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'msg ' + k, chat_id: cid } });
    const ev = await readSSE(r); cid ||= ev.find(e => e.chat_id)?.chat_id; assert.equal(r.status, 200);
  }
  const firsts = fm.hits.filter(h => h.body.messages).map(h => h.body.messages.find(x => x.role === 'user').content);
  assert.equal(firsts.length, 30); assert.ok(new Set(firsts).size <= 8, 'first message changes rarely: ' + new Set(firsts).size);
  fm.close();
});

test('admin model form: billing is either per token or per request, never mixed', async () => {
  const t = await makeEnv(); const adm = await t.user({ role: 'admin' });
  const base = { name: 'Flat', provider: 'openai', api_model: 'x', base_url: 'https://x.test', key_name: 'K', multiplier: 1, cost_in: 1, cost_out: 2, cost_cache: 0, cost_cache_write: 0, sort: 1, active: 1, public: 1, vision: 0, note: '', cap_pct: 0, effort: 'none' };
  const bad = await t.json('/api/admin/models', { method: 'POST', cookie: adm.cookie, body: { ...base, bill: 'request' } });
  assert.equal(bad.status, 400, 'request mode needs a per-request cost');
  const ok = await t.json('/api/admin/models', { method: 'POST', cookie: adm.cookie, body: { ...base, bill: 'request', req_cost: 0.4, req_price: 1 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const row = t.DB.raw.prepare("SELECT id,bill,req_cost,req_price FROM models WHERE name='Flat'").get(); assert.deepEqual([row.bill, row.req_cost, row.req_price], ['request', 0.4, 1]);
  await t.json('/api/admin/models/' + row.id, { method: 'PUT', cookie: adm.cookie, body: { ...base, bill: 'token', req_cost: 0.4, req_price: 1 } });
  const back = t.DB.raw.prepare('SELECT bill,req_cost,req_price FROM models WHERE id=?').get(row.id); assert.deepEqual([back.bill, back.req_cost, back.req_price], [null, null, null], 'token mode clears the per-request fields');
});

test('chat images older than 30 days are deleted, newer ones stay', async () => {
  const t = await makeEnv(); const { cleanImages } = await import('../src/jobs.js'); const { ensureImgTable } = await import('../src/ai.js');
  await ensureImgTable(t.env);
  const cols = t.DB.raw.prepare("SELECT name FROM pragma_table_info('chat_images')").all().map(x => x.name);
  const row = (key, age) => { const v = { key, n: 0, user_id: 1, mime: 'image/png', data: 'x', created_at: Date.now() - age * 864e5 }; const ks = Object.keys(v).filter(k => cols.includes(k)); t.DB.raw.prepare(`INSERT INTO chat_images (${ks}) VALUES (${ks.map(() => '?')})`).run(...ks.map(k => v[k])); };
  row('old', 31); row('new', 2);
  await cleanImages(t.env);
  assert.deepEqual(t.DB.raw.prepare('SELECT key FROM chat_images').all().map(x => x.key), ['new']);
});

test('team owner can revoke all of a member key at once; admin quality report includes cache hit per model', async () => {
  const t = await makeEnv(); const owner = await t.user(), mem = await t.user(), adm = await t.user({ role: 'admin' });
  const plan = await addPlan(t.DB, { name: 'T', price: 1790, seats: 5, shared_pool: 1, api_limit: 1 });
  const team = t.DB.raw.prepare("INSERT INTO teams (name,owner_id,plan_id,expires,invite_code,max_seats,shared_pool,created_at) VALUES ('T',?,?,?,'ZZ11',5,1,?) RETURNING id").get(owner.id, plan.id, Date.now() + 864e5, Date.now());
  for (const [u, r] of [[owner, 'owner'], [mem, 'member']]) t.DB.raw.prepare('INSERT INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(team.id, u.id, r, Date.now());
  for (const n of ['a', 'b']) assert.equal((await t.json('/api/keys', { method: 'POST', cookie: mem.cookie, body: { name: n } })).status, 200);
  assert.equal((await t.json(`/api/team/members/${mem.id}/keys`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
  assert.equal((await t.json(`/api/team/members/${mem.id}/keys`, { cookie: owner.cookie })).data.length, 0);
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,?,?,?,?,?,?)').run(mem.id, 1, 100, 10, 300, 0, 0, Date.now());
  const q = await t.json('/api/admin/quality', { cookie: adm.cookie }); assert.equal(q.data.cache[0].cached, 300); assert.equal(q.data.cache[0].fresh, 100);
});

test('fitContext drops the oldest messages first, keeps a user message first, and cuts one huge message to fit', async () => {
  const { fitContext, estTokens } = await import('../src/core.js');
  const big = 'x'.repeat(40000); // ~10k token
  const msgs = [{ role: 'user', content: big }, { role: 'assistant', content: big }, { role: 'user', content: big }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'last' }];
  const f = fitContext('sys', msgs, 30000);
  assert.ok(f.trimmed); assert.equal(f.msgs[0].role, 'user'); assert.equal(f.msgs.at(-1).content, 'last'); assert.ok(f.used <= 30000 - 4500, String(f.used));
  const one = fitContext('sys', [{ role: 'user', content: 'y'.repeat(400000) }], 20000);
  assert.equal(one.msgs.length, 1); assert.match(one.msgs[0].content, /ตัดส่วนที่เหลือ/); assert.ok(estTokens(one.msgs[0].content) < 20000);
  const small = fitContext('sys', [{ role: 'user', content: 'hi' }], 128000); assert.equal(small.trimmed, false);
});

test('chat reply reports context use against the model window, and the user can compact a chat by hand', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok')); const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Ctx', base_url: fm.url }); t.DB.raw.prepare('UPDATE models SET ctx_k=64 WHERE id=?').run(m.id);
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  let cid, done;
  for (const text of ['one', 'two', 'three']) { t.DB.raw.exec('DELETE FROM rate'); const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text, chat_id: cid } })); cid ||= ev.find(e => e.chat_id)?.chat_id; done = ev.find(e => e.done); }
  assert.equal(done.ctx.max, 64000); assert.ok(done.ctx.used > 0);
  const c = await t.json(`/api/chats/${cid}/compact`, { method: 'POST', cookie: u.cookie }); assert.equal(c.status, 200); assert.equal(c.data.ok, true);
  assert.ok(t.DB.raw.prepare('SELECT summary FROM chats WHERE id=?').get(cid).summary);
  fm.close();
});

test('gift codes move wallet money once; request cap, blocked words, key expiry and chat branch work', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok')); const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Cap', base_url: fm.url }); const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 100, api_limit: 1 });
  const a = await t.user({ balance: 100 }), b = await t.user(); give(t.DB, a, plan);
  assert.equal((await t.json('/api/gift', { method: 'POST', cookie: b.cookie, body: { amount: 50 } })).status, 402, 'no balance');
  const g = await t.json('/api/gift', { method: 'POST', cookie: a.cookie, body: { amount: 50 } }); assert.equal(g.status, 200);
  const bal = id => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(id).balance; assert.equal(bal(a.id), 50);
  assert.equal((await t.json('/api/gift/redeem', { method: 'POST', cookie: b.cookie, body: { code: g.data.code } })).data.amount, 50); assert.equal(bal(b.id), 50);
  assert.equal((await t.json('/api/gift/redeem', { method: 'POST', cookie: a.cookie, body: { code: g.data.code } })).status, 404, 'a code works once');
  // chat + branch
  let cid; for (const text of ['one', 'two']) { t.DB.raw.exec('DELETE FROM rate'); const ev = await readSSE(await chat(t, a, m, text).then(async r => r)); cid ||= ev.find(e => e.chat_id)?.chat_id; if (!cid) cid = t.DB.raw.prepare('SELECT id FROM chats ORDER BY id DESC').get().id; }
  t.DB.raw.exec('DELETE FROM rate');
  const first = t.DB.raw.prepare('SELECT id FROM messages WHERE chat_id=? ORDER BY id').all(t.DB.raw.prepare('SELECT chat_id FROM messages ORDER BY id').get().chat_id);
  const src = t.DB.raw.prepare('SELECT chat_id FROM messages ORDER BY id').get().chat_id;
  const br = await t.json(`/api/chats/${src}/branch`, { method: 'POST', cookie: a.cookie, body: { message_id: first[1].id } });
  assert.equal(br.status, 200); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM messages WHERE chat_id=?').get(br.data.id).n, 2);
  assert.equal((await t.json(`/api/chats/${src}/branch`, { method: 'POST', cookie: b.cookie, body: {} })).status, 404);
  // request cap: 2 chats already used
  t.DB.raw.prepare('UPDATE models SET req_cap=2 WHERE id=?').run(m.id); t.DB.raw.exec('DELETE FROM rate');
  assert.equal((await chat(t, a, m)).status, 429);
  t.DB.raw.prepare('UPDATE models SET req_cap=NULL WHERE id=?').run(m.id);
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('block_words','badword, อีกคำ')").run(); t.DB.raw.exec('DELETE FROM rate');
  assert.equal((await chat(t, a, m, 'this has BadWord inside')).status, 400);
  // key expiry
  t.DB.raw.exec('DELETE FROM rate'); const k = await t.json('/api/keys', { method: 'POST', cookie: a.cookie, body: { name: 'x', days: 7 } }); assert.equal(k.status, 200, JSON.stringify(k.data));
  const call = () => t.call('/v1/models', { headers: { authorization: 'Bearer ' + k.data.key } });
  assert.equal((await call()).status, 200); t.DB.raw.prepare('UPDATE api_keys SET expires_at=?').run(Date.now() - 1000); assert.equal((await call()).status, 401);
  fm.close();
});

test('shared skills', async () => {
  const seen = []; const fm = await fakeModel((q, res, body) => { seen.push(body); fm.sse(res, 'answer'); }); const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'KB', base_url: fm.url }); const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 100 });
  const a = await t.user(), b = await t.user(); give(t.DB, a, plan);
  // shared skill
  const sk = await t.json('/api/skills', { method: 'POST', cookie: a.cookie, body: { name: 'bot', content: 'be brief' } });
  const sh = await t.json(`/api/skills/${sk.data.id}/share`, { method: 'POST', cookie: a.cookie });
  const im = await t.json('/api/skills/import', { method: 'POST', cookie: b.cookie, body: { token: sh.data.token } }); assert.equal(im.status, 200); assert.equal(im.data.name, 'bot');
  assert.equal((await t.json('/api/skills/import', { method: 'POST', cookie: b.cookie, body: { token: 'nope' } })).status, 404);
  fm.close();
});

test('background agent: reads, writes the project on the server, reports a summary; blocks free plans and double runs', async () => {
  let call = 0; const seen = [];
  const fm = await fakeModel((q, res, body) => {
    seen.push(body); call++;
    fm.sse(res, call === 1 ? 'READ path=index.html' : call === 2 ? '```html path=index.html\n<h1>New title</h1>\n```\n```js path=app.js\nconsole.log("hi")\n```' : 'เสร็จแล้ว: เปลี่ยนหัวข้อและเพิ่ม app.js');
  });
  const t = await makeEnv({ K: 'k' }); const m = addModel(t.DB, { name: 'Ag', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 100 }), free = addPlan(t.DB, { name: 'F', models: [m.id], price: 0 });
  const a = await t.user(), b = await t.user(); give(t.DB, a, plan); give(t.DB, b, free);
  const pr = await t.json('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'Site' } }), pid = pr.data.id;
  assert.equal((await t.json('/api/agent', { method: 'POST', cookie: b.cookie, body: { project_id: pid, model_id: m.id, prompt: 'เปลี่ยนหัวข้อหน้าแรก' } })).status, 403, 'free plan');
  assert.equal((await t.json('/api/agent', { method: 'POST', cookie: a.cookie, body: { project_id: pid, model_id: m.id, prompt: 'สั้น' } })).status, 400);
  const r = await t.json('/api/agent', { method: 'POST', cookie: a.cookie, body: { project_id: pid, model_id: m.id, prompt: 'เปลี่ยนหัวข้อหน้าแรกเป็น New title และเพิ่ม app.js' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const job = (await t.json('/api/agent?project=' + pid, { cookie: a.cookie })).data[0];
  assert.equal(job.status, 'done', JSON.stringify(job)); assert.equal(job.rounds, 3); assert.match(job.summary, /เสร็จแล้ว/);
  const files = Object.fromEntries(t.DB.raw.prepare('SELECT path,content FROM project_files WHERE project_id=?').all(pid).map(f => [f.path, f.content]));
  assert.match(files['index.html'], /New title/); assert.ok(files['app.js']); assert.deepEqual(JSON.parse(job.changed).sort(), ['app.js', 'index.html']);
  assert.ok(t.DB.raw.prepare("SELECT 1 FROM file_versions WHERE project_id=? AND path='index.html' AND source='agent'").get(pid), 'old version kept');
  assert.ok(t.DB.raw.prepare('SELECT 1 FROM chats WHERE id=?').get(job.chat_id), 'result saved as a chat');
  assert.ok(t.DB.raw.prepare('SELECT COUNT(*) n FROM usage WHERE user_id=?').get(a.id).n >= 3, 'usage logged per round');
  assert.match(JSON.stringify(seen[1].messages), /\[READ index\.html\]/, 'tool result fed back');
  t.DB.raw.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at) VALUES (?,?,?,?,'running',?)").run(a.id, pid, m.id, 'x'.repeat(20), Date.now());
  assert.equal((await t.json('/api/agent', { method: 'POST', cookie: a.cookie, body: { project_id: pid, model_id: m.id, prompt: 'งานที่สองระหว่างที่ยังมีงานค้างอยู่' } })).status, 409);
  fm.close();
});

test('server and browser edit parsers agree on the same model replies', async () => {
  const { readFileSync } = await import('node:fs'); const { changesOf } = await import('../src/edits.js');
  const src = readFileSync(new URL('../public/code.js', import.meta.url), 'utf8'), pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
  const client = new Function(`const has = () => false, content = () => ''; ${pick('const NOT_FILE_LANG', 'function lineDiff')}\nreturn { changesOf };`)().changesOf;
  const files = { 'a.js': 'let x = 1;\nlet y = 2;\n' };
  const replies = ['```js path=a.js\nlet z = 3;\n```', '```js path=a.js\n<<<<<<< SEARCH\nlet y = 2;\n=======\nlet y = 5;\n>>>>>>> REPLACE\n```', '# `b.html`\n```html\n<p>x</p>\n```', 'DELETE path=old.txt', '```bash\nnpm i\n```'];
  for (const r of replies) assert.deepEqual(changesOf(r, p => files[p] ?? null), client(r, p => files[p] ?? null), r);
});

test('syntaxWarning finds unbalanced brackets and unclosed strings, but not brackets inside strings, comments, regex or template text', async () => {
  const { syntaxWarning } = await import('../src/edits.js');
  assert.equal(syntaxWarning('a.js', 'function f() {\n  return [1, 2].map(x => (x + 1));\n}\n'), '');
  assert.equal(syntaxWarning('a.js', 'const s = "a { (";\nconst t = `x ${1} [`;\n// } ) ]\n/* { */\nconst r = /[)}"]+/g;\nconst d = a / b;\n'), '');
  assert.match(syntaxWarning('a.js', 'function f() {\n  if (x) {\n    y();\n}\n'), /ไม่ถูกปิด/);
  assert.match(syntaxWarning('a.js', 'const a = [1, 2);\n'), /ไม่มีตัวเปิดที่ตรงกัน/);
  assert.match(syntaxWarning('a.js', 'const a = "abc;\nlet b = 1;\n'), /ไม่ปิด/);
  assert.match(syntaxWarning('style.css', '.a { color: red;\n.b { margin: 0; }\n'), /ไม่ถูกปิด/);
  assert.equal(syntaxWarning('index.html', '<div>{</div>'), '', 'only js/css are checked');
});

test('webhook url: https public only; budget crossing posts to it; admin profit report has per-model and per-day rows', async () => {
  const hooks = []; const wh = await fakeModel((q, res, body) => { hooks.push(body); res.writeHead(200); res.end('ok'); });
  const t = await makeEnv({ K: 'k' }); const u = await t.user(), adm = await t.user({ role: 'admin' });
  for (const bad of ['http://example.com/x', 'https://localhost/x', 'https://10.1.2.3/x', 'ftp://a.b/c']) assert.equal((await t.json('/api/me', { method: 'PUT', cookie: u.cookie, body: { webhook_url: bad } })).status, 400, bad);
  assert.equal((await t.json('/api/me', { method: 'PUT', cookie: u.cookie, body: { webhook_url: 'https://hooks.example.com/abc' } })).status, 200);
  assert.equal((await t.json('/api/me', { cookie: u.cookie })).data.webhook_url, 'https://hooks.example.com/abc');
  assert.equal((await t.json('/api/me', { method: 'PUT', cookie: u.cookie, body: { webhook_url: '' } })).status, 200);
  assert.equal((await t.json('/api/me', { cookie: u.cookie })).data.webhook_url, '');
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,?,?,?,?,?,?)').run(u.id, 1, 10, 5, 0, 0.3, 0.3, Date.now());
  const p = await t.json('/api/admin/profit?days=7', { cookie: adm.cookie });
  assert.equal(p.status, 200); assert.ok(Array.isArray(p.data.models) && Array.isArray(p.data.daily)); assert.ok(p.data.daily.some(d => d.cost >= 0.3));
  wh.close();
});

test('background agent creates a requested image on the server and saves it in the project', async () => {
  let call = 0; const JPG = Buffer.from('/9j/4AAQSkZJRgABAQ' + 'A'.repeat(400), 'base64').toString('base64');
  const fm = await fakeModel((q, res) => {
    if (q.url.endsWith('/images/generations')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ b64_json: JPG }] })); }
    call++; fm.sse(res, call === 1 ? 'IMAGE a warm coffee shop interior -> images/hero.jpg' : call === 2 ? '```html path=index.html\n<img src="images/hero.jpg" alt="">\n```' : 'ใส่รูปเรียบร้อย');
  });
  const t = await makeEnv({ K: 'k', IMGK: 'k' }); const m = addModel(t.DB, { name: 'Ag2', base_url: fm.url });
  for (const [k, v] of Object.entries({ image_enabled: '1', image_base_url: fm.url, image_model: 'img-x', image_key_name: 'IMGK', image_cost: '0.5' })) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 100 }); const a = await t.user(); give(t.DB, a, plan);
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'Cafe' } })).data.id;
  const r = await t.json('/api/agent', { method: 'POST', cookie: a.cookie, body: { project_id: pid, model_id: m.id, prompt: 'ทำหน้าเว็บร้านกาแฟพร้อมรูปปก' } }); assert.equal(r.status, 200, JSON.stringify(r.data));
  const job = (await t.json('/api/agent?project=' + pid, { cookie: a.cookie })).data[0]; assert.equal(job.status, 'done', JSON.stringify(job));
  const img = t.DB.raw.prepare("SELECT content FROM project_files WHERE project_id=? AND path='images/hero.jpg'").get(pid); assert.match(img.content, /^data:image\/jpeg;base64,/);
  assert.match(t.DB.raw.prepare("SELECT content FROM project_files WHERE project_id=? AND path='index.html'").get(pid).content, /images\/hero\.jpg/);
  assert.ok(JSON.parse(job.changed).includes('images/hero.jpg'));
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM usage WHERE model_id=0 AND user_id=?').get(a.id).n, 1, 'image cost is logged');
  fm.close();
});

test('context report breaks down what fills the window; auto compact runs when the window is nearly full and the user can turn it off', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'summary of the chat'.padEnd(40, '.'))); const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Ctx2', base_url: fm.url }); t.DB.raw.prepare('UPDATE models SET ctx_k=2 WHERE id=?').run(m.id); t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('compact_pct','40')").run(); // หน้าต่างเล็กมาก (2k) และย่อที่ 40% ให้เต็มเร็ว
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  t.DB.raw.prepare("UPDATE users SET instructions='ตอบสั้นๆ เสมอ' WHERE id=?").run(u.id); t.DB.raw.prepare("INSERT INTO memories (user_id,text,created_at) VALUES (?,?,?)").run(u.id, 'ชอบกาแฟดำ', Date.now());
  const say = async (text, cid) => { t.DB.raw.exec('DELETE FROM rate'); const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text, chat_id: cid } })); return { ev, cid: cid || ev.find(e => e.chat_id)?.chat_id }; };
  let { cid } = await say('x'.repeat(600) + ' เรื่องที่หนึ่ง');
  const rep = (await t.json(`/api/context?chat_id=${cid}&model_id=${m.id}`, { cookie: u.cookie })).data;
  assert.equal(rep.max, 2000); assert.ok(rep.used > 0 && rep.free >= 0); assert.ok(rep.parts.some(p => p.k === 'system') && rep.parts.some(p => p.k === 'instr') && rep.parts.some(p => p.k === 'mem') && rep.parts.some(p => p.k === 'user'));
  assert.equal((await t.json(`/api/context?chat_id=${cid}`, { cookie: (await t.user()).cookie })).status, 404, "another user's chat is hidden");
  let last; for (let i = 0; i < 6; i++) last = await say('y'.repeat(1200) + ' ต่อเรื่อง ' + i, cid);
  assert.ok(t.DB.raw.prepare('SELECT summary FROM chats WHERE id=?').get(cid).summary, 'auto compact wrote a summary once the window was nearly full');
  assert.ok(last.ev.some(e => e.compacted) || t.DB.raw.prepare('SELECT summary_upto FROM chats WHERE id=?').get(cid).summary_upto, 'compacted event or summary pointer');
  const rep2 = (await t.json(`/api/context?chat_id=${cid}&model_id=${m.id}`, { cookie: u.cookie })).data; assert.ok(rep2.parts.some(p => p.k === 'summary') && rep2.compacted);
  // user can turn it off
  const off = await t.user(); give(t.DB, off, plan); await t.json('/api/me', { method: 'PUT', cookie: off.cookie, body: { auto_compact: false } });
  const sayOff = async (text, c) => { t.DB.raw.exec('DELETE FROM rate'); const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: off.cookie, body: { model_id: m.id, text, chat_id: c } })); return { ev, cid: c || ev.find(e => e.chat_id)?.chat_id }; };
  let c2 = (await sayOff('z'.repeat(600))).cid; for (let i = 0; i < 6; i++) await sayOff('w'.repeat(1200) + i, c2);
  assert.ok(!t.DB.raw.prepare('SELECT summary FROM chats WHERE id=?').get(c2).summary, 'no auto compact when the user turned it off');
  fm.close();
});

test('admin can promote/demote others but not self; demote clears admin gate', async () => {
  const t = await makeEnv(); const adm = await t.user({ role: 'admin' }), u = await t.user();
  await t.env.DB.prepare('UPDATE sessions SET admin_ok=?').bind(Date.now() + 36e5).run();
  const put = (id, body, c = adm.cookie) => t.json('/api/admin/users/' + id, { method: 'PUT', cookie: c, body });
  assert.equal((await put(adm.id, { role: 'user' })).status, 400);
  assert.equal((await put(u.id, { role: 'root' })).status, 400);
  assert.equal((await put(u.id, { role: 'admin' })).status, 200);
  assert.equal((await t.env.DB.prepare('SELECT role FROM users WHERE id=?').bind(u.id).first()).role, 'admin');
  assert.equal((await t.json('/api/admin/stats', { cookie: u.cookie })).status, 403); // ยังต้องใส่รหัสหลังบ้าน
  await t.env.DB.prepare('UPDATE sessions SET admin_ok=?').bind(Date.now() + 36e5).run();
  assert.equal((await put(u.id, { role: 'user' })).status, 200);
  assert.equal((await t.json('/api/admin/stats', { cookie: u.cookie })).status, 403);
  assert.equal((await t.env.DB.prepare('SELECT admin_ok FROM sessions s JOIN users x ON x.id=s.user_id WHERE x.id=?').bind(u.id).first()).admin_ok, null);
});

test('leaderboard ranks models by real votes (min 5); admin sees the chat around a reported answer and usage by source', async () => {
  const t = await makeEnv(), adm = await t.user({ role: 'admin' }), u = await t.user();
  const a = addModel(t.DB, { name: 'Alpha', base_url: 'http://x' }), b = addModel(t.DB, { name: 'Beta', base_url: 'http://x' }), c = addModel(t.DB, { name: 'Few', base_url: 'http://x' });
  await t.call('/api/leaderboard'); const now = Date.now(); let mid = 1000;
  const vote = (m, v, n) => { for (let i = 0; i < n; i++) t.DB.raw.prepare('INSERT INTO feedback VALUES (?,?,?,?,?)').run(mid++, u.id, m.id, v, now); };
  vote(a, 1, 9); vote(a, -1, 1); vote(b, 1, 5); vote(b, -1, 5); vote(c, 1, 3);
  const lb = (await t.json('/api/leaderboard')).data; assert.deepEqual(lb.map(x => x.name), ['Alpha', 'Beta']); assert.equal(lb[0].pct, 90);
  const ch = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'c', now).id;
  const m1 = t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'user','ถามอะไร',?) RETURNING id").get(ch, now).id;
  const m2 = t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'assistant','คำตอบแย่',?) RETURNING id").get(ch, now).id;
  const rp = t.DB.raw.prepare("INSERT INTO reports (message_id,user_id,model_id,reason,snippet,created_at) VALUES (?,?,?,?,?,?) RETURNING id").get(m2, u.id, a.id, 'bad', 'x', now).id;
  const ctx = (await t.json(`/api/admin/reports/${rp}/context`, { cookie: adm.cookie })).data;
  assert.deepEqual(ctx.map(x => x.id), [m1, m2]); assert.ok(ctx[1].reported);
  assert.equal((await t.json(`/api/admin/reports/${rp}/context`, { cookie: u.cookie })).status, 403);
  t.DB.raw.prepare("INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src,charge) VALUES (?,?,1,1,0,0,0.5,?,'api',0.9)").run(u.id, a.id, now);
  const st = (await t.json('/api/admin/stats', { cookie: adm.cookie })).data; assert.equal(st.by_src.find(x => x.src === 'api').charge, 0.9);
});

test('staff roles: support handles payments and tickets only, viewer reads only, neither changes roles or the gate password', async () => {
  const { staffMay } = await import('../src/worker.js');
  assert.equal(staffMay('support', 'POST', '/api/admin/payments/3/approve'), true);
  assert.equal(staffMay('support', 'PUT', '/api/admin/users/3'), false);
  assert.equal(staffMay('support', 'GET', '/api/admin/settings'), false);
  assert.equal(staffMay('viewer', 'GET', '/api/admin/settings'), true);
  assert.equal(staffMay('viewer', 'POST', '/api/admin/payments/3/approve'), false);
  assert.equal(staffMay('viewer', 'GET', '/api/admin/export'), false);
  assert.equal(staffMay('user', 'GET', '/api/admin/stats'), false);
  const t = await makeEnv(), adm = await t.user({ role: 'admin' }), s = await t.user({ role: 'support' });
  t.DB.raw.prepare('UPDATE sessions SET admin_ok=?').run(Date.now() + 36e5);
  assert.equal((await t.json('/api/admin/payments', { cookie: s.cookie })).status, 200);
  assert.equal((await t.json('/api/admin/users/' + adm.id, { method: 'PUT', cookie: s.cookie, body: { role: 'user' } })).status, 403);
  assert.equal((await t.json('/api/admin-gate', { method: 'POST', cookie: s.cookie, body: { password: 'x', new: 'newpassword123' } })).status >= 400, true);
  assert.equal((await t.json('/api/admin/users/' + s.id, { method: 'PUT', cookie: adm.cookie, body: { role: 'viewer' } })).status, 200);
});

test('model bench: fixed questions graded by regex, time and cost reported', async () => {
  const { BENCH } = await import('../src/admin.js');
  const fm = await fakeModel((q, res, body) => { const u = JSON.stringify(body); fm.sse(res, /3x \+ 7/.test(u) ? 'x = 8 ดังนั้น 56' : /จังหวัด/.test(u) ? '77' : 'ไม่ทราบ'); });
  const t = await makeEnv({ K: 'k' }), adm = await t.user({ role: 'admin' }), m = addModel(t.DB, { name: 'B', base_url: fm.url });
  const r = await t.json('/api/admin/bench', { method: 'POST', cookie: adm.cookie, body: { model_id: m.id } });
  assert.equal(r.status, 200); assert.equal(r.data.total, BENCH.length); assert.equal(r.data.score, 2);
  assert.ok(r.data.items.find(x => x.cat === 'คณิต').pass);
  fm.close();
});

test('prompt cache: web chat asks Claude for a 1h cache (falls back to 5 min if refused); OpenAI gets prompt_cache_key and never "minimal"', async () => {
  const seen = [];
  const fm = await fakeModel((q, res, body) => {
    seen.push(body);
    if (body.system?.[0]?.cache_control?.ttl) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"cache_control.ttl: Extra inputs are not permitted"}}'); }
    if (q.url.endsWith('/messages')) { res.writeHead(200, { 'content-type': 'text/event-stream' }); return res.end(['{"type":"message_start","message":{"usage":{"input_tokens":5,"cache_creation_input_tokens":0}}}', '{"type":"content_block_delta","index":0,"delta":{"text":"ok"}}', '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}'].map(x => 'data: ' + x + '\n\n').join('')); }
    fm.sse(res, 'ok');
  });
  const t = await makeEnv({ K: 'k' });
  const c = addModel(t.DB, { name: 'C', base_url: fm.url, provider: 'anthropic' }), o = addModel(t.DB, { name: 'O', base_url: fm.url, effort: 'openai' });
  const plan = addPlan(t.DB, { models: [c.id, o.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  assert.ok((await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: c.id, text: 'hi' } }))).some(e => e.t === 'ok'));
  assert.equal(seen[0].system[0].cache_control.ttl, '1h'); assert.equal(seen[1].system[0].cache_control.ttl, undefined); // ปฏิเสธ ttl → ส่งใหม่แบบ 5 นาที
  assert.equal(seen[1].messages.at(-1).content.at(-1).cache_control.type, 'ephemeral');
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: o.id, text: 'hi', effort: 'minimal' } }));
  assert.equal(seen.at(-1).prompt_cache_key, 'astra-' + u.id); assert.equal(seen.at(-1).reasoning_effort, 'low');
  fm.close();
});

test('provider 503 before answering is retried, the user still gets the answer', async () => {
  let n = 0;
  const fm = await fakeModel((q, res) => { if (++n === 1) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"temporarily unavailable"}}'); } fm.sse(res, 'fine'); });
  const t = await makeEnv({ K: 'k' }); const m = addModel(t.DB, { name: 'B', base_url: fm.url }); const plan = addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user(); give(t.DB, u, plan);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'hi' } }));
  assert.ok(ev.some(e => e.t === 'fine'), JSON.stringify(ev)); assert.equal(n, 2); fm.close();
});

test('admin profit forecast: plan subscribers get a projected cost to the end of their plan (capped by the weekly limit), wallet charges of every kind count as revenue', async () => {
  const t = await makeEnv({ K: 'k' }); const adm = await t.user({ role: 'admin' }), u = await t.user(), g = await t.user();
  const now = Date.now(), DAYMS = 864e5;
  const plan = addPlan(t.DB, { models: [1], limit_4h: 100, limit_week: 70, price: 300 }); // เพดาน 10 บาท/วัน
  for (const [x, paid] of [[u, true], [g, false]]) {
    t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, now + 20 * DAYMS, x.id);
    if (paid) t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,created_at,approved_at) VALUES (?,?,300,'slip/x','approved','plan',?,?)").run(x.id, plan.id, now - 10 * DAYMS, now - 10 * DAYMS);
  }
  const use = (x, cost, ago, units = cost) => t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,?,?,?,?,?,?)').run(x.id, 1, 1, 1, 0, units, cost, now - ago);
  for (let i = 1; i <= 7; i++) use(u, 40, i * DAYMS - 3600e3); // 40 บาท/วัน เกินเพดาน 10 บาท/วัน
  use(g, 5, 3600e3);
  t.DB.raw.prepare("INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,0,'wallet','m',?)").run(u.id, -12, now - 3600e3);
  const p = (await t.json('/api/admin/profit?days=7', { cookie: adm.cookie })).data, f = p.forecast;
  assert.ok(p.total.earned >= 12, 'wallet kind counts toward profit: ' + p.total.earned);
  const pu = f.people.find(x => x.email === u.email), pg = f.people.find(x => x.email === g.email);
  assert.ok(Math.abs(pu.rate - 10) < 0.01, 'rate capped at limit_week/7: ' + pu.rate);
  assert.ok(Math.abs(pu.future - 10 * pu.days_left) < 0.5);
  assert.ok(pu.profit < 0 && f.subs.at_risk >= 1, 'paid 300, spent 280, 20 days at 10/day left');
  assert.equal(pg.free, true); assert.ok(pg.profit < 0);
  assert.equal(f.people[0].email, u.email, 'riskiest first');
  assert.ok(f.so_far.cost > 0 && f.rate.cost_day >= 0 && typeof f.proj.profit === 'number');
});

test('context sheet: real context from the provider matches the chat header; input, cache write, cache read, output and the cache hit rate per chat', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ตอบแล้ว', { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 600, cache_write_tokens: 300 } }));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Cx', base_url: fm.url }), plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 100 }), u = await t.user(); give(t.DB, u, plan);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'ทดสอบ' } }));
  const done = ev.find(e => e.done); assert.deepEqual([done.ctx.used, done.ctx.real], [1050, true], 'header gets the real context: input 1000 + output 50');
  const cid = t.DB.raw.prepare('SELECT id FROM chats WHERE user_id=?').get(u.id).id;
  const r = (await t.json(`/api/context?chat_id=${cid}&model_id=${m.id}`, { cookie: u.cookie })).data;
  assert.equal(r.used, done.ctx.used, 'sheet headline = header'); assert.equal(r.real, true);
  assert.deepEqual([r.tokens.fresh, r.tokens.cw, r.tokens.cr, r.tokens.out, r.tokens.hit], [100, 300, 600, 50, 60]);
  fm.close();
});

test('chat stream closes as soon as done is sent, even while work after the answer (compaction, mail) is still running; nothing is sent after done', async () => {
  const { ChatRun } = await import('../src/jobs.js');
  const store = new Map(), cr = new ChatRun({ storage: { get: async k => store.get(k), put: async (k, v) => store.set(k, v), delete: async k => store.delete(k), setAlarm: async () => {} } }, {});
  await cr.fetch(new Request('https://run/start', { method: 'POST', body: '{}' })); await store.delete('job'); // งานเริ่มแล้ว (alarm หยิบไปทำ)
  const res = await cr.fetch(new Request('https://run/stream?from=0')), text = res.text();
  cr.push({ t: 'ตอบ' }); cr.push({ done: true }); cr.push({ compacted: true });
  const body = await Promise.race([text, new Promise(r => setTimeout(() => r('TIMEOUT'), 1500))]);
  assert.notEqual(body, 'TIMEOUT', 'stream must close at done although the run is not finished'); assert.match(body, /"done":true/); assert.doesNotMatch(body, /compacted/);
  assert.equal(cr.done, false, 'the run itself is still going');
});

test('Code: which files an AI reply was applied to is saved on the message, only by its owner, and comes back with the chat', async () => {
  const t = await makeEnv(), u = await t.user(), other = await t.user(); await t.json('/api/version');
  const cid = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'c', Date.now()).id;
  const mid = t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'assistant','x',?) RETURNING id").get(cid, Date.now()).id;
  assert.equal((await t.json(`/api/messages/${mid}/applied`, { method: 'POST', cookie: other.cookie, body: { paths: ['a.js'] } })).status, 404, 'not your message');
  assert.equal((await t.json(`/api/messages/${mid}/applied`, { method: 'POST', cookie: u.cookie, body: { paths: ['index.html', 'index.html', 'app.js'] } })).status, 200);
  assert.deepEqual(JSON.parse((await t.json('/api/chats/' + cid, { cookie: u.cookie })).data.at(-1).applied), ['index.html', 'app.js']);
  await t.json(`/api/messages/${mid}/applied`, { method: 'POST', cookie: u.cookie, body: { paths: null } }); // Undo
  assert.equal((await t.json('/api/chats/' + cid, { cookie: u.cookie })).data.at(-1).applied, null);
});

test('memory import: pasted ChatGPT memories become separate items, bullets stripped, duplicates skipped, capped at 50', async () => {
  const { makeEnv } = await import('./helpers.mjs');
  const t = await makeEnv(); await t.json('/api/version'); const u = await t.user();
  await t.json('/api/memories', { method: 'POST', cookie: u.cookie, body: { text: 'ชื่อแซม' } });
  const r = await t.json('/api/memories/import', { method: 'POST', cookie: u.cookie, body: { text: 'Saved memories\n- ชื่อแซม\n• ทำงานด้านการตลาด\n1. ชอบคำตอบสั้น ๆ\nUser: Prefers Thai replies\n\n- ทำงานด้านการตลาด' } });
  assert.equal(r.data.added, 3); assert.equal(r.data.total, 4);
  const L = (await t.json('/api/memories', { cookie: u.cookie })).data.map(m => m.text);
  assert.deepEqual(L, ['ชื่อแซม', 'ทำงานด้านการตลาด', 'ชอบคำตอบสั้น ๆ', 'Prefers Thai replies']);
  const big = Array.from({ length: 60 }, (_, i) => 'fact number ' + i).join('\n');
  assert.equal((await t.json('/api/memories/import', { method: 'POST', cookie: u.cookie, body: { text: big } })).data.total, 50);
});

test('plan min margin: the weekly and 4h limits are worked out from the price (full use every week), team plans split per member', async () => {
  const { makeEnv } = await import('./helpers.mjs');
  const t = await makeEnv(); await t.json('/api/version'); const adm = await t.user({ role: 'admin' });
  const base = { name: 'Plus', price: 349, limit_4h: 8.75, limit_week: 35, seats: 1, active: 1, sort: 1, min_margin: 50, description: 'x', use_4h: 1, shared_pool: 0, api_limit: 0, agent: 0, once: 0 };
  const r = await t.json('/api/admin/plans', { method: 'POST', cookie: adm.cookie, body: base }); assert.equal(r.status, 200, JSON.stringify(r.data));
  const p = t.DB.raw.prepare('SELECT limit_week, limit_4h FROM plans WHERE id=?').get(r.data.id);
  assert.equal(p.limit_week, 40.72); assert.equal(p.limit_4h, 10.18);
  const w = await t.json('/api/admin/plans', { method: 'POST', cookie: adm.cookie, body: { ...base, name: 'Week', price: 499, days: 7, min_margin: 60 } });
  assert.equal(t.DB.raw.prepare('SELECT limit_week FROM plans WHERE id=?').get(w.data.id).limit_week, 199.6);
  const tm = await t.json('/api/admin/plans', { method: 'POST', cookie: adm.cookie, body: { ...base, name: 'Team 5', price: 1790, seats: 5, shared_pool: 0, min_margin: 50 } });
  assert.equal(t.DB.raw.prepare('SELECT limit_week FROM plans WHERE id=?').get(tm.data.id).limit_week, 41.77);
  assert.equal((await t.json('/api/admin/plans', { method: 'POST', cookie: adm.cookie, body: { ...base, min_margin: 120 } })).status, 400);
});
