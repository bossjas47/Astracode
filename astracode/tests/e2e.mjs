// เปิดทุกหน้าในเบราว์เซอร์จริง (Chromium) กับ API จำลอง: หน้าต้องวาดได้และไม่มี error ของ JavaScript
// รัน: npm run e2e (ต้องมี playwright) · ไม่ได้แตะ Worker จริง ทดสอบเฉพาะโค้ดฝั่งหน้าเว็บ
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const req = createRequire(import.meta.url); let pw; try { pw = req('playwright'); } catch { pw = req('playwright-core'); } // CI ใช้ playwright-core กับ Chrome ของเครื่อง (CHROME_PATH)
const { chromium } = pw;
const pub = join(dirname(fileURLToPath(import.meta.url)), '../public');
const usage = { pct4h: 12, pctWeek: 34, reset4h: Date.now() + 3600e3, resetWeek: Date.now() + 5 * 864e5, use4h: true };
const models = [{ id: 1, name: 'Flash', provider: 'openai', multiplier: 1, vision: 1, effort: 'none', cap_pct: 0 }, { id: 2, name: 'Sonnet', provider: 'anthropic', multiplier: 5, vision: 1, effort: 'anthropic', effort_levels: 'low,high', cap_pct: 30 }];
const ME = admin => ({ email: 'tester@example.com', role: admin ? 'admin' : 'user', plan: { id: 2, name: 'Plus', paid: true, api_limit: true, expires: Date.now() + 9 * 864e5, period: 'month', team: null }, balance: 120, ref_code: 'AB12', email_verified: true, totp_on: false, has_password: true, instructions: '', wallet_overflow: false, auto_renew: true, usage, reset_credits: 0, reset_list: [], models, promptpay_id: '0800000000', pay_info: { bank_name: 'Bank', bank_account: '111-1-11111-1', bank_holder: 'Holder' } });
const plans = [{ id: 1, name: 'Free', price: 0, description: 'ฟรี', seats: 1, models: [{ name: 'Flash', week: 50 }] }, { id: 2, name: 'Plus', price: 349, price_year: 3490, description: 'ดี', seats: 1, api_limit: 1, models: [{ name: 'Flash', week: 900 }, { name: 'Sonnet', week: 90 }] }, { id: 3, name: 'Team 5', price: 1790, price_year: 17900, description: 'ทีม', seats: 5, shared_pool: 1, api_limit: 1, models: [{ name: 'Flash', week: 5000 }] }];
const API = (admin, loggedIn) => ({
  '/api/me': loggedIn ? ME(admin) : null, '/api/settings/public': { search: true }, '/api/plans': plans,
  '/api/pricing': { note: '', plans: plans.map(p => ({ id: p.id, name: p.name, price: p.price, limit_week: 30 })), models: [{ id: 1, name: 'Flash', provider: 'openai', in: 2.5, out: 10, cache: 0.2, cache_write: 0, plans: [1, 2], multiplier: 1, official: { in: 0.3, out: 1.2 } }, { id: 9, name: 'PerRequest', provider: 'openai', req: 1.2, in: 0, out: 0, cache: 0, plans: [2], multiplier: 1 }] },
  '/api/pricing/calc': { per1: 0.01, month: 3, plans: [{ id: 2, pct: 12 }] },
  '/api/status': { updated: Date.now(), models: [{ name: 'Flash', uptime: 99.9, state: 'ok', down: false, days: Array.from({ length: 30 }, () => ({ ok: 5, err: 0 })) }] },
  '/api/wallet': { balance: 120, ref_code: 'AB12', referred: 0, referred_paid: 0, bonus: 20, tx: [{ amount: 100, balance_after: 120, kind: 'topup', ref: null, created_at: Date.now() }] },
  '/api/team': { team: null }, '/api/usage/daily': { days: [{ d: Date.now() - 864e5, n: 3, units: 0.4, pct: 1.2 }], models: [{ name: 'Flash', n: 3, units: 0.4 }] }, '/api/memories': [], '/api/tasks': [{ id: 1, prompt: 'สรุปข่าว', hour: 8 }], '/api/gift': [], '/api/docs': [], '/api/sessions': [], '/api/keys': [], '/api/keys/stats': [], '/api/admin-gate': { set: true, ok: true },
  '/api/admin/quality': { votes: [], reports: [], cache: [{ model_id: 1, name: 'Flash', n: 3, fresh: 100, cached: 300 }] },
  '/api/admin/settings': { env: {}, health_check: '0' }, '/api/admin/live': { keys: [{ k: 'UNCEN_KEY', h1: 2.26, d1: 13.2, d3: 30, d7: 51, n: 40, flagged: 3, series: Array.from({ length: 24 }, (_, i) => i % 5), fund: { credits: 300, rate: 3, at: Date.now() - 3600e3 }, left: 260, days: 8.6 }], feed: [{ id: 1, t: Date.now(), uid: 5, email: 'a@b.c', model: 'ChatGPT 6 Astra Uncen', k: 'UNCEN_KEY', src: 'api', tin: 113000, tout: 1, tc: 0, cost: 2.26, charge: null, units: 2.26, ms: 900, flag: 'gone' }], errs: [], hot: [{ uid: 5, email: 'a@b.c', plan: 'Plus', n: 40, h1: 6, d1: 13, charge: 0, units: 13, balance: 0, flagged: 3 }], losers: [{ uid: 5, email: 'a@b.c', plan: 'Plus', paid: 349, cost: 400, profit: -51 }], settings: {} }, '/api/pay': [], '/api/skills': [{ id: 1, user_id: 0, name: 'translator', description: 'แปล', content: 'x', enabled: 1 }],
});
const PAGES = [['/', 0, 1], ['/login', 0, 0], ['/chat', 0, 1], ['/plans', 0, 1], ['/plans?team=1', 0, 1], ['/pricing', 0, 1], ['/pricing', 0, 0], ['/account', 0, 1], ['/developers', 0, 1], ['/status', 0, 0], ['/terms', 0, 0], ['/support', 0, 1], ['/code', 0, 1], ['/admin?tab=quality', 1, 1], ['/admin?tab=live', 1, 1], ['/admin?tab=settings', 1, 1], ['/admin?tab=models', 1, 1]];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {}); let failed = 0;
for (const [url, admin, loggedIn] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } }), errs = [], api = API(admin, loggedIn);
  page.on('pageerror', e => errs.push(e.message + (process.env.STACK ? ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' < ') : '')));
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 't.test') return r.abort();
    if (u.pathname.startsWith('/api/')) { const d = api[u.pathname]; return d === null ? r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d ?? []) }); }
    const f = join(pub, u.pathname === '/' ? 'home.html' : u.pathname), hit = [f, f + '.html'].find(x => existsSync(x) && statSync(x).isFile());
    return hit ? r.fulfill({ path: hit }) : r.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://t.test' + url); await page.waitForTimeout(900);
  const text = (await page.locator('#app').innerText().catch(() => '')).trim();
  const broke = /Cannot read properties|is not defined|is not a function|โหลดนานผิดปกติ/.test(text); // หน้าที่จับ error แล้วโชว์ข้อความแทนเนื้อหา ก็นับว่าพัง
  const ok = !errs.length && text.length > 20 && !broke; if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${url}${loggedIn ? admin ? ' (admin)' : ' (user)' : ' (guest)'}${errs.length ? '  ' + errs.join(' | ').slice(0, 300) : ''}${text.length <= 20 ? '  (empty page)' : ''}${broke ? '  ' + text.match(/[^.\n]*(Cannot read properties|is not defined|is not a function|โหลดนานผิดปกติ)[^\n]*/)?.[0].slice(0, 160) : ''}`);
  await page.close();
}

// ---------- เส้นทางหลัก: กดใช้งานจริงกับ API จำลอง แล้วตรวจว่าส่งคำขอถูกและหน้าแสดงผลถูก ----------
async function open(url, extra = {}) {
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } }), errs = [], calls = [], api = { ...API(0, 1), ...extra };
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('onb', '1'); localStorage.setItem('whatsnew:2026-11', '1'); } catch {} });
  if (extra.init) await page.addInitScript(extra.init); // เช่น จำลองแอป Desktop (window.astraDesktop)
  await page.route('**/*', r => {
    const q = r.request(), u = new URL(q.url()); if (u.hostname !== 't.test') return r.abort();
    if (u.pathname.startsWith('/api/')) {
      calls.push({ m: q.method(), p: u.pathname, body: q.postData() || '' });
      if (u.pathname === '/api/chat' && extra.chat) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: extra.chat(q).map(x => 'data: ' + JSON.stringify(x) + '\n\n').join('') });
      if (u.pathname === '/api/chat') return r.fulfill({ status: 200, contentType: 'text/event-stream', body: ['{"chat_id":7}', '{"t":"สวัสดีครับ ทดสอบ"}', '{"done":true,"pct4h":12,"pctWeek":34,"mid":99}'].map(x => 'data: ' + x + '\n\n').join('') });
      const d = typeof api[u.pathname] === 'function' ? api[u.pathname](q) : api[u.pathname];
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d ?? []) });
    }
    const f = join(pub, u.pathname === '/' ? 'home.html' : u.pathname), hit = [f, f + '.html'].find(x => existsSync(x) && statSync(x).isFile());
    return hit ? r.fulfill({ path: hit }) : r.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://t.test' + url); await page.waitForTimeout(800);
  return { page, errs, calls };
}
const FLOWS = [
  ['send a chat message and see the streamed answer', async () => {
    const { page, errs, calls } = await open('/chat');
    await page.fill('#t', 'สวัสดี'); await page.click('#go'); await page.waitForTimeout(800);
    const sent = calls.find(c => c.p === '/api/chat'), text = await page.locator('#app').innerText();
    return [!errs.length || errs.join(' | '), !!sent || 'no /api/chat call', /"text":"สวัสดี"/.test(sent?.body || '') || 'text not sent', text.includes('สวัสดีครับ ทดสอบ') || 'answer not shown'];
  }],
  ['copy an AI answer gives clean text without markdown symbols', async () => {
    const { page, errs } = await open('/chat?id=81', { '/api/chats': [{ id: 81, title: 'คัดลอก' }], '/api/chats/81': [{ id: 1, role: 'user', content: 'ถาม' }, { id: 2, role: 'assistant', content: '## หัวข้อ\n\n**ตัวหนา** และ `โค้ด`\n\n- ข้อหนึ่ง' }] });
    await page.evaluate(() => { window.__clip = ''; const cb = { writeText: async t => { window.__clip = t; }, write: async items => { window.__clip = await (await items[0].getType('text/plain')).text(); } }; Object.defineProperty(navigator, 'clipboard', { value: cb, configurable: true }); }); // http://t.test ไม่ใช่ secure context: จำลอง clipboard
    await page.click('.msg.ai .cp-msg'); await page.waitForTimeout(300);
    const clip = await page.evaluate(() => window.__clip), label = await page.locator('.msg.ai .cp-msg').innerText();
    return [!errs.length || errs.join(' | '), /ตัวหนา/.test(clip) || 'nothing copied: ' + clip, !/[*#`]/.test(clip) || 'markdown left: ' + clip, /คัดลอกแล้ว/.test(label) || 'no copied feedback'];
  }],
  ['selecting text after opening chats several times shows one selection bar', async () => {
    const { page, errs } = await open('/chat?id=81', { '/api/chats': [{ id: 81, title: 'x' }], '/api/chats/81': [{ id: 1, role: 'user', content: 'ถาม' }, { id: 2, role: 'assistant', content: 'คำตอบยาวพอสำหรับเลือก' }] });
    for (let i = 0; i < 3; i++) { await page.evaluate(() => chatView(81)); await page.waitForTimeout(300); }
    await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.msg.ai .b p')); getSelection().removeAllRanges(); getSelection().addRange(r); }); await page.waitForTimeout(500);
    const n = await page.locator('.selbar').count();
    return [!errs.length || errs.join(' | '), n === 1 || `${n} selection bars`];
  }],
  ['developers: create an API key, see it once, and the connect tab fills it into the setup', async () => {
    const { page, errs, calls } = await open('/developers', { '/api/keys': q => q.method() === 'POST' ? { key: 'sk-astra-newkey123' } : [], '/api/keys/stats': [] });
    await page.fill('#kf [name=name]', 'cline'); await page.click('#kf button'); await page.waitForTimeout(500);
    const shown = await page.locator('#nk').inputValue().catch(() => '');
    await page.click('[data-dt="connect"]'); await page.click('[data-ct="curl"]'); await page.waitForTimeout(200);
    const snip = await page.locator('#csnip').innerText();
    return [!errs.length || errs.join(' | '), calls.some(c => c.m === 'POST' && c.p === '/api/keys') || 'no POST /api/keys', shown === 'sk-astra-newkey123' || 'new key not shown: ' + shown, snip.includes('sk-astra-newkey123') || 'snippet has no key'];
  }],
  ['desktop app login: allowing creates a Desktop key and sends it back to 127.0.0.1 with the state', async () => {
    const st = 'ab'.repeat(16), { page, errs, calls } = await open(`/desktop-auth?port=5555&state=${st}`, { '/api/keys': { key: 'sk-astra-0123abcd' } });
    const [req] = await Promise.all([page.waitForRequest(r => r.url().startsWith('http://127.0.0.1:5555/cb'), { timeout: 3000 }).catch(() => null), page.click('#dok')]);
    const bad = await open('/desktop-auth?port=80&state=x'), badText = await bad.page.locator('#app').innerText();
    return [!errs.length || errs.join(' | '), calls.some(c => c.m === 'POST' && c.p === '/api/keys' && /Desktop/.test(c.body)) || 'no Desktop key created', req?.url().includes('key=sk-astra-0123abcd&state=' + st) || 'no redirect to app: ' + req?.url(), /ไม่ถูกต้อง/.test(badText) || 'bad link not refused'];
  }],
  ['desktop app: Code project linked to a local folder syncs files both ways and RUN uses the real terminal', async () => {
    const init = () => { const log = window.__desk = []; window.astraDesktop = { fs: {
      linked: async k => (log.push(['linked', k]), k === 'p:1' ? { name: 'site', path: 'C:/site' } : null),
      scan: async () => ({ files: [{ path: 'index.html', content: '<h1>disk</h1>' }, { path: 'new.js', content: 'let n = 1' }], skipped: [] }),
      write: async (k, f) => (log.push(['write', k, f.map(x => x.path).join(',')]), 1), remove: async (k, p) => log.push(['remove', k, p]),
      run: async (k, cmd, on) => { log.push(['run', k, cmd]); on({ out: 'tests ok\n' }); return { code: 0, stdout: 'tests ok\n', stderr: '' }; }, kill() {},
      isServer: async c => /run dev/.test(c), serve: async (k, c) => (log.push(['serve', k, c]), window.__srv = { cmd: c, port: 5173 }, { code: 0, port: 5173, running: true }), serveInfo: async () => window.__srv || null, onServe() {}, onChanged() {}, watch: async k => (log.push(['watch', k]), true),
    }, mcp: { tools: async () => [] }, notify: async () => false }; };
    const { page, errs, calls } = await open('/code?p=1', { init, '/api/projects/1': { id: 1, name: 'Site', instructions: '', gh: null, files: [{ path: 'index.html', content: '<h1>x</h1>' }, { path: 'old.css', content: 'b{}' }] } });
    await page.waitForTimeout(600);
    const imp = calls.find(c => c.m === 'POST' && c.p === '/api/projects/1/import'), log1 = await page.evaluate(() => window.__desk.slice());
    await page.evaluate(() => { showRun(true); runTab('term'); }); await page.fill('#term-i', 'npm test'); await page.press('#term-i', 'Enter'); await page.waitForTimeout(700);
    await page.fill('#term-i', 'npm run dev'); await page.press('#term-i', 'Enter'); await page.waitForTimeout(700);
    const log2 = await page.evaluate(() => window.__desk.slice()), term = await page.locator('#term-o').innerText().catch(() => ''), btn = await page.locator('#localb').innerText().catch(() => '');
    const srv = await page.locator('#srvb').innerText().catch(() => '');
    return [!errs.length || errs.join(' | '), /<h1>disk<\/h1>/.test(imp?.body || '') && /new\.js/.test(imp?.body || '') || 'disk files not uploaded: ' + imp?.body?.slice(0, 120),
      log1.some(x => x[0] === 'write' && x[2].includes('old.css')) || 'project-only file not written to disk: ' + JSON.stringify(log1), !log1.some(x => x[0] === 'write' && x[2].includes('new.js')) || 'disk file written back to disk',
      log2.some(x => x[0] === 'run' && x[1] === 'p:1' && x[2] === 'npm test') || 'RUN did not use the local terminal', term.includes('tests ok') || 'no output: ' + term, btn.includes('site') || 'header does not show the folder: ' + btn,
      log2.some(x => x[0] === 'serve' && x[2] === 'npm run dev') || 'dev server not started in the background', srv.includes('5173') || 'server button missing: ' + srv, term.includes('localhost:5173') || 'server URL not shown', log1.some(x => x[0] === 'watch') || 'folder not watched'];
  }],
  ['desktop app: chat with "use this computer" runs the AI tool lines locally and sends the results back', async () => {
    const init = () => { try { localStorage.setItem('pc', '1'); } catch { return; } const log = window.__desk = []; window.astraDesktop = { fs: {
      linked: async k => k === 'chat' ? { name: 'work', path: 'C:/work' } : null, list: async (k, p) => (log.push(['list', k, p]), 'a.txt\nb.txt'),
      read: async (k, p) => (log.push(['read', k, p]), 'hello from a'), run: async () => ({ code: 0, stdout: '', stderr: '' }), write: async () => 1, kill() {},
      grep: async (k, q) => (log.push(['grep', k, q]), 'a.txt:1: hello from a'), edit: async (k, p, e) => (log.push(['edit', p, e[0].search, e[0].replace]), []), isServer: async () => false,
    }, mcp: { tools: async () => [{ name: 'mcp_blender_get_scene', description: 'scene', parameters: { properties: {} } }] }, notify: async () => false }; };
    let n = 0; const chat = () => ++n === 1 ? [{ chat_id: 7 }, { t: 'ขอดูไฟล์ก่อน\nLIST .\nREAD a.txt\nGREP hello\nCLICK 10 10\n```js file=a.js\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```' }, { done: true, pct4h: 1, pctWeek: 1 }] : [{ t: 'ไฟล์ a.txt เขียนว่า hello' }, { done: true, pct4h: 1, pctWeek: 1 }];
    const { page, errs, calls } = await open('/chat', { init, chat });
    await page.fill('#t', 'ดูไฟล์ในโฟลเดอร์'); await page.press('#t', 'Enter'); await page.waitForTimeout(1500);
    const sent = calls.filter(c => c.p === '/api/chat').map(c => JSON.parse(c.body)), log = await page.evaluate(() => window.__desk.slice()), text = await page.locator('#msgs').innerText();
    return [!errs.length || errs.join(' | '), sent[0]?.local?.folder === 'work' && sent[0].local.mcp?.[0]?.name === 'mcp_blender_get_scene' || 'local info not sent: ' + JSON.stringify(sent[0]?.local),
      log.some(x => x[0] === 'list') && log.some(x => x[0] === 'read' && x[2] === 'a.txt') || 'tools not run: ' + JSON.stringify(log),
      sent.length === 2 && sent[1].text.startsWith('[ผลจากเครื่อง]') && sent[1].text.includes('hello from a') || 'results not sent back: ' + JSON.stringify(sent[1]?.text),
      log.some(x => x[0] === 'grep' && x[2] === 'hello') && log.some(x => x[0] === 'edit' && x[1] === 'a.js' && x[2] === 'old' && x[3] === 'new') || 'grep/edit not run: ' + JSON.stringify(log),
      /ยังไม่ได้เปิดให้ AI ดูหน้าจอ/.test(sent[1]?.text || '') || 'screen action ran without permission',
      text.includes('ไฟล์ a.txt เขียนว่า hello') || 'final answer missing', text.includes('ผลจากเครื่อง') || 'result bubble missing', /⚙ LIST/.test(text) || 'tool line not shown as a step'];
  }],
  ['delete a chat moves it to the trash', async () => {
    const { page, errs, calls } = await open('/chat?id=80', { '/api/chats': [{ id: 80, title: 'แชตทดสอบ' }], '/api/chats/80': [] });
    await page.evaluate(() => document.querySelector('[data-cmenu="80"]').click()); await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('.sheet-bg [data-v=del]').click()); await page.waitForTimeout(300);
    const confirmText = await page.locator('.sheet-bg').innerText().catch(() => '');
    await page.evaluate(() => [...document.querySelectorAll('.sheet-bg button')].find(b => /Delete/.test(b.textContent))?.click()); await page.waitForTimeout(400);
    const del = calls.find(c => c.m === 'DELETE' && c.p === '/api/chats/80');
    return [!errs.length || errs.join(' | '), /30 วัน/.test(confirmText) || 'confirm does not mention the 30-day trash', !!del || 'no DELETE /api/chats/80'];
  }],
  ['edit a file in Code mode saves it', async () => {
    const { page, errs, calls } = await open('/code?p=1', { '/api/projects/1': { id: 1, name: 'Site', instructions: '', gh: null, files: [{ path: 'index.html', content: '<h1>x</h1>' }] } });
    await page.evaluate(() => setPane('code')); await page.click('.cm-content'); await page.keyboard.press('End'); await page.keyboard.type('<p>ok</p>'); await page.waitForTimeout(1800);
    const put = calls.find(c => c.m === 'PUT' && c.p === '/api/projects/1/file');
    return [!errs.length || errs.join(' | '), !!put || 'no save request', /<p>ok<\/p>/.test(put?.body || '') || 'typed text not saved'];
  }],
  ['page audit finds missing title, alt and viewport, and passes a clean page', async () => {
    const { page, errs } = await open('/code?p=1', { '/api/projects/1': { id: 1, name: 'Site', instructions: '', gh: null, files: [{ path: 'index.html', content: '<html><body><img src="a.png"><h1>x</h1></body></html>' }] } });
    const r = await page.evaluate(() => { const bad = auditProject(IDE.files); const good = auditProject(new Map([['index.html', '<html lang="th"><head><title>ร้าน</title><meta name="description" content="d"><meta name="viewport" content="width=device-width"><meta property="og:title" content="t"></head><body><h1>x</h1><img src="a.png" alt="a"></body></html>']])); return { bad, good }; });
    return [!errs.length || errs.join(' | '), r.bad.seo.some(x => /title/.test(x)) || 'missing title not found', r.bad.a11y.some(x => /alt/.test(x)) || 'missing alt not found', r.bad.seo.some(x => /viewport/.test(x)) || 'viewport not found', (r.good.seo.length + r.good.a11y.length + r.good.speed.length === 0) || 'clean page flagged: ' + JSON.stringify(r.good)];
  }],
  ['pay for a plan with a slip uploads the image', async () => {
    const { page, errs, calls } = await open('/plans');
    await page.click('[data-plan="2"]'); await page.waitForTimeout(300);
    await page.setInputFiles('input[name=slip]', { name: 's.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]) });
    await page.click('#f button'); await page.waitForTimeout(500);
    const pay = calls.find(c => c.m === 'POST' && c.p === '/api/pay');
    return [!errs.length || errs.join(' | '), !!pay || 'no /api/pay call', /name="plan_id"[\s\S]*2/.test(pay?.body || '') || 'plan id missing'];
  }],
];
for (const [name, fn] of FLOWS) {
  let res; try { res = await fn(); } catch (e) { res = [e.message.split('\n')[0]]; }
  const bad = res.filter(x => x !== true); if (bad.length) failed++;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} flow: ${name}${bad.length ? '  ' + bad.join(' · ') : ''}`);
}
await browser.close(); console.log(failed ? `${failed} check(s) failed` : 'all pages ok'); process.exit(failed ? 1 : 0);
