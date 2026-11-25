// เทียบ: DeepSeek 4.1 Flash (1017) ตอบตรงๆ ไม่มี harness  vs  โมเดลเดียวกันใน Kyber Harness (เครื่องมือ + สกิล + check_page + ตรวจก่อนจบ)
// ทำงานเดียวกัน: เว็บ landing page ร้านกาแฟ · ผล: ไฟล์เว็บ + ภาพหน้าจอคอม/มือถือ + ตัวชี้วัดที่ตรวจด้วยเบราว์เซอร์จริง
const fs = require('fs/promises'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..'), D = path.join(root, 'desktop');
const { runAgent } = require(path.join(D, 'agent'));
const { Workspace, agentSystem, toolsFor } = require(path.join(D, 'agenttools'));
const { builtinSkills } = require(path.join(D, 'skills'));
const SITE = 'https://kyber.hypatir.dev', KEY = process.env.KYBER_EVAL_KEY, OUT = path.join(root, 'out');
const TASK = `สร้างเว็บ landing page สำหรับร้านกาแฟชื่อ "บ้านนก คอฟฟี่" (ร้านกาแฟเล็ก ๆ ในเชียงใหม่ คั่วเอง)
ต้องมี: ส่วนหัว (hero) พร้อมปุ่มสั่งซื้อ, เมนูเครื่องดื่ม 6 รายการพร้อมราคา, รีวิวลูกค้า 3 รีวิว, เวลาเปิด-ปิดและที่ตั้ง, ฟอร์มติดต่อ (ชื่อ เบอร์โทร ข้อความ)
ต้องสวย ทันสมัย ใช้งานได้ดีทั้งมือถือและคอม ภาษาไทยทั้งหมด`;
const post = body => fetch(SITE + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function serve(dir) { // เสิร์ฟโฟลเดอร์ผลลัพธ์ให้เบราว์เซอร์เปิด (เหมือนผู้ใช้เปิดเว็บ)
  const s = http.createServer(async (q, r) => { const f = path.join(dir, decodeURIComponent(new URL(q.url, 'http://x').pathname)), file = f.endsWith('/') ? f + 'index.html' : f; const b = await fs.readFile(file).catch(() => null); if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' }[file.split('.').pop()] || 'application/octet-stream' }); r.end(b); });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${s.address().port}/`, close: () => s.close() })));
}
let browser;
async function pageCheck(url, wait = 1500) { // check_page ของ harness ในรอบทดสอบนี้ (playwright)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), pg = await ctx.newPage(), logs = [];
  pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) logs.push('[error] ' + m.text().slice(0, 300)); }); pg.on('pageerror', e => logs.push('[error] Uncaught ' + e.message.slice(0, 300)));
  await pg.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(e => logs.push('[error] ' + e.message.slice(0, 200))); await pg.waitForTimeout(wait);
  const img = await pg.screenshot({ type: 'jpeg', quality: 70 }); await ctx.close(); return { image: 'data:image/jpeg;base64,' + img.toString('base64'), logs, bytes: img.length };
}
// วัดผลแบบเดียวกันทั้งสองฝั่ง
async function measure(dir, name) {
  const s = await serve(dir), res = { name };
  for (const [w, h, tag] of [[1280, 800, 'desktop'], [390, 844, 'mobile']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'mobile' ? 2 : 1 }), pg = await ctx.newPage(), errs = [];
    pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text().slice(0, 200)); }); pg.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    pg.on('response', q => { if (q.status() >= 400 && !/favicon/.test(q.url())) errs.push(q.status() + ' ' + q.url().replace(s.url, '')); });
    await pg.goto(s.url, { waitUntil: 'load', timeout: 30000 }).catch(e => errs.push(e.message.slice(0, 200))); await pg.waitForTimeout(1500);
    const m = await pg.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth + 2, height: document.documentElement.scrollHeight, viewport: !!document.querySelector('meta[name=viewport]'), form: !!document.querySelector('form'), inputs: document.querySelectorAll('form input, form textarea').length, imgsNoAlt: [...document.querySelectorAll('img')].filter(i => !i.alt).length, brokenImgs: [...document.querySelectorAll('img')].filter(i => i.complete && !i.naturalWidth).length, prices: (document.body.innerText.match(/\d+\s*(บาท|฿)|฿\s*\d+/g) || []).length, reviews: (document.body.innerText.match(/รีวิว|★|⭐/g) || []).length, title: document.title }));
    await pg.screenshot({ path: path.join(OUT, `${name}-${tag}.png`), fullPage: true }); res[tag] = { ...m, errors: [...new Set(errs)] }; await ctx.close();
  }
  s.close(); return res;
}
const pickModel = (ids, re) => ids.find(id => re.every(r => r.test(id)));

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  if (!KEY) { await fs.writeFile(path.join(OUT, 'result.json'), JSON.stringify({ error: 'missing KYBER_EVAL_KEY secret' })); console.log('missing KYBER_EVAL_KEY'); return; }
  browser = await chromium.launch();
  const ids = ((await (await fetch(SITE + '/v1/models', { headers: { authorization: 'Bearer ' + KEY } })).json()).data || []).map(m => m.id);
  const model = process.env.MODEL || pickModel(ids, [/deepseek/i, /4\.1/, /flash/i, /1017/]) || pickModel(ids, [/deepseek/i, /4\.1/, /flash/i]);
  log('models', ids.length, 'use', model); if (!model) throw new Error('ไม่พบ DeepSeek 4.1 Flash ใน /v1/models: ' + ids.join(', '));
  const result = { model, task: TASK, runs: {} };
  // A: ไม่มี harness: ขอไฟล์เดียวจบในคำตอบเดียว (แบบแชตทั่วไป)
  { const t0 = Date.now(), dir = path.join(OUT, 'a-plain'); await fs.mkdir(dir, { recursive: true });
    const r = await post({ model, stream: false, max_tokens: 16000, messages: [{ role: 'user', content: TASK + '\n\nเขียนทั้งหมดเป็นไฟล์ index.html ไฟล์เดียว (CSS/JS อยู่ในไฟล์) ในโค้ดบล็อกเดียว' }] });
    const d = await r.json(), txt = d.choices?.[0]?.message?.content || '', html = (txt.match(/```html?\s*\n([\s\S]*?)```/) || txt.match(/```\s*\n([\s\S]*?)```/) || [])[1] || txt;
    await fs.writeFile(path.join(dir, 'index.html'), html);
    result.runs.plain = { ms: Date.now() - t0, usage: d.usage, finish: d.choices?.[0]?.finish_reason, error: d.error?.message };
    log('A done', result.runs.plain.ms, JSON.stringify(d.usage || d.error || {}).slice(0, 200)); }
  // B: Kyber Harness (เครื่องมือ + สกิลวินัยโค้ด + check_page + ตรวจก่อนจบ + ผู้ตรวจรอบสอง) · ไม่มีที่ปรึกษา: DeepSeek ทำเองทั้งหมด
  { const t0 = Date.now(), dir = path.join(OUT, 'b-harness'); await fs.mkdir(dir, { recursive: true });
    const ws = new Workspace(dir, { ask: async () => true, pageCheck: (u, w) => pageCheck(u, w) }), ev = [], tools = toolsFor().filter(t => !['task', 'screenshot_url', 'bash'].includes(t.function.name)), usage = { in: 0, out: 0 };
    const messages = [{ role: 'system', content: agentSystem({ root: dir, os: 'Linux (no shell in this test: use the file tools and check_page)', rules: '', extra: builtinSkills({ text: TASK }) }) }, { role: 'user', content: TASK + '\n\nทำเป็นไฟล์ในโฟลเดอร์งาน (index.html, style.css, script.js) แล้วตรวจด้วย check_page ทั้งขนาดคอมและมือถือก่อนสรุป' }];
    try { await runAgent({ base: SITE + '/v1', key: KEY, model, messages, tools, callTool: (n, a) => ws.call(n, a), maxRounds: 40, onEvent: e => { if (e.type === 'usage') { usage.in += e.usage.prompt_tokens || 0; usage.out += e.usage.completion_tokens || 0; } if (e.type === 'tool') ev.push(e.name); if (e.type === 'info') log('B info', e.text); }, pinned: () => ws.pinnedNotes(), verifyGate: true }); }
    catch (e) { result.runs.harnessError = e.message; log('B error', e.message); }
    result.runs.harness = { ms: Date.now() - t0, usage, tools: ev, toolCount: ev.length, checks: ev.filter(x => x === 'check_page').length, final: (messages.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '').slice(0, 1500) };
    log('B done', result.runs.harness.ms, ev.length, 'tools'); }
  result.measure = { plain: await measure(path.join(OUT, 'a-plain'), 'a-plain'), harness: await measure(path.join(OUT, 'b-harness'), 'b-harness') };
  await fs.writeFile(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2)); log(JSON.stringify(result.measure, null, 1).slice(0, 3000));
  await browser.close();
})().catch(async e => { console.error(e); await fs.writeFile(path.join(OUT, 'result.json'), JSON.stringify({ error: e.message })).catch(() => {}); process.exitCode = 1; });
