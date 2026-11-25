// ทดสอบ Kyber Harness: ตัวคุมรอบ (agent.js) และเครื่องมือใหม่ (agenttools.js) · ไม่ต้องใช้ Electron / เน็ต
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { runAgent, compact, repairHistory, validateArgs, maskSecrets, retryAfterMs, backoffMs, SPILL_AT } = require('../agent');
const { Workspace, AGENT_TOOLS, ASK_TOOL, READ_ONLY, SUB_TOOLS, applyEdits, wantsAndroid, toolsFor, toolRegistry, agentSystem } = require('../agenttools');

// โมเดลปลอม: แต่ละรอบ = { text, calls: [[name, args|rawString]], status, headers, usage } · ส่งเป็น SSE แบบ /v1/chat/completions
const enc = s => new TextEncoder().encode(s);
function script(turns) {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(JSON.parse(init.body));
    const t = turns.shift() || { text: 'จบ' };
    if (t.status && t.status !== 200) return { ok: false, status: t.status, headers: new Map(Object.entries(t.headers || {})), json: async () => ({ error: { message: 'busy' } }), body: { cancel: async () => {} } };
    if (t.nonStream) return { ok: true, status: 200, json: async () => t.nonStream };
    const ev = [];
    if (t.text) ev.push({ choices: [{ delta: { content: t.text } }] });
    (t.calls || []).forEach(([name, args], i) => ev.push({ choices: [{ delta: { tool_calls: [{ index: i, id: 'c' + seen.length + '_' + i, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] } }] }));
    if (t.finish) ev.push({ choices: [{ delta: {}, finish_reason: t.finish }] });
    if (t.usage) ev.push({ choices: [], usage: t.usage });
    const body = ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]';
    return { ok: true, status: 200, body: (async function* () { yield enc(body); })() };
  };
  return { seen, fetch };
}
const tools = AGENT_TOOLS; // schema จริง ใช้ตรวจ argument
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kyber-h-'));
const run = (s, o = {}) => { const ev = []; const messages = o.messages || [{ role: 'system', content: 's' }, { role: 'user', content: 'go' }]; return runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools, fetchImpl: s.fetch, onEvent: e => ev.push(e), retryWaits: [1, 1, 1], ...o }).then(() => ({ ev, messages, stats: ev.find(e => e.type === 'stats')?.stats })); };

test('harness: invalid tool arguments get a helpful error and never reach the tool', async () => {
  const s = script([{ calls: [['read_file', {}], ['grep', '{bad json']] }, { text: 'ok' }]), called = [];
  const { messages } = await run(s, { callTool: async n => { called.push(n); return 'x'; } });
  assert.deepEqual(called, []);
  const outs = messages.filter(m => m.role === 'tool').map(m => m.content);
  assert.match(outs[0], /missing "path".*Expected parameters: path \(string, required\)/);
  assert.match(outs[1], /not valid JSON/);
  assert.equal(validateArgs({ type: 'object', properties: { n: { type: 'number' }, e: { type: 'string', enum: ['a'] } } }, { n: 'x', e: 'b' }), '"n" must be number; "e" must be one of a');
});

test('harness: stuck-loop detector warns once after 3 identical calls', async () => {
  const same = { calls: [['grep', { pattern: 'foo' }]] };
  const s = script([same, same, same, same, { text: 'เปลี่ยนวิธีแล้ว' }]);
  const { messages, stats, ev } = await run(s, { callTool: async () => 'ไม่พบ' });
  const hints = messages.filter(m => m.role === 'tool' && m.content.includes('[Kyber Harness]'));
  assert.equal(hints.length, 1); assert.equal(stats.stuck, 1); assert.ok(ev.some(e => e.type === 'info' && /วนซ้ำ/.test(e.text)));
});

test('harness: the same error 3 times in a row also triggers a hint', async () => {
  const s = script([1, 2, 3].map(i => ({ calls: [['edit_file', { path: 'a.js', old_string: 'x' + i, new_string: 'y' }]] })).concat([{ text: 'ok' }]));
  const { messages } = await run(s, { callTool: async () => 'Error: ไม่เจอ old_string ในไฟล์' });
  assert.match(messages.filter(m => m.role === 'tool').at(-1).content, /same error has happened 3 times/);
});

test('harness: retries 429/503 with Retry-After, then continues the same round', async () => {
  const s = script([{ status: 429, headers: { 'retry-after': '0' } }, { status: 503 }, { text: 'สำเร็จ' }]);
  const { ev, stats } = await run(s, { callTool: async () => '' });
  assert.equal(s.seen.length, 3); assert.equal(stats.retries, 2);
  assert.deepEqual(ev.filter(e => e.type === 'info').map(e => e.text.match(/\((\d+)\)/)?.[1]), ['429', '503']);
  assert.equal(retryAfterMs({ headers: new Map([['retry-after', '3']]) }), 3000);
  assert.equal(retryAfterMs({ headers: new Map() }), null);
  for (let i = 0; i < 6; i++) { const w = backoffMs(i); assert.ok(w >= Math.min(30000, 2000 * 2 ** i) && w < Math.min(30000, 2000 * 2 ** i) + 1000); }
});

test('harness: gives up after the retry budget with the provider error', async () => {
  const s = script([{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }]);
  await assert.rejects(run(s, { callTool: async () => '' }), /busy/);
});

test('harness: reads run in parallel, writes run alone and in order, results keep the call order', async () => {
  const s = script([{ calls: [['read_file', { path: 'a' }], ['read_file', { path: 'b' }], ['write_file', { path: 'c', content: '1' }], ['read_file', { path: 'd' }], ['read_file', { path: 'e' }]] }, { text: 'ok' }]);
  let live = 0, peak = 0, writeAlone = true; const order = [];
  const { messages } = await run(s, { callTool: async (n, a) => { live++; peak = Math.max(peak, live); if (n === 'write_file' && live > 1) writeAlone = false; await new Promise(r => setTimeout(r, 15)); order.push(a.path); live--; return 'r:' + a.path; } });
  assert.equal(peak, 2); assert.ok(writeAlone);
  assert.deepEqual(order.slice(2, 3), ['c']); // เขียนหลังอ่าน a,b เสร็จ และก่อนอ่าน d,e
  assert.deepEqual(messages.filter(m => m.role === 'tool').map(m => m.content), ['r:a', 'r:b', 'r:c', 'r:d', 'r:e']);
});

