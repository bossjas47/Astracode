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
  assert.match(fm.hits[1].body.messages.find(x => x.role === 'tool').content, /Closest lines in the file now[\s\S]*1\tlet a = 1/, 'the closest lines come back so the model can fix it without reading again');
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

test('chat tools: create_file, save_memory, generate_image, run_python and search_chats; markers are stripped from history', async () => {
  let turn = 0;
  const { t, m, u, fm } = await setup((fm, res, body) => {
    turn++; const tools = body.messages.filter(x => x.role === 'tool').length;
    if (turn === 1 && !tools) return toolSSE(res, [['create_file', { filename: 'quote.xlsx', content: 'item,price\nA,10' }], ['save_memory', { text: 'ชื่อบอส' }], ['search_chats', { query: 'งบประมาณ' }]]);
    if (turn === 2) return fm.sse(res, 'ทำไฟล์ให้แล้ว');
    if (turn === 3 && !tools) return toolSSE(res, [['run_python', { code: 'print(1+1)' }]], 'คำนวณให้');
    return fm.sse(res, 'ok');
  });
  const old = t.DB.raw.prepare("INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id").get(u.id, 'งบเก่า', Date.now()).id;
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)").run(old, 'user', 'สรุปงบประมาณปีนี้ 5 ล้าน', Date.now());
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ทำใบเสนอราคา', model_id: m.id } }));
  const text = ev.filter(e => e.t).map(e => e.t).join(''), cid = ev.find(e => e.chat_id).chat_id;
  assert.match(text, /\[\[uf:\d+\|1\|quote\.xlsx\]\]/); // .xlsx เก็บเข้าบัญชี assert.match(text, /```remember\nชื่อบอส\n```/);
  assert.match(fm.hits[1].body.messages.filter(x => x.role === 'tool').map(x => x.content).join('\n'), /สรุปงบประมาณปีนี้/, 'search_chats found the old chat');
  const names = fm.hits[0].body.tools.map(x => x.function.name);
  for (const n of ['create_file', 'save_memory', 'search_chats', 'run_python']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('search_docs'), 'no docs = no search_docs tool');
  t.DB.raw.exec('DELETE FROM rate');
  const ev2 = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'คำนวณ', model_id: m.id, chat_id: cid } }));
  assert.match(ev2.filter(e => e.t).map(e => e.t).join(''), /\[\[py:[A-Za-z0-9+/=]+\]\]/);
  assert.equal(fm.hits.length, 3, 'run_python ends the answer without another model call');
  assert.doesNotMatch(JSON.stringify(fm.hits[2].body.messages), /\[\[dl:/, 'file base64 is not sent back to the model');
  assert.match(JSON.stringify(fm.hits[2].body.messages), /account file file_id=\d+ v1: quote\.xlsx/);
  fm.close();
});

test('an image the provider refuses (copyright / safety) gets a clear message and does not count as the model being down', async () => {
  const fm = await fakeModel((req, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Your request was rejected as a result of our safety system.', code: 'moderation_blocked' } })); });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Img', provider: 'image', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'Pikachu pattern', model_id: m.id } }));
  assert.match(ev.find(e => e.error)?.error || '', /ลิขสิทธิ์/);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE kind='error'").get().n, 0);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE kind='refused'").get().n, 1);
  fm.close();
});

test('auto-save memory: off = suggest only; on = saved with an undo marker, no duplicates, at most 3 a day', async () => {
  let fact = '';
  const { t, m, u, fm } = await setup((fm, res, body) => body.messages.some(x => x.role === 'tool') ? fm.sse(res, 'โอเค') : toolSSE(res, [['save_memory', { text: fact }]]));
  const ask = async text => { t.DB.raw.exec('DELETE FROM rate'); fact = text; const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'เล่า', model_id: m.id } })); return ev.filter(e => e.t).map(e => e.t).join(''); };
  const count = () => t.DB.raw.prepare('SELECT COUNT(*) n FROM memories WHERE user_id=?').get(u.id).n;
  assert.match(await ask('ชื่อบอส'), /```remember\nชื่อบอส/); assert.equal(count(), 0, 'off: nothing saved');
  assert.equal((await t.json('/api/me', { method: 'PUT', cookie: u.cookie, body: { auto_memory: true } })).status, 200);
  assert.equal((await t.json('/api/me', { cookie: u.cookie })).data.auto_memory, 1);
  const saved = await ask('ชื่อบอส ทำร้านกาแฟ');
  assert.match(saved, /\[\[mem:\d+\|ชื่อบอส ทำร้านกาแฟ\]\]/); assert.equal(count(), 1);
  await ask('ชื่อบอส ทำร้านกาแฟ'); assert.equal(count(), 1, 'duplicate not saved');
  await ask('ชอบกาแฟดำ'); await ask('อยู่เชียงใหม่'); assert.equal(count(), 3);
  assert.match(await ask('มีแมวสองตัว'), /```remember\nมีแมวสองตัว/, 'over 3 a day: back to suggesting'); assert.equal(count(), 3);
  const last = fm.hits.at(-1).body.messages;
  assert.doesNotMatch(JSON.stringify(last), /\[\[mem:/); 
  fm.close();
});

