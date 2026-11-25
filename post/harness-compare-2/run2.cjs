// รอบ 2: งานซับซ้อน (เว็บแอปร้านอาหาร: เมนู+ค้นหา+ตะกร้า+VAT+จองโต๊ะมีเงื่อนไข+บันทึกถาวร+โหมดมืด)
// A = DeepSeek 4.1 Flash ตอบรวดเดียว · B = DeepSeek 4.1 Flash ใน Kyber Harness เต็มระบบ (เครื่องมือ+bash+check_page+สกิล+โน้ต+ตรวจก่อนจบ+ที่ปรึกษา/ผู้ตรวจ Opus)
// ให้คะแนนด้วยเทสต์อัตโนมัติชุดเดียวกัน (กดจริงในเบราว์เซอร์) + ภาพหน้าจอ
const fs = require('fs/promises'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const D = '/home/user/Astracode/desktop';
const { runAgent } = require(path.join(D, 'agent'));
const { Workspace, agentSystem, toolsFor, makeReviewer } = require(path.join(D, 'agenttools'));
const { builtinSkills, makeAdvisor } = require(path.join(D, 'skills'));
const SITE = 'https://kyber.hypatir.dev', KEY = 'proxy-injected', MODEL = 'deepseek-4.1-flash-1017', ADVISOR = 'claude-opus-5.5-eco', OUT = path.join(__dirname, 'out2');
const TASK = `สร้างเว็บแอปหน้าเดียวสำหรับร้านอาหารไทย "ครัวบ้านนก" (HTML/CSS/JS ล้วน ไม่มี build step เปิดจาก index.html ได้เลย) ต้องทำงานได้จริงครบทุกข้อ:
1) เมนูอาหาร 8 รายการ ข้อมูลอยู่ใน JS (ชื่อ, หมวด: ต้ม/ผัด/แกง/ของหวาน, ราคาเป็นบาท, เผ็ดหรือไม่) แสดงเป็นการ์ด
2) ปุ่มกรองตามหมวด (ทั้งหมด/ต้ม/ผัด/แกง/ของหวาน) และช่องค้นหาชื่อเมนู ใช้ร่วมกันได้
3) ตะกร้า: กดเพิ่มเมนูได้ ปรับจำนวน +/- ได้ (ถึง 0 = ลบออก) แสดงยอดรวมก่อนภาษี, VAT 7%, ยอดสุทธิ (ปัดเศษ 2 ตำแหน่ง)
4) ฟอร์มจองโต๊ะ: ชื่อ, เบอร์โทร (ตัวเลข 10 หลักขึ้นต้นด้วย 0), วันที่, เวลา, จำนวนคน (1-12) ห้ามจองวันที่ผ่านมาแล้ว ห้ามจองวันจันทร์ (ร้านปิด) เวลาเปิด 10:00-21:00 ผิดเงื่อนไขต้องแสดงข้อความ error ภาษาไทยใต้ฟอร์ม จองสำเร็จแสดงข้อความยืนยัน
5) ตะกร้าและรายการจองบันทึกใน localStorage รีเฟรชหน้าแล้วต้องยังอยู่ และมีส่วน "รายการจองของฉัน" แสดงรายการจองทั้งหมด
6) ปุ่มสลับโหมดมืด/สว่าง (จำค่าไว้ด้วย)
7) สวย ใช้งานดีทั้งมือถือและคอม ภาษาไทยทั้งหมด
ต้องใส่ data-testid ตามนี้ (เทสต์อัตโนมัติจะใช้): การ์ดเมนูแต่ละใบ data-testid="menu-item" (ปุ่มเพิ่มในการ์ด data-testid="add"), ปุ่มหมวด data-testid="filter-<หมวด>" เช่น filter-ต้ม และ filter-all, ช่องค้นหา data-testid="search", แต่ละแถวในตะกร้า data-testid="cart-row" (ปุ่ม data-testid="inc" / "dec"), ยอดก่อนภาษี data-testid="subtotal", VAT data-testid="vat", ยอดสุทธิ data-testid="total" (แสดงเป็นตัวเลข เช่น 107.00), ฟอร์มจอง data-testid="booking-form" ช่อง name="name" name="phone" name="date" name="time" name="guests", ข้อความ error data-testid="booking-error", ข้อความสำเร็จ data-testid="booking-ok", แต่ละรายการจอง data-testid="booking-row", ปุ่มโหมดมืด data-testid="theme-toggle" (เปิดโหมดมืดแล้ว <html> ต้องมี class "dark")`;
const post = body => fetch(SITE + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function serve(dir) { const s = http.createServer(async (q, r) => { const f = path.join(dir, decodeURIComponent(new URL(q.url, 'http://x').pathname)), file = f.endsWith('/') ? f + 'index.html' : f; const b = await fs.readFile(file).catch(() => null); if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml' }[file.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); return new Promise(ok => s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${s.address().port}/`, close: () => s.close() }))); }
let browser;
async function pageCheck(url, wait = 1500) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), pg = await ctx.newPage(), logs = []; pg.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_TUNNEL/.test(m.text())) logs.push('[error] ' + m.text().slice(0, 300)); }); pg.on('pageerror', e => logs.push('[error] Uncaught ' + e.message.slice(0, 300))); await pg.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(e => logs.push('[error] ' + e.message.slice(0, 200))); await pg.waitForTimeout(wait); const img = await pg.screenshot({ type: 'jpeg', quality: 70 }); await ctx.close(); return { image: 'data:image/jpeg;base64,' + img.toString('base64'), logs, bytes: img.length }; }

