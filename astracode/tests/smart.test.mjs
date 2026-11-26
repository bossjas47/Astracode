// Smart Router (Opus วางแผน → Sol ลงมือ → Opus ตรวจ), โหมดเทพ (หลายโมเดลตอบแล้วรวม), ประเมินลิมิตก่อนส่ง, คุณภาพต่อโมเดล, เกณฑ์ย่อแชต
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

const sysOf = b => JSON.stringify(b.messages?.filter(x => x.role === 'system') || b.system || '');

test('Smart Router: Opus plans, ChatGPT 6.2 Sol answers with the plan, Opus reviews code answers', async () => {
  const fm = await fakeModel((q, res, b) => {
    const s = sysOf(b);
    if (b.model === 'opus' && s.includes('You are the planner')) return fm.sse(res, 'PLAN: use a loop');
    if (b.model === 'opus' && s.includes('strict senior reviewer')) return fm.sse(res, 'missing edge case n=0');
    fm.sse(res, 'here\n```js\nfor(;;){}\n```');
  });
  const t = await makeEnv({ K: 'k' });
  const opus = addModel(t.DB, { name: 'Claude Opus 5.5', base_url: fm.url, api_model: 'opus', cost_in: 50, cost_out: 250 });
  const sol = addModel(t.DB, { name: 'ChatGPT 6.2 Sol', base_url: fm.url, api_model: 'sol' });
  const P = addPlan(t.DB, { models: [opus.id, sol.id], limit_4h: 1000, limit_week: 1000 }); const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE email=?').run(P.id, Date.now() + 864e6, u.email ?? t.DB.raw.prepare('SELECT email FROM users ORDER BY id DESC').get().email);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: opus.id, text: 'write a loop', smart: true, task: true } }));
  assert.deepEqual(ev.find(e => e.smart)?.smart, { planner: 'Claude Opus 5.5', executor: 'ChatGPT 6.2 Sol' });
  const exec = fm.hits.find(h => h.body.model === 'sol');
  assert.ok(exec && sysOf(exec.body).includes('PLAN: use a loop'), 'Sol gets the plan');
  const text = ev.filter(e => e.t).map(e => e.t).join('');
  assert.match(text, /ตรวจแล้ว[\s\S]*missing edge case/);
  const msg = t.DB.raw.prepare("SELECT model_id FROM messages WHERE role='assistant'").get();
  assert.equal(msg.model_id, sol.id);
  assert.ok(t.DB.raw.prepare('SELECT COUNT(*) n FROM usage WHERE model_id=?').get(opus.id).n >= 2, 'planner + reviewer billed');
  fm.close();
});

test('Smart Router is ignored in plain chat (measured: costs ~2x there)', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' });
  const opus = addModel(t.DB, { name: 'Claude Opus 5.5', base_url: fm.url, api_model: 'opus', cost_in: 50 });
  addModel(t.DB, { name: 'ChatGPT 6.2 Sol', base_url: fm.url, api_model: 'sol' });
  const P = addPlan(t.DB, { models: [opus.id] }); const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(P.id, Date.now() + 864e6, u.id);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: opus.id, text: 'hi', smart: true } }));
  assert.ok(!ev.some(e => e.smart)); assert.ok(fm.hits.every(h => h.body.model === 'opus'));
  fm.close();
});

test('Smart Router stays off unless asked, and only for Opus', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' });
  const opus = addModel(t.DB, { name: 'Claude Opus 5.5', base_url: fm.url, api_model: 'opus' });
  addModel(t.DB, { name: 'ChatGPT 6.2 Sol', base_url: fm.url, api_model: 'sol' });
  const P = addPlan(t.DB, { models: [opus.id] }); const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE email=?').run(P.id, Date.now() + 864e6, u.email ?? t.DB.raw.prepare('SELECT email FROM users ORDER BY id DESC').get().email);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: opus.id, text: 'hi' } }));
  assert.ok(!ev.some(e => e.smart)); assert.ok(fm.hits.every(h => h.body.model === 'opus'));
  fm.close();
});

