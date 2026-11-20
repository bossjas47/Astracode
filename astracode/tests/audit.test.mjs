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
  const pm = (await t.json('/api/me', { cookie: poor.cookie })).data.models.find(m => m.id === pro.id); assert.ok(pm?.wallet && pm.locked, 'no balance: off-plan model shown locked'); assert.ok(!me.models.find(m => m.id === pro.id).locked);
  assert.equal((await t.json('/api/chat', { method: 'POST', cookie: poor.cookie, body: { model_id: pro.id, text: 'hi' } })).status, 403, 'locked model cannot be used');
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

test('first top-up bonus once (capped), affiliate commission to the referrer, KPI and churn report', async () => {
  const { applyPayment } = await import('../src/billing.js'), { kpiYesterday } = await import('../src/jobs.js');
  const t = await makeEnv(), ref = await t.user(), u = await t.user(), adm = await t.user({ role: 'admin' });
  t.DB.raw.prepare('UPDATE users SET referred_by=? WHERE id=?').run(ref.id, u.id);
  for (const [k, v] of [['aff_pct', '10'], ['first_topup_pct', '20'], ['referral_bonus', '0']]) t.DB.raw.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(k, v);
  const pay = (amount, slip = 'slip/a') => ({ id: Math.floor(Math.random() * 1e6), user_id: u.id, kind: 'topup', amount, slip_key: slip });
  const bal = id => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(id).balance;
  await applyPayment(t.env, pay(1000)); assert.equal(bal(u.id), 1100, '20% capped at 100');
  await applyPayment(t.env, pay(50)); assert.equal(bal(u.id), 1150, 'bonus only once');
  assert.equal(bal(ref.id), 105, 'referrer earns 10% of real payments');
  await applyPayment(t.env, pay(30, 'wallet')); assert.equal(bal(ref.id), 105, 'no commission on wallet-paid');
  const k = await kpiYesterday(t.env); assert.match(k.text, /สมัครใหม่/);
  assert.equal((await t.json('/api/admin/churn', { cookie: adm.cookie })).status, 200);
});

test('link reader: fetches http(s) pages as text, skips private hosts and attached file text', async () => {
  const { readLinks } = await import('../src/ai.js');
  const f0 = globalThis.fetch; const hit = [];
  globalThis.fetch = async u => { hit.push(String(u)); return new Response('<html><title>ข่าว</title><script>x()</script><body><p>' + 'เนื้อหาจริงของบทความ '.repeat(10) + '</p></body></html>', { headers: { 'content-type': 'text/html' } }); };
  try {
    const r = await readLinks('สรุปให้หน่อย https://example.com/news และ http://127.0.0.1/x http://localhost/y\n\n[[file:a.txt]]\nhttps://in-file.example\n[[/file]]');
    assert.equal(r.length, 1); assert.equal(r[0].title, 'ข่าว'); assert.doesNotMatch(r[0].text, /x\(\)/); assert.deepEqual(hit, ['https://example.com/news']);
  } finally { globalThis.fetch = f0; }
});

test('bookmarks: star a message, list and search it; per-chat instructions are saved', async () => {
  const t = await makeEnv(), u = await t.user(), o = await t.user();
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'แชต', Date.now());
  const m = t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'assistant','สูตรต้มยำกุ้ง',?) RETURNING id").get(c.id, Date.now());
  assert.equal((await t.json(`/api/messages/${m.id}/star`, { method: 'POST', cookie: o.cookie, body: { on: true } })).status, 404);
  assert.equal((await t.json(`/api/messages/${m.id}/star`, { method: 'POST', cookie: u.cookie, body: { on: true } })).status, 200);
  assert.equal((await t.json('/api/bookmarks?q=' + encodeURIComponent('ต้มยำ'), { cookie: u.cookie })).data.length, 1);
  assert.equal((await t.json('/api/bookmarks?q=zzz', { cookie: u.cookie })).data.length, 0);
  await t.json('/api/chats/' + c.id, { method: 'PUT', cookie: u.cookie, body: { instructions: 'ตอบเป็นภาษาอังกฤษ' } });
  assert.equal(t.DB.raw.prepare('SELECT instructions FROM chats WHERE id=?').get(c.id).instructions, 'ตอบเป็นภาษาอังกฤษ');
});