test('harness: long output is spilled to a file (head + tail + path); read_file output is never spilled', async () => {
  const big = 'บรรทัด\n'.repeat(4000), spilled = [];
  const s = script([{ calls: [['bash', { command: 'npm test' }], ['read_file', { path: 'big.txt' }]] }, { text: 'ok' }]);
  const { messages } = await run(s, { callTool: async () => big, spill: async (t, i) => { spilled.push([t.length, i.name]); return '.kyber-tmp/out-1.txt'; } });
  const [b, r] = messages.filter(m => m.role === 'tool').map(m => m.content);
  assert.deepEqual(spilled, [[big.length, 'bash']]);
  assert.ok(b.length < 12000 && b.includes('.kyber-tmp/out-1.txt') && b.includes('4,001 บรรทัด'));
  assert.ok(r.length > SPILL_AT); // เนื้อไฟล์ที่โมเดลขออ่าน: ส่งเต็ม
});

test('harness: secrets in tool output are masked', async () => {
  const s = script([{ calls: [['bash', { command: 'cat .env' }]] }, { text: 'ok' }]);
  const keys = ['sk-astra-0123456789abcdef0123', 'ghp_' + 'a'.repeat(36), 'github_pat_' + 'B'.repeat(30), 'AIza' + 'c'.repeat(35), 'sk-ant-api03-' + 'x'.repeat(40)];
  const { messages } = await run(s, { callTool: async () => keys.join('\n') });
  const out = messages.find(m => m.role === 'tool').content;
  for (const k of keys) assert.ok(!out.includes(k), k);
  assert.equal((out.match(/\[ซ่อน\]/g) || []).length, keys.length);
  assert.equal(maskSecrets('no secrets here sk-short'), 'no secrets here sk-short');
});

test('harness: budgets stop the run cleanly (rounds, time, tokens) and helpers cannot nest', async () => {
  const loop = () => script(Array.from({ length: 10 }, () => ({ calls: [['list_dir', { path: '.' }]], usage: { prompt_tokens: 600, completion_tokens: 10 } })));
  const r1 = await run(loop(), { callTool: async () => 'x', maxRounds: 2 });
  assert.equal(r1.stats.rounds, 2); assert.match(r1.ev.filter(e => e.type === 'delta').at(-1).text, /ครบ 2 รอบ/);
  const r2 = await run(loop(), { callTool: async () => 'x', maxTokens: 1000 });
  assert.equal(r2.stats.rounds, 2); assert.match(r2.ev.at(-2).text, /token ครบเพดาน/);
  const r3 = await run(loop(), { callTool: async () => new Promise(r => setTimeout(() => r('x'), 30)), maxDurationMs: 20 });
  assert.equal(r3.stats.rounds, 1);
  const s = script([{ calls: [['task', { description: 'd', prompt: 'p' }]] }, { text: 'ok' }]), called = [];
  const { messages } = await run(s, { depth: 1, callTool: async n => { called.push(n); return 'x'; } });
  assert.deepEqual(called, []); assert.match(messages.find(m => m.role === 'tool').content, /cannot start another helper/);
});

test('harness: resume repairs dangling tool calls and checkpoints every round', async () => {
  const messages = [{ role: 'system', content: 's' }, { role: 'user', content: 'go' }, { role: 'assistant', content: null, tool_calls: [{ id: 'x1', type: 'function', function: { name: 'write_file', arguments: '{}' } }, { id: 'x2', type: 'function', function: { name: 'bash', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'x1', content: 'done' }, { role: 'user', content: 'ทำต่อ' }];
  const cps = [];
  const s = script([{ calls: [['list_dir', { path: '.' }]] }, { text: 'ok' }]);
  const { ev } = await run(s, { messages, callTool: async () => 'x', onCheckpoint: c => cps.push(c.round) });
  assert.deepEqual(messages.slice(3, 5).map(m => m.tool_call_id), ['x1', 'x2']); assert.match(messages[4].content, /interrupted/);
  assert.equal(s.seen[0].messages[4].role, 'tool'); // คำขอแรกหลังซ่อมถูกรูปแบบแล้ว
  assert.ok(ev.some(e => e.type === 'info' && /ค้าง/.test(e.text))); assert.deepEqual(cps, [0, 1]);
  assert.equal(repairHistory(messages), 0); // ซ่อมซ้ำไม่เพิ่มอะไร
});

test('harness: compaction keeps the todo list, changed files and open errors, plus the last rounds', async () => {
  const state = { todos: [{ content: 'แก้ login', status: 'in_progress' }], changed: new Set(['src/a.js']), errors: new Map([['bash:npm test', 'bash npm test: 2 failing']]) };
  const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'งานใหญ่' }];
  for (let i = 0; i < 8; i++) messages.push({ role: 'assistant', content: null, tool_calls: [{ id: 't' + i, type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 't' + i, content: 'x'.repeat(100) });
  let asked;
  await compact({ post: async b => { asked = b; return { ok: true, json: async () => ({ choices: [{ message: { content: 'สรุปเก่า' } }] }) }; }, model: 'm', messages, onEvent: () => {}, state });
  assert.equal(asked.stream, false); assert.equal(messages[0].content, 'sys');
  assert.match(messages[1].content, /สรุปเก่า[\s\S]*\[in_progress\] แก้ login[\s\S]*src\/a\.js[\s\S]*2 failing/);
  assert.equal(messages.filter(m => m.role === 'assistant' && m.tool_calls).length, 4); // 4 รอบล่าสุดเต็มข้อความ
  assert.equal(messages[3].role, 'assistant'); // ไม่เริ่มด้วย tool ที่ไม่มีคู่
});

test('harness: stats report tool calls, errors, cache hit and TTFT', async () => {
  const s = script([{ calls: [['read_file', { path: 'a' }]], usage: { prompt_tokens: 1000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 900 } } }, { text: 'ok', usage: { prompt_tokens: 1000, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 700 } } }]);
  const { stats } = await run(s, { callTool: async () => 'Error: nope' });
  assert.equal(stats.rounds, 2); assert.equal(stats.toolCalls, 1); assert.equal(stats.toolErrors, 1); assert.deepEqual(stats.perTool.read_file, { calls: 1, errors: 1 });
  assert.equal(stats.cacheHit, 80); assert.equal(stats.ttft.length, 2);
});

// ---------- เครื่องมือ ----------
test('tools: multi_edit is atomic — one bad edit writes nothing; a good batch is one undo step', async () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'a.js'), 'const a = 1;\r\nconst b = 2;\r\n');
  const ws = new Workspace(d); await ws.call('read_file', { path: 'a.js' });
  const bad = await ws.call('multi_edit', { path: 'a.js', edits: [{ old_string: 'const a', new_string: 'let a' }, { old_string: 'nope', new_string: 'x' }] });
  assert.match(bad, /edit 2\/2.*ไม่ได้แก้อะไร/); assert.equal(fs.readFileSync(path.join(d, 'a.js'), 'utf8'), 'const a = 1;\r\nconst b = 2;\r\n');
  ws.step = 1; ws.runFrom = 1;
  const ok = await ws.call('multi_edit', { path: 'a.js', edits: [{ old_string: 'const a = 1;\nconst b', new_string: 'let a = 1;\nlet b' }, { old_string: '2', new_string: '3' }] });
  assert.match(ok, /แก้ a\.js แล้ว 2 จุด/); assert.equal(fs.readFileSync(path.join(d, 'a.js'), 'utf8'), 'let a = 1;\r\nlet b = 3;\r\n'); // คง CRLF เดิม
  assert.deepEqual(await ws.undo(), ['a.js']); assert.equal(fs.readFileSync(path.join(d, 'a.js'), 'utf8'), 'const a = 1;\r\nconst b = 2;\r\n');
  assert.match(await ws.call('multi_edit', { path: 'missing.js', edits: [{ old_string: 'a', new_string: 'b' }] }), /ไม่พบไฟล์/);
  assert.deepEqual(applyEdits('aa', [{ old_string: 'a', new_string: 'b', replace_all: true }]), { text: 'bb', count: 2 });
});

