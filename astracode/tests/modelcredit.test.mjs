// เครดิตเฉพาะโมเดล: แอดมินเพิ่มให้ · ใช้ได้เฉพาะโมเดลที่เลือก (แม้อยู่นอกแพลน/ไม่มี Wallet) · ไม่หักลิมิต/Wallet · หมด/ยกเลิกแล้วใช้ไม่ได้
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

test('model credit: admin grants it for chosen models; chat and API use it instead of limits/wallet; other models stay locked; revoke stops it', async () => {
  const fm = await fakeModel((req, res) => fm.sse(res, 'สวัสดี')); after(() => fm.close());
  const t = await makeEnv({ K: 'k' }); await t.json('/api/version');
  const opus = addModel(t.DB, { name: 'Opus', base_url: fm.url, cost_in: 10, cost_out: 50 }), cheap = addModel(t.DB, { name: 'Cheap', base_url: fm.url }), other = addModel(t.DB, { name: 'Other', base_url: fm.url });
  const free = addPlan(t.DB, { models: [cheap.id], limit_4h: 1e6, limit_week: 1e6, price: 0 });
  const admin = await t.user({ role: 'admin' }), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, balance=0 WHERE id=?').run(free.id, u.id);
  assert.equal((await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: opus.id } })).status >= 400, true, 'no credit = locked');
  const g = await t.json(`/api/admin/users/${u.id}/model-credits`, { method: 'POST', cookie: admin.cookie, body: { models: [opus.id], amount: 20, days: 7, note: 'ทดลอง Opus' } });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  const me = (await t.json('/api/me', { cookie: u.cookie })).data;
  const mo = me.models.find(m => m.id === opus.id); assert.equal(mo.locked, false); assert.equal(mo.mcredit, 20); assert.equal(me.model_credits[0].names, 'Opus');
  assert.ok(me.models.find(m => m.id === other.id).locked, 'other models stay locked');
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: opus.id } }));
  assert.match(ev.filter(e => e.t).map(e => e.t).join(''), /สวัสดี/);
  const c = (await t.json(`/api/admin/users/${u.id}/model-credits`, { cookie: admin.cookie })).data[0];
  assert.ok(t.DB.raw.prepare('SELECT used FROM model_credits WHERE id=?').get(c.id).used > 0, 'credit was used'); assert.equal(t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance, 0);
  assert.equal(t.DB.raw.prepare('SELECT COALESCE(SUM(units),0) s FROM usage WHERE user_id=?').get(u.id).s, 0, 'no plan limit used');
  // API key: โมเดลที่มีเครดิตขึ้นในรายการและเรียกได้
  const key = (await t.json('/api/keys', { method: 'POST', cookie: u.cookie, body: { name: 'k1' } })).data.key;
  const list = await t.json('/v1/models', { headers: { authorization: 'Bearer ' + key } });
  assert.ok(list.data.data?.some(m => m.id === 'opus'), JSON.stringify(list.data).slice(0, 300) + ' key=' + String(key).slice(0, 12));
  t.DB.raw.exec('DELETE FROM rate');
  const r = await t.call('/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: { model: 'opus', messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(r.status, 200, await r.clone().text());
  await t.json(`/api/admin/users/${u.id}/model-credits/${c.id}`, { method: 'DELETE', cookie: admin.cookie });
  t.DB.raw.exec('DELETE FROM rate');
  assert.equal((await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: opus.id } })).status >= 400, true, 'revoked = locked again');
  fm.close();
});

test('hidden (non-public) test model: usable over /v1 only by accounts that hold a model credit for it', async () => {
  const { sha } = await import('./helpers.mjs');
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok')); after(() => fm.close());
  const t = await makeEnv({ K: 'k' }), hid = addModel(t.DB, { name: 'Secret Agent', base_url: fm.url });
  t.DB.raw.prepare('UPDATE models SET public=0 WHERE id=?').run(hid.id);
  const mk = async u => { const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12); t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now()); return key; };
  const a = await t.user({ balance: 50 }), b = await t.user({ balance: 50 });
  t.DB.raw.exec('CREATE TABLE IF NOT EXISTS model_credits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, models TEXT NOT NULL, amount REAL NOT NULL, used REAL NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, note TEXT, by_user INTEGER, created_at INTEGER NOT NULL)');
  t.DB.raw.prepare('INSERT INTO model_credits (user_id,models,amount,expires_at,created_at) VALUES (?,?,?,?,?)').run(a.id, String(hid.id), 10, Date.now() + 864e5, Date.now());
  const call = async key => (await t.call('/v1/chat/completions', { method: 'POST', body: { model: 'secret-agent', messages: [{ role: 'user', content: 'hi' }] }, headers: { authorization: 'Bearer ' + key } })).status;
  assert.equal(await call(await mk(a)), 200, 'credit holder can use it');
  assert.equal(await call(await mk(b)), 404, 'wallet users cannot see hidden models');
});
