// ส่วนที่ทำให้ AI ทำงานได้เต็มความสามารถ: Auto เลือกตัวเก่งเมื่อควร, จำรูปที่แนบ, แจ้งปัญหาต้นทาง, /v1 ไม่โชว์โมเดลที่ไม่มีคีย์
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE, sha } from './helpers.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Auto picks the strong model for Code mode and build/creative requests, the cheap one for small talk', async () => {
  const t = await makeEnv({ K: 'k' });
  const cheap = addModel(t.DB, { name: 'Cheap', base_url: 'http://x' }), strong = addModel(t.DB, { name: 'Strong', base_url: 'http://x' });
  t.DB.raw.prepare('UPDATE models SET multiplier=? WHERE id=?').run(1, cheap.id); t.DB.raw.prepare('UPDATE models SET multiplier=? WHERE id=?').run(5, strong.id);
  const plan = addPlan(t.DB, { models: [cheap.id, strong.id] }), u = await t.user();
  const { autoModel } = await import('../src/ai.js');
  const pick = (text, o = {}) => autoModel(t.env, plan, u, { text, images: [], files: [], effort: null, regenerate: false, ...o });
  assert.equal(await pick('สวัสดี วันนี้อากาศดีไหม'), cheap.id);
  assert.equal(await pick('สวัสดี', { code: true }), strong.id, 'Code mode');
  assert.equal(await pick('ทำเกม 3D เมืองยามค่ำคืนให้หน่อย'), strong.id, 'build request');
  assert.equal(await pick('make a landing page'), strong.id);
});

test('images attached in an earlier message are sent to the model again in the next message (vision models)', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Vision', base_url: fm.url });
  t.DB.raw.prepare('UPDATE models SET vision=1 WHERE id=?').run(m.id);
  addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user({ balance: 100 });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'รูปนี้คืออะไร', images: [PNG] } }));
  const cid = ev.find(e => e.chat_id)?.chat_id; assert.ok(cid, JSON.stringify(ev).slice(0, 200));
  const saved = t.DB.raw.prepare("SELECT content FROM messages WHERE chat_id=? AND role='user'").get(cid).content;
  assert.match(saved, /!\[รูปที่แนบ\]\(\/api\/img\/\d+\/[\w-]+\.png\)/, 'image stored and referenced');
  t.DB.raw.exec('DELETE FROM rate');
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { chat_id: cid, model_id: m.id, text: 'แล้วสีอะไร' } }));
  const body = JSON.stringify(fm.hits.at(-1).body);
  assert.ok(body.includes('data:image/png;base64,iVBORw0KGgo'), 'earlier image re-sent');
  assert.ok(!body.includes('/api/img/'), 'no raw image path leaked to the model');
  const own = (await t.call(saved.match(/\/api\/img\/[^)]+/)[0], { cookie: u.cookie })); assert.equal(own.status, 200);
  fm.close();
});

test('upstream problems are classified and re-alerted every 6h; /v1/models hides models without a Worker key', async () => {
  const { supplyIssue } = await import('../src/billing.js');
  assert.equal(supplyIssue('api: missing key OPENAI_KEY').type, 'nokey');
  assert.equal(supplyIssue('upstream 403: {"code":"INSUFFICIENT_BALANCE"}').type, 'credit');
  assert.equal(supplyIssue('upstream 402: insufficient_credit').type, 'credit');
  assert.equal(supplyIssue('upstream 403: {"code":"GROUP_DISABLED"}').type, 'channel');
  assert.equal(supplyIssue('This Channel is currently disabled').type, 'channel');
  assert.equal(supplyIssue('โมเดลไม่ตอบภายใน 90 วินาที'), null);
  const t = await makeEnv({ K: 'k' }), u = await t.user({ balance: 10 });
  addModel(t.DB, { name: 'Has Key', base_url: 'http://x', key_name: 'K' }); addModel(t.DB, { name: 'No Key', base_url: 'http://x', key_name: 'MISSING_KEY' });
  const key = 'sk-astra-' + 'ef'.repeat(24);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const r = await t.worker.default.fetch(new Request('https://t.test/v1/models', { headers: { authorization: 'Bearer ' + key } }), t.env, t.ctx);
  const ids = (await r.json()).data.map(x => x.id);
  assert.ok(ids.includes('has-key')); assert.ok(!ids.includes('no-key'), ids.join());
  const { event } = await import('../src/billing.js'), sent = [], real = globalThis.fetch; // นับข้อความแจ้งเตือนที่ส่งออก (Discord)
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('alert_discord','https://discord.test/hook')").run();
  globalThis.fetch = async (url, o) => { if (String(url).includes('discord.test')) { sent.push(JSON.parse(o.body).content); return new Response('{}'); } return real(url, o); };
  try {
    for (let i = 0; i < 3; i++) await event(t.env, 'error', 7, 'upstream 403: {"code":"INSUFFICIENT_BALANCE"}');
    assert.equal(sent.length, 1, 'alerted once, not on every error'); assert.match(sent[0], /เงิน\/เครดิตที่ผู้ขายต้นทางหมด/);
    t.DB.raw.prepare("UPDATE rate SET reset=1 WHERE key LIKE 'supply:%'").run(); // ผ่านไป 6 ชม.
    t.DB.raw.prepare("UPDATE events SET created_at=created_at-3600e3").run();
    await event(t.env, 'error', 7, 'upstream 403: {"code":"INSUFFICIENT_BALANCE"}');
    assert.equal(sent.length, 2, 'still broken after 6h: alerted again');
  } finally { globalThis.fetch = real; }
});

test('plain chat code: a build request gets the plan-first prompt, and a long code answer gets one automatic bug re-read', async () => {
  const seen = []; const longCode = '```python\n' + Array.from({ length: 90 }, (_, i) => `x${i} = ${i}`).join('\n') + '\n```';
  const fm = await fakeModel((q, res, body) => { seen.push(body); fm.sse(res, seen.length === 1 ? 'แผน: ...\n' + longCode : '✓ ตรวจโค้ดซ้ำแล้ว ไม่พบปัญหา'); });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Coder', base_url: fm.url });
  addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user({ balance: 100 });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'ช่วยเขียนโปรแกรม python คำนวณภาษี' } }));
  assert.equal(seen.length, 2, 'one extra round for the re-read'); assert.match(JSON.stringify(seen[0].messages), /short plan/);
  assert.match(JSON.stringify(seen[1].messages), /Automatic check/);
  assert.match(ev.map(e => e.t || '').join(''), /ตรวจโค้ดซ้ำแล้ว/);
  fm.close();
});

test('plain chat: a short non-code answer is not re-checked and has no plan prompt', async () => {
  const seen = []; const fm = await fakeModel((q, res, body) => { seen.push(body); fm.sse(res, "สวัสดีครับ"); });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Talk', base_url: fm.url });
  addPlan(t.DB, { models: [m.id], price: 0 }); const u = await t.user({ balance: 100 });
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'สวัสดี' } }));
  assert.equal(seen.length, 1); assert.doesNotMatch(JSON.stringify(seen[0].messages), /short plan/);
  fm.close();
});
