// Kyber Harness (เฟส 2): /v1 keepalive, นาฬิกาเฝ้าโมเดล + โมเดลสำรอง, responses ลองใหม่, parallel tool calls,
// Anthropic รวมบทบาทซ้ำ, สตรีมบรรทัดท้าย, บล็อก thinking, key sk-kyber, สถิติตัวคุมรอบ และตรวจ syntax ทุกไฟล์ JS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, addModel, fakeModel, sha } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '..', '..');
const data = o => 'data: ' + JSON.stringify(o) + '\n\n';
const sseHead = res => res.writeHead(200, { 'content-type': 'text/event-stream' });

// ลูกค้า 1 คนมี Wallet + key (prefix เลือกได้) · env เพิ่มเติมได้ (เช่น SSE_PING_MS)
async function client(t, prefix = 'sk-astra-') {
  const u = await t.user({ balance: 100 }), key = prefix + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const raw = async (path, body, hdr = {}) => { const r = await t.call(path, { method: 'POST', body, headers: { authorization: 'Bearer ' + key, ...hdr } }); const text = await r.text(); await Promise.all(t.ctx.pending); return { status: r.status, text, h: r.headers, json: () => JSON.parse(text) }; };
  return { u, key, raw };
}
const events = txt => txt.split('\n\n').filter(b => /^data: /m.test(b)).map(b => ({ name: b.match(/^event: (.*)$/m)?.[1], data: JSON.parse(b.match(/^data: (.*)$/m)[1]) }));
const chunks = txt => txt.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]')).map(l => JSON.parse(l.slice(6)));

test('v1 streams send keepalive pings while the model is slow (chat: comment, messages: ping event, responses: comment)', async () => {
  const fm = await fakeModel((q, res) => setTimeout(() => fm.sse(res, 'hello'), 250));
  const t = await makeEnv({ K: 'k', SSE_PING_MS: '40' }); addModel(t.DB, { name: 'Slow One', base_url: fm.url });
  const { raw } = await client(t);
  const c = await raw('/v1/chat/completions', { model: 'slow-one', stream: true, messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(c.status, 200); assert.match(c.text, /^: ping$/m); assert.equal(chunks(c.text).map(j => j.choices?.[0]?.delta?.content || '').join(''), 'hello'); assert.match(c.text, /data: \[DONE\]\s*$/);
  const m = await raw('/v1/messages', { model: 'slow-one', max_tokens: 50, stream: true, messages: [{ role: 'user', content: 'hi' }] });
  const names = events(m.text).map(e => e.name);
  assert.ok(names.includes('ping')); assert.equal(names.at(-1), 'message_stop');
  const r = await raw('/v1/responses', { model: 'slow-one', input: 'hi', stream: true });
  assert.match(r.text, /^: ping$/m); assert.equal(events(r.text).at(-1).name, 'response.completed');
  fm.close();
});

test('v1 watchdog: a model that never answers is cut at first_token_s and the fallback answers (stream and non-stream)', async () => {
  const hang = await fakeModel(() => { /* ไม่ตอบเลย */ });
  const good = await fakeModel((q, res) => good.sse(res, 'from backup'));
  const t = await makeEnv({ K: 'k' });
  const backup = addModel(t.DB, { name: 'Backup', base_url: good.url });
  const main = addModel(t.DB, { name: 'Main', base_url: hang.url, fallback_id: backup.id });
  t.DB.raw.prepare('UPDATE models SET first_token_s=0.3 WHERE id=?').run(main.id);
  const { raw } = await client(t);
  const t0 = Date.now(), r = await raw('/v1/chat/completions', { model: 'main', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.status, 200); assert.equal(r.json().choices[0].message.content, 'from backup'); assert.deepEqual(r.json().astra_fallback, { requested: 'main', answered_by: 'backup' });
  assert.ok(Date.now() - t0 < 5000);
  const s = await raw('/v1/chat/completions', { model: 'main', stream: true, messages: [{ role: 'user', content: 'hi' }] });
  const cs = chunks(s.text); assert.deepEqual(cs[0].astra_fallback, { requested: 'main', answered_by: 'backup' }); assert.equal(cs.map(j => j.choices?.[0]?.delta?.content || '').join(''), 'from backup');
  const ev = t.DB.raw.prepare("SELECT detail FROM events WHERE kind='error' AND model_id=?").all(main.id);
  assert.ok(ev.some(e => /within 0 s|within 0\.3|no response from the model/.test(e.detail)), JSON.stringify(ev));
  hang.close(); good.close();
});

test('provider "responses" retries a busy upstream (503) instead of failing at once', async () => {
  let n = 0;
  const fm = await fakeModel((q, res) => {
    if (++n === 1) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"busy"}}'); }
    sseHead(res); res.write(data({ type: 'response.output_text.delta', delta: 'ok after retry' })); res.write(data({ type: 'response.completed', response: { usage: { input_tokens: 9, output_tokens: 3 } } })); res.end();
  });
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Resp One', provider: 'responses', base_url: fm.url });
  const { raw } = await client(t);
  const r = await raw('/v1/chat/completions', { model: 'resp-one', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.status, 200); assert.equal(r.json().choices[0].message.content, 'ok after retry'); assert.equal(n, 2); assert.equal(fm.hits[1].url, '/responses');
  fm.close();
});

test('/v1/responses: parallel tool calls keep their own arguments even when chunks interleave', async () => {
  const fm = await fakeModel((q, res) => {
    sseHead(res);
    res.write(data({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'weather', arguments: '' } }] } }] }));
    res.write(data({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'time', arguments: '' } }] } }] }));
    res.write(data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] } }] }));
    res.write(data({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"tz":"UTC"}' } }] } }] }));
    res.write(data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"BKK"}' } }] } }] }));
    res.write(data({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 5 } })); res.end('data: [DONE]\n\n');
  });
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Tools One', base_url: fm.url });
  const { raw } = await client(t);
  const tools = [{ type: 'function', name: 'weather', parameters: { type: 'object', properties: {} } }, { type: 'function', name: 'time', parameters: { type: 'object', properties: {} } }];
  const s = await raw('/v1/responses', { model: 'tools-one', input: 'go', tools, stream: true });
  const ev = events(s.text), done = ev.at(-1).data.response.output;
  assert.deepEqual(done.map(o => [o.call_id, o.name, o.arguments]), [['call_a', 'weather', '{"city":"BKK"}'], ['call_b', 'time', '{"tz":"UTC"}']]);
  const deltas = ev.filter(e => e.name === 'response.function_call_arguments.delta');
  assert.deepEqual(deltas.map(e => e.data.output_index), [0, 1, 0]);
  const n = await raw('/v1/responses', { model: 'tools-one', input: 'go', tools });
  assert.deepEqual(n.json().output.map(o => o.arguments), ['{"city":"BKK"}', '{"tz":"UTC"}']);
  fm.close();
});