test('tools: a syntax error after an edit is reported in the tool result; valid edits stay quiet', async () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'a.js'), 'const a = 1;\n'); fs.writeFileSync(path.join(d, 'c.json'), '{"a":1}'); fs.writeFileSync(path.join(d, 'tsconfig.json'), '{"a":1}');
  fs.writeFileSync(path.join(d, 'App.js'), 'export default () => <div/>;\n');
  const ws = new Workspace(d); for (const f of ['a.js', 'c.json', 'tsconfig.json', 'App.js']) await ws.call('read_file', { path: f });
  assert.doesNotMatch(await ws.call('edit_file', { path: 'a.js', old_string: '1', new_string: '2' }), /syntax/);
  assert.match(await ws.call('edit_file', { path: 'a.js', old_string: '2;', new_string: '(;' }), /\[syntax error · node --check\] a\.js[\s\S]*SyntaxError/);
  assert.match(await ws.call('write_file', { path: 'c.json', content: '{"a":1,}' }), /\[syntax error · JSON\]/);
  assert.doesNotMatch(await ws.call('write_file', { path: 'tsconfig.json', content: '{ // comment\n"a":1}' }), /syntax error/); // JSONC
  assert.doesNotMatch(await ws.call('edit_file', { path: 'App.js', old_string: 'div', new_string: 'span' }), /syntax error/); // JSX ใน .js ไม่ฟ้องผิด
});

test('tools: check_syntax for JS, JSON, Python and unsupported files', async (t) => {
  const d = tmp(); const ws = new Workspace(d);
  fs.writeFileSync(path.join(d, 'ok.mjs'), 'export const a = 1;\n'); fs.writeFileSync(path.join(d, 'bad.json'), '{'); fs.writeFileSync(path.join(d, 'x.txt'), 'hi');
  assert.match(await ws.call('check_syntax', { path: 'ok.mjs' }), /ไม่มี syntax error/);
  assert.match(await ws.call('check_syntax', { path: 'bad.json' }), /syntax error · JSON/);
  assert.match(await ws.call('check_syntax', { path: 'x.txt' }), /ยังไม่รองรับ/);
  assert.match(await ws.call('check_syntax', { path: 'none.js' }), /ไม่พบไฟล์/);
  let py = true; try { execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['--version']); } catch { py = false; }
  if (!py) return t.skip('ไม่มี python');
  fs.writeFileSync(path.join(d, 'a.py'), 'x = (1,\n');
  const out = await ws.call('check_syntax', { path: 'a.py' });
  assert.match(out, /syntax error · python ast[\s\S]*a\.py/); assert.doesNotMatch(out, /Traceback|ast\.py/);
});

test('tools: TypeScript check asks permission like a command (it runs project code)', async () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'a.ts'), 'let a: number = 1;'); const asks = [];
  const ws = new Workspace(d, { ask: async r => { asks.push(r); return false; } });
  assert.equal(await ws.call('check_syntax', { path: 'a.ts' }), 'Error: ผู้ใช้ไม่อนุญาต');
  assert.equal(asks[0].kind, 'bash'); assert.match(asks[0].args.command, /typescript/);
  const ws2 = new Workspace(d);
  assert.match(await ws2.call('check_syntax', { path: 'a.ts' }), /ไม่มีแพ็กเกจ typescript/);
});

