import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

test('worker loads and serves public settings', async () => {
  const t = await makeEnv();
  const r = await t.json('/api/settings/public');
  assert.equal(r.status, 200);
});

test('chat: streams a reply, saves it, logs usage', async () => {
  const fm = await fakeModel((req, res) => fm.sse(res, 'สวัสดีครับ'));
  const t = await makeEnv({ K: 'key' });
  const m = addModel(t.DB, { name: 'M1', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [m.id], price: 0 });
  const u = await t.user({});
  t.DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const res = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'hi' } });
  assert.equal(res.status, 200);
  const ev = await readSSE(res); await Promise.all(t.ctx.pending);
  assert.ok(ev.some(e => e.t === 'สวัสดีครับ'), JSON.stringify(ev));
  assert.ok(ev.at(-1).done);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM messages WHERE role='assistant'").get().n, 1);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM usage').get().n, 1);
  fm.close();
});