test('Anthropic upstream: consecutive same-role messages are merged and empty text blocks dropped; trailing SSE line without newline is not lost', async () => {
  const fm = await fakeModel((q, res) => {
    sseHead(res);
    res.write('event: message_start\n' + data({ type: 'message_start', message: { usage: { input_tokens: 77 } } }));
    res.write('event: content_block_delta\n' + data({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'merged ok' } }));
    res.end('event: message_delta\ndata: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } })); // ไม่มี \n ปิดท้าย
  });
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Claude X', provider: 'anthropic', base_url: fm.url });
  const { raw } = await client(t);
  const r = await raw('/v1/chat/completions', { model: 'claude-x', messages: [
    { role: 'user', content: 'a' }, { role: 'user', content: 'b' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'f', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 't1', content: 'result' }, { role: 'user', content: 'next' }] });
  assert.equal(r.status, 200); assert.equal(r.json().choices[0].message.content, 'merged ok');
  const sent = fm.hits.at(-1).body.messages;
  assert.deepEqual(sent.map(m => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(sent[2].content.map(p => p.type), ['tool_result', 'text']);
  assert.ok(sent.every(m => (Array.isArray(m.content) ? m.content : []).every(p => p.type !== 'text' || p.text.trim())));
  assert.equal(r.json().usage.completion_tokens, 4); // usage จากบรรทัดสุดท้ายที่ไม่มี \n
  fm.close();
});

test('/v1/messages returns thinking blocks from reasoning_content only when the client enables thinking', async () => {
  const fm = await fakeModel((q, res) => {
    sseHead(res); res.write(data({ choices: [{ delta: { reasoning_content: 'let me think' } }] })); res.write(data({ choices: [{ delta: { content: 'answer' } }] }));
    res.write(data({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5 } })); res.end('data: [DONE]\n\n');
  });
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Thinker', base_url: fm.url });
  const { raw } = await client(t);
  const base = { model: 'thinker', max_tokens: 100, messages: [{ role: 'user', content: 'q' }] };
  const on = await raw('/v1/messages', { ...base, thinking: { type: 'enabled', budget_tokens: 4000 } });
  assert.deepEqual(on.json().content.map(c => c.type), ['thinking', 'text']); assert.equal(on.json().content[0].thinking, 'let me think');
  const off = await raw('/v1/messages', base);
  assert.deepEqual(off.json().content.map(c => c.type), ['text']);
  const s = await raw('/v1/messages', { ...base, stream: true, thinking: { type: 'enabled', budget_tokens: 4000 } });
  const ev = events(s.text), starts = ev.filter(e => e.name === 'content_block_start').map(e => e.data.content_block.type);
  assert.deepEqual(starts, ['thinking', 'text']);
  assert.equal(ev.find(e => e.data.delta?.type === 'thinking_delta').data.delta.thinking, 'let me think');
  assert.deepEqual(ev.filter(e => e.name === 'content_block_stop').map(e => e.data.index), [0, 1]);
  fm.close();
});

test('API keys with the new sk-kyber- prefix work alongside sk-astra- (backward compatible)', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'hello'));
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Chat One', base_url: fm.url });
  for (const p of ['sk-astra-', 'sk-kyber-']) {
    const { raw } = await client(t, p);
    const r = await raw('/v1/chat/completions', { model: 'chat-one', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 200, p); assert.equal(r.h.get('x-astracode-billing'), r.h.get('x-kyber-billing'));
  }
  fm.close();
});

