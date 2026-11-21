// ไฟล์ในบัญชี (แบบ Cowork): Excel / Word ที่ AI สร้างหรือลูกค้าแนบ เก็บในบัญชี · AI แก้ต่อได้ทีละจุด (edit_file) · เก็บ 20 เวอร์ชันย้อนกลับได้
// sheet = { sheets: [{ name, rows: [[ค่า | "=สูตร"]], widths?: [ความกว้างต่อคอลัมน์], freeze?: แถว, header?: bool, fmt?: { "C": "#,##0.00" } }] }
// doc   = { md: "Markdown" }
import { err, json } from './core.js';

export const UF_MAX = 1.5e6, UF_VERS = 20, UF_PER_USER = 300, UF_ROWS = 20000, UF_COLS = 200;
export const UF_TABLES = [
  'CREATE TABLE IF NOT EXISTS user_files (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, chat_id INTEGER, name TEXT NOT NULL, kind TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS user_files_user ON user_files(user_id, updated_at)',
  'CREATE TABLE IF NOT EXISTS user_file_versions (file_id INTEGER NOT NULL, ver INTEGER NOT NULL, data TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (file_id, ver))',
];
export const ufMarker = (id, ver, name) => `\n\n[[uf:${id}|${ver}|${String(name).replace(/[\]|\n]/g, ' ')}]]\n`;
export const kindOf = name => /\.(xlsx|xlsm|xls|ods|csv)$/i.test(name) ? 'sheet' : 'doc';
const cleanName = n => String(n || '').replace(/[\\/:*?"<>|[\]\n\r]+/g, '_').trim().slice(0, 100);

// ---------- ตำแหน่งเซลล์ ----------
export const colNum = s => { let n = 0; for (const c of String(s).toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
export const colName = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const cellRef = ref => { const m = /^([A-Z]{1,3})(\d{1,6})$/i.exec(String(ref || '').trim()); if (!m) throw new Error('bad cell reference: ' + ref); return { c: colNum(m[1]), r: +m[2] - 1 }; };
const val = v => v == null ? '' : typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 32000);

// ---------- แปลงเนื้อหาจาก create_file ----------
export function parseSheetContent(content) {
  try { const j = JSON.parse(content); if (Array.isArray(j?.sheets)) return normBook(j); } catch {}
  return normBook({ sheets: [{ name: 'Sheet1', rows: csvRows(content), header: true }] });
}
export function csvRows(t) {
  const rows = []; let row = [], cur = '', q = false; t = String(t || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(v => v !== '' && !/^0\d/.test(v) && /^-?\d+(\.\d+)?$/.test(v.trim()) ? +v : v));
}
export function normBook(b) {
  const sheets = (Array.isArray(b?.sheets) ? b.sheets : []).slice(0, 30).map((s, k) => ({
    name: String(s?.name || 'Sheet' + (k + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet' + (k + 1),
    rows: (Array.isArray(s?.rows) ? s.rows : []).slice(0, UF_ROWS).map(r => (Array.isArray(r) ? r : [r]).slice(0, UF_COLS).map(val)),
    ...(Array.isArray(s?.widths) ? { widths: s.widths.slice(0, UF_COLS).map(w => Math.max(0, Math.min(120, +w || 0))) } : {}),
    ...(s?.freeze ? { freeze: Math.max(0, Math.min(50, +s.freeze | 0)) } : {}),
    ...(s?.header === false ? { header: false } : { header: true }),
    ...(s?.fmt && typeof s.fmt === 'object' ? { fmt: Object.fromEntries(Object.entries(s.fmt).filter(([k]) => /^[A-Z]{1,3}$/i.test(k)).slice(0, UF_COLS).map(([k, v]) => [k.toUpperCase(), String(v).slice(0, 40)])) } : {}),
  }));
  if (!sheets.length) sheets.push({ name: 'Sheet1', rows: [], header: true });
  return { sheets };
}

// ---------- AI อ่านไฟล์: ตารางพร้อมเลขแถว/คอลัมน์ (เห็นสูตรเป็น =...) ----------
export function sheetText(book, only, max = 150000) {
  let out = '';
  for (const s of book.sheets) {
    if (only && s.name !== only) continue;
    const w = Math.max(0, ...s.rows.map(r => r.length));
    out += `--- sheet "${s.name}" · ${s.rows.length} rows × ${w} cols${s.fmt ? ' · formats ' + JSON.stringify(s.fmt) : ''} ---\n\t` + Array.from({ length: w }, (_, c) => colName(c)).join('\t') + '\n';
    for (let r = 0; r < s.rows.length; r++) { out += (r + 1) + '\t' + s.rows[r].map(v => String(v).replace(/[\t\n]/g, ' ')).join('\t') + '\n'; if (out.length > max) return out + `…(cut; ask with sheet="${s.name}" for one sheet)`; }
  }
  return out || 'No sheet with that name. Sheets: ' + book.sheets.map(s => s.name).join(', ');
}

// ---------- แก้ไฟล์ทีละคำสั่ง ----------
const sheetOf = (b, name) => { const s = name ? b.sheets.find(x => x.name === name) : b.sheets[0]; if (!s) throw new Error(`no sheet "${name}". Sheets: ${b.sheets.map(x => x.name).join(', ')}`); return s; };
const put = (s, r, c, v) => { if (r >= UF_ROWS || c >= UF_COLS) throw new Error('sheet is limited to ' + UF_ROWS + ' rows and ' + UF_COLS + ' columns'); while (s.rows.length <= r) s.rows.push([]); const row = s.rows[r]; while (row.length < c) row.push(''); row[c] = val(v); };
const fill = (tpl, r) => String(tpl).replace(/\{r\}/g, r + 1); // "=B{r}*C{r}" → แถวจริง
export function applySheetOps(book, ops) {
  const b = structuredClone(book), done = [];
  for (const o of ops) {
    const s = () => sheetOf(b, o.sheet);
    switch (o.op) {
      case 'set_cells': { const sh = s(); for (const [ref, v] of Object.entries(o.cells || {})) { const { r, c } = cellRef(ref); put(sh, r, c, v); } done.push(`set ${Object.keys(o.cells || {}).length} cells`); break; }
      case 'write_rows': { const sh = s(), { r, c } = cellRef(o.start || 'A1'); (o.rows || []).forEach((row, i) => (Array.isArray(row) ? row : [row]).forEach((v, j) => put(sh, r + i, c + j, v))); done.push(`wrote ${(o.rows || []).length} rows at ${o.start || 'A1'}`); break; }
      case 'append_rows': { const sh = s(); for (const row of o.rows || []) { const r = sh.rows.length; (Array.isArray(row) ? row : [row]).forEach((v, j) => put(sh, r, j, typeof v === 'string' ? fill(v, r) : v)); } done.push(`appended ${(o.rows || []).length} rows`); break; }
      case 'insert_rows': { const sh = s(), at = Math.max(0, (+o.at || 1) - 1); sh.rows.splice(at, 0, ...(o.rows || [[]]).map(r => (Array.isArray(r) ? r : [r]).map(val))); done.push(`inserted ${(o.rows || [[]]).length} rows at row ${at + 1}`); break; }
      case 'delete_rows': { const sh = s(), at = Math.max(0, (+o.from || 1) - 1); sh.rows.splice(at, Math.max(1, +o.count || 1)); done.push(`deleted rows from ${at + 1}`); break; }
      case 'add_column': { // คอลัมน์ใหม่: หัว + ค่า หรือสูตรแม่แบบ "=B{r}-C{r}" ทุกแถวข้อมูล
        const sh = s(), w = Math.max(0, ...sh.rows.map(r => r.length)), c = o.at ? colNum(o.at) : w, hasH = sh.header !== false;
        if (o.at) sh.rows.forEach(r => { if (r.length > c) r.splice(c, 0, ''); });
        if (hasH && o.header != null) put(sh, 0, c, o.header);
        const start = hasH ? 1 : 0;
        for (let r = start; r < sh.rows.length; r++) { const v = o.formula ? fill(o.formula, r) : Array.isArray(o.values) ? o.values[r - start] : undefined; if (v !== undefined) put(sh, r, c, v); }
        done.push(`added column ${colName(c)}${o.header ? ' "' + o.header + '"' : ''}`); break;
      }
      case 'delete_columns': { const sh = s(), c = colNum(o.col || 'A'), n = Math.max(1, +o.count || 1); sh.rows.forEach(r => r.splice(c, n)); done.push(`deleted ${n} column(s) from ${o.col}`); break; }
      case 'sort': { const sh = s(), c = colNum(o.col || 'A'), h = sh.header !== false ? 1 : 0, body = sh.rows.slice(h); body.sort((x, y) => { const a = x[c] ?? '', z = y[c] ?? ''; const d = typeof a === 'number' && typeof z === 'number' ? a - z : String(a).localeCompare(String(z), 'th'); return o.desc ? -d : d; }); sh.rows = [...sh.rows.slice(0, h), ...body]; done.push(`sorted by ${o.col}${o.desc ? ' desc' : ''} (formulas are not re-pointed)`); break; }
      case 'add_sheet': { if (b.sheets.length >= 30) throw new Error('max 30 sheets'); const n = String(o.name || 'Sheet' + (b.sheets.length + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); if (b.sheets.some(x => x.name === n)) throw new Error(`sheet "${n}" already exists`); b.sheets.push(normBook({ sheets: [{ ...o, name: n }] }).sheets[0]); done.push(`added sheet "${n}"`); break; }
      case 'rename_sheet': { const sh = s(); sh.name = String(o.name || sh.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); done.push(`renamed sheet to "${sh.name}"`); break; }
      case 'delete_sheet': { if (b.sheets.length < 2) throw new Error('cannot delete the only sheet'); const sh = s(); b.sheets.splice(b.sheets.indexOf(sh), 1); done.push(`deleted sheet "${sh.name}"`); break; }
      case 'format': {
        const sh = s();
        if (Array.isArray(o.widths)) sh.widths = o.widths.slice(0, UF_COLS).map(w => Math.max(0, Math.min(120, +w || 0)));
        if (o.freeze != null) sh.freeze = Math.max(0, Math.min(50, +o.freeze | 0));
        if (o.header != null) sh.header = !!o.header;
        if (o.number_formats) sh.fmt = { ...(sh.fmt || {}), ...Object.fromEntries(Object.entries(o.number_formats).filter(([k]) => /^[A-Z]{1,3}$/i.test(k)).map(([k, v]) => [k.toUpperCase(), String(v).slice(0, 40)])) };
        done.push('formatted'); break;
      }
      default: throw new Error(`unknown op "${o.op}" for a spreadsheet`);
    }
  }
  return { data: normBook(b), done };
}
export function applyDocOps(doc, ops) {
  let md = String(doc.md || ''); const done = [];
  for (const o of ops) {
    if (o.op === 'replace') {
      const f = String(o.find || ''); if (!f) throw new Error('replace needs find');
      if (!md.includes(f)) throw new Error('text not found: ' + f.slice(0, 80) + ' (read_file first and copy the exact text)');
      md = o.all ? md.split(f).join(String(o.with ?? '')) : md.replace(f, () => String(o.with ?? '')); done.push('replaced text');
    } else if (o.op === 'insert_after') {
      const f = String(o.find || ''), i = md.indexOf(f); if (!f || i < 0) throw new Error('text not found: ' + f.slice(0, 80));
      md = md.slice(0, i + f.length) + '\n\n' + String(o.text || '') + md.slice(i + f.length); done.push('inserted text');
    } else if (o.op === 'append') { md = md.replace(/\s*$/, '') + '\n\n' + String(o.text || ''); done.push('appended text'); }
    else if (o.op === 'rewrite') { md = String(o.text || ''); done.push('rewrote document'); }
    else throw new Error(`unknown op "${o.op}" for a document (use replace, insert_after, append, rewrite)`);
  }
  if (md.length > UF_MAX) throw new Error('document is too long');
  return { data: { md }, done };
}

// ---------- เก็บ ----------
export async function saveNew(env, u, cid, name, kind, data) {
  const s = JSON.stringify(data); if (s.length > UF_MAX) throw new Error('file is too large (max 1.5 MB of data)');
  if ((await env.DB.prepare('SELECT COUNT(*) n FROM user_files WHERE user_id=?').bind(u.id).first()).n >= UF_PER_USER) throw new Error(`เก็บไฟล์ในบัญชีได้ไม่เกิน ${UF_PER_USER} ไฟล์ ลบไฟล์เก่าก่อน`);
  const now = Date.now(), row = await env.DB.prepare('INSERT INTO user_files (user_id,chat_id,name,kind,data,size,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id').bind(u.id, cid || null, cleanName(name), kind, s, s.length, now, now).first();
  await env.DB.prepare('INSERT INTO user_file_versions (file_id,ver,data,note,created_at) VALUES (?,1,?,?,?)').bind(row.id, s, 'created', now).run();
  return { id: row.id, ver: 1 };
}
async function saveVer(env, f, data, note) {
  const s = JSON.stringify(data); if (s.length > UF_MAX) throw new Error('file is too large (max 1.5 MB of data)');
  const ver = f.ver + 1, now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE user_files SET ver=?, data=?, size=?, updated_at=? WHERE id=?').bind(ver, s, s.length, now, f.id),
    env.DB.prepare('INSERT INTO user_file_versions (file_id,ver,data,note,created_at) VALUES (?,?,?,?,?)').bind(f.id, ver, s, String(note || '').slice(0, 200), now),
    env.DB.prepare('DELETE FROM user_file_versions WHERE file_id=? AND ver<=?').bind(f.id, ver - UF_VERS),
  ]);
  return ver;
}
const getFile = (env, u, id) => env.DB.prepare('SELECT * FROM user_files WHERE id=? AND user_id=?').bind(+id || 0, u.id).first();

// ---------- เครื่องมือของ AI ----------
export async function fileTool(env, u, cid, name, a) {
  const fail = (m, label) => ({ result: 'Error: ' + m, ok: false, label });
  if (name === 'list_account_files') {
    const L = (await env.DB.prepare('SELECT id,name,kind,ver,updated_at FROM user_files WHERE user_id=? ORDER BY updated_at DESC LIMIT 40').bind(u.id).all()).results;
    return { result: L.length ? L.map(f => `file_id=${f.id} · ${f.name} · ${f.kind} · v${f.ver}`).join('\n') : 'The account has no saved files yet.', ok: true, label: 'ดูไฟล์ในบัญชี' };
  }
  const f = await getFile(env, u, a.file_id); if (!f) return fail('no file with that file_id in this account (use list_account_files)', 'ไฟล์');
  const data = JSON.parse(f.data);
  if (name === 'read_account_file') return { result: `file_id=${f.id} "${f.name}" v${f.ver}\n` + (f.kind === 'sheet' ? sheetText(data, a.sheet) : String(data.md || '').slice(0, 150000)), ok: true, label: 'อ่าน ' + f.name };
  if (name === 'edit_account_file') {
    const ops = Array.isArray(a.ops) ? a.ops.slice(0, 200) : []; if (!ops.length) return fail('ops is empty', 'แก้ ' + f.name);
    let r; try { r = f.kind === 'sheet' ? applySheetOps(data, ops) : applyDocOps(data, ops); } catch (x) { return fail(x.message + ' — nothing was changed', 'แก้ ' + f.name); }
    let ver; try { ver = await saveVer(env, f, r.data, String(a.note || r.done.join(', '))); } catch (x) { return fail(x.message, 'แก้ ' + f.name); }
    return { result: `Saved "${f.name}" as v${ver}: ${r.done.join('; ')}. The file is open beside the chat and updates live; the user can undo to any earlier version. Do not paste the file content.`, emit: ufMarker(f.id, ver, f.name), ok: true, label: 'แก้ ' + f.name };
  }
  return fail('unknown file tool', 'ไฟล์');
}
// create_file .xlsx / .docx: เก็บในบัญชีด้วย (เปิดดูข้างแชต · แก้ต่อได้)
export async function createAccountFile(env, u, cid, fname, content) {
  const kind = kindOf(fname), data = kind === 'sheet' ? parseSheetContent(content) : { md: String(content) };
  const { id, ver } = await saveNew(env, u, cid, fname, kind, data);
  return { result: `File saved in the user's account: file_id=${id} "${fname}". It opens beside the chat and the user can download it as a real ${kind === 'sheet' ? 'Excel file with working formulas' : 'Word .docx'}. To change it later, call edit_account_file with file_id=${id} instead of creating a new file.`, emit: ufMarker(id, ver, fname), ok: true, label: 'สร้างไฟล์ ' + fname };
}

// ---------- API ของเจ้าของ ----------
export async function filesApi(req, env, u, path, M, url) {
  if (!path.startsWith('/api/files')) return null;
  if (path === '/api/files' && M === 'GET') return json((await env.DB.prepare('SELECT id,chat_id,name,kind,ver,size,updated_at FROM user_files WHERE user_id=? ORDER BY updated_at DESC LIMIT 300').bind(u.id).all()).results);
  if (path === '/api/files' && M === 'POST') { // ลูกค้าแนบไฟล์ Excel/Word ในแชต: เก็บเข้าบัญชีให้ AI แก้ได้
    const b = await req.json().catch(() => ({})), name = cleanName(b.name); if (!name) return err('ไม่มีชื่อไฟล์');
    const kind = b.kind === 'sheet' ? 'sheet' : 'doc', data = kind === 'sheet' ? normBook(b.data) : { md: String(b.data?.md || '') };
    try { return json(await saveNew(env, u, +b.chat_id || null, name, kind, data)); } catch (x) { return err(x.message, 413); }
  }
  const m = path.match(/^\/api\/files\/(\d+)(\/restore)?$/); if (!m) return err('not found', 404);
  const f = await getFile(env, u, m[1]); if (!f) return err('ไม่พบไฟล์', 404);
  if (!m[2] && M === 'GET') {
    const v = +url.searchParams.get('v'), row = v && v !== f.ver ? await env.DB.prepare('SELECT data FROM user_file_versions WHERE file_id=? AND ver=?').bind(f.id, v).first() : f;
    const vers = (await env.DB.prepare('SELECT ver, note, created_at FROM user_file_versions WHERE file_id=? ORDER BY ver DESC').bind(f.id).all()).results;
    return json({ id: f.id, name: f.name, kind: f.kind, ver: f.ver, shown: v || f.ver, chat_id: f.chat_id, versions: vers, data: JSON.parse(row?.data || f.data) });
  }
  if (!m[2] && M === 'PUT') { // ลูกค้าแก้เองในแผงข้างแชต
    const b = await req.json().catch(() => ({}));
    if (b.name) await env.DB.prepare('UPDATE user_files SET name=? WHERE id=?').bind(cleanName(b.name), f.id).run();
    if (!b.data) return json({ ok: true, ver: f.ver });
    try { return json({ ok: true, ver: await saveVer(env, f, f.kind === 'sheet' ? normBook(b.data) : { md: String(b.data.md || '') }, 'แก้โดยคุณ') }); } catch (x) { return err(x.message, 413); }
  }
  if (m[2] && M === 'POST') { // ย้อนเวอร์ชัน = บันทึกเป็นเวอร์ชันใหม่ (ย้อนกลับไปมาได้)
    const b = await req.json().catch(() => ({})), row = await env.DB.prepare('SELECT data FROM user_file_versions WHERE file_id=? AND ver=?').bind(f.id, +b.ver || 0).first();
    if (!row) return err('ไม่พบเวอร์ชันนี้', 404);
    return json({ ok: true, ver: await saveVer(env, f, JSON.parse(row.data), 'ย้อนไป v' + b.ver) });
  }
  if (!m[2] && M === 'DELETE') { await env.DB.batch([env.DB.prepare('DELETE FROM user_file_versions WHERE file_id=?').bind(f.id), env.DB.prepare('DELETE FROM user_files WHERE id=?').bind(f.id)]); return json({ ok: true }); }
  return err('not found', 404);
}
