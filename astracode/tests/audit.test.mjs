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

test('wallet-only users (free plan with balance): API key and every public model, charged at sell price without plan limits', async () => {
  const { fakeModel } = await import('./helpers.mjs'); const fm = await fakeModel((q, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' }), luna = addModel(t.DB, { name: 'ChatGPT 6 Luna', base_url: fm.url }), pro = addModel(t.DB, { name: 'Pro model', base_url: fm.url });
  t.DB.raw.prepare('UPDATE models SET price_in=1000, price_out=1000 WHERE id IN (?,?)').run(luna.id, pro.id);
  const free = t.DB.raw.prepare('SELECT id FROM plans WHERE price=0 AND active=1 ORDER BY sort LIMIT 1').get(); t.DB.raw.prepare('INSERT OR IGNORE INTO plan_models VALUES (?,?)').run(free.id, luna.id);
  const poor = await t.user(), rich = await t.user({ balance: 10 });
  assert.equal((await t.json('/api/keys', { method: 'POST', cookie: poor.cookie, body: { name: 'x' } })).status, 403);
  const me = (await t.json('/api/me', { cookie: rich.cookie })).data; assert.ok(me.models.find(m => m.id === pro.id)?.wallet, 'off-plan model offered as wallet');
  const k = await t.json('/api/keys', { method: 'POST', cookie: rich.cookie, body: { name: 'x' } }); assert.equal(k.status, 200, JSON.stringify(k.data));
  const r = await t.worker.default.fetch(new Request('https://t.test/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + k.data.key, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'chatgpt-6-luna', messages: [{ role: 'user', content: 'hi' }] }) }), t.env, t.ctx);
  const body = await r.text(); assert.equal(r.status, 200, body);
  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(rich.id).balance; const b1 = bal(); assert.ok(b1 < 10, 'luna charged at sell price even though it is in the free plan');
  t.DB.raw.exec('DELETE FROM rate');
  const { readSSE } = await import('./helpers.mjs'); const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: rich.cookie, body: { model_id: pro.id, text: 'hello' } }));
  assert.ok(ev.some(e => e.done), JSON.stringify(ev).slice(0, 200)); assert.ok(bal() < b1, 'web chat on an off-plan model charged from the wallet');
  assert.equal(t.DB.raw.prepare('SELECT COALESCE(SUM(units),0) u FROM usage WHERE user_id=?').get(rich.id).u, 0, 'plan limits untouched');
  fm.close();
});

test('team worker: code blocks without path= are matched to missing scope files by extension', async () => {
  const { guessFiles } = await import('../src/agent.js');
  const r = guessFiles('x\n```css\nbody { color: red; margin: 0 }\n```\n```js\nconsole.log("hello world 123")\n```\n```js path=a.js\nx\n```\n```\nambiguous block text here!!\n```', ['style.css', 'add.js', 'add.html']);
  assert.deepEqual(r.map(f => f.path).sort(), ['add.js', 'style.css']);
  assert.equal(guessFiles('```\nonly one file here, no lang\n```', ['a.txt'])[0].path, 'a.txt');
});

test('web push: aes128gcm payload decrypts on the receiver side (RFC 8291)', async () => {
  const { encrypt, b64u, unb64u } = await import('../src/push.js'), S = crypto.subtle, te = new TextEncoder();
  const ua = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), uaPub = new Uint8Array(await S.exportKey('raw', ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  const body = await encrypt('{"title":"สวัสดี"}', b64u(uaPub), b64u(auth));
  const salt = body.slice(0, 16), asPub = body.slice(21, 86), ct = body.slice(86);
  assert.equal(body[20], 65);
  const hk = async (s, ikm, info, bits) => new Uint8Array(await S.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await S.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bits));
  const shared = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: await S.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, ua.privateKey, 256));
  const ikm = await hk(auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...uaPub, ...asPub]), 256);
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 128), nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 96);
  const pt = new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: nonce }, await S.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  assert.equal(pt.at(-1), 2); assert.equal(new TextDecoder().decode(pt.slice(0, -1)), '{"title":"สวัสดี"}');
  assert.deepEqual([...unb64u(b64u(auth))], [...auth]);
});

