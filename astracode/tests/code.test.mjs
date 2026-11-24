// โหมด Code ฝั่งเซิร์ฟเวอร์: อ่านคำสั่งเครื่องมือของโมเดล (READ/GREP/LIST) และผลที่ส่งกลับ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

const load = async () => { const t = await makeEnv(); return { t, ai: await import(new URL('../src/ai.js', import.meta.url).href) }; };

test('toolReqs: reads READ/GREP/LIST lines, ignores fenced code, splits glued lines, caps at 12', async () => {
  const { ai } = await load(); const { toolReqs } = ai;
  assert.deepEqual(toolReqs('ขอดูไฟล์\nREAD path=src/a.js\nGREP foo\\(\nLIST src/'), [{ op: 'READ', arg: 'src/a.js' }, { op: 'GREP', arg: 'foo\\(' }, { op: 'LIST', arg: 'src/' }]);
  assert.deepEqual(toolReqs('ได้ครับREAD path=b.js'), [{ op: 'READ', arg: 'b.js' }]);
  assert.deepEqual(toolReqs('READ path=c.js กำลังอ่าน'), [{ op: 'READ', arg: 'c.js' }]);
  assert.deepEqual(toolReqs('```\nREAD path=x.js\n```\nเสร็จแล้ว'), [], 'lines inside a code fence are examples, not requests');
  assert.equal(toolReqs(Array.from({ length: 20 }, (_, i) => `READ path=f${i}.js`).join('\n')).length, 12);
});

test('runTools: READ returns the stored file, missing and image files are explained, GREP finds lines, LIST shows sizes', async () => {
  const { t, ai } = await load(), u = await t.user();
  const p = t.DB.raw.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').get(u.id, 'P', 1, 1);
  const put = (path, content) => t.DB.raw.prepare('INSERT INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)').run(p.id, path, content, 1);
  put('src/a.js', 'const x = 1;\nfunction hello() {}\n'); put('src/b.js', 'hello();\n'); put('img/c.png', 'data:image/png;base64,' + 'A'.repeat(2000)); put('big.txt', 'z'.repeat(150e3));
  const out = await ai.runTools(t.env, p.id, [{ op: 'READ', arg: 'src/a.js' }, { op: 'READ', arg: 'nope.js' }, { op: 'READ', arg: 'img/c.png' }, { op: 'GREP', arg: 'hello' }, { op: 'LIST', arg: 'src/' }]);
  assert.match(out, /\[READ src\/a\.js\]\nconst x = 1;/); assert.match(out, /\[READ nope\.js\]\n\(ไม่พบ/); assert.match(out, /รูปภาพ/);
  assert.match(out, /src\/a\.js:2: function hello/); assert.match(out, /src\/b\.js:1: hello\(\);/); assert.match(out, /src\/a\.js \(\d+ chars\)/);
  const big = await ai.runTools(t.env, p.id, [{ op: 'READ', arg: 'big.txt' }]);
  assert.ok(big.length < ai.READ_MAX + 800 && /ตัดเหลือ/.test(big), 'a huge file is cut at READ_MAX');
  const other = t.DB.raw.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').get(u.id, 'Q', 1, 1);
  assert.match(await ai.runTools(t.env, other.id, [{ op: 'READ', arg: 'src/a.js' }]), /ไม่พบ/, 'another project\'s files are not readable');
});

test('GREP: a catastrophic regex falls back to a plain text search and returns quickly', async () => {
  const { t, ai } = await load(), u = await t.user();
  const p = t.DB.raw.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').get(u.id, 'P', 1, 1);
  t.DB.raw.prepare('INSERT INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)').run(p.id, 'a.txt', 'a'.repeat(40) + '!\n', 1);
  const t0 = Date.now(); const out = await ai.runTools(t.env, p.id, [{ op: 'GREP', arg: '(a+)+$' }, { op: 'GREP', arg: 'x'.repeat(300) }]);
  assert.ok(Date.now() - t0 < 1500, 'finished in ' + (Date.now() - t0) + 'ms'); assert.match(out, /\(ไม่พบ\)/);
});

test('code chat: ASTRA.md reaches the system prompt, edit-block rules are taught, the open file is only kept in the latest message, rounds are reported', async () => {
  const fm = await fakeModel((q, res, body) => {
    const sys = body.messages[0].content, last = body.messages.at(-1).content;
    if (/READ path=a\.js/.test(JSON.stringify(body.messages.at(-2)?.content || '')) || typeof last === 'string' && last.includes('[ผลจากเครื่องมือ]')) return fm.sse(res, 'เสร็จแล้ว');
    fm.sse(res, 'ขอดูไฟล์\nREAD path=a.js');
  });
  const t = await makeEnv({ K: 'k' }), u = await t.user();
  const m = addModel(t.DB, { name: 'C', base_url: fm.url }), plan = addPlan(t.DB, { models: [m.id], price: 0 });
  t.DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const p = t.DB.raw.prepare('INSERT INTO projects (user_id,name,created_at,updated_at,instructions) VALUES (?,?,?,?,?) RETURNING id').get(u.id, 'P', 1, 1, 'ใช้ tab');
  const put = (path, c) => t.DB.raw.prepare('INSERT INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)').run(p.id, path, c, 1);
  put('a.js', 'let a = 1;\n'); put('ASTRA.md', 'Always use semicolons.');
  const send = text => t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, project_id: p.id, text } });
  const r1 = await send('แก้ a.js\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\na.js\nASTRA.md\n\n[เนื้อหาไฟล์ที่เปิดอยู่]\na.js:\nlet a = 1;'); const ev = await readSSE(r1); await Promise.all(t.ctx.pending);
  const sys = fm.hits[0].body.messages[0].content;
  assert.match(sys, /Always use semicolons/); assert.match(sys, /ใช้ tab/); assert.match(sys, /SEARCH[\s\S]*REPLACE/);
  const { TOOL_ROUNDS } = await import('../src/ai.js');
  assert.ok(ev.some(e => e.round === 2 && e.of === TOOL_ROUNDS + 1), 'round event sent'); // TOOL_ROUNDS + 1
  assert.equal(ev.at(-1).rounds, 2);
  const cid = ev.find(e => e.chat_id).chat_id;
  fm.hits.length = 0;
  const r2 = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, project_id: p.id, chat_id: cid, text: 'ต่อ\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\na.js\n\n[เนื้อหาไฟล์ที่เปิดอยู่]\na.js:\nlet a = 2;' } }); await readSSE(r2); await Promise.all(t.ctx.pending);
  const users = fm.hits[0].body.messages.filter(x => x.role === 'user').map(x => x.content);
  assert.ok(users.at(-1).includes('let a = 2;'), 'the latest message carries the open file');
  assert.ok(users.slice(0, -1).every(x => !x.includes('เนื้อหาไฟล์ที่เปิดอยู่')), 'older messages lose it');
  fm.close();
});