test('tools: git_inspect is read-only and refuses option injection', async (t) => {
  let git = true; try { execFileSync('git', ['--version']); } catch { git = false; }
  if (!git) return t.skip('ไม่มี git');
  const d = tmp(), ws = new Workspace(d);
  assert.match(await ws.call('git_inspect', { op: 'status' }), /ไม่ใช่ git repo/);
  fs.writeFileSync(path.join(d, 'a.txt'), 'one\n');
  execFileSync('git', ['init', '-q'], { cwd: d }); execFileSync('git', ['add', '-A'], { cwd: d }); execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'first'], { cwd: d });
  fs.appendFileSync(path.join(d, 'a.txt'), 'two\n');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d }).toString();
  assert.match(await ws.call('git_inspect', { op: 'status' }), /M a\.txt/);
  assert.match(await ws.call('git_inspect', { op: 'diff' }), /\+two/);
  assert.match(await ws.call('git_inspect', { op: 'log', limit: 1 }), /first/);
  assert.match(await ws.call('git_inspect', { op: 'show' }), /\+one/);
  assert.match(await ws.call('git_inspect', { op: 'log', ref: '--output=/tmp/pwn' }), /ref ไม่ถูกต้อง/);
  assert.match(await ws.call('git_inspect', { op: 'reset' }), /op ต้องเป็น/);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d }).toString(), head); assert.match(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), /two/);
});

test('tools: spill writes under .kyber-tmp with a .gitignore and returns a relative path', async () => {
  const d = tmp(), ws = new Workspace(d);
  const p = await ws.spill('x'.repeat(20000), { id: 'call/../../evil' });
  assert.match(p, /^\.kyber-tmp\/out-[\w-]+\.txt$/); assert.equal(fs.readFileSync(path.join(d, p), 'utf8').length, 20000);
  assert.equal(fs.readFileSync(path.join(d, '.kyber-tmp', '.gitignore'), 'utf8'), '*\n');
  const hits = await ws.call('glob', { pattern: '**/*.txt' }); assert.doesNotMatch(hits, /kyber-tmp/); // ไม่ถูกสแกนเป็นไฟล์งาน
});

test('tools: permission prompts are shown one at a time even when reads run in parallel', async () => {
  const d = tmp(), out = tmp(); fs.writeFileSync(path.join(out, 'a.txt'), 'a'); fs.writeFileSync(path.join(out, 'b.txt'), 'b');
  let open = 0, peak = 0;
  const ws = new Workspace(d, { ask: async () => { open++; peak = Math.max(peak, open); await new Promise(r => setTimeout(r, 20)); open--; return true; } });
  await Promise.all([ws.call('read_file', { path: path.join(out, 'a.txt') }), ws.call('read_file', { path: path.join(out, 'b.txt') })]);
  assert.equal(peak, 1);
});

test('tools: android_tools is offered only for Android work; tool registry and shared ask_user', async () => {
  const d = tmp();
  assert.equal(await wantsAndroid(d, 'แก้ css หน้าแรก'), false);
  assert.equal(await wantsAndroid(d, 'แตก apk นี้ให้หน่อย'), true);
  fs.mkdirSync(path.join(d, 'app', 'src', 'main'), { recursive: true }); fs.writeFileSync(path.join(d, 'app', 'src', 'main', 'AndroidManifest.xml'), '<manifest/>');
  assert.equal(await wantsAndroid(d, ''), true);
  assert.ok(!toolsFor().some(t => t.function.name === 'android_tools')); assert.ok(toolsFor({ android: true }).some(t => t.function.name === 'android_tools'));
  for (const n of ['multi_edit', 'git_inspect', 'check_syntax']) assert.ok(AGENT_TOOLS.some(t => t.function.name === n), n);
  assert.ok(READ_ONLY.has('git_inspect') && SUB_TOOLS.has('check_syntax') && !READ_ONLY.has('multi_edit'));
  assert.equal(ASK_TOOL.function.name, 'ask_user'); assert.ok(!AGENT_TOOLS.some(t => t.function.name === 'ask_user')); // เครื่องเสมือนบนคลาวด์มี ask_user ของตัวเอง (กันชื่อซ้ำ)
  const reg = toolRegistry(new Workspace(d));
  const me = reg.get('multi_edit');
  assert.deepEqual(Object.keys(me).sort(), ['execute', 'formatPreview', 'kind', 'name', 'schema', 'validate']);
  assert.equal(me.kind, 'edit'); assert.match(me.validate({ path: 'a' }), /missing "edits"/); assert.equal(me.validate({ path: 'a', edits: [{ old_string: 'a', new_string: 'b' }] }), null);
  assert.equal(reg.get('grep').formatPreview({ pattern: 'TODO' }), 'grep TODO');
  assert.match(await reg.get('list_dir').execute({ path: '.' }), /\[dir\] app/);
  assert.match(agentSystem({ root: d, os: "x" }), /Verify before you finish[\s\S]*git_inspect/);
});

test('harness: a model that sends nothing is cut after firstByteMs and retried once, then the run ends instead of hanging', async () => {
  let calls = 0;
  const silent = (url, init) => new Promise((ok, no) => { calls++; init.signal.addEventListener('abort', () => no(new Error('aborted')), { once: true }); }); // ไม่ตอบเลย
  const ev = [], t0 = Date.now();
  await assert.rejects(runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: [{ role: 'user', content: 'go' }], tools, fetchImpl: silent, callTool: async () => '', onEvent: e => ev.push(e), retryWaits: [1, 1, 1], firstByteMs: 60 }), /ไม่ตอบภายใน[\s\S]*ลองแล้ว 2 ครั้ง/);
  assert.equal(calls, 2); assert.ok(Date.now() - t0 < 2000);
  assert.ok(ev.some(e => e.type === 'info' && /ไม่ตอบภายใน/.test(e.text)));
});

test('harness: a stream that goes silent mid-answer ends the run with a clear error (no hang, no duplicate text)', async () => {
  const half = (url, init) => Promise.resolve({ ok: true, status: 200, body: (async function* () {
    yield enc('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ครึ่งแรก' } }] }) + '\n\n');
    await new Promise((_, no) => init.signal.addEventListener('abort', () => no(new Error('aborted')), { once: true })); // เงียบจนถูกตัด
  })() });
  const ev = [];
  await assert.rejects(runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: [{ role: 'user', content: 'go' }], tools, fetchImpl: half, callTool: async () => '', onEvent: e => ev.push(e), stallMs: 60 }), /ไม่ตอบภายใน[\s\S]*หยุดกลางคำตอบ/);
  assert.equal(ev.filter(e => e.type === 'delta').map(e => e.text).join(''), 'ครึ่งแรก'); // ไม่ลองใหม่ซ้ำข้อความ
});