test('deploy to Vercel: token stored sealed, files sent without .env, images as base64', async () => {
  const t = await makeEnv({ SECRET_KEY: 'test-secret-key-for-sealing-0123456789' }), u = await t.user();
  const p = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'My Site' } })).data;
  t.DB.raw.prepare("INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,0),(?,?,?,0)").run(p.id, '.env', 'KEY=secret', p.id, 'logo.png', 'data:image/png;base64,AAAA');
  const f0 = globalThis.fetch; let sent;
  globalThis.fetch = async (url, o) => { if (String(url).startsWith('https://api.vercel.com')) { sent = { url: String(url), auth: o.headers.authorization, body: JSON.parse(o.body) }; return Response.json({ url: 'my-site-abc.vercel.app', alias: ['my-site.vercel.app'] }); } return f0(url, o); };
  try {
    const r = await t.json(`/api/projects/${p.id}/vercel`, { method: 'POST', cookie: u.cookie, body: { token: 'vercel_token_1234567890abc' } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.url, 'https://my-site.vercel.app');
    assert.equal(sent.auth, 'Bearer vercel_token_1234567890abc'); assert.equal(sent.body.name, 'my-site');
    assert.ok(!sent.body.files.some(f => f.file === '.env')); assert.deepEqual(sent.body.files.find(f => f.file === 'logo.png'), { file: 'logo.png', data: 'AAAA', encoding: 'base64' });
    assert.doesNotMatch(t.DB.raw.prepare('SELECT vercel_token FROM users WHERE id=?').get(u.id).vercel_token, /vercel_token_1234567890abc/);
  } finally { globalThis.fetch = f0; }
});

test('roadmap voting (one vote per user, toggle) and SEO pages generated per public model', async () => {
  const t = await makeEnv({ K: 'k' }), u = await t.user(), adm = await t.user({ role: 'admin' });
  assert.equal((await t.json('/api/admin/roadmap', { method: 'POST', cookie: adm.cookie, body: { title: 'แอป Android', status: 'planned' } })).status, 200);
  const id = (await t.json('/api/roadmap')).data[0].id;
  for (let i = 0; i < 2; i++) await t.json(`/api/roadmap/${id}/vote`, { method: 'POST', cookie: u.cookie, body: {} });
  let r = (await t.json('/api/roadmap', { cookie: u.cookie })).data[0]; assert.equal(r.votes, 1); assert.equal(r.mine, true);
  await t.json(`/api/roadmap/${id}/vote`, { method: 'POST', cookie: u.cookie, body: { on: false } });
  assert.equal((await t.json('/api/roadmap')).data[0].votes, 0);
  addModel(t.DB, { name: 'Test Model 9', base_url: 'http://x' });
  const s = await t.json('/api/admin/seo-models', { method: 'POST', cookie: adm.cookie }); assert.equal(s.status, 200, JSON.stringify(s.data));
  const post = t.DB.raw.prepare("SELECT title,body,published FROM posts WHERE slug='model-test-model-9'").get();
  assert.ok(post?.published); assert.match(post.body, /Test Model 9/);
});

test('folder instructions and reference documents reach the model for chats in that folder', async () => {
  const { fakeModel, readSSE } = await import('./helpers.mjs'); const seen = []; const fm = await fakeModel((q, res, body) => { seen.push(body); fm.sse(res, 'ok'); });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  const plan = addPlan(t.DB, { price: 0, models: [m.id] }), u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const f = (await t.json('/api/folders', { method: 'POST', cookie: u.cookie, body: { name: 'ร้าน' } })).data;
  assert.equal((await t.json('/api/folders/' + f.id, { method: 'PUT', cookie: u.cookie, body: { instructions: 'ตอบแบบพนักงานร้าน', files: [{ name: 'menu.txt', text: 'ลาเต้ 60 บาท' }] } })).status, 200);
  const g = (await t.json('/api/folders/' + f.id, { cookie: u.cookie })).data; assert.deepEqual(g.files, [{ name: 'menu.txt', size: 'ลาเต้ 60 บาท'.length }]);
  await t.json('/api/folders/' + f.id, { method: 'PUT', cookie: u.cookie, body: { files: [{ name: 'menu.txt' }] } }); // ส่งชื่อเดิม = เก็บไว้
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'ราคาลาเต้' } }));
  const cid = ev.find(e => e.chat_id).chat_id; await t.json('/api/chats/' + cid, { method: 'PUT', cookie: u.cookie, body: { folder_id: f.id } });
  t.DB.raw.exec('DELETE FROM rate'); seen.length = 0;
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, chat_id: cid, text: 'อีกที' } }));
  const sys = JSON.stringify(seen.at(-1)); assert.match(sys, /ตอบแบบพนักงานร้าน/); assert.match(sys, /ลาเต้ 60 บาท/);
  fm.close();
});

