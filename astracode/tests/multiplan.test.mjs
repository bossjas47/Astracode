// หลายแพลนต่อบัญชี: ย้ายแพลนเดิมเป็นใบแรก · ซื้อ = ใบใหม่ลิมิตแยก · หักจากใบหลัก เต็มแล้วสลับใบ · โมเดลที่มีเฉพาะบางใบหักจากใบนั้น · ฟีเจอร์รวมทุกใบ · ต่ออายุใบเดียว · ปิดสวิตช์ = แบบเดิม
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';
import { planOf, usageStatus, resetMultiCache } from '../src/core.js';

const DAY = 864e5;
async function setup({ multi = true } = {}) {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok', { prompt_tokens: 1000, completion_tokens: 100 }));
  const t = await makeEnv({ K: 'k' }); resetMultiCache();
  const a = addModel(t.DB, { name: 'A', base_url: fm.url }), b = addModel(t.DB, { name: 'B', base_url: fm.url });
  t.DB.raw.prepare('UPDATE models SET cost_in=1000, cost_out=1000 WHERE id IN (?,?)').run(a.id, b.id); // ทุกข้อความหักลิมิตชัดเจน
  const plus = addPlan(t.DB, { name: 'Plus', price: 100, models: [a.id], limit_4h: 100, limit_week: 100 });
  const pro = addPlan(t.DB, { name: 'Pro', price: 300, models: [a.id, b.id], limit_4h: 100, limit_week: 100 });
  t.DB.raw.prepare('UPDATE plans SET agent=1 WHERE id=?').run(pro.id);
  if (multi) t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('multi_plan','1')").run();
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET balance=10000 WHERE id=?').run(u.id);
  const buy = async (plan, extra = {}) => { const fd = new FormData(); fd.append('kind', 'plan'); fd.append('plan_id', String(plan.id)); fd.append('wallet', '1'); for (const [k, v] of Object.entries(extra)) fd.append(k, String(v)); const r = await t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', headers: { cookie: u.cookie }, body: fd }), t.env, t.ctx); return r.json(); };
  const chat = async (model, extra = {}) => readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: model.id, ephemeral: true, ...extra } }));
  const row = () => t.DB.raw.prepare('SELECT * FROM users WHERE id=?').get(u.id);
  const subs = () => t.DB.raw.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY id").all(u.id);
  const lastUse = () => t.DB.raw.prepare('SELECT * FROM usage WHERE user_id=? ORDER BY id DESC').get(u.id);
  return { t, fm, a, b, plus, pro, u, buy, chat, row, subs, lastUse };
}

test('multi-plan: the old plan becomes slot 1 with its usage; buying adds a separate slot; users.plan_* mirrors the primary', async () => {
  const S = await setup(), now = Date.now();
  S.t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=?, sess_start=?, week_start=? WHERE id=?').run(S.plus.id, now + 10 * DAY, now - 1000, now - 1000, S.u.id);
  S.t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,40,1,?)').run(S.u.id, S.a.id, now - 500); // ใช้ไปแล้ว 40% (ก่อนมีหลายใบ)
  const p1 = await planOf(S.t.env, S.row());
  assert.equal(S.subs().length, 1, 'migrated'); assert.equal(S.subs()[0].legacy, 1); assert.equal(S.subs()[0].expires_at, now + 10 * DAY);
  assert.equal((await usageStatus(S.t.env, S.row(), p1)).pctWeek, 40, 'old usage still counts on the migrated slot');
  assert.equal((await S.buy(S.plus)).ok, true);
  const s = S.subs(); assert.equal(s.length, 2, 'second Plus = new slot, not more days'); assert.equal(s[0].expires_at, now + 10 * DAY);
  assert.ok(Math.abs(s[1].expires_at - (Date.now() + 30 * DAY)) < 5000);
  assert.equal(S.row().plan_expires, now + 10 * DAY, 'mirror stays on the primary slot'); assert.equal(S.row().primary_sub_id, s[0].id);
  const p2 = await planOf(S.t.env, S.row()); assert.equal(p2._subs.length, 2);
  const st2 = await usageStatus(S.t.env, S.row(), { ...p2, _sub: { sid: s[1].id } }); assert.equal(st2.pctWeek, 0, 'the new slot has its own limit');
  S.fm.close();
});

