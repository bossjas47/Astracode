// /v1 (API แบบ OpenAI สำหรับนักพัฒนา): เงิน, งบ key, rate limit, พารามิเตอร์, รูป, ข้อความ error
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, fakeModel, sha } from './helpers.mjs';

async function setup(opt = {}) {
  const fm = await fakeModel((q, res, body) => {
    if (q.url.endsWith('/images/generations')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('PIXELS').toString('base64') }] })); }
    fm.sse(res, 'hello');
  });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Chat One', base_url: fm.url, cost_in: 1000, cost_out: 2000 });
  const img = addModel(t.DB, { name: 'Pic One', provider: 'image', base_url: fm.url, cost_out: 4 });
  const u = await t.user({ balance: opt.balance ?? 100 });
  const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,budget,models) VALUES (?,?,?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now(), opt.budget ?? null, opt.models ?? null);
  const v1 = async (path, body, k = key) => { const r = await t.call(path, { method: body ? 'POST' : 'GET', body, headers: { authorization: 'Bearer ' + k } }); const d = await r.json(); await Promise.all(t.ctx.pending); return { status: r.status, d, h: r.headers }; };
  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
  return { t, fm, m, img, u, key, v1, bal };
}
const msg = { model: 'chat-one', messages: [{ role: 'user', content: 'hi' }] };

test('chat completion bills the wallet, sets rate-limit headers, errors are English with a Thai copy', async () => {
  const { fm, v1, bal } = await setup(), before = bal();
  const r = await v1('/v1/chat/completions', msg);
  assert.equal(r.status, 200); assert.equal(r.d.choices[0].message.content, 'hello');
  assert.ok(bal() < before); assert.equal(r.h.get('x-ratelimit-limit-requests'), '60'); assert.equal(r.h.get('x-ratelimit-remaining-requests'), '59');
  const bad = await v1('/v1/chat/completions', msg, 'sk-astra-nope');
  assert.equal(bad.status, 401); assert.equal(bad.d.error.message, 'Invalid API key.'); assert.match(bad.d.error.message_th, /ไม่ถูกต้อง/);
  const nom = await v1('/v1/chat/completions', { ...msg, model: 'zzz' });
  assert.equal(nom.status, 404); assert.match(nom.d.error.message, /does not exist/);
  fm.close();
});

test('sampling parameters are validated and forwarded', async () => {
  const { fm, v1 } = await setup();
  assert.equal((await v1('/v1/chat/completions', { ...msg, temperature: 5 })).status, 400);
  assert.equal((await v1('/v1/chat/completions', { ...msg, stop: [1] })).status, 400);
  assert.equal((await v1('/v1/chat/completions', { ...msg, response_format: { type: 'xml' } })).status, 400);
  const ok = await v1('/v1/chat/completions', { ...msg, temperature: 0.3, top_p: 0.9, seed: 7, stop: 'END', response_format: { type: 'json_object' } });
  assert.equal(ok.status, 200);
  const body = fm.hits.at(-1).body;
  assert.equal(body.temperature, 0.3); assert.equal(body.top_p, 0.9); assert.equal(body.seed, 7); assert.deepEqual(body.stop, ['END']); assert.deepEqual(body.response_format, { type: 'json_object' });
  fm.close();
});

test('rate limit answers 429 with retry-after after 60 calls a minute', async () => {
  const { t, fm, v1, u } = await setup();
  t.DB.raw.prepare('INSERT INTO rate (key,n,reset) VALUES (?,?,?)').run('api:1', 60, Date.now() + 30e3);
  const r = await v1('/v1/chat/completions', msg);
  assert.equal(r.status, 429); assert.equal(r.d.error.type, 'rate_limit_error'); assert.ok(+r.h.get('retry-after') >= 1); assert.equal(r.h.get('x-ratelimit-remaining-requests'), '0');
  fm.close();
});

test('key budget, model restriction and empty wallet are refused', async () => {
  const a = await setup({ budget: 0 }); // งบ 0 = ใช้ครบแล้วตั้งแต่ต้น
  const r = await a.v1('/v1/chat/completions', msg); assert.equal(r.status, 429); assert.equal(r.d.error.type, 'insufficient_quota'); assert.match(r.d.error.message, /monthly budget/);
  a.fm.close();
  const b = await setup({ models: 'pic-one' });
  assert.equal((await b.v1('/v1/chat/completions', msg)).status, 404);
  b.fm.close();
  const c = await setup({ balance: 0 });
  const e = await c.v1('/v1/chat/completions', msg); assert.equal(e.status, 402); assert.match(e.d.error.message, /Wallet balance/);
  c.fm.close();
});

test('images/generations returns b64_json, charges per picture, validates input', async () => {
  const { fm, v1, bal } = await setup(), before = bal();
  const r = await v1('/v1/images/generations', { prompt: 'a cat', size: '512x512' });
  assert.equal(r.status, 200); assert.equal(Buffer.from(r.d.data[0].b64_json, 'base64').toString(), 'PIXELS');
  assert.ok(before - bal() > 0.5, 'wallet charged'); assert.equal(fm.hits.at(-1).body.size, '512x512');
  assert.equal((await v1('/v1/images/generations', { prompt: 'x', n: 2 })).status, 400);
  assert.equal((await v1('/v1/images/generations', { prompt: '' })).status, 400);
  assert.equal((await v1('/v1/images/generations', { prompt: 'x', size: 'huge' })).status, 400);
  assert.equal((await v1('/v1/images/generations', { prompt: 'x', model: 'chat-one' })).status, 404); // ไม่ใช่โมเดลรูป
  fm.close();
  const poor = await setup({ balance: 0.001 });
  assert.equal((await poor.v1('/v1/images/generations', { prompt: 'cat' })).status, 402);
  poor.fm.close();
});
