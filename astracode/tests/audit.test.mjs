// ข้อที่พบจากการตรวจโค้ดทั้งรีโป: 2FA ใช้รหัสซ้ำ, เดารหัสเชิญทีม, แอดมินปิดลิงก์แชร์, งานตั้งเวลาที่ค้างตามให้ทัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addPlan, addModel } from './helpers.mjs';
import { totp } from '../src/user.js';


test('2FA: a code works once; the same code cannot be replayed within its time window', async () => {
  const t = await makeEnv({ SECRET_KEY: 'test-secret-key-for-sealing-0123456789' }), u = await t.user();
  const { data } = await t.json('/api/2fa/setup', { method: 'POST', cookie: u.cookie }); assert.ok(data.secret);
  const step = Math.floor(Date.now() / 30000), code = await totp(data.secret, step);
  assert.equal((await t.json('/api/2fa/enable', { method: 'POST', cookie: u.cookie, body: { code } })).status, 200);
  assert.equal((await t.json('/api/2fa/disable', { method: 'POST', cookie: u.cookie, body: { code } })).status, 400, 'replayed code is refused');
  assert.equal((await t.json('/api/2fa/disable', { method: 'POST', cookie: u.cookie, body: { code: await totp(data.secret, step + 1) } })).status, 200, 'a newer code works');
});

test('team invite codes: guessing is rate limited', async () => {
  const t = await makeEnv(), u = await t.user(); let last;
  for (let i = 0; i < 11; i++) last = await t.json('/api/team/join', { method: 'POST', cookie: u.cookie, body: { code: 'NOPE' + i } });
  assert.equal(last.status, 429);
});

test('admin can list and close shared project links', async () => {
  const t = await makeEnv(), owner = await t.user(), adm = await t.user({ role: 'admin' }), other = await t.user();
  const p = await t.json('/api/projects', { method: 'POST', cookie: owner.cookie, body: { name: 'Shop' } }); const pid = p.data.id ?? p.data.project?.id;
  t.DB.raw.prepare("INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)").run(pid, 'index.html', '<h1>hi</h1>', Date.now());
  const sh = await t.json(`/api/projects/${pid}/share`, { method: 'POST', cookie: owner.cookie }); assert.equal(sh.status, 200);
  const page = await (await t.call('/p/' + sh.data.token)).text(); assert.match(page, /href="\/support"/, 'report link on shared page');
  assert.equal((await t.json('/api/admin/shared', { cookie: other.cookie })).status, 403);
  const list = await t.json('/api/admin/shared', { cookie: adm.cookie }); assert.equal(list.data.length, 1); assert.equal(list.data[0].id, pid);
  assert.equal((await t.json('/api/admin/shared/' + pid, { method: 'DELETE', cookie: adm.cookie })).status, 200);
  assert.equal((await t.call('/p/' + sh.data.token)).status, 404);
});

test('scheduled tasks: one that was missed earlier today still runs; a task set for an hour already gone starts tomorrow', async () => {
  const t = await makeEnv(), u = await t.user(); const { runTasks } = await import('../src/jobs.js');
  t.DB.raw.prepare('INSERT INTO tasks (user_id,prompt,hour,search,created_at) VALUES (?,?,?,?,?)').run(u.id, 'สรุปข่าว AI วันนี้', 3, 0, Date.now());
  const at9 = new Date(); at9.setUTCHours(2, 0, 0, 0); // 09:00 เวลาไทย
  assert.equal(await runTasks(t.env, at9.getTime()), 1, 'hour 3 task is picked up at 09:00');
  assert.equal(await runTasks(t.env, at9.getTime()), 0, 'but only once per day');
  const plan = addPlan(t.DB, { price: 100 }); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const nowH = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  if (nowH > 0) { const r = await t.json('/api/tasks', { method: 'POST', cookie: u.cookie, body: { prompt: 'งานที่ชั่วโมงผ่านไปแล้ว', hour: nowH - 1 } }); assert.equal(r.status, 200); const row = t.DB.raw.prepare('SELECT last_day FROM tasks WHERE id=?').get(r.data.id); assert.ok(row.last_day > 0, 'booked for today so it waits until tomorrow'); }
});

test('project can be created from posted files (Canvas → Code); bad paths and huge files are refused', async () => {
  const t = await makeEnv(), u = await t.user();
  const ok = await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'จาก Canvas', files: { 'index.html': '<h1>x</h1>' } } }); assert.equal(ok.status, 200);
  assert.deepEqual(t.DB.raw.prepare('SELECT path FROM project_files WHERE project_id=?').all(ok.data.id).map(r => r.path), ['index.html']);
  assert.equal((await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'x', files: { '../evil': 'a' } } })).status, 400);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM projects').get().n, 1, 'failed create leaves no empty project');
});

