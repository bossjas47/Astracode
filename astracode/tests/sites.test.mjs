// Kyber Sites: เผยแพร่โปรเจกต์/Artifact เป็นเว็บที่ /s/<ชื่อ>/ · sandbox ทุกไฟล์ · ฟอร์มติดต่อ · โควตาตามแพลน · ย้อนเวอร์ชัน · แอดมินระงับ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addPlan } from './helpers.mjs';
import { buildFiles, slugOk } from '../src/sites.js';

function r2() {
  const m = new Map();
  return { m,
    put: async (k, v) => { m.set(k, v instanceof Uint8Array ? v : new TextEncoder().encode(String(v))); },
    get: async k => m.has(k) ? { body: m.get(k), text: async () => new TextDecoder().decode(m.get(k)) } : null,
    delete: async ks => { for (const k of [].concat(ks)) m.delete(k); } };
}
async function setup({ paid = true } = {}) {
  const SLIPS = r2(), t = await makeEnv({ SLIPS });
  const plan = addPlan(t.DB, { name: 'Plus', price: paid ? 100 : 0 });
  const u = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 30 * 864e5, u.id);
  const pid = t.DB.raw.prepare("INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id").get(u.id, 'web', 1, 1).id;
  const file = (p, c) => t.DB.raw.prepare('INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,1)').run(pid, p, c);
  file('index.html', '<html><body><h1>Hello</h1><link href="/style.css" rel="stylesheet"><form method="post" action="__form"></form></body></html>');
  file('style.css', 'h1{color:red}');
  file('about.html', '<p>about</p>');
  file('img/a.png', 'data:image/png;base64,iVBORw0KGgo=');
  file('main.py', 'print(1)');
  const api = (path, o = {}) => t.json('/api/sites' + path, { cookie: u.cookie, ...o });
  return { t, SLIPS, plan, u, pid, file, api };
}

test('sites: slug rules and file building (absolute paths rewritten, server files skipped, no password fields)', () => {
  assert.equal(slugOk('My-Shop').slug, 'my-shop');
  assert.ok(slugOk('ab').error); assert.ok(slugOk('kyber-login').error); assert.ok(slugOk('a--b').error); assert.ok(slugOk('-abc').error);
  const { files } = buildFiles([{ path: 'index.html', content: '<img src="/a.png"><a href="//x.com">x</a><div style="background:url(/b.png)">' }, { path: 'app.py', content: 'x' }, { path: '.env', content: 'S=1' }], 'shop');
  assert.deepEqual(files.map(f => f.path), ['index.html']);
  const html = new TextDecoder().decode(files[0].bytes);
  assert.match(html, /src="\/s\/shop\/a\.png"/); assert.match(html, /href="\/\/x\.com"/); assert.match(html, /url\(\/s\/shop\/b\.png\)/);
  assert.throws(() => buildFiles([{ path: 'index.html', content: '<input type="password">' }], 'shop'), /รหัสผ่าน/);
  assert.throws(() => buildFiles([{ path: 'a/x.html', content: 'x' }, { path: 'b.html', content: 'y' }], 'shop'), /index\.html/);
  assert.equal(buildFiles([{ path: 'page.html', content: 'x' }], 'shop').files[0].path, 'index.html', 'a single page becomes the home page');
});