test('harness: keepalive pings reset the stall timer (slow but alive models are not cut)', async () => {
  const slow = () => Promise.resolve({ ok: true, status: 200, body: (async function* () {
    for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 40)); yield enc(': ping\n\n'); }
    yield enc('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ตอบแล้ว' } }] }) + '\n\ndata: [DONE]\n\n');
  })() });
  const ev = [];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: [{ role: 'user', content: 'go' }], tools, fetchImpl: slow, callTool: async () => '', onEvent: e => ev.push(e), firstByteMs: 100, stallMs: 100 });
  assert.equal(ev.filter(e => e.type === 'delta').map(e => e.text).join(''), 'ตอบแล้ว');
});

test('tools: a file must be read before it is edited or overwritten, and re-read after it changes elsewhere', async () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'a.txt'), 'one\n'); const ws = new Workspace(d);
  assert.match(await ws.call('edit_file', { path: 'a.txt', old_string: 'one', new_string: 'two' }), /read a\.txt with read_file before editing/);
  assert.match(await ws.call('write_file', { path: 'a.txt', content: 'x' }), /before overwriting/);
  assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'one\n'); // ไม่ถูกแตะ
  assert.match(await ws.call('write_file', { path: 'new.txt', content: 'x' }), /เขียน new\.txt/); // ไฟล์ใหม่เขียนได้เลย
  await ws.call('read_file', { path: 'a.txt' });
  assert.match(await ws.call('edit_file', { path: 'a.txt', old_string: 'one', new_string: 'two' }), /แก้ a\.txt แล้ว/);
  assert.match(await ws.call('edit_file', { path: 'a.txt', old_string: 'two', new_string: 'three' }), /แก้ a\.txt แล้ว/); // แก้ต่อจากของตัวเองได้
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(path.join(d, 'a.txt'), 'changed by someone\n'); // เปลี่ยนจากที่อื่น (formatter/ผู้ใช้)
  assert.match(await ws.call('edit_file', { path: 'a.txt', old_string: 'changed', new_string: 'x' }), /changed since you last read it/);
  assert.match(await new Workspace(d, { requireRead: false }).call('edit_file', { path: 'a.txt', old_string: 'changed', new_string: 'x' }), /แก้ a\.txt แล้ว/);
});

test('harness: verify gate — code edits without a test/build run get one reminder before finishing; docs-only or verified work finishes directly', async () => {
  const edit = p => ({ calls: [['edit_file', { path: p, old_string: 'a', new_string: 'b' }]] });
  // แก้โค้ดแล้วจะจบเลย → ถูกเตือนครั้งเดียว (พร้อมคำสั่งตรวจของโปรเจกต์) → รันเทสต์ → จบ
  const s1 = script([edit('src/a.js'), { text: 'เสร็จ' }, { calls: [['bash', { command: 'npm test' }]] }, { text: 'เสร็จ ผ่านแล้ว' }]);
  const r1 = await run(s1, { callTool: async n => n === 'bash' ? 'exit 0' : 'แก้แล้ว', checks: ['npm test'] });
  const gate = r1.messages.find(m => m.role === 'user' && /\[Kyber Harness\]/.test(m.content));
  assert.ok(gate && /`npm test`/.test(gate.content)); assert.equal(r1.stats.gated, 1); assert.equal(s1.seen.length, 4);
  // แก้แค่เอกสาร: ไม่เตือน
  const s2 = script([edit('README.md'), { text: 'เสร็จ' }]); const r2 = await run(s2, { callTool: async () => 'แก้แล้ว' });
  assert.equal(s2.seen.length, 2); assert.equal(r2.stats.gated, undefined);
  // แก้แล้วรันเทสต์ก่อนจบเอง: ไม่เตือน
  const s3 = script([edit('a.py'), { calls: [['bash', { command: 'pytest -q' }]] }, { text: 'เสร็จ' }]); await run(s3, { callTool: async () => 'ok' });
  assert.equal(s3.seen.length, 3);
  // อ้างว่าผ่านทั้งที่ไม่ได้รันอะไร: เตือน · โมเดลยังไม่รันอีก ก็ไม่เตือนซ้ำ (ไม่วน)
  const s4 = script([{ text: 'ทดสอบผ่านหมดแล้วครับ' }, { text: 'ไม่มีเทสต์ให้รันครับ' }]); const r4 = await run(s4, { callTool: async () => '' });
  assert.equal(s4.seen.length, 2); assert.equal(r4.stats.gated, 1);
  // ผู้ช่วย (depth 1) และปิดด้วย verifyGate:false: ไม่เตือน
  const s5 = script([edit('a.js'), { text: 'เสร็จ' }]); await run(s5, { callTool: async () => 'ok', verifyGate: false }); assert.equal(s5.seen.length, 2);
});

test('harness: second-pass reviewer — flagged notes trigger one fix round; LGTM finishes', async () => {
  // ไม่มีเทสต์ให้ตรวจ: ผู้ตรวจรอบสองอ่าน diff แทน
  const s = script([{ calls: [['edit_file', { path: 'a.js', old_string: 'a', new_string: 'b' }]] }, { text: 'เสร็จ' }, { text: 'แก้ตามที่ตรวจแล้ว' }]);
  const asked = [];
  const r = await run(s, { verifyGate: false, callTool: async () => 'ok', review: async x => { asked.push(x.changed); return '- a.js: missing null check on line 3'; } });
  assert.deepEqual(asked, [['a.js']]); assert.equal(s.seen.length, 3); assert.equal(r.stats.reviewed, 1);
  assert.match(r.messages.find(m => /\[Kyber Harness · review\]/.test(m.content || '')).content, /missing null check/);
  const s2 = script([{ calls: [['edit_file', { path: 'a.js', old_string: 'a', new_string: 'b' }]] }, { text: 'เสร็จ' }]);
  await run(s2, { verifyGate: false, callTool: async () => 'ok', review: async () => 'LGTM' }); assert.equal(s2.seen.length, 2);
  // เทสต์ผ่านหลังแก้ล่าสุด: เชื่อผลเทสต์ ข้ามผู้ตรวจ Opus
  const s4 = script([{ calls: [['edit_file', { path: 'a.js', old_string: 'a', new_string: 'b' }]] }, { calls: [['bash', { command: 'npm test' }]] }, { text: 'เสร็จ' }]); let c4 = 0;
  const r4 = await run(s4, { callTool: async () => 'ok', review: async () => { c4++; return 'x'; } }); assert.equal(c4, 0); assert.equal(r4.stats.reviewSkipped, 1);
  const s3 = script([{ text: 'ตอบคำถามเฉย ๆ' }]); let called = 0; await run(s3, { callTool: async () => '', review: async () => { called++; return 'x'; } }); assert.equal(called, 0); // ไม่ได้แก้ไฟล์: ไม่ตรวจ
});

