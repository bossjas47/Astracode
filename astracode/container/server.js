// โปรแกรมในเครื่องเสมือนของ Agent บนคลาวด์: รับงาน 1 งาน → วาง ไฟล์โปรเจกต์ใน /work → วน Agent ผ่าน /v1 ด้วย key ของลูกค้า → ส่งความคืบหน้า/ผลลัพธ์ให้ Durable Object มาดึง
// ไม่มีหน้าต่างขออนุญาต (ทำเองทั้งหมด) เพราะรันในเครื่องแยกที่ทิ้งหลังจบงาน · เครื่องมือชุดเดียวกับแอป ยกเว้นจับภาพหน้าเว็บ/ผู้ช่วยค้น
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const lib = process.env.AGENT_LIB || path.join(__dirname, 'app');
const { runAgent } = require(path.join(lib, 'agent'));
const { AGENT_TOOLS, Workspace, agentSystem, projectRules } = require(path.join(lib, 'agenttools'));
const { scanFolder } = require(path.join(lib, 'localfs'));
const COWORK_SYS = `\n\nCOWORK MODE: you are working for a non-programmer on an office task. First call todo_write with a short plan, then do the work yourself until it is done. Make deliverables as real files with make_document (.docx/.xlsx with live formulas/.pptx/.pdf) or with python (pandas, matplotlib → PNG). Use web_search / web_fetch / browser for information from the web. Explain progress in plain Thai when the user writes Thai; do not show code unless asked. Before deleting or overwriting the user's own uploaded files, ask (ask in your reply and stop). Finish with a short summary listing the files you made.`;
const ROOT = process.env.WORK || '/work';
let OFFICE = null, BROWSER = null; // Cowork: ไฟล์ออฟฟิศ + เบราว์เซอร์ (โหลดเมื่อใช้ · ถ้าไม่มีแพ็กเกจก็ทำงานต่อได้แบบไม่มีเครื่องมือนั้น)
try { OFFICE = require(path.join(lib, 'office')); } catch {}
try { BROWSER = require('./browser'); } catch {}
let session = null; // Cowork: บทสนทนาต่อเนื่องหลายข้อความในเครื่องเดียว { messages, ws, cowork }

let job = null; // { status: running|done|error, events, final, error, ac, before: Map }
const json = (res, code, d) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', d => { b += d; if (b.length > 30e6) { no(new Error('ใหญ่เกิน')); req.destroy(); } }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); });

async function putFiles(files, before) {
  for (const f of (files || []).slice(0, 1000)) {
    const p = path.resolve(ROOT, String(f.path)); if (!p.startsWith(ROOT + path.sep)) continue;
    await fs.mkdir(path.dirname(p), { recursive: true });
    const m = /^data:[\w/.+-]+;base64,(.*)$/s.exec(f.content || ''); await fs.writeFile(p, m ? Buffer.from(m[1], 'base64') : String(f.content ?? '')); before?.set(String(f.path), String(f.content ?? ''));
  }
}
async function start(o) {
  const follow = o.cowork && o.follow && session; // ข้อความถัดไปของงานเดิม: ใช้ไฟล์และบทสนทนาเดิมในเครื่อง
  if (!follow) { await fs.rm(ROOT, { recursive: true, force: true }); await fs.mkdir(ROOT, { recursive: true }); }
  const before = new Map();
  if (follow) { await putFiles(o.files, null); return turn(o, before); }
  await putFiles(o.files, before);
  return turn(o, before);
}
async function turn(o, before) {
  const ac = new AbortController(), events = []; job = { status: 'running', events, before, ac, final: '', error: null, cowork: !!o.cowork };
  let text = ''; // รวมตัวหนังสือที่สตรีมมาเป็นก้อนเดียว ไม่ให้เหตุการณ์บวม
  let th = ''; const flushTh = () => { if (th) { events.push({ type: 'think', text: th.slice(0, 6000), t: Date.now() }); th = ''; } };
  const onEvent = e => { if (e.type === 'think') { th += e.text; return; } flushTh(); if (e.type === 'delta') { text += e.text; return; } if (e.type === 'text_end' && text) { events.push({ type: 'text', text: text.slice(0, 4000), t: Date.now() }); job.final = text; text = ''; return; } if (['tool', 'tool_result', 'todos', 'usage', 'info'].includes(e.type)) events.push({ ...e, preview: e.preview?.slice(0, 1500), t: Date.now() }); };
  const ws = session?.ws && o.follow ? session.ws : new Workspace(ROOT, { ask: async () => true, onTodos: t => events.push({ type: 'todos', todos: t, t: Date.now() }),
    search: async q => { const r = await fetch(o.site + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.key }, body: JSON.stringify({ query: q }) }); return (await r.json()).results || []; } });
  ws.signal = ac.signal;
  const sys = o.cowork ? agentSystem({ root: ROOT, os: 'Linux cloud sandbox (node, npm, python3 + pip, git, Chromium). This is the user\'s Cowork task folder: put every deliverable (reports, spreadsheets, slides, PDFs, charts) as real files in this folder; the user sees and downloads them from the Artifacts panel', rules: '' }) + COWORK_SYS
    : agentSystem({ root: ROOT, os: 'Linux (cloud sandbox: node, npm, python3, pip, git available; changes to files under the working folder are saved back to the user\'s project)', rules: await projectRules(ROOT) });
  const messages = o.follow && session?.messages ? session.messages : (o.history?.length ? [{ role: 'system', content: sys }, ...o.history.slice(-40)] : [{ role: 'system', content: sys }]);
  messages.push({ role: 'user', content: String(o.prompt || '').slice(0, 100000) });
  if (o.cowork) session = { messages, ws };
  const extra = o.cowork ? [...(OFFICE ? OFFICE.OFFICE_TOOLS : []), ...(BROWSER ? [BROWSER.BROWSER_TOOL] : [])] : [];
  const call = async (n, a) => {
    if (o.cowork && OFFICE && (n === 'make_document' || n === 'read_document')) { const f = ws.abs(a.path); if (!ws.inside(f)) return 'Error: path must be inside the task folder'; return n === 'read_document' ? OFFICE.readDocument(f) : OFFICE.makeDocument(f, a, { pdf: BROWSER?.htmlToPdf }); }
    if (o.cowork && BROWSER && n === 'browser') return BROWSER.browserTool(a, ROOT, rel => events.push({ type: 'shot', path: rel, t: Date.now() }));
    return ws.call(n, a);
  };
  runAgent({ base: o.site + '/v1', key: o.key, model: o.model, messages, tools: [...AGENT_TOOLS.filter(t => !['screenshot_url', 'task'].includes(t.function.name)), ...extra], callTool: call, onEvent, signal: ac.signal, maxRounds: Math.min(150, +o.maxRounds || 80), onStep: () => ++ws.step, effort: o.effort || null })
    .then(() => { if (text) { events.push({ type: 'text', text: text.slice(0, 4000), t: Date.now() }); job.final = text; } job.status = 'done'; })
    .catch(e => { job.error = ac.signal.aborted ? 'หยุดแล้ว' : String(e.message).slice(0, 500); job.status = 'error'; })
    .finally(() => { if (!o.cowork) ws.stopAll(); });
}

