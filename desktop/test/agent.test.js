// ทดสอบวน agent และเครื่องมือในเครื่อง (ไม่ต้องใช้ Electron)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
const { runAgent } = require('../agent');
const { localTool, safePath } = require('../tools');

const fakeFetch = replies => { const seen = []; return { seen, fetch: async (url, init) => { seen.push(JSON.parse(init.body)); const r = replies.shift(); return { ok: !r.error, status: r.error ? 402 : 200, json: async () => r }; } }; };

test('agent: calls a tool, sends the result back, stops when the model answers', async () => {
  const f = fakeFetch([
    { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] } }] },
    { choices: [{ message: { content: 'ไฟล์เขียนว่า hi' } }], usage: { total_tokens: 9 } },
  ]);
  const ev = [], messages = [{ role: 'user', content: 'อ่าน a.txt' }];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools: [{}], callTool: async (n, a) => (n === 'read_file' && a.path === 'a.txt' ? 'hi' : 'Error: ?'), onEvent: e => ev.push(e), fetchImpl: f.fetch });
  assert.equal(f.seen.length, 2);
  assert.deepEqual(f.seen[1].messages.at(-1), { role: 'tool', tool_call_id: 'c1', content: 'hi' });
  assert.ok(ev.some(e => e.type === 'text' && /hi/.test(e.text)));
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
