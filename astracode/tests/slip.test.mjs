// ตรวจสลิปอัตโนมัติด้วย EasySlip (ใช้เซิร์ฟเวอร์ปลอมแทน EasySlip จริง)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, fakeModel } from './helpers.mjs';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const slipData = (o = {}) => ({ status: 200, data: { transRef: 'REF' + Math.random().toString(36).slice(2, 8), date: new Date().toISOString(), amount: { amount: 200 }, receiver: { account: { name: { th: 'ร้าน' }, bank: { type: 'BANKAC', account: 'x-xxx-x5678-x' }, proxy: { type: 'MSISDN', account: '088-xxx-4567' } } }, ...o } });
async function setup(reply, settings = {}) {
  const hits = []; const fm = await fakeModel((q, res, body) => { hits.push(q.headers.authorization); const r = typeof reply === 'function' ? reply() : reply; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); });
  const t = await makeEnv({ EASYSLIP_KEY: 'es-test' });
  for (const [k, v] of Object.entries({ slip_provider: 'easyslip', easyslip_url: fm.url + '/api/v1/verify', promptpay_id: '0881234567', ...settings })) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
  const u = await t.user(), admin = await t.user({ role: 'admin' }); let n = 0;
  const topup = async amount => { const fd = new FormData(); fd.set('kind', 'topup'); fd.set('amount', String(amount)); fd.set('slip', new File([PNG, new Uint8Array([++n + Math.floor(Math.random() * 200)])], 's.png', { type: 'image/png' })); const r = await t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', headers: { cookie: u.cookie }, body: fd }), t.env, t.ctx); return { status: r.status, d: await r.json() }; };
  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance, pay = () => t.DB.raw.prepare('SELECT status,slip_check FROM payments WHERE user_id=? ORDER BY id DESC').get(u.id);
  return { t, fm, hits, topup, bal, pay, admin };
}

test('EasySlip: a real slip with the right amount, date and receiver is approved at once; the key is sent as Bearer', async () => {
  const { fm, hits, topup, bal, pay } = await setup(() => slipData());
  const r = await topup(200); assert.equal(r.status, 200, JSON.stringify(r.d)); assert.equal(r.d.approved, true);
  assert.equal(bal(), 200); assert.equal(pay().status, 'approved'); assert.equal(hits[0], 'Bearer es-test'); fm.close();
});

test('EasySlip: wrong amount, wrong receiver, old date and duplicates are rejected without crediting', async () => {
  const cases = [[slipData({ amount: { amount: 150 } }), /ยอดเงิน/], [slipData({ receiver: { account: { bank: { account: 'x-xxx-x9999-x' }, proxy: { account: '099-xxx-9999' } } } }), /ผู้รับ/], [slipData({ date: new Date(Date.now() - 5 * 864e5).toISOString() }), /วันที่/], [{ status: 400, message: 'duplicate_slip', data: { transRef: 'R1', amount: { amount: 200 } } }, /ถูกใช้/]];
  for (const [reply, msg] of cases) {
    const { fm, topup, bal, pay } = await setup(reply); const r = await topup(200);
    assert.equal(r.status, 400); assert.match(r.d.error, msg); assert.equal(bal(), 0); assert.equal(pay().status, 'rejected'); fm.close();
  }
});

test('EasySlip: unreadable slip, quota errors, or an unverifiable receiver leave the payment pending for an admin', async () => {
  for (const reply of [{ status: 404, message: 'slip_not_found' }, { status: 403, message: 'quota_exceeded' }, slipData({ receiver: { account: { bank: { account: 'xxx' } } } })]) {
    const { fm, topup, bal, pay } = await setup(reply); const r = await topup(200);
    assert.equal(r.status, 200); assert.ok(!r.d.approved); assert.equal(bal(), 0); assert.equal(pay().status, 'pending'); fm.close();
  }
});

test('EasySlip: auto-approve off keeps a good slip pending; no receiver configured skips the receiver check', async () => {
  const a = await setup(() => slipData(), { slip_auto_approve: '0' }); const r = await a.topup(200);
  assert.ok(!r.d.approved); assert.equal(a.pay().status, 'pending'); a.fm.close();
  const b = await setup(() => slipData(), { promptpay_id: '' }); assert.equal((await b.topup(200)).d.approved, true); b.fm.close();
});

test('receiverMatches compares only the visible digits of masked account numbers', async () => {
  const { receiverMatches } = await import(new URL('../src/billing.js', import.meta.url).href);
  const slip = a => ({ receiver: { account: { bank: { account: a } } } });
  assert.equal(receiverMatches(slip('088-xxx-1234'), '0881234567'), false); // หลักท้ายไม่ตรง
  assert.equal(receiverMatches(slip('088-xxx-4567'), '0881234567'), true);
  assert.equal(receiverMatches(slip('+66-88-xxx-4567'), '0881234567'), true);
  assert.equal(receiverMatches(slip('099-xxx-4567'), '0881234567'), false);
  assert.equal(receiverMatches(slip('xxxxxxx'), '0881234567'), null);
  assert.equal(receiverMatches(slip('x'), ''), true);
});
