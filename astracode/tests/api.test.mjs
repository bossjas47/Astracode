// /v1 (API แบบ OpenAI สำหรับนักพัฒนา): เงิน, งบ key, rate limit, พารามิเตอร์, รูป, ข้อความ error
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, sha } from './helpers.mjs';

async function setup(opt = {}) {
  const fm = await fakeModel((q, res, body) => {
    globalThis.__lastBody = body;
    if (q.url.endsWith('/embeddings')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 7, total_tokens: 7 } })); }
    if (body.tools) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_time', arguments: '' } }] } }] }) + '\n\n'); res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"tz":"UTC"}' } }] } }] }) + '\n\n'); res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 12, completion_tokens: 6 } }) + '\n\n'); res.write('data: [DONE]\n\n'); return res.end(); }
    if (q.url.endsWith('/images/generations')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('PIXELS').toString('base64') }] })); }
    fm.sse(res, 'hello');
  });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Chat One', base_url: fm.url, cost_in: 1000, cost_out: 2000 });
  const img = addModel(t.DB, { name: 'Pic One', provider: 'image', base_url: fm.url, cost_out: 4 });
  const emb = addModel(t.DB, { name: 'Embed One', provider: 'embedding', base_url: fm.url, cost_in: 1000 });
  const u = await t.user({ balance: opt.balance ?? 100 }), paidPlan = addPlan(t.DB, { name: 'Paid', price: 100 }); t.DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(paidPlan.id, Date.now() + 864e5, u.id);
  const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,budget,models) VALUES (?,?,?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now(), opt.budget ?? null, opt.models ?? null);
  const v1 = async (path, body, k = key) => { const r = await t.call(path, { method: body ? 'POST' : 'GET', body, headers: { authorization: 'Bearer ' + k } }); const d = await r.json(); await Promise.all(t.ctx.pending); return { status: r.status, d, h: r.headers }; };
  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
  const raw = async (path, body, hdr = {}) => { const r = await t.call(path, { method: 'POST', body, headers: { 'x-api-key': key, ...hdr } }); const text = await r.text(); await Promise.all(t.ctx.pending); return { status: r.status, text, h: r.headers, json: () => JSON.parse(text) }; };
  return { t, fm, m, img, emb, u, key, v1, raw, bal };
}
const events = txt => txt.split('\n\n').filter(Boolean).map(b => ({ name: b.match(/^event: (.*)$/m)?.[1], data: JSON.parse(b.match(/^data: (.*)$/m)[1]) }));
const msg = { model: 'chat-one', messages: [{ role: 'user', content: 'hi' }] };