test('web push: subscribe validates the endpoint host and stores one row per endpoint', async () => {
  const t = await makeEnv(), u = await t.user();
  assert.equal((await t.json('/api/push/key', { cookie: u.cookie })).data.key.length, 87);
  const keys = { p256dh: 'B' + 'a'.repeat(86), auth: 'a'.repeat(22) };
  assert.equal((await t.json('/api/push/sub', { method: 'POST', cookie: u.cookie, body: { endpoint: 'https://127.0.0.1/x', keys } })).status, 400);
  for (let i = 0; i < 2; i++) assert.equal((await t.json('/api/push/sub', { method: 'POST', cookie: u.cookie, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys } })).status, 200);
  assert.equal((await t.json('/api/push/sub', { cookie: u.cookie })).data.n, 1);
});

test('remix copies a shared project to the caller; gallery lists only featured shared projects', async () => {
  const t = await makeEnv(), a = await t.user(), b = await t.user(), adm = await t.user({ role: 'admin' });
  const p = (await t.json('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'เว็บเดโม' } })).data;
  const tok = (await t.json(`/api/projects/${p.id}/share`, { method: 'POST', cookie: a.cookie })).data.token;
  assert.equal((await t.json('/api/projects/remix', { method: 'POST', cookie: b.cookie, body: { token: 'nope-nope' } })).status, 404);
  const r = (await t.json('/api/projects/remix', { method: 'POST', cookie: b.cookie, body: { token: tok } })).data;
  const n = id => t.DB.raw.prepare('SELECT COUNT(*) n FROM project_files WHERE project_id=?').get(id).n;
  assert.ok(n(r.id) > 0); assert.equal(n(r.id), n(p.id));
  assert.equal(t.DB.raw.prepare('SELECT user_id FROM projects WHERE id=?').get(r.id).user_id, b.id);
  assert.equal((await t.json('/api/gallery', { cookie: b.cookie })).data.length, 0);
  assert.equal((await t.json('/api/admin/shared/' + p.id, { method: 'PUT', cookie: adm.cookie, body: { featured: true } })).status, 200);
  assert.equal((await t.json('/api/gallery', { cookie: b.cookie })).data[0].link, tok);
});

test('long PDF excerpts keep the page number in front of chunks cut from mid-page', async () => {
  const { excerptFiles } = await import('../src/ai.js');
  const pages = []; for (let i = 1; i <= 40; i++) pages.push(`--- หน้า ${i} ---\n` + (i === 33 ? 'ยอดขายไตรมาสสาม ' : 'ข้อความทั่วไป ').repeat(90));
  const out = excerptFiles('[[file:a.pdf]]\n' + pages.join('\n') + '\n[[/file]]', 'ยอดขายไตรมาสสาม');
  assert.match(out, /--- หน้า 3[23]( \(ต่อ\))? ---\n[^]*ยอดขายไตรมาสสาม/);
  assert.ok(out.length < 34000);
});

test('passkey: register with a software authenticator, log in with a signed assertion, replay is refused', async () => {
  const t = await makeEnv(), u = await t.user(), S = crypto.subtle, te = new TextEncoder();
  const { b64u, unb64u } = await import('../src/push.js');
  const kp = await S.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), spki = b64u(await S.exportKey('spki', kp.publicKey));
  const cd = (type, challenge) => b64u(te.encode(JSON.stringify({ type, challenge, origin: 'https://t.test' })));
  const ro = (await t.json('/api/passkey/register-options', { method: 'POST', cookie: u.cookie })).data;
  assert.equal(ro.rp.id, 't.test');
  assert.equal((await t.json('/api/passkey/register', { method: 'POST', cookie: u.cookie, body: { id: 'cred-abcdefghijklmnop', clientDataJSON: cd('webauthn.create', 'wrong'), publicKey: spki, alg: -7 } })).status, 400);
  assert.equal((await t.json('/api/passkey/register', { method: 'POST', cookie: u.cookie, body: { id: 'cred-abcdefghijklmnop', clientDataJSON: cd('webauthn.create', ro.challenge), publicKey: spki, alg: -7 } })).status, 200);
  const toDer = raw => { const i = b => { let x = [...b]; while (x.length > 1 && x[0] === 0 && !(x[1] & 0x80)) x.shift(); if (x[0] & 0x80) x.unshift(0); return [2, x.length, ...x]; }; const body = [...i(raw.slice(0, 32)), ...i(raw.slice(32))]; return new Uint8Array([0x30, body.length, ...body]); };
  const assertion = async (count) => {
    const lo = (await t.json('/api/passkey/login-options')).data, c = cd('webauthn.get', lo.challenge);
    const ad = new Uint8Array(37); ad.set(new Uint8Array(await S.digest('SHA-256', te.encode('t.test')))); ad[32] = 5; new DataView(ad.buffer).setUint32(33, count);
    const msg = new Uint8Array([...ad, ...new Uint8Array(await S.digest('SHA-256', unb64u(c)))]);
    const sig = toDer(new Uint8Array(await S.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, msg)));
    return { id: 'cred-abcdefghijklmnop', clientDataJSON: c, authenticatorData: b64u(ad), signature: b64u(sig) };
  };
  const a1 = await assertion(1), r1 = await t.call('/api/passkey/login', { method: 'POST', body: a1 });
  assert.equal(r1.status, 200); assert.match(r1.headers.get('set-cookie'), /^sid=/);
  assert.equal((await t.call('/api/passkey/login', { method: 'POST', body: a1 })).status, 401); // challenge ใช้ซ้ำไม่ได้
  assert.equal((await t.call('/api/passkey/login', { method: 'POST', body: await assertion(1) })).status, 401); // ตัวนับไม่เดิน
  assert.equal((await t.call('/api/passkey/login', { method: 'POST', body: await assertion(2) })).status, 200);
});