test('multi-plan: charges the primary slot, falls through to the next when full, uses the slot that has the model, and the slot the user picked', async () => {
  const S = await setup();
  await S.buy(S.plus); await S.buy(S.pro);
  const [plusSub, proSub] = S.subs();
  await S.chat(S.a); assert.equal(S.lastUse().sub_id, plusSub.id, 'primary (first bought) is charged first');
  S.t.DB.raw.prepare('UPDATE subscriptions SET week_start=?, sess_start=? WHERE id=?').run(Date.now() - 1000, Date.now() - 1000, plusSub.id);
  S.t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,sub_id) VALUES (?,?,0,0,0,1000,1,?,?)').run(S.u.id, S.a.id, Date.now(), plusSub.id); // Plus เต็ม
  await S.chat(S.a); assert.equal(S.lastUse().sub_id, proSub.id, 'Plus full → Pro');
  S.t.DB.raw.prepare('DELETE FROM usage WHERE units=1000').run();
  await S.chat(S.b); assert.equal(S.lastUse().sub_id, proSub.id, 'model only in Pro → Pro even though Plus is primary');
  await S.chat(S.a, { sub_id: proSub.id }); assert.equal(S.lastUse().sub_id, proSub.id, 'user picked Pro');
  const p = await planOf(S.t.env, S.row()); assert.ok(p.agent, 'features are the union of all slots'); assert.deepEqual(p._planIds.sort(), [S.plus.id, S.pro.id].sort());
  const me = (await S.t.json('/api/me', { cookie: S.u.cookie })).data; assert.ok(me.models.some(m => m.id === S.b.id), 'models of every slot are listed');
  S.fm.close();
});

test('multi-plan: "renew this slot" extends only that slot; switch off = old behaviour (buying the same plan adds days)', async () => {
  const S = await setup(); await S.buy(S.plus); await S.buy(S.plus);
  const [s1, s2] = S.subs(); await S.buy(S.plus, { sub_id: s2.id }); await S.buy(S.plus, { sub_id: s1.id }); // ต่ออายุทั้งใบรองและใบหลัก
  const after = S.subs(); assert.equal(after.length, 2, 'renewal is not a new slot'); assert.equal(after[1].expires_at, s2.expires_at + 30 * DAY); assert.equal(after[0].expires_at, s1.expires_at + 30 * DAY, 'renewing the primary slot sticks'); assert.equal(S.row().plan_expires, s1.expires_at + 30 * DAY);
  S.fm.close();
  const O = await setup({ multi: false }); await O.buy(O.plus); const e1 = O.row().plan_expires; await O.buy(O.plus);
  assert.ok(Math.abs(O.row().plan_expires - (e1 + 30 * DAY)) < 5000); assert.equal(O.subs().length, 0, 'switch off: no slots are created');
  O.fm.close();
});

test('multi-plan: an admin edit of users.plan_* moves the primary slot; the next slot becomes primary when it expires', async () => {
  const S = await setup(); await S.buy(S.plus); await S.buy(S.pro);
  const [s1, s2] = S.subs(), far = Date.now() + 90 * DAY;
  S.t.DB.raw.prepare('UPDATE users SET plan_expires=? WHERE id=?').run(far, S.u.id); await planOf(S.t.env, S.row());
  assert.equal(S.t.DB.raw.prepare('SELECT expires_at FROM subscriptions WHERE id=?').get(s1.id).expires_at, far);
  S.t.DB.raw.prepare('UPDATE subscriptions SET expires_at=? WHERE id=?').run(Date.now() - 1, s1.id); S.t.DB.raw.prepare('UPDATE users SET plan_expires=? WHERE id=?').run(Date.now() - 1, S.u.id);
  const p = await planOf(S.t.env, S.row()); assert.equal(p._sub.sid, s2.id); assert.equal(S.row().primary_sub_id, s2.id); assert.equal(S.row().plan_id, S.pro.id);
  S.fm.close();
});

