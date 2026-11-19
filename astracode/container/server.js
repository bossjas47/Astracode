// โปรแกรมในเครื่องเสมือนของ Agent บนคลาวด์: รับงาน 1 งาน → วาง ไฟล์โปรเจกต์ใน /work → วน Agent ผ่าน /v1 ด้วย key ของลูกค้า → ส่งความคืบหน้า/ผลลัพธ์ให้ Durable Object มาดึง
// ไม่มีหน้าต่างขออนุญาต (ทำเองทั้งหมด) เพราะรันในเครื่องแยกที่ทิ้งหลังจบงาน · เครื่องมือชุดเดียวกับแอป ยกเว้นจับภาพหน้าเว็บ/ผู้ช่วยค้น
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const lib = process.env.AGENT_LIB || path.join(__dirname, 'app');
const { runAgent } = require(path.join(lib, 'agent'));
const { AGENT_TOOLS, Workspace, agentSystem, projectRules } = require(path.join(lib, 'agenttools'));
const { scanFolder } = require(path.join(lib, 'localfs'));
const ROOT = process.env.WORK || '/work';

let job = null; // { status: running|done|error, events, final, error, ac, before: Map }
const json = (res, code, d) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', d => { b += d; if (b.length > 30e6) { no(new Error('ใหญ่เกิน')); req.destroy(); } }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); });

async function start(o) {
  await fs.rm(ROOT, { recursive: true, force: true }); await fs.mkdir(ROOT, { recursive: true });
  const before = new Map();
  for (const f of (o.files || []).slice(0, 1000)) {
    const p = path.resolve(ROOT, String(f.path)); if (!p.startsWith(ROOT + path.sep)) continue;
    await fs.mkdir(path.dirname(p), { recursive: true });
    const m = /^data:[\w/.+-]+;base64,(.*)$/s.exec(f.content || ''); await fs.writeFile(p, m ? Buffer.from(m[1], 'base64') : String(f.content ?? '')); before.set(String(f.path), String(f.content ?? ''));
  }
  const ac = new AbortController(), events = []; job = { status: 'running', events, before, ac, final: '', error: null };
  let text = ''; // รวมตัวหนังสือที่สตรีมมาเป็นก้อนเดียว ไม่ให้เหตุการณ์บวม
  let th = ''; const flushTh = () => { if (th) { events.push({ type: 'think', text: th.slice(0, 6000), t: Date.now() }); th = ''; } };
  const onEvent = e => { if (e.type === 'think') { th += e.text; return; } flushTh(); if (e.type === 'delta') { text += e.text; return; } if (e.type === 'text_end' && text) { events.push({ type: 'text', text: text.slice(0, 4000), t: Date.now() }); job.final = text; text = ''; return; } if (['tool', 'tool_result', 'todos', 'usage', 'info'].includes(e.type)) events.push({ ...e, preview: e.preview?.slice(0, 1500), t: Date.now() }); };
  const ws = new Workspace(ROOT, { ask: async () => true, onTodos: t => events.push({ type: 'todos', todos: t, t: Date.now() }),
    search: async q => { const r = await fetch(o.site + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.key }, body: JSON.stringify({ query: q }) }); return (await r.json()).results || []; } });
  ws.signal = ac.signal;
  const messages = [{ role: 'system', content: agentSystem({ root: ROOT, os: 'Linux (cloud sandbox: node, npm, python3, pip, git available; changes to files under the working folder are saved back to the user\'s project)', rules: await projectRules(ROOT) }) }, { role: 'user', content: String(o.prompt || '').slice(0, 100000) }];
  runAgent({ base: o.site + '/v1', key: o.key, model: o.model, messages, tools: AGENT_TOOLS.filter(t => !['screenshot_url', 'task'].includes(t.function.name)), callTool: (n, a) => ws.call(n, a), onEvent, signal: ac.signal, maxRounds: Math.min(150, +o.maxRounds || 80), onStep: () => ++ws.step, effort: o.effort || null })
    .then(() => { if (text) { events.push({ type: 'text', text: text.slice(0, 4000), t: Date.now() }); job.final = text; } job.status = 'done'; })
    .catch(e => { job.error = ac.signal.aborted ? 'หยุดแล้ว' : String(e.message).slice(0, 500); job.status = 'error'; })
    .finally(() => ws.stopAll());
}

// ไฟล์ที่เปลี่ยน: สแกนโฟลเดอร์ (กฎเดียวกับแอป: ข้าม node_modules/dist/ไบนารี) แล้วเทียบกับตอนเริ่ม
async function result() {
  const { files, skipped } = await scanFolder(ROOT), now = new Map(files.map(f => [f.path, f.content])), skip = new Set(skipped);
  const changed = files.filter(f => job.before.get(f.path) !== f.content), deleted = [...job.before.keys()].filter(p => !now.has(p) && !skip.has(p));
  return { status: job.status, error: job.error, final: job.final, changed, deleted };
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/run' && req.method === 'POST') { if (job?.status === 'running') return json(res, 409, { error: 'มีงานทำอยู่' }); await start(await body(req)); return json(res, 200, { ok: true }); }
    if (u.pathname === '/events') { const from = +u.searchParams.get('from') || 0; return json(res, 200, { status: job?.status || 'idle', events: job ? job.events.slice(from) : [] }); }
    if (u.pathname === '/result') return json(res, 200, job ? await result() : { status: 'idle' });
    if (u.pathname === '/stop' && req.method === 'POST') { job?.ac.abort(); return json(res, 200, { ok: true }); }
    if (u.pathname === '/health') return json(res, 200, { ok: true });
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(+process.env.PORT || 8080, () => console.log('agent box ready'));
