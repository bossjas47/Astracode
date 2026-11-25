// Live Eval ของ Kyber Harness: ให้โมเดลจริงทำงานจริงผ่าน /v1 ของ Kyber บนโฟลเดอร์ชั่วคราว แล้วตรวจผลด้วยการรันโค้ด
// ใช้ตัวคุมรอบเดียวกับแอปคอม (desktop/agent.js + agenttools.js: อ่านก่อนแก้ · ตรวจก่อนจบ · ผู้ตรวจรอบสอง)
// รัน: KYBER_EVAL_KEY=sk-astra-... [KYBER_EVAL_BASE=https://kyber.hypatir.dev] [KYBER_EVAL_MODELS="ชื่อ1,ชื่อ2"] node tests/bench/live-eval.mjs [ชื่อเคส...]
// ผล: ตารางต่อโมเดล (ผ่านกี่เคส · รอบ · เวลา · ค่าใช้จ่าย) → stdout, $GITHUB_STEP_SUMMARY และ live-eval.json · มีค่า token จริงทุกครั้งที่รัน
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desk = process.env.KYBER_DESKTOP_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'desktop');
const { runAgent } = require(join(desk, 'agent.js'));
const { Workspace, AGENT_TOOLS, agentSystem, projectMap, makeReviewer } = require(join(desk, 'agenttools.js'));

const BASE = (process.env.KYBER_EVAL_BASE || 'https://kyber.hypatir.dev').replace(/\/$/, ''), KEY = process.env.KYBER_EVAL_KEY || '';
const MAX_ROUNDS = +process.env.KYBER_EVAL_ROUNDS || 25, MAX_MS = (+process.env.KYBER_EVAL_MINUTES || 6) * 60e3;
// ตัวตรวจ: รันคำสั่งในโฟลเดอร์งาน คืน true เมื่อ exit 0 (ไม่ให้โมเดลเห็นตัวตรวจ: เขียนลงไฟล์หลังงานจบ)
const sh = (root, cmd, args) => { try { execFileSync(cmd, args, { cwd: root, timeout: 30e3, stdio: 'pipe' }); return true; } catch { return false; } };
const nodeCheck = (root, code) => { writeFileSync(join(root, '.kyber-check.cjs'), code); return sh(root, process.execPath, ['.kyber-check.cjs']); };

