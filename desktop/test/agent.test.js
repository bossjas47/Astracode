// ทดสอบวน agent และเครื่องมือในเครื่อง (ไม่ต้องใช้ Electron)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
const { runAgent } = require('../agent');
const { localTool, safePath } = require('../tools');

// ตอบเป็นสตรีม SSE แบบเดียวกับ /v1/chat/completions (ข้อความแบ่ง 2 ชิ้น, tool_calls แบ่ง id/name กับ arguments)
const sse = r => { const m = r.choices[0].message, ev = [];
  if (m.content) { const h = Math.ceil(m.content.length / 2); ev.push({ choices: [{ delta: { content: m.content.slice(0, h) } }] }, { choices: [{ delta: { content: m.content.slice(h) } }] }); }
  (m.tool_calls || []).forEach((tc, i) => ev.push({ choices: [{ delta: { tool_calls: [{ index: i, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: '' } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: i, function: { arguments: tc.function.arguments } }] } }] }));
  if (r.usage) ev.push({ choices: [], usage: r.usage });
  const body = ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
  return (async function* () { yield new TextEncoder().encode(body.slice(0, 40)); yield new TextEncoder().encode(body.slice(40)); })(); };
const fakeFetch = replies => { const seen = []; return { seen, fetch: async (url, init) => { seen.push(JSON.parse(init.body)); const r = replies.shift(); return { ok: !r.error, status: r.error ? 402 : 200, json: async () => r, body: r.error ? null : sse(r) }; } }; };

test('agent: calls a tool, sends the result back, stops when the model answers', async () => {
  const f = fakeFetch([
    { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] } }] },
    { choices: [{ message: { content: 'ไฟล์เขียนว่า hi' } }], usage: { total_tokens: 9 } },
  ]);
  const ev = [], messages = [{ role: 'user', content: 'อ่าน a.txt' }];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools: [{}], callTool: async (n, a) => (n === 'read_file' && a.path === 'a.txt' ? 'hi' : 'Error: ?'), onEvent: e => ev.push(e), fetchImpl: f.fetch });
  assert.equal(f.seen.length, 2);
  assert.deepEqual(f.seen[1].messages.at(-1), { role: 'tool', tool_call_id: 'c1', content: 'hi' });
  assert.equal(ev.filter(e => e.type === 'delta').map(e => e.text).join(''), 'ไฟล์เขียนว่า hi'); assert.equal(f.seen[0].stream, true);
});

test('agent: API errors surface in Thai; tool images are attached as a user message', async () => {
  const bad = fakeFetch([{ error: { message: 'Insufficient', message_th: 'ยอดเงินใน Wallet ไม่พอ' } }]);
  await assert.rejects(runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: [{ role: 'user', content: 'x' }], callTool: async () => '', fetchImpl: bad.fetch }), /Wallet ไม่พอ/);
  const f = fakeFetch([{ choices: [{ message: { tool_calls: [{ id: 'c', type: 'function', function: { name: 'shot', arguments: '{}' } }] } }] }, { choices: [{ message: { content: 'เห็นแล้ว' } }] }]);
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: [{ role: 'user', content: 'x' }], callTool: async () => ({ text: 'ok', images: ['data:image/png;base64,AAA'] }), fetchImpl: f.fetch });
  assert.equal(f.seen[1].messages.at(-1).content[1].image_url.url, 'data:image/png;base64,AAA');
});

test('tools: stay inside the workspace; write, read, list and run work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-'));
  assert.throws(() => safePath(root, '../evil.txt'), /นอกโฟลเดอร์งาน/);
  assert.throws(() => safePath(root, path.resolve('/etc/passwd')), /นอกโฟลเดอร์งาน/);
  await localTool(root, 'write_file', { path: 'sub/a.txt', content: 'hello' });
  assert.equal(await localTool(root, 'read_file', { path: 'sub/a.txt' }), 'hello');
  assert.match(await localTool(root, 'list_dir', { path: '.' }), /\[dir\] sub/);
  assert.match(await localTool(root, 'run_command', { command: 'echo works' }), /exit 0[\s\S]*works/);
});
