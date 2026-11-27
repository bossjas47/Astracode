// ตรวจหน้าจอจริงก่อน deploy: เปิดหน้าหลักด้วย Worker จริง (D1 จำลอง + ข้อมูลตัวอย่าง) ในเบราว์เซอร์จริง
// ทุกธีม (สว่าง/มืด) × ทุกขนาดจอ (มือถือ/คอม) แล้วจับ 2 อย่างที่ลูกค้าเจอบ่อย:
//   1) ตัวหนังสืออ่านไม่ได้ (สีตัวอักษรกลืนกับพื้นหลัง เช่น ดำบนดำ · contrast < 1.6)
//   2) error ของ JavaScript ในหน้า
// รัน: npm run uicheck (ต้องมี playwright หรือ playwright-core + Chrome) · พบปัญหา = exit 1 พร้อมรายการและภาพหน้าจอใน tests/uicheck-out/
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, addModel, addPlan } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), pub = join(root, 'public'), outDir = join(root, 'tests', 'uicheck-out');
const req = createRequire(import.meta.url); let pw; try { pw = req('playwright'); } catch { pw = req('playwright-core'); }
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const asset = p => { let f = join(pub, p); if (!existsSync(f) || p.endsWith('/')) f = join(pub, (p.replace(/^\//, '').split('/')[0] || 'index') + '.html'); if (!existsSync(f)) f = join(pub, 'index.html'); return new Response(readFileSync(f), { headers: { 'content-type': MIME[extname(f)] || 'text/html' } }); };

// ---- ข้อมูลตัวอย่าง: ผู้ใช้แพลน Pro + งาน Harness ที่เสร็จแล้ว + แชตที่มีโค้ด ----
const t = await makeEnv({ K: 'k' });
t.env.ASSETS = { fetch: async r => asset(new URL(r.url).pathname) };
const ids = ['Claude Sonnet 5.5 Eco', 'Claude Opus 5.5', 'ChatGPT 6.2 Sol', 'DeepSeek 4.1 Flash 1017', 'DeepSeek 4.1 Flash Uncen'].map(n => addModel(t.DB, { name: n, base_url: 'http://127.0.0.1:9' }).id);
const plan = addPlan(t.DB, { name: 'Pro', price: 749, limit_4h: 16, limit_week: 64, models: ids }); t.DB.raw.prepare('UPDATE plans SET cowork=1 WHERE id=?').run(plan.id);
const u = await t.user({ email: 'ui@kyber.test' }); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 20 * 864e5, u.id);
const now = Date.now();
const ev = [{ type: 'user', text: 'สรุปยอดขายเป็น Excel' }, { type: 'tool', id: 'a', name: 'read_file', args: { path: 'sales.csv' } }, { type: 'tool_result', id: 'a', ok: true, preview: '10 rows' }, { type: 'text', text: 'เสร็จแล้ว `สรุป.xlsx`\n\n```js\nconsole.log(1)\n```' }, { type: 'end', status: 'done' }];
t.DB.raw.prepare('INSERT INTO cowork_tasks (user_id,title,status,events,files,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(u.id, 'งานตัวอย่าง', 'done', JSON.stringify(ev), JSON.stringify([{ path: 'สรุป.xlsx', size: 4000 }]), now, now);
const chat = t.DB.raw.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').get(u.id, 'แชตตัวอย่าง', now).id;
t.DB.raw.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').run(chat, 'user', 'ช่วยเขียนโค้ด', ids[0], now);
t.DB.raw.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').run(chat, 'assistant', 'ได้ครับ ใช้ `npm run dev` แล้วดูตาราง\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```bash\nnpm install\n```', ids[0], now + 1);
const proj = t.DB.raw.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').get(u.id, 'demo', now, now)?.id;
if (proj) t.DB.raw.prepare('INSERT INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)').run(proj, 'index.html', '<h1>hi</h1>', now);

const srv = createServer(async (rq, res) => {
  const body = await new Promise(r => { const b = []; rq.on('data', d => b.push(d)); rq.on('end', () => r(Buffer.concat(b))); });
  try {
    const r = await t.worker.default.fetch(new Request('https://t.test' + rq.url, { method: rq.method, headers: rq.headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : body }), t.env, t.ctx);
    const h = {}; r.headers.forEach((v, k) => { if (!['set-cookie', 'content-security-policy', 'strict-transport-security'].includes(k)) h[k] = v; });
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => srv.listen(0, r));
const base = 'http://localhost:' + srv.address().port, sid = u.cookie.split('=')[1];

const PAGES = ['/chat', '/chat?id=' + chat, '/chat?mode=cowork', '/chat?mode=cowork&task=1', ...(proj ? ['/code?p=' + proj] : []), '/developers', '/account', '/plans', '/pricing', '/status', '/kyber25', '/'];
const THEMES = ['light', 'dark'], SIZES = [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]];

// ในหน้า: หาข้อความที่มองเห็นได้แต่สีตัวอักษรกลืนกับพื้นหลังจริง (เดินขึ้นหาพื้นหลังทึบ · ข้ามพื้นรูป/ไล่สีเพราะคำนวณไม่ได้)
const SCAN = () => {
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const p = parse(cs.backgroundColor); if (p && p.a > 0) { stack.push(p); if (p.a >= 0.95) break; } } let c = [255, 255, 255]; for (const p of stack.reverse()) c = c.map((v, i) => v * (1 - p.a) + p.c[i] * p.a); return c; };
  const bad = [], seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = n.textContent.trim(); if (txt.length < 2) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.3 || cs.display === 'none') continue;
    let hidden = false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.3 || e.hidden) { hidden = true; break; } } if (hidden) continue;
    const fg = parse(cs.color), bg = bgOf(el); if (!fg || !bg || fg.a < 0.3) continue;
    const f = fg.c.map((v, i) => v * fg.a + bg[i] * (1 - fg.a)), l1 = lum(f), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 1.6) bad.push({ text: txt.slice(0, 50), tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''), ratio: Math.round(ratio * 100) / 100 });
  }
  return bad;
};