test('multi-plan: an API key on the plan limit uses the primary slot, then the next one when it is full', async () => {
  const { sha } = await import('../src/core.js');
  const S = await setup(); S.t.DB.raw.prepare('UPDATE plans SET api_limit=1').run(); await S.buy(S.plus); await S.buy(S.plus);
  const [s1, s2] = S.subs(), key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  S.t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(S.u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const call = async () => { const r = await S.t.call('/v1/chat/completions', { method: 'POST', body: { model: 'a', messages: [{ role: 'user', content: 'hi' }] }, headers: { authorization: 'Bearer ' + key } }); await r.text(); await Promise.all(S.t.ctx.pending); return r.status; };
  assert.equal(await call(), 200); assert.equal(S.lastUse().sub_id, s1.id);
  S.t.DB.raw.prepare('UPDATE subscriptions SET week_start=?, sess_start=? WHERE id=?').run(Date.now() - 1000, Date.now() - 1000, s1.id);
  S.t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,sub_id) VALUES (?,?,0,0,0,1000,1,?,?)').run(S.u.id, S.a.id, Date.now(), s1.id);
  assert.equal(await call(), 200); assert.equal(S.lastUse().sub_id, s2.id, 'slot 1 full → slot 2');
  S.fm.close();
});

test('multi-plan UI data: /api/me lists every slot with its own limits; set primary and per-slot auto-renew; someone else\'s slot is refused', async () => {
  const S = await setup(); await S.buy(S.plus); await S.buy(S.pro);
  const [s1, s2] = S.subs();
  const me = (await S.t.json('/api/me', { cookie: S.u.cookie })).data;
  assert.equal(me.subs.length, 2); assert.deepEqual(me.subs.map(x => x.name), ['Plus', 'Pro']); assert.equal(me.subs[0].primary, true); assert.equal(me.subs[1].pctWeek, 0);
  assert.equal((await S.t.json(`/api/subs/${s2.id}/primary`, { method: 'POST', cookie: S.u.cookie })).status, 200);
  assert.equal(S.row().primary_sub_id, s2.id); assert.equal(S.row().plan_id, S.pro.id, 'mirror follows the new primary');
  assert.equal((await S.t.json(`/api/subs/${s1.id}/renew`, { method: 'POST', cookie: S.u.cookie, body: { on: true } })).status, 200);
  assert.equal(S.t.DB.raw.prepare('SELECT auto_renew FROM subscriptions WHERE id=?').get(s1.id).auto_renew, 1);
  const other = await S.t.user(); assert.equal((await S.t.json(`/api/subs/${s1.id}/primary`, { method: 'POST', cookie: other.cookie })).status, 404);
  const one = await setup(); await one.buy(one.plus); assert.equal((await one.t.json('/api/me', { cookie: one.u.cookie })).data.subs.length, 1);
  S.fm.close(); one.fm.close();
});