test('project map: tree, scripts, deps and the checks to run; nothing for the home folder', async () => {
  const { projectMap, agentSystem } = require('../agenttools');
  const d = tmp(); fs.mkdirSync(path.join(d, 'src')); fs.mkdirSync(path.join(d, 'node_modules/x'), { recursive: true }); fs.writeFileSync(path.join(d, 'src/index.ts'), '');
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'vitest run', build: 'vite build', dev: 'vite' }, dependencies: { react: '^18.3.1' } }));
  fs.writeFileSync(path.join(d, 'pnpm-lock.yaml'), '');
  const m = await projectMap(d);
  assert.match(m.text, /src\/\n  index\.ts/); assert.doesNotMatch(m.text, /node_modules/);
  assert.match(m.text, /Node project "shop" · package manager: pnpm/); assert.match(m.text, /react@\^18\.3\.1/);
  assert.deepEqual(m.checks, ['pnpm test', 'pnpm build']);
  assert.match(agentSystem({ root: d, os: 'x', map: m.text }), /Project map \(generated when the task started/);
  const py = tmp(); fs.writeFileSync(path.join(py, 'requirements.txt'), 'flask\npytest\n'); assert.deepEqual((await projectMap(py)).checks, ['pytest -q']);
  assert.deepEqual(await projectMap(os.homedir()), { text: '', checks: [] });
  const npmNoTest = tmp(); fs.writeFileSync(path.join(npmNoTest, 'package.json'), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'eslint .' } }));
  assert.deepEqual((await projectMap(npmNoTest)).checks, ['npm run lint']);
});

test('reviewer: reads only this task\'s diff, skips non-code work, returns the model notes', async () => {
  const { makeReviewer } = require('../agenttools');
  const d = tmp(); fs.writeFileSync(path.join(d, 'a.js'), 'let x = 1;\n'); fs.writeFileSync(path.join(d, 'notes.md'), 'hi\n');
  const ws = new Workspace(d); ws.step = 1; ws.runFrom = 1;
  await ws.call('read_file', { path: 'a.js' }); await ws.call('edit_file', { path: 'a.js', old_string: 'let x = 1;', new_string: 'let x = null.y;' });
  await ws.call('write_file', { path: 'b.js', content: 'new file' });
  let sent = null; const post = async body => { sent = body; return { ok: true, json: async () => ({ choices: [{ message: { content: '- a.js: null.y throws' } }] }) }; };
  const notes = await makeReviewer({ ws, post, model: 'm', task: 'fix x' })({ changed: ['a.js', 'b.js'] });
  assert.equal(notes, '- a.js: null.y throws'); assert.equal(sent.stream, false);
  assert.match(sent.messages[1].content, /fix x[\s\S]*=== a\.js\n[\s\S]*- let x = 1;\n\+ let x = null\.y;[\s\S]*=== b\.js \(new file\)/);
  assert.equal(await makeReviewer({ ws, post, model: 'm' })({ changed: ['notes.md'] }), null); // ไม่ใช่โค้ด: ไม่เรียก
});

test('harness: a tool call cut off by the output limit is not run and the model is told to write in parts; cut text is continued, not restarted', async () => {
  const big = '{"path":"big.py","content":"' + 'x = 1\\n'.repeat(500); // ถูกตัดกลาง JSON
  const s = script([{ calls: [['write_file', big]], finish: 'length' }, { text: 'ครึ่งแรก', finish: 'length' }, { text: ' ครึ่งหลัง' }]), called = [], ev = [];
  const messages = [{ role: 'system', content: 's' }, { role: 'user', content: 'go' }];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools, callTool: async n => { called.push(n); return 'x'; }, onEvent: e => ev.push(e), fetchImpl: s.fetch, verifyGate: false });
  assert.deepEqual(called, [], 'cut tool call never runs');
  assert.match(JSON.stringify(s.seen[1].messages), /hit the output length limit and the write_file call was cut off[\s\S]*append=true/);
  assert.ok(!s.seen[1].messages.some(m => m.tool_calls), 'no dangling tool_calls in history');
  assert.match(JSON.stringify(s.seen[2].messages.at(-1)), /Continue exactly where it stopped/);
  assert.ok(ev.some(e => e.type === 'info' && /แบ่งเขียน/.test(e.text)));
  assert.equal(messages.filter(m => m.role === 'assistant').map(m => m.content).join(''), '(cut off)ครึ่งแรก ครึ่งหลัง');
});

test('tools: write_file append builds a big file in parts without re-reading', async () => {
  const dir = tmp(), ws = new Workspace(dir, { ask: async () => true, requireRead: true });
  assert.match(await ws.call('write_file', { path: 'big.py', content: 'a = 1\n' }), /big\.py/);
  assert.match(await ws.call('write_file', { path: 'big.py', content: 'b = 2\n', append: true }), /ต่อท้าย big\.py แล้ว/);
  assert.equal(fs.readFileSync(path.join(dir, 'big.py'), 'utf8'), 'a = 1\nb = 2\n');
  fs.writeFileSync(path.join(dir, 'user.py'), 'old');
  assert.match(await ws.call('write_file', { path: 'user.py', content: 'x', append: true }), /read user\.py with read_file/, 'appending to an unread user file still needs a read');
});