test('image size: the size the user picked reaches the image provider (chat and /api/image); a rejected size falls back to square', async () => {
  const sizes = [];
  const fm = await fakeModel((req, res, body) => { sizes.push(body.size); if (body.size === '1024x1536') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"bad size"}}'); } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('JPEGDATA').toString('base64') }] })); });
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Img', provider: 'image', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ภูเขา', model_id: m.id, img_size: '1536x1024' } }));
  assert.equal(sizes[0], '1536x1024');
  t.DB.raw.exec('DELETE FROM rate'); sizes.length = 0;
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ภูเขา', model_id: m.id, img_size: '1024x1536' } }));
  assert.equal(sizes.at(-1), '1024x1024', 'rejected portrait falls back to square');
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('image_enabled','1'),('image_base_url',?),('image_model','img'),('image_key_name','K')").run(fm.url); sizes.length = 0;
  const r = await t.json('/api/image', { method: 'POST', cookie: u.cookie, body: { prompt: 'ทะเล', size: '1536x1024' } });
  assert.equal(r.status, 200); assert.equal(sizes[0], '1536x1024');
  fm.close();
});

test('a picture stored as a data URL in an earlier answer is not sent to the next model as text', async () => {
  const { t, m, u, fm } = await setup((fm, res) => fm.sse(res, 'ได้ครับ'), { tools: 'off' });
  const cid = t.DB.raw.prepare("INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id").get(u.id, 'รูป', Date.now()).id;
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)").run(cid, 'user', 'วาดน้ำกระเซ็น', Date.now());
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)").run(cid, 'assistant', '![water splash](data:image/jpeg;base64,' + 'A'.repeat(250000) + ')', Date.now());
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ปรับเป็นลายการ์ตูน', model_id: m.id, chat_id: cid } }));
  assert.ok(ev.some(e => e.t === 'ได้ครับ'));
  const sent = JSON.stringify(fm.hits[0].body.messages);
  assert.ok(sent.length < 20000, 'request size ' + sent.length); assert.match(sent, /\[image created: water splash\]/);
  fm.close();
});

test('Code mode: todo_write streams a live checklist (not a tool step); plan mode hides write tools, refuses edits and asks for a plan', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    const tools = body.messages.filter(x => x.role === 'tool');
    if (!tools.length) return toolSSE(res, [['todo_write', { todos: [{ content: 'อ่านไฟล์', status: 'in_progress' }, { content: 'แก้หัวข้อ', status: 'pending' }, { content: '', status: 'x' }] }], ['edit_file', { path: 'a.js', old_string: 'let a = 1', new_string: 'let a = 2' }]]);
    return fm.sse(res, 'เสร็จ');
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: 'a.js', content: 'let a = 1\n' } });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'แก้', model_id: m.id, project_id: pid } }));
  assert.deepEqual(ev.find(e => e.todo).todo, [{ content: 'อ่านไฟล์', status: 'in_progress' }, { content: 'แก้หัวข้อ', status: 'pending' }]);
  assert.ok(!ev.some(e => e.mcp?.tool === ''), 'todo_write is not shown as a step');
  assert.match(fm.hits[0].body.messages[0].content, /todo_write/);
  const n = fm.hits.length;
  const ev2 = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'วางแผน', model_id: m.id, project_id: pid, perm: 'plan' } }));
  const req = fm.hits[n].body;
  assert.ok(!req.tools.some(x => ['edit_file', 'write_file', 'delete_file'].includes(x.function.name)) && req.tools.some(x => x.function.name === 'read_file'));
  assert.match(req.messages[0].content, /PLAN MODE IS ON/);
  assert.match(fm.hits[n + 1].body.messages.filter(x => x.role === 'tool').at(-1).content, /plan mode is on/);
  assert.ok(!ev2.filter(e => e.t).map(e => e.t).join('').includes('path=a.js'), 'no edit block in plan mode');
  fm.close();
});

