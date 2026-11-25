// ดึงข้อมูลเอกสารทีละเยอะ: แม่แบบ/ช่องเอง · ส่งรูปให้โมเดลอ่านรูป ได้ JSON ตามช่อง · แถวต่อท้าย · แก้ตาราง · หักลิมิต
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel } from './helpers.mjs';
import { parseRow } from '../src/extract.js';

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(100);
test('extract: parse model JSON into the requested columns', () => {
  assert.deepEqual(parseRow('```json\n{"ยอดรวม": 107, "ผู้ขาย": "ร้านนก", "x": 1}\n```', ['ผู้ขาย', 'ยอดรวม', 'VAT']), { 'ผู้ขาย': 'ร้านนก', 'ยอดรวม': '107', VAT: '' });
  assert.equal(parseRow('no json', ['a']), null);
});
test('extract: receipt template, images sent to the cheapest vision model, rows appended, edit table, plan charged', async () => {
  const fm = await fakeModel((q, res) => fm.sse(res, '{"วันที่":"2026-11-20","ผู้ขาย":"ร้านกาแฟนก","ยอดรวม":"107.00","VAT":"7"}', { prompt_tokens: 1500, completion_tokens: 80 }));
  try {
    const t = await makeEnv({ K: 'k' });
    const text = addModel(t.DB, { name: 'Text', base_url: fm.url, cost_in: 0.1 }), vis = addModel(t.DB, { name: 'Vision', base_url: fm.url, cost_in: 1 });
    t.DB.raw.prepare('UPDATE models SET vision=1 WHERE id=?').run(vis.id);
    const plan = addPlan(t.DB, { price: 100, models: [text.id, vis.id], limit_4h: 1000, limit_week: 1000 });
    const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e6, u.id);
    const api = (p, o = {}) => t.json('/api/extract' + p, { cookie: u.cookie, ...o });
    const meta = await api(''); assert.equal(meta.data.ready, true); assert.ok(meta.data.kinds.receipt.fields.includes('ยอดรวม'));
    const job = (await api('', { method: 'POST', body: { kind: 'receipt' } })).data; assert.ok(job.fields.includes('VAT'));
    assert.equal((await api(`/${job.id}/file`, { method: 'POST', body: { name: 'a.jpg', images: ['data:text/html,x'] } })).status, 400);
    const r1 = await api(`/${job.id}/file`, { method: 'POST', body: { name: 'a.jpg', images: [IMG] } }); assert.equal(r1.status, 200, JSON.stringify(r1.data));
    assert.equal(r1.data.row['ยอดรวม'], '107.00'); assert.equal(r1.data.row._file, 'a.jpg');
    const sent = fm.hits.at(-1).body; assert.equal(sent.model, 'm'); assert.match(JSON.stringify(sent.messages), /image_url/); assert.match(sent.messages[0].content, /"เลขผู้เสียภาษีผู้ขาย"/);
    await Promise.all([api(`/${job.id}/file`, { method: 'POST', body: { name: 'b.jpg', images: [IMG] } }), api(`/${job.id}/file`, { method: 'POST', body: { name: 'c.jpg', images: [IMG] } })]);
    const got = await api('/' + job.id); assert.equal(got.data.rows.length, 3, 'parallel appends all kept');
    got.data.rows[0]['ผู้ขาย'] = 'แก้แล้ว'; got.data.rows.pop();
    await api('/' + job.id, { method: 'PUT', body: { rows: got.data.rows } });
    const after = await api('/' + job.id); assert.equal(after.data.rows.length, 2); assert.equal(after.data.rows[0]['ผู้ขาย'], 'แก้แล้ว');
    assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM usage WHERE src='extract' AND model_id=?").get(vis.id).n, 3);
    const custom = await api('', { method: 'POST', body: { kind: 'custom', fields: ['ชื่อสินค้า', 'ราคา'] } }); assert.deepEqual(custom.data.fields, ['ชื่อสินค้า', 'ราคา']);
    assert.equal((await api('', { method: 'POST', body: { kind: 'custom', fields: [] } })).status, 400);
    const other = await t.user(); assert.equal((await t.json('/api/extract/' + job.id, { cookie: other.cookie })).status, 404);
  } finally { fm.close(); }
});
