// ทดสอบวน agent และเครื่องมือในเครื่อง (ไม่ต้องใช้ Electron)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
const { runAgent } = require('../agent');
const { Workspace, globRe } = require('../agenttools');

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

test('workspace: read with line numbers, edit exactly once, glob/grep, bash keeps cwd, undo restores, outside paths are flagged', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-ag-')), asked = [];
  fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/a.js'), 'const x = 1;\nconst y = 2;\n'); fs.writeFileSync(path.join(root, 'src/lib/b.ts'), 'export const x = 3;\n');
  const ws = new Workspace(root, { ask: async r => { asked.push(r); return !r.outside; } });
  assert.match(await ws.call('read_file', { path: 'src/a.js' }), /^\s+1\tconst x = 1;\n\s+2\tconst y = 2;/);
  assert.match(await ws.call('edit_file', { path: 'src/a.js', old_string: 'const', new_string: 'let' }), /เจอ old_string 2 จุด/);
  assert.match(await ws.call('edit_file', { path: 'src/a.js', old_string: 'const y = 2;', new_string: 'const y = 20;' }), /แก้ src\/a.js แล้ว/);
  await ws.call('write_file', { path: 'new/c.md', content: 'hi' });
  assert.equal(await ws.call('glob', { pattern: '**/*.ts' }), 'src/lib/b.ts');
  assert.ok(globRe('src/**/*.js').test('src/a.js') && globRe('src/**/*.js').test('src/x/y/a.js'));
  assert.match(await ws.call('grep', { pattern: 'const x', glob: '*.ts' }), /^src\/lib\/b.ts:1: export const x = 3;$/);
  if (process.platform !== 'win32') { // เทอร์มินัลจำโฟลเดอร์ปัจจุบัน
    assert.match(await ws.call('bash', { command: 'cd src && echo hi' }), /exit 0[\s\S]*hi/);
    assert.match(await ws.call('bash', { command: 'ls' }), /a\.js/);
    assert.match(await ws.call('bash', { command: 'exit 3' }), /^exit 3/);
  }
  assert.deepEqual((await ws.undo()).sort(), ['new/c.md', 'src/a.js']);
  assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8'), 'const x = 1;\nconst y = 2;\n'); assert.ok(!fs.existsSync(path.join(root, 'new/c.md')));
  assert.equal(await ws.call('read_file', { path: path.join(os.tmpdir(), 'nope.txt') }), 'Error: ผู้ใช้ไม่อนุญาต');
  assert.ok(asked.some(r => r.outside) && asked.some(r => r.kind === 'edit') && asked.some(r => r.name === 'bash' || process.platform === 'win32'));
  const bg = await ws.call('bash', { command: process.platform === 'win32' ? 'ping -n 30 127.0.0.1' : 'echo started; sleep 30', background: true });
  assert.match(bg, /id=bg1/); assert.match(await ws.call('bash_output', { id: 'bg1' }), /ยังทำงานอยู่/); ws.stopAll();
});

test('agent: compacts a long conversation before the next round', async () => {
  const f = fakeFetch([{ choices: [{ message: { content: 'เสร็จ' } }] }]);
  const calls = [], big = 'x'.repeat(4000);
  const fetchImpl = async (url, init) => { const b = JSON.parse(init.body); calls.push(b); if (b.stream === false) return { ok: true, json: async () => ({ choices: [{ message: { content: 'สรุป: แก้ a.js แล้ว' } }] }) }; return f.fetch(url, init); };
  const messages = [{ role: 'system', content: 'sys' }, ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: big }))];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, callTool: async () => '', fetchImpl, compactAt: 20000 });
  assert.equal(calls[0].stream, false); assert.match(messages[1].content, /สรุป: แก้ a.js แล้ว/); assert.ok(JSON.stringify(messages).length < 60000);
});

