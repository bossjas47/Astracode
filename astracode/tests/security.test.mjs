// ช่องโหว่ที่ตรวจเจอ (พ.ย. 2026): ทดสอบว่าปิดแล้วและไม่กลับมา
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, fakeModel, readSSE } from './helpers.mjs';

// R2 จำลองแบบง่าย (put/get/delete/list) พอสำหรับเส้นทางที่ทดสอบ
export const fakeR2 = () => {
  const m = new Map();
  return {
    m,
    async put(k, v, o = {}) { const buf = v instanceof ReadableStream ? new Uint8Array(await new Response(v).arrayBuffer()) : v instanceof Uint8Array ? v : new TextEncoder().encode(String(v)); m.set(k, { buf, o, uploaded: o.uploaded || new Date() }); },
    async get(k) { const x = m.get(k); return x && { body: x.buf, httpMetadata: x.o.httpMetadata, customMetadata: x.o.customMetadata, size: x.buf.length }; },
    async delete(k) { for (const x of [].concat(k)) m.delete(x); },
    async list({ prefix = '', cursor } = {}) { const objects = [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, x]) => ({ key, uploaded: x.uploaded })); return { objects, truncated: false, cursor }; },
  };
};

test('share-in: a file uploaded without login is only ever served as a download, never as HTML/JS on our origin', async () => {
  const SLIPS = fakeR2(), t = await makeEnv({ SLIPS });
  const fd = new FormData();
  fd.append('files', new File(['<script src="/api/shared/x/1"></script>'], 'a.html', { type: 'text/html' }));
  fd.append('files', new File(['alert(1)'], 'b.js', { type: 'application/javascript' }));
  const r = await t.worker.default.fetch(new Request('https://t.test/share-in', { method: 'POST', body: fd }), t.env, t.ctx);
  const tok = new URL(r.headers.get('location'), 'https://t.test').searchParams.get('shared').split('.')[0];
  const victim = await t.user();
  for (const [i, type] of [[0, 'text/html'], [1, 'application/javascript']]) {
    const res = await t.call(`/api/shared/${tok}/${i}`, { cookie: victim.cookie });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('content-disposition'), 'attachment');
    assert.match(res.headers.get('content-security-policy'), /sandbox/);
    assert.equal(res.headers.get('x-type'), type, 'the page still learns the real type to attach the file');
  }
});

test('HTML pages are sent with an enforced CSP that only allows pinned jsdelivr packages', async () => {
  const t = await makeEnv({ ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) } });
  const r = await t.call('/chat');
  const csp = r.headers.get('content-security-policy');
  assert.ok(csp, 'enforced, not report-only'); assert.equal(r.headers.get('content-security-policy-report-only'), null);
  const script = csp.split(';').find(x => x.trim().startsWith('script-src'));
  assert.doesNotMatch(script, /https:\/\/cdn\.jsdelivr\.net(\s|$)/, 'no whole-domain jsdelivr');
  assert.match(script, /https:\/\/cdn\.jsdelivr\.net\/npm\/katex@0\.16\.11\//);
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
});

test('web chat paid from the wallet cannot spend more than the balance', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, 'ok', { prompt_tokens: 50, completion_tokens: 20 }));
  const t = await makeEnv({ K: 'k' }), pro = addModel(t.DB, { name: 'Pricey', base_url: fm.url });
  t.DB.raw.prepare('UPDATE models SET price_in=100000, price_out=100000 WHERE id=?').run(pro.id); // ฿0.1 ต่อ token
  const u = await t.user({ balance: 2 });
  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
  // ข้อความยาว ~2,000 token × ฿0.1 = ~฿200 > ยอด ฿2: ไม่ส่งไปโมเดล ไม่ตัดเงิน
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: pro.id, text: 'x'.repeat(8000) } }));
  assert.ok(ev.some(e => /Wallet ไม่พอ/.test(e.error || '')), JSON.stringify(ev).slice(0, 300));
  assert.equal(fm.hits.length, 0, 'model not called'); assert.equal(bal(), 2);
  // ข้อความสั้น (รวม system ~600 token = ~฿60): ส่งได้ แต่เพดาน output ถูกจำกัดตามยอดที่เหลือ ~฿140
  t.DB.raw.exec('DELETE FROM rate'); t.DB.raw.prepare('UPDATE users SET balance=200 WHERE id=?').run(u.id);
  const ev2 = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: pro.id, text: 'hi' } }));
  assert.ok(ev2.some(e => e.done), JSON.stringify(ev2).slice(0, 300));
  const mt = fm.hits[0].body.max_tokens ?? fm.hits[0].body.max_completion_tokens;
  assert.ok(mt > 0 && mt < 2000, 'max tokens capped by the ฿200 balance: ' + mt);
  fm.close();
});

