// วัดเวลาโหลดหน้าเว็บแบบมือถือ (ไม่ใช่เทสต์ ไม่อยู่ใน npm test): เน็ตช้า + CPU ช้าผ่าน CDP, API จำลองหน่วงเท่าเซิร์ฟเวอร์จริง
// รัน: node tests/bench/page-load.mjs [RTT_MS=150] [CPU_X=4] [API_MS=120]
// ผล: FCP (ตัวอักษร/ภาพแรก) และ "app" = เวลาที่หน้าแอปวาดเนื้อหาจริงเสร็จ (มี .view หรือ .chat) ของแต่ละหน้า ค่ามัธยฐาน 3 รอบ
import { createRequire } from 'node:module';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
const req = createRequire(import.meta.url); let pw; try { pw = req('playwright'); } catch { pw = req('playwright-core'); }
const pub = join(dirname(fileURLToPath(import.meta.url)), '../../public');
const RTT = +(process.argv[2] ?? 150), CPU = +(process.argv[3] ?? 4), API_MS = +(process.argv[4] ?? 120), KBPS = +(process.argv[5] ?? 200); // KB/s หลังบีบอัด (4G ช้า)
const brSize = new Map(), sizeOf = f => brSize.get(f) ?? (brSize.set(f, brotliCompressSync(readFileSync(f)).length), brSize.get(f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = Date.now(), usage = { pct4h: 4, pctWeek: 21, reset4h: now + 3600e3, resetWeek: now + 5 * 864e5, use4h: true };
const API = { '/api/me': { email: 'u@example.com', role: 'user', plan: { id: 2, name: 'Pro', paid: true }, balance: 10, usage, models: [{ id: 1, name: 'Model', provider: 'openai', multiplier: 1, vision: 1, effort: 'none' }] },
  '/api/settings/public': {}, '/api/chats': Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: 'แชตที่ ' + (i + 1), updated_at: now })), '/api/folders': [], '/api/plans': [], '/api/blog': [], '/api/pricing': { models: [] }, '/api/gallery': [], '/api/pay': [] };
const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
async function once(url, guest) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
  await page.addInitScript(g => { try { localStorage.setItem('onb', '1'); localStorage.setItem('whatsnew:2026-11', '1'); if (!g) localStorage.setItem('li', '1'); } catch {} }, guest); // li = เคยล็อกอินบนเครื่องนี้ (ผู้ใช้จริงส่วนใหญ่)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: 1.6e6 / 8 * 4, uploadThroughput: 750e3 / 8 * 4 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') { await sleep(RTT * 2); return u.hostname === 'fonts.googleapis.com' ? r.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts */' }) : r.fulfill({ status: 404, body: '' }); } // ต้นทางภายนอก: ต่อใหม่ + ดาวน์โหลด
    if (u.hostname !== 't.test') return r.abort();
    if (u.pathname.startsWith('/api/')) { await sleep(RTT + API_MS); if (guest && u.pathname === '/api/me') return r.fulfill({ status: 401, body: '{}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[u.pathname] ?? []) }); }
    const f = join(pub, u.pathname === '/' ? 'home.html' : u.pathname), hit = [f, f + '.html'].find(x => existsSync(x) && statSync(x).isFile());
    if (!hit) return r.fulfill({ status: 404, body: '' });
    const type = hit.endsWith('.js') ? 'text/javascript' : hit.endsWith('.css') ? 'text/css' : hit.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    await sleep(RTT + sizeOf(hit) / KBPS); // รอบไป-กลับ + เวลาดาวน์โหลดตามขนาดหลังบีบอัด brotli (route ข้ามการจำลองเน็ตของ CDP จึงหน่วงเอง)
    return r.fulfill({ status: 200, headers: { 'content-type': type }, body: readFileSync(hit) });
  });
  const t0 = Date.now();
  await page.goto('http://t.test' + url, { waitUntil: 'commit' });
  await page.waitForSelector('#app .view, #app .chat', { timeout: 30000 });
  const app = Date.now() - t0;
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
  await ctx.close();
  return { fcp: Math.round(fcp), app };
}
const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
for (const [name, url, guest] of [['chat (ล็อกอินแล้ว)', '/chat', false], ['home (ยังไม่ล็อกอิน)', '/', true], ['plans (ล็อกอินแล้ว)', '/plans', false]]) {
  const rs = []; for (let i = 0; i < 3; i++) rs.push(await once(url, guest));
  rows.push({ name, fcp: med(rs.map(r => r.fcp)), app: med(rs.map(r => r.app)) });
}
console.log(JSON.stringify({ RTT, CPU, API_MS, rows }, null, 1));
await browser.close();
