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

test('monthly digest: paid users with usage last month get one email, opted-out users none, re-runs do not resend', async () => {
  const t = await makeEnv({ RESEND_KEY: 'rk' }), m = addModel(t.DB, { name: 'M', base_url: 'http://x' }); t.DB.raw.prepare('UPDATE models SET price_in=10, price_out=20 WHERE id=?').run(m.id);
  const plan = addPlan(t.DB, { price: 1, models: [m.id] }), a = await t.user(), b = await t.user(), c = await t.user();
  const at = Date.UTC(2026, 10, 1, 4, 0) /* 1 พ.ย. 11:00 เวลาไทย */, last = Date.UTC(2026, 9, 15);
  for (const u of [a, b, c]) { t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, at + 30 * 864e5, u.id); t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,1000000,0,0,1,1,?)').run(u.id, m.id, last); }
  assert.equal((await t.json('/api/me', { method: 'PUT', cookie: b.cookie, body: { digest: false } })).status, 200);
  const sent = [], orig = globalThis.fetch; globalThis.fetch = async (u, o) => { if (String(u).includes('resend')) { sent.push(JSON.parse(o.body)); return new Response('{}'); } return orig(u, o); };
  const { monthlyDigest } = await import('../src/jobs.js');
  try { assert.equal(await monthlyDigest(t.env, at), 2); assert.equal(await monthlyDigest(t.env, at), 0, 'cursor stops resends'); assert.equal(await monthlyDigest(t.env, at - 864e5), 0, 'only on day 1'); }
  finally { globalThis.fetch = orig; }
  assert.deepEqual(sent.map(x => x.to).sort(), [a.email, c.email].sort()); assert.match(sent[0].html, /฿10\.00/); assert.match(sent[0].subject, /2026-10/);
});

test('image prompt helper: uses ChatGPT 6.1 Sol when the plan has it, sends attached pictures, returns only the prompt', async () => {
  const { fakeModel } = await import('./helpers.mjs'); const seen = [];
  const fm = await fakeModel((q, res, body) => { seen.push(body); fm.sse(res, '"A cat wearing round glasses, soft studio light, 50mm"'); });
  const t = await makeEnv({ K: 'k' }), sol = addModel(t.DB, { name: 'ChatGPT 6.1 Sol', base_url: fm.url, api_model: 'sol' }), flash = addModel(t.DB, { name: 'DeepSeek 4.1 Flash 1017', base_url: fm.url, api_model: 'flash' });
  t.DB.raw.prepare('UPDATE models SET vision=1 WHERE id=?').run(sol.id);
  const plan = addPlan(t.DB, { price: 100, models: [sol.id, flash.id], limit_4h: 1e6, limit_week: 1e6 }), u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  const r = await t.json('/api/image/prompt', { method: 'POST', cookie: u.cookie, body: { text: 'แมวใส่แว่น', images: [img, 'javascript:alert(1)'] } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.prompt, 'A cat wearing round glasses, soft studio light, 50mm'); assert.equal(r.data.model, 'ChatGPT 6.1 Sol');
  assert.equal(seen[0].model, 'sol'); const parts = seen[0].messages.at(-1).content; assert.ok(Array.isArray(parts) && parts.filter(p => p.type === 'image_url').length === 1, 'only the valid picture is sent');
  assert.equal((await t.json('/api/image/prompt', { method: 'POST', cookie: u.cookie, body: {} })).status, 400);
  fm.close();
});

test('site promo: paid plans get x2 on the 4h window and x1.5 on the week until the end date; free plan unchanged', async () => {
  const t = await makeEnv(), paid = addPlan(t.DB, { price: 349, limit_4h: 10, limit_week: 40 }), u = await t.user(), f = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(paid.id, Date.now() + 864e5, u.id);
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,1,0,0,0,5,5,?)').run(u.id, Date.now());
  t.DB.raw.prepare('UPDATE users SET sess_start=?, week_start=? WHERE id=?').run(Date.now() - 1000, Date.now() - 1000, u.id);
  const pct = async c => (await t.json('/api/me', { cookie: c })).data.usage;
  let st = await pct(u.cookie); assert.equal(st.pct4h, 50); assert.equal(st.pctWeek, 12.5);
  for (const [k, v] of [['promo_until', String(Date.now() + 864e5)], ['promo_x4h', '2'], ['promo_xweek', '1.5']]) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
  const t2 = await makeEnv(); void t2; // แคชโปรอยู่ในโมดูล: ใช้ Worker ชุดใหม่เพื่ออ่านค่าใหม่
  const { loadWorker } = await import('./helpers.mjs'); t.worker = await loadWorker();
  const call = async c => (await (await t.worker.default.fetch(new Request('https://t.test/api/me', { headers: { cookie: c } }), t.env, t.ctx)).json());
  st = (await call(u.cookie)).usage; assert.equal(st.pct4h, 25); assert.equal(st.pctWeek, 8.3);
  const pub = await (await t.worker.default.fetch(new Request('https://t.test/api/settings/public'), t.env, t.ctx)).json(); assert.equal(pub.promo.x4h, 2);
  t.DB.raw.prepare("UPDATE settings SET value=? WHERE key='promo_until'").run(String(Date.now() - 1000)); t.worker = await loadWorker();
  st = (await call(u.cookie)).usage; assert.equal(st.pct4h, 50, 'promo ended'); void f;
});

test('context report: Code mode counts project files, compares every plan model and splits real usage by model', async () => {
  const t = await makeEnv({ K: 'k' }), a = addModel(t.DB, { name: 'Big', base_url: 'http://x' }), b = addModel(t.DB, { name: 'Small', base_url: 'http://x' });
  t.DB.raw.prepare('UPDATE models SET ctx_k=1050 WHERE id=?').run(a.id); t.DB.raw.prepare('UPDATE models SET ctx_k=128 WHERE id=?').run(b.id);
  const plan = addPlan(t.DB, { price: 100, models: [a.id, b.id] }), u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'P' } })).data.id;
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at,project_id) VALUES (?,?,?,?) RETURNING id').get(u.id, 'x', Date.now(), pid).id;
  for (const [m, tin] of [[a.id, 1000], [a.id, 3000], [b.id, 500]]) { t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'user','hi',?)").run(c, Date.now()); t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,model_id,tin,tout,created_at) VALUES (?,'assistant','ok',?,?,10,?)").run(c, m, tin, Date.now()); }
  const r = (await t.json(`/api/context?project_id=${pid}&chat_id=${c}&model_id=${a.id}`, { cookie: u.cookie })).data;
  assert.ok(r.parts.some(p => p.k === 'files' && /ไฟล์โปรเจกต์/.test(p.label)), 'project files counted');
  assert.deepEqual(r.models.map(m => [m.name, m.max]), [['Big', 1050000], ['Small', 128000]]); assert.ok(r.models[1].pct > r.models[0].pct);
  const big = r.byModel.find(m => m.name === 'Big'); assert.equal(big.replies, 2); assert.equal(big.tin, 4000); assert.equal(big.peak, 3000);
});
