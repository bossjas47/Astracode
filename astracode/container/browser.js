// เบราว์เซอร์ของ Kyber Harness บนคลาวด์ (Chromium ในเครื่องเสมือน): AI เปิดเว็บ อ่าน กด พิมพ์ และจับภาพหน้าจอได้
// เครื่องแยกต่องาน ทิ้งหลังจบ · ไม่มีคุกกี้/รหัสผ่านของลูกค้า (ล็อกอินเว็บที่ต้องใช้บัญชีลูกค้าไม่ได้ ต้องให้ลูกค้าบอกข้อมูลเอง)
const fs = require('fs/promises');
const path = require('path');

const S = d => ({ type: 'string', description: d });
const BROWSER_TOOL = { type: 'function', function: { name: 'browser', description: 'Use a real Chromium browser in your sandbox. Actions: "open" (url), "read" (page text + numbered links/buttons/inputs), "click" (target = number from read, CSS selector or visible text), "type" (target + text; set submit=true to press Enter), "press" (key, e.g. Enter, PageDown), "screenshot" (saved as a PNG in the working folder and shown to the user), "back". Prefer web_fetch for plain pages; use this for pages that need JavaScript, clicking or forms. Never type passwords or payment details. When a page needs the user\'s own login, a captcha or a payment, use action "handoff": the user takes over this same browser on their screen, does it, and you continue logged in (the session stays for this task).', parameters: { type: 'object', properties: {
  action: { type: 'string', enum: ['open', 'read', 'click', 'type', 'press', 'screenshot', 'back', 'handoff'] }, reason: S('For handoff: what the user should do, e.g. "Log in to your Shopee seller account"'), url: S('For open'), target: S('For click/type: number from the last read, a CSS selector, or visible text'), text: S('For type'), submit: { type: 'boolean' }, key: S('For press'), name: S('For screenshot: file name, e.g. screens/home.png'),
}, required: ['action'] } } };