// ---------- งานจริง (fixture + คำสั่งภาษาไทย + ตัวตรวจที่โมเดลไม่เห็น) ----------
export const LIVE = [
  { name: 'fix-failing-test', about: 'เทสต์ไม่ผ่าน: หาสาเหตุในโค้ด แก้ แล้วรันเทสต์ให้ผ่าน',
    files: { 'price.js': "// คิดราคาหลังส่วนลด (percent = 0-100) แล้วปัดเป็นสตางค์\nexports.discount = (price, percent) => Math.round(price * percent / 100 * 100) / 100;\n", 'test.js': "const assert = require('assert');\nconst { discount } = require('./price');\nassert.strictEqual(discount(200, 10), 180);\nassert.strictEqual(discount(99.99, 0), 99.99);\nassert.strictEqual(discount(50, 100), 0);\nconsole.log('PASS');\n", 'package.json': '{ "name": "shop", "scripts": { "test": "node test.js" } }\n' },
    prompt: 'รัน npm test แล้วไม่ผ่าน ช่วยหาสาเหตุแล้วแก้ที่โค้ด (ห้ามแก้ test.js) จนเทสต์ผ่าน',
    check: root => sh(root, process.execPath, ['test.js']) && readFileSync(join(root, 'test.js'), 'utf8').includes('discount(200, 10), 180') },
  { name: 'add-feature', about: 'เพิ่มฟังก์ชันใหม่ตามสเปกในไฟล์เดิม โดยของเดิมยังทำงาน',
    files: { 'cart.js': "class Cart {\n  constructor() { this.items = []; }\n  add(name, price, qty = 1) { this.items.push({ name, price, qty }); return this; }\n}\nmodule.exports = { Cart };\n" },
    prompt: 'ใน cart.js เพิ่มเมธอด remove(name) ลบสินค้าชื่อนั้นออกทั้งหมด และ total(coupon) คืนยอดรวม (ราคา x จำนวน) ถ้ามี coupon "SAVE10" ลด 10% ปัดทศนิยม 2 ตำแหน่ง coupon อื่นหรือไม่ใส่ = ไม่ลด แล้วทดสอบด้วย node ให้แน่ใจว่าใช้ได้',
    check: root => nodeCheck(root, "const assert=require('assert');const {Cart}=require('./cart');const c=new Cart().add('a',100,2).add('b',50).add('c',9.99);assert.strictEqual(c.total(),259.99);assert.strictEqual(c.total('SAVE10'),233.99);assert.strictEqual(c.total('X'),259.99);c.remove('a');assert.strictEqual(c.total(),59.99);assert.strictEqual(c.items.length,2);") },
  { name: 'rename-across-files', about: 'เปลี่ยนชื่อฟังก์ชันทุกไฟล์โดยโปรแกรมยังให้ผลเดิม',
    files: { 'lib/fmt.js': "exports.fmtBaht = n => '฿' + n.toLocaleString('en-US');\n", 'lib/report.js': "const { fmtBaht } = require('./fmt');\nexports.line = (name, n) => name + ': ' + fmtBaht(n);\n", 'main.js': "const { fmtBaht } = require('./lib/fmt');\nconst { line } = require('./lib/report');\nconsole.log(fmtBaht(1500));\nconsole.log(line('ยอดขาย', 25000));\n" },
    prompt: 'เปลี่ยนชื่อฟังก์ชัน fmtBaht เป็น formatBaht ในทุกไฟล์ โปรแกรม main.js ต้องพิมพ์ผลเหมือนเดิม',
    check: root => { const read = p => readFileSync(join(root, p), 'utf8'); let out = ''; try { out = execFileSync(process.execPath, ['main.js'], { cwd: root, encoding: 'utf8', timeout: 30e3 }); } catch { return false; }
      return out.trim() === '฿1,500\nยอดขาย: ฿25,000' && !['lib/fmt.js', 'lib/report.js', 'main.js'].some(p => /fmtBaht/.test(read(p))); } },
  { name: 'keep-user-edits', about: 'แก้ค่าเดียวในไฟล์ตั้งค่าโดยไม่ทำลายคอมเมนต์/ค่าอื่นของผู้ใช้',
    files: { 'config.js': "// ตั้งค่าร้าน (แก้โดยเจ้าของร้าน 12 พ.ย.)\nmodule.exports = {\n  shopName: 'ขนมบ้านยาย', // ห้ามเปลี่ยนชื่อ\n  currency: 'THB',\n  deliveryFee: 40,\n  freeDeliveryOver: 500, // โปรส่งฟรี\n  openHours: '08:00-18:00',\n};\n" },
    prompt: 'เปลี่ยนค่าส่งเป็น 50 บาท และยอดส่งฟรีเป็น 699 บาท ที่เหลือห้ามแตะ',
    check: root => { const t = readFileSync(join(root, 'config.js'), 'utf8'); return nodeCheck(root, "const c=require('./config');const a=require('assert');a.strictEqual(c.deliveryFee,50);a.strictEqual(c.freeDeliveryOver,699);a.strictEqual(c.shopName,'ขนมบ้านยาย');a.strictEqual(c.openHours,'08:00-18:00');a.strictEqual(c.currency,'THB');")
      && t.includes('// ตั้งค่าร้าน (แก้โดยเจ้าของร้าน 12 พ.ย.)') && t.includes('// ห้ามเปลี่ยนชื่อ') && t.includes('// โปรส่งฟรี'); } },
  { name: 'data-report', about: 'อ่าน CSV แล้วสร้างไฟล์สรุป JSON ที่ตัวเลขถูก',
    files: { 'sales.csv': 'date,product,qty,price\n2026-11-01,กาแฟดริป,3,120\n2026-11-01,ชาไทย,5,45\n2026-11-02,กาแฟดริป,2,120\n2026-11-02,ครัวซองต์,4,65\n2026-11-03,ชาไทย,1,45\n' },
    prompt: 'จาก sales.csv สร้างไฟล์ summary.json เป็น object ที่ key คือชื่อสินค้า value คือยอดขายรวม (qty x price) เป็นตัวเลข และมี key "_total" เป็นยอดรวมทั้งหมด ตรวจตัวเลขให้ถูกก่อนจบ',
    check: root => { try { const d = JSON.parse(readFileSync(join(root, 'summary.json'), 'utf8')); return d['กาแฟดริป'] === 600 && d['ชาไทย'] === 270 && d['ครัวซองต์'] === 260 && d._total === 1130; } catch { return false; } } },
];