test('chat completion bills the wallet, sets rate-limit headers, errors are English with a Thai copy', async () => {
  const { t, fm, v1, bal } = await setup(), before = bal();
  const r = await v1('/v1/chat/completions', msg);
  assert.equal(r.status, 200); assert.equal(r.d.choices[0].message.content, 'hello');
  assert.ok(bal() < before);
  const row = t.DB.raw.prepare('SELECT src,charge FROM usage ORDER BY id DESC').get(); assert.equal(row.src, 'api'); assert.ok(Math.abs(row.charge - (before - bal())) < 1e-6); // หลังบ้านเห็นที่มาและยอดหัก assert.equal(r.h.get('x-ratelimit-limit-requests'), '60'); assert.equal(r.h.get('x-ratelimit-remaining-requests'), '59');
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

test('embeddings are billed by input tokens and kept out of chat', async () => {
  const { fm, v1, bal, t } = await setup(), before = bal();
  const r = await v1('/v1/embeddings', { model: 'embed-one', input: ['a', 'b'] });
  assert.equal(r.status, 200); assert.equal(r.d.data[0].embedding.length, 2); assert.equal(r.d.usage.prompt_tokens, 7); assert.ok(bal() < before);
  assert.equal((await v1('/v1/embeddings', { model: 'embed-one', input: [] })).status, 400);
  assert.equal((await v1('/v1/chat/completions', { ...msg, model: 'embed-one' })).status, 404);
  assert.equal((await v1('/v1/embeddings', { model: 'chat-one', input: 'x' })).status, 404);
  const list = await t.json('/api/models'); void list;
  fm.close();
});

test('Anthropic /v1/messages: plain, streaming, tools, errors, x-api-key', async () => {
  const { fm, raw } = await setup();
  const a = await raw('/v1/messages', { model: 'chat-one', max_tokens: 50, system: 'be brief', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
  assert.equal(a.status, 200); const j = a.json(); assert.equal(j.type, 'message'); assert.equal(j.content[0].text, 'hello'); assert.equal(j.stop_reason, 'end_turn'); assert.ok(j.usage.output_tokens >= 0);
  assert.equal(fm.hits.at(-1).body.messages[0].role, 'system');
  const s = await raw('/v1/messages', { model: 'chat-one', max_tokens: 50, stream: true, messages: [{ role: 'user', content: 'hi' }] });
  const ev = events(s.text), names = ev.map(e => e.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) === i), ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  assert.equal(ev.find(e => e.name === 'content_block_delta').data.delta.text, 'hello');
  const tool = await raw('/v1/messages', { model: 'chat-one', max_tokens: 50, tools: [{ name: 'get_time', description: 'd', input_schema: { type: 'object', properties: {} } }], messages: [{ role: 'user', content: 'time?' }] });
  const tj = tool.json(); assert.equal(tj.stop_reason, 'tool_use'); assert.deepEqual(tj.content.at(-1), { type: 'tool_use', id: 'call_1', name: 'get_time', input: { tz: 'UTC' } });
  assert.equal(fm.hits.at(-1).body.tools[0].function.name, 'get_time');
  const back = await raw('/v1/messages', { model: 'chat-one', max_tokens: 50, messages: [{ role: 'user', content: 'time?' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'get_time', input: { tz: 'UTC' } }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '10:00' }] }] });
  assert.equal(back.status, 200); const bm = fm.hits.at(-1).body.messages; assert.equal(bm.at(-1).role, 'tool'); assert.equal(bm.at(-1).tool_call_id, 'call_1'); assert.equal(bm.at(-2).tool_calls[0].function.arguments, '{"tz":"UTC"}');
  const bad = await raw('/v1/messages', { model: 'chat-one', max_tokens: 5, messages: [{ role: 'user', content: 'x' }] }, { 'x-api-key': 'sk-astra-nope' });
  assert.equal(bad.status, 401); assert.equal(bad.json().error.type, 'authentication_error'); assert.equal(bad.json().type, 'error');
  const ct = await raw('/v1/messages/count_tokens', { model: 'chat-one', messages: [{ role: 'user', content: 'hello there' }] });
  assert.equal(ct.status, 200); assert.ok(ct.json().input_tokens > 0);
  fm.close();
});

test('OpenAI /v1/responses: plain, streaming, function calls', async () => {
  const { fm, v1, raw, key } = await setup(), auth = { authorization: 'Bearer ' + key, 'x-api-key': '' };
  const r = await v1('/v1/responses', { model: 'chat-one', instructions: 'brief', input: 'hi' });
  assert.equal(r.status, 200); assert.equal(r.d.object, 'response'); assert.equal(r.d.output[0].content[0].text, 'hello'); assert.equal(r.d.status, 'completed');
  assert.equal(fm.hits.at(-1).body.messages[0].content, 'brief');
  const s = await raw('/v1/responses', { model: 'chat-one', input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }], stream: true }, auth);
  const ev = events(s.text), names = ev.map(e => e.name);
  assert.equal(names[0], 'response.created'); assert.equal(names.at(-1), 'response.completed'); assert.ok(names.includes('response.output_text.delta'));
  assert.equal(ev.at(-1).data.response.output[0].content[0].text, 'hello'); assert.ok(ev.at(-1).data.response.usage.total_tokens > 0);
  const f = await v1('/v1/responses', { model: 'chat-one', input: 'time?', tools: [{ type: 'function', name: 'get_time', parameters: { type: 'object', properties: {} } }] });
  const call = f.d.output.find(o => o.type === 'function_call'); assert.equal(call.name, 'get_time'); assert.equal(call.arguments, '{"tz":"UTC"}');
  await v1('/v1/responses', { model: 'chat-one', input: [{ role: 'user', content: 'time?' }, { type: 'function_call', call_id: 'call_1', name: 'get_time', arguments: '{}' }, { type: 'function_call_output', call_id: 'call_1', output: '10:00' }] });
  const bm = fm.hits.at(-1).body.messages; assert.equal(bm.at(-1).role, 'tool'); assert.equal(bm.at(-2).tool_calls[0].id, 'call_1');
  assert.equal((await v1('/v1/responses', { model: 'zzz', input: 'x' })).status, 404);
  fm.close();
});

