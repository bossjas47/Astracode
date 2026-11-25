// ตัวตรวจของ Live Eval ต้องถูกเอง: ไฟล์ตั้งต้น = ไม่ผ่าน · คำตอบที่ถูก = ผ่าน (ไม่ใช้โมเดล/เน็ต)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { LIVE } from './bench/live-eval.mjs';

const SOLVE = {
  'fix-failing-test': { 'price.js': 'exports.discount = (price, percent) => Math.round(price * (100 - percent) / 100 * 100) / 100;\n' },
  'add-feature': { 'cart.js': "class Cart {\n  constructor() { this.items = []; }\n  add(name, price, qty = 1) { this.items.push({ name, price, qty }); return this; }\n  remove(name) { this.items = this.items.filter(i => i.name !== name); return this; }\n  total(coupon) { const t = this.items.reduce((s, i) => s + i.price * i.qty, 0); return Math.round((coupon === 'SAVE10' ? t * 0.9 : t) * 100) / 100; }\n}\nmodule.exports = { Cart };\n" },
  'rename-across-files': root => ['lib/fmt.js', 'lib/report.js', 'main.js'].forEach(p => writeFileSync(join(root, p), readFileSync(join(root, p), 'utf8').replace(/fmtBaht/g, 'formatBaht'))),
  'keep-user-edits': root => writeFileSync(join(root, 'config.js'), readFileSync(join(root, 'config.js'), 'utf8').replace('deliveryFee: 40', 'deliveryFee: 50').replace('freeDeliveryOver: 500', 'freeDeliveryOver: 699')),
  'data-report': { 'summary.json': JSON.stringify({ 'กาแฟดริป': 600, 'ชาไทย': 270, 'ครัวซองต์': 260, _total: 1130 }) },
};
const fixture = c => { const root = mkdtempSync(join(tmpdir(), 'kyber-live-t-')); for (const [p, t] of Object.entries(c.files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); } return root; };

test('live eval checkers: untouched fixtures fail, correct solutions pass, damaging user comments fails', () => {
  for (const c of LIVE) {
    assert.equal(c.check(fixture(c)), false, c.name + ' should fail before the work');
    const root = fixture(c), s = SOLVE[c.name]; assert.ok(s, 'solution for ' + c.name);
    if (typeof s === 'function') s(root); else for (const [p, t] of Object.entries(s)) writeFileSync(join(root, p), t);
    assert.equal(c.check(root), true, c.name + ' should pass with a correct solution');
  }
  const c = LIVE.find(x => x.name === 'keep-user-edits'), root = fixture(c);
  writeFileSync(join(root, 'config.js'), "module.exports = { shopName: 'ขนมบ้านยาย', currency: 'THB', deliveryFee: 50, freeDeliveryOver: 699, openHours: '08:00-18:00' };\n");
  assert.equal(c.check(root), false, 'values right but the owner comments were wiped');
});