test('stripOpenFile removes the file list and the open-file tail from older messages', async () => {
  const { ai } = await load();
  assert.equal(ai.stripOpenFile('แก้\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\na.js\n\n[เนื้อหาไฟล์ที่เปิดอยู่]\na.js:\nx'), 'แก้');
  assert.equal(ai.stripOpenFile('ธรรมดา'), 'ธรรมดา');
});

test('small-project file block is stripped from older messages, and the round status line summarizes the tool calls', async () => {
  const { ai } = await load();
  assert.equal(ai.stripOpenFile('ทำต่อ\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\na.js\nb.js\n\n[เนื้อหาไฟล์ในโปรเจกต์]\nb.js:\nxxx'), 'ทำต่อ');
  assert.equal(ai.doingOf([{ op: 'READ', arg: 'a.js' }, { op: 'READ', arg: 'b.js' }, { op: 'GREP', arg: 'btn' }]), 'อ่าน a.js, b.js · ค้นหา btn');
  assert.equal(ai.doingOf(['1', '2', '3', '4', '5'].map(n => ({ op: 'READ', arg: n + '.js' }))), 'อ่าน 1.js, 2.js, 3.js +2');
  assert.equal(ai.doingOf([]), '');
});

test('long attached files are cut down to the parts that match the question; short files stay whole; each model family gets a hint', async () => {
  const { ai } = await load();
  const filler = 'lorem ipsum dolor sit amet '.repeat(80); // ~2k chars per block
  const body = Array.from({ length: 1000 }, (_, i) => i === 27 ? 'นโยบายคืนเงินภายใน 14 วัน refund_policy_days = 14 ' + filler : filler).join('');
  const msg = `สรุปให้หน่อย\n\n[[file:doc.txt]]\n${body}\n[[/file]]`;
  const out = ai.excerptFiles(msg, 'refund_policy_days คืนเงินกี่วัน');
  assert.ok(out.length < msg.length / 2); assert.ok(out.includes('refund_policy_days = 14')); assert.ok(out.includes('[[file:doc.txt]]') && out.includes('[[/file]]') && out.startsWith('สรุปให้หน่อย'));
  const small = 'x\n\n[[file:a.txt]]\nshort\n[[/file]]'; assert.equal(ai.excerptFiles(small, 'q'), small);
  assert.match(ai.familyHint({ name: 'Gemini 4', api_model: 'gemini-4', provider: 'openai' }), /path=/);
  assert.notEqual(ai.familyHint({ name: 'Claude', api_model: 'claude-x', provider: 'anthropic' }), ai.familyHint({ name: 'DeepSeek', api_model: 'deepseek', provider: 'openai' }));
});

test('deleting a project also deletes its file history, checkpoints and its project chats', async () => {
  const t = await makeEnv(), owner = await t.user(), member = await t.user();
  const id = (await t.json('/api/projects', { method: 'POST', cookie: owner.cookie, body: { name: 'P' } })).data.id;
  await t.json(`/api/projects/${id}/file`, { method: 'PUT', cookie: owner.cookie, body: { path: 'index.html', content: 'v2' } });
  await t.json(`/api/projects/${id}/checkpoint`, { method: 'POST', cookie: owner.cookie, body: { name: 'cp' } });
  assert.ok(t.DB.raw.prepare('SELECT COUNT(*) n FROM file_versions WHERE project_id=?').get(id).n > 0);
  const chat = t.DB.raw.prepare("INSERT INTO chats (user_id,title,created_at,project_id) VALUES (?,'c',?,?) RETURNING id").get(member.id, Date.now(), id).id;
  assert.equal((await t.json(`/api/projects/${id}`, { method: 'DELETE', cookie: member.cookie })).status, 404, 'someone else cannot delete');
  assert.equal((await t.json(`/api/projects/${id}`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM file_versions WHERE project_id=?').get(id).n, 0);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM chats WHERE id=?').get(chat).n, 0);
});
