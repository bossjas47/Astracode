// เครื่องมือของ agent (แบบ Claude Code): อ่าน/เขียน/แก้ไฟล์, ค้นไฟล์, เทอร์มินัลที่จำโฟลเดอร์ปัจจุบัน, งานเบื้องหลัง, เว็บ, รายการงาน
// สิทธิ์: อ่านในโฟลเดอร์งานได้เลย · แก้ไฟล์/รันคำสั่งตามโหมดที่ผู้ใช้เลือก · แตะนอกโฟลเดอร์งานต้องถามทุกครั้ง · คำสั่งอันตรายถามเสมอ (ตัดสินใน main.js)
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { runCmd, isDanger } = require('./tools');
const { androidTools } = require('./android');

const SKIP = /^(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.venv|venv|__pycache__|\.cache|target|vendor)$/i;
const fn = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const S = d => ({ type: 'string', description: d }), N = d => ({ type: 'number', description: d }), B = d => ({ type: 'boolean', description: d });

const AGENT_TOOLS = [
  fn('read_file', 'Read a text file. Returns lines prefixed with line numbers. Use offset/limit for big files.', { path: S('File path, relative to the working folder or absolute'), offset: N('First line (1-based)'), limit: N('Number of lines, default 2000') }, ['path']),
  fn('write_file', 'Create or overwrite a file with the full content. Prefer edit_file for changes to existing files. For a big file (more than ~300 lines) write it in parts: the first call creates it, the next calls use append=true to add the following parts, so no single call gets cut off.', { path: S('File path'), content: S('Full file content, or the next part when append=true'), append: { type: 'boolean', description: 'true = add content to the end of the file instead of overwriting (write big files in parts)' } }, ['path', 'content']),
  fn('edit_file', 'Replace exact text in a file. old_string must appear exactly once (include surrounding lines) unless replace_all is true. Read the file first.', { path: S('File path'), old_string: S('Exact existing text'), new_string: S('Replacement text'), replace_all: B('Replace every occurrence') }, ['path', 'old_string', 'new_string']),
  fn('list_dir', 'List files and folders in a directory.', { path: S('Folder path, "." for the working folder') }),
  fn('glob', 'Find files by name pattern, e.g. "**/*.js" or "src/**/test_*.py".', { pattern: S('Glob pattern'), path: S('Folder to search, default the working folder') }, ['pattern']),
  fn('grep', 'Search file contents with a regular expression. Returns path:line: text (max 200 hits).', { pattern: S('Regular expression'), path: S('Folder or file, default the working folder'), glob: S('Only files matching this glob, e.g. "*.ts"'), ignore_case: B('Case-insensitive') }, ['pattern']),
  fn('bash', 'Run a shell command (Windows: cmd.exe; Mac/Linux: sh) in the current folder. The current folder is remembered between calls (cd works). No keyboard input: use -y/--yes. Default timeout 120 s, max 600 s. Use background=true for dev servers and watchers, then bash_output to read their output.', { command: S('Command to run'), timeout_s: N('Timeout in seconds'), background: B('Run in the background and return an id') }, ['command']),
  fn('bash_output', 'Read new output of a background command started with bash background=true.', { id: S('Background command id') }, ['id']),
  fn('kill_bash', 'Stop a background command.', { id: S('Background command id') }, ['id']),
  fn('web_fetch', 'Download a web page or file as text (HTML is converted to text). Max 40,000 characters.', { url: S('http(s) URL') }, ['url']),
  fn('web_search', 'Search the web. Returns titles, URLs and snippets.', { query: S('Search query') }, ['query']),
  fn('screenshot_url', 'Open a web page (e.g. your dev server http://localhost:5173) in a hidden browser and look at a screenshot of it, to check the UI visually.', { url: S('http(s) URL'), width: N('Viewport width, default 1280') }, ['url']),
  fn('task', 'Hand a self-contained research sub-task to a helper agent that can only read files and search (no edits, no commands). Several task calls in one reply run in parallel. Returns the helper\'s report.', { description: S('3-6 word title'), prompt: S('Full instructions: what to find and what to report back') }, ['description', 'prompt']),
  fn('android_tools', 'Prepare tools for Android APK work (apktool to decode/rebuild, jadx to read Java, a signer) and get the exact commands. Downloads/installs what is missing the first time. Call this before working on any .apk file.', {}),
  fn('multi_edit', 'Make several exact replacements in ONE file atomically: every edit must match or nothing is written. Edits apply in order, each on the result of the previous one. Prefer this over many edit_file calls on the same file.', { path: S('File path'), edits: { type: 'array', description: 'Replacements, applied in order', items: { type: 'object', properties: { old_string: S('Exact existing text'), new_string: S('Replacement text'), replace_all: B('Replace every occurrence') }, required: ['old_string', 'new_string'] } } }, ['path', 'edits']),
  fn('git_inspect', 'Read-only git information for the working folder (never changes the repo): status, diff (working tree, or staged=true), log, or show a commit. Use it to review your own changes before you finish.', { op: { type: 'string', enum: ['status', 'diff', 'log', 'show'], description: 'What to show' }, path: S('Limit to this file or folder'), staged: B('diff: show staged changes'), ref: S('Commit/branch, e.g. HEAD~1 (show, log, or diff against it)'), limit: N('log: number of commits, default 20') }, ['op']),
  fn('check_syntax', 'Check one file for syntax errors without running it: JavaScript (node --check), JSON, Python (ast). TypeScript/JSX use the project\'s own typescript package when installed. Files you edit are checked automatically; use this for other files.', { path: S('File path') }, ['path']),
  fn('check_page', 'Open a local HTML file (or http URL) in a real browser, wait for it to render, and return the console errors plus a screenshot. Use it to verify web pages, games and three.js 3D scenes after you write them; fix every error and blank screen it reports.', { path: S('HTML file in the project, e.g. index.html (or a full http URL)'), wait_ms: N('Extra wait for animations/models to load, default 1500') }, ['path']),
  fn('notes', 'Your working memory for this task. action=add saves a short note (decision, file role, command that works, what is left); action=list shows all notes. Notes are kept even when the conversation is summarized.', { action: { type: 'string', enum: ['add', 'list'] }, text: S('For add: the note (one or two lines)') }, ['action']),
  fn('todo_write', 'Keep a short task list for multi-step work; the user sees it live. Send the whole list each time.', { todos: { type: 'array', items: { type: 'object', properties: { content: S('Task'), status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } }, required: ['content', 'status'] } } }, ['todos']),
];
const KIND = { read_file: 'read', list_dir: 'read', glob: 'read', grep: 'read', web_fetch: 'net', web_search: 'net', screenshot_url: 'net', task: 'none', todo_write: 'none', notes: 'none', check_page: 'read', android_tools: 'bash', bash_output: 'none', kill_bash: 'none', write_file: 'edit', edit_file: 'edit', multi_edit: 'edit', bash: 'bash', git_inspect: 'read', check_syntax: 'read' };
const READ_ONLY = new Set(['read_file', 'list_dir', 'glob', 'grep', 'git_inspect', 'check_syntax', 'web_fetch', 'web_search', 'screenshot_url', 'todo_write', 'task', 'notes', 'check_page']); // โหมดวางแผน
const SUB_TOOLS = new Set(['read_file', 'list_dir', 'glob', 'grep', 'git_inspect', 'check_syntax', 'web_fetch', 'web_search']); // ผู้ช่วยค้น (subagent)
// ถามผู้ใช้ (ใช้ร่วมกันในแอป: main.js จัดการคำตอบเอง · เครื่องเสมือนบนคลาวด์มีของตัวเองใน COWORK_TOOLS)
const ASK_TOOL = fn('ask_user', 'Ask the user ONE question when the task is unclear or a decision is theirs (which file, which option, missing info). Prefer 2-4 short options. Waits for the answer. Do not ask about things you can find out yourself.', { question: S('The question, in the user\'s language'), options: { type: 'array', items: { type: 'string' }, description: '2-4 short choices (optional)' } }, ['question']);
const TS_EXT = /\.(tsx?|mts|cts|jsx)$/i, JS_EXT = /\.(c|m)?js$/i;
// ไฟล์ .js ที่มี JSX (React แบบเก่า): node --check จะฟ้องผิดทั้งที่ถูก → ไม่ตรวจอัตโนมัติ
const looksJsx = t => /(return|=>|=)\s*\(?\s*<[A-Za-z>]|<\/[A-Za-z][\w.]*>|\/>\s*[)\n;,]/.test(t);
// รันโปรแกรมแบบไม่ผ่าน shell (argument ไม่ถูกตีความ) · missing = ไม่มีโปรแกรมนี้ในเครื่อง
const execRun = (cmd, args, opt = {}) => new Promise(ok => execFile(cmd, args, { timeout: 20e3, maxBuffer: 8e6, windowsHide: true, ...opt }, (e, stdout, stderr) => ok({ code: e ? (typeof e.code === 'number' ? e.code : -1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), missing: e?.code === 'ENOENT' })));
const nodeEnv = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: '1' }); // ในแอป Electron: process.execPath = Electron → สั่งให้ทำตัวเป็น node
let pyBin = null; // หา python ครั้งเดียวต่อโปรเซส
const findPython = () => pyBin ||= (async () => { for (const c of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) { const r = await execRun(c, ['--version'], { timeout: 8e3 }); if (!r.missing && r.code === 0) return c; } return ''; })();
// แก้ข้อความหลายจุดในเนื้อไฟล์ (ใช้ทั้ง edit_file และ multi_edit) · คืน { text, count } หรือ { error } โดยไม่แตะไฟล์
function applyEdits(t, edits) {
  const crlf = t.includes('\r\n'), fix = s => crlf ? String(s ?? '').replace(/\r?\n/g, '\r\n') : String(s ?? ''); let count = 0;
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] || {}, o = fix(e.old_string), n = o ? t.split(o).length - 1 : 0, at = edits.length > 1 ? `edit ${i + 1}/${edits.length}: ` : '', none = edits.length > 1 ? ' (ไม่ได้แก้อะไร ไฟล์คงเดิม)' : '';
    if (!o) return { error: `Error: ${at}old_string ว่าง${none}` };
    if (!n) return { error: `Error: ${at}ไม่เจอ old_string ในไฟล์ (อ่านไฟล์อีกครั้งแล้วคัดลอกให้ตรงทุกตัวอักษร รวมช่องว่าง)${i ? ' · ระวัง: edit ก่อนหน้าในชุดเดียวกันอาจเปลี่ยนข้อความนี้ไปแล้ว' : ''}${none}` };
    if (n > 1 && !e.replace_all) return { error: `Error: ${at}เจอ old_string ${n} จุด ใส่บรรทัดรอบๆ เพิ่มให้เหลือจุดเดียว หรือใช้ replace_all${none}` };
    t = e.replace_all ? t.split(o).join(fix(e.new_string)) : t.replace(o, () => fix(e.new_string)); count += e.replace_all ? n : 1;
  }
  return { text: t, count };
}