test('IP allowlist, request log, usage history and budget crossing', async () => {
  const { t, fm, v1, key, u } = await setup({ budget: 100 });
  t.DB.raw.prepare('UPDATE api_keys SET ip_allow=?').run('203.0.113.0/24, 198.51.100.7');
  const call = (ipaddr) => t.call('/v1/chat/completions', { method: 'POST', body: msg, headers: { authorization: 'Bearer ' + key, 'cf-connecting-ip': ipaddr } });
  assert.equal((await call('203.0.113.9')).status, 200);
  assert.equal((await call('198.51.100.7')).status, 200);
  const no = await call('8.8.8.8'); assert.equal(no.status, 403); assert.equal((await no.json()).error.type, 'permission_error');
  assert.equal((await call('203.0.114.1')).status, 403); // นอกช่วง /24
  await Promise.all(t.ctx.pending);
  t.DB.raw.prepare('UPDATE api_keys SET ip_allow=NULL').run();
  await v1('/v1/chat/completions', msg);
  const rows = t.DB.raw.prepare('SELECT status,model,tin,tout,charge FROM api_log ORDER BY id').all();
  assert.deepEqual(rows.map(r => r.status), [200, 200, 403, 403, 200]); assert.equal(rows[0].model, 'chat-one'); assert.ok(rows[0].tin > 0 && rows[0].charge > 0);
  const us = await v1('/v1/usage?days=7'); assert.equal(us.status, 200); assert.equal(us.d.history.at(-1).requests, 5); assert.equal(us.d.by_model[0].model, 'chat-one');
  // key งบ: ข้ามเส้น 80% ต้องไม่ทำให้คำขอพัง (อีเมลส่งเฉพาะเมื่อมี RESEND_KEY)
  t.DB.raw.prepare('UPDATE api_keys SET budget=0.0001, spent=0, spent_month=NULL').run();
  assert.equal((await v1('/v1/chat/completions', msg)).status, 200);
  assert.equal((await v1('/v1/chat/completions', msg)).status, 429);
  void u; fm.close();
});

test('free plan without wallet money cannot create API keys and old keys stop working; a paid plan or wallet balance unlocks them', async () => {
  const { t, fm, v1, u, key } = await setup();
  t.DB.raw.prepare('UPDATE users SET plan_id=NULL, balance=0 WHERE id=?').run(u.id); // แพลนหมด = ฟรี และไม่มีเงินใน Wallet
  const r = await v1('/v1/models'); assert.equal(r.status, 402); assert.equal(r.d.error.type, 'insufficient_quota');
  const mk = await t.json('/api/keys', { method: 'POST', cookie: u.cookie, body: { name: 'x' } }); assert.equal(mk.status, 403);
  const paid = addPlan(t.DB, { name: 'P2', price: 50 }); t.DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(paid.id, Date.now() + 864e5, u.id);
  assert.equal((await t.json('/api/keys', { method: 'POST', cookie: u.cookie, body: { name: 'x' } })).status, 200);
  assert.equal((await v1('/v1/models')).status, 200); void key; fm.close();
});

