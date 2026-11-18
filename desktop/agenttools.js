// เครื่องมือของ agent (แบบ Claude Code): อ่าน/เขียน/แก้ไฟล์, ค้นไฟล์, เทอร์มินัลที่จำโฟลเดอร์ปัจจุบัน, งานเบื้องหลัง, เว็บ, รายการงาน
// สิทธิ์: อ่านในโฟลเดอร์งานได้เลย · แก้ไฟล์/รันคำสั่งตามโหมดที่ผู้ใช้เลือก · แตะนอกโฟลเดอร์งานต้องถามทุกครั้ง · คำสั่งอันตรายถามเสมอ (ตัดสินใน main.js)
const fs = require('fs/promises');
const path = require('path');
const { runCmd, isDanger } = require('./tools');

const SKIP = /^(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.venv|venv|__pycache__|\.cache|target|vendor)$/i;
const fn = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const S = d => ({ type: 'string', description: d }), N = d => ({ type: 'number', description: d }), B = d => ({ type: 'boolean', description: d });

const AGENT_TOOLS = [
  fn('read_file', 'Read a text file. Returns lines prefixed with line numbers. Use offset/limit for big files.', { path: S('File path, relative to the working folder or absolute'), offset: N('First line (1-based)'), limit: N('Number of lines, default 2000') }, ['path']),
  fn('write_file', 'Create or overwrite a file with the full content. Prefer edit_file for changes to existing files.', { path: S('File path'), content: S('Full file content') }, ['path', 'content']),
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
  fn('todo_write', 'Keep a short task list for multi-step work; the user sees it live. Send the whole list each time.', { todos: { type: 'array', items: { type: 'object', properties: { content: S('Task'), status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } }, required: ['content', 'status'] } } }, ['todos']),
];
const KIND = { read_file: 'read', list_dir: 'read', glob: 'read', grep: 'read', web_fetch: 'net', web_search: 'net', screenshot_url: 'net', task: 'none', todo_write: 'none', bash_output: 'none', kill_bash: 'none', write_file: 'edit', edit_file: 'edit', bash: 'bash' };
const READ_ONLY = new Set(['read_file', 'list_dir', 'glob', 'grep', 'web_fetch', 'web_search', 'screenshot_url', 'todo_write', 'task']); // โหมดวางแผน
const SUB_TOOLS = new Set(['read_file', 'list_dir', 'glob', 'grep', 'web_fetch', 'web_search']); // ผู้ช่วยค้น (subagent)

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
  constructor(root, { ask = async () => true, fetchImpl = fetch, search = async () => [], onTodos = () => {}, shot = null, subagent = null, hooks = null } = {}) {
    this.root = path.resolve(root); this.cwd = this.root; this.ask = ask; this.fetchImpl = fetchImpl; this.search = search; this.onTodos = onTodos;
    this.shot = shot; this.subagent = subagent; this.hooks = hooks; // hooks: { after_edit: "npx prettier --write {file}" } (ผู้ใช้ยืนยันแล้วใน main)
    this.hist = []; this.step = 0; this.runFrom = 0; this.bg = new Map(); this.n = 0;
  }
  abs(p) { return path.resolve(this.cwd, String(p ?? '.')); }
  inside(a) { return a === this.root || a.startsWith(this.root + path.sep); }
  rel(a) { return this.inside(a) ? path.relative(this.root, a).split(path.sep).join('/') || '.' : a; }
  // ก่อนแก้ไฟล์ทุกครั้ง: เก็บเนื้อหาเดิมพร้อมเลขขั้นตอน (null = ไฟล์ใหม่ ย้อน = ลบทิ้ง) → ย้อนไปขั้นไหนก็ได้
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
    const kind = KIND[name]; if (!kind) throw new Error('ไม่รู้จักเครื่องมือ ' + name);
    const target = ['read_file', 'write_file', 'edit_file', 'list_dir', 'glob', 'grep'].includes(name) ? this.abs(a.path ?? '.') : null;
    const diff = name === 'edit_file' ? diffLines(a.old_string, a.new_string) : name === 'write_file' ? diffLines(await fs.readFile(target, 'utf8').catch(() => ''), a.content) : null;
    if (!await this.ask({ name, kind, args: a, outside: target ? !this.inside(target) : false, danger: name === 'bash' && isDanger(a.command), cwd: this.cwd, diff })) return 'Error: ผู้ใช้ไม่อนุญาต';
    let out = await this[name](a, target);
    if (diff && !String(out).startsWith('Error')) {
      out += '\n' + diff;
      if (this.hooks?.after_edit) { const r = await runCmd(this.root, this.hooks.after_edit.replace(/\{file\}/g, JSON.stringify(target)), { timeout: 60e3, signal: this.signal }); out += `\n[hook after_edit exit ${r.code}]${(r.stdout + r.stderr).trim() ? '\n' + (r.stdout + r.stderr).trim().slice(-1500) : ''}`; }
    }
    return out;
  }
  async read_file(a, f) {
    const st = await fs.stat(f); if (st.isDirectory()) return this.list_dir(a, f);
    if (st.size > 5e6) return `Error: ไฟล์ใหญ่ ${Math.round(st.size / 1e6)}MB`;
    const buf = await fs.readFile(f); if (buf.includes(0)) return 'Error: ไม่ใช่ไฟล์ข้อความ';
    const lines = buf.toString('utf8').split(/\r?\n/), from = Math.max(1, +a.offset || 1), n = Math.min(+a.limit || 2000, 5000);
    const part = lines.slice(from - 1, from - 1 + n).map((l, i) => `${String(from + i).padStart(6)}\t${l.length > 2000 ? l.slice(0, 2000) + '…' : l}`).join('\n');
    return part + (from - 1 + n < lines.length ? `\n…(ทั้งหมด ${lines.length} บรรทัด อ่านต่อด้วย offset=${from + n})` : '') || '(ไฟล์ว่าง)';
  }
  async write_file(a, f) { await this.keep(f); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, String(a.content ?? ''), 'utf8'); return `เขียน ${this.rel(f)} แล้ว (${String(a.content ?? '').split('\n').length} บรรทัด)`; }
  async edit_file(a, f) {
    let t = await fs.readFile(f, 'utf8'); const crlf = t.includes('\r\n'), fix = s => crlf ? String(s ?? '').replace(/\r?\n/g, '\r\n') : String(s ?? '');
    const o = fix(a.old_string), n = o ? t.split(o).length - 1 : 0;
    if (!o) return 'Error: old_string ว่าง';
    if (!n) return 'Error: ไม่เจอ old_string ในไฟล์ (อ่านไฟล์อีกครั้งแล้วคัดลอกให้ตรงทุกตัวอักษร รวมช่องว่าง)';
    if (n > 1 && !a.replace_all) return `Error: เจอ old_string ${n} จุด ใส่บรรทัดรอบๆ เพิ่มให้เหลือจุดเดียว หรือใช้ replace_all`;
    await this.keep(f); t = a.replace_all ? t.split(o).join(fix(a.new_string)) : t.replace(o, () => fix(a.new_string));
    await fs.writeFile(f, t, 'utf8'); return `แก้ ${this.rel(f)} แล้ว ${a.replace_all ? n : 1} จุด`;
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
    const img = await this.shot(u, Math.min(1920, Math.max(360, +a.width || 1280))); return { text: `ภาพหน้าจอของ ${u} (แนบด้านล่าง)`, images: [img] };
  }
  async task(a) { if (!this.subagent) return 'Error: ไม่มีผู้ช่วย'; return await this.subagent(String(a.description || 'งานย่อย').slice(0, 60), String(a.prompt || '')); }
  async todo_write(a) { const t = (Array.isArray(a.todos) ? a.todos : []).slice(0, 30).map(x => ({ content: String(x.content || '').slice(0, 200), status: ['pending', 'in_progress', 'completed'].includes(x.status) ? x.status : 'pending' })); this.onTodos(t); return 'บันทึกรายการงานแล้ว'; }
}