test('multi-plan admin: per-slot auto-renew charges once; refund ends only that slot; admin extend/end a slot keeps the mirror right', async () => {
  const { cron } = await import('../src/jobs.js');
  const S = await setup(); await S.buy(S.plus); await S.buy(S.pro);
  let [s1, s2] = S.subs(); const soon = Date.now() + 3600e3;
  S.t.DB.raw.prepare('UPDATE subscriptions SET expires_at=?, auto_renew=1 WHERE id=?').run(soon, s2.id);
  const bal0 = S.row().balance; await cron(S.t.env); await cron(S.t.env);
  assert.equal(S.t.DB.raw.prepare('SELECT expires_at FROM subscriptions WHERE id=?').get(s2.id).expires_at, soon + 30 * DAY, 'renewed once even if the job runs twice');
  assert.equal(S.row().balance, bal0 - 300); assert.ok(S.t.DB.raw.prepare("SELECT 1 FROM payments WHERE sub_id=? AND slip_key='wallet'").get(s2.id));
  // คืนเงินรายการที่ซื้อ Pro → ปิดเฉพาะใบ Pro · Plus ยังใช้ได้
  const adm = await S.t.user({ role: 'admin' }); const pay = S.t.DB.raw.prepare('SELECT id FROM payments WHERE id=(SELECT payment_id FROM subscriptions WHERE id=?)').get(s2.id);
  assert.equal((await S.t.json(`/api/admin/payments/${pay.id}/refund`, { method: 'POST', cookie: adm.cookie, body: {} })).status, 200);
  [s1, s2] = S.subs(); assert.equal(s2.status, 'refunded'); assert.equal(s1.status, 'active'); assert.ok(S.row().plan_expires > Date.now(), 'Plus still active');
  // แอดมินเพิ่มวัน / ปิดใบ
  assert.equal((await S.t.json(`/api/admin/subs/${s1.id}`, { method: 'POST', cookie: adm.cookie, body: { action: 'extend', days: 10 } })).status, 200);
  assert.equal(S.subs()[0].expires_at, s1.expires_at + 10 * DAY); assert.equal(S.row().plan_expires, s1.expires_at + 10 * DAY, 'mirror follows');
  assert.equal((await S.t.json(`/api/admin/subs/${s1.id}`, { method: 'POST', cookie: adm.cookie, body: { action: 'end' } })).status, 200);
  assert.ok(S.row().plan_expires <= Date.now(), 'no slots left → no plan');
  const det = (await S.t.json('/api/admin/users/' + S.u.id, { cookie: adm.cookie })).data; assert.equal(det.subs.length, 2);
  S.t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(S.plus.id, Date.now() + 5 * DAY, S.u.id); // แอดมินให้แพลนแบบเดิมหลังใบหมดทุกใบ
  const g = await planOf(S.t.env, S.row()); assert.equal(g._sub.legacy, 0, 'adopted as a fresh slot (old usage not counted)'); assert.equal(g.name, 'Plus');
  assert.equal((await S.t.json(`/api/admin/subs/${s1.id}`, { method: 'POST', cookie: S.u.cookie, body: { action: 'extend', days: 10 } })).status, 403, 'users cannot use admin routes');
  S.fm.close();
});

test('feature trial: Harness and Agent open for paid plans until open_until (all paid or listed plans), never for free plans; off after the date', async () => {
  const run = async ({ until, plans = '', planKey = 'plus', price }) => {
    const S = await setup({ multi: false }), now = Date.now(), set = (k, v) => S.t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
    set('open_until', String(now + until)); set('open_features', 'cowork,agent'); set('open_plans', plans === 'plus' ? String(S.plus.id) : plans === 'pro' ? String(S.pro.id) : '');
    if (price != null) S.t.DB.raw.prepare('UPDATE plans SET price=? WHERE id=?').run(price, S[planKey].id);
    S.t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(S[planKey].id, now + 10 * DAY, S.u.id);
    const p = (await S.t.json('/api/me', { cookie: S.u.cookie })).data.plan; S.fm.close(); return p;
  };
  const on = await run({ until: DAY }); assert.equal(on.cowork, true); assert.equal(on.agent, true); assert.deepEqual(on.open.feats.sort(), ['agent', 'cowork']);
  const off = await run({ until: -1000 }); assert.equal(off.cowork, false); assert.equal(off.agent, false); assert.equal(off.open, null);
  assert.equal((await run({ until: DAY, plans: 'plus' })).cowork, true);
  assert.equal((await run({ until: DAY, plans: 'pro' })).cowork, false, 'only listed plans');
  assert.equal((await run({ until: DAY, price: 0 })).cowork, false, 'free plan never');
});