// diff บรรทัด (LCS) สำหรับแสดงก่อนอนุญาต/ในแชต: บรรทัดขึ้นต้น "- " = ลบ, "+ " = เพิ่ม, "  " = บรรทัดรอบๆ (ไฟล์ใหญ่มาก: สรุปจำนวนบรรทัดแทน)
function diffLines(a, b, ctx = 2, max = 160) {
  const A = String(a ?? '').split(/\r?\n/), B = String(b ?? '').split(/\r?\n/);
  if (A.length * B.length > 4e6) return `(ไฟล์ใหญ่: ${A.length} → ${B.length} บรรทัด)`;
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n || j < m) { if (i < n && j < m && A[i] === B[j]) { ops.push(['  ', A[i]]); i++; j++; } else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { ops.push(['- ', A[i]]); i++; } else { ops.push(['+ ', B[j]]); j++; } }
  if (ops.every(o => o[0] === '  ')) return '(ไม่มีอะไรเปลี่ยน)';
  const keep = ops.map((o, k) => o[0] !== '  ' || ops.slice(Math.max(0, k - ctx), k + ctx + 1).some(x => x[0] !== '  '));
  const out = []; let gap = false;
  ops.forEach((o, k) => { if (keep[k]) { out.push(o[0] + o[1]); gap = false; } else if (!gap) { out.push('  …'); gap = true; } });
  return out.length > max ? out.slice(0, max).join('\n') + `\n…(อีก ${out.length - max} บรรทัด)` : out.join('\n');
}

// glob → regex: ** = หลายชั้นโฟลเดอร์, * = ในชั้นเดียว, ? = ตัวเดียว, {a,b} = ตัวเลือก
const globRe = g => new RegExp('^' + String(g).replace(/\\/g, '/').replace(/[.+^$()|[\]]/g, '\\$&').replace(/\{([^}]+)\}/g, (_, x) => '(' + x.split(',').join('|') + ')').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?') + '$', 'i');