test('a model with a flat per-request price charges that price whatever the token count', async () => {
  const { fm, t, m, v1, bal } = await setup({ balance: 3 });
  t.DB.raw.prepare('UPDATE models SET req_cost=0.5, req_price=1.2 WHERE id=?').run(m.id);
  const tok = bal(); await v1('/v1/chat/completions', msg); const tokCharge = tok - bal(); assert.ok(tokCharge > 0 && tokCharge !== 1.2, 'without bill=request the per-request fields are ignored (token pricing)');
  t.DB.raw.prepare("UPDATE models SET bill='request' WHERE id=?").run(m.id);
  const b0 = bal(), r = await v1('/v1/chat/completions', { ...msg, messages: [{ role: 'user', content: 'x'.repeat(5000) }] });
  assert.equal(r.status, 200); assert.equal(+(b0 - bal()).toFixed(4), 1.2, 'wallet charged the flat price');
  const row = t.DB.raw.prepare('SELECT cost, units FROM usage WHERE model_id=? ORDER BY id DESC').get(m.id);
  assert.equal(row.cost, 0.5); assert.equal(row.units, 0, 'wallet mode does not touch the plan limit');
  const { logUsage } = await import('../src/ai.js'); await logUsage(t.env, 1, { ...m, bill: 'request', req_cost: 0.5 }, { fresh: 1e6, read: 0, write: 0, out: 1e6 }, { units: true });
  assert.equal(t.DB.raw.prepare('SELECT units FROM usage ORDER BY id DESC').get().units, 0.5, 'plan limit units use the flat cost');
  t.DB.raw.prepare('UPDATE users SET balance=0.8').run(); const low = await v1('/v1/chat/completions', msg); assert.equal(low.status, 402, 'balance 0.8 < 1.2 is refused up front');
  const p = (await t.json('/api/pricing')).data.models.find(x => x.id === m.id); assert.equal(p.req, 1.2);
  fm.close();
});

test('IP allowlist supports IPv4 and IPv6 CIDR; token estimate counts Thai denser than English', async () => {
  const a = await import('../src/api.js');
  assert.ok(a.ipAllowed('2001:db8::/32', '2001:db8:1::5')); assert.ok(!a.ipAllowed('2001:db8::/32', '2001:db9::1'));
  assert.ok(a.ipAllowed('10.0.0.0/8, 1.2.3.4', '1.2.3.4')); assert.ok(!a.ipAllowed('10.0.0.0/8', '11.0.0.1'));
  assert.ok(a.ipAllowed('::1', '::1')); assert.ok(!a.ipAllowed('2001:db8::/200', '2001:db8::1'));
  const { estTokens } = await import('../src/core.js'); assert.ok(estTokens('สวัสดีครับ') > estTokens('hello now'));
});

test('model sys_prompt is sent before the caller system message (specialist models like a finance model)', async () => {
  const { t, fm, m, v1 } = await setup();
  t.DB.raw.prepare('UPDATE models SET sys_prompt=? WHERE id=?').run('You are a finance assistant.', m.id);
  const r = await v1('/v1/chat/completions', { model: 'chat-one', messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'hi' }] });
  assert.equal(r.status, 200);
  const sys = globalThis.__lastBody.messages.filter(x => x.role === 'system').map(x => typeof x.content === 'string' ? x.content : x.content.map(c => c.text).join('')).join('\n');
  assert.match(sys, /You are a finance assistant\.\s+Be brief\./);
  fm.close();
});

test('batch API: queued, processed by the cron runner, 20% cheaper, results returned; bad model refused', async () => {
  const { t, fm, v1, bal } = await setup(), { runBatches } = await import('../src/api.js');
  assert.equal((await v1('/v1/batches', { requests: [{ custom_id: 'a', body: { model: 'nope', messages: [{ role: 'user', content: 'hi' }] } }] })).status, 400);
  const r = await v1('/v1/batches', { requests: [{ custom_id: 'a', body: { model: 'chat-one', messages: [{ role: 'user', content: 'hi' }] } }, { custom_id: 'b', body: { model: 'chat-one', messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'yo' }] } }] });
  assert.equal(r.status, 200); assert.equal(r.d.status, 'queued'); const before = bal();
  assert.equal(await runBatches(t.env), 2);
  const g = await v1('/v1/batches/' + r.d.id); assert.equal(g.d.status, 'completed'); assert.equal(g.d.results.length, 2);
  assert.equal(g.d.results[0].response.choices[0].message.content, 'hello'); assert.equal(g.d.results[1].custom_id, 'b');
  const paid = before - bal(), gross = -t.DB.raw.prepare("SELECT SUM(amount) s FROM wallet_tx WHERE kind='api'").get().s;
  assert.ok(Math.abs(paid - gross * 0.8) < 1e-3, `paid ${paid} vs 80% of ${gross}`);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM usage WHERE src='batch'").get().n, 2);
  fm.close();
});

