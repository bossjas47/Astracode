// Eval Harness ของ Kyber Harness: สถานการณ์จริงแบบออฟไลน์ (ไม่มีเน็ต/โมเดลจริง) · ใช้ตัวคุมรอบ (desktop/agent.js) และเครื่องมือจริง (desktop/agenttools.js)
// กับโฟลเดอร์ชั่วคราว · "โมเดล" เป็นสคริปต์ที่ตัดสินใจจากผลเครื่องมือล่าสุดเหมือนโมเดลจริง (ถ้า harness ไม่ส่งข้อมูลที่ถูกต้องกลับมา สคริปต์จะทำงานไม่สำเร็จ)
// รัน: node tests/bench/harness-eval.mjs [ชื่อเคส...]  → ตารางผล + JSON · exit 1 ถ้ามีเคสไม่ผ่าน · tests/harness-eval.test.mjs รันชุดเดียวกันใน npm test
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desk = process.env.KYBER_DESKTOP_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'desktop'); // KYBER_DESKTOP_DIR = เทียบกับ harness รุ่นอื่น (A/B)
const { runAgent } = require(join(desk, 'agent.js'));
const { Workspace, AGENT_TOOLS } = require(join(desk, 'agenttools.js'));

const enc = s => new TextEncoder().encode(s);
const lastTools = msgs => { const out = []; for (let i = msgs.length - 1; i >= 0 && msgs[i].role === 'tool'; i--) out.unshift(msgs[i].content); return out; };
const call = (name, args) => ({ name, args });
// โมเดลสคริปต์: policy(messages, turn) → { text } | { calls: [...] } | { status, headers } · เก็บทุกคำขอไว้ตรวจ
function mockModel(policy) {
  const requests = []; let turn = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); requests.push(body);
    if (body.stream === false) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '- เป้าหมาย: ทำงานที่ผู้ใช้สั่งให้เสร็จ\n- อ่านไฟล์ไปหลายไฟล์แล้ว' } }] }) }; // ย่อบทสนทนา
    const r = policy(body.messages, turn++) || { text: 'จบ' };
    if (r.status) return { ok: false, status: r.status, headers: new Map(Object.entries(r.headers || {})), json: async () => ({ error: { message: 'busy' } }), body: { cancel: async () => {} } };
    const ev = [];
    if (r.text) ev.push({ choices: [{ delta: { content: r.text } }] });
    (r.calls || []).forEach((c, i) => ev.push({ choices: [{ delta: { tool_calls: [{ index: i, id: `t${turn}_${i}`, type: 'function', function: { name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) } }] } }] }));
    ev.push({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: turn > 1 ? 900 : 0 } } });
    const text = ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n', cut = Math.floor(text.length / 2);
    return { ok: true, status: 200, body: (async function* () { yield enc(text.slice(0, cut)); yield enc(text.slice(cut)); })() }; // แบ่งก้อนกลางบรรทัด
  };
  return { fetchImpl, requests };
}
async function play({ files = {}, prompt = 'ทำงาน', policy, messages = null, opts = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'kyber-eval-'));
  for (const [p, c] of Object.entries(files)) { const f = join(root, p); require('fs').mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, c); }
  const ws = new Workspace(root), m = mockModel(policy), ev = [];
  const msgs = messages || [{ role: 'system', content: 'agent' }, { role: 'user', content: prompt }];
  let error = null;
  await runAgent({ base: 'http://mock/v1', key: 'k', model: 'mock', messages: msgs, tools: AGENT_TOOLS, fetchImpl: m.fetchImpl, callTool: (n, a) => ws.call(n, a), onEvent: e => ev.push(e), onStep: () => ++ws.step, spill: (t, i) => ws.spill(t, i), retryWaits: [5, 5, 5], maxRounds: 30, ...opts }).catch(e => { error = e.message; });
  const read = p => existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null;
  return { root, ws, ev, msgs, requests: m.requests, error, read, stats: ev.find(e => e.type === 'stats')?.stats || {}, final: msgs.filter(x => x.role === 'assistant' && x.content).at(-1)?.content || '' };
}