test('skills: coding discipline always for code work, Three.js only for 3D work or three projects', () => {
  const { builtinSkills } = require('../skills');
  assert.match(builtinSkills({ text: 'แก้บั๊ก' }), /coding discipline/); assert.doesNotMatch(builtinSkills({ text: 'แก้บั๊ก' }), /Three\.js/);
  assert.match(builtinSkills({ text: 'ทำแอนิเมชัน 3D ด้วย three.js' }), /Three\.js[\s\S]*check_page/);
  assert.match(builtinSkills({ text: 'x', deps: '{"dependencies":{"three":"^0.170.0"}}' }), /GLTFLoader/);
  assert.equal(builtinSkills({ text: 'สรุปรายงาน', code: false }), '');
});

test('tools: check_page reports console errors and a blank screen with the screenshot; notes survive and are pinned', async () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'index.html'), '<canvas></canvas>');
  const seen = [];
  const ws = new Workspace(dir, { pageCheck: async (u, w) => { seen.push([u, w]); return { image: 'data:image/jpeg;base64,AA', logs: ['[error] Uncaught ReferenceError: THREE is not defined'], bytes: 3000, canvases: 1 }; } });
  const r = await ws.call('check_page', { path: 'index.html' });
  assert.match(seen[0][0], /^http:\/\/127\.0\.0\.1:\d+\/index\.html$/, 'served over a temporary local web server (file:// blocks ES modules)'); assert.equal(seen[0][1], 1500);
  assert.match(r.text, /พบ error 1[\s\S]*THREE is not defined[\s\S]*ดูเหมือนว่าง/); assert.equal(r.images.length, 1);
  assert.match(await ws.call('check_page', { path: 'nope.html' }), /ไม่พบไฟล์/);
  assert.match(await ws.call('check_page', { path: '../x.html' }), /inside the working folder/);
  await ws.call('notes', { action: 'add', text: 'ใช้ three@0.170.0 จาก CDN' });
  assert.match(await ws.call('notes', { action: 'list' }), /three@0\.170\.0/); assert.match(ws.pinnedNotes(), /Your notes so far/);
});

test('harness: advisor plans once per request and helps when stuck; failed page check blocks finishing until fixed', async () => {
  const asked = [];
  const advisor = { model: 'opus', plan: async t => { asked.push('plan:' + t.slice(0, 10)); return '1. read index.html 2. fix camera'; }, unstuck: async () => { asked.push('unstuck'); return 'the import map points to a missing file'; } };
  const s = script([
    { calls: [['read_file', { path: 'a.js' }]] }, { calls: [['read_file', { path: 'a.js' }]] }, { calls: [['read_file', { path: 'a.js' }]] },
    { calls: [['check_page', { path: 'index.html' }]] }, { text: 'เสร็จแล้ว' }, { calls: [['check_page', { path: 'index.html' }]] }, { text: 'แก้แล้ว ผ่าน' }]);
  let pageOk = false; const messages = [{ role: 'system', content: 's' }, { role: 'user', content: 'ทำฉาก 3D ด้วย three.js ให้กล้องหมุนรอบโมเดลและมีแสงสวย ๆ ในหน้า index.html '.repeat(20) }];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools, advisor, fetchImpl: s.fetch, callTool: async n => n === 'check_page' ? (pageOk ? 'ตรวจหน้า index.html\nconsole ไม่มี error' : 'ตรวจหน้า index.html\nพบ error 1 รายการ') : 'same' });
  assert.equal(asked[0], 'plan:ทำฉาก 3D ด'); assert.match(JSON.stringify(s.seen[0].messages), /advisor plan[\s\S]*fix camera/);
  assert.ok(asked.includes('unstuck')); assert.match(JSON.stringify(s.seen[3].messages), /advisor opus\] the import map/);
  assert.match(JSON.stringify(s.seen[5].messages), /last checks still fail/, 'finishing with a failing page check is pushed back');
  pageOk = true;
  assert.equal(asked.filter(x => x.startsWith('plan')).length, 1);
});

test('memory: lessons from a task are written to .kyber/memory.md, deduped by the model, and read back', async () => {
  const { memoryLearn, memoryRead, memoryBlock } = require('../skills'); const dir = tmp();
  const post = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '- Run tests with `npm test -- --runInBand` (jest hangs otherwise)\n- three.js is loaded from the import map in index.html\nnot a bullet' } }] }) });
  const l = await memoryLearn({ post, model: 'm', root: dir, task: 'fix', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(l.length, 2);
  const mem = await memoryRead(dir); assert.match(mem, /# Kyber project memory[\s\S]*runInBand[\s\S]*import map/); assert.match(memoryBlock(mem), /Project memory/);
  const none = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'NONE' } }] }) });
  assert.equal(await memoryLearn({ post: none, model: 'm', root: dir }), null);
});

test('slim: old file contents, old long outputs and old screenshots leave the context; recent turns stay whole', () => {
  const { slim } = require('../agent');
  const big = 'x'.repeat(5000), m = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'task' }];
  for (let i = 0; i < 8; i++) {
    m.push({ role: 'assistant', content: null, tool_calls: [{ id: 'c' + i, type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: `f${i}.js`, content: big }) } }] });
    m.push({ role: 'tool', tool_call_id: 'c' + i, content: 'out ' + big });
    m.push({ role: 'user', content: [{ type: 'text', text: 'shot' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } }] });
  }
  const before = JSON.stringify(m).length; assert.equal(slim(m), 0, 'small conversations are left alone (keeps the prompt cache)'); const n = slim(m, 0);
  assert.ok(n > 0 && JSON.stringify(m).length < before * 0.7);
  assert.equal(JSON.parse(m[2].tool_calls[0].function.arguments).path, 'f0.js'); // ยังรู้ว่าเขียนไฟล์ไหน
  assert.match(JSON.parse(m[2].tool_calls[0].function.arguments).content, /already applied/);
  assert.equal(JSON.parse(m.at(-3).tool_calls[0].function.arguments).content, big); // รอบล่าสุดเต็ม
  assert.equal(m.filter(x => Array.isArray(x.content)).length, 1); // ภาพเหลือภาพล่าสุดภาพเดียว
  assert.equal(slim(m, 0), 0); // ทำซ้ำไม่เปลี่ยนอีก (prompt cache คงที่)
});