test('smart chat search expands the query with related terms and ranks by matches', async () => {
  const { fakeModel } = await import('./helpers.mjs'); const fm = await fakeModel((q, res) => fm.sse(res, 'กาแฟ, coffee, latte'));
  const t = await makeEnv({ K: 'k' }); addModel(t.DB, { name: 'Cheap', base_url: fm.url }); const u = await t.user();
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'คาเฟ่', Date.now()).id;
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,'user','iced latte with coffee beans',?)").run(c, Date.now());
  assert.equal((await t.json('/api/chats/search?q=' + encodeURIComponent('เครื่องดื่ม'), { cookie: u.cookie })).data.length, 0, 'exact search misses');
  const r = (await t.json('/api/chats/search?smart=1&q=' + encodeURIComponent('เครื่องดื่ม'), { cookie: u.cookie })).data;
  assert.equal(r.length, 1); assert.match(r[0].snippet, /latte|coffee/);
  fm.close();
});

test('wallet minimum: below ฿1 the off-plan model stays locked and API refuses; ฿1 unlocks', async () => {
  const t = await makeEnv({ K: 'k' }), pro = addModel(t.DB, { name: 'Pro model', base_url: 'http://x' });
  const low = await t.user({ balance: 0.5 }), ok = await t.user({ balance: 1 });
  assert.ok((await t.json('/api/me', { cookie: low.cookie })).data.models.find(m => m.id === pro.id).locked);
  assert.ok(!(await t.json('/api/me', { cookie: ok.cookie })).data.models.find(m => m.id === pro.id).locked);
  assert.equal((await t.json('/api/chat', { method: 'POST', cookie: low.cookie, body: { model_id: pro.id, text: 'hi' } })).status, 403);
  assert.equal((await t.json('/api/keys', { method: 'POST', cookie: low.cookie, body: { name: 'x' } })).status, 403);
  assert.equal((await t.json('/api/keys', { method: 'POST', cookie: ok.cookie, body: { name: 'x' } })).status, 200);
});

test('chat: an OpenAI refusal field is shown; a blank answer reports the provider stop reason', async () => {
  const { fakeModel, readSSE } = await import('./helpers.mjs'); let mode = 'refusal';
  const fm = await fakeModel((q, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const d = mode === 'refusal' ? { refusal: 'ขอโทษ ช่วยเรื่องนี้ไม่ได้' } : { content: ' ' };
    res.write('data: ' + JSON.stringify({ choices: [{ delta: d }] }) + '\n\n');
    if (mode === 'midError') return res.end('data: ' + JSON.stringify({ error: { type: 'api_error', message: 'The upstream service could not complete this stream.' } }) + '\n\n');
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: mode === 'refusal' ? 'stop' : 'content_filter' }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  const plan = addPlan(t.DB, { price: 0, models: [m.id] }), u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  let ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'x' } }));
  assert.match(ev.filter(e => e.t).map(e => e.t).join(''), /ช่วยเรื่องนี้ไม่ได้/);
  t.DB.raw.exec('DELETE FROM rate'); mode = 'filter';
  ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'y' } }));
  assert.match(ev.find(e => e.error)?.error || '', /content_filter/);
  t.DB.raw.exec('DELETE FROM rate'); mode = 'midError'; const admin = await t.user({ role: 'admin' }); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, admin.id);
  ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: admin.cookie, body: { model_id: m.id, text: 'z' } }));
  assert.match(ev.find(e => e.error)?.error || '', /could not complete this stream/);
  fm.close();
});

