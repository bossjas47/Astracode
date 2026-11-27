// /v1 ของเสริม: Self-Heal (ลองโมเดลเดิมซ้ำเมื่อคำตอบพัง ไม่คิดเงินรอบที่พัง), Kyber Memory (จำโปรเจกต์ต่อ key), Live Dashboard + เตือนลิมิตพุ่ง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, sha } from './helpers.mjs';
import { healReason } from '../src/apiplus.js';

async function setup(handler, { memory = false } = {}) {
  const fm = await fakeModel((q, res, body) => handler(q, res, body, fm));
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Chat One', base_url: fm.url, cost_in: 1, cost_out: 2 });
  const u = await t.user(), plan = addPlan(t.DB, { name: 'Paid', price: 100, limit_4h: 1000, limit_week: 1000, api_limit: 1, models: [m.id] });
  t.DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  const kid = t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,memory) VALUES (?,?,?,?,?,?) RETURNING id').get(u.id, 'k', await sha(key), key.slice(0, 14), Date.now(), memory ? 1 : null).id;
  const v1 = async body => { const r = await t.call('/v1/chat/completions', { method: 'POST', body, headers: { authorization: 'Bearer ' + key } }); const txt = await r.text(); await Promise.all(t.ctx.pending); let d; try { d = JSON.parse(txt); } catch { d = txt; } return { status: r.status, d, h: r.headers, txt }; };
  return { t, fm, m, u, key, kid, v1 };
}
const sysOf = b => JSON.stringify(b.messages?.filter(x => x.role === 'system') || b.system || '');

test('healReason spots empty answers, broken tool JSON and drift into Chinese', () => {
  assert.equal(healReason({ content: '' }), 'empty');
  assert.equal(healReason({ content: '', reasoning: 'hmm' }), 'empty_after_thinking');
  assert.equal(healReason({ content: '', finish: 'length' }), null);
  assert.equal(healReason({ toolCalls: [{ function: { name: 'x', arguments: '{"a":' } }] }), 'tool_bad_json');
  assert.equal(healReason({ content: '好的，我来帮你修复这个问题。首先我们需要检查配置文件，然后再看看日志输出的内容是否正常，最后确认一下依赖的版本是否正确以及环境变量有没有设置好的问题。', hist: [{ role: 'user', content: 'ช่วยแก้บั๊กนี้หน่อย' }] }), 'wrong_language');
  assert.equal(healReason({ content: '好的，我来帮你修复这个问题。首先我们需要检查配置文件，然后再看看日志输出的内容是否正常，最后确认一下依赖的版本是否正确以及环境变量有没有设置好的问题。', hist: [{ role: 'user', content: '帮我修复' }] }), null, 'user wrote Chinese');
  assert.equal(healReason({ content: 'ok fine' }), null);
});