// ---------- สถานการณ์ ----------
export const CASES = [
  { name: 'bugfix-and-verify', about: 'อ่านไฟล์ → แก้บัค → รันทดสอบด้วย bash → สรุป', run: async () => {
    const r = await play({ files: { 'math.js': 'exports.add = (a, b) => a - b;\n' }, prompt: 'add() คืนค่าผิด แก้ให้ถูกแล้วทดสอบ',
      policy: (msgs, i) => {
        if (i === 0) return { calls: [call('read_file', { path: 'math.js' })] };
        if (i === 1) return /a - b/.test(lastTools(msgs)[0]) ? { calls: [call('edit_file', { path: 'math.js', old_string: 'a - b', new_string: 'a + b' })] } : { text: 'อ่านไฟล์ไม่ได้' };
        if (i === 2) return { calls: [call('bash', { command: 'node -e "console.log(require(\'./math\').add(2,3)===5?\'PASS\':\'FAIL\')"' })] };
        return { text: /PASS/.test(lastTools(msgs)[0]) ? 'แก้ math.js แล้ว ทดสอบผ่าน' : 'ทดสอบไม่ผ่าน' };
      } });
    return { pass: r.read('math.js').includes('a + b') && /ทดสอบผ่าน/.test(r.final) && !r.error, r };
  } },
  { name: 'multi-edit-atomic-recovery', about: 'multi_edit ผิดจุดเดียว → ไฟล์ไม่ถูกแตะ → อ่านใหม่แล้วแก้ครบในครั้งเดียว', run: async () => {
    const src = 'const host = "a";\nconst port = 1;\nconst debug = true;\n'; let untouched = null;
    const r = await play({ files: { 'cfg.js': src }, prompt: 'เปลี่ยน host เป็น b, port เป็น 2, debug เป็น false',
      policy: (msgs, i) => {
        if (i === 0) return { calls: [call('multi_edit', { path: 'cfg.js', edits: [{ old_string: '"a"', new_string: '"b"' }, { old_string: 'port = 9', new_string: 'port = 2' }, { old_string: 'true', new_string: 'false' }] })] };
        if (i === 1) return /ไม่ได้แก้อะไร/.test(lastTools(msgs)[0]) ? { calls: [call('read_file', { path: 'cfg.js' })] } : { text: 'งง' };
        if (i === 2) { const t = lastTools(msgs)[0]; untouched = /"a"/.test(t) && /port = 1/.test(t) && /debug = true/.test(t); } // edit แรกในชุดที่ล้มต้องไม่ถูกเขียนลงไฟล์
        if (i === 2) return { calls: [call('multi_edit', { path: 'cfg.js', edits: [{ old_string: '"a"', new_string: '"b"' }, { old_string: 'port = 1', new_string: 'port = 2' }, { old_string: 'true', new_string: 'false' }] })] };
        return { text: 'แก้ครบ 3 จุด' };
      } });
    return { pass: untouched === true && r.read('cfg.js') === 'const host = "b";\nconst port = 2;\nconst debug = false;\n', r };
  } },
  { name: 'syntax-guard-after-edit', about: 'เขียน JSON พัง → harness แจ้ง [syntax error] ทันที → โมเดลแก้จนถูก', run: async () => {
    const r = await play({ files: { 'package.json': '{"name":"x"}' }, prompt: 'เพิ่ม script test',
      policy: (msgs, i) => {
        if (i === 0) return { calls: [call('write_file', { path: 'package.json', content: '{"name":"x","scripts":{"test":"node t.js",}}' })] };
        if (i === 1) return /\[syntax error · JSON\]/.test(lastTools(msgs)[0]) ? { calls: [call('write_file', { path: 'package.json', content: '{"name":"x","scripts":{"test":"node t.js"}}' })] } : { text: 'เสร็จแล้ว (ไม่รู้ว่าไฟล์พัง)' };
        return { text: /syntax error/.test(lastTools(msgs)[0]) ? 'ยังพัง' : 'เพิ่ม script แล้ว JSON ถูกต้อง' };
      } });
    let ok = false; try { ok = JSON.parse(r.read('package.json')).scripts.test === 'node t.js'; } catch { ok = false; }
    return { pass: ok && /ถูกต้อง/.test(r.final), r };
  } },
  { name: 'stuck-loop-escape', about: 'วน grep เดิมซ้ำ → harness เตือนครั้งเดียว → เปลี่ยนไปใช้ glob แล้วเจอ', run: async () => {
    const r = await play({ files: { 'src/deep/UserService.ts': 'export class UserService {}' }, prompt: 'หา UserService',
      policy: msgs => {
        const out = lastTools(msgs).join('\n');
        if (/UserService\.ts/.test(out)) return { text: 'อยู่ที่ src/deep/UserService.ts' };
        if (/\[Kyber Harness\]/.test(out)) return { calls: [call('glob', { pattern: '**/*Service*' })] };
        return { calls: [call('grep', { pattern: 'class UserServiceImpl' })] }; // ค้นผิดซ้ำไปเรื่อย ๆ จนกว่าจะถูกเตือน
      } });
    return { pass: /src\/deep\/UserService\.ts/.test(r.final) && r.stats.stuck === 1 && r.stats.rounds <= 6, r };
  } },
  { name: 'flaky-provider', about: '429 (Retry-After) + 503 กลางงาน → รอแล้วทำรอบเดิมต่อ ไม่ทิ้งงาน', run: async () => {
    const r = await play({ files: { 'a.txt': 'hello' }, prompt: 'อ่าน a.txt',
      policy: (msgs, i) => [{ status: 429, headers: { 'retry-after': '0' } }, { calls: [call('read_file', { path: 'a.txt' })] }, { status: 503 }, { status: 502 }][i] || { text: /hello/.test(lastTools(msgs)[0]) ? 'ในไฟล์เขียนว่า hello' : '?' } });
    return { pass: /hello/.test(r.final) && r.stats.retries === 3 && !r.error, r };
  } },
  { name: 'long-output-spill', about: 'ผลคำสั่งยาว 20,000 บรรทัด → เก็บลงไฟล์ ส่งแค่หัว/ท้าย → โมเดล grep ไฟล์นั้นหาบรรทัด error', run: async () => {
    const r = await play({ files: {}, prompt: 'รัน build แล้วหา error',
      policy: msgs => {
        const out = lastTools(msgs)[0] || '';
        if (!out) return { calls: [call('bash', { command: 'node -e "for(let i=1;i<=20000;i++)console.log(i===13337?\'ERROR at step \'+i:\'ok \'+i)"' })] };
        const p = out.match(/เก็บไว้ที่ (\.kyber-tmp\/\S+\.txt)/)?.[1];
        if (p) return { calls: [call('grep', { pattern: '^ERROR', path: p })] };
        const hit = out.match(/ERROR at step (\d+)/); return { text: hit ? 'เจอ error ที่ขั้น ' + hit[1] : 'ไม่เจอ' };
      } });
    const first = r.msgs.find(m => m.role === 'tool')?.content || '';
    return { pass: /13337/.test(r.final) && first.length < 12000 && r.requests.every(q => JSON.stringify(q).length < 60000), r };
  } },
  { name: 'crash-resume', about: 'แอปปิดกลางรอบ (tool_call ค้างไม่มีผล) → harness ซ่อมประวัติ → โมเดลตรวจไฟล์ก่อนทำต่อ ไม่เขียนซ้ำมั่ว', run: async () => {
    const messages = [{ role: 'system', content: 'agent' }, { role: 'user', content: 'สร้าง out.txt' }, { role: 'assistant', content: null, tool_calls: [{ id: 'old1', type: 'function', function: { name: 'write_file', arguments: '{"path":"out.txt","content":"v1"}' } }] }, { role: 'user', content: 'ทำต่อ' }];
    const r = await play({ files: { 'out.txt': 'v1' }, messages,
      policy: (msgs, i) => {
        if (i === 0) return msgs.some(m => m.role === 'tool' && m.tool_call_id === 'old1' && /interrupted/.test(m.content)) ? { calls: [call('read_file', { path: 'out.txt' })] } : { text: 'ประวัติเสีย' };
        return { text: /v1/.test(lastTools(msgs)[0]) ? 'out.txt มีอยู่แล้ว ไม่ต้องเขียนซ้ำ' : 'เขียนใหม่' };
      } });
    return { pass: /ไม่ต้องเขียนซ้ำ/.test(r.final) && r.ev.some(e => e.type === 'info' && /ค้าง/.test(e.text)), r };
  } },
  { name: 'secret-hygiene', about: 'อ่าน .env ที่มี key → key ไม่หลุดไปถึงโมเดลในคำขอใด ๆ', run: async () => {
    const secret = 'sk-ant-api03-' + 'Q'.repeat(48), gh = 'ghp_' + 'Z'.repeat(36);
    const r = await play({ files: { '.env': `ANTHROPIC_KEY=${secret}\nGITHUB_TOKEN=${gh}\nPORT=3000\n` }, prompt: 'ดูว่า .env ตั้ง PORT เท่าไร',
      policy: (msgs, i) => i === 0 ? { calls: [call('bash', { command: 'cat .env' })] } : { text: /PORT=3000/.test(lastTools(msgs)[0]) ? 'PORT คือ 3000' : '?' } });
    const sent = JSON.stringify(r.requests);
    return { pass: /3000/.test(r.final) && !sent.includes(secret) && !sent.includes(gh) && /\[ซ่อน\]/.test(sent), r };
  } },
  { name: 'parallel-read-serial-write', about: 'อ่าน 4 ไฟล์ + เขียน 1 ไฟล์ในรอบเดียว → อ่านพร้อมกัน เขียนตามลำดับ ผลเรียงตามคำขอ', run: async () => {
    const files = Object.fromEntries(['a', 'b', 'c', 'd'].map(x => [`${x}.txt`, x.toUpperCase()]));
    const r = await play({ files, prompt: 'รวมไฟล์',
      policy: (msgs, i) => {
        if (i === 0) return { calls: [call('read_file', { path: 'a.txt' }), call('read_file', { path: 'b.txt' }), call('write_file', { path: 'ab.txt', content: 'AB' }), call('read_file', { path: 'c.txt' }), call('read_file', { path: 'd.txt' })] };
        const outs = lastTools(msgs); return { text: outs.length === 5 && /A/.test(outs[0]) && /B/.test(outs[1]) && /เขียน ab\.txt/.test(outs[2]) && /C/.test(outs[3]) && /D/.test(outs[4]) ? 'ลำดับถูกต้อง' : 'ลำดับผิด ' + outs.map(o => o.slice(0, 12)).join('|') };
      } });
    return { pass: r.final === 'ลำดับถูกต้อง' && r.read('ab.txt') === 'AB', r };
  } },
  { name: 'compaction-keeps-state', about: 'บทสนทนายาวจนต้องย่อ → รายการงาน/ไฟล์ที่แก้/error ค้าง ยังอยู่หลังย่อ → ทำงานต่อจนจบ', run: async () => {
    const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.txt`, `file ${i} `.repeat(400)]));
    const r = await play({ files, prompt: 'ทำทีละไฟล์', opts: { compactAt: 9000 },
      policy: (msgs, i) => {
        if (i === 0) return { calls: [call('todo_write', { todos: [{ content: 'อ่านทุกไฟล์', status: 'in_progress' }, { content: 'เขียน summary.txt', status: 'pending' }] })] };
        if (i === 1) return { calls: [call('write_file', { path: 'notes.txt', content: 'start' })] };
        if (i === 2) return { calls: [call('bash', { command: 'exit 3' })] };
        if (i < 9) return { calls: [call('read_file', { path: `f${i - 3}.txt` })] };
        const kept = msgs.find(m => typeof m.content === 'string' && m.content.includes('[สถานะงานที่ต้องคงไว้]'))?.content || '';
        return { text: /อ่านทุกไฟล์/.test(kept) && /notes\.txt/.test(kept) && /exit 3/.test(kept) ? 'สถานะครบหลังย่อ' : 'สถานะหาย' };
      } });
    return { pass: r.final === 'สถานะครบหลังย่อ' && r.ev.some(e => e.type === 'info' && /ย่อ/.test(e.text)), r };
  } },
];

export async function runEval(names = []) {
  const results = [];
  for (const c of CASES.filter(c => !names.length || names.includes(c.name))) {
    const t0 = Date.now(); let pass = false, r = null, err = null;
    try { ({ pass, r } = await c.run()); } catch (e) { err = e.message; }
    results.push({ name: c.name, pass, ms: Date.now() - t0, rounds: r?.stats?.rounds ?? null, tools: r?.stats?.toolCalls ?? null, toolErrors: r?.stats?.toolErrors ?? null, retries: r?.stats?.retries ?? null, stuck: r?.stats?.stuck ?? null, cacheHit: r?.stats?.cacheHit ?? null, error: err || r?.error || null, final: r?.final?.slice(0, 80) || null });
  }
  return { passed: results.filter(x => x.pass).length, total: results.length, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = await runEval(process.argv.slice(2));
  console.table(out.results.map(({ name, pass, ms, rounds, tools, toolErrors, retries, stuck }) => ({ name, pass: pass ? 'PASS' : 'FAIL', ms, rounds, tools, toolErrors, retries, stuck })));
  console.log(JSON.stringify({ passed: out.passed, total: out.total }));
  for (const x of out.results.filter(x => !x.pass)) console.log('FAIL', x.name, x.error || '', x.final || '');
  process.exit(out.passed === out.total ? 0 : 1);
}
