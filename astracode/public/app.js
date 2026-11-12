// AstraCode frontend — vanilla JS, hash router
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = n => ((Math.round(Number(n || 0) * 100) / 100) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); // || 0 กัน "-0"
const num = n => Number(n || 0).toLocaleString('th-TH');
const when = t => t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';
// ไอคอนจาก Lucide (ISC license) — ic('name')
const ICONS = {"menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","up":"<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>","stop":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>","down":"<path d=\"m6 9 6 6 6-6\"/>","right":"<path d=\"m9 18 6-6-6-6\"/>","newchat":"<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\"/>","pen":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>","trash":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","more":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>","file":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/>","filetext":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>","filecode":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12.5 8 15l2 2.5\"/><path d=\"m14 12.5 2 2.5-2 2.5\"/>","clip":"<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\"/>","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>","compare":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M12 3v18\"/>","download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>","code":"<path d=\"m16 18 6-6-6-6\"/><path d=\"m8 6-6 6 6 6\"/>","tag":"<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","news":"<path d=\"M15 18h-5\"/><path d=\"M18 14h-8\"/><path d=\"M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2\"/><rect width=\"8\" height=\"4\" x=\"10\" y=\"6\" rx=\"1\"/>","braces":"<path d=\"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1\"/><path d=\"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1\"/>","activity":"<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>","mail":"<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>","dash":"<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>","pie":"<path d=\"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z\"/><path d=\"M21.21 15.89A10 10 0 1 1 8 2.83\"/>","trend":"<path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/>","bank":"<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","inbox":"<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"/><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/>","layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>","cpu":"<path d=\"M12 20v2\"/><path d=\"M12 2v2\"/><path d=\"M17 20v2\"/><path d=\"M17 2v2\"/><path d=\"M2 12h2\"/><path d=\"M2 17h2\"/><path d=\"M2 7h2\"/><path d=\"M20 12h2\"/><path d=\"M20 17h2\"/><path d=\"M20 7h2\"/><path d=\"M7 20v2\"/><path d=\"M7 2v2\"/><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"/>","coupon":"<path d=\"M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\"/><path d=\"M9 9h.01\"/><path d=\"m15 9-6 6\"/><path d=\"M15 15h.01\"/>","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","server":"<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\"/><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\"/><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\"/>","play":"<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>","refresh":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>","undo":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>","redo":"<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13\"/>","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>","search":"<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>","sparkles":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>","branch":"<path d=\"M15 6a9 9 0 0 0-9 9V3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/>","pull":"<path d=\"M12 17V3\"/><path d=\"m6 11 6 6 6-6\"/><path d=\"M19 21H5\"/>","push":"<path d=\"m18 9-6-6-6 6\"/><path d=\"M12 3v14\"/><path d=\"M5 21h14\"/>","palette":"<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","braces2":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1\"/><path d=\"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1\"/>","py":"<path d=\"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"m5 16-3 3 3 3\"/><path d=\"m9 22 3-3-3-3\"/>","web":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M11 18h2\"/><path d=\"M12 12v6\"/><path d=\"M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5\"/>","smartphone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>","percent":"<line x1=\"19\" x2=\"5\" y1=\"5\" y2=\"19\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"/>","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/>","terminal":"<path d=\"m7 11 2-2-2-2\"/><path d=\"M11 13h4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/>"};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const EFFORTS = [['', 'Instant'], ['low', 'Low'], ['high', 'High'], ['max', 'Max']];
const SUGGEST = ['อธิบายเรื่องนี้ให้เข้าใจง่าย: ', 'ช่วยเขียนโค้ด Python ที่', 'สรุปข้อความนี้ให้สั้นลง:\n', 'แปลเป็นภาษาอังกฤษ:\n'];
let me = null, installEvt = null, site = {};
async function api(path, opt = {}) {
  if (opt.body && !(opt.body instanceof FormData)) { opt.body = JSON.stringify(opt.body); opt.headers = { 'content-type': 'application/json' }; }
  const r = await fetch('/api' + path, opt);
  const json = r.headers.get('content-type')?.includes('json'), d = json ? await r.json().catch(() => null) : null;
  if (r.status === 401) me = null;
  if (!r.ok) { // ไม่ใช่ JSON = error จาก Vercel/Cloudflare เอง โชว์รหัสกับต้นข้อความไว้หาสาเหตุ
    const raw = json ? '' : (await r.text().catch(() => '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw Object.assign(new Error(d?.error || (d?.need2fa ? 'ต้องใช้รหัส 2FA' : `ผิดพลาด (HTTP ${r.status}${raw ? ': ' + raw : ''})`)), { data: d, status: r.status });
  }
  return d;
}

// ---------- Markdown ----------
function inline(s) { // s escape แล้ว
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/!\[([^\]]*)\]\(((?:\/api\/img\/[\w/.-]+)|(?:data:image\/(?:png|jpeg|webp);base64,[\w+/=]+))\)/g, '<img class="gen" src="$2" alt="$1" loading="lazy">'); // รูปที่ AI สร้าง (เฉพาะจากเว็บเรา)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
function blocks(text) {
  const L = esc(text).split('\n'); let out = '', i = 0;
  while (i < L.length) {
    const l = L[i]; let m;
    if (!l.trim()) { i++; continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { out += `<div class="h h${m[1].length}">${inline(m[2])}</div>`; i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out += '<hr>'; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
      const head = cells(l); i += 2; const rows = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) rows.push(cells(L[i++]));
      out += `<div class="tw"><table><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      continue;
    }
    if (/^&gt;\s?/.test(l)) { const q = []; while (i < L.length && /^&gt;\s?/.test(L[i])) q.push(L[i++].replace(/^&gt;\s?/, '')); out += `<blockquote>${blocks_(q)}</blockquote>`; continue; }
    if (isList(l)) {
      const ol = /^\s*\d/.test(l), items = [];
      while (i < L.length && (isList(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
        if (isList(L[i]) && !/^\s{2,}/.test(L[i]) && /^\s*\d/.test(L[i]) !== ol) break; // เปลี่ยนชนิดรายการ
        const x = L[i++], sub = /^\s{2,}/.test(x);
        if (isList(x)) items.push(`<li class="${sub ? 'sub' : ''}">${inline(x.replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`);
        else items[items.length - 1] = items.at(-1).replace(/<\/li>$/, '<br>' + inline(x.trim()) + '</li>');
      }
      out += ol ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`; continue;
    }
    const p = [];
    while (i < L.length && L[i].trim() && !/^(#{1,4}\s|&gt;)/.test(L[i]) && !isList(L[i]) && !/^\s*\|.*\|\s*$/.test(L[i])) p.push(inline(L[i++]));
    if (!p.length) p.push(inline(L[i++]));
    out += `<p>${p.join('<br>')}</p>`;
  }
  return out;
}
const blocks_ = lines => blocks(lines.join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
function md(s) {
  return String(s).split(/```/).map((part, i) => {
    if (!(i % 2)) return blocks(part);
    const nl = part.indexOf('\n'), info = nl >= 0 ? part.slice(0, nl).trim() : '', lang = info.split(/\s/)[0];
    const file = info.match(/\bfile=(\S+)/)?.[1]; // AI ทำเป็นไฟล์ให้ดาวน์โหลด: ```csv file=data.csv
    return `<div class="code ${file ? 'file' : ''}"><div class="code-h">${file ? `<span class="fname">${ic('filetext')} ${esc(file)}</span>` : `<span>${esc(lang || 'code')}</span>`}${/^(html|svg|xml)$/i.test(lang) ? `<button class="run-code">${ic('play')} แสดงผล</button>` : ''}<button class="cp-code">คัดลอก</button><button class="dl-code ${file ? 'main' : ''}" data-name="${esc(file || info.match(/\bpath=(\S+)/)?.[1]?.split('/').pop() || '')}" data-lang="${esc(lang)}" aria-label="ดาวน์โหลด">${ic('download')}${file ? ' ดาวน์โหลด' : ''}</button></div><pre><code>${esc(nl >= 0 ? part.slice(nl + 1) : part)}</code></pre></div>`;
  }).join('');
}
// ---------- Thinking: กล่องเหตุผลที่ AI คิด (กดเพื่อขยาย) ----------
const thinkLabel = m => m.streaming && !m.content ? '<span class="shimmer">กำลังคิด…</span>' : `Thinking${m.thinkSec ? ` · ${m.thinkSec} วินาที` : ''}`;
const thinkHTML = m => m.thinking ? `<details class="think"><summary>${ic('sparkles', 'sm')}<span class="think-s">${thinkLabel(m)}</span>${ic('down', 'sm chev')}</summary><div class="think-b">${esc(m.thinking)}</div></details>` : '';
// อัปเดตข้อความ AI ที่กำลังพิมพ์ โดยไม่ปิดกล่อง Thinking ที่ผู้ใช้เปิดไว้
function paintStreaming(el, m) {
  let th = el.querySelector('.think');
  if (m.thinking && !th) { el.insertAdjacentHTML('afterbegin', thinkHTML(m)); th = el.querySelector('.think'); }
  if (th) {
    const b = th.querySelector('.think-b'), stick = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    b.textContent = m.thinking; th.querySelector('.think-s').innerHTML = thinkLabel(m);
    if (stick) b.scrollTop = b.scrollHeight;
  }
  el.querySelector('.b').innerHTML = m.content ? md(m.content) : m.thinking ? '' : DOTS;
}
// นับเวลาคิด: จากความคิดคำแรก ถึงคำตอบคำแรก
function onStreamEvent(m, d) {
  if (d.th) { m.thinking = (m.thinking || '') + d.th; m.t0 ||= Date.now(); }
  if (d.t) { if (m.t0 && !m.thinkSec) m.thinkSec = Math.max(1, Math.round((Date.now() - m.t0) / 1000)); m.content += d.t; }
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const o = btn.textContent; btn.textContent = 'คัดลอกแล้ว ✓'; setTimeout(() => btn.textContent = o, 1500);
}

// ---------- ส่วนที่ใช้ซ้ำ ----------
const nav = () => `<nav class="nav"><a class="logo" href="/">AstraCode</a><span class="sp"></span>
  ${me ? `<a class="l" href="/chat">แชต</a><a class="l" href="/code">Code</a><a class="l" href="/plans">แพลน</a><a class="l" href="/pricing">ราคา</a><a class="l" href="/blog">บล็อก</a><a class="l" href="/account">บัญชี</a>${me.role === 'admin' ? '<a class="l" href="/admin">หลังบ้าน</a>' : ''}`
       : `<a class="l" href="/plans">แพลน</a><a class="l" href="/pricing">ราคา</a><a class="l" href="/blog">บล็อก</a><a class="btn blue sm" href="/login">เริ่มใช้ฟรี</a>`}</nav>`;
const page = html => { app.innerHTML = `<div class="view">${html}</div>`; };

function planTiles(plans, sel, period) {
  return `<div class="grid">${plans.map(p => `<div class="tile plan ${sel === p.id ? 'sel' : ''} ${p.featured ? 'feat' : ''}" data-plan="${p.id}">
    ${p.featured ? '<span class="badge">แนะนำ</span>' : ''}
    <div style="font:600 19px var(--display)">${esc(p.name)}</div>
    <div class="price">${p.price > 0 ? '฿' + baht(period === 'year' ? p.price_year : p.price) : 'ฟรี'}<small>${p.price > 0 ? (period === 'year' ? ' / ปี' : ' / เดือน') : ''}</small></div>
    ${period === 'year' && p.price_year ? `<div class="ok" style="font-size:13px">ประหยัด ${Math.round((1 - p.price_year / (p.price * 12)) * 100)}% เทียบรายเดือน</div>` : ''}
    <div class="muted">${esc(p.description)}</div>
    <ul class="feat-list">${p.models.map(m => `<li>${esc(m.name)} <span class="muted">~${num(m.week)} ข้อความ/สัปดาห์</span></li>`).join('')}</ul></div>`).join('')}</div>
    <p class="muted" style="text-align:center;margin-top:16px">จำนวนข้อความเป็นค่าประมาณ (ข้อความละ ~2,500 token) ใช้หลายโมเดลได้ในลิมิตเดียวกัน</p>`;
}
function compareTable(plans) {
  const names = [...new Set(plans.flatMap(p => p.models.map(m => m.name)))];
  return `<div class="tw"><table class="cmp"><tr><th></th>${plans.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr>
    <tr><td>ราคา/เดือน</td>${plans.map(p => `<td>${p.price > 0 ? '฿' + baht(p.price) : 'ฟรี'}</td>`).join('')}</tr>
    ${names.map(n => `<tr><td>${esc(n)}</td>${plans.map(p => { const m = p.models.find(x => x.name === n); return `<td>${m ? '~' + num(m.week) : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}
    <tr><td>รีเซ็ตลิมิต</td>${plans.map(() => '<td>4 ชม. + สัปดาห์</td>').join('')}</tr></table></div>
    <p class="muted" style="text-align:center">ตัวเลขในตาราง = จำนวนข้อความโดยประมาณต่อสัปดาห์</p>`;
}
const FAQ = [
  ['ลิมิต 4 ชั่วโมงกับลิมิตสัปดาห์ต่างกันยังไง', 'ลิมิต 4 ชั่วโมงกันการใช้รวดเดียวหมด ส่วนลิมิตสัปดาห์คือโควตารวม ทั้งสองแสดงเป็น % ด้านบนหน้าแชต ลิมิตสัปดาห์รีเซ็ตทุกวันจันทร์ 00:00'],
  ['ทำไมแต่ละโมเดลใช้ลิมิตไม่เท่ากัน', 'โมเดลที่เก่งกว่ามีต้นทุนสูงกว่า จึงกิน % เร็วกว่า DeepSeek ใช้ได้เยอะที่สุด'],
  ['Instant / Low / High / Max คืออะไร', 'คือระดับความคิดของ AI: Instant ตอบทันทีไม่คิดก่อน ส่วน Low, High และ Max ให้ AI คิดก่อนตอบ ยิ่งสูงยิ่งตอบโจทย์ยากได้ดี แต่ช้ากว่าและใช้ลิมิตมากกว่า'],
  ['จ่ายเงินยังไง', 'เลือกแพลน สแกน QR PromptPay แล้วอัปโหลดสลิป แอดมินตรวจและเปิดแพลนให้ แพลนใช้ได้ 30 วัน'],
  ['แนบไฟล์อะไรได้บ้าง', 'โค้ดและไฟล์ข้อความแทบทุกชนิด, PDF, Word (.docx), Excel (.xlsx) และรูป (เฉพาะโมเดลที่อ่านรูปได้) ครั้งละไม่เกิน 5 ไฟล์ ไฟล์ยาวจะใช้ลิมิตมากขึ้น และ PDF ที่เป็นภาพสแกนอ่านไม่ได้'],
  ['ต้องลงแอปไหม', 'ไม่ต้อง ใช้บนเว็บได้เลย หรือเพิ่มลงหน้าจอหลักเพื่อใช้เหมือนแอป'],
];
const faqHTML = () => FAQ.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('');
const installHTML = () => `<div class="grid">
  <div class="tile"><div style="font:600 19px var(--display)">iPhone / iPad</div><div class="muted">เปิดใน Safari → กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) → "เพิ่มไปยังหน้าจอโฮม"</div></div>
  <div class="tile"><div style="font:600 19px var(--display)">Android</div><div class="muted">เปิดใน Chrome → กด ⋮ มุมขวาบน → "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"</div>
  ${installEvt ? '<button class="btn blue sm" id="install" style="margin-top:8px">ติดตั้งเลย</button>' : ''}</div></div>`;
function bindInstall() {
  const b = $('#install'); if (!b) return;
  b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.remove(); };
}

// ---------- หน้าแรก ----------
async function landing() {
  const [plans, posts] = await Promise.all([api('/plans').catch(() => []), api('/blog').catch(() => [])]);
  page(nav() + `<section class="hero"><div class="name">AstraCode</div>
    <h1>AI ทุกตัว<br>ในมือถือเครื่องเดียว</h1>
    <p>ChatGPT, Claude, Gemini, DeepSeek และ Kimi ในเว็บเดียว เปิดบนมือถือได้ทันที ไม่ต้องลงแอป</p>
    <div class="row" style="justify-content:center"><a class="btn blue" href="/login">เริ่มใช้ฟรี</a><a class="btn out" href="#plans">ดูแพลน</a></div></section>
    <div class="wrap"><div class="band"><h2>ออกแบบมาเพื่อมือถือ</h2><div class="grid">
      <div class="tile"><div class="stat">5+</div><div class="muted">ผู้ให้บริการ AI ชั้นนำ สลับได้ในแชตเดียว</div></div>
      <div class="tile"><div class="stat">PWA</div><div class="muted">เพิ่มลงหน้าจอหลัก ใช้เหมือนแอปจริง</div></div>
      <div class="tile"><div class="stat">%</div><div class="muted">เห็นลิมิตชัดเจน รีเซ็ตทุก 4 ชั่วโมงและทุกสัปดาห์</div></div>
      <div class="tile"><div class="stat">฿</div><div class="muted">จ่ายผ่าน PromptPay เริ่มต้นหลักสิบบาท</div></div>
    </div></div>
    <div class="band"><h2>ทำได้มากกว่าแชต</h2><div class="grid">
      <a class="tile link" href="/code"><div class="stat">${ic('code')}</div><div style="font:600 19px var(--display)">Code</div><div class="muted">เขียนโค้ดคล้าย VS Code บนเว็บ ให้ AI แก้ไฟล์ รันผล แล้ว push ขึ้น GitHub</div></a>
      <div class="tile"><div class="stat">${ic('compare')}</div><div style="font:600 19px var(--display)">เทียบ 2 โมเดล</div><div class="muted">ถามครั้งเดียว ดูคำตอบสองโมเดลคู่กัน</div></div>
      <div class="tile"><div class="stat">${ic('globe')}</div><div style="font:600 19px var(--display)">ค้นเว็บ</div><div class="muted">ให้ AI ค้นข้อมูลล่าสุดพร้อมแหล่งอ้างอิง</div></div>
      <a class="tile link" href="/developers"><div class="stat">${ic('braces')}</div><div style="font:600 19px var(--display)">API</div><div class="muted">ใช้โมเดลทั้งหมดผ่าน API แบบ OpenAI จ่ายตามจริงจาก Wallet</div></a>
    </div></div>
    <div class="band" id="plans"><h2>แพลน</h2>${planTiles(plans)}</div>
    <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>
    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>
    <div class="band"><h2>คำถามที่พบบ่อย</h2>${faqHTML()}</div>
    ${posts.length ? `<div class="band"><h2>บทความล่าสุด</h2><div class="grid">${posts.slice(0, 3).map(postTile).join('')}</div></div>` : ''}
    ${footer()}</div>`);
  $('a[href="#plans"]').onclick = e => { e.preventDefault(); $('#plans').scrollIntoView({ behavior: 'smooth' }); };
  bindInstall();
}

// ---------- เข้าสู่ระบบ / สมัคร / ลืมรหัส / 2FA ----------
function auth() {
  const q = qs();
  if (q.get('ref')) localStorage.setItem('ref', q.get('ref'));
  const ref = localStorage.getItem('ref') || '';
  // mfa = Google/LINE ล็อกอินแล้วรอรหัส 2FA, code = อีเมลล็อกอินแล้วรอรหัส 2FA, verify = รอยืนยันอีเมล · Worker คุยกับ Firebase ให้ เบราว์เซอร์ไม่ต้องต่อ Google
  let mode = q.get('mfa') ? 'mfa' : 'login', msg = q.get('error') || '', cred = null;
  const forms = {
    login: () => `<label>อีเมล</label><input name="email" type="email" autocomplete="email" required>
      <label>รหัสผ่าน</label><input name="password" type="password" autocomplete="current-password" required>`,
    register: () => `<label>อีเมล</label><input name="email" type="email" autocomplete="email" required>
      <label>รหัสผ่าน (อย่างน้อย 8 ตัว)</label><input name="password" type="password" minlength="8" autocomplete="new-password" required>
      ${ref ? `<p class="muted">ชวนโดยโค้ด <b>${esc(ref)}</b> · จ่ายครั้งแรกได้เครดิตทั้งคู่</p>` : ''}`,
    forgot: () => `<p class="muted">ใส่อีเมลที่สมัครไว้ เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้</p><label>อีเมล</label><input name="email" type="email" autocomplete="email" required>`,
    verify: () => `<p>เราส่งลิงก์ยืนยันไปที่ <b>${esc(cred?.email)}</b> แล้ว กดลิงก์ในอีเมล แล้วกลับมากดปุ่มด้านล่าง</p><p class="muted">ไม่เห็นอีเมล? ดูในจดหมายขยะ</p>`,
    code: () => `<p class="muted">บัญชีนี้เปิด 2FA ไว้ ใส่รหัส 6 หลักจากแอป Authenticator</p><label>รหัส 2FA</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus>`,
  };
  forms.mfa = forms.code;
  const title = { login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก', forgot: 'ลืมรหัสผ่าน', verify: 'ยืนยันอีเมล', code: 'ยืนยันตัวตน 2 ขั้น', mfa: 'ยืนยันตัวตน 2 ขั้น' };
  const btn = { login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก', forgot: 'ส่งลิงก์', verify: 'ยืนยันแล้ว เข้าสู่ระบบ', code: 'ยืนยัน', mfa: 'ยืนยัน' };
  const done = async () => { localStorage.removeItem('ref'); await loadMe(); go(q.get('next') || '/chat'); };
  const send = async (action, code) => {
    const r = await api('/auth', { method: 'POST', body: { ...cred, action, ref, code } }).catch(x => { if (x.data?.need2fa) return { need2fa: true }; throw x; });
    if (r.verify) { if (action === 'check') throw new Error('ยังไม่ได้ยืนยัน กดลิงก์ในอีเมลก่อน'); mode = 'verify'; msg = ''; return draw(); }
    if (r.need2fa) { mode = 'code'; msg = ''; return draw(); }
    await done();
  };
  const draw = () => {
    const tabs = mode === 'login' || mode === 'register';
    page(nav() + `<div class="auth wrap"><h1>${title[mode]}</h1>
      ${tabs ? `<div class="tabs"><button class="${mode === 'login' ? 'on' : ''}" data-m="login">เข้าสู่ระบบ</button><button class="${mode === 'register' ? 'on' : ''}" data-m="register">สมัคร</button></div>` : ''}
      <form class="card" id="f">${tabs && (site.google || site.line) ? `<div class="social">${site.google ? `<a class="btn out" href="/api/oauth/google${ref ? '?ref=' + encodeURIComponent(ref) : ''}">ดำเนินการต่อด้วย Google</a>` : ''}
        ${site.line ? `<a class="btn out line" href="/api/oauth/line${ref ? '?ref=' + encodeURIComponent(ref) : ''}">ดำเนินการต่อด้วย LINE</a>` : ''}<div class="or"><span>หรือ</span></div></div>` : ''}
      ${forms[mode]()}
      <div class="err" id="e">${esc(msg)}</div><button class="btn blue" style="width:100%">${btn[mode]}</button>
      ${mode === 'verify' ? '<div class="row" style="justify-content:center;margin-top:12px"><button type="button" class="btn out sm" id="resend">ส่งลิงก์อีกครั้ง</button><a href="#" data-m="login">ใช้อีเมลอื่น</a></div>' : ''}
      ${mode === 'login' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="forgot">ลืมรหัสผ่าน?</a></p>' : ''}
      ${!tabs && mode !== 'verify' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="login">กลับไปเข้าสู่ระบบ</a></p>' : ''}
      <p class="muted" style="text-align:center;margin:12px 0 0">การ${mode === 'register' ? 'สมัคร' : 'ใช้งาน'}ถือว่ายอมรับ<a href="/terms">เงื่อนไขและนโยบายความเป็นส่วนตัว</a></p></form></div>`);
    app.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.preventDefault(); mode = b.dataset.m; msg = ''; draw(); });
    const busy = (b, on) => { b.disabled = on; b.classList.toggle('loading', on); };
    $('#resend')?.addEventListener('click', async e => {
      busy(e.target, true);
      try { await send('login'); } catch (x) { $('#e').textContent = x.message; busy(e.target, false); }
    });
    $('#f').onsubmit = async e => {
      e.preventDefault(); const b = e.submitter || $('#f .btn.blue'); busy(b, true); $('#e').textContent = '';
      const body = Object.fromEntries(new FormData(e.target));
      try {
        if (mode === 'mfa') { await api('/login/mfa', { method: 'POST', body: { ...body, token: q.get('mfa') } }); return await done(); }
        if (mode === 'forgot') { await api('/auth', { method: 'POST', body: { action: 'forgot', email: body.email } }); $('#e').innerHTML = '<span class="ok">ถ้ามีบัญชีนี้ เราส่งลิงก์ไปที่อีเมลแล้ว (ดูในจดหมายขยะด้วย)</span>'; return busy(b, false); }
        if (mode === 'verify') return await send('check');
        if (mode === 'code') return await send('check', body.code);
        cred = { email: body.email, password: body.password }; // เก็บในหน่วยความจำหน้านี้เท่านั้น ใช้ตอนกด "ยืนยันแล้ว"
        await send(mode);
      } catch (x) { $('#e').textContent = x.message; busy(b, false); }
    };
  };
  draw();
}
const loadMe = async () => { me = await api('/me').catch(() => null); };

function meters(u) {
  const m = (label, p, reset) => `<div class="meter ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" title="รีเซ็ต ${when(reset)}">${label} ${p}%<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
  return m('4 ชม.', u.pct4h, u.reset4h) + m('สัปดาห์', u.pctWeek, u.resetWeek);
}
// ---------- แนบไฟล์: แปลงเป็นข้อความในเบราว์เซอร์ก่อนส่ง ----------
const CDN = 'https://cdn.jsdelivr.net/npm/', PDFJS = CDN + 'pdfjs-dist@3.11.174/';
const LIBS = { // ล็อกเวอร์ชัน + SRI: ถ้าไฟล์บน CDN ถูกแก้ เบราว์เซอร์จะไม่รัน
  pdf: [PDFJS + 'build/pdf.min.js', 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'],
  pdfWorker: [PDFJS + 'build/pdf.worker.min.js', 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2'],
  mammoth: [CDN + 'mammoth@1.8.0/mammoth.browser.min.js', 'sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y'],
  jszip: [CDN + 'jszip@3.10.1/dist/jszip.min.js', 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG'],
  xlsx: [CDN + 'xlsx@0.18.5/dist/xlsx.full.min.js', 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'],
};
const FILE_MAX = 200000, FILES_MAX = 5, RAW_MAX = 20e6; // ตัวอักษรต่อไฟล์, จำนวนไฟล์, ขนาดไฟล์ดิบ
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonc|xml|ya?ml|toml|ini|env|log|html?|css|scss|sass|less|m?js|cjs|jsx|ts|tsx|vue|svelte|py|ipynb|rb|php|java|kt|kts|swift|go|rs|c|h|cpp|hpp|cc|cs|m|mm|sh|bash|zsh|ps1|bat|sql|r|lua|luau|dart|scala|pl|ex|exs|erl|hs|clj|gradle|conf|cfg|properties|tex|srt|vtt|gd|tscn|tres)$/i;
const loading = {};
const lib = k => loading[k] ||= new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = LIBS[k][0]; if (LIBS[k][1]) { s.integrity = LIBS[k][1]; s.crossOrigin = 'anonymous'; }
  s.onload = ok; s.onerror = () => { delete loading[k]; no(new Error('โหลดตัวอ่านไฟล์ไม่ได้ ลองใหม่อีกครั้ง')); };
  document.head.append(s);
});
async function pdfLib() {
  await lib('pdf');
  const o = pdfjsLib.GlobalWorkerOptions;
  if (!o.workerSrc) try { // โหลด worker แบบตรวจ SRI แล้วรันจาก blob
    const t = await (await fetch(LIBS.pdfWorker[0], { integrity: LIBS.pdfWorker[1] })).text();
    o.workerSrc = URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));
  } catch { o.workerSrc = LIBS.pdfWorker[0]; }
  return pdfjsLib;
}
const tok = n => n > 1000 ? '~' + Math.round(n / 3 / 100) / 10 + 'k token' : '~' + Math.ceil(n / 3) + ' token';
const FILE_RE = /\n*\[\[file:([^\]\n]+)\]\]\n([\s\S]*?)\n\[\[\/file\]\]/g;
const withFiles = (text, files) => text + files.map(f => `\n\n[[file:${f.name}]]\n${f.text}\n[[/file]]`).join('');

const nearBottom = box => box.scrollHeight - box.scrollTop - box.clientHeight < 120;
// ---------- แพลน + ชำระเงิน + เติม Wallet ----------
const PAY_STATUS = { pending: '<span class="warn">รออนุมัติ</span>', approved: '<span class="ok">สำเร็จ</span>', rejected: '<span class="bad">ไม่อนุมัติ</span>' };
async function plansPage() {
  const plans = await api('/plans');
  const hasYear = plans.some(p => p.price_year > 0);
  if (!me) { page(nav() + `<div class="wrap"><section class="hero" style="padding-bottom:24px"><h1>เลือกแพลน</h1></section>${planTiles(plans)}<p style="text-align:center;margin:28px"><a class="btn blue" href="/login">สมัครเพื่อเริ่มใช้</a></p><div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>${footer()}</div>`); return; }
  const pays = await api('/pay');
  let sel = null, period = 'month', coupon = null, tab = qs().get('topup') ? 'topup' : 'plan';
  const priceOf = p => period === 'year' && p.price_year ? p.price_year : p.price;
  const qr = amount => me.promptpay_id ? `<p class="muted">สแกนจ่ายผ่าน PromptPay แล้วอัปโหลดสลิป</p><img class="qr" alt="QR PromptPay" src="https://promptpay.io/${encodeURIComponent(me.promptpay_id)}/${amount}.png">` : '<p class="warn">ยังไม่ได้ตั้งค่า PromptPay</p>';
  const slipForm = label => `<form id="f" style="max-width:400px;margin:16px auto 0"><label>รูปสลิป</label><input type="file" name="slip" accept="image/*" required style="border-radius:20px">
    <div class="err" id="e"></div><button class="btn blue" style="width:100%">${label}</button><p class="muted" style="margin:12px 0 0">การชำระเงินถือว่ายอมรับ<a href="/terms">เงื่อนไขการคืนเงิน</a></p></form>`;
  const draw = () => {
    const p = plans.find(x => x.id === sel), total = p ? Math.max(0, priceOf(p) - (coupon?.discount || 0)) : 0;
    page(nav() + `<div class="wrap"><section class="hero" style="padding:48px 0 24px"><h1>${tab === 'topup' ? 'เติมเงิน Wallet' : 'เลือกแพลน'}</h1>
      <p>แพลนปัจจุบัน: ${esc(me.plan.name)}${me.plan.expires ? ' · หมดอายุ ' + when(me.plan.expires) : ''} · Wallet ฿${baht(me.balance)}</p>
      <div class="seg" style="margin-top:12px"><button data-tab="plan" class="${tab === 'plan' ? 'on' : ''}">ซื้อแพลน</button><button data-tab="topup" class="${tab === 'topup' ? 'on' : ''}">เติม Wallet</button></div></section>
      ${tab === 'plan' ? `
        ${hasYear ? `<div style="text-align:center;margin-bottom:16px"><div class="seg"><button data-per="month" class="${period === 'month' ? 'on' : ''}">รายเดือน</button><button data-per="year" class="${period === 'year' ? 'on' : ''}">รายปี</button></div></div>` : ''}
        ${planTiles(plans.filter(x => x.price > 0 && (period === 'month' || x.price_year > 0)), sel, period)}
        ${p ? `<div class="card pay" id="pay" style="text-align:center"><div style="font:600 24px var(--display)">${esc(p.name)} · ${period === 'year' ? '1 ปี' : '30 วัน'}</div>
          <div class="price" style="margin:8px 0">${coupon?.discount ? `<s class="muted" style="font-size:20px">฿${baht(priceOf(p))}</s> ` : ''}฿${baht(total)}</div>
          <form id="cf" class="row" style="max-width:400px;margin:0 auto;flex-wrap:nowrap"><input name="code" placeholder="โค้ดคูปอง" value="${esc(coupon?.code || '')}" autocapitalize="characters"><button class="btn out sm">ใช้</button></form>
          <div class="err" id="ce"></div>
          ${me.balance >= total && total > 0 ? `<button class="btn blue" id="wpay" style="margin:12px 0">จ่ายด้วย Wallet (฿${baht(me.balance)})</button><p class="muted">หรือโอนผ่าน PromptPay</p>` : ''}
          ${total > 0 ? qr(total) + slipForm('ส่งสลิป') : '<button class="btn blue" id="free" style="margin-top:12px">เปิดใช้แพลนฟรีด้วยคูปอง</button>'}</div>`
        : '<p class="muted" style="text-align:center">แตะแพลนเพื่อชำระเงิน</p>'}
        <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>`
      : `<div class="card pay" style="text-align:center;max-width:520px;margin:0 auto"><p class="muted">เงินใน Wallet ใช้กับ API สำหรับนักพัฒนา ใช้ต่อเมื่อลิมิตแพลนเต็ม (เปิดได้ในหน้าบัญชี) และจ่ายค่าแพลน</p>
          <label>จำนวนเงิน (บาท)</label><input id="amt" type="number" inputmode="decimal" min="${+site.topup_min || 20}" max="50000" step="1" value="${+site.topup_min || 100}" style="text-align:center;font-size:24px">
          <div class="row" style="justify-content:center;margin-top:8px">${[100, 300, 500, 1000].map(v => `<button class="btn out sm" data-amt="${v}">฿${v}</button>`).join('')}</div>
          <div id="tq">${qr(+site.topup_min || 100)}</div>${slipForm('ส่งสลิปเติมเงิน')}</div>`}
      ${pays.length ? `<div class="card"><div style="font:600 19px var(--display)">ประวัติการชำระ</div><div class="tw"><table class="tbl"><tr><th>วันที่</th><th>รายการ</th><th>ยอด</th><th>สถานะ</th><th></th></tr>
        ${pays.map(x => `<tr><td>${when(x.created_at)}</td><td>${x.kind === 'topup' ? 'เติม Wallet' : esc(x.plan_name) + (x.period === 'year' ? ' (รายปี)' : '')}</td><td>฿${baht(x.amount)}</td><td>${PAY_STATUS[x.status]}</td><td>${x.status === 'approved' ? `<a href="/receipt?id=${x.id}">ใบเสร็จ</a>` : ''}</td></tr>`).join('')}</table></div></div>` : ''}
      ${footer()}</div>`);
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
    app.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { period = b.dataset.per; coupon = null; if (sel && !plans.find(x => x.id === sel)?.price_year && period === 'year') sel = null; draw(); });
    app.querySelectorAll('[data-plan]').forEach(t => t.onclick = () => { sel = +t.dataset.plan; coupon = null; draw(); $('#pay')?.scrollIntoView({ behavior: 'smooth' }); });
    $('#cf')?.addEventListener('submit', async e => {
      e.preventDefault(); const code = new FormData(e.target).get('code').trim();
      if (!code) { coupon = null; return draw(); }
      try { coupon = await api('/coupon/check', { method: 'POST', body: { code, plan_id: sel, period } }); draw(); } catch (x) { $('#ce').textContent = x.message; }
    });
    const submit = async (fd, btn, errBox) => {
      btn.disabled = true;
      try { const r = await api('/pay', { method: 'POST', body: fd }); await loadMe(); if (r.approved) go(`/receipt?id=${r.id}`); else { alert('ส่งสลิปแล้ว รอแอดมินตรวจ'); boot(); } }
      catch (x) { errBox.textContent = x.message; btn.disabled = false; }
    };
    const planFd = () => { const fd = new FormData(); fd.append('plan_id', sel); fd.append('period', period); if (coupon) fd.append('coupon', coupon.code); return fd; };
    $('#wpay')?.addEventListener('click', e => { if (!confirm(`ตัดเงิน ฿${baht(total)} จาก Wallet?`)) return; const fd = planFd(); fd.append('wallet', '1'); submit(fd, e.target, $('#ce')); });
    $('#free')?.addEventListener('click', e => submit(planFd(), e.target, $('#ce')));
    const amt = $('#amt');
    if (amt) {
      const upd = () => { $('#tq').innerHTML = qr(Math.max(0, Math.round(+amt.value || 0))); };
      amt.oninput = upd; app.querySelectorAll('[data-amt]').forEach(b => b.onclick = () => { amt.value = b.dataset.amt; upd(); });
    }
    $('#f')?.addEventListener('submit', e => {
      e.preventDefault(); const fd = tab === 'plan' ? planFd() : new FormData();
      fd.append('slip', new FormData(e.target).get('slip'));
      if (tab === 'topup') { fd.append('kind', 'topup'); fd.append('amount', Math.round(+amt.value || 0)); }
      submit(fd, e.submitter, $('#e'));
    });
  };
  draw();
}

// ---------- เงื่อนไขการใช้บริการ ----------
const TERMS = [
  ['1. บริการ', 'AstraCode ให้บริการแชตกับโมเดล AI จากผู้ให้บริการหลายราย (เช่น OpenAI, Anthropic, Google, DeepSeek, Moonshot) ผ่านเว็บไซต์ รายชื่อโมเดลที่ใช้ได้ขึ้นอยู่กับแพลน และอาจเปลี่ยนแปลงได้ตามความพร้อมของผู้ให้บริการ'],
  ['2. บัญชีผู้ใช้', 'ผู้ใช้ต้องให้อีเมลที่ใช้งานได้ และรักษารหัสผ่านเป็นความลับ บัญชีหนึ่งใช้ได้หนึ่งคน ห้ามแชร์ ขาย หรือให้เช่าบัญชี หากพบการใช้งานผิดเงื่อนไข เราอาจระงับบัญชีโดยไม่คืนเงิน'],
  ['3. แพลนและการชำระเงิน', 'แพลนแบบชำระเงินมีอายุ 30 วันนับจากวันที่แอดมินอนุมัติสลิป การต่ออายุแพลนเดิมจะบวกเวลาต่อจากวันหมดอายุเดิม ชำระผ่าน PromptPay และแนบสลิปเท่านั้น สลิปปลอม สลิปซ้ำ หรือยอดไม่ตรงจะไม่ได้รับการอนุมัติ'],
  ['4. การคืนเงิน', 'ไม่คืนเงินหลังเปิดใช้แพลนแล้ว ยกเว้นกรณีระบบขัดข้องจนใช้งานไม่ได้ต่อเนื่องเกิน 72 ชั่วโมงโดยเป็นความผิดของเรา ซึ่งจะคืนเงินหรือชดเชยวันใช้งานตามสัดส่วน ติดต่อแอดมินภายใน 7 วันนับจากวันที่เกิดปัญหา'],
  ['4.1 Wallet และ API', 'เงินใน Wallet ใช้จ่ายค่าแพลน ค่า API สำหรับนักพัฒนา และค่าใช้งานเมื่อลิมิตแพลนเต็ม (ถ้าเปิดไว้) คิดตามราคาต่อ token ที่แสดงในหน้าราคา เงินใน Wallet ไม่มีวันหมดอายุ แต่ถอนเป็นเงินสดไม่ได้ เครดิตจากคูปองและการชวนเพื่อนไม่มีมูลค่าเป็นเงิน'],
  ['5. ลิมิตการใช้งาน', 'แต่ละแพลนมีลิมิตทุก 4 ชั่วโมงและลิมิตรายสัปดาห์ แสดงเป็น % ในหน้าแชต โมเดลที่ต้นทุนสูงกว่าและโหมดคิด (Low / High / Max) ใช้ลิมิตมากกว่า จำนวนข้อความที่แสดงในหน้าแพลนเป็นค่าประมาณ เราอาจปรับลิมิต ราคา หรือโมเดลในแพลนได้ โดยจะแจ้งล่วงหน้าบนเว็บไซต์ การเปลี่ยนแปลงมีผลกับรอบที่ชำระครั้งถัดไป'],
  ['6. การใช้งานที่ห้าม', 'ห้ามใช้บริการเพื่อกิจกรรมที่ผิดกฎหมาย หลอกลวง ละเมิดสิทธิ์ผู้อื่น สร้างมัลแวร์ หรือเนื้อหาที่ผิดนโยบายของผู้ให้บริการ AI ห้ามใช้โปรแกรมอัตโนมัติยิงคำขอ หรือพยายามเลี่ยงลิมิต'],
  ['7. คำตอบจาก AI', 'คำตอบสร้างโดย AI อาจไม่ถูกต้อง ไม่ครบถ้วน หรือล้าสมัย ผู้ใช้ควรตรวจสอบก่อนนำไปใช้ โดยเฉพาะเรื่องการแพทย์ กฎหมาย และการเงิน เราไม่รับผิดชอบความเสียหายจากการนำคำตอบไปใช้'],
  ['8. การเปลี่ยนแปลงบริการ', 'เราอาจหยุดให้บริการชั่วคราวเพื่อปรับปรุงระบบ หรือเมื่อผู้ให้บริการ AI ขัดข้อง และอาจแก้ไขเงื่อนไขนี้ได้ การใช้งานต่อหลังแก้ไขถือว่ายอมรับเงื่อนไขใหม่'],
];
const PRIVACY = [
  ['ข้อมูลที่เราเก็บ', 'อีเมล รหัสผ่าน (เก็บแบบเข้ารหัสทางเดียว เราอ่านไม่ได้) ประวัติแชต สถิติการใช้งาน (จำนวน token และเวลา) และรูปสลิปการโอนเงิน'],
  ['เราใช้ข้อมูลทำอะไร', 'ใช้เพื่อให้บริการ คำนวณลิมิต ตรวจสอบการชำระเงิน และแก้ปัญหาการใช้งาน เราไม่ขายข้อมูลของคุณ'],
  ['การส่งข้อมูลให้ผู้ให้บริการ AI', 'ข้อความและรูปที่คุณส่งในแชตจะถูกส่งไปยังผู้ให้บริการ AI ของโมเดลที่คุณเลือก เพื่อสร้างคำตอบ ผู้ให้บริการเหล่านั้นอยู่ต่างประเทศและมีนโยบายข้อมูลของตัวเอง โปรดอย่าส่งข้อมูลส่วนตัวที่อ่อนไหว เช่น เลขบัตรประชาชน หรือรหัสผ่าน'],
  ['การจัดเก็บ', 'ข้อมูลเก็บบน Cloudflare รูปที่แนบในแชตไม่ถูกเก็บไว้หลังส่งให้ AI แล้ว'],
  ['สิทธิ์ของคุณ (PDPA)', 'ลบแชตได้เองทุกเมื่อจากเมนูด้านข้าง ดาวน์โหลดสำเนาข้อมูลทั้งหมด และลบบัญชีได้เองที่หน้าบัญชี การลบบัญชีจะลบแชต โปรเจกต์ ความจำ และ API key ทันที ข้อมูลการชำระเงินเก็บต่อตามที่กฎหมายกำหนด'],
  ['ความจำและคำสั่งส่วนตัว', 'ข้อความที่คุณให้ AI จำไว้ และคำสั่งส่วนตัว จะถูกส่งไปกับทุกแชต ดูและลบได้ที่หน้าบัญชี'],
  ['การค้นเว็บ', 'เมื่อเปิดค้นเว็บ ข้อความล่าสุดของคุณจะถูกส่งไปยังบริการค้นหา (Tavily) เพื่อหาข้อมูล'],
];
function terms() {
  const sec = (t, rows) => `<div class="band legal"><h2>${t}</h2>${rows.map(([h, p]) => `<div class="tile"><div style="font:600 17px var(--display)">${h}</div><p class="muted" style="font-size:15px;margin:0">${p}</p></div>`).join('')}</div>`;
  page(nav() + `<div class="wrap" style="max-width:760px"><section class="hero" style="padding:48px 0 8px"><h1>เงื่อนไขและความเป็นส่วนตัว</h1><p>มีผลตั้งแต่ 11 พฤศจิกายน 2569</p></section>
    ${sec('เงื่อนไขการใช้บริการ', TERMS)}${sec('นโยบายความเป็นส่วนตัว', PRIVACY)}
    <p class="muted" style="text-align:center;padding-bottom:48px">มีคำถามเกี่ยวกับเงื่อนไขนี้ ติดต่อแอดมิน</p></div>`);
}
const footer = () => `<footer class="foot"><div><b>AstraCode</b><span class="muted">AI ทุกตัวในมือถือเครื่องเดียว</span></div>
  <div><a href="/pricing">ราคาต่อ token</a><a href="/developers">API สำหรับนักพัฒนา</a><a href="/blog">บล็อก</a></div>
  <div><a href="/status">สถานะระบบ</a><a href="/support">ติดต่อเรา</a><a href="/terms">เงื่อนไขและความเป็นส่วนตัว</a></div>
  <p class="muted">© ${new Date().getFullYear()} AstraCode</p></footer>`;


// ---------- หน้าราคาต่อ token (ตั้งค่าในหลังบ้าน → โมเดล / ตั้งค่า) ----------
const money = v => v === 0 ? '0' : v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3).replace(/0$/, '') : baht(v);
async function pricing() {
  const d = await api('/pricing');
  let per = localStorage.getItem('per') || 'M';
  const unit = () => per === 'M' ? 'ต่อ 1M token' : 'ต่อ 1K token', f = v => money(per === 'M' ? v : v / 1000);
  const planName = id => d.plans.find(p => p.id === id)?.name;
  const day = t => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  const period = p => 'โปรโมชั่น' + (p.start && p.end ? ` ${day(p.start)} – ${day(p.end)}` : p.end ? 'ถึง ' + day(p.end) : p.start ? 'ตั้งแต่ ' + day(p.start) : '');
  const cell = (m, k) => `<b>${m.promo ? `<s class="muted">฿${f(m.promo[k])}</s> ` : ''}฿${f(m[k])}</b>`;
  const card = m => `<div class="pc ${m.promo ? 'promo' : ''}"><div class="pc-h"><b>${esc(m.name)}</b><span class="pc-tags">${m.promo ? `<span class="pill sale">ลด ${m.promo.pct}%</span>` : ''}${m.vision ? '<span class="pill">อ่านรูป</span>' : ''}${m.effort ? '<span class="pill">Thinking</span>' : ''}</span></div>
    ${m.promo ? `<p class="sale-t">${period(m.promo)}</p>` : ''}
    ${m.note ? `<p class="muted">${esc(m.note)}</p>` : ''}
    <div class="pc-rows">
      <div><span>Input</span>${cell(m, 'in')}</div>
      <div><span>Output</span>${cell(m, 'out')}</div>
      <div><span>Cache read</span>${cell(m, 'cache')}</div>
      ${m.cache_write ? `<div><span>Cache write</span>${cell(m, 'cache_write')}</div>` : ''}
    </div>
    <div class="pc-f"><span class="muted">ใช้ลิมิต ×${m.multiplier}</span><span class="muted">${m.plans.map(planName).filter(Boolean).map(esc).join(' · ') || 'ยังไม่อยู่ในแพลนไหน'}</span></div></div>`;
  const draw = () => {
    page(nav() + `<div class="wrap"><section class="hero" style="padding:56px 0 24px"><div class="name">AstraCode</div><h1>ราคาต่อ token</h1>
      <p>ราคาของแต่ละโมเดล เป็นบาท${unit()} โมเดลที่แพงกว่าจะใช้ลิมิตแพลนเร็วกว่า</p>
      <div class="seg" role="group" aria-label="หน่วย"><button data-per="M" class="${per === 'M' ? 'on' : ''}">ต่อ 1M token</button><button data-per="K" class="${per === 'K' ? 'on' : ''}">ต่อ 1K token</button></div></section>
      <div class="pgrid">${d.models.map(card).join('') || '<p class="muted">ยังไม่มีโมเดล</p>'}</div>
      ${d.note ? `<p class="muted" style="text-align:center;margin:20px auto;max-width:640px;white-space:pre-wrap">${esc(d.note)}</p>` : ''}
      <div class="band"><h2>คำนวณค่าใช้จ่าย</h2><div class="calc">
        <div class="form2">
          <div><label>โมเดล</label><select id="cm">${d.models.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
          <div><label>ข้อความต่อวัน</label><input id="cn" type="number" inputmode="numeric" min="1" value="30"></div>
          <div><label>คำถาม + ประวัติแชต (token/ข้อความ)</label><input id="ci" type="number" inputmode="numeric" min="0" value="2000"></div>
          <div><label>คำตอบ (token/ข้อความ)</label><input id="co" type="number" inputmode="numeric" min="0" value="500"></div>
          <div><label>ส่วนที่โดน cache (%)</label><input id="cc" type="number" inputmode="numeric" min="0" max="100" value="50"></div>
        </div><div id="cr" class="calc-r" aria-live="polite"></div></div></div>
      <div class="band"><h2>อธิบายราคา</h2>${[
        ['Token คืออะไร', 'หน่วยที่ AI ใช้นับข้อความ ภาษาไทยประมาณ 1–2 ตัวอักษรต่อ token ภาษาอังกฤษประมาณ 4 ตัวอักษรต่อ token'],
        ['Input / Output ต่างกันยังไง', 'Input คือสิ่งที่ส่งให้ AI อ่าน (คำถาม ประวัติแชต ไฟล์แนบ) Output คือคำตอบที่ AI เขียน รวมถึงตอนที่ AI คิด (Thinking) โดยทั่วไป Output แพงกว่า'],
        ['Cache คืออะไร', 'ส่วนที่ AI เคยอ่านแล้วในแชตเดียวกัน เช่น ประวัติแชต ระบบจำไว้ จึงคิดราคาถูกกว่า Input ปกติมาก Cache write คือครั้งแรกที่บันทึกลง cache'],
        ['จ่ายตามนี้จริงไหม', 'ในแพลนรายเดือน คุณจ่ายราคาแพลนคงที่ ตัวเลขในหน้านี้ใช้ดูว่าแต่ละโมเดลกินลิมิตมากน้อยแค่ไหน'],
      ].map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
      ${footer()}</div>`);
    app.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { per = b.dataset.per; localStorage.setItem('per', per); draw(); });
    const calc = () => {
      const m = d.models.find(x => x.id === +$('#cm').value); if (!m) return;
      const n = Math.max(0, +$('#cn').value || 0), i = Math.max(0, +$('#ci').value || 0), o = Math.max(0, +$('#co').value || 0), c = Math.min(100, Math.max(0, +$('#cc').value || 0)) / 100;
      const per1 = (i * (1 - c) * m.in + i * c * m.cache + o * m.out) / 1e6, month = per1 * n * 30;
      const weekUnits = n * 7 * (i * (1 - c) * m.lw.in + i * c * m.lw.cache + o * m.lw.out) / 1e6; // วิธีนับเดียวกับระบบลิมิต: ต้นทุนจริง (บาท)
      const fit = d.plans.filter(p => m.plans.includes(p.id) && p.limit_week);
      $('#cr').innerHTML = `<div class="kpis"><div class="kpi"><div class="muted">ต่อข้อความ</div><div class="stat">฿${money(per1)}</div></div>
        <div class="kpi"><div class="muted">ต่อเดือน (30 วัน)</div><div class="stat">฿${money(month)}</div></div></div>
        ${fit.length ? `<div class="tw"><table class="tbl"><tr><th>แพลน</th><th>ราคา/เดือน</th><th>ใช้ลิมิตต่อสัปดาห์</th></tr>${fit.map(p => { const pct = weekUnits / p.limit_week * 100; return `<tr><td>${esc(p.name)}</td><td>${p.price ? '฿' + baht(p.price) : 'ฟรี'}</td><td class="${pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok'}">${pct > 999 ? '>999' : Math.round(pct)}%${pct > 100 ? ' (ไม่พอ)' : ''}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">โมเดลนี้ยังไม่อยู่ในแพลนไหน</p>'}`;
    };
    ['#cm', '#cn', '#ci', '#co', '#cc'].forEach(s => $(s).oninput = calc); calc();
  };
  draw();
}


// ดาวน์โหลดโค้ด/ไฟล์จากคำตอบ AI (.xlsx แปลงจาก CSV, .doc เปิดใน Word จาก HTML)
const EXT = { javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', markdown: 'md', md: 'md', csv: 'csv', sql: 'sql', bash: 'sh', sh: 'sh', xml: 'xml', yaml: 'yml', yml: 'yml', lua: 'lua', java: 'java', go: 'go', rust: 'rs', php: 'php', svg: 'svg', txt: 'txt', text: 'txt' };
const MIME = { csv: 'text/csv', html: 'text/html', json: 'application/json', md: 'text/markdown', svg: 'image/svg+xml', doc: 'application/msword', js: 'text/javascript' };
async function downloadCode(b) {
  const text = b.closest('.code').querySelector('code').textContent;
  const name = (b.dataset.name || `code.${EXT[b.dataset.lang?.toLowerCase()] || 'txt'}`).replace(/[\\/:*?"<>|]+/g, '_'), ext = name.split('.').pop().toLowerCase();
  if (ext === 'xlsx') { await lib('xlsx'); return XLSX.writeFile(XLSX.read(text, { type: 'string' }), name); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ext === 'csv' ? '﻿' + text : text], { type: (MIME[ext] || 'text/plain') + ';charset=utf-8' })); // BOM: Excel อ่าน CSV ภาษาไทยได้
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener('click', e => { const b = e.target.closest('.dl-code'); if (b) downloadCode(b).catch(x => alert('ดาวน์โหลดไม่ได้: ' + x.message)); });

// ---------- ส่วนเลือกแบบแอปมือถือ (แชต + โหมด Code) ----------
const limHTML = u => { const p = Math.max(u.pct4h, u.pctWeek); return `<i class="ring ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" style="--p:${Math.min(100, p)}"></i>${Math.round(p)}%`; };
const EFFORT_INFO = { '': ['Instant', 'ตอบทันที ไม่คิดก่อน · เร็วและประหยัดลิมิตที่สุด'], low: ['Low', 'คิดสั้นๆ ก่อนตอบ · เหมาะกับงานทั่วไป'], high: ['High', 'คิดละเอียด · โจทย์ยาก โค้ด คณิต'], max: ['Max', 'คิดเต็มที่ · ช้าสุด ใช้ลิมิตมากสุด'] };
// แผ่นเลือกจากด้านล่าง (สไตล์แอปมือถือ)
function sheet(title, html, bind) {
  document.querySelector('.sheet-bg')?.remove();
  const d = document.createElement('div'); d.className = 'sheet-bg';
  d.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-h"><b>${esc(title)}</b><button class="x" aria-label="ปิด">${ic('x')}</button></div><div class="sheet-b">${html}</div></div>`;
  const close = () => d.remove();
  d.onclick = e => { if (e.target === d || e.target.closest('.x')) close(); };
  d.onkeydown = e => { if (e.key === 'Escape') close(); };
  document.body.append(d); (d.querySelector('.opt.on') || d.querySelector('.sheet-b button, .sheet-b a'))?.focus();
  bind?.(d, close);
}
const optHTML = (v, title, desc, on) => `<button class="opt ${on ? 'on' : ''}" data-v="${esc(v)}"><span class="opt-t">${title}</span><span class="opt-d">${desc}</span>${on ? `<i>${ic('check')}</i>` : ''}</button>`;
const pickTo = sel => (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const s = $(sel); s.value = b.dataset.v; s.dispatchEvent(new Event('change')); close(); });
function modelSheet(which) {
  const cur = $(which).value, auto = $(which).querySelector('option[value="auto"]');
  sheet(which.endsWith('2') ? 'โมเดลที่ 2 (เทียบ)' : 'เลือกโมเดล', (auto ? optHTML('auto', ic('sparkles') + 'อัตโนมัติ', 'ระบบเลือกให้: คำถามทั่วไปใช้โมเดลประหยัด คำถามยาก โค้ด รูป หรือไฟล์ใช้โมเดลเก่ง · ประหยัดลิมิต', cur === 'auto') : '')
    + me.models.map(m => optHTML(m.id, esc(m.name), [m.vision && 'อ่านรูป', m.effort !== 'none' && 'Thinking', `ใช้ลิมิต ×${m.multiplier}`].filter(Boolean).join(' · '), String(m.id) === cur)).join('')
    + '<a class="opt-more" href="/pricing">ดูราคาและรายละเอียดโมเดล →</a>', pickTo(which));
}
function effortSheet(sel) {
  const cur = $(sel).value;
  sheet('ระดับความคิด', Object.entries(EFFORT_INFO).map(([v, [n, d]]) => optHTML(v, n, d, v === cur)).join('') + '<p class="muted" style="font-size:13px;margin:8px 4px 0">ยิ่งคิดมาก คำตอบยิ่งดีกับโจทย์ยาก แต่ช้าขึ้นและใช้ลิมิตมากขึ้น</p>', pickTo(sel));
}
function limitSheet() {
  const u = me.usage;
  sheet('ลิมิตการใช้งาน', `<p class="muted" style="margin:0 0 12px">แพลน ${esc(me.plan.name)}</p><div class="meters big">${meters(u)}</div>
    <p class="muted" style="font-size:13px">ลิมิต 4 ชม. รีเซ็ต ${u.reset4h ? when(u.reset4h) : 'เมื่อเริ่มใช้'} · ลิมิตสัปดาห์รีเซ็ต ${when(u.resetWeek)}</p>
    <a class="btn blue" href="/plans" style="width:100%">อัปเกรดแพลน</a>`);
}

// ---------- หลายหน้า: แต่ละไฟล์ .html บอกชื่อหน้าใน <body data-page> ----------
// เดโม (ไฟล์เดียว) จำลอง URL ไว้ใน window.DEMO_URL แทนการเปลี่ยนหน้าจริง
const curl = () => window.DEMO ? (window.DEMO_URL ||= new URL('/', location.origin === 'null' ? 'http://demo' : location.origin)) : location;
const qs = () => new URLSearchParams(curl().search);
const here = () => curl().pathname + curl().search;
const pageName = () => window.DEMO ? (curl().pathname.replace(/^\/|\.html$/g, '').split('/')[0] || 'home') : document.body.dataset.page || 'home';
function setUrl(p, replace) {
  if (window.DEMO) window.DEMO_URL = new URL(p, curl().href);
  else history[replace ? 'replaceState' : 'pushState'](null, '', p);
}
function go(p) { if (window.DEMO) { setUrl(p); boot(); } else location.href = p; }
const PAGES = {
  home: () => me ? go('/chat') : landing(),
  login: () => me ? go(qs().get('next') || '/chat') : auth(),
  plans: plansPage, terms, pricing,
};
const OPEN_IN_MAINTENANCE = ['home', 'login', 'terms', 'status', 'blog', 'pricing'];
function banner() { // ประกาศจากแอดมิน: ปิดได้ จำไว้ว่าปิดข้อความไหน
  const t = site.announcement; if (!t || localStorage.getItem('ann') === t || ['admin', 'code', 'receipt'].includes(pageName())) return;
  const b = document.createElement('div'); b.className = 'ann ' + (site.announcement_level || 'info');
  b.innerHTML = `<span>${inline(esc(t))}</span><button aria-label="ปิดประกาศ">${ic('x')}</button>`;
  b.querySelector('button').onclick = () => { localStorage.setItem('ann', t); b.remove(); };
  app.prepend(b);
}
// แสดงผล HTML/SVG จากโค้ดในแชต ใน sandbox แยก origin
function showPreview(code) {
  const html = /^\s*<svg/i.test(code) ? `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body>` : code;
  const d = document.createElement('div'); d.className = 'modal';
  d.innerHTML = `<div class="modal-b"><div class="modal-h"><b>แสดงผล</b><span class="sp"></span><button class="btn out sm" data-x>ปิด</button></div><iframe sandbox="allow-scripts allow-modals allow-forms allow-popups" title="แสดงผล"></iframe></div>`;
  const f = d.querySelector('iframe'), close = () => { d.remove(); removeEventListener('message', onMsg); };
  const onMsg = e => { if (e.source === f.contentWindow && e.data?.ready) f.contentWindow.postMessage({ html }, '*'); };
  if (window.DEMO) f.srcdoc = html; else { addEventListener('message', onMsg); f.src = '/preview.html'; }
  d.onclick = e => { if (e.target === d || e.target.dataset.x != null) close(); };
  document.body.append(d);
}
const postTile = p => `<a class="tile link post" href="/blog/${encodeURIComponent(p.slug)}">${p.cover?.startsWith('/') ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : ''}<div style="font:600 19px var(--display)">${esc(p.title)}</div><div class="muted">${esc(p.summary)}</div><div class="muted" style="font-size:12px">${when(p.created_at).split(' ')[0]}</div></a>`;
async function boot() {
  document.querySelector('.shade')?.remove();
  try {
    if (site.maintenance === '1' && me?.role !== 'admin' && !OPEN_IN_MAINTENANCE.includes(pageName()))
      page(nav() + `<section class="hero"><h1>ปิดปรับปรุงชั่วคราว</h1><p>เรากำลังอัปเกรดระบบ กลับมาใหม่อีกสักครู่ · <a href="/status">ดูสถานะระบบ</a></p></section>`);
    else await (PAGES[pageName()] || PAGES.home)();
    banner();
  }
  catch (x) {
    if (!me) return go('/login?next=' + encodeURIComponent(here()));
    page(nav() + `<p class="err" style="text-align:center;margin:48px">${esc(x.message)}</p>`);
  }
}
if (window.DEMO) addEventListener('click', e => { // เดโม: ลิงก์ภายในเว็บสลับหน้าโดยไม่โหลดใหม่
  const a = e.target.closest('a[href^="/"]'); if (!a || e.defaultPrevented) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
// รอให้สคริปต์ของหน้า (เช่น code.js) โหลดครบก่อน ไม่งั้นหน้านั้นยังไม่ได้ลงทะเบียนใน PAGES
const domReady = new Promise(r => document.readyState === 'loading' ? addEventListener('DOMContentLoaded', r) : r());
const loadSite = async () => { site = await api('/settings/public').catch(() => ({})); };
Promise.all([loadMe(), loadSite(), domReady]).then(boot);
if ('serviceWorker' in navigator && !window.DEMO) navigator.serviceWorker.register('/sw.js').catch(() => {});