test('turnstile also guards action=check (password sign-in from the verify/2FA screens)', async () => {
  const t = await makeEnv({ TURNSTILE_SECRET: 's', TURNSTILE_URL: 'http://127.0.0.1:9/never' });
  const r = await t.json('/api/auth', { method: 'POST', body: { action: 'check', email: 'a@b.co', password: 'x'.repeat(10) } });
  assert.equal(r.status, 400); assert.match(r.data.error, /บอท/);
});

test('slip receiver: a matching name alone is not enough to auto-approve; the account number must match too', async () => {
  const { judgeSlip } = await import('../src/billing.js');
  const s = { easyslip_receiver_names: 'สมชาย', promptpay_id: '0881234567' };
  const slip = acc => ({ status: 200, data: { transRef: 'R', date: new Date(Date.now() - 60e3).toISOString(), amount: { amount: 100 }, receiver: { account: { name: { th: 'นาย สมชาย ใจร้าย' }, ...(acc ? { proxy: { account: acc } } : {}) } } } });
  assert.equal(judgeSlip(s, slip('088-xxx-4567'), 200, '', 100, false).code, '200000', 'name + promptpay match');
  assert.equal(judgeSlip(s, slip('1234-5678-9012-345'), 200, '', 100, false).code, 'receiver_unverified', 'name matches, number not comparable (e-wallet): admin checks');
  assert.equal(judgeSlip(s, slip(null), 200, '', 100, false).code, 'receiver_unverified');
  assert.equal(judgeSlip(s, slip('099-xxx-9999'), 200, '', 100, false).code, '200401', 'different number: rejected');
});

test('LINE login: an unverified LINE email cannot take over an existing account; a logged-in user links LINE from the account page', async () => {
  const t = await makeEnv({ LINE_CHANNEL_ID: 'cid', LINE_CHANNEL_SECRET: 'sec' });
  const real = globalThis.fetch; let sub = 'Uattacker';
  globalThis.fetch = async (u, o) => /api\.line\.me\/oauth2\/v2\.1\/token/.test(String(u)) ? Response.json({ id_token: 'x' }) : /api\.line\.me\/oauth2\/v2\.1\/verify/.test(String(u)) ? Response.json({ sub, email: 'victim@corp.co' }) : real(u, o);
  try {
    const victim = await t.user({ email: 'victim@corp.co' });
    const cb = cookie => t.call('/api/oauth/line/callback?code=c&state=st', { cookie: 'oauth=st.; ' + (cookie || '') });
    const r = await cb();
    assert.match(decodeURIComponent(r.headers.get('location') || ''), /มีบัญชีอยู่แล้ว/); assert.equal(r.headers.get('set-cookie'), null, 'no session for the attacker');
    assert.equal(t.DB.raw.prepare('SELECT line_id FROM users WHERE id=?').get(victim.id).line_id, null);
    sub = 'Uvictim'; // เจ้าของบัญชีล็อกอินอยู่ แล้วกด "เชื่อม LINE"
    const r2 = await cb(victim.cookie.split(';')[0]);
    assert.match(r2.headers.get('location'), /\/account/);
    assert.equal(t.DB.raw.prepare('SELECT line_id FROM users WHERE id=?').get(victim.id).line_id, 'Uvictim');
    const r3 = await cb(); assert.match(r3.headers.get('set-cookie') || '', /sid=/, 'linked LINE now signs in');
  } finally { globalThis.fetch = real; }
});