async function v1Models() {
  const r = await fetch(BASE + '/v1/models', { headers: { authorization: 'Bearer ' + KEY } }); if (!r.ok) throw new Error('GET /v1/models → HTTP ' + r.status);
  return ((await r.json()).data || []).map(m => m.id);
}
async function runCase(c, model) {
  const root = mkdtempSync(join(tmpdir(), 'kyber-live-'));
  for (const [p, t] of Object.entries(c.files)) { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); }
  const ws = new Workspace(root), map = await projectMap(root).catch(() => ({ text: '', checks: [] })), ac = new AbortController(), timer = setTimeout(() => ac.abort(), MAX_MS);
  const post = body => fetch(BASE + '/v1/chat/completions', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) });
  const messages = [{ role: 'system', content: agentSystem({ root, os: process.platform, rules: '', map: map.text || '' }) }, { role: 'user', content: c.prompt }];
  const st = { rounds: 0, tools: 0, charge: 0, pct: 0, stuck: 0, gated: 0, reviewed: 0, retries: 0 }, t0 = Date.now(); let error = '';
  try {
    await runAgent({ base: BASE + '/v1', key: KEY, model, messages, tools: AGENT_TOOLS, signal: ac.signal, maxRounds: MAX_ROUNDS, maxDurationMs: MAX_MS, callTool: (n, a) => ws.call(n, a), onStep: () => ++ws.step, spill: (t, i) => ws.spill(t, i), checks: map.checks || [],
      review: makeReviewer({ ws, model, task: c.prompt, post }),
      onEvent: e => { if (e.type === 'usage') { st.rounds++; st.charge += e.usage?.astra?.charge_thb || 0; st.pct += e.usage?.astra?.week_pct || 0; } if (e.type === 'tool') st.tools++; if (e.type === 'stats') Object.assign(st, { stuck: e.stats.stuck || 0, gated: e.stats.gated || 0, reviewed: e.stats.reviewed || 0, retries: e.stats.retries || 0 }); } });
  } catch (x) { error = String(x.message || x).slice(0, 200); } finally { clearTimeout(timer); }
  let pass = false; try { pass = !!c.check(root); } catch { pass = false; }
  return { case: c.name, model, pass, ms: Date.now() - t0, ...st, charge: Math.round(st.charge * 100) / 100, error };
}

export async function main() {
  if (!KEY) { console.log('ข้าม Live Eval: ยังไม่ได้ตั้ง KYBER_EVAL_KEY (API key ของ Kyber ที่มีเครดิต)'); return; }
  const want = process.argv.slice(2), cases = want.length ? LIVE.filter(c => want.includes(c.name)) : LIVE;
  let models = (process.env.KYBER_EVAL_MODELS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!models.length) models = (await v1Models()).filter(x => !/image|embed|video|tts|whisper/i.test(x)).slice(0, 3);
  const rows = [];
  for (const model of models) for (const c of cases) { const r = await runCase(c, model); rows.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${model}  ${c.name}  ${r.rounds} รอบ · ${Math.round(r.ms / 1000)} วิ · ฿${r.charge}${r.error ? '  ' + r.error : ''}`); }
  const by = models.map(m => { const rs = rows.filter(r => r.model === m), n = rs.filter(r => r.pass).length; return { model: m, pass: n, total: rs.length, rate: Math.round(n / rs.length * 100), rounds: Math.round(rs.reduce((s, r) => s + r.rounds, 0) / rs.length * 10) / 10, sec: Math.round(rs.reduce((s, r) => s + r.ms, 0) / rs.length / 1000), charge: Math.round(rs.reduce((s, r) => s + r.charge, 0) * 100) / 100, stuck: rs.reduce((s, r) => s + r.stuck, 0) }; });
  const md = ['## Kyber Harness · Live Eval', '', `${new Date().toISOString().slice(0, 10)} · ${cases.length} งาน × ${models.length} โมเดล · ${BASE}`, '',
    '| โมเดล | ผ่าน | รอบเฉลี่ย | เวลาเฉลี่ย | ค่าใช้จ่ายรวม | วนซ้ำ |', '|---|---|---|---|---|---|', ...by.map(b => `| ${b.model} | ${b.pass}/${b.total} (${b.rate}%) | ${b.rounds} | ${b.sec} วิ | ฿${b.charge} | ${b.stuck} |`), '',
    '| งาน | ' + models.join(' | ') + ' |', '|---|' + models.map(() => '---').join('|') + '|', ...cases.map(c => `| ${c.name} | ` + models.map(m => { const r = rows.find(x => x.model === m && x.case === c.name); return r.pass ? '✅' : '❌' + (r.error ? ' ' + r.error.slice(0, 40) : ''); }).join(' | ') + ' |')].join('\n');
  console.log('\n' + md); writeFileSync('live-eval.json', JSON.stringify({ at: Date.now(), base: BASE, by, rows }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  if (existsSync(process.env.KYBER_EVAL_HISTORY || '')) appendFileSync(process.env.KYBER_EVAL_HISTORY, JSON.stringify({ at: Date.now(), by }) + '\n');
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