test('wallet: up to 4 requests can run at once; a 5th waits; the balance never goes below zero', async () => {
  const { t, fm, key, bal } = await setup({ balance: 1 });
  for (let i = 0; i < 4; i++) t.DB.raw.prepare('INSERT INTO rate (key,n,reset) VALUES (?,1,?)').run('walletlock:' + t.DB.raw.prepare('SELECT user_id FROM api_keys LIMIT 1').get().user_id + (i ? ':' + i : ''), Date.now() + 60e3);
  const busy = await t.call('/v1/chat/completions', { method: 'POST', body: msg, headers: { authorization: 'Bearer ' + key } });
  assert.equal(busy.status, 429, 'all 4 slots busy'); assert.ok(busy.headers.get('retry-after'));
  t.DB.raw.exec("DELETE FROM rate WHERE key LIKE 'walletlock:%'");
  const rs = await Promise.all([0, 1, 2].map(() => t.call('/v1/chat/completions', { method: 'POST', body: msg, headers: { authorization: 'Bearer ' + key } })));
  assert.deepEqual(rs.map(r => r.status), [200, 200, 200], 'parallel requests are not refused'); await Promise.all(t.ctx.pending);
  assert.ok(bal() >= 0, 'balance ' + bal());
  fm.close();
});

test('api: OpenRouter-style /v1/credits and /v1/key answer instead of 404; /v1/models/<id> works', async () => {
  const t = await makeEnv(), m = addModel(t.DB, { name: 'Flash X', provider: 'openai', base_url: 'http://x' }), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET balance=50 WHERE id=?').run(u.id);
  const { data: k } = await t.json('/api/keys', { method: 'POST', cookie: u.cookie, body: { name: 'cline' } });
  const h = { authorization: 'Bearer ' + k.key };
  const c = await t.json('/v1/credits', { headers: h }); assert.equal(c.status, 200); assert.equal(c.data.data.total_credits - c.data.data.total_usage, 50);
  const kk = await t.json('/v1/key', { headers: h }); assert.equal(kk.data.data.label, 'cline');
  const list = await t.json('/v1/models', { headers: h }), id = list.data.data[0].id;
  assert.equal((await t.json('/v1/models/' + id, { headers: h })).data.id, id);
  assert.equal((await t.json('/v1/models/nope', { headers: h })).status, 404);
  void m;
});

test('api: a client that disconnects mid-stream is still billed (the provider already charged us for the input)', async () => {
  const fm = await fakeModel((q, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'x' } }] }) + '\n\n');
    setTimeout(() => { res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'more text' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5000, completion_tokens: 7 } }) + '\n\n'); setTimeout(() => { res.write('data: [DONE]\n\n'); res.end(); }, 100); }, 300);
  });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Long One', base_url: fm.url, cost_in: 1000, cost_out: 2000 });
  const u = await t.user({ balance: 100 }), key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const r = await t.call('/v1/chat/completions', { method: 'POST', body: { model: 'long-one', stream: true, messages: [{ role: 'user', content: 'a'.repeat(4000) }] }, headers: { authorization: 'Bearer ' + key } });
  const rd = r.body.getReader(); await rd.read(); await rd.cancel(); // ลูกค้าตัดหลังได้ชิ้นแรก
  await Promise.all(t.ctx.pending);
  const row = t.DB.raw.prepare("SELECT tokens_in, charge FROM usage WHERE user_id=? AND src='api'").get(u.id);
  assert.ok(row, 'no usage row: the request was not billed'); assert.equal(row.tokens_in, 5000, 'not billed by the real token count'); assert.ok(row.charge > 0);
  assert.ok(t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance < 100);
  assert.equal(t.DB.raw.prepare("SELECT flag FROM usage WHERE user_id=? AND src='api'").get(u.id).flag, 'gone'); // หลังบ้านเห็นว่าลูกค้าตัดกลางทาง
  void m; fm.close();
});