test('logout only by POST; remote push keeps valid JSON when events grow past 400KB', async () => {
  const t = await makeEnv(), u = await t.user();
  assert.equal((await t.call('/api/logout', { cookie: u.cookie })).status, 404, 'GET logout does nothing');
  assert.equal((await t.call('/api/me', { cookie: u.cookie })).status, 200);
  const { sha } = await import('./helpers.mjs'), key = 'sk-astra-' + 'ab'.repeat(24);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'Desktop Agent', await sha(key), key.slice(0, 14), Date.now());
  t.DB.raw.prepare('UPDATE users SET balance=10 WHERE id=?').run(u.id);
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'x', Date.now()).id;
  const push = () => t.worker.default.fetch(new Request('https://t.test/v1/remote/push', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: c, events: Array.from({ length: 200 }, (_, i) => ({ t: 'x'.repeat(1500), i })) }) }), t.env, t.ctx);
  for (let i = 0; i < 3; i++) assert.equal((await push()).status, 200, 'push ' + i);
  const ev = t.DB.raw.prepare('SELECT events FROM agent_remote WHERE chat_id=?').get(c).events;
  assert.ok(ev.length <= 400000); assert.doesNotThrow(() => JSON.parse(ev));
  assert.equal((await t.json('/api/remote/' + c, { cookie: u.cookie })).status, 200);
});

