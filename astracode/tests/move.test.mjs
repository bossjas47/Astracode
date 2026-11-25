// ย้ายโดเมน: หน้าเว็บที่โดเมนเดิมพาไปโดเมนใหม่โดยไม่หลุดล็อกอิน · /api และ /v1 ไม่ถูกแตะ · แอปที่ฝังเว็บไม่ถูกย้าย
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';

const at = (t, url, { cookie, ua } = {}) => t.worker.default.fetch(new Request(url, { headers: { ...(cookie ? { cookie } : {}), ...(ua ? { 'user-agent': ua } : {}) }, redirect: 'manual' }), t.env, t.ctx);

test('domain move: guests get 301, logged-in users carry their login over with a one-time ticket; API, apps and assets stay put', async () => {
  const t = await makeEnv({ PUBLIC_URL: 'https://kyber.hypatir.dev' }), u = await t.user();
  const g = await at(t, 'https://astracode.panderx.xyz/plans?x=1');
  assert.equal(g.status, 301); assert.equal(g.headers.get('location'), 'https://kyber.hypatir.dev/plans?x=1');
  const r = await at(t, 'https://astracode.panderx.xyz/chat?id=7', { cookie: u.cookie });
  assert.equal(r.status, 302); const loc = new URL(r.headers.get('location'));
  assert.equal(loc.host, 'kyber.hypatir.dev'); assert.equal(loc.pathname, '/handoff'); assert.equal(loc.searchParams.get('next'), '/chat?id=7');
  const h = await at(t, loc.toString().replace('https://kyber.hypatir.dev', 'https://kyber.hypatir.dev'));
  assert.equal(h.status, 302); assert.equal(h.headers.get('location'), '/chat?id=7'); const sid = /sid=([a-f0-9]+)/.exec(h.headers.get('set-cookie') || '')?.[1]; assert.ok(sid, 'new session cookie on the new domain');
  const me = await t.worker.default.fetch(new Request('https://kyber.hypatir.dev/api/me', { headers: { cookie: 'sid=' + sid } }), t.env, t.ctx);
  assert.equal((await me.json()).email, u.email, 'logged in on the new domain');
  const again = await at(t, loc.toString()); assert.equal(again.headers.get('set-cookie'), null, 'ticket works once');
  assert.equal((await at(t, 'https://kyber.hypatir.dev/handoff?t=zz&next=//evil.com')).headers.get('location'), '/', 'no open redirect');
  // ไม่ย้าย: API, /v1, ไฟล์ static, แอปคอมรุ่นเก่า (Electron), แอปมือถือ (WebView), โดเมนใหม่เอง
  assert.notEqual((await at(t, 'https://astracode.panderx.xyz/api/plans')).status, 301);
  assert.notEqual((await at(t, 'https://astracode.panderx.xyz/v1/models')).status, 301);
  assert.notEqual((await at(t, 'https://astracode.panderx.xyz/app.js')).status, 301);
  assert.equal((await at(t, 'https://astracode.panderx.xyz/chat', { ua: 'Mozilla/5.0 Electron/33.0.0' })).status, 200);
  assert.equal((await at(t, 'https://astracode.panderx.xyz/chat', { ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit' })).status, 200);
  assert.equal((await at(t, 'https://kyber.hypatir.dev/chat')).status, 200);
  // แอปคอมรุ่นใหม่บังคับย้ายด้วย ?handoff=1 (พาล็อกอินไปด้วย)
  const d = await at(t, 'https://astracode.panderx.xyz/chat?handoff=1', { cookie: u.cookie, ua: 'Electron/33' }); assert.equal(d.status, 302); assert.equal(new URL(d.headers.get('location')).searchParams.get('next'), '/chat');
});

test('domain move is off until PUBLIC_URL points to a new domain', async () => {
  const t = await makeEnv(); assert.equal((await at(t, 'https://astracode.panderx.xyz/plans')).status, 200);
  const o = await makeEnv({ PUBLIC_URL: 'https://astracode.panderx.xyz' }); assert.equal((await at(o, 'https://astracode.panderx.xyz/plans')).status, 200);
});
