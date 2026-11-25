// ---------- เครื่องมือแบบ native (function calling) ของแชตและโหมด Code ----------
// โหมด Code: อ่าน/ค้น/แก้ไฟล์โปรเจกต์ผ่าน tool แทนบรรทัด READ/GREP/LIST และบล็อก path= ที่โมเดลต้องพิมพ์เอง
// การแก้ไฟล์ไม่เขียนลงฐานข้อมูลตรงๆ: แปลงเป็นบล็อก path= / SEARCH-REPLACE / DELETE ต่อท้ายคำตอบ หน้าเว็บจึงตรวจ/นำไปใช้/ย้อนกลับได้เหมือนเดิม
// แต่ตรวจกับไฟล์จริงก่อน (ข้อความเดิมต้องพบที่เดียว) ผิดก็บอกโมเดลให้แก้ในคำตอบเดียวกัน ไม่ต้องให้ผู้ใช้ส่งข้อความตามอีกรอบ
import { findBlock, problemOf, syntaxWarning } from './edits.js';
import { FILE_LIMIT, PATH_RE } from './projects.js';

const fn = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const S = d => ({ type: 'string', description: d }), N = d => ({ type: 'number', description: d }), B = d => ({ type: 'boolean', description: d });

export const CODE_TOOLS = [
  fn('read_file', 'Read a project file. Returns lines prefixed with their line number and a tab (the prefix is not part of the file). Call several read_file at once to read several files in one turn. Use offset/limit for big files.', { path: S('File path relative to the project root'), offset: N('First line to read (1-based)'), limit: N('Number of lines (default 2000)') }, ['path']),
  fn('list_dir', 'List the files under a folder of the project, with sizes.', { path: S('Folder, "" or "." for the whole project') }),
  fn('glob', 'Find project files by name pattern, e.g. "**/*.js" or "src/*.css".', { pattern: S('Glob pattern') }, ['pattern']),
  fn('grep', 'Search the contents of every project file with a regular expression (case-insensitive). Returns path:line: text, max 200 hits.', { pattern: S('Regular expression'), glob: S('Only files matching this glob, e.g. "*.js"') }, ['pattern']),
  fn('edit_file', 'Change an existing file by replacing exact text. old_string must be copied from the current file (without the line-number prefix) and match exactly one place: add neighbouring lines to make it unique. Use replace_all to change every occurrence. Several edit_file calls may go in one turn; they apply in order.', { path: S('File path'), old_string: S('Exact text to replace'), new_string: S('Replacement text'), replace_all: B('Replace every occurrence') }, ['path', 'old_string', 'new_string']),
  fn('write_file', 'Create a new file, or replace a whole file when you rewrite most of it. Give the complete content; never use "..." placeholders.', { path: S('File path relative to the project root'), content: S('Complete file content') }, ['path', 'content']),
  fn('delete_file', 'Delete a project file.', { path: S('File path') }, ['path']),
  fn('todo_write', 'Show the user a live checklist of the steps of this task. Call it before starting work with 3 or more steps, then again each time a step starts or finishes. Always send the whole list; keep exactly one step in_progress while working.', { todos: { type: 'array', description: 'All steps, in order', items: { type: 'object', properties: { content: S('The step, short, in the language the user writes in'), status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } }, required: ['content', 'status'] } } }, ['todos']),
];
export const CODE_TOOL_NAMES = new Set(CODE_TOOLS.map(t => t.function.name));
export const WRITE_TOOLS = new Set(['edit_file', 'write_file', 'delete_file']);
// รายการงานที่หน้าเว็บแสดงสด (todo_write) · ตัดให้สั้นและสถานะถูกต้อง
export const todosOf = a => (Array.isArray(a?.todos) ? a.todos : []).slice(0, 15).map(t => ({ content: String(t?.content || '').replace(/\s+/g, ' ').trim().slice(0, 140), status: ['pending', 'in_progress', 'completed'].includes(t?.status) ? t.status : 'pending' })).filter(t => t.content);
// โหมด Plan: ให้ AI อ่าน/ค้นอย่างเดียวแล้วเสนอแผน ยังไม่แก้ไฟล์
export const PLAN_NOTE = `

PLAN MODE IS ON: the user wants a plan before any change.
- Look at the project with the read-only tools (read_file, grep, glob, list_dir) as needed.
- Do NOT change any file: no edit_file, write_file or delete_file, no path= blocks, no SEARCH/REPLACE, no RUN lines.
- Reply with a short numbered plan: what you will change, in which files, and how you will check it works. Mention risks or questions if any.
- End by asking the user to approve the plan. They will press "Start building" to let you do it.`;