test('cron removes expired setup links (API keys inside) and stale shared files; setup payload is encrypted', async () => {
  const SLIPS = fakeR2(), t = await makeEnv({ SLIPS, SECRET_KEY: 'k'.repeat(32) }), u = await t.user({ balance: 5 });
  const r = await t.json('/api/setup-cmd', { method: 'POST', cookie: u.cookie, body: { tool: 'Codex', model: 'gpt-x' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  {
    const row = t.DB.raw.prepare('SELECT payload FROM setup_tokens').get();
    assert.ok(row.payload.startsWith('s:') && !row.payload.includes(r.data.key), 'key not stored in plain text');
    const tok = r.data.url.split('/setup/')[1];
    assert.match(await (await t.call('/setup/' + tok)).text(), new RegExp(r.data.key), 'script still gets the key');
    t.DB.raw.prepare('UPDATE setup_tokens SET expires_at=1').run();
    const { cron } = await import('../src/jobs.js'); await cron(t.env).catch(() => {});
    assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM setup_tokens').get().n, 0, 'cron deleted the expired link');
  }
  await SLIPS.put('share/aaaa/0', 'old', { uploaded: new Date(Date.now() - 2 * 864e5) });
  await SLIPS.put('share/bbbb/0', 'new');
  const { cleanShared } = await import('../src/jobs.js');
  assert.equal(await cleanShared(t.env), 1); assert.deepEqual([...SLIPS.m.keys()], ['share/bbbb/0']);
});

test('payments: two requests at once from one user cannot both pass the checks', async () => {
  const t = await makeEnv(), u = await t.user({ balance: 1000 });
  const p = t.DB.raw.prepare("INSERT INTO plans (name,price,limit_4h,limit_week,seats,shared_pool,active,sort,once) VALUES ('Trial',50,1,1,1,0,1,1,1) RETURNING id").get();
  const buy = () => { const fd = new FormData(); fd.append('kind', 'plan'); fd.append('plan_id', String(p.id)); fd.append('wallet', '1'); return t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', headers: { cookie: u.cookie }, body: fd }), t.env, t.ctx); };
  const rs = await Promise.all([buy(), buy(), buy()]);
  assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join());
  assert.equal(t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance, 950, 'charged once');
  assert.equal((await buy()).status, 400, 'once-only plan cannot be bought again');
});

test('chat list: has_code comes from a trigger (no scan of every message); schema version skips migrations next time', async () => {
  const t = await makeEnv(), u = await t.user();
  await t.call('/api/me', { cookie: u.cookie }); // ensureCols
  const c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'x', Date.now()).id;
  t.DB.raw.prepare("INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)").run(c, 'assistant', 'here:\n```js\n1\n```', Date.now());
  assert.equal((await t.json('/api/chats', { cookie: u.cookie })).data.find(x => x.id === c).has_code, 1);
  const { SCHEMA_VER } = await import('../src/core.js');
  assert.equal(t.DB.raw.prepare("SELECT value FROM settings WHERE key='schema_ver'").get()?.value, SCHEMA_VER);
  assert.ok(t.DB.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_time'").get(), 'usage(created_at) index');
});

test('model fallback is never silent: logged in events, told to API clients (header/body/first chunk), requested model kept in api_log', async () => {
  const a = await fakeModel((q, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":{"message":"invalid api key"}}'); });
  const b = await fakeModel((q, res) => b.sse(res, 'from B'));
  const t = await makeEnv({ K: 'k' }), mb = addModel(t.DB, { name: 'Backup', base_url: b.url }), ma = addModel(t.DB, { name: 'Premium', base_url: a.url, fallback_id: mb.id });
  const u = await t.user({ balance: 100 }), { sha } = await import('./helpers.mjs'), key = 'sk-astra-' + 'cd'.repeat(24);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const call = stream => t.worker.default.fetch(new Request('https://t.test/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'premium', stream, messages: [{ role: 'user', content: 'hi' }] }) }), t.env, t.ctx);
  const r = await call(false), d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d)); assert.equal(r.headers.get('x-astracode-model'), 'backup');
  assert.deepEqual(d.astra_fallback, { requested: 'premium', answered_by: 'backup' }); assert.equal(d.model, 'backup');
  await Promise.all(t.ctx.pending);
  const log = t.DB.raw.prepare('SELECT model, req_model FROM api_log ORDER BY id DESC').get();
  assert.deepEqual({ ...log }, { model: 'backup', req_model: 'premium' });
  const fe = t.DB.raw.prepare("SELECT model_id, detail FROM events WHERE kind='fallback'").all();
  assert.equal(fe.length, 1); assert.equal(fe[0].model_id, ma.id); assert.equal(JSON.parse(fe[0].detail).to, 'Backup'); assert.equal(JSON.parse(fe[0].detail).src, 'api');
  t.DB.raw.exec("DELETE FROM rate; DELETE FROM events WHERE kind='error'"); // ไม่ให้ตัวตัดวงจรมีผลกับรอบสตรีม
  const s = await (await call(true)).text(), first = JSON.parse(s.split('\n').find(l => l.startsWith('data: {')).slice(6));
  assert.deepEqual(first.astra_fallback, { requested: 'premium', answered_by: 'backup' });
  a.close(); b.close();
});

test('web chat / Code: a fallback answer is recorded as a fallback event with its source', async () => {
  const a = await fakeModel((q, res) => { res.writeHead(401); res.end('{"error":{"message":"invalid api key"}}'); }), b = await fakeModel((q, res) => b.sse(res, 'from B'));
  const t = await makeEnv({ K: 'k' }), mb = addModel(t.DB, { name: 'Backup', base_url: b.url }), ma = addModel(t.DB, { name: 'Premium', base_url: a.url, fallback_id: mb.id });
  const u = await t.user({ balance: 100 });
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: ma.id, text: 'hi' } }));
  assert.ok(ev.some(e => e.fallback === 'Backup'), JSON.stringify(ev).slice(0, 300));
  const fe = t.DB.raw.prepare("SELECT detail FROM events WHERE kind='fallback'").get();
  assert.equal(JSON.parse(fe.detail).src, 'chat'); assert.equal(JSON.parse(fe.detail).user, u.id);
  a.close(); b.close();
});

test('chat summary (compact) is written by the model the chat uses, not the cheapest one; Code-mode prompt asks for polished new work', async () => {
  const cheap = await fakeModel((q, res) => cheap.sse(res, 'cheap summary')), good = await fakeModel((q, res) => good.sse(res, 'good summary'));
  const t = await makeEnv({ K: 'k' });
  addModel(t.DB, { name: 'Cheap', base_url: cheap.url, cost_in: 0.01, cost_out: 0.01 });
  const g = addModel(t.DB, { name: 'Fable', base_url: good.url, cost_in: 50, cost_out: 200 });
  const u = await t.user(), c = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'x', Date.now()).id;
  for (let i = 0; i < 6; i++) t.DB.raw.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').run(c, i % 2 ? 'assistant' : 'user', 'msg ' + i, g.id, Date.now());
  const r = await t.json(`/api/chats/${c}/compact`, { method: 'POST', cookie: u.cookie });
  assert.equal(r.data.ok, true, JSON.stringify(r.data));
  assert.equal(cheap.hits.length, 0); assert.equal(good.hits.length, 1);
  assert.match(t.DB.raw.prepare('SELECT summary FROM chats WHERE id=?').get(c).summary, /good summary/);
  const { SYSTEM_CODE, HISTORY_CODE } = await import('../src/core.js');
  assert.match(SYSTEM_CODE, /polished, impressive result/); assert.equal(HISTORY_CODE, 20);
  cheap.close(); good.close();
});