// ไฟล์ที่เปลี่ยน: สแกนโฟลเดอร์ (กฎเดียวกับแอป: ข้าม node_modules/dist/ไบนารี) แล้วเทียบกับตอนเริ่ม
const SKIPDIR = /^(node_modules|\.git|__pycache__|\.venv|venv|\.cache)$/;
async function allFiles(dir = ROOT, out = []) { // Cowork: ทุกไฟล์ในโฟลเดอร์งาน (ไฟล์ไบนารีเป็น base64) ไม่เกิน 300 ไฟล์ / ไฟล์ละ 15MB
  for (const it of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (out.length >= 300) break; const a = path.join(dir, it.name);
    if (it.isDirectory()) { if (!SKIPDIR.test(it.name)) await allFiles(a, out); continue; }
    const st = await fs.stat(a).catch(() => null); if (!st || st.size > 15e6) continue;
    const buf = await fs.readFile(a), bin = buf.includes(0) || !/\.(txt|md|csv|json|html?|css|js|py|xml|ya?ml|tsv|log|sql)$/i.test(it.name);
    out.push({ path: path.relative(ROOT, a).split(path.sep).join('/'), size: st.size, mtime: st.mtimeMs, content: bin ? 'data:application/octet-stream;base64,' + buf.toString('base64') : buf.toString('utf8') });
  }
  return out;
}
async function result() {
  if (session && job.cowork) return { status: job.status, error: job.error, final: job.final, files: await allFiles() };
  const { files, skipped } = await scanFolder(ROOT), now = new Map(files.map(f => [f.path, f.content])), skip = new Set(skipped);
  const changed = files.filter(f => job.before.get(f.path) !== f.content), deleted = [...job.before.keys()].filter(p => !now.has(p) && !skip.has(p));
  return { status: job.status, error: job.error, final: job.final, changed, deleted };
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/reset' && req.method === 'POST') { session = null; await BROWSER?.closeBrowser(); return json(res, 200, { ok: true }); }
    if (u.pathname === '/run' && req.method === 'POST') { if (job?.status === 'running') return json(res, 409, { error: 'มีงานทำอยู่' }); await start(await body(req)); return json(res, 200, { ok: true }); }
    if (u.pathname === '/events') { const from = +u.searchParams.get('from') || 0; return json(res, 200, { status: job?.status || 'idle', events: job ? job.events.slice(from) : [] }); }
    if (u.pathname === '/result') return json(res, 200, job ? await result() : { status: 'idle' });
    if (u.pathname === '/stop' && req.method === 'POST') { job?.ac.abort(); return json(res, 200, { ok: true }); }
    if (u.pathname === '/health') return json(res, 200, { ok: true });
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(+process.env.PORT || 8080, () => console.log('agent box ready'));
