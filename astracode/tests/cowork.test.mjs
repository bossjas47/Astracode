// Cowork: เฉพาะแพลนที่เปิด cowork · ล็อก Sonnet 5.5 Eco · ไฟล์แนบเก็บ R2 · เริ่มงานในเครื่องเสมือน · จบรอบเก็บไฟล์ผลงาน + เพิกถอน key
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan } from './helpers.mjs';

const r2 = () => { const m = new Map(); return { m, put: async (k, v) => { m.set(k, v instanceof Uint8Array ? v : new TextEncoder().encode(String(v))); }, get: async k => m.has(k) ? { body: m.get(k), arrayBuffer: async () => m.get(k).buffer } : null, delete: async k => { m.delete(k); }, list: async () => ({ objects: [] }) }; };

test('cowork: plan gate, Sonnet Eco only, files to R2, start in the sandbox, finish stores artifacts and revokes the key', async () => {
  const starts = [], SLIPS = r2();
  const AGENTBOX = { idFromName: n => n, get: n => ({ fetch: async (url, init) => { starts.push({ n, url, body: init?.body ? JSON.parse(init.body) : null }); return new Response('ok'); } }) };
  const t = await makeEnv({ K: 'k', AGENTBOX, SLIPS });
  await t.json('/api/version');
  const sonnet = addModel(t.DB, { name: 'Claude Sonnet 5.5 Eco', base_url: 'http://x' }), other = addModel(t.DB, { name: 'Cheap', base_url: 'http://x' });
  const pro = addPlan(t.DB, { models: [sonnet.id, other.id], limit_4h: 1e6, limit_week: 1e6, price: 749 }), plus = addPlan(t.DB, { models: [other.id], limit_4h: 1e6, limit_week: 1e6, price: 349 });
  t.DB.raw.prepare('UPDATE plans SET cowork=1 WHERE id=?').run(pro.id);
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plus.id, Date.now() + 864e5, u.id);
  assert.equal((await t.json('/api/cowork', { method: 'POST', cookie: u.cookie, body: { prompt: 'ทำรายงาน' } })).status, 402, 'Plus cannot use Cowork');
  t.DB.raw.prepare('UPDATE users SET plan_id=? WHERE id=?').run(pro.id, u.id);
  assert.equal((await t.json('/api/me', { cookie: u.cookie })).data.plan.cowork, true);
  t.DB.raw.prepare('INSERT INTO skills (user_id,name,content,enabled,created_at) VALUES (?,?,?,1,?)').run(u.id, 'company-report', 'ใส่โลโก้บริษัททุกหน้า', Date.now());
  const r = await t.json('/api/cowork', { method: 'POST', cookie: u.cookie, body: { prompt: 'สรุปยอดขาย', files: [{ name: 'ยอดขาย.csv', text: 'a,1' }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); const id = r.data.id;
  const st = starts.find(s => s.url.endsWith('/start')).body;
  assert.match(st.run.skills, /company-report[\s\S]*ใส่โลโก้/); assert.equal(st.kind, 'cowork'); assert.equal(st.run.cowork, true); assert.equal(st.run.model, 'claude-sonnet-5.5-eco');
  assert.deepEqual(st.run.files.map(f => f.path), ['ยอดขาย.csv']);
  assert.ok(SLIPS.m.has(`cowork/${u.id}/${id}/ยอดขาย.csv`));
  assert.equal((await t.json('/api/cowork', { method: 'POST', cookie: u.cookie, body: { prompt: 'อีกงาน' } })).status, 429, 'one running task at a time');
  const { finishCowork } = await import('../src/cowork.js');
  await finishCowork(t.env || { DB: t.DB, SLIPS }, id, { status: 'done', final: 'เสร็จแล้ว', files: [{ path: 'ยอดขาย.csv', size: 3, mtime: 1, content: 'a,1' }, { path: 'สรุป.xlsx', size: 4, mtime: 2, content: 'data:application/octet-stream;base64,UEsDBA==' }] });
  const d = (await t.json('/api/cowork/' + id, { cookie: u.cookie })).data;
  assert.equal(d.status, 'done'); assert.ok(d.files.some(f => f.path === 'สรุป.xlsx' && f.by === 'ai')); assert.ok(d.files.some(f => f.path === 'ยอดขาย.csv' && f.by === 'user'));
  const f = await t.call(`/api/cowork/${id}/file?path=${encodeURIComponent('สรุป.xlsx')}`, { cookie: u.cookie });
  assert.equal(f.status, 200); assert.match(f.headers.get('content-type'), /spreadsheetml/); assert.deepEqual([...new Uint8Array(await f.arrayBuffer())], [80, 75, 3, 4]);
  assert.equal(t.DB.raw.prepare("SELECT revoked FROM api_keys WHERE name='Cloud Agent'").get().revoked, 1);
  const other2 = await t.user(); assert.equal((await t.json('/api/cowork/' + id, { cookie: other2.cookie })).status, 404);
  assert.equal((await t.json(`/api/cowork/${id}/say`, { method: 'POST', cookie: u.cookie, body: { prompt: 'แก้ชื่อไฟล์' } })).status, 200);
  assert.equal(starts.filter(s => s.url.endsWith('/start')).at(-1).body.run.follow, true);
  // งาน Cowork ตามเวลา: เปิดงานใหม่ (ถ้างานเดิมยังทำอยู่ ต้องบอกเหตุผล ไม่เงียบ)
  await finishCowork({ DB: t.DB, SLIPS }, id, { status: 'done', final: 'ok', files: [] });
  const sc = await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body: { title: 'รายงานจันทร์', prompt: 'ทำรายงานยอดขาย', hour: 8, days: 'mon', cowork: 1 } });
  assert.equal(sc.status, 200, JSON.stringify(sc.data)); assert.equal(sc.data.cowork, 1);
  const run = await t.json(`/api/schedules/${sc.data.id}/run`, { method: 'POST', cookie: u.cookie });
  assert.equal(run.data.status, 'ok'); assert.ok(run.data.task_id > id);
  assert.match(starts.at(-1).body.run.prompt, /งาน Kyber Harness ตามเวลา: รายงานจันทร์/);
});