test('api: /v1/messages client that disconnects is billed; a provider error mid-answer is billed for what was produced', async () => {
  const fm = await fakeModel((q, res, body) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'partial answer' } }] }) + '\n\n');
    if (body.messages?.some(m => String(m.content).includes('BREAK'))) return setTimeout(() => { res.write('data: ' + JSON.stringify({ error: { message: 'upstream exploded' } }) + '\n\n'); res.end(); }, 50);
    setTimeout(() => { res.write('data: [DONE]\n\n'); res.end(); }, 300);
  });
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Long Two', provider: 'openai', base_url: fm.url, cost_in: 1000, cost_out: 2000 });
  const u = await t.user({ balance: 100 }), key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const rows = () => t.DB.raw.prepare("SELECT COUNT(*) n FROM usage WHERE user_id=? AND src='api'").get(u.id).n;
  const r = await t.call('/v1/messages', { method: 'POST', body: { model: 'long-two', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'a'.repeat(3000) }] }, headers: { 'x-api-key': key } });
  const rd = r.body.getReader(); await rd.read(); await rd.cancel(); await Promise.all(t.ctx.pending);
  assert.equal(rows(), 1, '/v1/messages disconnect not billed');
  const r2 = await t.call('/v1/chat/completions', { method: 'POST', body: { model: 'long-two', stream: true, messages: [{ role: 'user', content: 'BREAK ' + 'b'.repeat(3000) }] }, headers: { authorization: 'Bearer ' + key } });
  await r2.text(); await Promise.all(t.ctx.pending);
  assert.equal(rows(), 2, 'mid-answer provider error not billed');
  fm.close();
});

test('agent pack: Desktop Agent keys use the plan only on plans that include Agent, else the pack, else the wallet; pack is bought with the wallet', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok', { prompt_tokens: 1000, completion_tokens: 100 }));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Ag One', base_url: fm.url, cost_in: 1000, cost_out: 2000 });
  const plus = addPlan(t.DB, { name: 'Plus', price: 349, models: [m.id] }), pro = addPlan(t.DB, { name: 'Pro', price: 790, models: [m.id] });
  t.DB.raw.prepare('UPDATE plans SET api_limit=1, limit_week=100, agent=? WHERE id=?').run(0, plus.id); t.DB.raw.prepare('UPDATE plans SET api_limit=1, limit_week=100, agent=1 WHERE id=?').run(pro.id);
  const mk = async (planId, balance) => { const u = await t.user({ balance }); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(planId, Date.now() + 864e5, u.id); const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12); t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'Desktop Agent', await sha(key), key.slice(0, 14), Date.now()); return { u, key }; };
  const ask = key => t.json('/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: { model: 'ag-one', messages: [{ role: 'user', content: 'hi' }] } });
  const row = uid => t.DB.raw.prepare('SELECT units, charge, pack FROM usage WHERE user_id=? ORDER BY id DESC').get(uid);
  // Pro (รวม Agent): หักลิมิตแพลน
  const a = await mk(pro.id, 0); assert.equal((await ask(a.key)).status, 200); await Promise.all(t.ctx.pending); assert.ok(row(a.u.id).units > 0 && !row(a.u.id).pack);
  // Plus ไม่มีแพ็ก ไม่มีเงิน: ใช้ลิมิตแพลนกับ Agent ไม่ได้
  const b = await mk(plus.id, 0); assert.equal((await ask(b.key)).status, 402);
  // เปิดขายแพ็ก แล้วซื้อด้วย Wallet → หักแพ็ก ไม่หักลิมิต/เงิน
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('agent_pack_enabled','1'),('agent_pack_price','199'),('agent_pack_units','120')").run();
  const c = await mk(plus.id, 250);
  const buy = await t.json('/api/agent-pack', { method: 'POST', cookie: c.u.cookie }); assert.equal(buy.status, 200); assert.equal(buy.data.balance, 51);
  assert.equal((await ask(c.key)).status, 200); await Promise.all(t.ctx.pending);
  const r = row(c.u.id); assert.equal(r.units, 0); assert.ok(r.pack > 0); assert.ok(!r.charge);
  assert.ok((await t.json('/api/agent-pack', { cookie: c.u.cookie })).data.pct > 0);
  assert.equal((await t.json('/api/agent-pack', { method: 'POST', cookie: (await t.user({ balance: 10 })).cookie })).status, 402);
  fm.close();
});

