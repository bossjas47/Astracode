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

test('shared project: owner gets a link, anyone sees a bundled sandboxed page, revoking removes it', async () => {
  const t = await makeEnv(); const u = await t.user(), other = await t.user();
  const png = 'data:image/jpeg;base64,/9j/AAAA';
  const p = project(t, u, { 'index.html': '<html><head><link rel="stylesheet" href="style.css"></head><body><img src="images/a.jpg"><script src="app.js"></script></body></html>', 'style.css': 'body{color:red}', 'app.js': 'window.x=1', 'images/a.jpg': png });
  assert.equal((await t.json(`/api/projects/${p.id}/share`, { method: 'POST', cookie: other.cookie })).status, 404);
  const sh = await t.json(`/api/projects/${p.id}/share`, { method: 'POST', cookie: u.cookie }); assert.match(sh.data.token, /^[a-f0-9]{24}$/);
  const page = await t.call('/p/' + sh.data.token); const html = await page.text();
  assert.equal(page.status, 200); assert.ok(html.includes('body{color:red}') && html.includes('window.x=1') && html.includes(png) && !html.includes('href="style.css"'));
  assert.match(page.headers.get('content-security-policy'), /sandbox/);
  await t.json(`/api/projects/${p.id}/share`, { method: 'DELETE', cookie: u.cookie });
  assert.equal((await t.call('/p/' + sh.data.token)).status, 404);
});

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
