// ตรวจสลิปอัตโนมัติด้วย EasySlip (ใช้เซิร์ฟเวอร์ปลอมแทน EasySlip จริง)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, fakeModel } from './helpers.mjs';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const slipData = (o = {}) => ({ status: 200, data: { transRef: 'REF' + Math.random().toString(36).slice(2, 8), date: new Date(Date.now() - 2 * 60e3).toISOString(), amount: { amount: 200 }, receiver: { account: { name: { th: 'นาย ณัฐภูมินทร์ จ' }, bank: { type: 'BANKAC', account: 'x-xxx-x5678-x' }, proxy: { type: 'MSISDN', account: '088-xxx-4567' } } }, ...o } });
async function setup(reply, settings = {}) {
  const hits = []; const fm = await fakeModel((q, res, body) => { hits.push(q.headers.authorization); const r = typeof reply === 'function' ? reply() : reply; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); });
  const t = await makeEnv({ EASYSLIP_KEY: 'es-test' });
  for (const [k, v] of Object.entries({ slip_provider: 'easyslip', easyslip_url: fm.url + '/api/v1/verify', promptpay_id: '0881234567', ...settings })) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
  const u = await t.user(), admin = await t.user({ role: 'admin' }); let n = 0;
  const topup = async amount => { const fd = new FormData(); fd.set('kind', 'topup'); fd.set('amount', String(amount)); fd.set('slip', new File([PNG, new Uint8Array([++n + Math.floor(Math.random() * 200)])], 's.png', { type: 'image/png' })); const r = await t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', headers: { cookie: u.cookie }, body: fd }), t.env, t.ctx); return { status: r.status, d: await r.json() }; };
  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance, pay = () => t.DB.raw.prepare('SELECT status,slip_check FROM payments WHERE user_id=? ORDER BY id DESC').get(u.id);
  return { t, fm, hits, topup, bal, pay, admin, u };
}

test('EasySlip: a real slip with the right amount, date and receiver is approved at once; the key is sent as Bearer', async () => {
  const { fm, hits, topup, bal, pay } = await setup(() => slipData());
  const r = await topup(200); assert.equal(r.status, 200, JSON.stringify(r.d)); assert.equal(r.d.approved, true);
  assert.equal(bal(), 200); assert.equal(pay().status, 'approved'); assert.equal(hits[0], 'Bearer es-test'); fm.close();
});

