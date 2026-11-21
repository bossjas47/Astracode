// ระบบดึงลูกค้า: เทมเพลต Workspace, งานตามเวลา, ส่วนลดต่ออายุ, โปรเติม Wallet แถม %
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel } from './helpers.mjs';

async function paidUser(t, price = 299, models = []) {
  const p = addPlan(t.DB, { models, limit_4h: 1e6, limit_week: 1e6, price }), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(p.id, Date.now() + 864e5, u.id); return { u, p };
}

test('workspace template: folder is created with starter instructions and the list says so', async () => {
  const t = await makeEnv(), u = await t.user();
  const f = await t.json('/api/folders', { method: 'POST', cookie: u.cookie, body: { name: 'ครู', instructions: 'คุณคือผู้ช่วยครู' } });
  assert.equal(f.status, 200);
  const list = (await t.json('/api/folders', { cookie: u.cookie })).data;
  assert.equal(list[0].has_ins, 1); assert.equal(list[0].has_files, 0);
});

test('scheduled tasks: paid only, max 3, due() by Thai hour/day, run now saves a chat', async () => {
  let fm; fm = await fakeModel((req, res) => fm.sse(res, 'ข่าววันนี้ 5 ข้อ'));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  await t.json('/api/version');
  const free = await t.user();
  assert.equal((await t.json('/api/schedules', { method: 'POST', cookie: free.cookie, body: { title: 'x', prompt: 'y', hour: 8, model_id: m.id } })).status, 403);
  const { u } = await paidUser(t, 299, [m.id]);
  const body = { title: 'สรุปข่าว', prompt: 'สรุปข่าว', hour: 8, days: 'daily', model_id: m.id, search: false };
  const s = (await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body })).data;
  for (let i = 0; i < 2; i++) await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body });
  assert.equal((await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body })).status, 403, 'max 3');
  assert.equal((await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body: { ...body, hour: 30 } })).status, 400);

  const { due } = await import('../src/schedules.js');
  const at = (h, wd) => { const d = new Date(Date.UTC(2026, 10, 22 + ((wd - 0 + 7) % 7), h - 7)); return d.getTime(); }; // 22 พ.ย. 2026 = อาทิตย์
  assert.ok(due({ active: 1, hour: 8, days: 'daily' }, at(8, 0)));
  assert.ok(!due({ active: 1, hour: 8, days: 'daily' }, at(9, 0)));
  assert.ok(!due({ active: 1, hour: 8, days: 'weekdays' }, at(8, 0)), 'Sunday is not a weekday');
  assert.ok(due({ active: 1, hour: 8, days: 'mon' }, at(8, 1)));
  assert.ok(!due({ active: 1, hour: 8, days: 'daily', last_run: at(8, 0) - 3600e3 }, at(8, 0)), 'already ran within 20h');

  const r = (await t.json(`/api/schedules/${s.id}/run`, { method: 'POST', cookie: u.cookie })).data;
  assert.equal(r.status, 'ok'); assert.ok(r.chat_id);
  const msgs = t.DB.raw.prepare('SELECT role,content FROM messages WHERE chat_id=? ORDER BY id').all(r.chat_id);
  assert.match(msgs[0].content, /งานตามเวลา: สรุปข่าว/); assert.match(msgs.at(-1).content, /ข่าววันนี้/);
  assert.match(t.DB.raw.prepare('SELECT title FROM chats WHERE id=?').get(r.chat_id).title, /⏰ สรุปข่าว/);
  assert.equal((await t.json(`/api/schedules/${s.id}/run`, { method: 'POST', cookie: u.cookie })).status, 429, 'no rapid re-runs');
  const { u: other } = await paidUser(t, 299, [m.id]); assert.equal((await t.json(`/api/schedules/${s.id}`, { method: 'DELETE', cookie: other.cookie })).status, 404, 'cannot touch others\' tasks');
});

test('renew reminder: paid plan without auto-renew gets a one-use 10% code; topup promo adds 10% once', async () => {
  const { cron } = await import('../src/jobs.js'), { applyPayment, TOPUP_PROMO } = await import('../src/billing.js');
  const t = await makeEnv(), { u } = await paidUser(t, 749);
  t.DB.raw.prepare('UPDATE users SET plan_expires=? WHERE id=?').run(Date.now() + 2 * 864e5, u.id);
  await cron(t.env);
  const c = t.DB.raw.prepare("SELECT * FROM coupons WHERE code LIKE 'RENEW%'").get();
  assert.ok(c); assert.equal(c.kind, 'percent'); assert.equal(c.value, 10); assert.equal(c.max_uses, 1);
  await cron(t.env); assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM coupons WHERE code LIKE 'RENEW%'").get().n, 1, 'one reminder per expiry');

  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
  const p = { id: 77, user_id: u.id, kind: 'topup', amount: 500, slip_key: 'slip/x', created_at: TOPUP_PROMO.start + 1000 };
  await applyPayment(t.env, p); assert.equal(bal(), 550, '500 + 10%');
  await applyPayment(t.env, p); assert.equal(bal(), 1050, 'same payment does not get a second bonus');
  await applyPayment(t.env, { ...p, id: 78, amount: 200 }); assert.equal(bal(), 1250, 'under ฿300: no bonus');
  await applyPayment(t.env, { ...p, id: 79, created_at: TOPUP_PROMO.end + 1 }); assert.equal(bal(), 1750, 'after the promo: no bonus');
});