test('God mode: candidates answer in parallel, the chosen model merges them (paid plans only)', async () => {
  const fm = await fakeModel((q, res, b) => fm.sse(res, b.model === 'main' ? 'merged' : 'cand-' + b.model));
  const t = await makeEnv({ K: 'k' });
  const main = addModel(t.DB, { name: 'Main', base_url: fm.url, api_model: 'main' });
  addModel(t.DB, { name: 'ChatGPT 6.2 Sol', base_url: fm.url, api_model: 'sol' });
  addModel(t.DB, { name: 'Qwen 4 Max', base_url: fm.url, api_model: 'qwen' });
  const P = addPlan(t.DB, { models: [main.id], limit_4h: 1000, limit_week: 1000 }); const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE email=?').run(P.id, Date.now() + 864e6, u.email ?? t.DB.raw.prepare('SELECT email FROM users ORDER BY id DESC').get().email);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: main.id, text: 'q', bon: true } }));
  assert.deepEqual(ev.find(e => e.bon)?.bon, ['ChatGPT 6.2 Sol', 'Qwen 4 Max']);
  const m = fm.hits.find(h => h.body.model === 'main'); assert.ok(sysOf(m.body).includes('cand-sol') && sysOf(m.body).includes('cand-qwen'));
  fm.close();
});

test('estimate: % of the weekly limit for the next message, with a cheaper suggestion', async () => {
  const t = await makeEnv({ K: 'k' });
  const big = addModel(t.DB, { name: 'Claude Opus 5.5 Eco', base_url: 'http://x', cost_in: 100, cost_out: 500 });
  const sol = addModel(t.DB, { name: 'ChatGPT 6.2 Sol', base_url: 'http://x', cost_in: 1, cost_out: 2 });
  const P = addPlan(t.DB, { models: [big.id, sol.id], limit_week: 20 }); const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE email=?').run(P.id, Date.now() + 864e6, u.email ?? t.DB.raw.prepare('SELECT email FROM users ORDER BY id DESC').get().email);
  const r = await (await t.call(`/api/estimate?model_id=${big.id}&chars=30000`, { cookie: u.cookie })).json();
  assert.ok(r.pct > 1, JSON.stringify(r)); assert.equal(r.alt?.id, sol.id, JSON.stringify(r));
  const s = await (await t.call(`/api/estimate?model_id=${sol.id}&chars=10`, { cookie: u.cookie })).json();
  assert.ok(s.pct < 0.1 && !s.alt);
});

test('model stats: reliability and limit multiple per model', async () => {
  const t = await makeEnv({ K: 'k' });
  const a = addModel(t.DB, { name: 'A', base_url: 'http://x' }), b = addModel(t.DB, { name: 'B', base_url: 'http://x' });
  const ins = t.DB.raw.prepare("INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src) VALUES (5,?,1,1,0,?,1,?,'chat')");
  for (let i = 0; i < 40; i++) { ins.run(a.id, 0.01, Date.now()); ins.run(b.id, 0.05, Date.now()); }
  for (let i = 0; i < 10; i++) t.DB.raw.prepare("INSERT INTO events (kind,model_id,detail,created_at) VALUES ('error',?,'x',?)").run(b.id, Date.now());
  const { modelStatsApi } = await import('../src/context.js');
  const r = await (await modelStatsApi(t.env, null)).json();
  assert.equal(r[a.id].ok, 100); assert.equal(r[a.id].x, 1); assert.equal(r[b.id].ok, 80); assert.equal(r[b.id].x, 5);
  t.DB.raw.exec('CREATE TABLE IF NOT EXISTS agent_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, model TEXT, mode TEXT, rounds INTEGER, tools INTEGER, ok INTEGER, ms INTEGER, charge REAL, pct REAL, error TEXT, version TEXT, os TEXT, created_at INTEGER)');
  for (let i = 0; i < 10; i++) t.DB.raw.prepare('INSERT INTO agent_runs (model,ok,created_at) VALUES (?,?,?)').run('b', i < 3 ? 1 : 0, Date.now());
  const r2 = await (await modelStatsApi(t.env, null)).json();
  assert.equal(r2[b.id].ag, 30); assert.equal(r2[b.id].agn, 10); assert.equal(r2[b.id].ok, 80, 'agent stats merge with reliability');
});

test('compact threshold: 60K for Claude Eco, 120K for others', async () => {
  const { compactAt } = await import('../src/ai.js');
  assert.equal(compactAt({ name: 'Claude Opus 5.5 Eco' }), 60e3);
  assert.equal(compactAt({ name: 'ChatGPT 6.2 Sol' }), 120e3);
});
