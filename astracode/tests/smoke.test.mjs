import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

test('worker loads and serves public settings', async () => {
  const t = await makeEnv();
  const r = await t.json('/api/settings/public');
  assert.equal(r.status, 200);
});

test('chat: streams a reply, saves it, logs usage', async () => {
  const fm = await fakeModel((req, res) => fm.sse(res, 'สวัสดีครับ'));
  const t = await makeEnv({ K: 'key' });
  const m = addModel(t.DB, { name: 'M1', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [m.id], price: 0 });
  const u = await t.user({});
  t.DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const res = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { model_id: m.id, text: 'hi' } });
  assert.equal(res.status, 200);
  const ev = await readSSE(res); await Promise.all(t.ctx.pending);
  assert.ok(ev.some(e => e.t === 'สวัสดีครับ'), JSON.stringify(ev));
  assert.ok(ev.at(-1).done);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM messages WHERE role='assistant'").get().n, 1);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM usage').get().n, 1);
  fm.close();
});

test('browser errors are stored as client events, with a per-IP burst limit', async () => {
  const t = await makeEnv();
  for (let i = 0; i < 12; i++) assert.equal((await t.call('/api/clienterr', { method: 'POST', body: { msg: 'x is not defined ' + i, src: '/chat.js:1:2', page: '/chat' } })).status, 204);
  const rows = t.DB.raw.prepare("SELECT detail FROM events WHERE kind='client'").all();
  assert.equal(rows.length, 10); assert.match(rows[0].detail, /\/chat · x is not defined 0 @ \/chat\.js:1:2/);
});

test('security: broken JSON bodies answer 400, not 500', async () => {
  const t = await makeEnv(), u = await t.user();
  for (const path of ['/api/folders', '/api/feedback', '/api/coupon/redeem']) {
    const r = await t.worker.default.fetch(new Request('https://t.test' + path, { method: 'POST', headers: { cookie: u.cookie, 'content-type': 'application/json' }, body: '{oops' }), t.env, t.ctx);
    assert.equal(r.status, 400, path);
  }
});

test('ensureCols adds only what is missing (old schema is upgraded on the first request)', async () => {
  const t = await makeEnv();
  t.DB.raw.exec('DROP INDEX IF EXISTS api_log_key; DROP TABLE api_log; ALTER TABLE api_keys DROP COLUMN ip_allow; ALTER TABLE models DROP COLUMN idle_s;');
  const stmts = []; const prep = t.DB.prepare; t.DB.prepare = sql => { stmts.push(sql); return prep(sql); };
  assert.equal((await t.call('/api/settings/public')).status, 200);
  const cols = t.DB.raw.prepare("SELECT name FROM pragma_table_info('api_keys')").all().map(x => x.name);
  assert.ok(cols.includes('ip_allow')); assert.ok(t.DB.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='api_log'").get());
  assert.ok(t.DB.raw.prepare("SELECT name FROM pragma_table_info('models')").all().some(x => x.name === 'idle_s'));
  assert.equal(stmts.filter(s => /^ALTER TABLE/.test(s)).length, 2, 'only the two missing columns were altered');
});

test('versioned assets: ?v= files are cached immutable, others untouched', async () => {
  const { versioned } = await import('../src/worker.js');
  const res = () => new Response('x', { headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=0, must-revalidate' } });
  const env = { VERSION: 'abcdef1234567' };
  assert.match(versioned(res(), '/app.js', new URL('https://t.test/app.js?v=abcdef1234'), env).headers.get('cache-control'), /immutable/);
  assert.match(versioned(res(), '/app.js', new URL('https://t.test/app.js'), env).headers.get('cache-control'), /must-revalidate/);
  assert.match(versioned(res(), '/app.js', new URL('https://t.test/app.js?v=1'), {}).headers.get('cache-control'), /must-revalidate/, 'no VERSION (local dev) = no long cache');
});

test('share target: text goes to the chat URL, files are kept once in R2 and served once to a signed-in user', async () => {
  const t = await makeEnv(), u = await t.user(), store = new Map();
  t.env.SLIPS = { put: async (k, v, o) => store.set(k, { body: await new Response(v).arrayBuffer(), httpMetadata: o.httpMetadata, customMetadata: o.customMetadata }), get: async k => store.get(k) || null, delete: async k => store.delete(k) };
  const fd = new FormData(); fd.set('text', 'สวัสดี'); fd.append('files', new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' }));
  const r = await t.worker.default.fetch(new Request('https://t.test/share-in', { method: 'POST', body: fd }), t.env, t.ctx);
  assert.equal(r.status, 303); const loc = new URL(r.headers.get('location'), 'https://t.test');
  assert.equal(loc.searchParams.get('text'), 'สวัสดี'); const [tok, n] = loc.searchParams.get('shared').split('.'); assert.equal(n, '1');
  assert.equal((await t.call(`/api/shared/${tok}/0`)).status, 401, 'needs sign-in');
  const f = await t.call(`/api/shared/${tok}/0`, { cookie: u.cookie }); await Promise.all(t.ctx.pending || []);
  assert.equal(await f.text(), 'a,b\n1,2'); assert.equal(decodeURIComponent(f.headers.get('x-name')), 'data.csv');
  assert.equal((await t.call(`/api/shared/${tok}/0`, { cookie: u.cookie })).status, 404, 'served once');
});


test('chat background: presets/3D/own image are saved to the account, others and bad values are refused', async () => {
  const t = await makeEnv(), u = await t.user(), o = await t.user();
  const put = (who, bg) => t.json('/api/me', { method: 'PUT', body: { bg }, headers: { cookie: who.cookie } });
  assert.equal((await put(u, { kind: '3d', id: 'stars', dim: 200, blur: 5 })).status, 200);
  assert.deepEqual(JSON.parse((await t.json('/api/me', { headers: { cookie: u.cookie } })).data.bg), { kind: '3d', id: 'stars', dim: 85, blur: 5 });
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
  const up = await t.json('/api/me/bg', { method: 'POST', body: { image: png }, headers: { cookie: u.cookie } });
  assert.equal(up.status, 200); assert.match(up.data.url, new RegExp(`^/api/img/${u.id}/`));
  assert.equal((await put(u, { kind: 'img', id: up.data.url })).status, 200);
  assert.equal((await put(o, { kind: 'img', id: up.data.url })).status, 400, 'cannot use another account image');
  assert.equal((await put(u, { kind: 'img', id: 'https://evil.test/x.jpg' })).status, 400);
  assert.equal((await t.json('/api/me/bg', { method: 'POST', body: { image: 'data:image/svg+xml;base64,AAAA' }, headers: { cookie: u.cookie } })).status, 400);
  assert.equal((await put(u, null)).status, 200); assert.equal((await t.json('/api/me', { headers: { cookie: u.cookie } })).data.bg, null);
});
