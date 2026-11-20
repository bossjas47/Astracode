// tools แบบ native: เครื่องมือไฟล์ของโหมด Code (ตรวจก่อนแก้ + แปลงเป็นบล็อกที่หน้าเว็บใช้ได้), ค้นเว็บ/เปิดลิงก์ในแชต, ผู้ให้บริการที่ไม่รับ tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';
import { codeTool, codeWorkspace, nativeTools, globRe } from '../src/codetools.js';
import { changesOf } from '../src/edits.js';

const toolSSE = (res, calls, text = '') => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (text) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: calls.map(([name, args], i) => ({ index: i, id: 'call' + i + name, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) + '\n\n'); res.write('data: [DONE]\n\n'); res.end();
};
async function setup(handler, { tools = 'on', extra = {} } = {}) {
  let fm; fm = await fakeModel((req, res, body) => handler(fm, res, body));
  const t = await makeEnv({ K: 'k', ...extra });
  const m = addModel(t.DB, { name: 'M', base_url: fm.url });
  await t.json('/api/version'); t.DB.raw.prepare('UPDATE models SET tools=? WHERE id=?').run(tools, m.id);
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  return { t, m, u, fm };
}

test('codeTool: read with line numbers, edit must match one place, replace_all, write/delete, glob and grep', () => {
  const ws = codeWorkspace([{ path: 'src/a.js', content: 'let a = 1\nlet b = 1\nlet b = 1\n' }, { path: 'index.html', content: '<p>x</p>\n' }, { path: 'img/logo.png', content: 'data:image/png;base64,AAAA' }]);
  const r = codeTool(ws, 'read_file', { path: 'src/a.js' });
  assert.ok(r.ok); assert.match(r.result, /^ {5}1\tlet a = 1\n {5}2\tlet b = 1/);
  assert.match(codeTool(ws, 'read_file', { path: 'img/logo.png' }).result, /image/);
  assert.match(codeTool(ws, 'read_file', { path: 'nope.js' }).result, /^Error: file not found/);
  assert.match(codeTool(ws, 'edit_file', { path: 'src/a.js', old_string: 'let b = 1', new_string: 'let b = 2' }).result, /several places/);
  assert.match(codeTool(ws, 'edit_file', { path: 'src/a.js', old_string: 'let z = 1', new_string: 'x' }).result, /not found/);
  const e = codeTool(ws, 'edit_file', { path: 'src/a.js', old_string: 'let a = 1', new_string: 'let a = 2' });
  assert.ok(e.ok && e.write); assert.equal(ws.files.get('src/a.js'), 'let a = 2\nlet b = 1\nlet b = 1\n');
  assert.match(codeTool(ws, 'read_file', { path: 'src/a.js' }).result, /let a = 2/, 'a later read sees the edit');
  const all = codeTool(ws, 'edit_file', { path: 'src/a.js', old_string: 'let b = 1', new_string: 'let b = 3', replace_all: true });
  assert.ok(all.ok); assert.equal(ws.files.get('src/a.js'), 'let a = 2\nlet b = 3\nlet b = 3\n');
  assert.match(codeTool(ws, 'write_file', { path: '../x.js', content: 'x' }).result, /invalid path/);
  assert.match(codeTool(ws, 'write_file', { path: 'README.md', content: '# T\n```js\nx\n```\n' }).result, /```/);
  const w = codeTool(ws, 'write_file', { path: 'src/new.css', content: 'body{}' }); assert.ok(w.ok);
  const d = codeTool(ws, 'delete_file', { path: 'index.html' }); assert.ok(d.ok); assert.ok(!ws.files.has('index.html'));
  assert.deepEqual(codeTool(ws, 'glob', { pattern: '*.css' }).result, 'src/new.css');
  assert.deepEqual(codeTool(ws, 'glob', { pattern: 'src/**' }).result.split('\n').sort(), ['src/a.js', 'src/new.css']);
  assert.match(codeTool(ws, 'grep', { pattern: 'let b' }).result, /src\/a\.js:2: let b = 3/);
  assert.equal(codeTool(ws, 'grep', { pattern: 'let', glob: '*.css' }).result, '(no match)');
  assert.ok(globRe('**/*.js').test('a/b/c.js'));
  // บล็อกที่ส่งให้หน้าเว็บ แปลงกลับด้วยตัวอ่านเดียวกับหน้าเว็บแล้วได้ไฟล์เดียวกับที่ตรวจไว้
  const orig = { 'src/a.js': 'let a = 1\nlet b = 1\nlet b = 1\n', 'index.html': '<p>x</p>\n' };
  const got = changesOf([e, all, w, d].map(x => x.emit).join(''), p => orig[p] ?? null);
  assert.deepEqual(Object.fromEntries(got.map(c => [c.path, c.del ? null : c.content])), { 'src/a.js': ws.files.get('src/a.js'), 'src/new.css': 'body{}\n', 'index.html': null });
});

test('nativeTools: on for known families and Claude/Responses, off for image models or when the admin turns it off', () => {
  assert.equal(nativeTools({ provider: 'openai', api_model: 'gpt-5.1', tools: null }), true);
  assert.equal(nativeTools({ provider: 'anthropic', api_model: 'x' }), true);
  assert.equal(nativeTools({ provider: 'openai', api_model: 'deepseek-chat' }), true);
  assert.equal(nativeTools({ provider: 'openai', api_model: 'some-model', name: 'Some' }), false);
  assert.equal(nativeTools({ provider: 'openai', api_model: 'some-model', tools: 'on' }), true);
  assert.equal(nativeTools({ provider: 'openai', api_model: 'gpt-5', tools: 'off' }), false);
  assert.equal(nativeTools({ provider: 'image', api_model: 'gpt-image-1' }), false);
});

test('Code mode with native tools: reads two files in one turn, edits, ends without an extra round; the answer carries the edit block', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    const tools = body.messages.filter(x => x.role === 'tool');
    if (!tools.length) return toolSSE(res, [['read_file', { path: 'a.js' }], ['read_file', { path: 'b.js' }]]);
    return toolSSE(res, [['edit_file', { path: 'a.js', old_string: 'let a = 1', new_string: 'let a = 2' }]], 'เปลี่ยน a เป็น 2 แล้ว');
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  for (const [p, c] of [['a.js', 'let a = 1\n'], ['b.js', 'let b = 1\n']]) await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: p, content: c } });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'แก้ a เป็น 2', model_id: m.id, project_id: pid } }));
  assert.equal(fm.hits.length, 2, 'read turn + edit turn, no third call');
  assert.ok(fm.hits[0].body.tools.some(x => x.function.name === 'edit_file'));
  assert.match(fm.hits[0].body.messages[0].content, /NATIVE TOOLS ARE ON/);
  const toolMsgs = fm.hits[1].body.messages.filter(x => x.role === 'tool');
  assert.equal(toolMsgs.length, 2); assert.match(toolMsgs[0].content, /1\tlet a = 1/);
  const text = ev.filter(e => e.t).map(e => e.t).join('');
  assert.deepEqual(changesOf(text, p => ({ 'a.js': 'let a = 1\n' })[p] ?? null), [{ path: 'a.js', content: 'let a = 2\n', edit: true }]);
  assert.ok(ev.some(e => e.mcp?.tool === 'อ่าน a.js'));
  const saved = t.DB.raw.prepare("SELECT content FROM messages WHERE role='assistant'").get().content;
  assert.match(saved, /path=a\.js/); assert.match(saved, /เปลี่ยน a เป็น 2 แล้ว/);
  assert.equal(t.DB.raw.prepare("SELECT content FROM project_files WHERE path='a.js'").get().content, 'let a = 1\n', 'the page applies the change, not the server');
  fm.close();
});

test('Code mode with native tools: a failed edit goes back to the model, which fixes it in the same answer', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    const tools = body.messages.filter(x => x.role === 'tool');
    if (!tools.length) return toolSSE(res, [['edit_file', { path: 'a.js', old_string: 'let a = 9', new_string: 'let a = 2' }]]);
    if (tools.length === 1) return toolSSE(res, [['edit_file', { path: 'a.js', old_string: 'let a = 1', new_string: 'let a = 2' }]], 'แก้แล้ว');
    return fm.sse(res, 'should not be called');
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: 'a.js', content: 'let a = 1\n' } });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'แก้', model_id: m.id, project_id: pid } }));
  assert.equal(fm.hits.length, 2);
  assert.match(fm.hits[1].body.messages.find(x => x.role === 'tool').content, /^Error: old_string not found/);
  assert.ok(ev.some(e => e.mcp && !e.mcp.ok) && ev.some(e => e.mcp?.ok));
  const text = ev.filter(e => e.t).map(e => e.t).join('');
  assert.deepEqual(changesOf(text, () => 'let a = 1\n').map(c => c.content), ['let a = 2\n']);
  fm.close();
});

test('chat: the model searches the web only when it needs to; a first question that looks time-sensitive is searched ahead in parallel', async () => {
  let tavily = 0; const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes('api.tavily.com') ? (tavily++, new Response(JSON.stringify({ results: [{ title: 'ทอง', url: 'https://gold.example/1', content: 'บาทละ 40,000' }] }))) : realFetch(url, init);
  try {
    const { t, m, u, fm } = await setup((fm, res, body) => {
      const last = JSON.stringify(body.messages.at(-1));
      if (/ทอง/.test(last) && !body.messages.some(x => x.role === 'tool')) return toolSSE(res, [['web_search', { query: 'ราคาทอง' }]]);
      return fm.sse(res, body.messages.some(x => x.role === 'tool') ? 'ราคาทอง 40,000 [1]' : 'กลอนครับ');
    }, { extra: { TAVILY_KEY: 'x' } });
    const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ราคาทองวันนี้', model_id: m.id } }));
    assert.equal(tavily, 1, 'the search started ahead is reused, not repeated');
    assert.ok(ev.some(e => e.sources?.some(s => s.url === 'https://gold.example/1')));
    assert.match(fm.hits[1].body.messages.find(x => x.role === 'tool').content, /40,000/);
    assert.match(t.DB.raw.prepare("SELECT sources FROM messages WHERE role='assistant'").get().sources, /gold\.example/);
    assert.ok(fm.hits[0].body.tools.some(x => x.function.name === 'web_search'));
    t.DB.raw.exec('DELETE FROM rate');
    const ev2 = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'วันนี้แต่งกลอนให้หน่อย', model_id: m.id } }));
    assert.ok(ev2.some(e => e.t === 'กลอนครับ')); assert.equal(fm.hits.length, 3, 'answered directly');
    fm.close();
  } finally { globalThis.fetch = realFetch; }
});

test('a provider that rejects tools: the answer is retried at once without them', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    if (body.tools) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'tools are not supported for this model' } })); }
    fm.sse(res, 'ตอบได้');
  });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'สวัสดี', model_id: m.id } }));
  assert.ok(ev.some(e => e.t === 'ตอบได้'), JSON.stringify(ev.filter(e => e.error)));
  assert.equal(fm.hits.length, 2); assert.ok(!fm.hits[1].body.tools);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE kind='error'").get().n, 0, 'not counted as the model being down');
  fm.close();
});

test('a new chat and a long existing chat still save and window the history correctly in one batch', async () => {
  const { t, m, u, fm } = await setup((fm, res) => fm.sse(res, 'ok'), { tools: 'off' });
  let cid;
  for (let k = 1; k <= 14; k++) {
    t.DB.raw.exec('DELETE FROM rate');
    const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'm' + k, chat_id: cid } }));
    cid ||= ev.find(e => e.chat_id)?.chat_id;
  }
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM chats').get().n, 1);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM messages WHERE role='user'").get().n, 14);
  const last = fm.hits.at(-1).body.messages.filter(x => x.role !== 'system');
  assert.equal(last.at(-1).content.includes('m14'), true);
  assert.ok(last.length <= 20 && last.length >= 10, 'history is windowed: ' + last.length);
  fm.close();
});

test('a new chat can be started in your own space, never in someone else\'s', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => fm.sse(res, 'ok'), { tools: 'off' });
  const other = await t.user();
  const mine = t.DB.raw.prepare("INSERT INTO folders (user_id,name,created_at,instructions) VALUES (?,?,?,?) RETURNING id").get(u.id, 'Mine', Date.now(), 'MY-SPACE-RULES').id;
  const theirs = t.DB.raw.prepare("INSERT INTO folders (user_id,name,created_at,instructions) VALUES (?,?,?,?) RETURNING id").get(other.id, 'Theirs', Date.now(), 'SECRET-RULES').id;
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'a', model_id: m.id, folder_id: mine } }));
  t.DB.raw.exec('DELETE FROM rate');
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'b', model_id: m.id, folder_id: theirs } }));
  const rows = t.DB.raw.prepare('SELECT folder_id FROM chats WHERE user_id=? ORDER BY id').all(u.id).map(r => r.folder_id);
  assert.deepEqual(rows, [mine, null]);
  assert.match(JSON.stringify(fm.hits[0].body.messages), /MY-SPACE-RULES/);
  assert.doesNotMatch(JSON.stringify(fm.hits[1].body.messages), /SECRET-RULES/);
  fm.close();
});
