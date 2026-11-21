// เบราว์เซอร์ของ Cowork บนคลาวด์ (Chromium ในเครื่องเสมือน): AI เปิดเว็บ อ่าน กด พิมพ์ และจับภาพหน้าจอได้
// เครื่องแยกต่องาน ทิ้งหลังจบ · ไม่มีคุกกี้/รหัสผ่านของลูกค้า (ล็อกอินเว็บที่ต้องใช้บัญชีลูกค้าไม่ได้ ต้องให้ลูกค้าบอกข้อมูลเอง)
const fs = require('fs/promises');
const path = require('path');

const S = d => ({ type: 'string', description: d });
const BROWSER_TOOL = { type: 'function', function: { name: 'browser', description: 'Use a real Chromium browser in your sandbox. Actions: "open" (url), "read" (page text + numbered links/buttons/inputs), "click" (target = number from read, CSS selector or visible text), "type" (target + text; set submit=true to press Enter), "press" (key, e.g. Enter, PageDown), "screenshot" (saved as a PNG in the working folder and shown to the user), "back". Prefer web_fetch for plain pages; use this for pages that need JavaScript, clicking or forms. Never type passwords or payment details.', parameters: { type: 'object', properties: {
  action: { type: 'string', enum: ['open', 'read', 'click', 'type', 'press', 'screenshot', 'back'] }, url: S('For open'), target: S('For click/type: number from the last read, a CSS selector, or visible text'), text: S('For type'), submit: { type: 'boolean' }, key: S('For press'), name: S('For screenshot: file name, e.g. screens/home.png'),
}, required: ['action'] } } };

let br = null, page = null, marks = [];
async function ensure() {
  if (page && !page.isClosed()) return page;
  const { chromium } = require('playwright-core');
  br ||= await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36 AstraCodeCowork' });
  page = await ctx.newPage(); page.setDefaultTimeout(20000); return page;
}
const okUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(x.hostname); } catch { return false; } };
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
async function htmlToPdf(html) { await ensure(); const pg = await page.context().newPage(); try { await pg.setContent(html, { waitUntil: 'load' }); return await pg.pdf({ format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } }); } finally { await pg.close(); } }
async function closeBrowser() { try { await br?.close(); } catch {} br = page = null; }
module.exports = { BROWSER_TOOL, browserTool, htmlToPdf, closeBrowser };