test('/v1/agent/stat stores Kyber Harness telemetry in its own table; old apps without it still work', async () => {
  const t = await makeEnv({ K: 'k' }); const { raw, u } = await client(t);
  const old = await raw('/v1/agent/stat', { model: 'm', mode: 'auto', rounds: 3, tools: 4, ok: true, ms: 1000 });
  assert.equal(old.status, 200); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM agent_runs').get().n, 1);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='agent_harness'").get().n, 0);
  await raw('/v1/agent/stat', { model: 'm', rounds: 3, ok: true, harness: { retries: 2, stuck: 1, toolErrors: 3, cacheHit: 87.5, ttftMs: 1200, perTool: { grep: { calls: 5, errors: 1 }, x: 'bad' } } });
  const h = t.DB.raw.prepare('SELECT * FROM agent_harness').get();
  assert.equal(h.user_id, u.id); assert.equal(h.retries, 2); assert.equal(h.stuck, 1); assert.equal(h.tool_errors, 3); assert.equal(h.cache_hit, 87.5); assert.equal(h.ttft_ms, 1200);
  assert.deepEqual(JSON.parse(h.tools), { grep: { calls: 5, errors: 1 }, x: { calls: 0, errors: 0 } });
});

test('/v1 refuses a model the moment it is disabled or hidden (the 30 s model cache is not trusted)', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'hello'));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'Soon Off', base_url: fm.url });
  const { raw } = await client(t), ask = () => raw('/v1/chat/completions', { model: 'soon-off', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal((await ask()).status, 200); // โหลดรายการโมเดลเข้า cache แล้ว
  t.DB.raw.prepare('UPDATE models SET active=0 WHERE id=?').run(m.id);
  const off = await ask(); assert.equal(off.status, 404); assert.match(off.json().error.message, /does not exist|ไม่พบโมเดล/);
  t.DB.raw.prepare('UPDATE models SET active=1, public=0 WHERE id=?').run(m.id);
  assert.equal((await ask()).status, 404);
  assert.equal((await raw('/v1/messages', { model: 'soon-off', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })).status, 404);
  assert.equal(fm.hits.length, 1); // หลังปิดไม่มีคำขอไปถึงผู้ให้บริการเลย
  fm.close();
});

test('agent quality: per-model success / stuck stats; weak models are flagged for the web warning, admin sees all', async () => {
  const t = await makeEnv({ K: 'k' }); const { raw, u } = await client(t);
  const stat = (model, ok, stuck) => raw('/v1/agent/stat', { model, rounds: 5, tools: 8, ok, ms: 9000, harness: { retries: 0, stuck, toolErrors: 1, cacheHit: 80, ttftMs: 900, perTool: {} } });
  for (let i = 0; i < 12; i++) { await stat('deepseek-4.1-flash-uncen', i < 5, i < 6 ? 1 : 0); await stat('claude-sonnet-5.5-eco', true, 0); }
  for (let i = 0; i < 3; i++) await stat('rare-model', false, 1); // งานน้อยเกินไป: ไม่ติดธง
  const r = await t.json('/api/agent/quality', { cookie: u.cookie });
  assert.equal(r.status, 200); assert.deepEqual(r.data.flagged.map(x => x.model), ['deepseek-4.1-flash-uncen']);
  assert.match(r.data.flagged[0].reason, /สำเร็จแค่ 42%[\s\S]*วนซ้ำใน 50%/); assert.equal(r.data.flagged[0].n, 12);
  assert.equal((await t.json('/api/agent/quality')).status, 401);
  const { agentQuality } = await import(new URL('../src/api.js', import.meta.url).href);
  const all = await agentQuality(t.env, 14);
  const sonnet = all.find(x => x.model === 'claude-sonnet-5.5-eco');
  assert.equal(sonnet.ok_rate, 1); assert.equal(sonnet.stuck_rate, 0); assert.equal(sonnet.cache_hit, 80); assert.equal(sonnet.flagged, false);
  assert.equal(all.find(x => x.model === 'rare-model').flagged, false);
});

test('syntax: every hand-written JS file parses (bundles skipped)', () => {
  const SKIP = new Set(['node-runner.js', 'cm.js', 'fb.js']); // ไฟล์ bundle/minified: ไม่แตะ
  const dirs = [['astracode/src', /\.js$/], ['astracode/public', /\.js$/], ['astracode/container', /\.js$/], ['desktop', /\.js$/], ['astracode/tools', /\.mjs$/]];
  let n = 0;
  for (const [d, re] of dirs) for (const f of readdirSync(join(repo, d))) {
    if (!re.test(f) || SKIP.has(f)) continue;
    execFileSync(process.execPath, ['--check', join(repo, d, f)], { stdio: 'pipe' }); n++;
  }
  assert.ok(n > 40, String(n));
});