test('advisor plan: skipped for short follow-ups (saves limits), used again for a long new request; old run_code arguments are trimmed', async () => {
  const { slim } = require('../agent'); const asked = [];
  const advisor = { model: 'opus', plan: async t => { asked.push(t); return 'plan'; }, unstuck: async () => null };
  const msgs = [{ role: 'system', content: 's' }, { role: 'user', content: 'ทำเกม Roblox' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'แก้สีปุ่มหน่อย' }];
  let s = script([{ text: 'done' }]); await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: msgs, tools, advisor, verifyGate: false, fetchImpl: s.fetch, callTool: async () => 'ok' });
  assert.equal(asked.length, 0);
  msgs.push({ role: 'user', content: 'ฟีเจอร์ใหม่: '.padEnd(1300, 'ก') }); s = script([{ text: 'done' }]);
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: msgs, tools, advisor, verifyGate: false, fetchImpl: s.fetch, callTool: async () => 'ok' });
  assert.equal(asked.length, 1);
  const m = [{ role: 'user', content: 't' }]; for (let i = 0; i < 8; i++) m.push({ role: 'assistant', content: null, tool_calls: [{ id: 'r' + i, type: 'function', function: { name: 'mcp_roblox_run_code', arguments: JSON.stringify({ code: 'print(1)\n'.repeat(400) }) } }] }, { role: 'tool', tool_call_id: 'r' + i, content: 'ok' });
  slim(m, 0); assert.match(JSON.parse(m[1].tool_calls[0].function.arguments).code, /already run/); assert.ok(!/already run/.test(JSON.parse(m.at(-2).tool_calls[0].function.arguments).code));
});

test('wrap-up: 3 rounds before the cap the AI is told to summarize; after checks pass and 6 quiet rounds it is nudged to finish', async () => {
  const s = script(Array.from({ length: 10 }, () => ({ calls: [['read_file', { path: 'a.js' }]] })));
  await run(s, { callTool: async () => 'x', maxRounds: 10 });
  assert.match(JSON.stringify(s.seen[7].messages), /Only 3 rounds left/);
  const calls = [{ calls: [['edit_file', { path: 'a.js', old_string: 'a', new_string: 'b' }]] }, { calls: [['bash', { command: 'npm test' }]] }, ...Array.from({ length: 8 }, (_, i) => ({ calls: [['read_file', { path: 'f' + i + '.js' }]] })), { text: 'done' }];
  const s2 = script(calls); await run(s2, { callTool: async () => 'ok', maxRounds: 40 });
  assert.ok(s2.seen.some(x => /last checks passed and nothing has failed/.test(JSON.stringify(x.messages))));
});

test('advisor does not block: a slow plan arrives later and is added once before a later round', async () => {
  let release; const slow = new Promise(r => { release = r; });
  const advisor = { model: 'opus', plan: () => slow, unstuck: async () => null };
  const s = script([{ calls: [['read_file', { path: 'a.js' }]] }, { calls: [['read_file', { path: 'b.js' }]] }, { text: 'done' }]);
  const messages = [{ role: 'system', content: 's' }, { role: 'user', content: 'สร้างระบบล็อกอินพร้อมสมัครสมาชิกและลืมรหัสผ่านให้เว็บนี้ทั้งหมด ครบทุกหน้า '.repeat(20) }];
  const p = runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools, advisor, verifyGate: false, fetchImpl: s.fetch, callTool: async () => { release('1. read auth.js'); return 'x'; } });
  await p;
  assert.ok(!/advisor plan/.test(JSON.stringify(s.seen[0].messages)), 'first request did not wait for the plan');
  assert.equal((JSON.stringify(s.seen.at(-1).messages).match(/advisor plan/g) || []).length, 1);
});

test('helper model: cheapest text model by plan multiplier for side jobs; none cheaper = main model', () => {
  const { pickHelper } = require('../skills');
  const ms = [{ id: 'opus', multiplier: 8, cost: 30 }, { id: 'flash', multiplier: 1, cost: 2 }, { id: 'luna', multiplier: 0.3, cost: 1.2 }, { id: 'pic', owned_by: 'image', multiplier: 0.1 }];
  assert.equal(pickHelper(ms, 'opus'), 'luna'); assert.equal(pickHelper(ms, 'luna'), null); assert.equal(pickHelper([], 'x'), null);
  assert.match(agentSystem({ root: '/p', os: 'x', rules: '' }), /start 2-3 helpers in ONE reply/);
});

test('last round: tools are switched off so the AI must write the summary', async () => {
  const s = script([...Array.from({ length: 9 }, () => ({ calls: [['read_file', { path: 'a.js' }]] })), { text: 'สรุป: แก้แล้ว' }]);
  const r = await run(s, { callTool: async () => 'x', maxRounds: 10 });
  assert.ok(!s.seen[9].tools, 'no tools on the last round'); assert.match(JSON.stringify(s.seen[9].messages), /tools are off now/);
  assert.equal(r.messages.at(-1).content, 'สรุป: แก้แล้ว');
});

test('an error sent inside the stream before any answer is retried instead of ending the task', async () => {
  let n = 0; const enc = new TextEncoder();
  const body = o => ({ ok: true, status: 200, headers: new Map(), body: (async function* () { yield enc.encode('data: ' + JSON.stringify(o) + '\n\ndata: [DONE]\n\n'); })() });
  const fetchImpl = async () => (++n === 1 ? body({ error: { message: 'model unavailable', message_th: 'โมเดลตอบไม่ได้ตอนนี้' } }) : body({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }));
  const messages = [{ role: 'user', content: 'hi' }];
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages, tools: [], callTool: async () => '', fetchImpl, retryWaits: [1, 1], verifyGate: false });
  assert.equal(n, 2); assert.equal(messages.at(-1).content, 'ok');
});
