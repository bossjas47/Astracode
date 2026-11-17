// ตัวอ่านคำตอบ AI ฝั่งเซิร์ฟเวอร์ (Agent เบื้องหลัง): บล็อก path=… / SEARCH-REPLACE / DELETE · ตรรกะเดียวกับ public/code.js (tests/core.test.mjs เทียบผลสองฝั่งให้ตรงกัน)
export const NOT_FILE_LANG = /^(?:bash|sh|shell|zsh|console|cmd|powershell|ps1|diff|patch|text|txt|log|output)$/i;
const FILE_NAME = /^[\w][\w./-]{0,150}\.[A-Za-z0-9]{1,8}$/;
// ---------- แก้ไฟล์แบบ SEARCH/REPLACE (ประหยัด token กว่าส่งทั้งไฟล์) ----------
// บล็อก path=… ที่ข้างในเป็น <<<<<<< SEARCH / ======= / >>>>>>> REPLACE (ได้หลายคู่) → คำนวณเนื้อหาใหม่จากไฟล์ปัจจุบัน
const EDIT_RE = /^<{5,9} SEARCH[ \t]*\n([\s\S]*?)\n?={5,9}[ \t]*\n([\s\S]*?)\n?>{5,9} REPLACE[ \t]*$/gm;
export const isEditBody = t => /^<{5,9} SEARCH[ \t]*$/m.test(t) && /^>{5,9} REPLACE[ \t]*$/m.test(t);
// หาตำแหน่งข้อความเดิม: ตรงตัว → ไม่สนช่องว่างท้ายบรรทัด → ไม่สนการเยื้อง (ต้องพบแบบเดียวเท่านั้น)
export function findBlock(text, search) {
  const tryAt = (norm) => {
    const T = text.split('\n'), S = search.split('\n'), hits = [];
    for (let i = 0; i + S.length <= T.length; i++) if (S.every((l, k) => norm(T[i + k]) === norm(l))) hits.push(i);
    if (hits.length !== 1) return hits.length ? -1 : null;
    const i = hits[0]; let from = 0; for (let k = 0; k < i; k++) from += T[k].length + 1;
    let to = from; for (let k = 0; k < S.length; k++) to += T[i + k].length + (k < S.length - 1 ? 1 : 0); // ไม่รวมขึ้นบรรทัดใหม่หลังบรรทัดสุดท้ายของส่วนที่พบ
    return { from, to };
  };
  const exact = text.indexOf(search);
  if (exact >= 0) return text.indexOf(search, exact + 1) >= 0 ? -1 : { from: exact, to: exact + search.length };
  for (const norm of [l => l.replace(/\s+$/, ''), l => l.trim()]) { const r = tryAt(norm); if (r) return r; }
  return null;
}
// ใช้ทุกคู่ตามลำดับ · คืน { content } หรือ { error } · ใช้ซ้ำได้ (ถ้าข้อความใหม่อยู่ในไฟล์แล้ว ถือว่าใช้แล้ว)
export function applyEdits(cur, body) {
  let out = cur ?? '', n = 0;
  for (const m of body.matchAll(EDIT_RE)) {
    const search = m[1].replace(/\r/g, ''), rep = m[2].replace(/\r/g, '');
    if (!search.trim()) { if (cur == null && n === 0) { out = rep + '\n'; n++; continue; } return { error: 'ส่วน SEARCH ว่างเปล่า (ใช้ได้เฉพาะสร้างไฟล์ใหม่)' }; }
    if (cur == null) return { error: 'ไฟล์นี้ยังไม่มี แต่ใช้ SEARCH/REPLACE (ไฟล์ใหม่ให้ส่งทั้งไฟล์)' };
    const at = findBlock(out, search);
    if (at && at !== -1) { out = out.slice(0, at.from) + rep + out.slice(at.to); n++; continue; }
    if (rep.trim() && out.includes(rep.trim())) continue; // ใช้ไปแล้ว
    return { error: at === -1 ? `ข้อความใน SEARCH ซ้ำหลายที่ในไฟล์ (ระบุบรรทัดรอบข้างให้ชัดขึ้น): ${search.split('\n')[0].slice(0, 80)}` : `ไม่พบข้อความใน SEARCH ในไฟล์นี้ (ต้องตรงกับไฟล์ปัจจุบัน): ${search.split('\n')[0].slice(0, 80)}` };
  }
  return { content: out.replace(/\n?$/, '\n') };
}
// ตรวจก่อนเขียนทับ (เฉพาะที่ตัดสินได้แน่: JSON และไฟล์หดผิดปกติ) · ฝั่งเซิร์ฟเวอร์รัน eval ไม่ได้จึงไม่ตรวจ syntax JS
export function problemOf(path, next, cur) {
  if (/\.json$/i.test(path)) { try { JSON.parse(next); } catch (e) { return `JSON ไม่ถูกต้อง: ${e.message}`; } }
  if (cur && cur.length > 2000 && next.length < cur.length * 0.5 && !/\.(?:md|txt|csv|log)$/i.test(path)) return `ไฟล์หดลงเหลือ ${Math.round(next.length / cur.length * 100)}% ของเดิม (${cur.length} → ${next.length} ตัวอักษร) น่าจะตัดเนื้อหาหาย`;
  return '';
}
// ไฟล์ที่ AI ต้องการเขียน/ลบจากคำตอบ (getFile(path) = เนื้อหาปัจจุบันหรือ null)
export function changesOf(text, getFile) {
  const map = new Map(); text = String(text || ''); let last = 0;
  for (const m of text.matchAll(/```([^\n`]*)\n([\s\S]*?)\n?```/g)) {
    const info = m[1].trim(), before = text.slice(last, m.index); last = m.index + m[0].length;
    let path = info.match(/\bpath=([^\s`]+)/)?.[1];
    if (!path) {
      const [lang, ...rest] = info.split(/\s+/);
      if (NOT_FILE_LANG.test(lang)) continue;
      path = rest.map(x => x.replace(/^(?:file|filename|title|name)=["']?|["']$/g, '')).find(x => FILE_NAME.test(x));
      if (!path) {
        const line = before.split('\n').map(x => x.trim()).filter(Boolean).at(-1) || '';
        const f = line.length < 160 && line.match(/^(?:#{1,6}\s*|\*{1,2}|(?:file|ไฟล์)\s*[:：]?\s*)?[`*]*([\w][\w./-]{0,150}\.[A-Za-z0-9]{1,8})[`*]*(?=$|[\s:：(（\-–—])/i);
        if (f && FILE_NAME.test(f[1]) && !/^https?:/i.test(f[1])) path = f[1];
      }
    }
    if (path && isEditBody(m[2])) {
      const prev = map.get(path), cur = prev && !prev.error ? prev.content : getFile(path), r = applyEdits(cur, m[2]);
      map.set(path, r.error ? { path, error: r.error, edit: true } : { path, content: r.content, edit: true });
    } else if (path) map.set(path, { path, content: m[2].replace(/\n?$/, '\n') });
  }
  for (const m of text.matchAll(/^DELETE path=(\S+)/gm)) map.set(m[1], { path: m[1], del: true });
  return [...map.values()];
}

// ตรวจวงเล็บ/ปีกกา/วงเล็บเหลี่ยมและเครื่องหมายคำพูดของ JS/CSS ว่าปิดครบและจับคู่ถูก (ไม่ใช้ eval จึงไม่ใช่ตัว parse จริง · เป็น "คำเตือน" ไม่บล็อกการเขียนไฟล์)
// shortcut: ข้าม comment/string/template/regex แบบเดาจากบริบท ไฟล์ที่เขียนแปลกมากอาจเตือนผิด · ถ้าต้องการแม่นกว่านี้ให้ใช้ parser จริง
export function syntaxWarning(path, text) {
  const css = /\.css$/i.test(path); if (!css && !/\.(?:js|mjs|cjs|jsx|ts|tsx)$/i.test(path)) return '';
  const pairs = { ')': '(', ']': '[', '}': '{' }, stack = []; let i = 0, line = 1, prev = '';
  const regexOk = () => prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /(?:return|typeof|case|in|of|delete|void|throw|else)$/.test(prev);
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) return `คอมเมนต์ /* ที่บรรทัด ${line} ไม่ปิด`; line += (text.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue; }
    if (!css && c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c, start = line; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; if (text[i] === '\n') { if (q !== '`') return `เครื่องหมายคำพูด ${q} ที่บรรทัด ${start} ไม่ปิดในบรรทัดเดียวกัน`; line++; } i++; }
      if (i >= text.length) return `เครื่องหมายคำพูด ${q} ที่บรรทัด ${start} ไม่ปิด`;
      i++; prev = 'a'; continue;
    }
    if (!css && c === '/' && regexOk()) { let j = i + 1, cls = false; while (j < text.length && text[j] !== '\n' && (text[j] !== '/' || cls)) { if (text[j] === '\\') j++; else if (text[j] === '[') cls = true; else if (text[j] === ']') cls = false; j++; } if (text[j] === '/') { i = j + 1; prev = 'a'; continue; } }
    if (c === '(' || c === '[' || c === '{') stack.push({ c, line });
    else if (c in pairs) { const t = stack.pop(); if (!t || t.c !== pairs[c]) return `'${c}' ที่บรรทัด ${line} ไม่มีตัวเปิดที่ตรงกัน${t ? ` (ตัวเปิดล่าสุดคือ '${t.c}' ที่บรรทัด ${t.line})` : ''}`; }
    if (!/\s/.test(c)) prev = /[\w$]/.test(c) ? (text.slice(Math.max(0, i - 8), i + 1).match(/[A-Za-z]+$/)?.[0] || 'a') : c;
    i++;
  }
  const t = stack.at(-1); return t ? `'${t.c}' ที่บรรทัด ${t.line} ไม่ถูกปิด` : '';
}
