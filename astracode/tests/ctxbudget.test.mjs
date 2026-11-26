// ประหยัดลิมิต: ไฟล์ในข้อความเก่าส่งเฉพาะท่อนที่เกี่ยว · ไฟล์ในข้อความปัจจุบันส่งเต็ม · Claude Eco ผ่าน API ย่อผลเครื่องมือเก่าเร็วกว่า
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE, sha } from './helpers.mjs';

test('chat: a big file attached earlier is sent only as relevant excerpts later; the file attached now is sent whole', async () => {
  let sent = null;
  const fm = await fakeModel((q, res, body) => { sent = body; fm.sse(res, 'ok'); });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Chat', base_url: fm.url, ctx_k: 1050 });
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 }), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const cid = t.DB.raw.prepare("INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id").get(u.id, 'doc', Date.now()).id;
  const oldDoc = Array.from({ length: 60 }, (_, i) => `section ${i}: ` + (i === 37 ? 'the refund policy is 30 days for unopened boxes. ' : 'general text about shipping and stock levels. ').repeat(40)).join('\n');
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)").run(cid, 'user', 'อ่านไฟล์นี้\n\n[[file:policy.txt]]\n' + oldDoc + '\n[[/file]]', Date.now() - 2000);
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)").run(cid, 'assistant', 'อ่านแล้ว', Date.now() - 1000);
  const nowDoc = 'new file line. '.repeat(8000); // ~120K ตัวอักษร
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { chat_id: cid, model_id: m.id, text: 'what is the refund policy for unopened boxes', files: [{ name: 'new.txt', text: nowDoc }] } }));
  const users = sent.messages.filter(x => x.role === 'user').map(x => typeof x.content === 'string' ? x.content : x.content.map(p => p.text || '').join(''));
  const old = users.find(x => x.includes('policy.txt')), cur = users.at(-1);
  assert.ok(old.length < 40000, 'old file trimmed to excerpts: ' + old.length); assert.match(old, /refund policy is 30 days/, 'the relevant part is kept');
  assert.ok(cur.includes(nowDoc), 'current file whole');
  fm.close();
});

test('/v1 with a Claude Eco model trims old tool results from ~60K tokens; other models keep the 150K threshold', async () => {
  let sent = null;
  const fm = await fakeModel((q, res, body) => { sent = body; fm.sse(res, 'ok'); });
  const t = await makeEnv({ K: 'k' }), eco = addModel(t.DB, { name: 'Claude Sonnet 5.5 Eco', base_url: fm.url }), other = addModel(t.DB, { name: 'Other One', base_url: fm.url });
  const u = await t.user({ balance: 1000 }), key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const big = 'x'.repeat(30000), messages = [{ role: 'user', content: 'go' }];
  for (let i = 0; i < 10; i++) messages.push({ role: 'assistant', content: '', tool_calls: [{ id: 'c' + i, type: 'function', function: { name: 'read', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c' + i, content: big });
  messages.push({ role: 'user', content: 'next' });
  const call = async model => { const r = await t.call('/v1/chat/completions', { method: 'POST', body: { model, messages }, headers: { authorization: 'Bearer ' + key } }); await r.text(); await Promise.all(t.ctx.pending); return sent.messages.filter(x => x.role === 'tool'); };
  const e = await call('claude-sonnet-5.5-eco'); assert.ok(e[0].content.startsWith('[old]'), 'eco: trimmed at ~300K chars');
  const o = await call('other-one'); assert.equal(o[0].content, big, 'other model: not trimmed below the normal threshold');
  fm.close();
});
