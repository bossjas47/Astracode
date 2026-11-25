// เทสต์ขอบเขต (ซ่อน: โมเดลไม่เคยเห็น) ใช้ตัดสินความละเอียดของงาน
const fs = require('fs/promises'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'out2');
function serve(dir) { const s = http.createServer(async (q, r) => { const f = path.join(dir, decodeURIComponent(new URL(q.url, 'http://x').pathname)), file = f.endsWith('/') ? f + 'index.html' : f; const b = await fs.readFile(file).catch(() => null); if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript' }[file.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); return new Promise(ok => s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${s.address().port}/`, close: () => s.close() }))); }
const day = (add, wantDow = null) => { const d = new Date(); d.setDate(d.getDate() + add); if (wantDow != null) while (d.getDay() !== wantDow) d.setDate(d.getDate() + 1); else while (d.getDay() === 1) d.setDate(d.getDate() + 1); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
async function edge(browser, dir) {
  const s = await serve(dir), res = [], ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), pg = await ctx.newPage();
  const T = async (name, fn) => { try { res.push({ name, ok: !!(await fn()) }); } catch (e) { res.push({ name, ok: false, why: e.message.split('\n')[0].slice(0, 140) }); } };
  const tid = id => pg.locator(`[data-testid="${id}"]`), vis = id => tid(id).filter({ visible: true }).count();
  const fresh = async () => { await pg.goto(s.url, { waitUntil: 'load' }); await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(500); };
  const fill = async o => { const f = tid('booking-form').first(); for (const [k, v] of Object.entries(o)) await f.locator(`[name="${k}"]`).fill(String(v)); await f.locator('button[type=submit], button:not([type]), input[type=submit]').last().click(); await pg.waitForTimeout(350); };
  const base = { name: 'คุณนก', phone: '0812345678', date: day(3), time: '18:00', guests: 2 };
  const bad = async o => { await fill({ ...base, ...o }); return (await vis('booking-error')) > 0 && (await tid('booking-row').count()) === 0; };
  await fresh();
  await T('กรองหมวด + ค้นหาใช้ร่วมกัน (หมวดผัด + คำที่อยู่หมวดอื่น = 0)', async () => { await tid('filter-ผัด').first().click(); await tid('search').first().fill('ต้มยำ'); await pg.waitForTimeout(300); const n = await tid('menu-item').filter({ visible: true }).count(); await tid('search').first().fill(''); await tid('filter-all').first().click(); return n === 0; });
  await T('กดเพิ่มเมนูเดิมซ้ำ = จำนวนเพิ่ม ไม่เกิดแถวซ้ำ', async () => { const a = tid('menu-item').nth(0).locator('[data-testid="add"]'); await a.click(); await a.click(); await a.click(); await pg.waitForTimeout(200); return (await tid('cart-row').count()) === 1; });
  await T('ยอดแสดงทศนิยม 2 ตำแหน่ง (เช่น 107.00)', async () => /\d\.\d\d\b/.test(await tid('total').first().innerText()) && /\d\.\d\d\b/.test(await tid('vat').first().innerText()));
  await T('จำนวนในตะกร้า (3) ยังอยู่หลังรีเฟรช', async () => { const s0 = await tid('subtotal').first().innerText(); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(500); return (await tid('subtotal').first().innerText()) === s0; });
  await T('ชื่อว่าง → error', () => bad({ name: '' }));
  await T('เบอร์ 9 หลัก → error', () => bad({ phone: '081234567' }));
  await T('เบอร์ 10 หลักไม่ขึ้นต้น 0 → error', () => bad({ phone: '1812345678' }));
  await T('เบอร์มีตัวอักษร → error', () => bad({ phone: '08123456a8' }));
  await T('จำนวนคน 0 → error', () => bad({ guests: 0 }));
  await T('จำนวนคน 13 → error', () => bad({ guests: 13 }));
  await T('เวลา 09:59 → error', () => bad({ time: '09:59' }));
  await T('เวลา 21:30 → error', () => bad({ time: '21:30' }));
  await T('ไม่เลือกวันที่ → error', () => bad({ date: '' }));
  await T('จองวันนี้ได้ (วันนี้ไม่ใช่วันจันทร์)', async () => { if (new Date().getDay() === 1) return true; await fill({ ...base, date: day(0), time: '20:00' }); return (await tid('booking-row').count()) === 1; });
  await T('จองขอบเวลา 10:00 และ 12 คนได้', async () => { await fill({ ...base, time: '10:00', guests: 12 }); return (await tid('booking-row').count()) === 2; });
  await T('จองสำเร็จแล้ว error เก่าไม่ค้าง', async () => (await vis('booking-error')) === 0 && (await vis('booking-ok')) > 0);
  await T('รีเฟรชแล้วรายการจองไม่ซ้ำ/ไม่หาย (2 รายการ)', async () => { await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(500); return (await tid('booking-row').count()) === 2; });
  await T('ปุ่มทุกอันกดด้วยคีย์บอร์ดได้ (เป็น <button>)', async () => pg.evaluate(() => [...document.querySelectorAll('[data-testid="add"],[data-testid="inc"],[data-testid="dec"],[data-testid="theme-toggle"],[data-testid^="filter-"]')].every(e => e.tagName === 'BUTTON')));
  await T('ช่องฟอร์มมี label ให้โปรแกรมอ่านจอ', async () => pg.evaluate(() => ['name', 'phone', 'date', 'time', 'guests'].every(n => { const e = document.querySelector(`[data-testid="booking-form"] [name="${n}"]`); return e && (e.labels?.length || e.getAttribute('aria-label')); })));
  await T('localStorage เสีย (JSON พัง) หน้าเว็บยังเปิดได้', async () => { const errs = []; pg.on('pageerror', e => errs.push(e.message)); await pg.evaluate(() => { for (let i = 0; i < localStorage.length; i++) localStorage.setItem(localStorage.key(i), '{พัง'); }); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(600); return errs.length === 0 && (await tid('menu-item').count()) === 8; });
  await ctx.close(); s.close(); return res;
}
(async () => {
  const browser = await chromium.launch(), out = {};
  for (const k of ['a-plain', 'b-harness']) { out[k] = await edge(browser, path.join(OUT, k)); console.log(k, out[k].filter(x => x.ok).length + '/' + out[k].length); for (const x of out[k]) if (!x.ok) console.log('  ✗', x.name, x.why || ''); }
  await fs.writeFile(path.join(OUT, 'edge.json'), JSON.stringify(out, null, 2)); await browser.close();
})();