test('Self-Heal (non-stream): an empty answer is retried on the same model, the broken try is not billed', async () => {
  let n = 0;
  const { t, v1, m } = await setup((q, res, b, fm) => { n++; fm.sse(res, n === 1 ? '' : 'fixed answer'); });
  const r = await v1({ model: 'chat-one', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.status, 200); assert.equal(r.d.choices[0].message.content, 'fixed answer');
  assert.equal(r.d.kyber_heal.retries, 1); assert.equal(r.h.get('x-kyber-heal'), '1'); assert.equal(n, 2);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM usage WHERE model_id=? AND units>0').get(m.id).n, 1, 'only the good answer counts');
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE kind='heal'").get().n, 1);
});

test('Self-Heal (stream): an upstream error before any output is retried on the same model', async () => {
  let n = 0;
  const { v1 } = await setup((q, res, b, fm) => { n++; if (n === 1) { res.writeHead(500); return res.end('boom'); } fm.sse(res, 'stream ok'); });
  const r = await v1({ model: 'chat-one', stream: true, messages: [{ role: 'user', content: 'hi' }] });
  assert.match(r.txt, /stream ok/); assert.equal(n, 2);
});

test('Kyber Memory: off by default; on a key it learns the project and adds notes to later requests', async () => {
  const sys = 'You are Claude Code.\nWorking directory: /home/me/shop-app\n';
  const off = await setup((q, res, b, fm) => fm.sse(res, 'ok'));
  for (let i = 0; i < 4; i++) await off.v1({ model: 'chat-one', messages: [{ role: 'system', content: sys }, { role: 'user', content: 'q' + i }] });
  assert.ok(off.fm.hits.every(h => !sysOf(h.body).includes('kyber_memory')), 'off by default');
  const on = await setup((q, res, b, fm) => fm.sse(res, /maintain short project notes/.test(sysOf(b)) ? '- Shop app in Next.js, cart bug fixed in cart.ts' : 'ok'), { memory: true });
  for (let i = 0; i < 3; i++) await on.v1({ model: 'chat-one', messages: [{ role: 'system', content: sys }, { role: 'user', content: 'q' + i }] });
  const row = on.t.DB.raw.prepare('SELECT name,summary,reqs FROM key_memory WHERE key_id=?').get(on.kid);
  assert.equal(row.name, 'shop-app'); assert.match(row.summary, /cart bug/); assert.equal(row.reqs, 3);
  await on.v1({ model: 'chat-one', messages: [{ role: 'system', content: sys }, { role: 'user', content: 'next' }] });
  assert.match(sysOf(on.fm.hits.at(-1).body), /kyber_memory[\s\S]*cart bug/);
  // ดู/ล้างผ่านหน้าเว็บ
  const view = await on.t.json(`/api/keys/${on.kid}/memory`, { cookie: on.u.cookie }); assert.equal(view.data.length, 1);
  await on.t.json(`/api/keys/${on.kid}/memory`, { method: 'DELETE', cookie: on.u.cookie });
  assert.equal(on.t.DB.raw.prepare('SELECT COUNT(*) n FROM key_memory').get().n, 0);
  // เปิด/ปิดต่อ key โดยไม่ล้างค่าอื่น
  on.t.DB.raw.prepare('UPDATE api_keys SET budget=5 WHERE id=?').run(on.kid);
  await on.t.json(`/api/keys/${on.kid}`, { method: 'PUT', cookie: on.u.cookie, body: { memory: false } });
  const k = on.t.DB.raw.prepare('SELECT memory,budget FROM api_keys WHERE id=?').get(on.kid); assert.equal(k.memory, null); assert.equal(k.budget, 5);
});

test('Live Dashboard: per-key stats, % of the weekly limit and a hot flag when one hour burns over 20%', async () => {
  const { t, u, kid, v1 } = await setup((q, res, b, fm) => fm.sse(res, 'ok'));
  await v1({ model: 'chat-one', messages: [{ role: 'user', content: 'hi' }] });
  let d = (await t.json('/api/keys/live', { cookie: u.cookie })).data;
  assert.equal(d.keys[0].n1, 1); assert.equal(d.hourly.length, 24); assert.equal(d.keys[0].hot, false);
  t.DB.raw.prepare("INSERT INTO api_log (key_id,user_id,path,model,status,tin,tout,charge,units,ms,created_at) VALUES (?,?,?,?,200,150000,100,0,?,1000,?)").run(kid, u.id, '/v1/chat/completions', 'chat-one', 250, Date.now());
  d = (await t.json('/api/keys/live', { cookie: u.cookie })).data;
  assert.equal(d.keys[0].hot, true); assert.ok(d.keys[0].pct1 >= 25); assert.equal(d.keys[0].models[0].model, 'chat-one');
});

test('bug report: text + screenshot + device info become a support ticket with the image visible to staff', async () => {
  const t = await makeEnv({ K: 'k', SLIPS: { m: new Map(), async put(k, v) { this.m.set(k, v); }, async get(k) { const v = this.m.get(k); return v ? { body: v } : null; } } });
  const u = await t.user(), adm = await t.user({ role: 'admin' });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await t.json('/api/bugreport', { method: 'POST', cookie: u.cookie, body: { text: '' } })).status, 400);
  const r = await t.json('/api/bugreport', { method: 'POST', cookie: u.cookie, body: { text: 'ตัวหนังสือดำบนดำ\nหน้า Code', images: [png], meta: { url: '/code?p=1', app: 'เว็บ', theme: 'light', errors: ['API GET /me → 500'] } } });
  assert.equal(r.status, 200);
  const tk = t.DB.raw.prepare('SELECT subject FROM tickets WHERE id=?').get(r.data.id); assert.match(tk.subject, /^🐞 ตัวหนังสือดำบนดำ/);
  const body = t.DB.raw.prepare('SELECT body FROM ticket_msgs WHERE ticket_id=?').get(r.data.id).body;
  assert.match(body, /หน้า: \/code\?p=1/); assert.match(body, /API GET \/me → 500/);
  const img = body.match(/\/api\/img\/\d+\/bug-[\w-]+\.png/)[0];
  assert.equal((await t.call(img, { cookie: adm.cookie })).status, 200, 'staff can open the screenshot');
  const other = await t.user(); assert.equal((await t.call(img, { cookie: other.cookie })).status, 404, 'other users cannot');
});

test('stripZW: ลบลายน้ำอักษรล่องหน แต่อีโมจิครอบครัวยังอยู่', async () => {
  const { stripZW } = await import('../src/ai.js');
  assert.equal(stripZW('ok‍‍‌⁠‌‌‍‌​​‌‌'), 'ok');
  assert.equal(stripZW('def a():​\n  return 1⁠'), 'def a():\n  return 1');
  assert.equal(stripZW('👨‍👩‍👧'), '👨‍👩‍👧');
  assert.equal(stripZW('ไม่มีอะไร'), 'ไม่มีอะไร');
});