let br = null, page = null, marks = [];
async function ensure() {
  if (page && !page.isClosed()) return page;
  const { chromium } = require('playwright-core');
  br ||= await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); // WebGL บนเครื่องไม่มีการ์ดจอ (three.js)
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36 KyberCowork' });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (/^(data:|blob:|about:)/.test(u)) return route.request().isNavigationRequest() ? route.abort('blockedbyclient') : route.continue();
    return okUrl(u) ? route.continue() : route.abort('blockedbyclient');
  });
  page = await ctx.newPage(); page.setDefaultTimeout(20000); return page;
}
const okUrl = u => { try { const x = new URL(u), h = x.hostname.toLowerCase(); if (!/^https?:$/.test(x.protocol) || x.username || x.password || !h) return false; if (/^(localhost\.?|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|192\.0\.0\.|2[2-5]\d\.)/.test(h)) return false; if (/\.(local|internal|localhost|localdomain|intranet|lan)$/.test(h) || /^\d+$/.test(h) || h.includes(':')) return false; return true; } catch { return false; } };
async function readPage(p) {
  const d = await p.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const els = [...document.querySelectorAll('a[href],button,input,textarea,select,[role=button],[onclick]')].filter(vis).slice(0, 120);
    els.forEach((e, i) => e.setAttribute('data-astra-n', String(i + 1)));
    return { title: document.title, url: location.href, text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 24000),
      items: els.map((e, i) => `[${i + 1}] ${e.tagName.toLowerCase()}${e.type ? ':' + e.type : ''} ${(e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || e.name || e.href || '').trim().replace(/\s+/g, ' ').slice(0, 80)}`) };
  });
  marks = d.items; return `${d.title}\n${d.url}\n\n${d.text}\n\nInteractive elements:\n${d.items.join('\n')}`;
}
const loc = (p, t) => { t = String(t || '').trim(); if (/^\d+$/.test(t)) return p.locator(`[data-astra-n="${t}"]`); if (/^[#.[]|^[a-z]+[#.[]/i.test(t)) return p.locator(t).first(); return p.getByText(t, { exact: false }).first(); };

async function browserTool(a, root, onShot) {
  const p = await ensure(), act = a.action;
  if (act === 'open') { if (!okUrl(a.url)) return 'Error: only public http(s) URLs'; await p.goto(a.url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800); return readPage(p); }
  if (act === 'read') return readPage(p);
  if (act === 'back') { await p.goBack(); return readPage(p); }
  if (act === 'click') { await loc(p, a.target).click(); await p.waitForTimeout(900); return readPage(p); }
  if (act === 'type') { if (/password|รหัสผ่าน|card|cvv/i.test(String(a.target))) return 'Error: never type passwords or payment details'; const l = loc(p, a.target); await l.fill(String(a.text ?? '')); if (a.submit) await l.press('Enter'); await p.waitForTimeout(900); return readPage(p); }
  if (act === 'press') { await p.keyboard.press(String(a.key || 'Enter')); await p.waitForTimeout(600); return readPage(p); }
  if (act === 'screenshot') {
    const rel = String(a.name || `screens/shot-${Date.now()}.png`).replace(/^\/+/, '').replace(/\.\.+/g, '.'), abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) return 'Error: bad name';
    await fs.mkdir(path.dirname(abs), { recursive: true }); await p.screenshot({ path: abs }); onShot?.(rel);
    return `Saved screenshot ${rel} (${p.url()})`;
  }
  return 'Error: unknown action';
}
// PDF จาก HTML (ให้ make_document ทำ .pdf ได้ในเครื่องเสมือน · ฟอนต์ไทยจาก fonts-thai-tlwg)
async function htmlToPdf(html) { await ensure(); const pg = await page.context().newPage(); try { await pg.route('**/*', route => /^(data:|blob:|about:)/.test(route.request().url()) ? route.continue() : route.abort('blockedbyclient')); await pg.setContent(html, { waitUntil: 'load' }); return await pg.pdf({ format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } }); } finally { await pg.close(); } }
async function closeBrowser() { try { await br?.close(); } catch {} br = page = null; }
// ผู้ใช้ควบคุมเบราว์เซอร์เอง (ล็อกอิน/แคปช่า/จ่ายเงิน): หน้าเว็บของเราดึงภาพหน้าจอเป็นระยะ แล้วส่งคลิก/พิมพ์/เลื่อนกลับมา
// สิ่งที่ผู้ใช้พิมพ์ไม่ถูกเก็บในเหตุการณ์หรือส่งให้ AI · AI เห็นแค่หน้าเว็บหลังผู้ใช้กดเสร็จ
let live = null; // { id, until } ขณะส่งต่อให้ผู้ใช้
const liveOn = id => live && live.id === id && Date.now() < live.until;
function liveStart(id, ms) { live = { id, until: Date.now() + ms }; }
function liveEnd() { live = null; }
async function liveShot(id) { if (!liveOn(id)) return null; const p = await ensure(); return { img: await p.screenshot({ type: 'jpeg', quality: 60 }), url: p.url(), title: await p.title().catch(() => '') }; }
async function liveInput(id, x) {
  if (!liveOn(id)) return false; const p = await ensure();
  if (x.type === 'click') await p.mouse.click(Math.max(0, Math.min(1280, +x.x || 0)), Math.max(0, Math.min(860, +x.y || 0)));
  else if (x.type === 'type') await p.keyboard.type(String(x.text || '').slice(0, 500), { delay: 15 });
  else if (x.type === 'key' && /^(Enter|Tab|Backspace|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageDown|PageUp)$/.test(x.key)) await p.keyboard.press(x.key);
  else if (x.type === 'scroll') await p.mouse.wheel(0, Math.max(-2000, Math.min(2000, +x.dy || 0)));
  else if (x.type === 'goto' && okUrl(x.url)) await p.goto(x.url, { waitUntil: 'domcontentloaded' });
  else if (x.type === 'back') await p.goBack().catch(() => {});
  else return false;
  await p.waitForTimeout(250); return true;
}
// check_page: เปิดไฟล์ HTML (file://) หรือเว็บในบริบทแยก เก็บ error ใน console / หน้าโหลดไม่ขึ้น แล้วจับภาพ (WebGL ใช้ SwiftShader)
async function pageCheck(url, wait = 1500, local = null) { // local = origin ของเซิร์ฟเวอร์ไฟล์ชั่วคราว (127.0.0.1) ที่อนุญาตเฉพาะรอบตรวจนี้
  await ensure(); const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } }); const logs = [];
  await ctx.route('**/*', r => { const u = r.request().url(); return /^(data:|blob:)/.test(u) || (local && u.startsWith(local + '/')) || okUrl(u) ? r.continue() : r.abort('blockedbyclient'); });
  const pg = await ctx.newPage();
  pg.on('console', m => { const t = m.text(); if (['error', 'warning'].includes(m.type()) && logs.length < 30 && !/GL Driver Message|Failed to load resource/.test(t)) logs.push(`[${m.type() === 'error' ? 'error' : 'warn'}] ${t.slice(0, 300)}`); }); // เสียงรบกวนของ WebGL ซอฟต์แวร์ / 404 รายงานแยกพร้อม URL ด้านล่าง
  pg.on('response', q => { if (q.status() >= 400 && !/favicon\.ico$/.test(q.url()) && logs.length < 30) logs.push(`[error] ${q.status()} ${q.url().replace(local || '#', '').slice(0, 200)}`); });
  pg.on('pageerror', e => logs.length < 30 && logs.push('[error] Uncaught ' + String(e.message).slice(0, 300)));
  pg.on('requestfailed', q => logs.length < 30 && logs.push(`[error] failed to load ${q.url().slice(0, 200)} (${q.failure()?.errorText || ''})`));
  try {
    await pg.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(e => logs.push('[error] ' + e.message.slice(0, 200)));
    await pg.waitForTimeout(wait);
    const img = await pg.screenshot({ type: 'jpeg', quality: 70 }), canvases = await pg.evaluate(() => document.querySelectorAll('canvas').length).catch(() => null);
    return { image: 'data:image/jpeg;base64,' + img.toString('base64'), logs, bytes: img.length, canvases };
  } finally { await ctx.close().catch(() => {}); }
}
module.exports = { pageCheck, BROWSER_TOOL, browserTool, htmlToPdf, closeBrowser, liveStart, liveEnd, liveShot, liveInput };