export const CODE_TOOLS_NOTE = `

NATIVE TOOLS ARE ON in this conversation and replace the text protocol described above for files:
- Look at files with read_file, grep, glob and list_dir. Put every read you need in ONE turn (several tool calls at once) instead of one file per turn.
- Change files only with edit_file (old_string copied exactly from read_file output, without the line-number prefix), write_file (new files or full rewrites) and delete_file. Do not write READ/GREP/LIST lines, path= blocks or SEARCH/REPLACE in your text: they are no longer needed.
- Each successful change is shown to the user and applied to the project. If a tool returns an error, correct the call and try again in the next turn.
- Write your short closing summary as text in the SAME turn as your last edit calls: a turn that only changes files successfully ends your answer.
- For a task with 3 or more steps, call todo_write first with the plan, then update it as each step starts and finishes.
- RUN lines and the ask block still work as described above.`;

const LANG = { js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', html: 'html', htm: 'html', css: 'css', json: 'json', md: 'md', py: 'python', sh: 'bash', yml: 'yaml', yaml: 'yaml', svg: 'svg', xml: 'xml', txt: 'text', vue: 'vue', svelte: 'svelte' };
const langOf = p => LANG[(p.split('.').pop() || '').toLowerCase()] || '';
const fence = (path, body) => `\n\n\`\`\`${langOf(path)} path=${path}\n${body.replace(/\n$/, '')}\n\`\`\`\n`;
const FENCE_LINE = /^[ \t]*```/m; // บรรทัดที่ขึ้นต้นด้วย ``` จะปิดบล็อกก่อนจบไฟล์ (หน้าเว็บอ่านผิด)
const isImg = c => typeof c === 'string' && c.startsWith('data:');
export const globRe = g => new RegExp('^' + String(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*') + '$', 'i');
const clean = p => String(p ?? '').trim().replace(/^\.\//, '').replace(/^\/+/, '');

// ไฟล์ของคำตอบนี้: เนื้อหาปัจจุบัน + การแก้ที่ทำไปแล้วในคำตอบเดียวกัน (อ่านซ้ำแล้วเห็นของที่แก้)
// แก้ไฟล์ไม่สำเร็จเพราะหา old_string ไม่เจอ: ส่งบรรทัดที่ใกล้ที่สุดพร้อมเลขบรรทัดกลับไปด้วย โมเดลแก้ได้ในรอบเดียว ไม่ต้อง read_file ใหม่ทั้งไฟล์
export function nearestLines(cur, oldS, pad = 6) {
  const L = cur.split('\n'), key = oldS.split('\n').map(l => l.trim()).filter(l => l.length >= 6).sort((a, b) => b.length - a.length)[0];
  if (!key) return '';
  const words = new Set(key.toLowerCase().match(/[\w$]+/g) || []);
  let best = -1, score = 0;
  L.forEach((l, i) => { const t = l.trim(); let s = t === key ? 1e6 : t.includes(key) || (t.length > 5 && key.includes(t)) ? 1e5 : 0; if (!s) for (const w of t.toLowerCase().match(/[\w$]+/g) || []) if (words.has(w)) s++; if (s > score) { score = s; best = i; } });
  if (best < 0 || score < 2) return '';
  const from = Math.max(0, best - pad), to = Math.min(L.length, best + pad + 1);
  return `\nClosest lines in the file now (copy old_string exactly from here, without the line-number prefix):\n${L.slice(from, to).map((l, i) => `${String(from + i + 1).padStart(6)}\t${l}`).join('\n')}`;
}
// ตรวจงานหลัง AI แก้ไฟล์ (เฉพาะไฟล์ที่แก้ในคำตอบนี้): ไวยากรณ์เสีย · HTML อ้างไฟล์ที่ไม่มี · ฟังก์ชันที่ประกาศแต่ไม่มีที่ไหนเรียกใช้
// (อาการ "บอกว่าเสร็จแต่ยังไม่ได้ต่อ" เช่น มี makeOcean() แต่ไม่เคยเรียก) · คืนรายการปัญหาเป็นข้อความสั้นๆ ให้โมเดลแก้ต่อก่อนสรุป
const LOCAL_REF = /\b(?:src|href)\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi;
const FN_DECL = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
export function verifyWork(ws, touched) {
  const F = ws.files, out = [], text = [...F].filter(([, c]) => typeof c === 'string' && !isImg(c)), all = text.map(([, c]) => c).join('\n');
  const count = n => (all.match(new RegExp(`(?<![\\w$])${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;
  for (const path of touched) {
    const c = F.get(path); if (typeof c !== 'string' || isImg(c)) continue;
    const bad = problemOf(path, c, null) || syntaxWarning(path, c); if (bad) out.push(`${path}: ${bad}`);
    if (/\.html?$/i.test(path)) {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '', miss = new Set();
      for (const m of c.matchAll(LOCAL_REF)) {
        const ref = m[1].trim(); if (!ref || /^(?:[a-z][\w+.-]*:|\/\/|\$\{|\{\{)/i.test(ref)) continue; // http:, data:, mailto:, //cdn, template
        let full = ref.startsWith('/') ? ref.slice(1) : dir + ref; const parts = []; for (const s of full.split('/')) { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s); } full = parts.join('/');
        if (full && !F.has(full) && !F.has(full.replace(/\/$/, '') + '/index.html') && /\.\w{1,6}$/.test(full)) miss.add(ref);
      }
      if (miss.size) out.push(`${path} references files that do not exist in the project: ${[...miss].slice(0, 8).join(', ')}`);
    }
    if (/\.(?:m?js|jsx|tsx?|html?)$/i.test(path)) {
      const unused = [...new Set([...c.matchAll(FN_DECL)].map(m => m[1] || m[2]))].filter(n => n.length > 2 && count(n) <= 1);
      if (unused.length) out.push(`${path}: declared but never called anywhere: ${unused.slice(0, 8).join(', ')} (wire them up, or remove them if not needed)`);
    }
  }
  return out;
}
export const codeWorkspace = rows => ({ files: new Map(rows.map(r => [r.path, r.content])), budget: 200e3 });

// คืน { result: ข้อความให้โมเดล, emit: ข้อความต่อท้ายคำตอบ (การแก้ไฟล์), ok, label: ป้ายให้หน้าเว็บ }
export function codeTool(ws, name, a = {}) {
  const path = clean(a.path), F = ws.files;
  const fail = (msg, label) => ({ result: 'Error: ' + msg, emit: '', ok: false, label });
  if (name === 'read_file') {
    const label = 'อ่าน ' + path;
    if (!F.has(path)) return fail(`file not found: ${path}. Use list_dir or glob to see the files.`, label);
    const c = F.get(path);
    if (isImg(c)) return { result: c.startsWith('data:image/') ? `${path} is an image (~${Math.round(c.length / 1365)}KB). Use it in HTML with <img src="${path}"> or in CSS with url(${path}).` : `${path} is a binary file (${c.slice(5, c.indexOf(';'))}, ~${Math.round(c.length / 1365)}KB). It cannot be read as text; refer to it by its path.`, emit: '', ok: true, label };
    const L = c.split('\n'), from = Math.max(1, Math.floor(+a.offset || 1)), n = Math.min(Math.max(1, Math.floor(+a.limit || 2000)), 5000);
    let text = L.slice(from - 1, from - 1 + n).map((l, i) => `${String(from + i).padStart(6)}\t${l}`).join('\n');
    const cap = Math.max(4000, Math.min(100e3, ws.budget)); if (text.length > cap) text = text.slice(0, cap) + '\n…(cut: read the rest with offset)';
    ws.budget -= text.length;
    const more = from - 1 + n < L.length ? `\n(${L.length} lines in total: read more with offset=${from + n})` : '';
    return { result: (text || '(empty file)') + more, emit: '', ok: true, label };
  }
  if (name === 'list_dir') {
    const dir = path === '.' ? '' : path.replace(/\/?$/, path ? '/' : '');
    const hits = [...F].filter(([p]) => p.startsWith(dir)).map(([p, c]) => `${p} (${isImg(c) ? 'image ~' + Math.round(c.length / 1365) + 'KB' : c.length + ' chars'})`);
    return { result: hits.join('\n') || '(no files)', emit: '', ok: true, label: 'ดูโฟลเดอร์ ' + (path || '/') };
  }
  if (name === 'glob') {
    let re; try { re = globRe(a.pattern || '*'); } catch { return fail('bad pattern', 'หาไฟล์'); }
    const hits = [...F.keys()].filter(p => re.test(p) || (!String(a.pattern).includes('/') && re.test(p.split('/').pop()))); // ไม่มี / ในรูปแบบ = เทียบชื่อไฟล์ทุกโฟลเดอร์
    return { result: hits.slice(0, 500).join('\n') || '(no match)', emit: '', ok: true, label: 'หาไฟล์ ' + String(a.pattern).slice(0, 60) };
  }
  if (name === 'grep') {
    const pat = String(a.pattern || ''), label = 'ค้นหา ' + pat.slice(0, 60);
    if (!pat) return fail('pattern is empty', label);
    // ไม่มี timeout ให้ regex ใน Worker: รูปแบบเสี่ยง backtracking ซ้อนหรือยาวเกิน ค้นเป็นข้อความตรงๆ แทน (เหมือน GREP เดิม)
    const risky = pat.length > 200 || /\([^)]*[+*][^)]*\)[+*{]/.test(pat);
    let re; try { if (risky) throw 0; re = new RegExp(pat, 'i'); } catch { re = { test: l => l.toLowerCase().includes(pat.toLowerCase()) }; }
    let only = null; if (a.glob) try { only = globRe(a.glob); } catch { /* ไม่กรอง */ }
    const hits = [];
    for (const [p, c] of F) {
      if (isImg(c) || (only && !only.test(p) && !only.test(p.split('/').pop()))) continue;
      const L = c.split('\n'); for (let i = 0; i < L.length && hits.length < 200; i++) if (L[i].length < 2000 && re.test(L[i])) hits.push(`${p}:${i + 1}: ${L[i].trim().slice(0, 200)}`);
    }
    return { result: hits.join('\n') || '(no match)', emit: '', ok: true, label };
  }
  if (name === 'edit_file') {
    const label = 'แก้ ' + path;
    if (!F.has(path)) return fail(`file not found: ${path}. Use write_file to create a new file.`, label);
    const cur = F.get(path), oldS = String(a.old_string ?? '').replace(/\r/g, ''), newS = String(a.new_string ?? '').replace(/\r/g, '');
    if (isImg(cur)) return fail('this is an image file; it cannot be edited as text', label);
    if (!oldS) return fail('old_string is empty', label);
    if (oldS === newS) return fail('old_string and new_string are the same', label);
    if (FENCE_LINE.test(newS) || FENCE_LINE.test(oldS)) return fail('a line starting with ``` cannot go through edit_file; use ~~~ fences in markdown, or write_file for this file', label);
    let next, emit;
    if (a.replace_all) {
      const n = cur.split(oldS).length - 1; if (!n) return fail(`old_string not found in ${path}. read_file it again and copy the text exactly.`, label);
      next = cur.split(oldS).join(newS); emit = fence(path, next);
    } else {
      const at = findBlock(cur, oldS);
      if (at === -1) { const hits = cur.split('\n').map((l, i) => l.includes(oldS.split('\n')[0]) ? i + 1 : 0).filter(Boolean).slice(0, 8); return fail(`old_string matches several places in ${path}${hits.length ? ' (around lines ' + hits.join(', ') + ')' : ''}; add more neighbouring lines so it matches one place, or set replace_all`, label); }
      if (!at) return fail(`old_string not found in ${path}.${nearestLines(cur, oldS) || ' read_file it again and copy the text exactly (without the line-number prefix).'}`, label);
      const exact = cur.slice(at.from, at.to); // ข้อความจริงในไฟล์ (findBlock ยอมช่องว่าง/เยื้องต่างได้) ให้หน้าเว็บหาเจอแน่นอน
      next = cur.slice(0, at.from) + newS + cur.slice(at.to);
      emit = `\n\n\`\`\`${langOf(path)} path=${path}\n<<<<<<< SEARCH\n${exact}\n=======\n${newS}\n>>>>>>> REPLACE\n\`\`\`\n`;
    }
    if (next.length > FILE_LIMIT) return fail('the file would be over 500KB', label);
    const warn = problemOf(path, next, cur);
    F.set(path, next);
    return { result: `OK: ${path} edited${warn ? ' (warning: ' + warn + ')' : ''}`, emit, ok: true, label, write: true };
  }
  if (name === 'write_file') {
    const label = (F.has(path) ? 'เขียนทับ ' : 'สร้าง ') + path, content = String(a.content ?? '').replace(/\r/g, '');
    if (!PATH_RE.test(path)) return fail('invalid path (use a relative path like src/app.js, no ".." or leading /)', label);
    if (content.length > FILE_LIMIT) return fail('content is over 500KB', label);
    if (FENCE_LINE.test(content)) return fail('the content has a line starting with ``` which cannot be written; use ~~~ fences for code examples inside markdown', label);
    const warn = problemOf(path, content.replace(/\n?$/, '\n'), F.get(path));
    F.set(path, content.replace(/\n?$/, '\n'));
    return { result: `OK: ${path} written (${content.length} chars)${warn ? ' (warning: ' + warn + ')' : ''}`, emit: fence(path, content), ok: true, label, write: true };
  }
  if (name === 'delete_file') {
    const label = 'ลบ ' + path;
    if (!F.has(path)) return fail(`file not found: ${path}`, label);
    F.delete(path);
    return { result: `OK: ${path} deleted`, emit: `\n\nDELETE path=${path}\n`, ok: true, label, write: true };
  }
  return fail('unknown tool ' + name, name);
}

// ---------- แชต: ค้นเว็บ/เปิดลิงก์เมื่อโมเดลเห็นว่าจำเป็น (แทนการค้นทุกครั้งที่ข้อความมีคำว่า "วันนี้" ก่อนเริ่มตอบ) ----------
export const webTools = search => [
  ...(search ? [fn('web_search', `Search the web for current or factual information you do not know (news, prices, schedules, recent releases, facts after your training). Today is ${new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)} (Thailand). Do not search for things you can answer yourself. Several searches may go in one turn. Cite the sources you used.`, { query: S('Search query, in the language most likely to find good results') }, ['query'])] : []),
  fn('web_fetch', 'Open a web page (http/https URL) and read its text, e.g. a link the user mentions or a search result you need in full.', { url: S('http(s) URL') }, ['url']),
];
export const WEB_TOOL_NAMES = new Set(['web_search', 'web_fetch']);

// ตระกูลโมเดลที่รองรับ function calling แน่นอน · แอดมินบังคับเปิด/ปิดต่อโมเดลได้ (models.tools = on/off)
const TOOL_FAMILY = /\b(gpt|o\d|claude|gemini|deepseek|qwen|kimi|glm|grok|mistral|devstral|codestral|llama|minimax)/i;
export const nativeTools = m => m.tools === 'on' || (m.tools !== 'off' && !['image', 'embedding'].includes(m.provider) && (['anthropic', 'responses'].includes(m.provider) || TOOL_FAMILY.test(`${m.api_model || ''} ${m.name || ''}`)));

// ---------- แชต: tools เพิ่ม (สร้างรูป, ความจำ, ค้นแชตเก่า, สร้างไฟล์ให้ดาวน์โหลด, รัน Python) ----------
// สร้างรูป/ความจำ/รัน Python ทำผ่านหน้าเว็บ: เซิร์ฟเวอร์ใส่บล็อก/เครื่องหมายลงคำตอบ แล้วหน้าเว็บทำต่อ (ผู้ใช้กดยืนยันความจำเอง · Python รันในเบราว์เซอร์ผู้ใช้)
export const FILE_EXT = /\.(csv|txt|md|json|html|xlsx|docx|pptx|pdf)$/i;
export const chatTools = ({ image, art }) => [
  ...(art ? [fn('artifact', 'Make an interactive web page (an Artifact) the user opens beside the chat and can share by link: mini apps, calculators, games, dashboards, charts, landing pages, visual explainers. Use it when the user wants something to look at or use, not for short code snippets they asked to read. Write ONE complete self-contained HTML document (inline CSS/JS; external scripts only from cdnjs.cloudflare.com or cdn.jsdelivr.net; no network requests, no localStorage reliance). Mobile-friendly. To change an existing artifact pass its id; that saves a new version.', { title: S('Short name, 2-5 words'), html: S('Complete HTML document'), id: { type: 'integer', description: 'Only to update an existing artifact (id shown as [artifact id=N ...] in the chat)' } }, ['title', 'html'])] : []),
  ...(image ? [fn('generate_image', 'Create a picture with the image generator when the user asks you to draw, design or generate an image. One image per answer. It appears under your answer; do not paste a link.', { prompt: S('Detailed English description of the image'), size: { type: 'string', enum: ['square', 'landscape', 'portrait'], description: 'Only when the user asks for a shape (banner/cover = landscape, story/poster = portrait). Leave out to use the size the user picked.' } }, ['prompt'])] : []),
  fn('save_memory', 'Remember one short, lasting fact about the user across all chats (name, preferences, job, ongoing project). Depending on the user\'s setting it is saved right away (they can undo it) or offered for them to confirm. Use it only for lasting facts the user shares about themselves, never for passing details like today\'s mood.', { text: S('The fact, in one short sentence in the user\'s language') }, ['text']),
  fn('search_chats', 'Search the user\'s earlier chats when they refer to something discussed before ("what we talked about yesterday", "the plan from last week").', { query: S('Words to look for') }, ['query']),
  fn('create_file', 'Make a file for the user: report, table, quotation, letter, data export. .xlsx and .docx are saved in the user\'s account, open beside the chat, and can be changed later with edit_account_file. Formats by extension: .xlsx (content = JSON {"sheets":[{"name","rows":[[...]],"widths":[18,12],"freeze":1,"fmt":{"C":"#,##0.00"}}]} — a string starting with = is a live Excel formula, e.g. "=SUM(C2:C9)", "=B2*C2"; the first row is a bold header; or plain CSV), .csv, .docx and .pdf (content = Markdown with headings, lists and tables), .pptx (content = Markdown slides: each slide starts with "# Slide title", then bullet lines "- point" or a | table |; a line "> note" becomes speaker notes), .md, .txt, .html, .json. Prefer formulas over pre-computed totals in spreadsheets. Write the complete content.', { filename: S('File name with extension, e.g. quote.xlsx'), content: S('Complete file content as described') }, ['filename', 'content']),
  fn('list_account_files', 'List the Excel/Word files saved in the user\'s account (ones you created and ones the user attached) with their file_id.', {}, []),
  fn('read_account_file', 'Read a file saved in the user\'s account. Spreadsheets come back as a grid with column letters and row numbers; formulas show as =... . Read before editing when you are not sure of the exact cells or text.', { file_id: { type: 'integer' }, sheet: S('Only this sheet (optional)') }, ['file_id']),
  fn('edit_account_file', 'Change a saved file in place (a new version; the user sees it update beside the chat and can undo). Use this instead of create_file whenever the user asks to change an existing or attached file. Spreadsheet ops: {op:"set_cells",sheet?,cells:{"B2":5,"D2":"=B2*C2"}}, {op:"write_rows",sheet?,start:"A1",rows:[[..]]}, {op:"append_rows",sheet?,rows:[[..]]} ({r} in a string = that row number), {op:"insert_rows",sheet?,at:5,rows:[[..]]}, {op:"delete_rows",sheet?,from:5,count:2}, {op:"add_column",sheet?,at?:"D",header:"Profit",formula:"=B{r}-C{r}"} or values:[..], {op:"delete_columns",sheet?,col:"D",count:1}, {op:"sort",sheet?,col:"C",desc:true}, {op:"add_sheet",name,rows}, {op:"rename_sheet",sheet,name}, {op:"delete_sheet",sheet}, {op:"format",sheet?,widths:[..],freeze:1,header:true,number_formats:{"C":"#,##0.00"}}. Document ops (Markdown): {op:"replace",find,with,all?}, {op:"insert_after",find,text}, {op:"append",text}, {op:"rewrite",text}. sheet defaults to the first sheet.', { file_id: { type: 'integer' }, ops: { type: 'array', items: { type: 'object' }, description: 'Edits applied in order; if one fails nothing is saved' }, note: S('Short summary of the change, in the user\'s language') }, ['file_id', 'ops']),
  fn('run_python', 'Run Python 3 to calculate exactly, analyse data, fetch web data or draw charts with matplotlib. Paid plans run it on a cloud machine with internet access, and missing pip packages are installed automatically; otherwise it runs in the user\'s browser (Pyodide, no internet, scientific packages only), so handle errors gracefully. Files the user attached in this chat are in /data/<name>. Print the results you need. Files you write to /out/ (.xlsx, .csv, .md, .txt) are saved into the user\'s account as files you can then edit. pandas, numpy and matplotlib are available. Your answer pauses here; the output comes back to you in the next message, so put nothing after this call.', { code: S('Complete Python code') }, ['code']),
];
export const CHAT_TOOL_NAMES = new Set(['artifact', 'generate_image', 'save_memory', 'search_chats', 'create_file', 'list_account_files', 'read_account_file', 'edit_account_file', 'run_python']);
const b64u8 = s => { const b = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(o); };
// เครื่องหมายไฟล์ในคำตอบ: [[dl:ชื่อไฟล์|base64]] หน้าเว็บแสดงปุ่มดาวน์โหลด · ตัดออกก่อนส่งประวัติให้โมเดล (ไม่เปลือง token)
export const dlMarker = (name, content) => `\n\n[[dl:${name}|${b64u8(content)}]]\n`;
export const pyMarker = code => `\n\n[[py:${b64u8(code)}]]\n`;
const unb64u8 = s => { try { return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); } catch { return ''; } };
export const stripMarkers = t => String(t || '')
  .replace(/!\[([^\]\n]{0,200})\]\(data:image\/[^)]+\)/g, (_, alt) => `[image created${alt ? ': ' + alt : ''}]`) // รูปที่เก็บเป็น data URL (หลายร้อย KB) ไม่ส่งให้โมเดลอ่านเป็นข้อความ
  .replace(/\[\[dl:([^|\]\n]{1,120})\|[A-Za-z0-9+/=]+\]\]/g, '[file created: $1]')
  .replace(/\[\[vid:(\d+)\]\]/g, '[video #$1 created]')
  .replace(/\[\[uf:(\d+)\|(\d+)\|([^\]\n]{0,120})\]\]/g, '[account file file_id=$1 v$2: $3]')
  .replace(/\[\[art:(\d+)\|(\d+)\|([^\]\n]{0,120})\]\]/g, '[artifact id=$1 v$2: $3]')
  .replace(/\[\[mem:\d+\|([^\]\n]{1,300})\]\]/g, '[remembered: $1]')
  .replace(/\[\[approve:\d+\|([^\]\n]{1,120})\]\]/g, '[asked the user to approve: $1]')
  .replace(/\[\[py:([A-Za-z0-9+/=]+)\]\]/g, (_, b) => 'Python code I ran:\n```python\n' + unb64u8(b).slice(0, 6000) + '\n```'); // โมเดลเห็นโค้ดที่เคยรัน (แก้ต่อได้) แต่ไม่เห็นไฟล์ base64