test('agent v2: interjected messages go in before the next round; several task calls run in parallel', async () => {
  const f = fakeFetch([
    { choices: [{ message: { content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'task', arguments: '{"description":"หา A","prompt":"a"}' } }, { id: 'b', type: 'function', function: { name: 'task', arguments: '{"description":"หา B","prompt":"b"}' } }] } }] },
    { choices: [{ message: { content: 'เสร็จ' } }] },
  ]);
  const inbox = [], started = [], messages = [{ role: 'user', content: 'go' }];
  let live = 0, peak = 0;
  const callTool = async (n, a) => { started.push(a.description); live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 50)); live--; if (a.description === 'หา A') inbox.push('ใช้ yarn'); return 'ok ' + a.description; };
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, callTool, fetchImpl: f.fetch, inbox: () => inbox.splice(0), effort: 'high' });
  assert.equal(peak, 2); // ทำพร้อมกัน
  assert.deepEqual(messages.filter(m => m.role === 'tool').map(m => m.content), ['ok หา A', 'ok หา B']);
  assert.equal(f.seen[1].messages.at(-1).content, 'ใช้ yarn'); assert.equal(f.seen[0].reasoning_effort, 'high');
});

test('workspace v2: diff shown with edits, undo back to a chosen step, hooks run after edits', async () => {
  const { diffLines } = require('../agenttools');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-ag2-'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\ntwo\nthree\n');
  const ws = new Workspace(root, { hooks: { after_edit: process.platform === 'win32' ? 'echo hooked' : 'echo hooked {file}' } });
  await ws.call('read_file', { path: 'a.txt' });
  ws.step = 1; const r1 = await ws.call('edit_file', { path: 'a.txt', old_string: 'two', new_string: 'TWO' });
  assert.match(r1, /- two\n\+ TWO/); assert.match(r1, /\[hook after_edit exit 0\]\nhooked/);
  ws.step = 2; await ws.call('edit_file', { path: 'a.txt', old_string: 'three', new_string: 'THREE' });
  ws.step = 3; await ws.call('write_file', { path: 'b.txt', content: 'new' });
  assert.deepEqual((await ws.undoTo(2)).sort(), ['a.txt', 'b.txt']);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'one\nTWO\nthree\n'); assert.ok(!fs.existsSync(path.join(root, 'b.txt')));
  assert.equal(diffLines('x', 'x'), '(ไม่มีอะไรเปลี่ยน)');
});

test('plugins: manifest is validated and trimmed', () => {
  const { cleanPlugin } = require('../agenttools');
  const p = cleanPlugin({ name: 'browser', title: 'B', mcpServers: { playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] } }, commands: [{ name: 'e2e', text: 'test' }, { name: 'bad name!', text: 'x' }], envAsk: ['GITHUB_TOKEN', 'lower'], hooks: { after_edit: 'npx prettier --write {file}' } });
  assert.deepEqual(p.mcpServers.playwright.args, ['-y', '@playwright/mcp@latest']); assert.deepEqual(p.commands.map(c => c.name), ['e2e']); assert.deepEqual(p.envAsk, ['GITHUB_TOKEN']); assert.equal(p.hooks.after_edit, 'npx prettier --write {file}');
  assert.throws(() => cleanPlugin({ name: '../evil' }), /ชื่อปลั๊กอิน/); assert.throws(() => cleanPlugin({ name: 'x1', mcpServers: { a: { args: [] } } }), /mcpServers/);
  const cat = require('../../astracode/public/plugins/catalog.json'); for (const c of cat.plugins) assert.equal(cleanPlugin(c).name, c.name); // แคตตาล็อกบนเว็บผ่านการตรวจทุกตัว
});

