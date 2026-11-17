// ข้อที่พบจากการตรวจโค้ดทั้งรีโป: 2FA ใช้รหัสซ้ำ, เดารหัสเชิญทีม, แอดมินปิดลิงก์แชร์, งานตั้งเวลาที่ค้างตามให้ทัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addPlan } from './helpers.mjs';
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