test('chat import stores user/assistant turns only; badges endpoint reports progress', async () => {
  const t = await makeEnv(), u = await t.user();
  const r = await t.json('/api/chats/import', { method: 'POST', cookie: u.cookie, body: { chats: [{ title: 'เก่า', created_at: 1.7e12, messages: [{ role: 'user', content: 'สวัสดี' }, { role: 'system', content: 'x' }, { role: 'assistant', content: 'ครับ' }] }, { title: 'ว่าง', messages: [] }] } });
  assert.equal(r.data.imported, 1);
  const c = t.DB.raw.prepare('SELECT id,title FROM chats WHERE user_id=?').get(u.id); assert.match(c.title, /เก่า/);
  assert.deepEqual(t.DB.raw.prepare('SELECT role FROM messages WHERE chat_id=? ORDER BY id').all(c.id).map(x => x.role), ['user', 'assistant']);
  const b = (await t.json('/api/badges', { cookie: u.cookie })).data;
  assert.equal(b.badges.length, 8); assert.equal(b.msgs, 1);
});

test('agent live status: writing a file shows its line, editing shows the matched line, READ shows the file', async () => {
  const { doingNow, doingLine } = await import('../src/agent.js');
  assert.equal(doingNow('ok\n```css path=style.css\nbody{}\na{}\n').text, 'กำลังเขียน style.css บรรทัดที่ 3');
  const d = doingNow('```js path=app.js\n<<<<<<< SEARCH\nconst total = 0;\n=======\nconst total = 1;');
  assert.equal(doingLine(d, 'let a;\nlet b;\nconst total = 0;\n'), 'กำลังแก้ app.js บรรทัดที่ 3');
  assert.equal(doingNow('ขออ่านก่อน\nREAD path=index.html').text, 'กำลังอ่าน index.html');
  assert.match(doingNow('```js path=a.js\nx\n```\nเสร็จแล้ว').text, /^กำลังคิด: เสร็จแล้ว/);
});