class Workspace {
  constructor(root, { ask = async () => true, fetchImpl = fetch, search = async () => [], onTodos = () => {}, shot = null, subagent = null, hooks = null, requireRead = true, pageCheck = null } = {}) {
    this.root = path.resolve(root); this.cwd = this.root; this.ask = ask; this.fetchImpl = fetchImpl; this.search = search; this.onTodos = onTodos;
    this.shot = shot; this.pageCheck = pageCheck; this.subagent = subagent; this.hooks = hooks; // hooks: { after_edit: "npx prettier --write {file}" } (ผู้ใช้ยืนยันแล้วใน main)
    this.hist = []; this.step = 0; this.runFrom = 0; this.bg = new Map(); this.n = 0; this.askQ = Promise.resolve();
    this.seen = new Map(); this.requireRead = requireRead; // ไฟล์ที่อ่านแล้ว → mtime ตอนอ่าน: แก้ไฟล์เดิมได้เฉพาะไฟล์ที่อ่านแล้วและยังไม่ถูกเปลี่ยนจากที่อื่น (กันโมเดลเดาเนื้อหาไฟล์)
  }
  // อ่าน/ค้นหลายอันพร้อมกันได้ แต่หน้าต่างขออนุญาตต้องขึ้นทีละอัน
  askOne(req) { const p = this.askQ.then(() => this.ask(req)); this.askQ = p.catch(() => {}); return p; }
  abs(p) { return path.resolve(this.cwd, String(p ?? '.')); }
  inside(a) { return a === this.root || a.startsWith(this.root + path.sep); }
  rel(a) { return this.inside(a) ? path.relative(this.root, a).split(path.sep).join('/') || '.' : a; }
  // ก่อนแก้ไฟล์ทุกครั้ง: เก็บเนื้อหาเดิมพร้อมเลขขั้นตอน (null = ไฟล์ใหม่ ย้อน = ลบทิ้ง) → ย้อนไปขั้นไหนก็ได้
  // diff ของทุกไฟล์ที่แก้ตั้งแต่ขั้นตอน step (เทียบเนื้อหาก่อนแก้ครั้งแรกกับตอนนี้) · ใช้ให้ผู้ตรวจรอบสองอ่าน
  async diffSince(step = this.runFrom, max = 30000) {
    const first = new Map(); for (const h of this.hist) if (h.step >= step && !first.has(h.a)) first.set(h.a, h.buf);
    let out = '';
    for (const [a, buf] of first) {
      const now = await fs.readFile(a, 'utf8').catch(() => null), before = buf === null ? '' : buf.toString('utf8');
      if (now === before) continue;
      out += `\n=== ${this.rel(a)}${buf === null ? ' (new file)' : now === null ? ' (deleted)' : ''}\n${diffLines(before, now ?? '', 3, 400)}\n`;
      if (out.length > max) { out = out.slice(0, max) + '\n…(ตัด)'; break; }
    }
    return out.trim();
  }
  async mtime(f) { const st = await fs.stat(f).catch(() => null); return st && st.isFile() ? st.mtimeMs : null; }
  async keep(a) { this.hist.push({ step: this.step, a, buf: await fs.readFile(a).catch(() => null) }); }
  async undoTo(step = this.runFrom) {
    const done = new Set();
    for (const h of this.hist.filter(x => x.step >= step).reverse()) { if (h.buf === null) await fs.rm(h.a, { force: true }); else { await fs.mkdir(path.dirname(h.a), { recursive: true }); await fs.writeFile(h.a, h.buf); } done.add(this.rel(h.a)); }
    this.hist = this.hist.filter(x => x.step < step); return [...done];
  }
  undo() { return this.undoTo(this.runFrom); }
  changed() { return [...new Set(this.hist.filter(x => x.step >= this.runFrom).map(x => this.rel(x.a)))]; }
  async walk(dir, fnv, depth = 0) {
    if (depth > 25) return; let items; try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) { const a = path.join(dir, it.name); if (it.isDirectory()) { if (!SKIP.test(it.name) && !it.name.startsWith('.')) { if (await fnv(a, true) === false) return false; if (await this.walk(a, fnv, depth + 1) === false) return false; } } else if (it.isFile() && await fnv(a, false) === false) return false; }
  }

  async call(name, a = {}) {
    let kind = KIND[name]; if (!kind) throw new Error('ไม่รู้จักเครื่องมือ ' + name);
    const target = ['read_file', 'write_file', 'edit_file', 'multi_edit', 'list_dir', 'glob', 'grep', 'git_inspect', 'check_syntax'].includes(name) ? this.abs(a.path ?? '.') : null;
    let diff = null, args = a;
    if (name === 'edit_file') diff = diffLines(a.old_string, a.new_string);
    else if (name === 'write_file' && !a.append) diff = diffLines(await fs.readFile(target, 'utf8').catch(() => ''), a.content);
    else if (name === 'multi_edit') { // ตรวจทุกจุดก่อนขออนุญาต: ไม่ผ่านจุดเดียว = ไม่แก้เลย
      if (!Array.isArray(a.edits) || !a.edits.length) return 'Error: edits ต้องเป็นรายการที่มีอย่างน้อย 1 รายการ';
      const t = await fs.readFile(target, 'utf8').catch(() => null); if (t === null) return `Error: ไม่พบไฟล์ ${this.rel(target)} (ใช้ write_file สำหรับไฟล์ใหม่)`;
      const r = applyEdits(t, a.edits.slice(0, 100)); if (r.error) return r.error; diff = diffLines(t, r.text);
    } else if (name === 'android_tools') args = { command: 'เตรียมเครื่องมือแก้ APK: apktool, jadx, uber-apk-signer (และ Java ถ้ายังไม่มี) ไว้ที่ ~/.astra/tools' };
    else if (name === 'check_syntax' && TS_EXT.test(String(a.path || ''))) { kind = 'bash'; args = { command: `ตรวจ syntax ${this.rel(target)} ด้วยแพ็กเกจ typescript ของโปรเจกต์` }; } // รันโค้ดในโปรเจกต์ → ขออนุญาตแบบคำสั่ง
    if (this.requireRead && ['edit_file', 'multi_edit', 'write_file'].includes(name) && !(name === 'write_file' && a.append && this.seen.has(target))) { // อ่านก่อนแก้: เขียนทับ/แก้ไฟล์เดิมโดยไม่ได้อ่าน = เดาเนื้อหา
      const m = await this.mtime(target);
      if (m != null && this.seen.get(target) !== m) return `Error: read ${this.rel(target)} with read_file before ${name === 'write_file' ? 'overwriting' : 'editing'} it${this.seen.has(target) ? ' (it changed since you last read it)' : ''}. Changes must be based on the file's current content, not on a guess.`;
    }
    if (!await this.askOne({ name, kind, args, outside: target ? !this.inside(target) : false, danger: name === 'bash' && isDanger(a.command), cwd: this.cwd, diff })) return 'Error: ผู้ใช้ไม่อนุญาต';
    let out = await this[name](a, target);
    if ((name === 'read_file' || name === 'write_file') && !String(out).startsWith('Error')) this.seen.set(target, await this.mtime(target)); // เขียนเองแล้ว = รู้เนื้อหา (ต่อท้าย/แก้ต่อได้)
    if (diff && !String(out).startsWith('Error')) {
      out += '\n' + diff;
      if (this.hooks?.after_edit) { const r = await runCmd(this.root, this.hooks.after_edit.replace(/\{file\}/g, JSON.stringify(target)), { timeout: 60e3, signal: this.signal }); out += `\n[hook after_edit exit ${r.code}]${(r.stdout + r.stderr).trim() ? '\n' + (r.stdout + r.stderr).trim().slice(-1500) : ''}`; }
      this.seen.set(target, await this.mtime(target)); // หลัง hook จัดรูปแบบแล้ว: แก้ต่อได้โดยไม่ต้องอ่านซ้ำ
      const syn = await this.syntax(target, { auto: true }).catch(() => ''); // ตรวจ syntax หลังแก้ทุกครั้ง: โมเดลเห็นทันทีว่าทำไฟล์พัง
      if (syn) out += '\n' + syn;
    }
    return out;
  }
  // ตรวจ syntax โดยไม่รันโค้ด · auto = หลังแก้ไฟล์: รายงานเฉพาะตอนพัง และข้ามชนิดที่ตรวจแล้วอาจฟ้องผิด (JSX ใน .js, tsconfig ที่มีคอมเมนต์, TypeScript)
  async syntax(f, { auto = false } = {}) {
    const rel = this.rel(f), name = path.basename(f).toLowerCase();
    const t = await fs.readFile(f, 'utf8').catch(() => null); if (t === null) return auto ? '' : `Error: ไม่พบไฟล์ ${rel}`;
    const bad = (how, msg) => `[syntax error · ${how}] ${rel}\n${String(msg).trim().split('\n').slice(0, 12).join('\n').slice(0, 2000)}`;
    if (name.endsWith('.json')) {
      try { JSON.parse(t.replace(/^\uFEFF/, '')); return auto ? '' : `${rel}: JSON ถูกต้อง`; } catch (e) {
        if (/^(tsconfig|jsconfig|devcontainer)|\.(code-workspace)$/.test(name) || /[\\/]\.vscode[\\/]/.test(f)) return auto ? '' : `${rel}: ไฟล์นี้เป็น JSON แบบมีคอมเมนต์ (JSONC) ตรวจด้วย JSON ธรรมดาไม่ได้: ${e.message}`;
        return bad('JSON', e.message);
      }
    }
    if (JS_EXT.test(name) && !(auto && looksJsx(t))) {
      const r = await execRun(process.execPath, ['--check', f], { env: nodeEnv() });
      if (r.code === 0) return auto ? '' : `${rel}: JavaScript ไม่มี syntax error`;
      if (looksJsx(t) && !auto) return this.tsCheck(f, rel, bad); // .js ที่มี JSX: ลองด้วย typescript ของโปรเจกต์
      return bad('node --check', (r.stderr || r.stdout).split('\n').filter(l => !/^\s+at |^Node\.js v/.test(l)).join('\n'));
    }
    if (name.endsWith('.py')) {
      const py = await findPython(); if (!py) return auto ? '' : 'Error: ไม่พบ python ในเครื่อง';
      const r = await execRun(py, ['-c', 'import ast,sys\nast.parse(open(sys.argv[1],"rb").read(),sys.argv[1])', f]);
      const lines = (r.stderr || r.stdout).split('\n'), at = lines.findIndex(l => l.includes(`File "${f}"`)); // ตัด traceback ภายในของ ast ออก เหลือบรรทัดที่ผิดในไฟล์
      return r.code === 0 ? (auto ? '' : `${rel}: Python ไม่มี syntax error`) : bad('python ast', (at >= 0 ? lines.slice(at) : lines).join('\n'));
    }
    if (TS_EXT.test(name)) return auto ? '' : this.tsCheck(f, rel, bad);
    return auto ? '' : `${rel}: ยังไม่รองรับการตรวจไฟล์ชนิดนี้ (รองรับ .js .mjs .cjs .json .py และ .ts .tsx .jsx เมื่อโปรเจกต์ติดตั้ง typescript)`;
  }
  // TypeScript/JSX: ใช้แพ็กเกจ typescript ในโปรเจกต์ (ตรวจเฉพาะ syntax ไม่ตรวจชนิด) · ไม่มี = บอกวิธีตรวจด้วย bash
  async tsCheck(f, rel, bad) {
    let ts = null; for (let d = path.dirname(f); ; d = path.dirname(d)) { const c = path.join(d, 'node_modules', 'typescript', 'lib', 'typescript.js'); if (await fs.access(c).then(() => true, () => false)) { ts = c; break; } if (d === this.root || path.dirname(d) === d || !this.inside(d)) break; }
    if (!ts) return `${rel}: โปรเจกต์ไม่มีแพ็กเกจ typescript จึงตรวจเองไม่ได้ ใช้ bash รันตัวตรวจของโปรเจกต์ (เช่น npx tsc --noEmit หรือ npm run lint)`;
    const code = 'const ts=require(process.argv[1]),f=process.argv[2],s=require("fs").readFileSync(f,"utf8");const r=ts.transpileModule(s,{fileName:f,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.Preserve,allowJs:true}});for(const d of r.diagnostics||[]){const p=d.file&&d.start!=null?d.file.getLineAndCharacterOfPosition(d.start):null;console.log((p?(p.line+1)+":"+(p.character+1)+" ":"")+ts.flattenDiagnosticMessageText(d.messageText,"\\n"))}process.exitCode=(r.diagnostics||[]).length?1:0';
    const r = await execRun(process.execPath, ['-e', code, ts, f], { env: nodeEnv(), cwd: this.root });
    return r.code === 0 ? `${rel}: ไม่มี syntax error (typescript)` : bad('typescript', r.stdout || r.stderr);
  }
  async android_tools() { return androidTools({ log: t => this.onLog?.(t) }); }
  async read_file(a, f) {
    const st = await fs.stat(f); if (st.isDirectory()) return this.list_dir(a, f);
    if (st.size > 5e6) return `Error: ไฟล์ใหญ่ ${Math.round(st.size / 1e6)}MB`;
    const buf = await fs.readFile(f); if (buf.includes(0)) return 'Error: ไม่ใช่ไฟล์ข้อความ';
    const lines = buf.toString('utf8').split(/\r?\n/), from = Math.max(1, +a.offset || 1), n = Math.min(+a.limit || 2000, 5000);
    const part = lines.slice(from - 1, from - 1 + n).map((l, i) => `${String(from + i).padStart(6)}\t${l.length > 2000 ? l.slice(0, 2000) + '…' : l}`).join('\n');
    return part + (from - 1 + n < lines.length ? `\n…(ทั้งหมด ${lines.length} บรรทัด อ่านต่อด้วย offset=${from + n})` : '') || '(ไฟล์ว่าง)';
  }
  async write_file(a, f) { await this.keep(f); await fs.mkdir(path.dirname(f), { recursive: true }); if (a.append) { await fs.appendFile(f, String(a.content ?? ''), 'utf8'); const all = await fs.readFile(f, 'utf8'); return `ต่อท้าย ${this.rel(f)} แล้ว (ตอนนี้ ${all.split('\n').length} บรรทัด)`; } await fs.writeFile(f, String(a.content ?? ''), 'utf8'); return `เขียน ${this.rel(f)} แล้ว (${String(a.content ?? '').split('\n').length} บรรทัด)`; }
  async edit_file(a, f) {
    const r = applyEdits(await fs.readFile(f, 'utf8'), [a]); if (r.error) return r.error;
    await this.keep(f); await fs.writeFile(f, r.text, 'utf8'); return `แก้ ${this.rel(f)} แล้ว ${r.count} จุด`;
  }
  async multi_edit(a, f) { // อ่านใหม่ตอนเขียน (ไฟล์อาจเปลี่ยนระหว่างรออนุญาต) แล้วเขียนครั้งเดียว
    const r = applyEdits(await fs.readFile(f, 'utf8'), a.edits.slice(0, 100)); if (r.error) return r.error;
    await this.keep(f); await fs.writeFile(f, r.text, 'utf8'); return `แก้ ${this.rel(f)} แล้ว ${r.count} จุด (${Math.min(100, a.edits.length)} edits ในครั้งเดียว)`;
  }
  async check_syntax(a, f) { return this.syntax(f); }
  // git แบบอ่านอย่างเดียว: execFile ไม่ผ่าน shell · ปิด fsmonitor/ext-diff/textconv/pager (คำสั่งภายนอกจาก config) · ref ห้ามขึ้นต้นด้วย - (กันใส่ option)
  async git_inspect(a, f) {
    const ref = a.ref == null || a.ref === '' ? '' : String(a.ref); if (ref && !/^[\w][\w./~^@{}:-]{0,120}$/.test(ref)) return 'Error: ref ไม่ถูกต้อง (เช่น HEAD~1, main, a1b2c3d)';
    const only = a.path ? ['--', f] : [], n = String(Math.min(200, Math.max(1, +a.limit || 20)));
    const ops = { status: ['status', '--short', '--branch', ...only], diff: ['diff', '--no-ext-diff', '--no-textconv', '--stat', '--patch', ...(a.staged ? ['--cached'] : []), ...(ref ? [ref] : []), ...only], log: ['log', '--oneline', '--decorate', '-n', n, ...(ref ? [ref] : []), ...only], show: ['show', '--no-ext-diff', '--no-textconv', '--stat', '--patch', ref || 'HEAD', ...only] };
    if (!ops[a.op]) return 'Error: op ต้องเป็น status, diff, log หรือ show';
    const r = await execRun('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-c', 'color.ui=never', ...ops[a.op]], { cwd: this.cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }, timeout: 30e3 });
    if (r.missing) return 'Error: ไม่พบ git ในเครื่อง';
    if (r.code) return 'Error: ' + (/not a git repository/i.test(r.stderr) ? 'โฟลเดอร์นี้ไม่ใช่ git repo' : r.stderr.trim().slice(0, 1500) || 'git exit ' + r.code);
    return r.stdout.trim() || (a.op === 'diff' ? '(ไม่มีความเปลี่ยนแปลง)' : '(ว่าง)');
  }
  // ผลเครื่องมือที่ยาวมาก: เก็บเต็มไว้ใน .kyber-tmp ของโฟลเดอร์งาน (มี .gitignore ไม่ให้หลุดเข้า git · โฟลเดอร์ขึ้นต้นด้วยจุดจึงไม่ถูกสแกน/อัปโหลด) · ไฟล์เก่ากว่า 1 วันลบทิ้ง
  async spill(text, { id = '' } = {}) {
    const dir = path.join(this.root, '.kyber-tmp'); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '.gitignore'), '*\n', { flag: 'wx' }).catch(() => {});
    if (!this.spillClean) { this.spillClean = true; for (const x of await fs.readdir(dir).catch(() => [])) { if (!x.startsWith('out-')) continue; const st = await fs.stat(path.join(dir, x)).catch(() => null); if (st && Date.now() - st.mtimeMs > 864e5) await fs.rm(path.join(dir, x), { force: true }); } }
    const f = path.join(dir, `out-${String(id).replace(/[^\w-]/g, '').slice(-24) || Date.now().toString(36)}.txt`);
    await fs.writeFile(f, String(text), 'utf8'); return this.rel(f);
  }
  async list_dir(a, d) { const items = await fs.readdir(d, { withFileTypes: true }); return items.filter(x => !['node_modules', '.git'].includes(x.name)).slice(0, 500).map(x => (x.isDirectory() ? '[dir] ' : '') + x.name).join('\n') || '(ว่าง)'; }
  async glob(a, d) {
    const re = globRe(a.pattern), hits = [];
    await this.walk(d, (f, dir) => { if (!dir && re.test(path.relative(d, f).split(path.sep).join('/'))) hits.push(this.rel(f)); return hits.length < 500; });
    return hits.join('\n') || 'ไม่พบไฟล์';
  }
  async grep(a, d) {
    let re; try { re = new RegExp(a.pattern, a.ignore_case ? 'i' : ''); } catch (e) { return 'Error: regex ไม่ถูกต้อง: ' + e.message; }
    const only = a.glob ? globRe(a.glob.includes('/') ? a.glob : '**/' + a.glob) : null, hits = [];
    const scan = async f => {
      if (only && !only.test(path.relative(d, f).split(path.sep).join('/'))) return;
      const buf = await fs.readFile(f).catch(() => null); if (!buf || buf.length > 2e6 || buf.includes(0)) return;
      buf.toString('utf8').split(/\r?\n/).forEach((l, i) => { if (hits.length < 200 && re.test(l)) hits.push(`${this.rel(f)}:${i + 1}: ${l.trim().slice(0, 240)}`); });
    };
    const st = await fs.stat(d); if (st.isFile()) await scan(d); else await this.walk(d, async (f, dir) => { if (!dir) await scan(f); return hits.length < 200; });
    return hits.join('\n') || 'ไม่พบ';
  }
  // เทอร์มินัล: จำโฟลเดอร์ปัจจุบันข้ามคำสั่ง (ต่อท้ายคำสั่งให้พิมพ์ cwd + exit code แล้วตัดออกจากผลลัพธ์)
  async bash(a) {
    const cmd = String(a.command || '').trim(); if (!cmd) return 'Error: คำสั่งว่าง';
    if (a.background) {
      const id = 'bg' + (++this.n), ac = new AbortController(), job = { out: '', read: 0, done: null, ac, cmd };
      this.bg.set(id, job);
      runCmd(this.cwd, cmd, { timeout: 0, signal: ac.signal, onOut: (k, s) => { job.out = (job.out + s).slice(-200000); } }).then(r => { job.done = r.code; });
      await new Promise(ok => setTimeout(ok, 3000));
      return `เริ่มเบื้องหลังแล้ว id=${id}\n${job.out.slice(-3000)}`;
    }
    const win = process.platform === 'win32', mark = '__ASTRA_' + Math.random().toString(36).slice(2, 8);
    // Windows: ^ ทำให้ cmd ขยาย %cd% / %errorlevel% หลังคำสั่งรันจบ (call อ่านบรรทัดซ้ำอีกรอบ)
    const wrapped = win ? `(${cmd}) & call echo ${mark}%^cd%${mark}%^errorlevel%` : `${cmd}\n__s=$?; echo "${mark}$(pwd)${mark}$__s"`;
    const r = await runCmd(this.cwd, wrapped, { timeout: Math.min(600, +a.timeout_s || 120) * 1000, signal: this.signal });
    const m = new RegExp(`${mark}(.*?)${mark}(\\d+)`).exec(r.stdout); let out = r.stdout, code = r.code;
    if (m) { out = r.stdout.replace(m[0], '').replace(/\n+$/, ''); code = +m[2]; if (m[1].trim()) this.cwd = m[1].trim(); }
    return `exit ${code}${this.cwd !== this.root ? ` · cwd ${this.cwd}` : ''}\n${out ? 'stdout:\n' + out : ''}${r.stderr ? '\nstderr:\n' + r.stderr : ''}`.trim();
  }
  async bash_output(a) { const j = this.bg.get(String(a.id)); if (!j) return 'Error: ไม่พบ id นี้'; const s = j.out.slice(j.read); j.read = j.out.length; return `${j.done != null ? `จบแล้ว exit ${j.done}` : 'ยังทำงานอยู่'}\n${s.slice(-20000) || '(ไม่มีผลลัพธ์ใหม่)'}`; }
  async kill_bash(a) { const j = this.bg.get(String(a.id)); if (!j) return 'Error: ไม่พบ id นี้'; j.ac.abort(); this.bg.delete(String(a.id)); return 'หยุดแล้ว'; }
  stopAll() { for (const j of this.bg.values()) j.ac.abort(); this.bg.clear(); }
  async web_fetch(a) {
    const u = String(a.url || ''); if (!/^https?:\/\//i.test(u)) return 'Error: ต้องเป็นลิงก์ http(s)';
    const r = await this.fetchImpl(u, { redirect: 'follow', signal: AbortSignal.timeout(20e3) }); const ct = r.headers.get('content-type') || '';
    let t = await r.text(); if (/html/i.test(ct)) t = t.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
    return `HTTP ${r.status}\n${t.trim().slice(0, 40000)}`;
  }
  async web_search(a) { const rs = await this.search(String(a.query || '')); return rs.length ? rs.map((x, i) => `[${i + 1}] ${x.title}\n${x.url}\n${x.content}`).join('\n\n') : 'ไม่พบผลลัพธ์'; }
  async screenshot_url(a) {
    if (!this.shot) return 'Error: จับภาพหน้าเว็บใช้ได้เฉพาะในแอป'; const u = String(a.url || ''); if (!/^https?:\/\//i.test(u)) return 'Error: ต้องเป็นลิงก์ http(s)';
    const r = await this.shot(u, Math.min(1920, Math.max(360, +a.width || 1280))), img = typeof r === 'string' ? r : r.image, logs = r?.logs || [];
    return { text: `ภาพหน้าจอของ ${u} (แนบด้านล่าง)${logs.length ? '\nข้อความใน console ของหน้าเว็บ:\n' + logs.join('\n') : '\nconsole ไม่มี error'}`, images: [img] };
  }
  async task(a) { if (!this.subagent) return 'Error: ไม่มีผู้ช่วย'; return await this.subagent(String(a.description || 'งานย่อย').slice(0, 60), String(a.prompt || '')); }
  async notes(a) {
    this.notesList ||= [];
    if (a.action === 'add') { const t = String(a.text || '').trim().slice(0, 500); if (!t) return 'Error: text is empty'; this.notesList.push(t); if (this.notesList.length > 40) this.notesList.shift(); return `บันทึกโน้ตแล้ว (${this.notesList.length} ข้อ)`; }
    return this.notesList.length ? this.notesList.map((x, i) => `${i + 1}. ${x}`).join('\n') : '(ยังไม่มีโน้ต)';
  }
  pinnedNotes() { return (this.notesList || []).length ? 'Your notes so far (notes tool):\n' + this.notesList.map(x => '- ' + x).join('\n') : ''; }
  async check_page(a) {
    const p = String(a.path || ''), wait = Math.min(15000, Math.max(0, +a.wait_ms || 1500));
    if (!this.pageCheck && !this.shot) return 'Error: ตรวจหน้าเว็บด้วยเบราว์เซอร์ใช้ได้ในแอปคอมและ Kyber Harness บนคลาวด์';
    let target, srv = null;
    if (/^https?:\/\//i.test(p)) target = p;
    else { // ไฟล์ในโปรเจกต์: เปิดผ่านเว็บเซิร์ฟเวอร์ชั่วคราวในเครื่อง (file:// โหลด ES module / import map / fetch ไม่ได้ เพราะ CORS)
      const f = this.abs(p); if (!this.inside(f)) return 'Error: path must be inside the working folder'; if (!await fs.access(f).then(() => true, () => false)) return `Error: ไม่พบไฟล์ ${p}`;
      srv = await serveDir(this.root); target = srv.origin + '/' + path.relative(this.root, f).split(path.sep).map(encodeURIComponent).join('/');
    }
    try {
      if (this.pageCheck) { const r = await this.pageCheck(target, wait, srv?.origin); return { text: pageReport(p, r), images: r.image ? [r.image] : [] }; }
      const r = await this.shot(target, 1280, wait); const img = typeof r === 'string' ? r : r.image; return { text: pageReport(p, { logs: r?.logs || [], bytes: r?.bytes || (img ? img.length * 0.75 : 0), canvases: r?.canvases }), images: img ? [img] : [] };
    } finally { srv?.close(); }
  }
  async todo_write(a) { const t = (Array.isArray(a.todos) ? a.todos : []).slice(0, 30).map(x => ({ content: String(x.content || '').slice(0, 200), status: ['pending', 'in_progress', 'completed'].includes(x.status) ? x.status : 'pending' })); this.onTodos(t); return 'บันทึกรายการงานแล้ว'; }
}

// เว็บเซิร์ฟเวอร์ชั่วคราวสำหรับ check_page: เสิร์ฟเฉพาะไฟล์ในโฟลเดอร์งาน ที่ 127.0.0.1 พอร์ตสุ่ม ปิดทันทีหลังตรวจ
const PAGE_MIME = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', wasm: 'application/wasm', hdr: 'application/octet-stream', mp3: 'audio/mpeg', mp4: 'video/mp4', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8' };
function serveDir(root) {
  const http = require('http');
  const srv = http.createServer(async (q, r) => {
    let rel; try { rel = decodeURIComponent(new URL(q.url, 'http://x').pathname); } catch { r.writeHead(400); return r.end(); }
    const f = path.resolve(root, '.' + rel); if (f !== root && !f.startsWith(root + path.sep)) { r.writeHead(403); return r.end(); }
    const file = (await fs.stat(f).catch(() => null))?.isDirectory() ? path.join(f, 'index.html') : f;
    const buf = await fs.readFile(file).catch(() => null); if (!buf) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'content-type': PAGE_MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(buf);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ origin: 'http://127.0.0.1:' + srv.address().port, close: () => { srv.closeAllConnections?.(); srv.close(); } })));
}
// รายงานผลตรวจหน้าเว็บ: error ใน console · ภาพเกือบสีเดียว (ไฟล์ภาพเล็กมาก) = จอว่าง/ดำ เช่นฉาก 3D ไม่แสดง
function pageReport(p, r = {}) {
  const logs = (r.logs || []).filter(l => !/GL Driver Message|favicon\.ico/.test(l)).slice(0, 30), errs = logs.filter(l => /error|failed|uncaught|404|not defined|cannot/i.test(l)), blank = r.bytes > 0 && r.bytes < 9000;
  return [`ตรวจหน้า ${p} ในเบราว์เซอร์จริงแล้ว (ภาพหน้าจอด้านล่าง)`, errs.length ? `พบ error ${errs.length} รายการ:\n${errs.join('\n')}` : 'console ไม่มี error', logs.length > errs.length ? 'คำเตือนอื่น:\n' + logs.filter(l => !errs.includes(l)).join('\n') : '', blank ? 'คำเตือน: หน้าจอดูเหมือนว่าง/สีเดียว (ฉาก 3D หรือเนื้อหาอาจไม่แสดง) ตรวจกล้อง แสง ขนาดวัตถุ และลูปเรนเดอร์' : '', r.canvases != null ? `canvas บนหน้า: ${r.canvases}` : ''].filter(Boolean).join('\n\n');
}
// แผนที่โปรเจกต์ตอนเริ่มงาน: โครงไฟล์ 2 ชั้น + คำสั่ง build/test + ไลบรารีหลัก → โมเดลเดาน้อยลงและเรียกเครื่องมือสำรวจน้อยลง
// checks = คำสั่งตรวจงานของโปรเจกต์ (ใช้กับ "ตรวจงานก่อนจบ") · โฟลเดอร์ home ของผู้ใช้: ไม่ทำแผนที่ (ไฟล์ส่วนตัว/ไม่ใช่โปรเจกต์)
async function projectMap(root) {
  root = path.resolve(root); if (root === path.resolve(require('os').homedir())) return { text: '', checks: [] };
  const has = async f => fs.access(path.join(root, f)).then(() => true, () => false), read = f => fs.readFile(path.join(root, f), 'utf8').catch(() => null);
  const lines = [], checks = [], add = c => { if (!checks.includes(c)) checks.push(c); };
  // โครงไฟล์ 2 ชั้น (ข้าม node_modules/dist/โฟลเดอร์ซ่อน) ไม่เกิน 60 บรรทัด
  const tree = []; const ls = async (d, depth) => {
    const items = (await fs.readdir(path.join(root, d), { withFileTypes: true }).catch(() => [])).filter(x => !x.name.startsWith('.') && !(x.isDirectory() && SKIP.test(x.name))).sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
    const cap = depth ? 12 : 40; // ในโฟลเดอร์ย่อยแสดงไม่เกิน 12 รายการ (โฟลเดอร์ใหญ่ไม่กินที่ของโฟลเดอร์อื่น)
    for (const [i, it] of items.entries()) {
      if (i >= cap || tree.length >= 80) { tree.push('  '.repeat(depth) + `… (+${items.length - i} more)`); return; }
      tree.push('  '.repeat(depth) + it.name + (it.isDirectory() ? '/' : ''));
      if (it.isDirectory() && depth < 1) await ls(path.join(d, it.name), depth + 1);
    }
  };
  await ls('.', 0); if (tree.length) lines.push('Files (2 levels):\n' + tree.join('\n'));
  const pkgRaw = await read('package.json');
  if (pkgRaw) {
    let pkg = {}; try { pkg = JSON.parse(pkgRaw); } catch { /* JSON พัง: ข้าม */ }
    const pm = await has('pnpm-lock.yaml') ? 'pnpm' : await has('yarn.lock') ? 'yarn' : await has('bun.lockb') || await has('bun.lock') ? 'bun' : 'npm';
    const sc = pkg.scripts || {}, deps = { ...pkg.dependencies, ...pkg.devDependencies };
    lines.push(`Node project${pkg.name ? ' "' + pkg.name + '"' : ''}${pkg.type ? ' (type: ' + pkg.type + ')' : ''} · package manager: ${pm}`);
    if (Object.keys(sc).length) lines.push('Scripts:\n' + Object.entries(sc).slice(0, 15).map(([k, v]) => `- ${pm === 'npm' && k !== 'test' && k !== 'start' ? 'npm run ' + k : pm + ' ' + k}: ${String(v).slice(0, 120)}`).join('\n'));
    if (Object.keys(deps).length) lines.push('Dependencies: ' + Object.entries(deps).slice(0, 25).map(([k, v]) => `${k}@${v}`).join(', '));
    const run = k => pm === 'npm' && k !== 'test' ? `npm run ${k}` : `${pm} ${k}`;
    if (sc.test && !/no test specified/i.test(sc.test)) add(run('test'));
    for (const k of ['typecheck', 'lint', 'build']) if (sc[k]) add(run(k));
  }
  const py = (await read('pyproject.toml')) || '', req = (await read('requirements.txt')) || '';
  if (py || req || await has('setup.py')) { lines.push('Python project' + (req ? ' · requirements: ' + req.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#')).slice(0, 20).join(', ') : '')); if (/pytest/i.test(py + req) || await has('tests') || await has('pytest.ini')) add('pytest -q'); }
  if (await has('go.mod')) { lines.push('Go module: ' + ((await read('go.mod')) || '').split('\n')[0].replace(/^module\s+/, '')); add('go build ./...'); add('go test ./...'); }
  if (await has('Cargo.toml')) { lines.push('Rust crate (Cargo)'); add('cargo build'); add('cargo test'); }
  const mk = await read('Makefile'); if (mk) { const t = [...mk.matchAll(/^([a-zA-Z][\w-]*):/gm)].map(m => m[1]).slice(0, 12); if (t.length) lines.push('Makefile targets: ' + t.join(', ')); for (const k of ['test', 'build']) if (t.includes(k)) add('make ' + k); }
  for (const [f, what] of [['pom.xml', 'Maven (mvn test)'], ['build.gradle', 'Gradle'], ['composer.json', 'PHP Composer'], ['Gemfile', 'Ruby Bundler'], ['Dockerfile', 'Dockerfile'], ['docker-compose.yml', 'docker compose']]) if (await has(f)) lines.push(what);
  if (await has('.git')) lines.push('Git repository (use git_inspect to see changes)');
  if (checks.length) lines.push('Checks to run before finishing: ' + checks.join(' · '));
  return { text: lines.join('\n\n').slice(0, 3500), checks };
}

// ผู้ตรวจรอบสอง: โมเดลอ่าน diff ของงานนี้เทียบกับคำสั่งผู้ใช้ รายงานเฉพาะบั๊กจริงที่ชี้จุดได้ · ไม่มีปัญหา = "LGTM"
// ใช้เฉพาะงานที่แก้ไฟล์โค้ด · post(body) = เรียก /v1/chat/completions แบบไม่สตรีม (แอปและเครื่องเสมือนส่งมาเอง)
const CODE_FILE = /\.(m?[jt]sx?|cjs|py|go|rs|java|kt|cs|cpp|cc|c|h|rb|php|swift|vue|svelte|sh|sql|css|html)$/i;
function makeReviewer({ ws, post, model, task = '' }) {
  return async ({ changed }) => {
    if (!changed.some(p => CODE_FILE.test(p))) return null;
    const diff = await ws.diffSince(ws.runFrom); if (!diff) return null;
    const r = await post({ model, stream: false, max_tokens: 1500, messages: [
      { role: 'system', content: 'You are a strict senior code reviewer. Review ONLY the diff below against the user request. Report real defects you can point to in the diff: bugs, crashes, wrong logic, missing pieces of the request, broken imports/names, security problems. Do not report style, naming or optional improvements. For each problem give the file, the line/snippet and why it is wrong, at most 5 items, as a short bullet list. If there is no real problem, reply exactly: LGTM' },
      { role: 'user', content: `User request:\n${String(task).slice(0, 4000)}\n\nDiff of this task:\n${diff}` }] });
    const d = await r.json().catch(() => ({})); return r.ok ? String(d.choices?.[0]?.message?.content || '').trim() || null : null;
  };
}

const agentSystem = ({ root, os, rules, map = '', extra = '' }) => `You are Kyber Agent (Kyber Harness by Hypatia), an autonomous coding and computer agent running on the user's computer through the Kyber Desktop app. Reply in the user's language. Never name the API provider that serves you.
Working folder: ${root}
OS: ${os}

How to work:
- Use the tools to look before you change anything: list_dir/glob/grep/read_file. Never guess file contents.
- For multi-step work keep a todo list with todo_write and update it as you go.
- Change existing files with edit_file (exact old_string copied from read_file output without the line-number prefix), or multi_edit for several changes in one file; use write_file only for new files or full rewrites.
- Independent reads/searches can go in one reply (they run in parallel); edits and commands run one at a time in order.
- Very long tool output is saved to a file under .kyber-tmp/ and you get the head and tail plus its path: read only the part you need with read_file offset/limit or grep.
- Android .apk/.aab work: call android_tools first, then decode with apktool, edit, rebuild and sign; tell the user where the signed APK is. Only modify apps the user owns or is allowed to modify.
- Run builds, tests and scripts with bash to verify your work; read real error output and fix the root cause. Use background=true for servers and watchers.
- Make the smallest change that fully does the task; follow the project's existing style. No features nobody asked for.
- Before risky or destructive actions (deleting files, force push, system changes), explain and only proceed if the user asked for it.
- Never claim a command ran or a file changed before you see the tool result.
- Verify before you finish: re-read what you changed, fix any [syntax error] reported after an edit, and run the project's tests/build when it has them. Review your changes with git_inspect (op=diff) in a git repo.
- Work efficiently (every round re-sends the conversation, so fewer rounds = faster and cheaper):
  * Batch: put several independent tool calls in one reply (reads, plus a series of edits to different files).
  * Big or unfamiliar codebase: if the task tool is available, start 2-3 helpers in ONE reply, each exploring a different area (they run in parallel and only report back), instead of reading everything yourself.
  * New project: write each file once, complete, then check; do not write a stub and grow it in many small edits.
  * Web pages: verify with check_page (it opens a real browser for you). Do not install or hunt for browsers, Playwright or other tools, and do not write your own browser test harness unless the user asked for tests.
  * Do not fix the machine/environment (PATH, symlinks, global installs) unless that is the task; if a tool is missing, use another way to verify and mention it.
  * Keep scratch/test files inside the working folder (.kyber-tmp/), and do not list or read folders outside it unless the task needs them.
  * Do not narrate while working: between tool calls write nothing or one short line. Explain once, in the final summary (output tokens cost the most).
  * Change existing code with small edits (edit_file / the tool's edit op) instead of rewriting whole files.
  * Stop as soon as the request is done and verified: no extra polishing rounds, no re-verifying what already passed.
- When finished, give a short summary: what changed (file paths), how you verified it, anything left for the user.${map ? `\n\nProject map (generated when the task started; may be incomplete, verify with tools before relying on it):\n${map}` : ''}${rules ? `\n\nProject rules from the folder (follow them):\n${rules}` : ''}${extra ? '\n\n' + extra : ''}`;

// android_tools: ใส่ให้โมเดลเฉพาะงาน Android (ลดเครื่องมือที่ไม่เกี่ยว = prompt สั้นลง เลือกเครื่องมือแม่นขึ้น) · ข้อความพูดถึง apk หรือโฟลเดอร์มี .apk/.aab/AndroidManifest.xml (ลึกไม่เกิน 4 ชั้น)
async function wantsAndroid(root, text = '') {
  if (/\b(apk|aab|apktool|jadx|android)\b|แอนดรอยด์/i.test(String(text))) return true;
  let seen = 0, hit = false;
  const scan = async (d, depth) => {
    if (hit || depth > 4 || seen > 3000) return; let items; try { items = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) { if (hit || ++seen > 3000) return; if (it.isFile() && (/\.(apk|aab)$/i.test(it.name) || it.name === 'AndroidManifest.xml')) { hit = true; return; } if (it.isDirectory() && !SKIP.test(it.name) && !it.name.startsWith('.')) await scan(path.join(d, it.name), depth + 1); }
  };
  await scan(path.resolve(root), 0); return hit;
}
// ชุดเครื่องมือของงาน: ล็อกไว้ทั้ง session (ไม่เปลี่ยนตามโหมด) เพื่อให้ prompt cache ใช้ต่อได้ · android = เปิดแล้วเปิดตลอด
const toolsFor = ({ android = false } = {}) => AGENT_TOOLS.filter(t => android || t.function.name !== 'android_tools');

async function projectRules(root) {
  // กติกาโปรเจกต์: ชื่อใหม่ KYBER.md ก่อน แล้วชื่อเดิม ASTRA.md / CLAUDE.md / AGENTS.md
  for (const f of ['KYBER.md', 'ASTRA.md', 'CLAUDE.md', 'AGENTS.md']) { const t = await fs.readFile(path.join(root, f), 'utf8').catch(() => null); if (t) return `(${f})\n${t.slice(0, 8000)}`; }
  return '';
}

async function projectHooks(root) { try { const h = JSON.parse(await fs.readFile(path.join(root, '.astra', 'hooks.json'), 'utf8')); return h && typeof h.after_edit === 'string' && h.after_edit.trim() ? { after_edit: h.after_edit.trim().slice(0, 300) } : null; } catch { return null; } }
// คำสั่งลัดของโปรเจกต์: .astra/commands/<ชื่อ>.md → /ชื่อ ($ARGUMENTS = ข้อความหลังคำสั่ง)
async function projectCommands(root) { const dir = path.join(root, '.astra', 'commands'), out = []; for (const f of await fs.readdir(dir).catch(() => [])) if (/^[\w-]{1,30}\.md$/.test(f)) out.push({ name: f.slice(0, -3), text: (await fs.readFile(path.join(dir, f), 'utf8').catch(() => '')).slice(0, 8000) }); return out.slice(0, 50); }

// ปลั๊กอิน: ตรวจ manifest ก่อนติดตั้ง (ชื่อ, MCP ไม่เกิน 5, คำสั่งลัดไม่เกิน 20, กติกา ≤ 4000 ตัวอักษร)
const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{1,39}$/;
function cleanPlugin(m) {
  if (!m || !PLUGIN_NAME.test(m.name)) throw new Error('ชื่อปลั๊กอินไม่ถูกต้อง (a-z 0-9 -)');
  const mcp = {}; for (const [n, c] of Object.entries(m.mcpServers || {}).slice(0, 5)) { if (!/^[\w-]{1,30}$/.test(n) || typeof c?.command !== 'string') throw new Error('mcpServers ไม่ถูกต้อง'); mcp[n] = { command: c.command.slice(0, 200), args: (Array.isArray(c.args) ? c.args : []).map(String).slice(0, 30), env: Object.fromEntries(Object.entries(c.env || {}).slice(0, 10).map(([k, v]) => [String(k), String(v)])) }; }
  return { name: m.name, title: String(m.title || m.name).slice(0, 60), description: String(m.description || '').slice(0, 300), version: String(m.version || '1').slice(0, 20), mcpServers: mcp,
    commands: (Array.isArray(m.commands) ? m.commands : []).filter(c => /^[\w-]{1,30}$/.test(c?.name) && typeof c.text === 'string').slice(0, 20).map(c => ({ name: c.name, text: c.text.slice(0, 8000) })),
    rules: String(m.rules || '').slice(0, 4000), hooks: typeof m.hooks?.after_edit === 'string' ? { after_edit: m.hooks.after_edit.slice(0, 300) } : null, envAsk: (Array.isArray(m.envAsk) ? m.envAsk : []).filter(x => /^[A-Z][A-Z0-9_]{1,60}$/.test(x)).slice(0, 5) };
}

// ทะเบียนเครื่องมือแบบมาตรฐาน: { name, kind, schema, validate, execute, formatPreview } (ตัวตรวจ argument เดียวกับที่ตัวคุมรอบใช้)
const { validateArgs } = require('./agent');
const toolRegistry = (ws, list = AGENT_TOOLS) => new Map(list.map(t => { const f = t.function; return [f.name, { name: f.name, kind: KIND[f.name] || 'none', schema: f.parameters, validate: args => validateArgs(f.parameters, args), execute: args => ws.call(f.name, args), formatPreview: args => `${f.name} ${String(args?.path || args?.command || args?.pattern || args?.url || args?.query || args?.op || '').slice(0, 120)}`.trim() }]; }));

module.exports = { projectMap, makeReviewer, cleanPlugin, AGENT_TOOLS, ASK_TOOL, KIND, READ_ONLY, SUB_TOOLS, Workspace, globRe, diffLines, applyEdits, agentSystem, projectRules, projectHooks, projectCommands, wantsAndroid, toolsFor, toolRegistry };