test('cloud agent: starts a job in a fake container, streams events, writes changed files back and revokes the job key', async () => {
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Claude Sonnet X', base_url: 'http://x' });
  const u = await t.user({ balance: 20 }), u2 = await t.user({ balance: 0 });
  const p = await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'C', files: { 'a.js': 'old', 'gone.js': 'x' } } }); const pid = p.data.id ?? p.data.project?.id;
  assert.equal((await t.json('/api/cloud-agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, prompt: 'go' } })).status, 503); // ยังไม่เปิด Containers
  // เครื่องเสมือนปลอม: จำ /run แล้วตอบ events/result
  let run = null; const box = { running: false, start() { this.running = true; }, destroy() { this.running = false; }, getTcpPort: () => ({ fetch: async (url, init) => {
    const q = new URL(url);
    if (q.pathname === '/run') { run = JSON.parse(init.body); return new Response('ok'); }
    if (q.pathname === '/events') return Response.json({ status: 'done', events: [{ type: 'tool', name: 'bash', args: { command: 'npm test' } }] });
    if (q.pathname === '/result') return Response.json({ status: 'done', final: 'เสร็จ', changed: [{ path: 'a.js', content: 'new' }], deleted: ['gone.js'] });
    return new Response('', { status: 404 });
  } }) };
  const store = new Map(), state = { container: box, storage: { get: async k => store.get(k), put: async (k, v) => store.set(k, v), delete: async k => store.delete(k), setAlarm: async () => {} } };
  const obj = new t.worker.AgentBox(state, t.env);
  t.env.AGENTBOX = { idFromName: n => n, get: () => ({ fetch: (u2, init) => obj.fetch(new Request(u2, init)) }) };
  assert.equal((await t.json('/api/cloud-agent', { method: 'POST', cookie: u2.cookie, body: { project_id: pid, prompt: 'go' } })).status, 404); // โปรเจกต์คนอื่น
  const r = await t.json('/api/cloud-agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, prompt: 'แก้ a.js' } }); assert.equal(r.status, 200);
  assert.equal(run.prompt, 'แก้ a.js'); assert.ok(run.key.startsWith('sk-astra-')); assert.equal(run.model, 'claude-sonnet-x'); assert.deepEqual(run.files.map(f => f.path).sort(), ['a.js', 'gone.js']);
  assert.equal((await t.json('/api/cloud-agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, prompt: 'อีก' } })).status, 429); // งานเดียวต่อคน
  await obj.alarm();
  const j = await t.json('/api/cloud-agent/' + r.data.id, { cookie: u.cookie });
  assert.equal(j.data.status, 'done'); assert.equal(j.data.events.length, 1); assert.deepEqual(j.data.changed.sort(), ['a.js', 'gone.js (ลบ)']);
  const files = Object.fromEntries(t.DB.raw.prepare('SELECT path, content FROM project_files WHERE project_id=?').all(pid).map(f => [f.path, f.content]));
  assert.deepEqual(files, { 'a.js': 'new' });
  assert.equal(t.DB.raw.prepare("SELECT revoked FROM api_keys WHERE name='Cloud Agent'").get().revoked, 1);
  assert.equal(box.running, false);
  assert.equal((await t.json('/api/cloud-agent/' + r.data.id, { cookie: u2.cookie })).status, 404);
});

test('connect Google: consent flow stores a sealed refresh token, adds a Google MCP row, tools call Google with a refreshed access token, disconnect revokes', async () => {
  const t = await makeEnv({ K: 'k', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', SECRET_KEY: 'x'.repeat(40) }), u = await t.user({ balance: 5 });
  const start = await t.call('/api/google/connect', { cookie: u.cookie }); assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location')); assert.match(loc.searchParams.get('scope'), /gmail\.modify/); assert.equal(loc.searchParams.get('access_type'), 'offline');
  const gconn = start.headers.get('set-cookie').match(/gconn=([\w.]+)/)[1], state = loc.searchParams.get('state');
  const real = globalThis.fetch, seen = []; let tokenCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const s = String(url); seen.push([s, init.headers?.authorization]);
    if (s.startsWith('https://oauth2.googleapis.com/token')) { tokenCalls++; const b = new URLSearchParams(init.body); return Response.json(b.get('grant_type') === 'authorization_code' ? { access_token: 'acc1', refresh_token: 'ref1', expires_in: -100, id_token: 'x.' + btoa(JSON.stringify({ email: 'me@gmail.com' })) + '.y' } : { access_token: 'acc2', expires_in: 3600 }); }
    if (s.includes('gmail.googleapis.com') && s.includes('/messages?')) return Response.json({ messages: [{ id: 'm1' }] });
    if (s.includes('gmail.googleapis.com') && s.includes('/messages/m1')) return Response.json({ snippet: 'hi', payload: { headers: [{ name: 'Subject', value: 'Hello' }, { name: 'From', value: 'a@b.c' }] } });
    if (s.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('');
    return real(url, init);
  };
  try {
    // คุกกี้ผิดคน/ผิด state = ไม่เชื่อม
    const other = await t.user();
    const bad = await t.call(`/api/oauth/google/callback?state=${state}&code=c`, { cookie: `${other.cookie}; gconn=${gconn}` }); assert.match(bad.headers.get('location'), /google=/);
    assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM mcp_servers').get().n, 0);
    const cb = await t.call(`/api/oauth/google/callback?state=${state}&code=c`, { cookie: `${u.cookie}; gconn=${gconn}` });
    assert.match(cb.headers.get('location'), /google=ok&mcp_on=\d+/);
    const link = t.DB.raw.prepare('SELECT * FROM google_links WHERE user_id=?').get(u.id); assert.ok(link && !link.refresh_enc.includes('ref1')); // เก็บแบบเข้ารหัส
    const mcp = (await t.json('/api/mcp', { cookie: u.cookie })).data.find(x => x.name.startsWith('Google')); assert.ok(mcp.tools.includes('gmail_search'));
    assert.equal((await t.json('/api/google', { cookie: u.cookie })).data.connected, true);
    // เรียกผ่าน /v1/mcp (ทางที่ Agent ในแอป/คลาวด์ใช้) → access token หมดอายุ จึง refresh ก่อน
    const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
    t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'Desktop Agent', await sha(key), key.slice(0, 14), Date.now());
    const r = await t.json('/v1/mcp/call', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: { name: `rmcp_${mcp.id}_gmail_search`, args: { query: 'newer_than:1d' } } });
    assert.match(r.data.text, /Hello/); assert.equal(tokenCalls, 2); assert.ok(seen.some(([s, a]) => s.includes('gmail') && a === 'Bearer acc2'));
    assert.equal((await t.json('/api/google', { method: 'DELETE', cookie: u.cookie })).status, 200);
    assert.ok(seen.some(([s]) => s.startsWith('https://oauth2.googleapis.com/revoke')));
    assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM mcp_servers WHERE url='astra://google'").get().n, 0);
  } finally { globalThis.fetch = real; }
});

test('/v1 after reading everything in parallel: rate-limit counter, blocked words, price markup and the daily wallet cap still apply', async () => {
  const { t, v1, bal } = await setup();
  const a = await v1('/v1/chat/completions', msg), b = await v1('/v1/chat/completions', msg);
  assert.equal(a.h.get('x-ratelimit-remaining-requests'), '59'); assert.equal(b.h.get('x-ratelimit-remaining-requests'), '58');
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('block_words','badword')").run();
  const blocked = await v1('/v1/chat/completions', { model: 'chat-one', messages: [{ role: 'user', content: 'a BadWord here' }] });
  assert.equal(blocked.status, 400);
  t.DB.raw.prepare("DELETE FROM settings WHERE key='block_words'").run();
  const c0 = bal(); await v1('/v1/chat/completions', msg); const plain = c0 - bal();
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('price_markup','100')").run();
  const c1 = bal(); await v1('/v1/chat/completions', msg); const marked = c1 - bal();
  assert.ok(marked > plain * 1.4, `markup raises the charge: ${plain} → ${marked}`); // ส่วนบวกใช้กับราคาที่ไม่ได้ตั้งเอง (ผลเท่ากับโค้ดก่อนปรับ)
  t.DB.raw.prepare('UPDATE users SET wallet_day_cap=0.000001').run();
  const capped = await v1('/v1/chat/completions', msg);
  assert.equal(capped.status, 429); assert.match(capped.d.error.message, /Daily wallet limit/);
});