// ---------- เทสต์ใช้งานจริง (เหมือนกันทั้งสองฝั่ง) ----------
async function score(dir) {
  const s = await serve(dir), res = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  const T = async (name, fn) => { try { const ok = await fn(); res.push({ name, ok: !!ok }); } catch (e) { res.push({ name, ok: false, why: e.message.split('\n')[0].slice(0, 160) }); } };
  const tid = id => pg.locator(`[data-testid="${id}"]`), num = async id => parseFloat((await tid(id).first().innerText()).replace(/[^\d.]/g, ''));
  await pg.goto(s.url, { waitUntil: 'load' }); await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(800);
  await T('มีเมนู 8 รายการ', async () => (await tid('menu-item').count()) === 8);
  await T('กรองหมวด "ต้ม" ได้', async () => { const all = await tid('menu-item').count(); await tid('filter-ต้ม').first().click(); await pg.waitForTimeout(300); const n = await tid('menu-item').filter({ visible: true }).count(); await tid('filter-all').first().click(); await pg.waitForTimeout(300); return n > 0 && n < all; });
  await T('ค้นหาชื่อเมนูได้', async () => { const first = (await tid('menu-item').first().innerText()).split('\n').find(x => /[ก-๙]{3,}/.test(x)).trim().slice(0, 4); await tid('search').first().fill(first); await pg.waitForTimeout(400); const n = await tid('menu-item').filter({ visible: true }).count(); await tid('search').first().fill(''); await pg.waitForTimeout(300); return n >= 1 && n < 8; });
  await T('เพิ่มลงตะกร้า + ยอดรวมถูก (VAT 7%)', async () => { await tid('menu-item').nth(0).locator('[data-testid="add"]').click(); await tid('menu-item').nth(1).locator('[data-testid="add"]').click(); await pg.waitForTimeout(300); const sub = await num('subtotal'), vat = await num('vat'), tot = await num('total'); return (await tid('cart-row').count()) === 2 && Math.abs(vat - sub * 0.07) < 0.011 && Math.abs(tot - (sub + vat)) < 0.011; });
  await T('ปุ่ม + / − ปรับจำนวน และลดถึง 0 แล้วลบออก', async () => { const s0 = await num('subtotal'); await tid('cart-row').first().locator('[data-testid="inc"]').click(); await pg.waitForTimeout(200); const s1 = await num('subtotal'); await tid('cart-row').first().locator('[data-testid="dec"]').click(); await tid('cart-row').first().locator('[data-testid="dec"]').click(); await pg.waitForTimeout(300); return s1 > s0 && (await tid('cart-row').count()) === 1; });
  const fill = async (o) => { const f = tid('booking-form').first(); for (const [k, v] of Object.entries(o)) await f.locator(`[name="${k}"]`).fill(String(v)); await f.locator('button[type=submit], button:not([type]), input[type=submit]').last().click(); await pg.waitForTimeout(400); };
  const day = (add, wantDow = null) => { const d = new Date(); d.setDate(d.getDate() + add); if (wantDow != null) while (d.getDay() !== wantDow) d.setDate(d.getDate() + 1); else while (d.getDay() === 1) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  await T('จองวันที่ผ่านมาแล้ว → แสดง error', async () => { await fill({ name: 'ทดสอบ', phone: '0812345678', date: day(-3), time: '12:00', guests: 2 }); return (await tid('booking-error').filter({ visible: true }).count()) > 0 && (await tid('booking-error').first().innerText()).trim().length > 0; });
  await T('จองวันจันทร์ → แสดง error', async () => { await fill({ name: 'ทดสอบ', phone: '0812345678', date: day(1, 1), time: '12:00', guests: 2 }); return (await tid('booking-error').filter({ visible: true }).count()) > 0; });
  await T('เบอร์ผิด / เวลานอกเวลาเปิด → error', async () => { await fill({ name: 'ทดสอบ', phone: '12345', date: day(2), time: '12:00', guests: 2 }); const a = (await tid('booking-error').filter({ visible: true }).count()) > 0; await fill({ name: 'ทดสอบ', phone: '0812345678', date: day(2), time: '23:00', guests: 2 }); const b = (await tid('booking-error').filter({ visible: true }).count()) > 0; return a && b; });
  await T('จองถูกต้อง → สำเร็จ + ขึ้นในรายการจอง', async () => { await fill({ name: 'คุณนก', phone: '0812345678', date: day(3), time: '18:30', guests: 4 }); return (await tid('booking-ok').filter({ visible: true }).count()) > 0 && (await tid('booking-row').count()) >= 1; });
  await T('รีเฟรชแล้วตะกร้าและการจองยังอยู่', async () => { await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(800); return (await tid('cart-row').count()) === 1 && (await tid('booking-row').count()) >= 1; });
  await T('โหมดมืด สลับได้และจำค่า', async () => { await tid('theme-toggle').first().click(); await pg.waitForTimeout(300); const on = await pg.evaluate(() => document.documentElement.classList.contains('dark')); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(600); const kept = await pg.evaluate(() => document.documentElement.classList.contains('dark')); return on && kept; });
  await T('ไม่มี error ใน console', async () => errs.length === 0);
  await ctx.close();
  // ภาพหน้าจอ (สว่าง) คอม + มือถือ (เติมตะกร้า 2 อย่างให้เห็นส่วนตะกร้า)
  for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'mobile' ? 2 : 1 }), p = await c.newPage();
    await p.goto(s.url, { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(500);
    try { await p.locator('[data-testid="menu-item"] [data-testid="add"]').nth(0).click({ timeout: 3000 }); await p.locator('[data-testid="menu-item"] [data-testid="add"]').nth(2).click({ timeout: 3000 }); } catch { /* ไม่มีปุ่ม */ }
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 100)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 500)); });
    await p.screenshot({ path: dir + `-${tag}.png`, fullPage: true }); if (tag === 'mobile') res.push({ name: 'มือถือไม่ล้นจอแนวนอน', ok: !ov }); await c.close();
  }
  s.close(); return res;
}

