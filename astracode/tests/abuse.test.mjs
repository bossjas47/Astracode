// จับแอคหลุม (บัญชีที่ใช้ IP เต็ม/อุปกรณ์เดียวกันหลายบัญชี) + เก็บหลักฐาน + สแกน/บันทึกเคส/แบนทั้งวง
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';

const sig = (DB, uid, { ip = null, fp = null, kind = 'session', at = Date.now() } = {}) =>
  DB.raw.prepare('INSERT INTO account_signals (user_id,kind,ip,ua,fp,created_at) VALUES (?,?,?,?,?,?)').run(uid, kind, ip, 'UA', fp, at);

test('abuseScan groups accounts sharing a full IP or device fingerprint, scores and flags them', async () => {
  const t = await makeEnv();
  const { abuseScan, scoreGroup, evidenceFor } = await import('../src/abuse.js');
  const u = []; for (let i = 0; i < 4; i++) u.push((await t.user()).id);
  const other = (await t.user()).id;
  // u0..u2 ใช้ IP เดียวกัน · u2,u3 ใช้ fp เดียวกัน → รวมเป็นวงเดียว 4 บัญชี · other แยก
  for (const id of [u[0], u[1], u[2]]) sig(t.DB, id, { ip: '203.0.113.9' });
  sig(t.DB, u[2], { fp: 'deadbeefcafe1234' }); sig(t.DB, u[3], { fp: 'deadbeefcafe1234' });
  sig(t.DB, other, { ip: '8.8.8.8' });
  // ธงความเสี่ยง: สลิปถูกปฏิเสธ + แบน
  t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,status,slip_key,created_at) VALUES (?,?,?,?,?,?)").run(u[0], 1, 500, 'rejected', 'k', Date.now());
  const cl = await abuseScan(t.env, { days: 30, min: 2 });
  assert.equal(cl.length, 1, 'one cluster');
  assert.deepEqual([...cl[0].ids].sort((a, b) => a - b), [u[0], u[1], u[2], u[3]].sort((a, b) => a - b));
  assert.ok(cl[0].score > 20); assert.ok(cl[0].flags.some(f => /ปฏิเสธ/.test(f)));
  const ev = await evidenceFor(t.env, cl[0].ids);
  assert.equal(ev.accounts.length, 4);
  assert.ok(ev.devices.some(d => d.v === '203.0.113.9' && d.n === 3), 'shared IP in evidence');
  assert.ok(ev.timeline.some(x => /ปฏิเสธ/.test(x.event)), 'rejected slip in timeline');
});

test('/api/signal stores a device fingerprint, and admin scan/case/ban works end-to-end', async () => {
  const t = await makeEnv();
  const a = await t.user(), b = await t.user(), adm = await t.user({ role: 'admin' });
  // สองบัญชีส่ง fingerprint เดียวกันผ่าน /api/signal
  for (const u of [a, b]) assert.equal((await t.json('/api/signal', { method: 'POST', cookie: u.cookie, body: { fp: 'aabbccddeeff0011' } })).status, 200);
  const scan = await t.json('/api/admin/abuse/scan?min=2', { cookie: adm.cookie });
  assert.equal(scan.status, 200); assert.equal(scan.data.clusters.length, 1);
  const ids = scan.data.clusters[0].ids;
  // non-admin ถูกปฏิเสธ
  assert.equal((await t.json('/api/admin/abuse/scan', { cookie: a.cookie })).status, 403);
  // บันทึกเคส + แบนทั้งวง
  const saved = await t.json('/api/admin/abuse/case', { method: 'POST', cookie: adm.cookie, body: { ids, label: 'Tenixe ring', ban: true } });
  assert.equal(saved.status, 200); assert.equal(saved.data.banned, true);
  for (const u of [a, b]) assert.equal(t.DB.raw.prepare('SELECT banned,no_report FROM users WHERE id=?').get(u.id).banned, 1);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(a.id).n, 0, 'sessions cut');
  const cases = await t.json('/api/admin/abuse/cases', { cookie: adm.cookie });
  assert.equal(cases.data.cases.length, 1); assert.equal(cases.data.cases[0].label, 'Tenixe ring');
});

test('recordSignal captures the full IP from the request header on login, admin only', async () => {
  const t = await makeEnv();
  const u = await t.user();
  const { recordSignal } = await import('../src/abuse.js');
  await recordSignal(t.env, u.id, new Request('https://t', { headers: { 'cf-connecting-ip': '198.51.100.7', 'user-agent': 'Chrome' } }), 'session');
  const row = t.DB.raw.prepare('SELECT ip,ua FROM account_signals WHERE user_id=?').get(u.id);
  assert.equal(row.ip, '198.51.100.7'); assert.equal(row.ua, 'Chrome');
});