const agentSystem = ({ root, os, rules }) => `You are AstraCode Agent, an autonomous coding and computer agent running on the user's computer through the AstraCode Desktop app. Reply in the user's language. Never name the API provider that serves you.
Working folder: ${root}
OS: ${os}

How to work:
- Use the tools to look before you change anything: list_dir/glob/grep/read_file. Never guess file contents.
- For multi-step work keep a todo list with todo_write and update it as you go.
- Change existing files with edit_file (exact old_string copied from read_file output without the line-number prefix); use write_file only for new files or full rewrites.
- Run builds, tests and scripts with bash to verify your work; read real error output and fix the root cause. Use background=true for servers and watchers.
- Make the smallest change that fully does the task; follow the project's existing style. No features nobody asked for.
- Before risky or destructive actions (deleting files, force push, system changes), explain and only proceed if the user asked for it.
- Never claim a command ran or a file changed before you see the tool result.
- When finished, give a short summary: what changed (file paths), how you verified it, anything left for the user.${rules ? `\n\nProject rules from the folder (follow them):\n${rules}` : ''}`;

async function projectRules(root) {
  for (const f of ['ASTRA.md', 'CLAUDE.md', 'AGENTS.md']) { const t = await fs.readFile(path.join(root, f), 'utf8').catch(() => null); if (t) return `(${f})\n${t.slice(0, 8000)}`; }
  return '';
}

async function projectHooks(root) { try { const h = JSON.parse(await fs.readFile(path.join(root, '.astra', 'hooks.json'), 'utf8')); return h && typeof h.after_edit === 'string' && h.after_edit.trim() ? { after_edit: h.after_edit.trim().slice(0, 300) } : null; } catch { return null; } }
// คำสั่งลัดของโปรเจกต์: .astra/commands/<ชื่อ>.md → /ชื่อ ($ARGUMENTS = ข้อความหลังคำสั่ง)
async function projectCommands(root) { const dir = path.join(root, '.astra', 'commands'), out = []; for (const f of await fs.readdir(dir).catch(() => [])) if (/^[\w-]{1,30}\.md$/.test(f)) out.push({ name: f.slice(0, -3), text: (await fs.readFile(path.join(dir, f), 'utf8').catch(() => '')).slice(0, 8000) }); return out.slice(0, 50); }

module.exports = { AGENT_TOOLS, KIND, READ_ONLY, SUB_TOOLS, Workspace, globRe, diffLines, agentSystem, projectRules, projectHooks, projectCommands };