const exe = process.env.CHROME_PATH || undefined;
const browser = await pw.chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
mkdirSync(outDir, { recursive: true });
const problems = [];
for (const theme of THEMES) for (const [sz, vp] of SIZES) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'th-TH' });
  await ctx.addCookies([{ name: 'sid', value: sid, domain: 'localhost', path: '/' }]);
  await ctx.addInitScript(([th, mid]) => { try { localStorage.setItem('theme', th); localStorage.setItem('model', String(mid)); } catch { /* */ } }, [theme, ids[4]]); // เลือกโมเดล Uncen: ตรวจป้ายเตือนอ่านออกทุกธีมด้วย
  for (const path of PAGES) {
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push('JS error: ' + e.message.split('\n')[0]));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::|favicon|status of 4\d\d|status of 5\d\d|ERR_/i.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    try { await p.goto(base + path, { waitUntil: 'networkidle', timeout: 20000 }); } catch { /* หน้ารอเชื่อมต่อค้าง: ตรวจเท่าที่โหลดได้ */ }
    await p.waitForTimeout(800);
    const bad = await p.evaluate(SCAN).catch(e => [{ text: 'scan failed: ' + e.message, tag: '-', ratio: 0 }]);
    const tag = `${theme}/${sz} ${path}`;
    if (bad.length || errs.length) {
      const shot = join(outDir, `${theme}-${sz}-${path.replace(/[^a-z0-9]+/gi, '_')}.png`); await p.screenshot({ path: shot }).catch(() => {});
      for (const b of bad) problems.push(`${tag} · อ่านไม่ได้ (contrast ${b.ratio}) <${b.tag}> "${b.text}"`);
      for (const e of [...new Set(errs)]) problems.push(`${tag} · ${e}`);
    }
    await p.close();
  }
  await ctx.close();
}
await browser.close(); srv.close();
const checked = THEMES.length * SIZES.length * PAGES.length;
if (problems.length) { console.log(`UI check: พบ ${problems.length} ปัญหา จาก ${checked} หน้าจอ (ภาพอยู่ใน tests/uicheck-out/)\n` + problems.map(x => ' - ' + x).join('\n')); process.exit(1); }
console.log(`UI check: ผ่าน ${checked} หน้าจอ (${PAGES.length} หน้า × ธีมสว่าง/มืด × คอม/มือถือ)`); process.exit(0);