test('EasySlip: wrong amount, wrong receiver, old date and duplicates are rejected without crediting', async () => {
  const cases = [[slipData({ receiver: { account: { bank: { account: 'x-xxx-x9999-x' }, proxy: { account: '099-xxx-9999' } } } }), /ผู้รับ/], [slipData({ date: new Date(Date.now() - 16 * 60e3).toISOString() }), /วันที่/], [{ status: 400, message: 'duplicate_slip', data: { transRef: 'R1', amount: { amount: 200 } } }, /ถูกใช้/]];
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

test('EasySlip: slip must be within 15 minutes; a slip that was already scanned (even if rejected) can never be used again', async () => {
  const again = slipData({ transRef: 'ONCE1' }); // สลิปใบเดิมที่เคยถูกสแกนและปฏิเสธไปแล้ว ภาพคนละไฟล์
  const b = await setup(() => again);
  b.t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,slip_ref,status,kind,period,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(b.admin.id, 0, 200, 'slip/old', 'ONCE1', 'rejected', 'topup', 'month', Date.now());
  const r = await b.topup(200); assert.equal(r.status, 400); assert.match(r.d.error, /ถูกใช้/); assert.equal(b.bal(), 0); b.fm.close();
  const ok = await setup(() => slipData({ date: new Date(Date.now() - 12 * 60e3).toISOString() })); assert.equal((await ok.topup(200)).d.approved, true); ok.fm.close();
});

test('EasySlip: receiver name must match; first name alone is accepted as the fallback; a different name is rejected; account digits cannot contradict', async () => {
  const names = { easyslip_receiver_names: 'ณัฐภูมินทร์ จูบ้ง, ณัฐภูมินทร์' };
  const rcv = (name, acc = '088-xxx-4567') => ({ receiver: { account: { name: { th: name }, bank: { type: 'BANKAC', account: 'x-xxx-x5678-x' }, proxy: { type: 'MSISDN', account: acc } } } });
  for (const [reply, approved, label] of [[slipData(rcv('นาย ณัฐภูมินทร์ จูบ้ง')), true, 'full name'], [slipData(rcv('นาย ณัฐภูมินทร์ จ')), true, 'first name + initial'], [slipData(rcv('น.ส. สมหญิง ใจดี')), false, 'other person'], [slipData(rcv('นาย ณัฐภูมินทร์ จ', '099-xxx-9999')), false, 'name ok but account contradicts'], [slipData({ receiver: { account: { name: { en: 'MR. NATTHAPHUMIN J' }, proxy: { account: '088-xxx-4567' } } } }), true, 'no Thai name: digits decide']]) {
    const x = await setup(reply, names); const r = await x.topup(200);
    assert.equal(!!r.d.approved, approved, label); if (!approved) assert.equal(x.pay().status, 'rejected', label); x.fm.close();
  }
  const { receiverNameMatches } = await import(new URL('../src/billing.js', import.meta.url).href);
  assert.equal(receiverNameMatches({ receiver: { account: { name: { th: 'นางสาว ณัฐภูมินทร์ จ.' } } } }, ['ณัฐภูมินทร์']), true);
  assert.equal(receiverNameMatches({ receiver: { account: { name: { en: 'X' } } } }, ['ณัฐภูมินทร์']), null);
});

test('top-up is credited by the amount on the slip; a plan needs the exact amount; below the minimum is rejected', async () => {
  const a = await setup(() => slipData({ amount: { amount: 150 } })); // กรอก 200 แต่สลิป 150
  const r = await a.topup(200); assert.equal(r.d.approved, true); assert.equal(a.bal(), 150); assert.equal(a.pay().status, 'approved');
  assert.equal(a.t.DB.raw.prepare('SELECT amount FROM payments ORDER BY id DESC').get().amount, 150); a.fm.close();
  const low = await setup(() => slipData({ amount: { amount: 5 } }), { topup_min: '20' }); const lr = await low.topup(200);
  assert.equal(lr.status, 400); assert.match(lr.d.error, /ขั้นต่ำ/); assert.equal(low.bal(), 0); low.fm.close();
  const plan = await setup(() => slipData({ amount: { amount: 150 } })); // แพลน 349 แต่โอน 150 → ปฏิเสธ
  const pl = plan.t.DB.raw.prepare("INSERT INTO plans (name,price,limit_4h,limit_week,seats,shared_pool,active,sort) VALUES ('P',349,1,5,1,0,1,1) RETURNING id").get();
  const fd = new FormData(); fd.set('kind', 'plan'); fd.set('plan_id', String(pl.id)); fd.set('slip', new File([PNG, new Uint8Array([77])], 's.png', { type: 'image/png' }));
  const pr = await plan.t.worker.default.fetch(new Request('https://t.test/api/pay', { method: 'POST', headers: { cookie: plan.u.cookie }, body: fd }), plan.t.env, plan.t.ctx);
  assert.equal(pr.status, 400); assert.match((await pr.json()).error, /ยอดเงิน/); assert.equal(plan.t.DB.raw.prepare('SELECT plan_id FROM users WHERE id=?').get(plan.u.id).plan_id, null); plan.fm.close();
});

test('direct bank-account transfers (account number shown, not the phone) are accepted when the bank account is configured', async () => {
  const slip = slipData({ receiver: { account: { name: { th: 'นาย ณัฐภูมินทร์ จ' }, bank: { type: 'BANKAC', account: 'xxx-x-x3233-x' } } } });
  const a = await setup(() => slip, { promptpay_id: '0629708835', bank_account: '193-1-13233-0' }); assert.equal((await a.topup(100)).d.approved, true); a.fm.close();
  const b = await setup(() => slipData({ receiver: { account: { name: { th: 'นาย ณัฐภูมินทร์ จ' }, bank: { type: 'BANKAC', account: 'xxx-x-x9999-x' } } } }), { promptpay_id: '0629708835', bank_account: '193-1-13233-0' });
  assert.equal((await b.topup(100)).status, 400); b.fm.close();
});

test('EasySlip v2 (URL contains /v2): JSON base64 request to /v2/verify/bank and the rawSlip response shape are understood', async () => {
  const v2 = () => ({ success: true, data: { rawSlip: { transRef: 'V2REF1', date: new Date(Date.now() - 60e3).toISOString(), amount: { amount: 120 }, receiver: { account: { name: { th: 'นาย ณัฐภูมินทร์ จ' }, proxy: { type: 'MSISDN', account: '062-xxx-8835' } } } } } });
  const seen = []; const a = await setup(() => v2(), {}); a.fm.close();
  const fm = await (await import('./helpers.mjs')).fakeModel((q, res, body) => { seen.push({ url: q.url, ct: q.headers['content-type'], body }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v2())); });
  const b = await setup(() => v2(), { easyslip_url: fm.url + '/v2', promptpay_id: '0629708835', easyslip_receiver_names: 'ณัฐภูมินทร์' });
  const r = await b.topup(120); assert.equal(r.d.approved, true, JSON.stringify(r.d)); assert.equal(b.bal(), 120);
  assert.equal(seen[0].url, '/v2/verify/bank'); assert.match(seen[0].ct, /json/); assert.ok(seen[0].body.base64.length > 10); assert.equal(seen[0].body.checkDuplicate, true);
  fm.close(); b.fm.close();
});

test('EasySlip v2: a 400 on the JSON body falls back to a multipart image upload on the same endpoint', async () => {
  const seen = []; const { fakeModel } = await import('./helpers.mjs');
  const ok = { success: true, data: { rawSlip: { transRef: 'V2REF2', date: new Date(Date.now() - 60e3).toISOString(), amount: { amount: 100 }, receiver: { account: { name: { th: 'นาย ณัฐภูมินทร์ จ' }, proxy: { type: 'MSISDN', account: '062-xxx-8835' } } } } } };
  const fm = await fakeModel((q, res) => { seen.push(q.url + ' ' + String(q.headers['content-type']).split(';')[0]); const json = /json/.test(q.headers['content-type']); res.writeHead(json ? 400 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(json ? { success: false, error: { code: 'VALIDATION_ERROR', message: 'bad body' } } : ok)); });
  const x = await setup(() => ({}), { easyslip_url: fm.url + '/v2/verify/bank', promptpay_id: '0629708835', easyslip_receiver_names: 'ณัฐภูมินทร์' }); x.fm.close();
  const r = await x.topup(100); assert.equal(r.d.approved, true, JSON.stringify(r.d)); assert.deepEqual(seen, ['/v2/verify/bank application/json', '/v2/verify/bank multipart/form-data']); fm.close();
});

test('three automatic slip checks in a row that the provider could not process raise the failure streak; a good slip resets it', async () => {
  let good = false; const { t, fm, topup } = await setup(() => good ? slipData() : { status: 404, message: 'NOT_FOUND' });
  const streak = () => t.DB.raw.prepare("SELECT value FROM settings WHERE key='slip_fail_streak'").get()?.value;
  for (let i = 0; i < 3; i++) { t.DB.raw.exec('DELETE FROM rate; DELETE FROM payments'); await topup(200); }
  assert.equal(streak(), '3');
  good = true; t.DB.raw.exec('DELETE FROM rate; DELETE FROM payments'); await topup(200); assert.equal(streak(), '0');
  fm.close();
});

test('the same slip (same bank reference) sent twice at the same moment is credited only once', async () => {
  const same = slipData({ transRef: 'SAMEREF1' }); same.data.transRef = 'SAMEREF1';
  const { fm, topup, bal } = await setup(() => same);
  const rs = await Promise.all([topup(200), topup(200), topup(200)]);
  assert.equal(bal(), 200, JSON.stringify(rs.map(r => r.d))); assert.equal(rs.filter(r => r.d.approved).length, 1); fm.close();
});

test('EasySlip: transfer straight to the shop bank account passes even when easyslip_receiver is only the PromptPay phone', async () => {
  const v2 = () => ({ success: true, data: { amountInSlip: 10, rawSlip: { transRef: 'BANKREF1', date: new Date(Date.now() - 60e3).toISOString(), amount: { amount: 10 }, receiver: { bank: { short: 'KBANK' }, account: { name: { th: 'นาย ณัฐภูมินทร์ จ' }, bank: { type: 'BANKAC', account: 'xxx-x-x3233-x' } } } } } });
  const b = await setup(() => v2(), { topup_min: '10', easyslip_receiver: '0629708835', promptpay_id: '0629708835', bank_account: '193-1-13233-0', easyslip_receiver_names: 'ณัฐภูมินทร์ จูบ้ง, ณัฐภูมินทร์' });
  const r = await b.topup(10); assert.equal(r.d.approved, true, JSON.stringify(r.d)); assert.equal(b.bal(), 10);
  b.fm.close();
});

test('CheckSlip: FOUND with right amount and receiver is approved; DUPLICATE and QR_TAMPERED are rejected; a bad key leaves it pending', async () => {
  const found = (o = {}) => ({ request_id: 'rq', outcome: 'FOUND', slip: { trans_ref: 'CS' + Math.random().toString(36).slice(2, 8), transferred_at: new Date(Date.now() - 60e3).toISOString(), amount: { satang: 20000, currency: 'THB' }, receiver: { kind: 'BANK_ACCOUNT', name_th: 'นาย ณัฐภูมินทร์ จ', account: '088-xxx-4567' }, ...o } });
  const run = async reply => { const x = await setup(reply, { slip_provider: 'checkslip', checkslip_url: '' }); x.t.env.CHECKSLIP_KEY = 'csk_test'; x.t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('checkslip_url',?)").run(x.fm.url); return x; };
  const a = await run(() => found()); const r = await a.topup(200);
  assert.equal(r.d.approved, true, JSON.stringify(r.d)); assert.equal(a.bal(), 200); assert.equal(a.hits[0], 'Bearer csk_test'); a.fm.close();
  for (const [reply, msg] of [[{ outcome: 'DUPLICATE', slip: { trans_ref: 'D1' } }, /ถูกใช้/], [{ status: 422, code: 'QR_TAMPERED', title: 'QR tampered' }, /ปลอม/], [found({ receiver: { account: '099-xxx-9999' } }), /ผู้รับ/]]) { // ยอดไม่ตรง: เติม Wallet ใช้ยอดตามสลิป จึงไม่ปฏิเสธ (judgeSlip ชุดเดียวกับ EasySlip ทดสอบแล้ว)
    const b = await run(reply); const q = await b.topup(200); assert.equal(q.status, 400, JSON.stringify(q.d)); assert.match(q.d.error, msg); assert.equal(b.bal(), 0); b.fm.close();
  }
  const c = await run({ status: 401, code: 'UNAUTHENTICATED', title: 'Invalid API key' }); const q = await c.topup(200);
  assert.equal(q.status, 200); assert.ok(!q.d.approved); assert.equal(c.pay().status, 'pending'); assert.match(c.pay().slip_check, /UNAUTHENTICATED/); c.fm.close();
});

test('CheckSlip: an empty reply is retried; a top-up is credited with the amount in the slip; admin approves a top-up with the slip amount', async () => {
  let n = 0; const slip10 = () => ({ request_id: 'rq', outcome: 'FOUND', slip: { trans_ref: 'CS' + Math.random().toString(36).slice(2, 8), transferred_at: new Date(Date.now() - 60e3).toISOString(), amount: { satang: 1000, currency: 'THB' }, receiver: { kind: 'PROMPTPAY', name_th: 'x', account: '088-xxx-4567' } } });
  const run = async reply => { const x = await setup(reply, { slip_provider: 'checkslip', topup_min: '10' }); x.t.env.CHECKSLIP_KEY = 'csk'; x.t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('checkslip_url',?)").run(x.fm.url); return x; };
  const a = await run(() => (++n === 1 ? {} : slip10())); const r = await a.topup(100);
  assert.equal(r.d.approved, true, JSON.stringify(r.d)); assert.equal(a.bal(), 10); assert.equal(n, 2); a.fm.close();
  // API ใช้ไม่ได้ → รอแอดมิน · แอดมินใส่ยอดตามสลิป 10 บาท (ลูกค้ากรอก 100)
  const b = await run({ status: 401, code: 'UNAUTHENTICATED' }); await b.topup(100);
  const pid = b.t.DB.raw.prepare('SELECT id FROM payments ORDER BY id DESC').get().id;
  const ap = await b.t.json(`/api/admin/payments/${pid}/approve`, { method: 'POST', cookie: b.admin.cookie, body: { amount: 10 } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data)); assert.equal(b.bal(), 10); assert.equal(b.t.DB.raw.prepare('SELECT amount FROM payments WHERE id=?').get(pid).amount, 10);
  b.fm.close();
});

test('CheckSlip shows only the last digits of the receiving account: name + last 4 digits auto-approve; no number or wrong name waits for the admin', async () => {
  const { judgeSlip, receiverTailMatches } = await import(new URL('../src/billing.js', import.meta.url).href);
  const s = { easyslip_receiver: '0629708835', easyslip_receiver_names: 'ณัฐภูมินทร์ จูบ้ง, ณัฐภูมินทร์', promptpay_id: '0629708835', bank_account: '193-1-13233-0' };
  const slip = (account, name = 'นาย ณัฐภูมินทร์ จ') => ({ provider: 'checkslip', success: true, data: { transRef: 'T' + Math.random(), date: new Date().toISOString(), amount: { amount: 69 }, receiver: { account: { name: { th: name, en: null }, bank: { account } } } } });
  assert.equal(judgeSlip(s, slip('8835'), 200, '', 69, false).code, '200000'); // พร้อมเพย์ 0629708835
  assert.equal(judgeSlip(s, slip('2330'), 200, '', 69, false).code, '200000'); // บัญชี 193-1-13233-0
  assert.equal(judgeSlip(s, slip(null), 200, '', 69, false).code, 'receiver_unverified'); // ไม่มีเลข: แอดมินตรวจ (ตามที่เจ้าของเลือก)
  assert.equal(judgeSlip(s, slip('1111'), 200, '', 69, false).code, 'receiver_unverified'); // หลักท้ายไม่ตรง: ไม่อนุมัติเอง
  assert.equal(judgeSlip(s, slip('8835', 'นาย สมชาย ใจดี'), 200, '', 69, false).code, '200401'); // ชื่อไม่ตรง: ปฏิเสธ
  assert.equal(judgeSlip(s, slip('8835'), 200, '', 70, false).code, '200402'); // ยอดไม่ตรง
  assert.equal(judgeSlip({ ...s, easyslip_receiver_names: '' }, slip('8835'), 200, '', 69, false).code, 'receiver_unverified'); // ไม่ได้ตั้งชื่อร้าน: หลักท้ายอย่างเดียวไม่พอ
  assert.equal(receiverTailMatches(slip('835'), ['0629708835']), false); // สั้นเกิน
});
