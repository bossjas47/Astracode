// Artifact: AI สร้าง/แก้หน้าเว็บในแชต · เฉพาะแพลนจ่ายเงิน · แชร์ลิงก์เปิด/ปิด · หน้าแชร์อยู่ใน sandbox
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

const toolSSE = (res, name, args) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c' + Math.random(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) + '\n\n'); res.write('data: [DONE]\n\n'); res.end();
};
async function setup(price, plan) {
  let fm; fm = await fakeModel((req, res, body) => plan(fm, res, body));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  await t.json('/api/version'); t.DB.raw.prepare("UPDATE models SET tools='on' WHERE id=?").run(m.id);
  const p = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(p.id, Date.now() + 864e5, u.id);
  return { t, m, u, fm };
}

test('artifact: paid plan creates v1, update makes v2, share link is sandboxed + noindex, unshare kills the link', async () => {
  let n = 0;
  const { t, m, u, fm } = await setup(299, (fm, res, body) => {
    n++; const tools = body.messages.filter(x => x.role === 'tool').length;
    if (n === 1) return toolSSE(res, 'artifact', { title: 'เครื่องคิดเลข', html: '<html><body><h1>v1</h1></body></html>' });
    if (n === 3 && !tools) return toolSSE(res, 'artifact', { id: 1, title: 'เครื่องคิดเลข', html: '<html><body><h1>v2</h1></body></html>' });
    return fm.sse(res, 'เสร็จ');
  });
  assert.ok(fm.hits.length === 0);
  const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ทำเครื่องคิดเลข', model_id: m.id } }));
  assert.match(ev.filter(e => e.t).map(e => e.t).join(''), /\[\[art:1\|1\|เครื่องคิดเลข\]\]/);
  assert.ok(fm.hits[0].body.tools.some(x => x.function.name === 'artifact'));
  const cid = ev.find(e => e.chat_id).chat_id; t.DB.raw.exec('DELETE FROM rate');
  const ev2 = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'แก้หัวข้อ', model_id: m.id, chat_id: cid } }));
  assert.match(ev2.filter(e => e.t).map(e => e.t).join(''), /\[\[art:1\|2\|/);
  assert.match(JSON.stringify(fm.hits[2].body.messages), /\[artifact id=1 v1: เครื่องคิดเลข\]/, 'model sees the id, not the marker');

  assert.equal((await t.json('/api/me', { cookie: u.cookie })).data.plan.artifacts, true);
  const a = await t.json('/api/artifacts/1', { cookie: u.cookie });
  assert.equal(a.data.ver, 2); assert.equal(a.data.versions.length, 2); assert.match(a.data.html, /v2/);
  const raw = await t.call('/api/artifacts/1/raw?v=1', { cookie: u.cookie });
  assert.match(await raw.text(), /v1/); assert.match(raw.headers.get('content-security-policy'), /sandbox allow-scripts/); assert.doesNotMatch(raw.headers.get('content-security-policy'), /allow-same-origin/);
  const other = await t.user(); assert.equal((await t.json('/api/artifacts/1', { cookie: other.cookie })).status, 404, 'other users cannot read it');

  const sh = await t.json('/api/artifacts/1/share', { method: 'POST', cookie: u.cookie, body: { on: true, ver: 1 } });
  assert.ok(sh.data.share_token);
  const shell = await t.call('/a/' + sh.data.share_token), sh0 = await shell.text();
  assert.match(sh0, /iframe src="\/a\/[A-Za-z0-9]+\/raw"/); assert.match(sh0, /รายงาน/); assert.match(sh0, /ทำแบบนี้ให้ฉัน/); assert.match(shell.headers.get('x-robots-tag'), /noindex/);
  const pub = await t.call('/a/' + sh.data.share_token + '/raw');
  const body = await pub.text();
  assert.match(body, /v1/, 'locked to v1'); assert.match(body, /สร้างด้วย AstraCode/);
  assert.match(pub.headers.get('x-robots-tag'), /noindex/); assert.match(pub.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await t.json('/api/gallery')).data.length, 0, 'not in the gallery unless chosen');
  await t.json('/api/artifacts/1/share', { method: 'POST', cookie: u.cookie, body: { on: true, gallery: true } });
  assert.equal((await t.json('/api/gallery')).data[0].title, 'เครื่องคิดเลข');
  for (let i = 0; i < 2; i++) await t.json('/api/a/' + sh.data.share_token + '/report', { method: 'POST' });
  assert.equal((await t.json('/api/gallery')).data.length, 0, '2 reports hide it from the gallery');
  const adm = await t.user({ role: 'admin' }), al = (await t.json('/api/admin/artifacts', { cookie: adm.cookie })).data;
  assert.equal(al[0].reports, 2);
  await t.json('/api/admin/artifacts/1', { method: 'PUT', cookie: adm.cookie, body: { unshare: true } });
  assert.equal((await t.call('/a/' + sh.data.share_token)).status, 404, 'admin closed the link');
  await t.json('/api/artifacts/1/share', { method: 'POST', cookie: u.cookie, body: { on: false } });
  assert.equal((await t.call('/a/' + sh.data.share_token)).status, 404);
  assert.equal((await t.json('/api/artifacts', { cookie: u.cookie })).data.length, 1);
  assert.equal((await t.json('/api/artifacts/1', { method: 'DELETE', cookie: u.cookie })).status, 200);
  assert.equal((await t.json('/api/artifacts', { cookie: u.cookie })).data.length, 0);
});

test('artifact: free plan has no artifact tool and cannot share', async () => {
  const { t, m, u, fm } = await setup(0, (fm, res) => fm.sse(res, 'ok'));
  await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ทำเกม', model_id: m.id } }));
  assert.ok(!(fm.hits[0].body.tools || []).some(x => x.function.name === 'artifact'));
  assert.equal((await t.json('/api/me', { cookie: u.cookie })).data.plan.artifacts, false, 'client shows the upgrade button');
  t.DB.raw.prepare("INSERT INTO artifacts (id,user_id,title,created_at,updated_at) VALUES (5,?,'x',0,0)").run(u.id);
  assert.equal((await t.json('/api/artifacts/5/share', { method: 'POST', cookie: u.cookie, body: { on: true } })).status, 403);
});