test('chat delete goes to the trash, can be restored, then is gone for good; archived chats leave the list', async () => {
  const t = await makeEnv(), u = await t.user(), o = await t.user();
  const mk = title => t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, title, Date.now()).id;
  const a = mk('A'), b = mk('B'), c = mk('C'); const list = async () => (await t.json('/api/chats', { cookie: u.cookie })).data.map(x => x.title).sort().join();
  assert.equal(await list(), 'A,B,C');
  assert.equal((await t.json('/api/chats/' + a, { method: 'DELETE', cookie: u.cookie })).status, 200);
  assert.equal(await list(), 'B,C'); assert.equal((await t.json('/api/chats/' + a, { cookie: u.cookie })).status, 404, 'deleted chat cannot be opened');
  assert.equal((await t.json('/api/chats/trash', { cookie: u.cookie })).data.length, 1);
  assert.equal((await t.json(`/api/chats/${a}/restore`, { method: 'POST', cookie: o.cookie })).status, 404, 'only the owner can restore');
  assert.equal((await t.json(`/api/chats/${a}/restore`, { method: 'POST', cookie: u.cookie })).status, 200); assert.equal(await list(), 'A,B,C');
  await t.json('/api/chats/' + b, { method: 'PUT', cookie: u.cookie, body: { archived: 1 } }); assert.equal(await list(), 'A,C');
  assert.equal((await t.json('/api/chats/archived', { cookie: u.cookie })).data.length, 1);
  await t.json('/api/chats/' + c, { method: 'DELETE', cookie: u.cookie }); await t.json('/api/chats/' + c, { method: 'DELETE', cookie: u.cookie }); // ลบซ้ำ = ถาวร
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM chats WHERE id=?').get(c).n, 0);
  t.DB.raw.prepare('UPDATE chats SET deleted_at=? WHERE id=?').run(Date.now() - 31 * 864e5, mk('OLD')); t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM chats WHERE title='OLD'").get().n, 0, 'cron purges trash older than 30 days');
});

test('prompt library: a saved prompt keeps its as_text flag; chat cost route sums tokens and price', async () => {
  const t = await makeEnv(), u = await t.user(), o = await t.user();
  const sk = await t.json('/api/skills', { method: 'POST', cookie: u.cookie, body: { name: 'รีวิวโค้ด', content: 'ช่วยรีวิวโค้ดนี้', as_text: true } }); assert.equal(sk.status, 200); assert.equal(sk.data.as_text, 1);
  assert.equal((await t.json('/api/skills', { cookie: u.cookie })).data.find(x => x.id === sk.data.id).as_text, 1);
  const m = addModel(t.DB, { name: 'M', base_url: 'http://x' }); t.DB.raw.prepare('UPDATE models SET price_in=10, price_out=20 WHERE id=?').run(m.id);
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'T', Date.now()).id;
  for (const [tin, tout] of [[1000000, 500000], [1000000, 0]]) t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,model_id,tin,tout,created_at) VALUES (?,'assistant','a',?,?,?,?)").run(c, m.id, tin, tout, Date.now());
  const r = await t.json(`/api/chats/${c}/cost`, { cookie: u.cookie }); assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.replies, 2); assert.equal(r.data.tin, 2e6); assert.equal(r.data.baht, 2 * 10 + 0.5 * 20, 'price_in 10/M, price_out 20/M');
  assert.equal((await t.json(`/api/chats/${c}/cost`, { cookie: o.cookie })).status, 404);
});

test('project secrets (.env): stored sealed, readable only by the owner, never part of the project files; React template exists', async () => {
  const t = await makeEnv({ SECRET_KEY: 'test-secret-key-for-sealing-0123456789' }), u = await t.user(), o = await t.user();
  const p = await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'R', template: 'react' } }); assert.equal(p.status, 200);
  assert.deepEqual(t.DB.raw.prepare('SELECT path FROM project_files WHERE project_id=? ORDER BY path').all(p.data.id).map(r => r.path), ['app.jsx', 'index.html', 'style.css']);
  assert.equal((await t.json(`/api/projects/${p.data.id}/env`, { cookie: u.cookie })).data.text, '');
  assert.equal((await t.json(`/api/projects/${p.data.id}/env`, { method: 'PUT', cookie: u.cookie, body: { text: 'API_KEY=abc123' } })).status, 200);
  assert.equal((await t.json(`/api/projects/${p.data.id}/env`, { cookie: u.cookie })).data.text, 'API_KEY=abc123');
  assert.ok(!t.DB.raw.prepare('SELECT env_sealed FROM projects WHERE id=?').get(p.data.id).env_sealed.includes('abc123'), 'sealed at rest');
  assert.equal((await t.json(`/api/projects/${p.data.id}/env`, { cookie: o.cookie })).status, 404, 'other users cannot read it');
  const full = JSON.stringify((await t.json(`/api/projects/${p.data.id}`, { cookie: u.cookie })).data); assert.ok(!full.includes('abc123') && !full.includes('env_sealed'), 'not in the project payload');
});
