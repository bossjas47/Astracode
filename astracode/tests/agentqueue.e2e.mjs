// ทดสอบหน้าแชตกับแอป Desktop (จำลอง astraDesktop) ในเบราว์เซอร์จริง:
//  1) โมเดลขาดกลางทาง → Agent ทำต่อให้เอง  2) พิมพ์ระหว่างทำงาน = เข้าคิว แล้วส่งเองเมื่อเสร็จ  3) สลับแชตแล้วงานไม่หยุด
// รัน: node tests/agentqueue.e2e.mjs (ต้องมี playwright)
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, addModel, addPlan } from './helpers.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), pub = join(root, 'public');
const req = createRequire(import.meta.url); let pw; try { pw = req('playwright'); } catch { pw = req('playwright-core'); }
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const asset = p => { let f = join(pub, p); if (!existsSync(f) || p.endsWith('/')) f = join(pub, (p.replace(/^\//, '').split('/')[0] || 'index') + '.html'); if (!existsSync(f)) f = join(pub, 'index.html'); return new Response(readFileSync(f), { headers: { 'content-type': MIME[extname(f)] || 'text/html' } }); };
const t = await makeEnv({ K: 'k' }); t.env.ASSETS = { fetch: async r => asset(new URL(r.url).pathname) };
const mid = addModel(t.DB, { name: 'Claude Sonnet 5.5 Eco', base_url: 'http://127.0.0.1:9' }).id;
const plan = addPlan(t.DB, { name: 'Pro', price: 749, limit_4h: 16, limit_week: 64, models: [mid] }); t.DB.raw.prepare('UPDATE plans SET agent=1 WHERE id=?').run(plan.id);
const u = await t.user({ email: 'q@kyber.test' }); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 20 * 864e5, u.id);
const srv = createServer(async (rq, res) => {
  const body = await new Promise(r => { const b = []; rq.on('data', d => b.push(d)); rq.on('end', () => r(Buffer.concat(b))); });
  try { const r = await t.worker.default.fetch(new Request('http://' + rq.headers.host + rq.url, { method: rq.method, headers: rq.headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : body }), t.env, t.ctx);
    const h = {}; r.headers.forEach((v, k) => { if (!['set-cookie', 'content-security-policy', 'strict-transport-security'].includes(k)) h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer())); }
  catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
// แอป Desktop จำลอง: งานแรกของแต่ละ sid หลุดกลางทาง 1 ครั้ง · งานใช้เวลา window.__ms
const FAKE = () => { if (window !== window.top) return;
  const subs = new Set(), stops = new Set(); window.__runs = []; window.__ms = 1500; let failed = new Set();
  const emit = d => subs.forEach(f => f(d)); const nop = async () => null;
  const agent = {
    needKey: async () => false, setKey: nop, commands: async () => [], stop: async sid => { stops.add(sid); return true; }, steer: async () => true, answer: nop, undo: async () => [],
    onEvent: f => { subs.add(f); return () => subs.delete(f); },
    run: async o => { window.__runs.push({ sid: o.sid, text: o.text, chatId: o.chatId }); stops.delete(o.sid);
      emit({ sid: o.sid, rid: o.rid, type: 'tool', id: 'a' + o.rid, name: 'read_file', args: { path: 'x.py' }, step: 1 });
      for (let i = 0; i < window.__ms / 100; i++) { await new Promise(r => setTimeout(r, 100)); if (stops.has(o.sid)) throw new Error('หยุดแล้ว'); }
      emit({ sid: o.sid, rid: o.rid, type: 'tool_result', id: 'a' + o.rid, ok: true, preview: 'ok' });
      if (!failed.has(o.sid)) { failed.add(o.sid); throw new Error('โมเดลตอบไม่ได้ตอนนี้'); }
      emit({ sid: o.sid, rid: o.rid, type: 'delta', text: 'เสร็จแล้ว: ' + o.text.slice(0, 20) }); emit({ sid: o.sid, rid: o.rid, type: 'done', changed: ['x.py'] }); },
  };
  window.astraDesktop = new Proxy({ agent, fs: { linked: async () => ({ name: 'proj', auto: true }), link: nop }, screen: { state: async () => false }, notify: () => {}, plugins: { list: async () => [] } }, { get: (o, k) => k in o ? o[k] : new Proxy({}, { get: () => nop }) });
  localStorage.setItem('pc', '1'); localStorage.setItem('pcAgent', '1');
};
const exe = process.env.CHROME_PATH || undefined, browser = await pw.chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}), ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ctx.addCookies([{ name: 'sid', value: u.cookie.split('=')[1], domain: 'localhost', path: '/' }]); await ctx.addInitScript(FAKE);
const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
const fails = []; const ok = (n, v) => { console.log((v ? 'ok   ' : 'FAIL ') + n); if (!v) fails.push(n); };
await p.goto(base + '/chat', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.fill('#t', 'แก้บั๊กในไฟล์ x.py'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
// พิมพ์ระหว่างทำ → เข้าคิว (เดิม Enter = กดหยุดงาน)
await p.fill('#t', 'แล้วเขียนเทสต์ด้วย'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
ok('Enter ระหว่างทำงาน = เข้าคิว ไม่หยุดงาน', await p.locator('.cq-item').count() === 1 && await p.evaluate(() => chat.agentBusy));
await p.waitForTimeout(9000); // งานแรกหลุด → รอ 5 วิ → ทำต่อ → เสร็จ → ส่งคิว
const runs = await p.evaluate(() => window.__runs);
ok('หลุดกลางทางแล้วทำต่อเอง', runs.length >= 2 && /ขาดกลางทาง/.test(runs[1].text));
ok('มีข้อความแจ้งว่าทำต่ออัตโนมัติ', await p.evaluate(() => chat.msgs.some(m => m.steps?.some(s => /ทำต่อให้อัตโนมัติ/.test(s.text || '')))));
await p.waitForTimeout(1500);
const runs2 = await p.evaluate(() => window.__runs);
ok('งานเสร็จแล้วส่งข้อความในคิวให้เอง', runs2.some(r => r.text === 'แล้วเขียนเทสต์ด้วย') && await p.locator('.cq-item').count() === 0);
// คิวแนบรูป + กด "แทรกเลย" ส่งข้อความพร้อมรูปเข้างานที่กำลังทำ
await p.waitForFunction(() => !chat.busy, null, { timeout: 15000 }).catch(() => {});
await p.evaluate(() => { window.__ms = 2500; window.__steers = []; const s0 = window.astraDesktop.agent.steer; window.astraDesktop.agent.steer = async (sid, t, imgs) => { window.__steers.push({ t, n: (imgs || []).length }); return true; }; });
await p.fill('#t', 'งานถัดไป'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await p.evaluate(() => { chat.images = ['data:image/png;base64,AAAA']; }); await p.fill('#t', 'ดูรูปนี้ด้วย'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
ok('คิวเก็บรูปไว้ด้วย', /รูป 1/.test(await p.locator('.cq-item').first().innerText()) && await p.evaluate(() => !chat.images.length));
await p.click('[data-cqnow="0"]'); await p.waitForTimeout(300);
ok('แทรกเลย: ส่งข้อความพร้อมรูปเข้างาน', await p.evaluate(() => window.__steers.length === 1 && window.__steers[0].t === 'ดูรูปนี้ด้วย' && window.__steers[0].n === 1));
await p.waitForFunction(() => !chat.busy, null, { timeout: 20000 }).catch(() => {});
await p.waitForFunction(() => !chat.busy, null, { timeout: 15000 }).catch(() => {});
// สลับแชตระหว่างทำงาน → งานไม่หยุด และผลลงแชตเดิม
const cidA = await p.evaluate(() => chat.id); await p.evaluate(() => { window.__ms = 3000; });
await p.fill('#t', 'งานยาวในแชต A'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
await p.evaluate(() => openChat(null)); await p.waitForTimeout(800);
ok('เปิดแชตใหม่ระหว่างงานวิ่ง: แชตใหม่ไม่ busy', await p.evaluate(() => !chat.busy && !chat.agentBusy));
await p.fill('#t', 'คำถามในแชต B'); ok('แชตใหม่ปุ่มเป็นส่ง (ไม่ใช่หยุด)', await p.getAttribute('#go', 'aria-label') === 'ส่ง');
await p.evaluate(() => { window.__ms = 300; }); await p.waitForTimeout(9000);
const runs3 = await p.evaluate(() => window.__runs);
ok('งานแชต A ไม่ถูกหยุด และทำต่อจนจบ', runs3.filter(r => r.chatId === cidA).length >= 4);
const msgsA = t.DB.raw.prepare('SELECT role, content FROM messages WHERE chat_id=? ORDER BY id').all(cidA);
ok('คำตอบของงาน A บันทึกลงแชต A', msgsA.some(m => m.role === 'assistant' && /งานยาวในแชต A/.test(m.content)));
await p.evaluate(id => openChat(id), cidA); await p.waitForTimeout(800);
ok('กลับไปแชต A เห็นคำตอบ', /งานยาวในแชต A/.test(await p.locator('#msgs').innerText()));
ok('ไม่มี JS error', !errs.length); if (errs.length) console.log(errs);
await browser.close(); srv.close();
console.log(fails.length ? `ไม่ผ่าน ${fails.length} ข้อ` : 'ผ่านทั้งหมด'); process.exit(fails.length ? 1 : 0);