test('sites: publish a Code project, serve it sandboxed, rewrite paths, count views, 404s', async () => {
  const S = await setup();
  const r = await S.api('', { method: 'POST', body: { slug: 'myshop', title: 'ร้านฉัน', src: 'project', src_id: S.pid } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.ver, 1); assert.equal(r.data.files, 4, 'main.py skipped');
  const redir = await S.t.call('/s/myshop'); assert.equal(redir.status, 301); assert.equal(redir.headers.get('location'), '/s/myshop/');
  const home = await S.t.call('/s/myshop/'); const body = await home.text();
  assert.equal(home.status, 200); assert.match(home.headers.get('content-security-policy'), /sandbox allow-scripts/); assert.doesNotMatch(home.headers.get('content-security-policy'), /allow-same-origin/);
  assert.match(body, /href="\/s\/myshop\/style\.css"/); assert.match(body, /Kyber Sites · รายงาน/);
  const css = await S.t.call('/s/myshop/style.css'); assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8'); assert.match(css.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await S.t.call('/s/myshop/about')).status, 200, 'clean URL → about.html');
  assert.equal((await S.t.call('/s/myshop/img/a.png')).headers.get('content-type'), 'image/png');
  assert.equal((await S.t.call('/s/myshop/nope.html')).status, 404);
  assert.equal((await S.t.call('/s/nosuch/')).status, 404);
  await Promise.all(S.t.ctx.pending);
  assert.ok(S.t.DB.raw.prepare('SELECT views FROM sites').get().views >= 2);
  assert.equal((await S.api('', { method: 'POST', body: { slug: 'myshop', src: 'project', src_id: S.pid } })).status, 400, 'slug taken');
});

test('sites: paid plans only, quota per plan, other users cannot touch the site', async () => {
  const F = await setup({ paid: false });
  assert.equal((await F.api('', { method: 'POST', body: { slug: 'free-site', src: 'project', src_id: F.pid } })).status, 403);
  const S = await setup();
  S.t.DB.raw.prepare('UPDATE plans SET sites=1 WHERE id=?').run(S.plan.id);
  assert.equal((await S.api('', { method: 'POST', body: { slug: 'one-site', src: 'project', src_id: S.pid } })).status, 200);
  const two = await S.api('', { method: 'POST', body: { slug: 'two-site', src: 'project', src_id: S.pid } });
  assert.equal(two.status, 403); assert.match(two.data.error, /1 เว็บ/);
  const other = await S.t.user(), id = S.t.DB.raw.prepare('SELECT id FROM sites').get().id;
  assert.equal((await S.t.json('/api/sites/' + id, { method: 'DELETE', cookie: other.cookie })).status, 404);
  assert.equal((await S.t.json('/api/sites', { method: 'POST', cookie: other.cookie, body: { slug: 'steal', src: 'project', src_id: S.pid } })).status, 403, 'not paid');
});

test('sites: republish makes a new version, rollback serves the old one, owner can switch off; expired plan takes the site down', async () => {
  const S = await setup();
  const id = (await S.api('', { method: 'POST', body: { slug: 'myblog', src: 'project', src_id: S.pid } })).data.site.id;
  S.file('index.html', '<p>v2</p>');
  assert.equal((await S.api(`/${id}/publish`, { method: 'POST' })).data.ver, 2);
  assert.match(await (await S.t.call('/s/myblog/')).text(), /v2/);
  assert.equal((await S.api(`/${id}/rollback`, { method: 'POST', body: { ver: 1 } })).status, 200);
  assert.match(await (await S.t.call('/s/myblog/')).text(), /Hello/);
  await S.api(`/${id}`, { method: 'PATCH', body: { status: 'off' } });
  assert.equal((await S.t.call('/s/myblog/')).status, 404);
  await S.api(`/${id}`, { method: 'PATCH', body: { status: 'live' } });
  assert.equal((await S.t.call('/s/myblog/')).status, 200);
  S.t.DB.raw.prepare('UPDATE users SET plan_expires=? WHERE id=?').run(Date.now() - 1000, S.u.id);
  assert.equal((await S.t.call('/s/myblog/')).status, 402);
  const del = await S.api(`/${id}`, { method: 'DELETE' }); assert.equal(del.status, 200);
  assert.equal([...S.SLIPS.m.keys()].filter(k => k.startsWith('sites/')).length, 0, 'files removed from R2');
});

test('sites: publish an Artifact; contact form lands in the owner inbox (bots dropped, rate limited)', async () => {
  const S = await setup();
  const aid = S.t.DB.raw.prepare("INSERT INTO artifacts (user_id,title,ver,created_at,updated_at) VALUES (?,?,1,1,1) RETURNING id").get(S.u.id, 'Landing').id;
  S.t.DB.raw.prepare('INSERT INTO artifact_versions (artifact_id,ver,html,created_at) VALUES (?,1,?,1)').run(aid, '<form method="post" action="__form"><input name="email"></form>');
  const r = await S.api('', { method: 'POST', body: { slug: 'landing', src: 'artifact', src_id: aid } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const post = (body, headers = {}) => S.t.worker.default.fetch(new Request('https://t.test/s/landing/__form', { method: 'POST', headers: { origin: 'null', ...headers }, body }), S.t.env, S.t.ctx);
  const fd = new FormData(); fd.append('email', 'a@b.c'); fd.append('msg', 'สวัสดี');
  const ok = await post(fd); assert.equal(ok.status, 200); assert.match(ok.headers.get('content-security-policy'), /sandbox/);
  const bot = new FormData(); bot.append('email', 'x'); bot.append('_gotcha', 'y'); await post(bot);
  const js = await post(JSON.stringify({ name: 'B' }), { 'content-type': 'application/json' }); assert.equal((await js.json()).ok, true); assert.equal(js.headers.get('access-control-allow-origin'), '*');
  const id = r.data.site.id, inbox = await S.api(`/${id}/forms`);
  assert.equal(inbox.data.length, 2, 'bot submission dropped'); assert.equal(inbox.data[1].data.msg, 'สวัสดี');
  assert.equal((await S.api('')).data.sites[0].unread, 2);
  await S.api(`/${id}/forms/seen`, { method: 'POST' }); assert.equal((await S.api('')).data.sites[0].unread, 0);
  const nx = new FormData(); nx.append('a', '1'); nx.append('_next', 'thanks.html'); const red = await post(nx);
  assert.equal(red.status, 303); assert.equal(red.headers.get('location'), '/s/landing/thanks.html');
  for (let i = 0; i < 8; i++) await post(fd);
  assert.equal((await post(fd)).status, 429);
});

test('sites: reports alert the admin; admin can ban and the site goes dark', async () => {
  const S = await setup();
  const id = (await S.api('', { method: 'POST', body: { slug: 'scam', src: 'project', src_id: S.pid } })).data.site.id;
  assert.equal((await S.t.call('/sites/report?s=scam')).status, 200);
  assert.equal((await S.t.json('/api/sites/report', { method: 'POST', body: { slug: 'scam', reason: 'หลอกลวง' } })).status, 200);
  const admin = await S.t.user({ role: 'admin' });
  const list = await S.t.json('/api/admin/sites', { cookie: admin.cookie }); assert.equal(list.data[0].reports, 1);
  assert.equal((await S.t.json('/api/admin/sites/' + id, { method: 'PATCH', cookie: admin.cookie, body: { status: 'banned' } })).status, 200);
  assert.equal((await S.t.call('/s/scam/')).status, 451);
  assert.equal((await S.api(`/${id}`, { method: 'PATCH', body: { status: 'live' } })).status, 403, 'owner cannot unban');
  assert.equal((await S.api(`/${id}/publish`, { method: 'POST' })).status, 403);
});
