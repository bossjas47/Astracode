// ---------- เครื่องมือแบบ native (function calling) ของแชตและโหมด Code ----------
// โหมด Code: อ่าน/ค้น/แก้ไฟล์โปรเจกต์ผ่าน tool แทนบรรทัด READ/GREP/LIST และบล็อก path= ที่โมเดลต้องพิมพ์เอง
// การแก้ไฟล์ไม่เขียนลงฐานข้อมูลตรงๆ: แปลงเป็นบล็อก path= / SEARCH-REPLACE / DELETE ต่อท้ายคำตอบ หน้าเว็บจึงตรวจ/นำไปใช้/ย้อนกลับได้เหมือนเดิม
// แต่ตรวจกับไฟล์จริงก่อน (ข้อความเดิมต้องพบที่เดียว) ผิดก็บอกโมเดลให้แก้ในคำตอบเดียวกัน ไม่ต้องให้ผู้ใช้ส่งข้อความตามอีกรอบ
import { findBlock, problemOf } from './edits.js';
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
];
export const CODE_TOOL_NAMES = new Set(CODE_TOOLS.map(t => t.function.name));
export const WRITE_TOOLS = new Set(['edit_file', 'write_file', 'delete_file']);

export const CODE_TOOLS_NOTE = `

NATIVE TOOLS ARE ON in this conversation and replace the text protocol described above for files:
- Look at files with read_file, grep, glob and list_dir. Put every read you need in ONE turn (several tool calls at once) instead of one file per turn.
- Change files only with edit_file (old_string copied exactly from read_file output, without the line-number prefix), write_file (new files or full rewrites) and delete_file. Do not write READ/GREP/LIST lines, path= blocks or SEARCH/REPLACE in your text: they are no longer needed.
- Each successful change is shown to the user and applied to the project. If a tool returns an error, correct the call and try again in the next turn.
- Write your short closing summary as text in the SAME turn as your last edit calls: a turn that only changes files successfully ends your answer.
- RUN lines and the ask block still work as described above.`;

const LANG = { js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', html: 'html', htm: 'html', css: 'css', json: 'json', md: 'md', py: 'python', sh: 'bash', yml: 'yaml', yaml: 'yaml', svg: 'svg', xml: 'xml', txt: 'text', vue: 'vue', svelte: 'svelte' };
const langOf = p => LANG[(p.split('.').pop() || '').toLowerCase()] || '';
const fence = (path, body) => `\n\n\`\`\`${langOf(path)} path=${path}\n${body.replace(/\n$/, '')}\n\`\`\`\n`;
const FENCE_LINE = /^[ \t]*```/m; // บรรทัดที่ขึ้นต้นด้วย ``` จะปิดบล็อกก่อนจบไฟล์ (หน้าเว็บอ่านผิด)
const isImg = c => typeof c === 'string' && c.startsWith('data:');
export const globRe = g => new RegExp('^' + String(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*') + '$', 'i');
const clean = p => String(p ?? '').trim().replace(/^\.\//, '').replace(/^\/+/, '');

// ไฟล์ของคำตอบนี้: เนื้อหาปัจจุบัน + การแก้ที่ทำไปแล้วในคำตอบเดียวกัน (อ่านซ้ำแล้วเห็นของที่แก้)
export const codeWorkspace = rows => ({ files: new Map(rows.map(r => [r.path, r.content])), budget: 200e3 });

// คืน { result: ข้อความให้โมเดล, emit: ข้อความต่อท้ายคำตอบ (การแก้ไฟล์), ok, label: ป้ายให้หน้าเว็บ }
export function codeTool(ws, name, a = {}) {
  const path = clean(a.path), F = ws.files;
  const fail = (msg, label) => ({ result: 'Error: ' + msg, emit: '', ok: false, label });
  if (name === 'read_file') {
    const label = 'อ่าน ' + path;
    if (!F.has(path)) return fail(`file not found: ${path}. Use list_dir or glob to see the files.`, label);
    const c = F.get(path);
    if (isImg(c)) return { result: `${path} is an image (~${Math.round(c.length / 1365)}KB). Use it in HTML with <img src="${path}"> or in CSS with url(${path}).`, emit: '', ok: true, label };
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
      if (at === -1) return fail(`old_string matches several places in ${path}; add more neighbouring lines so it matches one place, or set replace_all`, label);
      if (!at) return fail(`old_string not found in ${path}. read_file it again and copy the text exactly (without the line-number prefix).`, label);
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
