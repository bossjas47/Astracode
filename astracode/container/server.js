// โปรแกรมในเครื่องเสมือนของ Agent บนคลาวด์: รับงาน 1 งาน → วาง ไฟล์โปรเจกต์ใน /work → วน Agent ผ่าน /v1 ด้วย key ของลูกค้า → ส่งความคืบหน้า/ผลลัพธ์ให้ Durable Object มาดึง
// ไม่มีหน้าต่างขออนุญาต (ทำเองทั้งหมด) เพราะรันในเครื่องแยกที่ทิ้งหลังจบงาน · เครื่องมือชุดเดียวกับแอป ยกเว้นจับภาพหน้าเว็บ/ผู้ช่วยค้น
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const lib = process.env.AGENT_LIB || path.join(__dirname, 'app');
const { runAgent } = require(path.join(lib, 'agent'));
const { AGENT_TOOLS, SUB_TOOLS, Workspace, agentSystem, projectRules } = require(path.join(lib, 'agenttools'));
const { scanFolder } = require(path.join(lib, 'localfs'));
const COWORK_SYS = `\n\nCOWORK MODE: you are working for a non-programmer on an office task. First call todo_write with a short plan, then do the work yourself until it is done. Make deliverables as real files with make_document (.docx/.xlsx with live formulas/.pptx/.pdf) or with python (pandas, matplotlib → PNG). Use web_search / web_fetch / browser for information from the web. Use the user's connectors (tools named rmcp_..., e.g. Gmail, Google Drive/Sheets/Calendar) when the task involves their email, files or calendar; save_to_drive / email_files send finished files; look_at_image reads photos and scans; generate_image makes pictures for slides or posts. Explain progress in plain Thai when the user writes Thai; do not show code unless asked. Before deleting or overwriting the user's own uploaded files, ask with ask_user. For big research (many files or many web pages) hand parts to helpers with the task tool; several task calls in one reply run in parallel. Finish with a short summary listing the files you made.`;
const ROOT = process.env.WORK || '/work';
let OFFICE = null, BROWSER = null; // Cowork: ไฟล์ออฟฟิศ + เบราว์เซอร์ (โหลดเมื่อใช้ · ถ้าไม่มีแพ็กเกจก็ทำงานต่อได้แบบไม่มีเครื่องมือนั้น)
try { OFFICE = require(path.join(lib, 'office')); } catch {}
try { BROWSER = require('./browser'); } catch {}
const S = d => ({ type: 'string', description: d }), fnT = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
// เครื่องมือเพิ่มของ Cowork: สร้างรูป · อ่านรูป/สแกน (OCR) · ส่งไฟล์ขึ้น Drive · ส่งอีเมลแนบไฟล์ (2 อย่างหลังใช้ Google ที่ลูกค้าเชื่อมไว้บนเว็บ)
const asks = new Map(); // คำถามที่รอลูกค้าตอบ (ปุ่ม/พิมพ์ในหน้าเว็บ) id → resolve
const COWORK_TOOLS = [
  fnT('ask_user', 'Ask the user ONE question when the task is unclear or a decision is theirs (which file, which option, missing info, permission to delete/overwrite). Give 2-4 short options when you can. Waits for the answer (up to 20 minutes).', { question: S('The question, in the user\'s language'), options: { type: 'array', items: { type: 'string' }, description: '2-4 short choices (optional)' } }, ['question']),
  fnT('generate_image', 'Create a picture (illustration, banner, product shot, slide image) with the image generator and save it as a PNG in the task folder.', { prompt: S('Detailed English description'), path: S('Where to save, e.g. images/cover.png') }, ['prompt']),
  fnT('look_at_image', 'Look at an image or scanned document in the task folder (receipt, photo of a form, chart, screenshot) and get its text and description. Use it for OCR before working with the numbers.', { path: S('Image path (.png .jpg .jpeg .webp)'), question: S('What to extract, e.g. "all line items and totals as a table"') }, ['path']),
  fnT('save_to_drive', 'Upload a file from the task folder to the user\'s Google Drive (needs Google connected on the website). Office files can be converted to Google Docs/Sheets/Slides.', { path: S('File path'), convert: { type: 'boolean' } }, ['path']),
  fnT('email_files', 'Email files from the task folder as real attachments through the user\'s Gmail. Creates a DRAFT unless send=true; only send when the user clearly asked to send.', { to: S('Recipient emails, comma separated'), subject: S('Subject'), body: S('Plain text body'), paths: { type: 'array', items: { type: 'string' } }, send: { type: 'boolean' } }, ['to', 'subject', 'body']),
];
const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', html: 'text/html' };
const mimeOf = p => MIME[String(p).split('.').pop().toLowerCase()] || 'application/octet-stream';
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
  // ผู้ช่วย (sub-agent): งานค้น/อ่านแยกบทสนทนา อ่านอย่างเดียว ทำพร้อมกันได้หลายตัว (เรียก task หลายครั้งในคำตอบเดียว)
  const subagent = o.cowork ? async (title, prompt) => {
    events.push({ type: 'info', text: 'ผู้ช่วย: ' + title, t: Date.now() });
    const sub = [{ role: 'system', content: agentSystem({ root: ROOT, os: 'Linux cloud sandbox', rules: '' }) + '\n\nYou are a helper agent doing ONE research sub-task for the main agent. You can only read and search. Finish with a concise report of what you found (facts, numbers, file paths, links).' }, { role: 'user', content: prompt.slice(0, 20000) }];
    const sws = new Workspace(ROOT, { ask: async () => true, search: async q => { const r = await fetch(o.site + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.key }, body: JSON.stringify({ query: q }) }); return (await r.json()).results || []; } });
    await runAgent({ base: o.site + '/v1', key: o.key, model: o.model, messages: sub, tools: AGENT_TOOLS.filter(x => SUB_TOOLS.has(x.function.name)), callTool: (n, x) => SUB_TOOLS.has(n) ? sws.call(n, x) : 'Error: read-only helper', signal: ac.signal, maxRounds: 25 }).catch(e => sub.push({ role: 'assistant', content: 'ผู้ช่วยหยุด: ' + e.message }));
    return sub.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '(ผู้ช่วยไม่ได้รายงานอะไร)';
  } : null;
  const ws = session?.ws && o.follow ? session.ws : new Workspace(ROOT, { subagent, ask: async () => true, onTodos: t => events.push({ type: 'todos', todos: t, t: Date.now() }),
    search: async q => { const r = await fetch(o.site + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.key }, body: JSON.stringify({ query: q }) }); return (await r.json()).results || []; } });
  ws.signal = ac.signal;
  const sys = o.cowork ? agentSystem({ root: ROOT, os: 'Linux cloud sandbox (node, npm, python3 + pip, git, Chromium). This is the user\'s Cowork task folder: put every deliverable (reports, spreadsheets, slides, PDFs, charts) as real files in this folder; the user sees and downloads them from the Artifacts panel', rules: '' }) + COWORK_SYS + (o.skills ? '\n\nThe user\'s Skills (follow them whenever they apply):\n' + String(o.skills).slice(0, 30000) : '')
    : agentSystem({ root: ROOT, os: 'Linux (cloud sandbox: node, npm, python3, pip, git available; changes to files under the working folder are saved back to the user\'s project)', rules: await projectRules(ROOT) });
  const messages = o.follow && session?.messages ? session.messages : (o.history?.length ? [{ role: 'system', content: sys }, ...o.history.slice(-40)] : [{ role: 'system', content: sys }]);
  messages.push({ role: 'user', content: String(o.prompt || '').slice(0, 100000) });
  if (o.cowork) session = { messages, ws };
  const api = (p, init = {}) => fetch(o.site + p, { ...init, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.key, ...(init.headers || {}) } });
  let conn = []; // Connectors ที่ลูกค้าเชื่อมไว้บนเว็บ (Gmail, Drive, Sheets, Calendar, MCP อื่น ๆ) ผ่าน /v1/mcp · token อยู่ที่เซิร์ฟเวอร์ ไม่ลงเครื่องนี้
  if (o.cowork) try { const d = await (await api('/v1/mcp/tools')).json(); conn = (d.tools || []).slice(0, 60).map(x => ({ type: 'function', function: { name: x.name, description: x.description, parameters: x.parameters || { type: 'object', properties: {} } } })); } catch { conn = []; }
  if (o.cowork && conn.length) events.push({ type: 'info', text: 'Connectors: ' + [...new Set(conn.map(x => x.function.name.replace(/^rmcp_\d+_/, '').split('_')[0]))].slice(0, 8).join(', '), t: Date.now() });
  const gTool = suffix => conn.find(x => x.function.name.endsWith('_' + suffix))?.function.name;
  const mcpCall = async (name, args) => { const d = await (await api('/v1/mcp/call', { method: 'POST', body: JSON.stringify({ name, args }) })).json().catch(() => ({})); return String(d.text ?? d.error?.message ?? 'Error: no answer'); };
  const readB64 = async p => { const f = ws.abs(p); if (!ws.inside(f)) throw new Error('path must be inside the task folder'); const b = await fs.readFile(f); if (b.length > 15e6) throw new Error('file is over 15MB'); return b.toString('base64'); };
  const extra = o.cowork ? [...(OFFICE ? OFFICE.OFFICE_TOOLS : []), ...(BROWSER ? [BROWSER.BROWSER_TOOL] : []), ...COWORK_TOOLS, ...conn] : [];
  const call = async (n, a) => {
    if (o.cowork && OFFICE && (n === 'make_document' || n === 'read_document')) { const f = ws.abs(a.path); if (!ws.inside(f)) return 'Error: path must be inside the task folder'; return n === 'read_document' ? OFFICE.readDocument(f) : OFFICE.makeDocument(f, a, { pdf: BROWSER?.htmlToPdf }); }
    if (o.cowork && n.startsWith('rmcp_')) return mcpCall(n, a);
    if (o.cowork && n === 'ask_user') {
      const id = 'q' + Date.now(), question = String(a.question || '').slice(0, 1000), options = (Array.isArray(a.options) ? a.options : []).map(String).slice(0, 6);
      events.push({ type: 'ask', id, question, options, t: Date.now() });
      const ans = await new Promise(ok => { const tm = setTimeout(() => { asks.delete(id); ok(null); }, 20 * 60e3); asks.set(id, x => { clearTimeout(tm); ok(x); }); ac.signal.addEventListener('abort', () => { clearTimeout(tm); ok(null); }, { once: true }); });
      events.push({ type: 'answered', id, text: ans ?? '(ไม่มีคำตอบ)', t: Date.now() });
      return ans == null ? 'The user did not answer in time. Make a sensible choice, say what you assumed, and continue.' : 'The user answered: ' + ans;
    }
    if (o.cowork && n === 'generate_image') {
      const r = await api('/v1/images/generations', { method: 'POST', body: JSON.stringify({ prompt: String(a.prompt || '').slice(0, 2000), n: 1, size: '1536x1024' }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) return 'Error: ' + (d.error?.message_th || d.error?.message || 'HTTP ' + r.status);
      const it = d.data?.[0] || {}, buf = it.b64_json ? Buffer.from(it.b64_json, 'base64') : it.url ? Buffer.from(await (await fetch(it.url.startsWith('/') ? o.site + it.url : it.url)).arrayBuffer()) : null; if (!buf) return 'Error: no image returned';
      const rel = String(a.path || `images/image-${Date.now()}.png`).replace(/^\/+/, ''), f = ws.abs(rel); if (!ws.inside(f)) return 'Error: path must be inside the task folder';
      await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, buf); events.push({ type: 'shot', path: rel, t: Date.now() }); return `Saved image ${rel}`;
    }
    if (o.cowork && n === 'look_at_image') {
      const b64 = await readB64(a.path), type = mimeOf(a.path); if (!type.startsWith('image/')) return 'Error: use read_document for PDF/Office files';
      const r = await api('/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: o.model, stream: false, max_tokens: 4000, messages: [{ role: 'user', content: [{ type: 'text', text: String(a.question || 'Transcribe all text in this image exactly (keep numbers and table layout), then describe anything else important.') }, { type: 'image_url', image_url: { url: `data:${type};base64,${b64}` } }] }] }) });
      const d = await r.json().catch(() => ({})); return r.ok ? String(d.choices?.[0]?.message?.content || '(no text)') : 'Error: ' + (d.error?.message || 'HTTP ' + r.status);
    }
    if (o.cowork && n === 'save_to_drive') { const t = gTool('drive_upload_file'); if (!t) return 'Error: Google is not connected. Ask the user to connect Google on the website (Settings → Connectors), or give them the file from the Artifacts panel.'; return mcpCall(t, { name: path.basename(String(a.path)), b64: await readB64(a.path), mime: mimeOf(a.path), convert: !!a.convert }); }
    if (o.cowork && n === 'email_files') {
      const t = gTool(a.send ? 'gmail_send' : 'gmail_draft'); if (!t) return 'Error: Gmail is not connected. Ask the user to connect Google on the website (Settings → Connectors).';
      const attachments = []; for (const p of (Array.isArray(a.paths) ? a.paths : []).slice(0, 10)) attachments.push({ name: path.basename(String(p)), b64: await readB64(p), mime: mimeOf(p) });
      return mcpCall(t, { to: a.to, subject: a.subject, body: a.body, attachments });
    }
    if (o.cowork && BROWSER && n === 'browser') return BROWSER.browserTool(a, ROOT, rel => events.push({ type: 'shot', path: rel, t: Date.now() }));
    return ws.call(n, a);
  };
  runAgent({ base: o.site + '/v1', key: o.key, model: o.model, messages, tools: [...AGENT_TOOLS.filter(t => !['screenshot_url', ...(o.cowork ? [] : ['task'])].includes(t.function.name)), ...extra], callTool: call, onEvent, signal: ac.signal, maxRounds: Math.min(150, +o.maxRounds || 80), onStep: () => ++ws.step, effort: o.effort || null })
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
    if (u.pathname === '/answer' && req.method === 'POST') { const b = await body(req), f = asks.get(String(b.id)); if (f) { asks.delete(String(b.id)); f(String(b.text || '').slice(0, 4000)); } return json(res, f ? 200 : 404, { ok: !!f }); }
    if (u.pathname === '/reset' && req.method === 'POST') { session = null; await BROWSER?.closeBrowser(); return json(res, 200, { ok: true }); }
    if (u.pathname === '/run' && req.method === 'POST') { if (job?.status === 'running') return json(res, 409, { error: 'มีงานทำอยู่' }); await start(await body(req)); return json(res, 200, { ok: true }); }
    if (u.pathname === '/events') { const from = +u.searchParams.get('from') || 0; return json(res, 200, { status: job?.status || 'idle', events: job ? job.events.slice(from) : [] }); }
    if (u.pathname === '/result') return json(res, 200, job ? await result() : { status: 'idle' });
    if (u.pathname === '/stop' && req.method === 'POST') { job?.ac.abort(); return json(res, 200, { ok: true }); }
    if (u.pathname === '/health') return json(res, 200, { ok: true });
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(+process.env.PORT || 8080, () => console.log('agent box ready'));