test('Code mode self-check: an edit that leaves a function never called, or a checklist with open items, gets one more round to finish before the answer ends', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    const last = body.messages.at(-1), tools = body.messages.filter(x => x.role === 'tool');
    if (!tools.length) return toolSSE(res, [['todo_write', { todos: [{ content: 'สร้างทะเล', status: 'completed' }, { content: 'เชื่อมทะเลกับฉาก', status: 'pending' }] }], ['edit_file', { path: 'app.js', old_string: 'function start() {}', new_string: 'function makeOcean() { return 1 }\nfunction start() {}' }]], 'เพิ่มทะเลแล้ว');
    if (last.role === 'user' && /Automatic check/.test(last.content)) return toolSSE(res, [['edit_file', { path: 'app.js', old_string: 'function start() {}', new_string: 'function start() { makeOcean() }' }], ['todo_write', { todos: [{ content: 'สร้างทะเล', status: 'completed' }, { content: 'เชื่อมทะเลกับฉาก', status: 'completed' }] }]], 'เชื่อมแล้ว');
    return fm.sse(res, 'เสร็จ');
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: 'app.js', content: 'function start() {}\nstart()\n' } });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ทำทะเล', model_id: m.id, project_id: pid } }));
  const note = fm.hits[1]?.body.messages.at(-1).content || '';
  assert.match(note, /Automatic check/); assert.match(note, /makeOcean/); assert.match(note, /เชื่อมทะเลกับฉาก/);
  assert.equal(fm.hits.length, 2, 'the fix round finishes cleanly: no third call');
  assert.ok(ev.some(e => e.done));
  fm.close();
});

test('Code mode: the AI only read files and stopped with an unfinished checklist → it is told to keep going with the tools', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    const last = body.messages.at(-1), tools = body.messages.filter(x => x.role === 'tool');
    if (!tools.length) return toolSSE(res, [['todo_write', { todos: [{ content: 'รันบนเครื่องจริง', status: 'pending' }] }], ['read_file', { path: 'app.js' }]]);
    if (last.role === 'user' && /stopped before doing the work/.test(last.content)) return toolSSE(res, [['todo_write', { todos: [{ content: 'รันบนเครื่องจริง', status: 'completed' }] }]]);
    return fm.sse(res, "Let's run things on the real machine.");
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: 'app.js', content: 'x\n' } });
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ทำ', model_id: m.id, project_id: pid } }));
  assert.ok(fm.hits.some(h => /stopped before doing the work/.test(h.body.messages.at(-1).content || '')), 'nudged to continue');
  fm.close();
});

test('Code mode history: older user messages drop the project file list and attached file contents; the newest keeps them', async () => {
  const { stripOpenFile } = await import('../src/ai.js');
  assert.equal(stripOpenFile('ทำปุ่ม\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\na.js\nb.js\n\n[เนื้อหาไฟล์ที่เปิดอยู่]\na.js:\nx'), 'ทำปุ่ม');
  assert.equal(stripOpenFile('แค่ข้อความ'), 'แค่ข้อความ');
});

test('Code mode: a round that only writes the checklist does not end the answer', async () => {
  const { t, m, u, fm } = await setup((fm, res, body) => {
    const tools = body.messages.filter(x => x.role === 'tool');
    if (!tools.length) return toolSSE(res, [['todo_write', { todos: [{ content: 'แก้ a', status: 'in_progress' }] }]]);
    if (tools.length === 1) return toolSSE(res, [['edit_file', { path: 'a.js', old_string: 'let a = 1', new_string: 'let a = 2' }], ['todo_write', { todos: [{ content: 'แก้ a', status: 'completed' }] }]], 'แก้แล้ว');
    return fm.sse(res, 'should not be called');
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: 'a.js', content: 'let a = 1\n' } });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'แก้', model_id: m.id, project_id: pid } }));
  assert.equal(fm.hits.length, 2, 'checklist round, then the edit round ends it');
  assert.ok(ev.filter(e => e.t).map(e => e.t).join('').includes('path=a.js'));
  fm.close();
});