test('shared multi-page site: /p/<link>/<page>.html serves that page with a base href; defer scripts move after the body', async () => {
  const { bundleProject } = await import('../src/ai.js');
  const out = bundleProject(new Map([['index.html', '<html><head><script src="a.js" defer></script></head><body data-page="x"><a href="add.html">add</a></body></html>'], ['a.js', 'document.body.dataset.page'], ['add.html', '<html><head></head><body>ADD</body></html>']]));
  assert.ok(out.indexOf('document.body.dataset.page') > out.indexOf('<body')); assert.doesNotMatch(out, /defer/);
  const t = await makeEnv(), u = await t.user();
  const p = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'multi' } })).data;
  t.DB.raw.prepare("INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,0)").run(p.id, 'add.html', '<html><head></head><body>ADD PAGE</body></html>');
  const tok = (await t.json(`/api/projects/${p.id}/share`, { method: 'POST', cookie: u.cookie })).data.token;
  const h = await (await t.call(`/p/${tok}/add.html`)).text();
  assert.match(h, /ADD PAGE/); assert.match(h, new RegExp(`<base href="/p/${tok}/">`));
});

test('gallery submission waits for admin approval; agent line diff counts adds and removals', async () => {
  const t = await makeEnv(), u = await t.user(), adm = await t.user({ role: 'admin' });
  const p = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'ผลงาน' } })).data;
  assert.equal((await t.json(`/api/projects/${p.id}/gallery`, { method: 'POST', cookie: u.cookie, body: { blurb: 'แอปตัวอย่างทำด้วย Agent' } })).status, 400); // ยังไม่แชร์
  await t.json(`/api/projects/${p.id}/share`, { method: 'POST', cookie: u.cookie });
  assert.equal((await t.json(`/api/projects/${p.id}/gallery`, { method: 'POST', cookie: u.cookie, body: { blurb: 'แอปตัวอย่างทำด้วย Agent' } })).data.featured, 2);
  assert.equal((await t.json('/api/gallery')).data.length, 0);
  await t.json('/api/admin/shared/' + p.id, { method: 'PUT', cookie: adm.cookie, body: { featured: true } });
  assert.equal((await t.json('/api/gallery')).data[0].blurb, 'แอปตัวอย่างทำด้วย Agent');
  const { lineDiff } = await import('../src/agent.js');
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nc\nd\ne'), [2, 1]); assert.deepEqual(lineDiff('', 'x\ny'), [2, 0]);
});

test('agent estimate grows with team and project size; resume only for stopped jobs', async () => {
  const { estimateAgent } = await import('../src/agent.js');
  const m = { cost_in: 30, cost_out: 120, cost_cache: 3, use_mult: 1 }, w = { cost_in: 2, cost_out: 8, cost_cache: 0.2, use_mult: 1 };
  const small = estimateAgent(m, null, 3000, 3, 100), big = estimateAgent(m, null, 90000, 20, 100), team = estimateAgent(m, w, 90000, 20, 100);
  assert.ok(small.low <= small.high && big.high > small.high && team.high > 0);
  const t = await makeEnv(), u = await t.user();
  assert.equal((await t.json('/api/agent/999/resume', { method: 'POST', cookie: u.cookie })).status, 404);
});

test('cron flags a user whose 24h cost jumps far above their 7-day average (once per day)', async () => {
  const t = await makeEnv(), u = await t.user(), now = Date.now();
  const ins = t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,1,0,0,0,0,?,?)');
  for (let d = 2; d <= 7; d++) ins.run(u.id, 1, now - d * 864e5); ins.run(u.id, 60, now - 3600e3);
  const { cron } = await import('../src/jobs.js'); await cron(t.env);
  assert.ok(t.DB.raw.prepare("SELECT 1 FROM rate WHERE key=?").get('anom:' + u.id));
});