(async () => {
  await fs.mkdir(OUT, { recursive: true }); browser = await chromium.launch();
  const result = { model: MODEL, advisor: ADVISOR, task: TASK, runs: {} };
  if (!process.env.SKIP_A) { const t0 = Date.now(), dir = path.join(OUT, 'a-plain'); await fs.mkdir(dir, { recursive: true });
    const r = await post({ model: MODEL, stream: false, max_tokens: 64000, messages: [{ role: 'user', content: TASK + '\n\nเขียนทั้งหมดเป็นไฟล์ index.html ไฟล์เดียว (CSS/JS อยู่ในไฟล์) ในโค้ดบล็อกเดียว' }] });
    const d = await r.json(), txt = d.choices?.[0]?.message?.content || '', m = txt.match(/```html?\s*\n([\s\S]*?)(```|$)/);
    await fs.writeFile(path.join(dir, 'index.html'), m ? m[1] : txt);
    result.runs.plain = { ms: Date.now() - t0, usage: d.usage, finish: d.choices?.[0]?.finish_reason, error: d.error?.message }; log('A done', JSON.stringify(result.runs.plain).slice(0, 300)); }
  { const t0 = Date.now(), dir = path.join(OUT, 'b-harness'); await fs.mkdir(dir, { recursive: true });
    const ws = new Workspace(dir, { ask: async () => true, pageCheck: (u, w) => pageCheck(u, w) }), ev = [], usage = { in: 0, out: 0 }, infos = [];
    const tools = toolsFor().filter(t => !['task', 'screenshot_url', 'android_tools'].includes(t.function.name));
    const messages = [{ role: 'system', content: agentSystem({ root: dir, os: 'Linux (node 22 available for quick checks with bash)', rules: '', extra: builtinSkills({ text: TASK }) }) }, { role: 'user', content: TASK }];
    try { await runAgent({ base: SITE + '/v1', key: KEY, model: MODEL, messages, tools, callTool: (n, a) => ws.call(n, a), maxRounds: 90, effort: null,
      advisor: makeAdvisor({ post, model: ADVISOR }), pinned: () => ws.pinnedNotes(), verifyGate: true, checks: [],
      review: makeReviewer({ ws, post, model: ADVISOR, task: TASK }),
      onEvent: e => { if (e.type === 'usage') { usage.in += e.usage.prompt_tokens || 0; usage.out += e.usage.completion_tokens || 0; } if (e.type === 'tool') ev.push(e.name); if (e.type === 'info') { infos.push(e.text); log('B', e.text); } } }); }
    catch (e) { result.runs.harnessError = e.message; log('B error', e.message); }
    result.runs.harness = { ms: Date.now() - t0, usage, tools: ev, toolCount: ev.length, checks: ev.filter(x => x === 'check_page').length, infos, final: (messages.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '').slice(0, 2000) };
    log('B done', result.runs.harness.ms, ev.length, 'tools'); }
  result.score = { plain: await score(path.join(OUT, 'a-plain')), harness: await score(path.join(OUT, 'b-harness')) };
  await fs.writeFile(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  for (const k of ['plain', 'harness']) log(k, result.score[k].filter(x => x.ok).length + '/' + result.score[k].length, JSON.stringify(result.score[k].filter(x => !x.ok)));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