// ไฟล์ในบัญชี: แก้ Excel ทีละคำสั่ง (สูตร {r}, เพิ่มคอลัมน์, จัดรูปแบบ) · แก้ Word ด้วย replace · ล้มทั้งชุดถ้ามีคำสั่งผิด
test('account files: sheet and doc ops apply in order and fail as a whole', async () => {
  const F = await import('../src/files.js');
  const b = F.parseSheetContent('item,cost,price\nA,6,10\nB,3,5');
  assert.deepEqual(b.sheets[0].rows[1], ['A', 6, 10]);
  const r = F.applySheetOps(b, [{ op: 'add_column', header: 'Profit', formula: '=C{r}-B{r}' }, { op: 'append_rows', rows: [['Total', '=SUM(B2:B3)', '=SUM(C2:C3)', '=SUM(D2:D3)']] }, { op: 'format', number_formats: { d: '#,##0.00' } }, { op: 'set_cells', cells: { A2: 'Apple' } }]);
  const s = r.data.sheets[0];
  assert.deepEqual(s.rows[1], ['Apple', 6, 10, '=C2-B2']); assert.equal(s.rows[3][3], '=SUM(D2:D3)'); assert.equal(s.fmt.D, '#,##0.00');
  assert.match(F.sheetText(r.data), /4\tTotal\t=SUM\(B2:B3\)/);
  assert.throws(() => F.applySheetOps(b, [{ op: 'set_cells', cells: { A1: 'x' } }, { op: 'nope' }]), /unknown op/);
  assert.equal(b.sheets[0].rows[0][0], 'item'); // ต้นฉบับไม่ถูกแก้
  const d = F.applyDocOps({ md: '# สัญญา\nราคา 100 บาท' }, [{ op: 'replace', find: '100', with: '200' }, { op: 'append', text: 'ลงชื่อ' }]);
  assert.equal(d.data.md, '# สัญญา\nราคา 200 บาท\n\nลงชื่อ');
  assert.throws(() => F.applyDocOps({ md: 'a' }, [{ op: 'replace', find: 'zz', with: 'y' }]), /not found/);
  assert.equal(F.colName(27), 'AB'); assert.equal(F.colNum('AB'), 27);
});

test('Code mode harness: write_file over an unread existing file is refused until read_file; a loop of the same call is warned at 3 and stopped at 5', async () => {
  let n = 0;
  const { t, m, u, fm } = await setup((fm, res, body) => {
    n++; const tools = body.messages.filter(x => x.role === 'tool');
    if (tools.length === 0) return toolSSE(res, [['write_file', { path: 'a.js', content: 'let a = 2\n' }]]);
    if (tools.length === 1) return toolSSE(res, [['read_file', { path: 'a.js' }]]);
    return toolSSE(res, [['write_file', { path: 'a.js', content: 'let a = 2\n' }]], 'เขียนใหม่แล้ว');
  });
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
  await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: 'a.js', content: 'let a = 1 // งานผู้ใช้\n' } });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'เปลี่ยน a เป็น 2', model_id: m.id, project_id: pid } }));
  assert.match(fm.hits[1].body.messages.find(x => x.role === 'tool').content, /NOT overwritten/);
  assert.ok(ev.some(e => e.mcp && !e.mcp.ok && /ยังไม่ได้อ่าน/.test(e.mcp.tool)), 'the user sees why');
  assert.deepEqual(changesOf(ev.filter(e => e.t).map(e => e.t).join(''), () => null).map(c => c.path), ['a.js'], 'written once, after reading');
  fm.close();

  const L = await setup((fm, res) => toolSSE(res, [['read_file', { path: 'a.js' }]]));
  const pid2 = (await L.t.json('/api/projects', { method: 'POST', cookie: L.u.cookie, body: { name: 'p', empty: true } })).data.id;
  await L.t.json(`/api/projects/${pid2}/file`, { method: 'PUT', cookie: L.u.cookie, body: { path: 'a.js', content: 'x\n' } });
  const ev2 = await readSSE(await L.t.call('/api/chat', { method: 'POST', cookie: L.u.cookie, body: { text: 'ทำงาน', model_id: L.m.id, project_id: pid2 } }));
  assert.equal(L.fm.hits.length, 5, 'stopped at 5 identical rounds instead of 40');
  assert.ok(L.fm.hits[3].body.messages.some(x => x.role === 'user' && /Kyber Harness · loop/.test(x.content)), 'warned after 3');
  assert.match(ev2.filter(e => e.t).map(e => e.t).join(''), /ทำสิ่งเดิมซ้ำหลายรอบ/);
  L.fm.close();
});