test('office: Word/Excel/PowerPoint are created from JSON and read back; Thai text survives', async () => {
  const { makeDocument, readDocument, blocksHtml } = require('../office');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-off-'));
  await makeDocument(path.join(d, 'r.docx'), { title: 'รายงาน', blocks: [{ type: 'paragraph', text: 'ยอดขาย **เพิ่ม** 12%' }, { type: 'table', rows: [['สินค้า', 'ยอด'], ['A', '100']] }] });
  assert.match(await readDocument(path.join(d, 'r.docx')), /รายงาน[\s\S]*ยอดขาย เพิ่ม 12%[\s\S]*สินค้า/);
  await makeDocument(path.join(d, 'r.xlsx'), { sheets: [{ name: 'ยอด', rows: [['สินค้า', 'ราคา'], ['A', '100'], ['รวม', '=SUM(B2:B2)']] }] });
  assert.match(await readDocument(path.join(d, 'r.xlsx')), /# ยอด\nสินค้า,ราคา\nA,100\nรวม,=SUM\(B2:B2\)/);
  assert.match(await makeDocument(path.join(d, 's.pptx'), { slides: [{ title: 'สไลด์', bullets: ['ข้อ 1'] }] }), /สร้าง s.pptx/);
  await assert.rejects(makeDocument(path.join(d, 'x.pdf'), { blocks: [] }), /เฉพาะในแอป/);
  assert.match(blocksHtml('หัวเรื่อง', [{ type: 'bullets', items: ['<script>'] }]), /<h1>หัวเรื่อง<\/h1><ul><li>&lt;script&gt;<\/li><\/ul>/);
});

test('mcp launch: Windows runs npx through cmd.exe (npx.cmd cannot be spawned directly), other commands untouched', () => {
  const { launch } = require('../mcp'), real = process.platform;
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const l = launch({ command: 'npx', args: ['-y', 'x'] }); assert.match(l.command, /cmd/i); assert.deepEqual(l.args.slice(-3), ['npx', '-y', 'x']);
    assert.deepEqual(launch({ command: 'uvx', args: ['blender-mcp'] }), { command: 'uvx', args: ['blender-mcp'] });
    Object.defineProperty(process, 'platform', { value: 'linux' });
    assert.deepEqual(launch({ command: 'npx', args: ['y'] }), { command: 'npx', args: ['y'] });
  } finally { Object.defineProperty(process, 'platform', { value: real }); }
});

test('setupTool: Codex config keeps other settings, replaces the astra provider and top-level model; Claude Code merges env', async () => {
  const { setupTool, codexToml } = require('../setuptools');
  const old = 'model = "gpt-5"\nmodel_provider = "openai"\napproval_policy = "never"\n\n[mcp_servers.chrome]\ncommand = "npx"\n\n[model_providers.astra]\nname = "AstraCode"\nenv_key = "sk-astra-WRONG"\n\n[profiles.x]\nmodel = "o3"\n';
  const t = codexToml(old, { site: 'https://a.b', key: 'sk-astra-1', model: 'claude-sonnet' });
  assert.match(t, /^model = "claude-sonnet"\nmodel_provider = "astra"\n/);
  assert.ok(t.includes('approval_policy = "never"') && t.includes('[mcp_servers.chrome]') && t.includes('[profiles.x]\nmodel = "o3"'));
  assert.ok(!t.includes('sk-astra-WRONG') && !t.includes('model = "gpt-5"'));
  assert.equal(t.match(/\[model_providers\.astra\]/g).length, 1); assert.match(t, /experimental_bearer_token = "sk-astra-1"/); assert.match(t, /base_url = "https:\/\/a.b\/v1"/);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'));
  fs.mkdirSync(path.join(home, '.claude')); fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{"permissions":{"allow":["Bash"]},"env":{"X":"1"}}');
  await setupTool('Claude Code', { site: 'https://a.b', key: 'k', model: 'm', home });
  const j = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(j.permissions, { allow: ['Bash'] }); assert.equal(j.env.X, '1'); assert.equal(j.env.ANTHROPIC_AUTH_TOKEN, 'k');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'settings.json.bak')));
  await setupTool('Codex', { site: 'https://a.b', key: 'k', model: 'm', home }); assert.match(fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8'), /model_provider = "astra"/);
});

test('runAgent: a 503 from the model is retried and the task continues', async () => {
  let n = 0; const infos = [];
  const fetchImpl = async () => (++n === 1 ? new Response('{"error":{"message":"busy"}}', { status: 503 }) : new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', { status: 200 }));
  const msgs = [{ role: 'user', content: 'hi' }];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: msgs, fetchImpl, callTool: async () => '', retryWaits: [1], onEvent: e => e.type === 'info' && infos.push(e.text) });
  assert.equal(n, 2); assert.equal(msgs.at(-1).content, 'ok'); assert.match(infos[0], /503/);
});
