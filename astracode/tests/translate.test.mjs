// แปลชุดข้อความ: JSON array ยาวเท่าเดิม · คลังคำศัพท์อยู่ใน system · ตอบไม่ครบลองใหม่ 1 ครั้ง · หักลิมิต
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel } from './helpers.mjs';
import { parseArr } from '../src/translate.js';

test('translate: parse arrays', () => {
  assert.deepEqual(parseArr('```json\n["a","b"]\n```', 2), ['a', 'b']);
  assert.equal(parseArr('["a"]', 2), null);
});
test('translate: batch translated in order, glossary sent, bad reply retried once, plan charged', async () => {
  let calls = 0;
  const fm = await fakeModel((q, res, body) => { calls++; const inp = JSON.parse(body.messages.at(-1).content); fm.sse(res, calls === 1 ? '["only one"]' : JSON.stringify(inp.map(x => 'EN:' + x))); });
  try {
    const t = await makeEnv({ K: 'k' }); const m = addModel(t.DB, { name: 'M', base_url: fm.url }); const plan = addPlan(t.DB, { price: 100, models: [m.id], limit_4h: 1000, limit_week: 1000 });
    const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e6, u.id);
    const r = await t.json('/api/translate', { method: 'POST', cookie: u.cookie, body: { texts: ['สวัสดี', 'ราคา 100 บาท'], to: 'en', glossary: 'ร้านนก=Nok Shop' } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.deepEqual(r.data.texts, ['EN:สวัสดี', 'EN:ราคา 100 บาท']); assert.equal(calls, 2);
    assert.match(fm.hits[0].body.messages[0].content, /ร้านนก=Nok Shop/); assert.match(fm.hits[0].body.messages[0].content, /into English/);
    assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM usage WHERE src='translate'").get().n, 2);
    assert.equal((await t.json('/api/translate', { method: 'POST', cookie: u.cookie, body: { texts: ['x'], to: 'zz' } })).status, 400);
    assert.equal((await t.json('/api/translate', { method: 'POST', cookie: u.cookie, body: { texts: Array(81).fill('x'), to: 'en' } })).status, 413);
  } finally { fm.close(); }
});