test('temporary email domains cannot register (built-in list and admin list)', async () => {
  const { tempEmail } = await import('../src/core.js');
  const t = await makeEnv();
  assert.ok(await tempEmail(t.env, 'a@mailinator.com')); assert.ok(await tempEmail(t.env, 'a@x.yopmail.com'));
  assert.ok(!await tempEmail(t.env, 'a@gmail.com'));
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('block_domains','bad.example, worse.example')").run();
  assert.ok(await tempEmail(t.env, 'x@worse.example'));
  assert.equal((await t.json('/api/auth', { method: 'POST', body: { action: 'register', email: 'z@mailinator.com', password: 'longenough1' } })).status, 400);
});

test('changelog lists only published posts marked changelog; public settings expose the latest time', async () => {
  const t = await makeEnv();
  const ins = t.DB.raw.prepare('INSERT INTO posts (slug,title,body,published,changelog,created_at) VALUES (?,?,?,?,?,?)');
  ins.run('a', 'บทความ', 'x', 1, 0, 1); ins.run('b', 'ฟีเจอร์ใหม่', 'y', 1, 1, 5); ins.run('c', 'ร่าง', 'z', 0, 1, 9);
  assert.deepEqual((await t.json('/api/changelog')).data.map(p => p.slug), ['b']);
  assert.equal((await t.json('/api/settings/public')).data.cl_latest, 5);
});

test('project members: owner invites by email, member edits files but cannot delete, share or read secrets; outsiders get 404', async () => {
  const t = await makeEnv(), a = await t.user(), b = await t.user(), c = await t.user();
  const p = (await t.json('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'ทีม' } })).data;
  const bEmail = t.DB.raw.prepare('SELECT email FROM users WHERE id=?').get(b.id).email;
  assert.equal((await t.json(`/api/projects/${p.id}`, { cookie: b.cookie })).status, 404);
  assert.equal((await t.json(`/api/projects/${p.id}/members`, { method: 'POST', cookie: a.cookie, body: { email: bEmail } })).status, 200);
  assert.ok((await t.json('/api/projects', { cookie: b.cookie })).data.some(x => x.id === p.id && x.shared));
  assert.equal((await t.json(`/api/projects/${p.id}/file`, { method: 'PUT', cookie: b.cookie, body: { path: 'b.txt', content: 'hi' } })).status, 200);
  for (const [path, method] of [[`/api/projects/${p.id}`, 'DELETE'], [`/api/projects/${p.id}/share`, 'POST'], [`/api/projects/${p.id}/env`, 'GET'], [`/api/projects/${p.id}/members`, 'POST']]) assert.equal((await t.json(path, { method, cookie: b.cookie, ...(method === 'GET' ? {} : { body: {} }) })).status, 403, path);
  assert.equal((await t.json(`/api/projects/${p.id}`, { cookie: c.cookie })).status, 404);
  assert.equal((await t.json(`/api/projects/${p.id}/members`, { method: 'DELETE', cookie: b.cookie, body: {} })).status, 200);
  assert.equal((await t.json(`/api/projects/${p.id}`, { cookie: b.cookie })).status, 404);
});

test('agent page screenshot: off without Cloudflare settings, sends the bundled page when set', async () => {
  const { pageShot } = await import('../src/agent.js');
  const t = await makeEnv(), u = await t.user();
  const p = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'shot' } })).data;
  assert.equal(await pageShot(t.env, p.id), null);
  const f0 = globalThis.fetch; let sent;
  globalThis.fetch = async (url, o) => { sent = { url, body: JSON.parse(o.body) }; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); };
  try { const s = await pageShot({ ...t.env, CF_ACCOUNT_ID: 'acc', CF_BR_TOKEN: 'tok' }, p.id); assert.equal(s, 'data:image/jpeg;base64,AQID'); assert.match(sent.url, /accounts\/acc\/browser-rendering\/screenshot/); assert.match(sent.body.html, /<html/i); }
  finally { globalThis.fetch = f0; }
});