test('chat: Claude at Max effort gets room to answer, and running out while thinking says so', async () => {
  const { fakeModel, readSSE } = await import('./helpers.mjs'); const seen = [];
  const fm = await fakeModel((q, res, body) => {
    seen.push(body); res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, o) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...o })}\n\n`);
    ev('message_start', { message: { usage: { input_tokens: 10 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'คิดยาวมาก' } });
    ev('message_delta', { delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 16000 } });
    ev('message_stop', {}); res.end();
  });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'C', provider: 'anthropic', base_url: fm.url, effort: 'anthropic' });
  const plan = addPlan(t.DB, { price: 0, models: [m.id] }), u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'x', effort: 'max' } }));
  assert.equal(seen[0].max_tokens, 128000);
  assert.match(ev.filter(e => e.t).map(e => e.t).join(''), /เต็มความยาวสูงสุด/);
  fm.close();
});

test('chat: an attached zip is stored once and the AI opens files with read_file', async () => {
  const { fakeModel, readSSE } = await import('./helpers.mjs'); const seen = [];
  const fm = await fakeModel((q, res, body) => {
    seen.push(body); res.writeHead(200, { 'content-type': 'text/event-stream' });
    const tool = !body.messages.some(m => m.role === 'tool');
    const d = tool ? { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.py"}' } }] } : { content: 'แก้แล้ว' };
    res.write('data: ' + JSON.stringify({ choices: [{ delta: d, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } }) + '\n\n'); res.end('data: [DONE]\n\n');
  });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  const store = new Map(); t.env.SLIPS = { put: async (k, v) => { store.set(k, typeof v === 'string' ? v : new Uint8Array(v)); }, get: async k => store.has(k) ? { body: store.get(k), json: async () => JSON.parse(store.get(k)) } : null };
  const plan = addPlan(t.DB, { price: 0, models: [m.id] }), u = await t.user(), other = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const fd = new FormData(); fd.set('zip', new File([new Uint8Array([80, 75, 3, 4])], 'p.zip')); fd.set('files', JSON.stringify({ 'proj/main.py': 'print("hello-from-zip")', 'proj/README.md': '# x' }));
  const up = await t.worker.default.fetch(new Request('https://t.test/api/zipref', { method: 'POST', headers: { cookie: u.cookie }, body: fd }), t.env, t.ctx), { id } = await up.json();
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal((await t.call(`/api/zipref/${id}`, { cookie: other.cookie })).status, 404, 'another user cannot read it');
  const text = `แก้ไฟล์\n\n[[file:p.zip]]\n[zip: 2 ไฟล์ข้อความ] [[zipref:${id}]]\nproj/main.py\nproj/README.md\n[[/file]]`;
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text } }));
  assert.ok(seen[0].tools?.some(x => x.function?.name === 'read_file'), 'read_file offered');
  assert.match(JSON.stringify(seen[1].messages.find(x => x.role === 'tool')), /hello-from-zip/);
  assert.match(ev.filter(e => e.t).map(e => e.t).join(''), /แก้แล้ว/);
  fm.close();
});

test('admin: model usage detail lists who used a model', async () => {
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: 'http://x' }), admin = await t.user({ role: 'admin' }), u = await t.user();
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src) VALUES (?,?,?,?,?,?,?,?,?)').run(u.id, m.id, 100, 50, 0, 0.1, 0.1, Date.now(), 'chat');
  const r = await t.json(`/api/admin/model-usage/${m.id}?days=7`, { cookie: admin.cookie });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.by_user[0].id, u.id); assert.equal(r.data.recent.length, 1); assert.equal(r.data.by_src[0].src, 'chat');
  assert.equal((await t.json(`/api/admin/model-usage/${m.id}`, { cookie: u.cookie })).status, 403);
});

test('desktop app: chat with local tools gets the tool instructions in the system prompt; junk input is trimmed', async () => {
  const { fakeModel, readSSE } = await import('./helpers.mjs'); const seen = [];
  const fm = await fakeModel((q, res, body) => { seen.push(body); res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n'); });
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'G', provider: 'openai', base_url: fm.url });
  const plan = addPlan(t.DB, { price: 0, models: [m.id] }), u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'x', local: { os: 'Win32', folder: 'work', mcp: [{ name: 'mcp_blender_get_scene', description: 'scene', parameters: { properties: { a: {} } } }, { bad: 1 }] } } }));
  const sys = seen[0].messages[0].content;
  assert.match(sys, /folder "work"/); assert.match(sys, /RUN <shell command/); assert.match(sys, /mcp_blender_get_scene/); assert.match(sys, /GREP/); assert.doesNotMatch(sys, /CLICK x y/);
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'y' } }));
  assert.doesNotMatch(seen[1].messages[0].content, /AstraCode Desktop/);
  const { localOf } = await import('../src/ai.js');
  assert.equal(localOf('x'), null); assert.equal(localOf({ folder: 'f'.repeat(500), mcp: Array(99).fill({ name: 'n' }) }).mcp.length, 40);
  fm.close();
});

test('admin live cost page: cost per provider key, feed with flags, heavy users, key funds left', async () => {
  const t = await makeEnv(), a = await t.user({ role: 'admin' }), u = await t.user();
  const m = addModel(t.DB, { name: 'Uncen X', provider: 'openai', base_url: 'http://x' }); t.DB.raw.prepare("UPDATE models SET key_name='UNCEN_KEY' WHERE id=?").run(m.id);
  const now = Date.now();
  t.DB.raw.prepare("INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src,flag) VALUES (?,?,113000,1,0,2.26,2.26,?,'api','gone')").run(u.id, m.id, now - 60e3);
  t.DB.raw.prepare("INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src) VALUES (?,?,1000,100,0,1,1,?,'chat')").run(u.id, m.id, now - 2 * 3600e3);
  assert.equal((await t.json('/api/admin/key-funds', { method: 'PUT', cookie: a.cookie, body: { key: 'maxplus', keys: ['UNCEN_KEY', 'KIRO_KEY'], credits: 300, rate: 3 } })).status, 200);
  t.DB.raw.prepare("INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src) VALUES (?,?,1,1,0,10,10,?,'api')").run(u.id, m.id, Date.now() + 5);
  const { status, data } = await t.json('/api/admin/live', { cookie: a.cookie });
  assert.equal(status, 200);
  const k = data.keys.find(x => x.k === 'UNCEN_KEY');
  assert.ok(Math.abs(k.h1 - 12.26) < 1e-6 && Math.abs(k.d1 - 13.26) < 1e-6, JSON.stringify(k)); assert.equal(k.series.length, 24);
  const acct = data.accounts.find(x => x.name === 'maxplus'); assert.equal(acct.left, 300 - 10 * 3); assert.equal(k.acct, 'maxplus'); // ต้นทุนหลังกรอกยอด ฿10 = 30 เครดิต
  assert.equal(data.feed.find(r => r.flag === 'gone').tin, 113000);
  assert.equal(data.hot[0].uid, u.id);
  assert.equal((await t.json('/api/admin/live', { cookie: u.cookie })).status, 403);
});

test('desktop agent: chats/append saves a turn to a new or own chat only; /v1/web_search needs a key', async () => {
  const t = await makeEnv(), u = await t.user(), other = await t.user();
  const r = await t.json('/api/chats/append', { method: 'POST', cookie: u.cookie, body: { title: 'แก้บั๊ก', messages: [{ role: 'user', content: 'แก้บั๊ก' }, { role: 'assistant', content: 'แก้แล้ว' }, { role: 'system', content: 'x' }] } });
  assert.equal(r.status, 200); const id = r.data.chat_id;
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM messages WHERE chat_id=?').get(id).n, 2);
  assert.equal((await t.json('/api/chats/append', { method: 'POST', cookie: u.cookie, body: { chat_id: id, messages: [{ role: 'user', content: 'ต่อ' }] } })).data.chat_id, id);
  assert.equal((await t.json('/api/chats/append', { method: 'POST', cookie: other.cookie, body: { chat_id: id, messages: [{ role: 'user', content: 'แทรก' }] } })).status, 404);
  assert.equal((await t.json('/v1/web_search', { method: 'POST', body: { query: 'x' } })).status, 401);
});

test('desktop agent remote: the app pushes progress and a question, the phone answers and types, the app picks them up', async () => {
  const t = await makeEnv(), u = await t.user({ balance: 10 }), other = await t.user({ balance: 10 });
  const { data: k } = await t.json('/api/keys', { method: 'POST', cookie: u.cookie, body: { name: 'Desktop Agent' } });
  const chatId = (await t.json('/api/chats/append', { method: 'POST', cookie: u.cookie, body: { messages: [{ role: 'user', content: 'งาน' }] } })).data.chat_id;
  const push = body => t.json('/v1/remote/push', { method: 'POST', headers: { authorization: 'Bearer ' + k.key }, body: { chat_id: chatId, ...body } });
  assert.equal((await push({ events: [{ type: 'tool', name: 'bash', args: { command: 'npm test' } }], ask: { id: 1, title: 'ขอรันคำสั่ง', detail: 'npm test', allowAll: true }, running: true })).status, 200);
  const view = (await t.json('/api/remote/' + chatId, { cookie: u.cookie })).data;
  assert.equal(view.ask.id, 1); assert.equal(view.events[0].name, 'bash'); assert.ok(view.running && view.live);
  assert.equal((await t.json('/api/remote/' + chatId, { cookie: other.cookie })).data, null); // คนอื่นดูไม่ได้
  await t.json(`/api/remote/${chatId}/answer`, { method: 'POST', cookie: u.cookie, body: { id: 1, v: 'yes' } });
  await t.json(`/api/remote/${chatId}/say`, { method: 'POST', cookie: u.cookie, body: { text: 'ใช้ yarn แทน' } });
  const got = (await push({ events: [], running: true })).data;
  assert.deepEqual(got.answer, { id: 1, v: 'yes' }); assert.deepEqual(got.inbox, ['ใช้ yarn แทน']);
  const again = (await push({ events: [], running: false })).data; assert.equal(again.answer, null); assert.deepEqual(again.inbox, []); // รับแล้วไม่ซ้ำ
  const { data: k2 } = await t.json('/api/keys', { method: 'POST', cookie: other.cookie, body: { name: 'x' } });
  assert.equal((await t.json('/v1/remote/push', { method: 'POST', headers: { authorization: 'Bearer ' + k2.key }, body: { chat_id: chatId, events: [] } })).status, 404); // key คนอื่นยิงเข้าแชตเราไม่ได้
});

test('admin agent bench: a model that uses the tools correctly scores 4/4, one that only talks scores low', async () => {
  const { fakeModel } = await import('./helpers.mjs');
  const sse = (res, d) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); for (const x of [].concat(d)) res.write('data: ' + JSON.stringify(x) + '\n\n'); res.end('data: [DONE]\n\n'); };
  const call = (name, args) => [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c' + Math.random().toString(36).slice(2, 6), type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 10 } }];
  const say = t => [{ choices: [{ delta: { content: t } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 5 } }];
  const good = await fakeModel((q, res, body) => {
    const task = body.messages.find(m => m.role === 'user').content, done = body.messages.some(m => m.role === 'tool');
    if (/VAT rate used/.test(task)) return sse(res, done ? say('0.07') : call('read_file', { path: 'src/vat.js' }));
    if (/Which file/.test(task)) return sse(res, done ? say('src/cart.js') : call('grep', { pattern: 'function total' }));
    if (/Change the VAT/.test(task)) return sse(res, done ? say('done') : call('edit_file', { path: 'src/vat.js', old_string: 'RATE = 0.07', new_string: 'RATE = 0.1' }));
    return sse(res, done ? say('fixed') : call('edit_file', { path: 'src/cart.js', old_string: '  return sum + vat(sum) - discount;', new_string: '  const net = sum - discount;\n  return net + vat(net);' }));
  });
  const lazy = await fakeModel((q, res) => sse(res, say('I think it is fine.')));
  const t = await makeEnv({ K: 'k' }), a = await t.user({ role: 'admin' });
  const g = addModel(t.DB, { name: 'Good', provider: 'openai', base_url: good.url, cost_in: 1000, cost_out: 1000 }), l = addModel(t.DB, { name: 'Lazy', provider: 'openai', base_url: lazy.url });
  const rg = (await t.json('/api/admin/agent-bench', { method: 'POST', cookie: a.cookie, body: { model_id: g.id } })).data;
  assert.equal(rg.score, 4, JSON.stringify(rg)); assert.ok(rg.cost > 0);
  const rl = (await t.json('/api/admin/agent-bench', { method: 'POST', cookie: a.cookie, body: { model_id: l.id } })).data;
  assert.equal(rl.score, 0, JSON.stringify(rl));
  good.close(); lazy.close();
});
