// AstraCode frontend — vanilla JS, hash router
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const getCur = () => localStorage.getItem('cur') === 'USD' ? 'USD' : 'THB';
const usdRate = () => (+site.usd_rate > 0 ? +site.usd_rate : 34.5);
const curSign = () => getCur() === 'USD' ? '$' : '฿';
const toCur = thb => getCur() === 'USD' ? Number(thb || 0) / usdRate() : Number(thb || 0);
const fmtPlanPrice = thb => getCur() === 'USD' ? '$' + toCur(thb).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '฿' + baht(thb);
const curSegHTML = () => `<div class="seg" role="group" aria-label="สกุลเงิน" style="margin-left:6px"><button type="button" data-cur="THB" class="${getCur() === 'THB' ? 'on' : ''}">฿ THB</button><button type="button" data-cur="USD" class="${getCur() === 'USD' ? 'on' : ''}">$ USD</button></div>`;

const LOC = window.LANG === 'en' ? 'en-GB' : 'th-TH'; // รูปแบบตัวเลขและวันที่ตามภาษา
const baht = n => ((Math.round(Number(n || 0) * 100) / 100) || 0).toLocaleString(LOC, { maximumFractionDigits: 2 }); // || 0 กัน "-0"
// ป้าย "ใหม่" ข้างฟีเจอร์ที่เพิ่งเพิ่ม: หายเมื่อกดใช้ครั้งแรก หรือหลังสิ้นปี 2026
const NEW_UNTIL = Date.UTC(2027, 0, 1);
const seen = k => { try { localStorage.setItem('seen:' + k, '1'); } catch { /* ไม่มีที่เก็บ */ } };
const newPill = k => { try { return Date.now() < NEW_UNTIL && !localStorage.getItem('seen:' + k) ? ' <span class="pill new">ใหม่</span>' : ''; } catch { return ''; } };
const num = n => Number(n || 0).toLocaleString(LOC);
const when = t => t ? new Date(t).toLocaleString(LOC, { dateStyle: 'medium', timeStyle: 'short' }) : '-';
// ระหว่างรอคำตอบที่ยังไม่มีข้อความ/ความคิด: ข้อความวนเปลี่ยนทุก 3 วินาที (โมเดลสร้างรูปใช้ชุดข้อความของการวาดภาพ)
const WAIT = { text: ['กำลังทำอยู่นะ', 'กำลังคิด', 'กำลังไตร่ตรอง'], image: ['กำลังทำอยู่นะ', 'กำลังวาดภาพ', 'กำลังเก็บรายละเอียด'] };
const waitHTML = m => `<span class="waitx" role="status" aria-label="กำลังตอบ">${WAIT[m?.model === 'สร้างรูป' || (typeof me !== 'undefined' && me?.models?.find(x => x.name === m?.model)?.provider === 'image') ? 'image' : 'text'].map(t => `<span>${t}...</span>`).join('')}<small class="waitslow">ใช้เวลานานกว่าปกติ · ถ้ารอนานเกินไป กดปุ่มหยุด แล้วลองใหม่หรือเปลี่ยนโมเดล</small></span>`;
// ไอคอนจาก Lucide (ISC license) — ic('name')
const ICONS = {"thumbup":"<path d=\"M7 10v12\"/><path d=\"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z\"/>","thumbdown":"<path d=\"M17 14V2\"/><path d=\"M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z\"/>","volume":"<path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\"/><path d=\"M16 9a5 5 0 0 1 0 6\"/><path d=\"M19.364 18.364a9 9 0 0 0 0-12.728\"/>","bulb":"<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/><path d=\"M9 18h6\"/><path d=\"M10 22h4\"/>","bell":"<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\"/>","pin":"<path d=\"M12 17v5\"/><path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\"/>","share":"<path d=\"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8\"/><polyline points=\"16 6 12 2 8 6\"/><line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"15\"/>","mic":"<path d=\"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><line x1=\"12\" x2=\"12\" y1=\"19\" y2=\"22\"/>","book":"<path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20\"/>","msg":"<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/>","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","up":"<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>","stop":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>","down":"<path d=\"m6 9 6 6 6-6\"/>","right":"<path d=\"m9 18 6-6-6-6\"/>","newchat":"<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\"/>","pen":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>","trash":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","more":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>","file":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/>","filetext":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>","filecode":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12.5 8 15l2 2.5\"/><path d=\"m14 12.5 2 2.5-2 2.5\"/>","clip":"<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\"/>","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>","compare":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M12 3v18\"/>","download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>","code":"<path d=\"m16 18 6-6-6-6\"/><path d=\"m8 6-6 6 6 6\"/>","tag":"<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","news":"<path d=\"M15 18h-5\"/><path d=\"M18 14h-8\"/><path d=\"M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2\"/><rect width=\"8\" height=\"4\" x=\"10\" y=\"6\" rx=\"1\"/>","braces":"<path d=\"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1\"/><path d=\"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1\"/>","activity":"<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>","mail":"<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>","dash":"<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>","pie":"<path d=\"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z\"/><path d=\"M21.21 15.89A10 10 0 1 1 8 2.83\"/>","trend":"<path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/>","bank":"<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","inbox":"<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"/><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/>","layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>","cpu":"<path d=\"M12 20v2\"/><path d=\"M12 2v2\"/><path d=\"M17 20v2\"/><path d=\"M17 2v2\"/><path d=\"M2 12h2\"/><path d=\"M2 17h2\"/><path d=\"M2 7h2\"/><path d=\"M20 12h2\"/><path d=\"M20 17h2\"/><path d=\"M20 7h2\"/><path d=\"M7 20v2\"/><path d=\"M7 2v2\"/><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"/>","coupon":"<path d=\"M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\"/><path d=\"M9 9h.01\"/><path d=\"m15 9-6 6\"/><path d=\"M15 15h.01\"/>","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","server":"<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\"/><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\"/><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\"/>","play":"<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>","refresh":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>","undo":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>","redo":"<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13\"/>","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>","search":"<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>","sparkles":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>","branch":"<path d=\"M15 6a9 9 0 0 0-9 9V3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/>","pull":"<path d=\"M12 17V3\"/><path d=\"m6 11 6 6 6-6\"/><path d=\"M19 21H5\"/>","push":"<path d=\"m18 9-6-6-6 6\"/><path d=\"M12 3v14\"/><path d=\"M5 21h14\"/>","palette":"<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","braces2":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1\"/><path d=\"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1\"/>","py":"<path d=\"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"m5 16-3 3 3 3\"/><path d=\"m9 22 3-3-3-3\"/>","web":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M11 18h2\"/><path d=\"M12 12v6\"/><path d=\"M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5\"/>","smartphone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>","percent":"<line x1=\"19\" x2=\"5\" y1=\"5\" y2=\"19\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"/>","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/>","terminal":"<path d=\"m7 11 2-2-2-2\"/><path d=\"M11 13h4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/>"};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const EFFORTS = [['', 'Instant'], ['minimal', 'Minimal'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra High'], ['max', 'Max'], ['on', 'Thinking']];
const SUGGEST = ['อธิบายเรื่องนี้ให้เข้าใจง่าย: ', 'ช่วยเขียนโค้ด Python ที่', 'สรุปข้อความนี้ให้สั้นลง:\n', 'แปลเป็นภาษาอังกฤษ:\n'];
let me = null, installEvt = null, site = {};
// ข้อความสองภาษาจากหลังบ้าน: แอดมินพิมพ์ "ไทย || English" ในช่องข้อความ (ประกาศ คำอธิบายแพลน บล็อก ฯลฯ) หน้าเว็บเลือกฝั่งตามภาษาที่ตั้ง
// ใช้เฉพาะข้อมูลสาธารณะ ไม่แตะแชตหรือโค้ดของผู้ใช้ (ซึ่งมี || ได้ตามปกติ)
const biLang = v => typeof v === 'string' ? (v.includes(' || ') ? v.split(' || ')[window.LANG === 'en' ? 1 : 0].trim() : v)
  : Array.isArray(v) ? v.map(biLang) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, biLang(x)])) : v;
// ?next= ต้องเป็นเส้นทางในเว็บเราเท่านั้น (กัน open redirect เช่น //evil.com, https://evil.com, /\evil.com)
const safeNext = n => /^\/(?![\/\\])/.test(String(n || '')) ? n : '/chat';
async function api(path, opt = {}) {
  if (opt.body && !(opt.body instanceof FormData)) { opt.body = JSON.stringify(opt.body); opt.headers = { 'content-type': 'application/json' }; }
  const r = await fetch('/api' + path, opt);
  const json = r.headers.get('content-type')?.includes('json'), d = json ? await r.json().catch(() => null) : null;
  if (r.status === 401) me = null;
  if (!r.ok) { // ไม่ใช่ JSON = error จาก Vercel/Cloudflare เอง โชว์รหัสกับต้นข้อความไว้หาสาเหตุ
    const raw = json ? '' : (await r.text().catch(() => '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw Object.assign(new Error(d?.error || (d?.need2fa ? 'ต้องใช้รหัส 2FA' : `ผิดพลาด (HTTP ${r.status}${raw ? ': ' + raw : ''})`)), { data: d, status: r.status });
  }
  if (/^\/(pricing|plans|settings\/public|status)(\/|\?|$)/.test(path) && (!opt.method || opt.method === 'GET')) return biLang(d);
  return d;
}

// ---------- Markdown ----------
function inline(s) { // s escape แล้ว
  const codes = [], maths = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => `\u0004${maths.push([1, m]) - 1}\u0004`)
    .replace(/(^|[^$\\])\$([^$\s\n][^$\n]*?[^$\s\n]|[^$\s\n\d])\$/g, (all, pre, m) => `${pre}\u0004${maths.push([0, m]) - 1}\u0004`);
  s = s.replace(/!\[([^\]]*)\]\(((?:\/api\/img\/[\w/.-]+)|(?:data:image\/(?:png|jpeg|webp);base64,[\w+/=]+))\)/g, '<figure class="genfig"><img class="gen" src="$2" alt="$1" loading="lazy"><button type="button" class="img-dl" aria-label="ดาวน์โหลดรูป" title="ดาวน์โหลดรูป">' + ic('download') + '</button></figure>'); // รูปที่ AI สร้าง + ปุ่มดาวน์โหลด (เฉพาะจากเว็บเรา)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\u0004(\d+)\u0004/g, (_, i) => { const [blk, m] = maths[i]; return `<span class="${blk ? 'math-b' : 'math-i'}" data-tex="${m}">${m}</span>`; });
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
function hlCode(raw) {
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|elif|for|while|switch|case|break|continue|import|export|from|default|async|await|def|class|try|catch|finally|throw|new|typeof|in|of|as|pass|raise|with|yield|true|false|null|undefined|None|True|False|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|JOIN|ON|ORDER|BY|LIMIT)\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = '', last = 0;
  for (const m of String(raw).matchAll(re)) {
    if (m.index > last) out += esc(raw.slice(last, m.index));
    const cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-k' : 'tk-n';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(raw.slice(last));
}
function md(s) {
  s = String(s).replace(/!\[[^\]]*\]\((?:\/api\/img\/[\w/.-]+|data:image\/[^)]+)\)/g, m => m.replace(/\s*\n\s*/g, ' ')); // รูปที่ alt ขึ้นบรรทัดใหม่ (ข้อความเก่า) ยังแสดงได้
  return String(s).split(/```/).map((part, i) => {
    if (!(i % 2)) return blocks(part);
    const nl = part.indexOf('\n'), info = nl >= 0 ? part.slice(0, nl).trim() : '', lang = info.split(/\s/)[0];
    const file = info.match(/\bfile=(\S+)/)?.[1]; // AI ทำเป็นไฟล์ให้ดาวน์โหลด: ```csv file=data.csv
    const raw = nl >= 0 ? part.slice(nl + 1) : part;
    if (/^mermaid$/i.test(lang) && !file) return `<div class="mermaid-box"><div class="mermaid">${esc(raw.trim())}</div></div>`;
    const body = /^(json|csv|txt|text|md|markdown)$/i.test(lang) || file ? esc(raw) : hlCode(raw);
    return `<div class="code ${file ? 'file' : ''}"><div class="code-h">${file ? `<span class="fname">${ic('filetext')} ${esc(file)}</span>` : `<span>${esc(lang || 'code')}</span>`}${/^(html|svg|xml)$/i.test(lang) ? `<button class="run-code">${ic('play')} Preview</button>` : ''}<button class="cp-code">Copy</button><button class="dl-code ${file ? 'main' : ''}" data-name="${esc(file || info.match(/\bpath=(\S+)/)?.[1]?.split('/').pop() || '')}" data-lang="${esc(lang)}" aria-label="ดาวน์โหลด">${ic('download')}${file ? ' Download' : ''}</button></div><pre><code>${body}</code></pre></div>`;
  }).join('');
}
// แยกบล็อกคำถามของ AI ให้ใช้ร่วมกันทั้งหน้า Chat และหน้า Code
if (typeof globalThis.parseAsk !== 'function') {
  const ASK_OPT_RE = /^(?:[-*•]|\d+[.)])\s+/;
  globalThis.parseAsk = function (content, streaming) {
    let s = String(content || ''); const asks = [];
    const block = (all, body) => {
      const lines = body.split('\n').map(x => x.trim()).filter(Boolean);
      const q = lines.filter(x => !ASK_OPT_RE.test(x)).join(' ').slice(0, 400);
      const opts = lines.filter(x => ASK_OPT_RE.test(x)).map(x => x.replace(ASK_OPT_RE, '').slice(0, 120)).slice(0, 8);
      if (!q || asks.length >= 4) return all;
      asks.push({ q, opts }); return '';
    };
    s = s.replace(/```ask[ \t]*\n([\s\S]*?)```/g, block);
    const open = s.search(/```ask[ \t]*(\n|$)/);
    if (open >= 0 && !s.slice(open + 6).includes('```')) {
      if (streaming) s = s.slice(0, open);
      else { const rest = s.slice(open).replace(/^```ask[ \t]*\n?/, ''), kept = block(s.slice(open), rest); s = s.slice(0, open) + kept; }
    }
    const i = s.search(/(```(?:json)?\s*)?\{\s*"questions?"\s*:/);
    if (i >= 0) {
      const raw = s.slice(i).replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
      let o; try { o = JSON.parse(raw); } catch { return { text: (streaming ? s.slice(0, i) : s).trim(), asks }; }
      const list = (Array.isArray(o.questions) ? o.questions : [o]).filter(q => q && typeof q.question === 'string');
      const label = x => typeof x === 'string' ? x : x?.label ?? x?.text ?? x?.value ?? x?.title ?? '';
      if (list.length) { for (const q of list) asks.push({ q: q.question, opts: (q.options || q.choices || q.answers || []).map(label).filter(Boolean).slice(0, 8).map(String) }); s = s.slice(0, i); }
    }
    return { text: s.trim(), asks };
  };
}
// ---------- Thinking: กล่องเหตุผลที่ AI คิด (กดเพื่อขยาย) ----------
const thinkLabel = (m, i = 1, n = 1) => m.streaming && !m.content ? '<span class="shimmer">กำลังคิด…</span>' : `Thinking${n > 1 ? ` · รอบที่ ${i}` : ''}${m.thinkSec ? ` · ${m.thinkSec} วินาที` : ''}`;
// ความคิดบางรุ่นส่งมาเป็นหัวข้อ **...** ต่อกันโดยไม่มีบรรทัดว่าง → จัดเป็นย่อหน้าและทำตัวหนา
const thinkText = s => esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/<\/b>(?=<b>)/g, '</b>\n\n').replace(/([^\n>])<b>/g, '$1\n\n<b>');
const thinkHTML = (m, i = 1, n = 1) => m.thinking ? `<details class="think"><summary>${ic('sparkles', 'sm')}<span class="think-s">${thinkLabel(m, i, n)}</span>${ic('down', 'sm chev')}</summary><div class="think-b">${thinkText(m.thinking)}</div></details>` : '';
// กล่องตัวเลือกจากบล็อก ```ask ที่ parseAsk() แยกออกมา
function askHTML(asks, active = true) {
  if (!Array.isArray(asks) || !asks.length) return '';
  return `<div class="asks">${asks.map(a => `<div class="ask"><div class="ask-q">${esc(a.q || '')}</div><div class="ask-o">${(a.opts || []).map(o => `<button type="button" data-ask="${esc(String(o))}" ${active ? '' : 'disabled'}>${esc(String(o))}</button>`).join('')}</div></div>`).join('')}</div>`;
}
function askAnswer(e) {
  const b = e?.target?.closest?.('button[data-ask]');
  return b && !b.disabled ? (b.dataset.ask ?? null) : null;
}
// อัปเดตข้อความ AI ที่กำลังพิมพ์ โดยไม่ปิดกล่อง Thinking ที่ผู้ใช้เปิดไว้
// ความคิดหลายรอบ: thinking คั่นด้วย \u0001 และข้อความมีตัวคั่นมองไม่เห็น \u2063\u2063 ตรงจุดที่ความคิดรอบใหม่เริ่ม → แสดงเป็น Thinking · ข้อความ · Thinking · ข้อความ ตามลำดับจริง
const SEG_MARK = '\u2063\u2063';
const hasSegs = m => !!m.thinking && m.thinking.includes('\u0001');
function segHTML(m, text) {
  const th = String(m.thinking || '').split('\u0001'), parts = String(text || '').split(SEG_MARK), n = Math.max(th.length, parts.length);
  let h = '';
  for (let i = 0; i < n; i++) {
    const body = (parts[i] || '').trim(), last = i === n - 1;
    if (th[i]) h += thinkHTML({ thinking: th[i], streaming: !!m.streaming && last, content: body, thinkSec: i === 0 ? m.thinkSec : 0 }, i + 1, n);
    if (body) h += md(body);
  }
  return h || (m.streaming ? waitHTML(m) : '');
}
function paintStreaming(el, m) {
  const body = typeof stripTools === 'function' ? fenceBare(stripTools(m.content)) : m.content; // โหมด Code: ซ่อนบรรทัดคำสั่ง READ/GREP/RUN ระหว่างพิมพ์ด้วย
  if (hasSegs(m)) { el.querySelector('.think')?.remove(); el.querySelector('.b').innerHTML = segHTML(m, body); return; }
  let th = el.querySelector('.think');
  if (m.thinking && !th) { el.insertAdjacentHTML('afterbegin', thinkHTML(m)); th = el.querySelector('.think'); }
  if (th) {
    const b = th.querySelector('.think-b'), stick = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    b.innerHTML = thinkText(m.thinking); th.querySelector('.think-s').innerHTML = thinkLabel(m);
    if (stick) b.scrollTop = b.scrollHeight;
  }
  if (m.mcps?.length) {
    let mp = el.querySelector('.mcp-live');
    if (!mp) { el.querySelector('.b').insertAdjacentHTML('beforebegin', '<div class="steps-bar mcp-live" style="cursor:default"></div>'); mp = el.querySelector('.mcp-live'); }
    mp.innerHTML = `${ic('server', 'sm')}<span>${m.mcps.map(x => esc(x.tool)).join(', ')}</span>`;
  }
  el.querySelector('.b').innerHTML = body ? md(body) : m.thinking ? '' : waitHTML(m);
  let dg = el.querySelector('.doing'); // สถานะสดระหว่างรอรอบถัดไป เช่น "รอบที่ 3/6 · อ่าน a.js"
  if (m.doing) { if (!dg) { el.querySelector('.b').insertAdjacentHTML('afterend', '<div class="doing" role="status"></div>'); dg = el.querySelector('.doing'); } dg.textContent = m.doing; } else dg?.remove();
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

// ---------- การเข้าถึง (a11y): ใส่ชื่อให้ช่องกรอก/ตัวเลือกที่ไม่มีป้าย และทำให้ตารางที่เลื่อนได้โฟกัสด้วยแป้นพิมพ์ ----------
// ใช้ข้อความ label ที่อยู่ก่อนหน้าช่อง (หรือ placeholder) เป็นชื่อ · ทำงานกับทุกหน้า/แผ่นที่วาดทีหลังผ่าน MutationObserver
function a11yFix(root = document) {
  root.querySelectorAll('input:not([type=hidden]):not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label]):not([aria-labelledby])').forEach(el => {
    if (el.id && root.querySelector(`label[for="${CSS.escape(el.id)}"]`) || el.closest('label') || el.title) return;
    let l = el.previousElementSibling; while (l && l.tagName !== 'LABEL') l = l.previousElementSibling && l.previousElementSibling.tagName === 'LABEL' ? l.previousElementSibling : null;
    const t = (l?.textContent || el.getAttribute('placeholder') || el.name || '').trim().slice(0, 80);
    if (t) el.setAttribute('aria-label', t);
  });
  root.querySelectorAll('.tw:not([tabindex])').forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'ตาราง เลื่อนได้'); });
}
let a11yT = 0;
if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { clearTimeout(a11yT); a11yT = setTimeout(() => a11yFix(), 120); }).observe(document.documentElement, { childList: true, subtree: true });

// ---------- ส่วนที่ใช้ซ้ำ ----------
const navL = (h, t, i) => `<a class="l${curl().pathname === h ? ' on' : ''}" href="${h}">${ic(i)}<span>${t}</span></a>`;
// มุมขวาบน: ล็อกอินแล้ว = วงแหวนลิมิต (กดเปิดรายละเอียด) + ยอด Wallet + ปุ่มบัญชี · ยังไม่ล็อกอิน = Log in + Get started free
const navRight = () => me
  ? `<div class="nav-r"><button type="button" class="nav-lim" aria-label="ลิมิตการใช้งาน">${limHTML(me.usage)}</button><button type="button" class="nav-bell" aria-label="การแจ้งเตือน">${ic('bell')}<i hidden></i></button><a class="nav-wal" href="/plans?topup=1" aria-label="เติม Wallet">฿${baht(me.balance)}</a><a class="nav-av" href="/account" aria-label="บัญชี ${esc(me.email)}">${esc((me.email || '?')[0].toUpperCase())}</a></div>`
  : '<div class="nav-r"><a class="btn out sm nav-login" href="/login">Log in</a><a class="btn blue sm" href="/login">Get started free</a></div>';
// กระดิ่งแจ้งเตือน: โหลดครั้งเดียวต่อ 5 นาที จุดแดง = มีรายการใหม่กว่าที่เปิดดูล่าสุด
let notifs = null, notifAt = 0;
const notifSeen = () => { try { return +localStorage.getItem('notifSeen') || 0; } catch { return 0; } };
async function notifLoad() {
  if (!me) return [];
  if (!notifs || Date.now() - notifAt > 300e3) { notifs = await api('/notifications').catch(() => []); notifAt = Date.now(); }
  const dot = notifs.some(n => n.t > notifSeen()); document.querySelectorAll('.nav-bell i').forEach(i => i.hidden = !dot);
  return notifs;
}
async function notifSheet() {
  const list = await notifLoad(), seen = notifSeen();
  sheet('การแจ้งเตือน', list.length ? list.map(n => `<a class="notif ${n.kind}${n.t > seen ? ' new' : ''}" href="${esc(n.href)}"><span>${esc(n.text)}</span><small class="muted">${new Date(n.t).toLocaleString(LOC, { dateStyle: 'medium', timeStyle: 'short' })}</small></a>`).join('') : '<p class="muted">ยังไม่มีการแจ้งเตือน</p>');
  try { localStorage.setItem('notifSeen', Date.now()); } catch { /* ไม่มีที่เก็บ */ }
  document.querySelectorAll('.nav-bell i').forEach(i => i.hidden = true);
}
const cfToken = () => document.querySelector('[name=cf-turnstile-response]')?.value || ''; // โทเคน Turnstile ที่วิดเจ็ตใส่ในฟอร์ม
// สลับภาษา ไทย / English (โหลดหน้าใหม่เพื่อใช้ภาษาใหม่ทั้งหน้า)
const langSeg = () => `<div class="seg langseg" role="group" aria-label="Language" data-notr><button type="button" data-lang="th" class="${window.LANG === 'en' ? '' : 'on'}">ไทย</button><button type="button" data-lang="en" class="${window.LANG === 'en' ? 'on' : ''}">English</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest?.('[data-lang]'); if (!b || b.dataset.lang === (window.LANG || 'th')) return; try { localStorage.setItem('lang', b.dataset.lang); } catch { /* ไม่มีที่เก็บ */ } location.reload(); });
// การ์ดโปรไฟล์ในเมนูข้าง: วงกลมตัวอักษร + อีเมล + แพลน (กดไปหน้าบัญชี)
const navProfile = () => `<a class="prof${curl().pathname === '/account' ? ' on' : ''}" href="/account"><span class="nav-av">${esc((me.email || '?')[0].toUpperCase())}</span><span class="pi"><b>${esc(me.email)}</b><small>${esc(me.plan?.name || '')}${me.role === 'admin' ? ' · Admin' : ''}</small></span></a>`;
const nav = () => `<nav class="nav"><div class="nav-top"><button class="nav-btn" type="button" aria-label="Menu" aria-expanded="false">${ic('menu')}</button><a class="logo" href="/">AstraCode</a>${navRight()}</div>
  <div class="nav-scrim"></div><div class="nav-panel"><div class="nav-head"><a class="logo" href="/">AstraCode</a><button class="nav-btn nav-x" type="button" aria-label="Close menu">${ic('x')}</button></div>
  ${me ? `${navL('/chat', 'Chat', 'msg')}${navL('/code', 'Code', 'code')}${navL('/plans', 'Plans', 'layers')}${navL('/pricing', 'Pricing', 'tag')}${navL('/blog', 'Blog', 'news')}${me.role === 'admin' ? navL('/admin', 'Admin', 'dash') : ''}<span class="sp"></span>${langSeg()}${navProfile()}`
       : `${navL('/plans', 'Plans', 'layers')}${navL('/pricing', 'Pricing', 'tag')}${navL('/blog', 'Blog', 'news')}<span class="sp"></span>${langSeg()}<a class="btn out" href="/login">Log in</a><a class="btn blue" href="/login">Get started free</a>`}</div></nav>`;
// เมนูข้าง: มือถือกดปุ่มเมนูเปิด/ปิดลิ้นชัก
document.addEventListener('click', e => {
  if (e.target.closest?.('.nav-lim') && me) return limitSheet();
  if (e.target.closest?.('.nav-bell') && me) return notifSheet();
  const n = e.target.closest?.('.nav'); if (!n) return;
  const open = e.target.closest('.nav-btn:not(.nav-x)') ? !n.classList.contains('open') : false;
  if (e.target.closest('.nav-btn, .nav-scrim, .nav-panel a')) { n.classList.toggle('open', open); n.querySelector('.nav-btn')?.setAttribute('aria-expanded', open); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelector('.nav.open')?.classList.remove('open'); });
// วาดซ้ำหน้าเดิม (เช่น สลับสกุลเงิน): ไม่เล่นแอนิเมชันเข้าหน้าซ้ำ และคงตำแหน่งที่เลื่อนอยู่
const page = html => { const again = !!app.querySelector('.view'), y = scrollY; app.innerHTML = `<div class="view${again ? ' still' : ''}">${html}</div>`; if (again) scrollTo(0, y); if (me) notifLoad(); };

function planTiles(plans, sel, period) {
  return `<div class="grid">${plans.map(p => `<div class="tile plan ${sel === p.id ? 'sel' : ''} ${p.featured ? 'feat' : ''}" data-plan="${p.id}">
    ${p.featured ? '<span class="badge">แนะนำ</span>' : ''}
    <div style="font:600 19px var(--display)">${esc(p.name)}</div>
    <div class="price">${p.price > 0 ? fmtPlanPrice(period === 'year' ? p.price_year : p.price) : 'ฟรี'}<small>${p.price > 0 ? (period === 'year' ? ' / ปี' : ' / เดือน') + (p.seats > 1 ? ' ต่อทีม' : '') : ''}</small></div>
    ${period === 'year' && p.price_year ? `<div class="ok" style="font-size:13px">ประหยัด ${Math.round((1 - p.price_year / (p.price * 12)) * 100)}% เทียบรายเดือน</div>` : ''}
    ${p.seats > 1 ? `<div style="font-size:12.5px;color:var(--link);font-weight:500">ทีม · สูงสุด ${p.seats} คน (${p.shared_pool ? 'งบรวมทั้งทีม' : 'แยกโควตาต่อคน'})</div>` : ''}<div class="muted">${esc(p.description)}</div>
    <ul class="feat-list">${p.models.map(m => `<li>${esc(m.name)} <span class="muted">~${num(m.week)} ข้อความ/สัปดาห์</span></li>`).join('')}${p.api_limit ? `<li>${ic('check', 'sm ok')} ใช้ API Key หักจากลิมิตแพลน</li>` : ''}</ul></div>`).join('')}</div>
    <p class="muted" style="text-align:center;margin-top:16px">จำนวนข้อความเป็นค่าประมาณ (ข้อความละ ~2,500 token) ใช้หลายโมเดลได้ในลิมิตเดียวกัน</p>`;
}
function compareTable(plans) {
  const names = [...new Set(plans.flatMap(p => p.models.map(m => m.name)))];
  return `<div class="tw"><table class="cmp"><tr><th></th>${plans.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr>
    <tr><td>ราคา/เดือน</td>${plans.map(p => `<td>${p.price > 0 ? fmtPlanPrice(p.price) : 'ฟรี'}</td>`).join('')}</tr>
    ${names.map(n => `<tr><td>${esc(n)}</td>${plans.map(p => { const m = p.models.find(x => x.name === n); return `<td>${m ? '~' + num(m.week) : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}
    <tr><td>จำนวนผู้ใช้</td>${plans.map(p => `<td>${p.seats > 1 ? `${p.seats} คน (${p.shared_pool ? 'งบรวม' : 'แยกโควตา'})` : '1 คน'}</td>`).join('')}</tr>
    <tr><td>API Key</td>${plans.map(p => `<td>${p.api_limit ? '<span class="ok">หักลิมิตแพลนได้</span>' : '<span class="muted">หัก Wallet</span>'}</td>`).join('')}</tr>
    <tr><td>รีเซ็ตลิมิต</td>${plans.map(() => '<td>4 ชม. + สัปดาห์</td>').join('')}</tr></table></div>
    <p class="muted" style="text-align:center">ตัวเลขในตาราง = จำนวนข้อความโดยประมาณต่อสัปดาห์</p>`;
}
const FAQ = [
  ['ลิมิต 4 ชั่วโมงกับลิมิตสัปดาห์ต่างกันยังไง', 'ลิมิต 4 ชั่วโมงกันการใช้รวดเดียวหมด ส่วนลิมิตสัปดาห์คือโควตารวม ทั้งสองแสดงเป็น % ด้านบนหน้าแชต โดยเริ่มนับรอบเมื่อส่งข้อความแรกและรีเซ็ตหลังครบ 4 ชั่วโมง / 7 วัน'],
  ['ทำไมแต่ละโมเดลใช้ลิมิตไม่เท่ากัน', 'โมเดลที่เก่งกว่ามีต้นทุนสูงกว่า จึงกิน % เร็วกว่า DeepSeek ใช้ได้เยอะที่สุด'],
  ['Instant / Low / High / Max คืออะไร', 'คือระดับความคิดของ AI: Instant ตอบทันทีไม่คิดก่อน ส่วน Low, High และ Max ให้ AI คิดก่อนตอบ ยิ่งสูงยิ่งตอบโจทย์ยากได้ดี แต่ช้ากว่าและใช้ลิมิตมากกว่า'],
  ['จ่ายเงินยังไง', 'เลือกแพลน (รายเดือน 30 วัน หรือรายปี 365 วัน) แล้วสแกน QR PromptPay อัปโหลดสลิป ระบบตรวจสลิปอัตโนมัติและเปิดแพลนให้ทันที (หรือแอดมินตรวจให้) หรือจ่ายด้วยเงินใน Wallet ก็ได้'],
  ['แนบไฟล์อะไรได้บ้าง', 'โค้ดและไฟล์ข้อความแทบทุกชนิด, PDF, Word (.docx), Excel (.xlsx) และรูป (เฉพาะโมเดลที่อ่านรูปได้) ครั้งละไม่เกิน 5 ไฟล์ ไฟล์ยาวจะใช้ลิมิตมากขึ้น และ PDF ที่เป็นภาพสแกนอ่านไม่ได้'],
  ['ต้องลงแอปไหม', 'ไม่ต้อง ใช้บนเว็บได้เลย หรือเพิ่มลงหน้าจอหลักเพื่อใช้เหมือนแอป'],
];
const faqHTML = () => FAQ.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('');
const installHTML = () => `<div class="grid">
  <div class="tile"><div style="font:600 19px var(--display)">iPhone / iPad</div><div class="muted">เปิดใน Safari → กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) → "เพิ่มไปยังหน้าจอโฮม"</div></div>
  <div class="tile"><div style="font:600 19px var(--display)">Android</div><div class="muted">เปิดใน Chrome → กด ⋮ มุมขวาบน → "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"</div>
  ${installEvt ? '<button class="btn blue sm" id="install" style="margin-top:8px">Install now</button>' : ''}</div></div>`;
function bindInstall() {
  const b = $('#install'); if (!b) return;
  b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.remove(); };
}

// ---------- หน้าแรก ----------
async function landing() {
  const [plans, posts, pr] = await Promise.all([api('/plans').catch(() => []), api('/blog').catch(() => []), api('/pricing').catch(() => ({ models: [] }))]);
  const cheapest = plans.filter(p => p.price > 0).sort((a, b) => a.price - b.price)[0];
  // ถูกกว่าซื้อ API ทางการ: เฉพาะโมเดลที่ตั้งราคาทางการไว้และเราถูกกว่า (เรียงตามลำดับโมเดลในระบบ) · ทางการแปลงเป็นบาทด้วยอัตราเดียวกับหน้าราคา
  const vs = pr.models.filter(m => m.official?.in > 0 && m.official?.out > 0 && m.out > 0).map(m => ({ m, pct: Math.round((1 - m.out / (m.official.out * usdRate())) * 100) })).filter(x => x.pct > 0).slice(0, 6);
  const vsRow = ({ m, pct }) => `<tr><td><b>${esc(m.name)}</b><div><span class="pill sale">ถูกกว่า <b>${pct}%</b></span></div></td><td class="vsp"><div>Input ${curSign()}${money(toCur(m.in))}<small class="muted"> · ทางการ ${curSign()}${money(toCur(m.official.in * usdRate()))}</small></div><div>Output ${curSign()}${money(toCur(m.out))}<small class="muted"> · ทางการ ${curSign()}${money(toCur(m.official.out * usdRate()))}</small></div></td></tr>`;
  page(nav() + `<section class="hero"><div class="name">AstraCode</div>
    <h1>AI ทุกตัว<br>ในมือถือเครื่องเดียว</h1>
    <p>Claude, ChatGPT, Gemini และ DeepSeek ในเว็บเดียว เปิดบนมือถือได้ทันที ไม่ต้องลงแอป${cheapest ? ` · เริ่มต้น <b>${fmtPlanPrice(cheapest.price)}</b>/เดือน` : ''}</p>
    <div class="row" style="justify-content:center">${me ? `<a class="btn blue" href="/chat">Open Chat</a><a class="btn out" href="/account">My account</a>` : `<a class="btn blue" href="/login">Get started free</a><a class="btn out" href="#plans">View plans</a>`}</div>
    <a class="statusb" href="/status" id="stb" hidden></a>
    <div class="showcase" aria-hidden="true">
      <div class="sc-bar"><span class="sc-dots"><i></i><i></i><i></i></span><span class="sc-pill">Claude Sonnet 5.5</span><span class="sc-pill">Thinking · High</span><span class="sp"></span><span class="lim"><i class="ring" style="--p:24"></i>24%</span></div>
      <div class="sc-chat">
        <div class="sc-u">เขียนฟังก์ชัน Python เช็กเลขเฉพาะ พร้อมตัวอย่างทดสอบ</div>
        <div class="sc-a"><span class="sc-pill" style="margin-bottom:8px;display:inline-flex;gap:6px;align-items:center">${ic('sparkles', 'sm')} Thinking · 2 วินาที</span>
          ${md('```python\ndef is_prime(n: int) -> bool:\n    if n < 2:\n        return False\n    return all(n % i != 0 for i in range(2, int(n**0.5) + 1))\n```')}
        </div>
      </div>
    </div></section>
    <div class="wrap">
    <div class="band" id="plans"><h2>แพลน</h2><div style="text-align:center;margin-bottom:14px">${curSegHTML()}</div>${planTiles(plans)}</div>
    ${vs.length ? `<div class="band" id="vs"><h2>ถูกกว่าซื้อ API ทางการ</h2><p class="muted" style="text-align:center;margin:-4px 0 14px">ราคาต่อ 1M token เทียบกับราคาทางการของเจ้าของโมเดล (คิดที่ $1 = ฿<b>${usdRate()}</b>)</p><div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>ราคาต่อ 1M token</th></tr>${vs.map(vsRow).join('')}</table></div><p style="text-align:center;margin-top:12px"><a href="/pricing">ดูราคาทุกโมเดล ›</a></p></div>` : ''}
    <div class="band facts"><h2>ทำไมต้อง AstraCode</h2><div class="grid">
      <div class="tile"><div class="stat">Web</div><div class="muted">เปิดในเบราว์เซอร์ได้ทันที ไม่ต้องติดตั้ง เพิ่มลงหน้าจอหลักได้</div></div>
      <div class="tile"><div class="stat">฿</div><div class="muted">จ่ายผ่าน PromptPay${cheapest ? ` เริ่มต้น <b>${fmtPlanPrice(cheapest.price)}</b>/เดือน` : ''} ไม่ต้องใช้บัตร</div></div>
      <div class="tile"><div class="stat">%</div><div class="muted">เห็นลิมิตชัดเจน รีเซ็ตทุก 4 ชั่วโมงและทุกสัปดาห์</div></div>
      <div class="tile"><div class="stat">API</div><div class="muted">รองรับ API รูปแบบ OpenAI และ Anthropic ใช้โมเดลเดียวกันจากเครื่องมือโค้ดของคุณ หักจากลิมิตแพลนได้</div></div>
      <div class="tile"><div class="stat">ไทย</div><div class="muted">หน้าเว็บ ราคา และการสนับสนุนเป็นภาษาไทย สลับเป็นอังกฤษได้</div></div>
      <div class="tile"><div class="stat">All-in-one</div><div class="muted">แชต เขียนโค้ด สร้างรูป ค้นเว็บ และ API ในเว็บเดียว</div></div>
    </div></div>
    <div class="band"><h2>ทำได้มากกว่าแชต</h2><div class="grid">
      <a class="tile link" href="/code"><div class="stat">${ic('code')}</div><div style="font:600 19px var(--display)">Code</div><div class="muted">เขียนโค้ดคล้าย VS Code บนเว็บ ให้ AI แก้ไฟล์ รันผล แล้ว push ขึ้น GitHub</div></a>
      <div class="tile"><div class="stat">${ic('compare')}</div><div style="font:600 19px var(--display)">เทียบ 2 โมเดล</div><div class="muted">ถามครั้งเดียว ดูคำตอบสองโมเดลคู่กัน</div></div>
      <div class="tile"><div class="stat">${ic('globe')}</div><div style="font:600 19px var(--display)">ค้นเว็บ</div><div class="muted">ให้ AI ค้นข้อมูลล่าสุดพร้อมแหล่งอ้างอิง</div></div>
      <a class="tile link" href="/developers"><div class="stat">${ic('braces')}</div><div style="font:600 19px var(--display)">API</div><div class="muted">ใช้โมเดลทั้งหมดผ่าน API แบบ OpenAI จ่ายตามจริงจาก Wallet</div></a>
    </div></div>
    <div class="band"><h2>ทีม AI ทำงานแทนคุณ</h2><p class="muted" style="text-align:center;margin:-4px 0 14px">สั่งครั้งเดียวแล้วปิดแอปได้ ทำงานต่อบนเซิร์ฟเวอร์ เสร็จแล้วแจ้งทางอีเมล</p><div class="grid demos" aria-hidden="true">
      <div class="tile demo"><div class="dm-h">${ic('code', 'sm')} ทีม Agent · โหมด Code</div><div class="dm-q">ทำเว็บร้านกาแฟ หน้าแรก เมนู และฟอร์มติดต่อ</div>
        <div class="dm-row lead"><b>หัวหน้า</b><span>แบ่งงาน 3 ชิ้น</span></div>
        ${[['หน้าแรก', 'index.html', 1], ['หน้าเมนู', 'menu.html', 2], ['ฟอร์มติดต่อ', 'contact.html', 3]].map(([t, f, i]) => `<div class="dm-row w" style="--i:${i}"><b>ลูกทีม</b><span>${t} <small>${f}</small></span><i class="dm-bar"><i></i></i><em>✓</em></div>`).join('')}
        <div class="dm-row rv"><b>ผู้ตรวจ</b><span>ตรวจรวม แก้ลิงก์เมนู 1 จุด · เสร็จ</span></div></div>
      <div class="tile demo"><div class="dm-h">${ic('search', 'sm')} Deep research · แชต</div><div class="dm-q">เปรียบเทียบรถยนต์ไฟฟ้าราคาไม่เกิน 1 ล้านในไทย</div>
        ${[['ราคาและรุ่น', 6], ['สถานีชาร์จ', 4], ['ต้นทุนต่อเดือน', 5]].map(([t, n], i) => `<div class="dm-row w" style="--i:${i + 1}"><b>ค้น</b><span>${t} <small>${n} แหล่ง</small></span><i class="dm-bar"><i></i></i><em>✓</em></div>`).join('')}
        <div class="dm-rep"><i></i><i></i><i></i><small>รายงานพร้อมอ้างอิง [1]–[15]</small></div></div>
    </div></div>
    <div class="band" id="cmp"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>
    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>
    <div class="band"><h2>คำถามที่พบบ่อย</h2>${faqHTML()}</div>
    ${posts.length ? `<div class="band"><h2>บทความล่าสุด</h2><div class="grid">${posts.slice(0, 3).map(postTile).join('')}</div></div>` : ''}
    ${footer()}</div>`);
  api('/status').then(d => { // สรุปสถานะโมเดลใต้ปุ่ม (ไม่รอก่อนวาดหน้า)
    const b = $('#stb'); if (!b || !d?.models?.length) return; const bad = d.models.filter(m => m.state !== 'ok').length;
    b.className = 'statusb ' + (bad ? 'warn' : 'ok'); b.innerHTML = bad ? `● โมเดลมีปัญหา <b>${bad}</b> ตัว · ดูสถานะ` : '● ทุกโมเดลทำงานปกติ'; b.hidden = false;
  }).catch(() => {});
  const plBtn = $('a[href="#plans"]'); if (plBtn) plBtn.onclick = e => { e.preventDefault(); $('#plans')?.scrollIntoView({ behavior: 'smooth' }); };
  // สลับสกุลเงิน: วาดใหม่เฉพาะส่วนแพลนกับตารางเทียบ ไม่โหลดทั้งหน้า (กันหน้าสะดุด/ภาพแตกบนมือถือ)
  const bindCur = () => app.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => {
    localStorage.setItem('cur', b.dataset.cur);
    const y = scrollY;
    $('#plans').innerHTML = `<h2>แพลน</h2><div style="text-align:center;margin-bottom:14px">${curSegHTML()}</div>${planTiles(plans)}`;
    $('#cmp').innerHTML = `<h2>เทียบแพลน</h2>${compareTable(plans)}`;
    bindCur(); scrollTo(0, y);
  });
  bindCur();
  bindInstall();
  homeFx();
}

// ลูกเล่นหน้าแรก: แสงตามเมาส์ที่ hero และขอบการ์ด, เลื่อนแล้วค่อยๆ โผล่ (ปิดเองเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว)
function homeFx() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero = $('.hero');
  hero?.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); hero.style.setProperty('--hx', e.clientX - r.left + 'px'); hero.style.setProperty('--hy', e.clientY - r.top + 'px'); });
  app.addEventListener('pointermove', e => { const t = e.target.closest?.('.tile'); if (!t) return; const r = t.getBoundingClientRect(); t.style.setProperty('--mx', e.clientX - r.left + 'px'); t.style.setProperty('--my', e.clientY - r.top + 'px'); });
  const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .12 });
  app.querySelectorAll('.wrap > .band').forEach(b => { b.classList.add('rv'); io.observe(b); });
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
  const btn = { login: 'Log in', register: 'Sign up', forgot: 'Send link', verify: 'Verified, log in', code: 'Confirm', mfa: 'Confirm' };
  const done = async () => { localStorage.removeItem('ref'); await loadMe(); go(safeNext(q.get('next'))); };
  const send = async (action, code) => {
    const r = await api('/auth', { method: 'POST', body: { ...cred, action, ref, code, cf: cfToken() } }).catch(x => { if (x.data?.need2fa) return { need2fa: true }; throw x; });
    if (r.verify) { if (action === 'check') throw new Error('ยังไม่ได้ยืนยัน กดลิงก์ในอีเมลก่อน'); mode = 'verify'; msg = ''; return draw(); }
    if (r.need2fa) { mode = 'code'; msg = ''; return draw(); }
    await done();
  };
  const draw = () => {
    const tabs = mode === 'login' || mode === 'register';
    page(nav() + `<div class="auth wrap"><h1>${title[mode]}</h1>
      ${tabs ? `<div class="tabs"><button class="${mode === 'login' ? 'on' : ''}" data-m="login">Log in</button><button class="${mode === 'register' ? 'on' : ''}" data-m="register">Sign up</button></div>` : ''}
      <form class="card" id="f">${tabs && (site.google || site.line) ? `<div class="social">${site.google ? `<a class="btn out" href="/api/oauth/google${ref ? '?ref=' + encodeURIComponent(ref) : ''}">Continue with Google</a>` : ''}
        ${site.line ? `<a class="btn out line" href="/api/oauth/line${ref ? '?ref=' + encodeURIComponent(ref) : ''}">Continue with LINE</a>` : ''}<div class="or"><span>หรือ</span></div></div>` : ''}
      ${forms[mode]()}
      ${site.turnstile && ['login', 'register', 'forgot'].includes(mode) ? '<div id="cft" style="margin:12px 0"></div>' : ''}<div class="err" id="e">${esc(msg)}</div><button class="btn blue" style="width:100%">${btn[mode]}</button>
      ${mode === 'verify' ? '<div class="row" style="justify-content:center;margin-top:12px"><button type="button" class="btn out sm" id="resend">Resend link</button><a href="#" data-m="login">ใช้อีเมลอื่น</a></div>' : ''}
      ${mode === 'login' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="forgot">ลืมรหัสผ่าน?</a></p>' : ''}
      ${!tabs && mode !== 'verify' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="login">กลับไปเข้าสู่ระบบ</a></p>' : ''}
      <p class="muted" style="text-align:center;margin:12px 0 0">การ${mode === 'register' ? 'สมัคร' : 'ใช้งาน'}ถือว่ายอมรับ<a href="/terms">เงื่อนไขและนโยบายความเป็นส่วนตัว</a></p></form></div>`);
    app.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.preventDefault(); mode = b.dataset.m; msg = ''; draw(); });
    if (site.turnstile && $('#cft')) { // กันบอท (เปิดเมื่อแอดมินตั้ง Turnstile)
      const go = () => window.turnstile.render('#cft', { sitekey: site.turnstile, theme: 'dark' });
      if (window.turnstile) go(); else { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.onload = go; document.head.append(sc); }
    }
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
        if (mode === 'forgot') { await api('/auth', { method: 'POST', body: { action: 'forgot', email: body.email, cf: cfToken() } }); $('#e').innerHTML = '<span class="ok">ถ้ามีบัญชีนี้ เราส่งลิงก์ไปที่อีเมลแล้ว (ดูในจดหมายขยะด้วย)</span>'; return busy(b, false); }
        if (mode === 'verify') return await send('check');
        if (mode === 'code') return await send('check', body.code);
        cred = { email: body.email, password: body.password }; // เก็บในหน่วยความจำหน้านี้เท่านั้น ใช้ตอนกด "ยืนยันแล้ว"
        await send(mode);
      } catch (x) { $('#e').textContent = x.message; busy(b, false); try { window.turnstile?.reset(); } catch { /* ไม่มีวิดเจ็ต */ } }
    };
  };
  draw();
}
const loadMe = async () => { me = await api('/me').catch(() => null); if (me?.plan) me.plan = biLang(me.plan); };

function meters(u) {
  const m = (label, p, reset) => `<div class="meter ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" title="รีเซ็ต ${when(reset)}">${label} ${p}%<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
  return (u.use4h === false ? '' : m('4 ชม.', u.pct4h, u.reset4h)) + m('สัปดาห์', u.pctWeek, u.resetWeek);
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
LIBS.katexCss = CDN + 'katex@0.16.11/dist/katex.min.css';
LIBS.katex = [CDN + 'katex@0.16.11/dist/katex.min.js', 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg'];
LIBS.mermaid = [CDN + 'mermaid@10.9.3/dist/mermaid.min.js', 'sha384-R63zfMfSwJF4xCR11wXii+QUsbiBIdiDzDbtxia72oGWfkT7WHJfmD/I/eeHPJyT'];
let katexCssLoaded = false;
async function renderRich(root = app) {
  const maths = root.querySelectorAll('.math-b:not([data-done]), .math-i:not([data-done])');
  if (maths.length) {
    if (!katexCssLoaded) { katexCssLoaded = true; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LIBS.katexCss; document.head.append(l); }
    await lib('katex').catch(() => null);
    if (window.katex) maths.forEach(el => {
      el.dataset.done = '1';
      try { katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('math-b'), throwOnError: false }); } catch {}
    });
  }
  const diagrams = root.querySelectorAll('.mermaid:not([data-processed])');
  if (diagrams.length) {
    await lib('mermaid').catch(() => null);
    if (window.mermaid) {
      try { mermaid.initialize({ startOnLoad: false, theme: 'dark' }); await mermaid.run({ nodes: [...diagrams] }); } catch {}
    }
  }
}

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
// ---------- เงื่อนไขการใช้บริการ ----------
const TERMS = [
  ['1. บริการ', 'AstraCode ให้บริการแชตกับโมเดล AI จากผู้ให้บริการหลายราย (เช่น OpenAI, Anthropic, Google, DeepSeek, Moonshot) ผ่านเว็บไซต์ รายชื่อโมเดลที่ใช้ได้ขึ้นอยู่กับแพลน และอาจเปลี่ยนแปลงได้ตามความพร้อมของผู้ให้บริการ'],
  ['2. บัญชีผู้ใช้', 'ผู้ใช้ต้องให้อีเมลที่ใช้งานได้ และรักษารหัสผ่านเป็นความลับ บัญชีหนึ่งใช้ได้หนึ่งคน ห้ามแชร์ ขาย หรือให้เช่าบัญชี หากพบการใช้งานผิดเงื่อนไข เราอาจระงับบัญชีโดยไม่คืนเงิน'],
  ['3. แพลนและการชำระเงิน', 'แพลนแบบชำระเงินมีอายุ 30 วัน (รายเดือน) หรือ 365 วัน (รายปี) นับจากวันที่ชำระเงินได้รับการอนุมัติ การต่ออายุแพลนเดิมจะบวกเวลาต่อจากวันหมดอายุเดิม ชำระได้ทั้งผ่าน PromptPay (แนบสลิปเพื่อตรวจอัตโนมัติ/โดยแอดมิน) หรือตัดเงินจาก Wallet สลิปปลอม สลิปซ้ำ หรือยอดไม่ตรงจะไม่ได้รับการอนุมัติ'],
  ['4. การคืนเงิน', 'ไม่คืนเงินหลังเปิดใช้แพลนแล้ว ยกเว้นกรณีระบบขัดข้องจนใช้งานไม่ได้ต่อเนื่องเกิน 72 ชั่วโมงโดยเป็นความผิดของเรา ซึ่งจะคืนเงินหรือชดเชยวันใช้งานตามสัดส่วน ติดต่อแอดมินภายใน 7 วันนับจากวันที่เกิดปัญหา'],
  ['4.1 Wallet และ API', 'เงินใน Wallet ใช้จ่ายค่าแพลน ค่า API สำหรับนักพัฒนา และค่าใช้งานเมื่อลิมิตแพลนเต็ม (ถ้าเปิดไว้) คิดตามราคาต่อ token ที่แสดงในหน้าราคา เงินใน Wallet ไม่มีวันหมดอายุ แต่ถอนเป็นเงินสดไม่ได้ เครดิตจากคูปองและการชวนเพื่อนไม่มีมูลค่าเป็นเงิน'],
  ['5. ลิมิตการใช้งาน', 'แต่ละแพลนมีลิมิตทุก 4 ชั่วโมงและลิมิตรายสัปดาห์ แสดงเป็น % ในหน้าแชต โมเดลที่ต้นทุนสูงกว่าและโหมดคิด (Low / High / Max) ใช้ลิมิตมากกว่า จำนวนข้อความที่แสดงในหน้าแพลนเป็นค่าประมาณ เราอาจปรับลิมิต ราคา หรือโมเดลในแพลนได้ โดยจะแจ้งล่วงหน้าบนเว็บไซต์ การเปลี่ยนแปลงมีผลกับรอบที่ชำระครั้งถัดไป'],
  ['6. การใช้งานที่ห้าม', 'ห้ามใช้บริการเพื่อกิจกรรมที่ผิดกฎหมาย หลอกลวง ละเมิดสิทธิ์ผู้อื่น สร้างมัลแวร์ หรือเนื้อหาที่ผิดนโยบายของผู้ให้บริการ AI ห้ามใช้โปรแกรมอัตโนมัติยิงคำขอ หรือพยายามเลี่ยงลิมิต'],
  ['7. คำตอบจาก AI', 'คำตอบสร้างโดย AI อาจไม่ถูกต้อง ไม่ครบถ้วน หรือล้าสมัย ผู้ใช้ควรตรวจสอบก่อนนำไปใช้ โดยเฉพาะเรื่องการแพทย์ กฎหมาย และการเงิน เราไม่รับผิดชอบความเสียหายจากการนำคำตอบไปใช้'],
  ['8. การเปลี่ยนแปลงบริการ', 'เราอาจหยุดให้บริการชั่วคราวเพื่อปรับปรุงระบบ หรือเมื่อผู้ให้บริการ AI ขัดข้อง และอาจแก้ไขเงื่อนไขนี้ได้ การใช้งานต่อหลังแก้ไขถือว่ายอมรับเงื่อนไขใหม่'],
];
const PRIVACY = [
  ['ข้อมูลที่เราเก็บ', 'อีเมล (การยืนยันรหัสผ่านจัดการผ่าน Firebase Authentication เราไม่อ่านและไม่เก็บรหัสผ่านจริง) ประวัติแชต สถิติการใช้งาน (จำนวน token และเวลา) และรูปสลิปการโอนเงิน'],
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
  <div><a href="/status">สถานะระบบ</a><a href="/support">Contact us</a><a href="/terms">เงื่อนไขและความเป็นส่วนตัว</a></div>
  <p class="muted">© ${new Date().getFullYear()} AstraCode</p></footer>`;


const money = v => v === 0 ? '0' : v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3).replace(/0$/, '') : baht(v);
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
// ดาวน์โหลดรูปที่ AI สร้าง (ทั้งรูปที่เก็บบนเซิร์ฟเวอร์และ data URL)
document.addEventListener('click', async e => {
  const b = e.target.closest('.img-dl'); if (!b) return;
  const src = b.closest('.genfig')?.querySelector('img')?.src; if (!src) return;
  try {
    const blob = await (await fetch(src)).blob(), ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `astracode-${Date.now()}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (x) { toast('ดาวน์โหลดรูปไม่ได้: ' + x.message, 'bad'); }
});
document.addEventListener('click', e => { const b = e.target.closest('.dl-code'); if (b) downloadCode(b).catch(x => toast('ดาวน์โหลดไม่ได้: ' + x.message, 'bad')); });

// ---------- ส่วนเลือกแบบแอปมือถือ (แชต + โหมด Code) ----------
const limHTML = u => { const p = Math.max(u.pct4h, u.pctWeek); return `<i class="ring ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" style="--p:${Math.min(100, p)}"></i>${Math.round(p)}%${me?.reset_credits > 0 ? '<i class="gdot" title="มีสิทธิ์รีเซ็ตลิมิต"></i>' : ''}`; };
const EFFORT_INFO = {
  '': ['Instant', 'ตอบทันที ไม่คิดก่อน · เร็วและประหยัดลิมิตที่สุด'],
  minimal: ['Minimal', 'คิดเล็กน้อย · เร็วมาก ใช้ลิมิตเพิ่มนิดเดียว'],
  low: ['Low', 'คิดสั้นๆ ก่อนตอบ · เหมาะกับงานทั่วไป'],
  medium: ['Medium', 'คิดปานกลาง · สมดุลระหว่างความเร็วและความแม่นยำ'],
  high: ['High', 'คิดละเอียด · โจทย์ยาก โค้ด คณิต'],
  xhigh: ['Extra High', 'คิดลึกพิเศษ · งานซับซ้อนสูง (OpenAI / GPT)'],
  max: ['Max', 'คิดเต็มที่ · ช้าสุด ใช้ลิมิตมากสุด'],
  on: ['Thinking', 'เปิดโหมดคิดก่อนตอบ'],
};
const DEFAULT_EFFORTS = { openai: ['', 'minimal', 'low', 'medium', 'high', 'xhigh'], anthropic: ['', 'low', 'medium', 'high', 'max'], deepseek: ['', 'low', 'medium', 'high', 'max'], kimi: ['', 'on'], gemini: ['', 'minimal', 'low', 'medium', 'high'], auto: ['', 'low', 'medium', 'high', 'max'] };
function modelEfforts(m) {
  if (!m || m.effort === 'none') return [];
  if (m.effort_levels && m.effort_levels.trim()) {
    const list = m.effort_levels.split(',').map(x => x.trim().toLowerCase()).map(x => x === 'none' || x === 'instant' ? '' : x).filter(x => x in EFFORT_INFO);
    if (list.length) return [...new Set(list)];
  }
  return DEFAULT_EFFORTS[m.effort] || ['', 'low', 'medium', 'high', 'max'];
}
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
// ดู context แบบละเอียด: อะไรกินหน้าต่าง context ของโมเดลอยู่เท่าไร + ย่อแชต + เปิด/ปิดย่ออัตโนมัติ
const CTX_COLORS = { system: '#7aa2f7', instr: '#bb9af7', mem: '#2ac3de', skill: '#9ece6a', rules: '#e0af68', summary: '#73daca', files: '#f7768e', user: '#7dcfff', assistant: '#a9b1d6' };
async function ctxSheet({ chatId, modelId, projectId, skills = [], onCompact }) {
  const q = new URLSearchParams(); if (chatId) q.set('chat_id', chatId); if (modelId) q.set('model_id', modelId); if (projectId) q.set('project_id', projectId); if (skills.length) q.set('skills', skills.join(','));
  const r = await api('/context?' + q).catch(x => { toast(x.message, 'bad'); return null; }); if (!r) return;
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n), pc = n => (n / r.max * 100).toFixed(n / r.max < 0.01 ? 2 : 1) + '%';
  const bar = [...r.parts.map(p => [CTX_COLORS[p.k] || '#888', p.tok, p.label]), [ 'rgba(255,255,255,.08)', r.reserve, 'เผื่อคำตอบ' ]].filter(x => x[1] > 0).map(([c, n, l]) => `<i style="flex:${Math.max(n, r.max * 0.004)};background:${c}" title="${esc(l)} ${k(n)}"></i>`).join('');
  sheet('Context ของแชตนี้', `<div class="sheet-form ctxs">
    <p class="sheet-msg"><b>${k(r.used)}</b> / ${k(r.max)} token (${r.pct}%)${r.model ? ` · ${esc(r.model)}` : ''}<br><small class="muted">ข้อความ ${r.msgs} ข้อความที่ส่งให้โมเดลรอบหน้า${r.compacted ? ' · เคยย่อแชตแล้ว' : ''}</small></p>
    <div class="ctxbar">${bar}</div>
    <div class="tw"><table class="tbl">${r.parts.map(p => `<tr><td><span class="dot" style="background:${CTX_COLORS[p.k] || '#888'}"></span>${esc(p.label)}${p.detail ? `<br><small class="muted">${esc(p.detail)}</small>` : ''}</td><td>${k(p.tok)}</td><td class="muted">${pc(p.tok)}</td></tr>`).join('')}
      <tr><td><span class="dot" style="background:rgba(255,255,255,.18)"></span>เผื่อคำตอบ</td><td>${k(r.reserve)}</td><td class="muted">${pc(r.reserve)}</td></tr>
      <tr><td><b>ว่าง</b></td><td><b>${k(r.free)}</b></td><td class="muted">${pc(r.free)}</td></tr></table></div>
    <label class="sw-row"><span class="sw"><input type="checkbox" id="cxauto" ${me.auto_compact !== false ? 'checked' : ''}><span></span></span> ย่อแชตอัตโนมัติเมื่อ context ใกล้เต็ม</label>
    ${chatId ? '<button type="button" class="btn blue sm" id="cxnow">ย่อแชตตอนนี้</button>' : ''}
    <p class="muted" style="margin:0;font-size:12.5px">ตัวเลขเป็นการประมาณจากจำนวนตัวอักษร (ภาษาไทยนับหนักกว่าอังกฤษ) อาจคลาดราว 20% · ย่อแชต = สรุปข้อความเก่าเหลือ 2 ข้อความล่าสุด</p></div>`, (d, close) => {
    d.querySelector('#cxauto').onchange = async e => { try { await api('/me', { method: 'PUT', body: { auto_compact: e.target.checked } }); me.auto_compact = e.target.checked; toast(e.target.checked ? 'เปิดย่อแชตอัตโนมัติ' : 'ปิดย่อแชตอัตโนมัติ', 'ok'); } catch (x) { e.target.checked = !e.target.checked; toast(x.message, 'bad'); } };
    const now = d.querySelector('#cxnow'); if (now) now.onclick = async () => { now.disabled = true; now.textContent = 'กำลังย่อ...'; try { const c = await api(`/chats/${chatId}/compact`, { method: 'POST' }); toast(c.ok ? 'ย่อแชตแล้ว' : 'แชตยังสั้นเกินกว่าจะย่อ', c.ok ? 'ok' : ''); close(); if (c.ok) onCompact?.(); } catch (x) { toast(x.message, 'bad'); now.disabled = false; now.textContent = 'ย่อแชตตอนนี้'; } };
  });
}
function toast(msg, kind = '') {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2800);
}
function confirmSheet(msg, { title = 'ยืนยัน', ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise(res => {
    let done = false;
    sheet(title, `<div class="sheet-form"><p class="sheet-msg">${esc(msg)}</p><div class="sheet-acts"><button type="button" class="btn out" data-c>${esc(cancel)}</button><button type="button" class="btn ${danger ? 'red' : 'blue'}" data-ok>${esc(ok)}</button></div></div>`, (d, close) => {
      const fin = v => { if (done) return; done = true; close(); res(v); };
      d.querySelector('[data-ok]').onclick = () => fin(true);
      d.querySelector('[data-c]').onclick = () => fin(false);
      d.querySelector('.x').onclick = () => fin(false);
      d.addEventListener('click', e => { if (e.target === d) fin(false); });
    });
  });
}
function promptSheet(msg, def = '', { title = 'กรอกข้อมูล', placeholder = '', ok = 'Save', cancel = 'Cancel', type = 'text' } = {}) {
  return new Promise(res => {
    let done = false;
    sheet(title, `<form class="sheet-form"><p class="sheet-msg">${esc(msg)}</p><input name="val" type="${esc(type)}" value="${esc(def)}" placeholder="${esc(placeholder)}" required><div class="sheet-acts"><button type="button" class="btn out" data-c>${esc(cancel)}</button><button class="btn blue">${esc(ok)}</button></div></form>`, (d, close) => {
      const inp = d.querySelector('input[name=val]');
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      const fin = v => { if (done) return; done = true; close(); res(v); };
      d.querySelector('form').onsubmit = e => { e.preventDefault(); fin(inp.value); };
      d.querySelector('[data-c]').onclick = () => fin(null);
      d.querySelector('.x').onclick = () => fin(null);
      d.addEventListener('click', e => { if (e.target === d) fin(null); });
    });
  });
}
const optHTML = (v, title, desc, on) => `<button class="opt ${on ? 'on' : ''}" data-v="${esc(v)}"><span class="opt-t">${title}</span><span class="opt-d">${desc}</span>${on ? `<i>${ic('check')}</i>` : ''}</button>`;
// ---------- ตัวเลือก (select) แบบกำหนดเอง: แทนเมนูเนทีฟของระบบ (วงกลมเรดิโอ) ด้วยแผ่นเลือกของเว็บในทุกหน้า ----------
// select ยังอยู่ในหน้าเหมือนเดิม (ค่า/เหตุการณ์ change ใช้ได้ตามปกติ) แค่เปลี่ยนวิธีเปิดรายการ · ใส่ data-native เพื่อใช้เมนูเนทีฟ
(() => {
  const pickable = e => { const s = e.target.closest?.('select'); return s && !s.multiple && !s.hidden && !s.disabled && s.dataset.native == null ? s : null; };
  const title = s => s.getAttribute('aria-label') || s.closest('label')?.textContent.trim().slice(0, 60) || s.previousElementSibling?.matches?.('label') && s.previousElementSibling.textContent.trim().slice(0, 60) || 'เลือกรายการ';
  const pick = s => {
    if (document.querySelector('.sel-bg')) return;
    const opts = [...s.options], d = document.createElement('div'); d.className = 'sheet-bg sel-bg'; // วางซ้อนบนแผ่นที่เปิดอยู่ ไม่ปิดแผ่นเดิม
    d.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title(s))}"><div class="sheet-h"><b>${esc(title(s))}</b><button type="button" class="x" aria-label="ปิด">${ic('x')}</button></div>
      <div class="sheet-b sel-sheet">${opts.map((o, i) => `<button type="button" class="opt ${i === s.selectedIndex ? 'on' : ''}" data-i="${i}" ${o.disabled ? 'disabled' : ''}><span class="opt-t">${esc(o.textContent.trim() || '—')}</span>${i === s.selectedIndex ? `<i>${ic('check')}</i>` : ''}</button>`).join('')}</div></div>`;
    d.onclick = e => { if (e.target === d || e.target.closest('.x')) d.remove(); };
    d.querySelectorAll('.opt[data-i]').forEach(b => b.onclick = () => {
      const i = +b.dataset.i; d.remove();
      if (i !== s.selectedIndex) { s.selectedIndex = i; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    document.body.append(d); d.querySelector('.opt.on')?.scrollIntoView({ block: 'center' });
  };
  let moved = false, sx = 0, sy = 0;
  document.addEventListener('touchstart', e => { const t = e.touches[0]; moved = false; sx = t.clientX; sy = t.clientY; }, { capture: true, passive: true });
  document.addEventListener('touchmove', e => { const t = e.touches[0]; if (Math.abs(t.clientX - sx) + Math.abs(t.clientY - sy) > 10) moved = true; }, { capture: true, passive: true });
  document.addEventListener('mousedown', e => { if (pickable(e)) e.preventDefault(); }, true);
  document.addEventListener('touchend', e => { const s = pickable(e); if (s && !moved && e.cancelable) { e.preventDefault(); pick(s); } }, { capture: true, passive: false });
  document.addEventListener('click', e => { const s = pickable(e); if (s) { e.preventDefault(); pick(s); } }, true);
  document.addEventListener('keydown', e => { const s = pickable(e); if (s && [' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); pick(s); } }, true);
})();
const pickTo = sel => (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const s = $(sel); s.value = b.dataset.v; s.dispatchEvent(new Event('change')); close(); });
// ---------- โลโก้ค่ายโมเดล: ค่าเริ่มต้นจาก Simple Icons (CC0) · แทนด้วยรูปที่อัปโหลดในหลังบ้านได้ (ค่าตั้ง model_icons) ----------
const VENDOR_SVG = {"deepseek":"<path d=\"M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45\"/>","claude":"<path d=\"m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z\"/>","gemini":"<path d=\"M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81\"/>","kimi":"<path d=\"M21.765.351C22.998.351 24 1.353 24 2.586S22.998 4.82 21.765 4.82h-1.974c-.15 0-.26-.12-.26-.26V2.586A2.237 2.237 0 0 1 21.765.35M9.41 13.388l8.447-8.377c.16-.16.07-.471-.14-.471h-4.55s-.1.02-.14.06l-9.099 9.029c-.14.14-.35.02-.35-.21V4.81c0-.15-.1-.27-.221-.27H.22c-.12 0-.22.12-.22.27v18.57c0 .15.1.27.22.27h3.137c.12 0 .22-.12.22-.27v-3.79c0-.08.03-.16.08-.21l2.826-2.796c.07-.07.16-.08.241-.03l7.546 5.551a8.9 8.9 0 0 0 4.018 1.493c.12.01.23-.11.23-.27V19.76c0-.14-.08-.25-.19-.26a5.8 5.8 0 0 1-2.355-.942l-6.533-4.73c-.14-.09-.15-.32-.03-.441\"/>","qwen":"<path d=\"M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z\"/>","mistral":"<path d=\"M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z\"/>","meta":"<path d=\"M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z\"/>","x":"<path d=\"M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z\"/>","nvidia":"<path d=\"M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z\"/>"};
const VENDOR_ALIAS = { gemini: 'gemini', llama: 'meta', grok: 'x', moonshot: 'kimi' };
const vendorOf = name => String(name || '').trim().split(/\s+/)[0] || '';
const customIcons = () => { try { return JSON.parse(site.model_icons || '{}') || {}; } catch { return {}; } };
function vendorLogo(name, cls = '') {
  if (site.picker_logos === '0') return '';
  const raw = vendorOf(name).toLowerCase(), k = VENDOR_ALIAS[raw] || raw, custom = customIcons()[raw];
  if (raw === 'อัตโนมัติ' || raw === 'auto') return `<span class="vlogo ${cls}">${ic('sparkles')}</span>`; // โหมด Auto ไม่ใช่ค่ายไหน: ใช้ไอคอนแทนตัวอักษรตัวแรก
  const inner = /^data:image\//.test(custom || '') ? `<img src="${esc(custom)}" alt="">` : VENDOR_SVG[k] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${VENDOR_SVG[k]}</svg>` : `<b>${esc((vendorOf(name)[0] || '?').toUpperCase())}</b>`;
  return `<span class="vlogo ${cls}">${inner}</span>`;
}
const vOpt = (v, logo, title, tags, mult, on, vk = '') => `<button class="vopt ${on ? 'on' : ''}" data-v="${esc(v)}" data-vk="${esc(vk)}">${logo}<span class="vtxt"><b>${title}</b><small>${tags}</small></span>${mult}${on ? `<i class="vck">${ic('check')}</i>` : ''}</button>`;
function modelSheet(which) {
  const cur = $(which).value, auto = $(which).querySelector('option[value="auto"]');
  const vendors = [...new Map(me.models.map(m => [vendorOf(m.name).toLowerCase(), vendorOf(m.name)])).values()];
  const chips = site.picker_filter !== '0' && vendors.length > 1 ? `<div class="vchips" role="group" aria-label="ค่าย"><button type="button" class="on" data-vf="">ทั้งหมด</button>${vendors.map(v => `<button type="button" data-vf="${esc(v.toLowerCase())}">${vendorLogo(v, 'xs')}${esc(v)}</button>`).join('')}</div>` : '';
  const mult = m => site.picker_mult === '0' ? '' : `<span class="vmult">×${m.multiplier}</span>`;
  sheet(which.endsWith('2') ? 'โมเดลที่ 2 (เทียบ)' : 'เลือกโมเดล', chips
    + (auto ? vOpt('auto', `<span class="vlogo auto">${ic('sparkles')}</span>`, 'อัตโนมัติ', 'ระบบเลือกโมเดลให้: ถามทั่วไปใช้โมเดลประหยัด โจทย์ยากหรือโค้ดใช้โมเดลเก่ง', '', cur === 'auto', 'auto') : '')
    + me.models.map(m => vOpt(m.id, vendorLogo(m.name), esc(m.name), [m.vision && 'อ่านรูป', m.effort !== 'none' && 'Thinking'].filter(Boolean).join(' · ') || 'ทั่วไป', mult(m), String(m.id) === cur, vendorOf(m.name).toLowerCase())).join('')
    + '<a class="opt-more" href="/pricing">ดูราคาและรายละเอียดโมเดล →</a>', (d, close) => {
      pickTo(which)(d, close);
      d.querySelectorAll('[data-vf]').forEach(c => c.onclick = () => {
        d.querySelectorAll('[data-vf]').forEach(x => x.classList.toggle('on', x === c));
        d.querySelectorAll('.vopt').forEach(o => o.hidden = !!c.dataset.vf && o.dataset.vk !== c.dataset.vf && o.dataset.vk !== 'auto');
      });
    });
}
function effortSheet(sel, m) {
  const cur = $(sel).value, list = modelEfforts(m);
  sheet('ระดับความคิด', list.map(v => { const [n, d] = EFFORT_INFO[v]; return optHTML(v, n, d, v === cur); }).join('') + '<p class="muted" style="font-size:13px;margin:8px 4px 0">ยิ่งคิดมาก คำตอบยิ่งดีกับโจทย์ยาก แต่ช้าขึ้นและใช้ลิมิตมากขึ้น</p>', pickTo(sel));
}

const BUILTIN_PROMPTS = [
  ['สรุปประเด็นสำคัญ', 'ช่วยสรุปข้อความต่อไปนี้เป็นข้อๆ กระชับ เข้าใจง่าย และดึงประเด็นสำคัญออกมา:\n\n'],
  ['แปลไทย-อังกฤษเป็นธรรมชาติ', 'ช่วยแปลข้อความนี้ให้เป็นภาษาที่สละสลวย เป็นธรรมชาติ ไม่แข็งทื่อ:\n\n'],
  ['รีวิวโค้ด & หาบั๊ก', 'ช่วยตรวจโค้ดนี้ หาบั๊ก จุดเสี่ยงด้านความปลอดภัย และจุดที่ควรปรับปรุงให้เร็วขึ้น:\n\n'],
  ['เขียน Unit Test', 'ช่วยเขียน Unit Test ที่ครอบคลุมทั้งกรณีปกติและ Edge Cases สำหรับโค้ดนี้:\n\n'],
  ['อธิบายโค้ดทีละขั้น', 'ช่วยอธิบายการทำงานของโค้ดนี้ทีละขั้นตอนแบบเข้าใจง่าย:\n\n'],
];
// คลัง Prompt: พรอมต์ของฉันเก็บบนเซิร์ฟเวอร์เป็น Skill แบบ "พรอมต์สำเร็จรูป" (as_text) จึงใช้ได้ทุกเครื่องและเลือกได้จาก / ด้วย
async function promptLibSheet(onPick) {
  const key = 'astra_prompts';
  try { // ย้ายพรอมต์เก่าที่เคยเก็บในเครื่องขึ้นเซิร์ฟเวอร์ครั้งเดียว
    const old = JSON.parse(localStorage.getItem(key) || '[]');
    if (old.length) { for (const [t, b] of old) await api('/skills', { method: 'POST', body: { name: String(t).slice(0, 60), content: b, as_text: true } }).catch(() => {}); localStorage.removeItem(key); }
  } catch { /* ไม่มีที่เก็บในเครื่อง */ }
  const draw = async force => {
    const mine = (await loadSkills(force)).filter(s => s.as_text && s.user_id);
    sheet('คลัง Prompt', `<div class="sheet-form">
      <form id="plf" class="row" style="flex-wrap:nowrap"><input name="t" placeholder="ชื่อ Prompt" style="max-width:130px" required maxlength="60"><input name="b" placeholder="ข้อความคำสั่ง..." required><button class="btn blue sm">Add</button></form>
      <p class="muted" style="margin:0;font-size:12px">พิมพ์ / ในช่องข้อความเพื่อเลือกพรอมต์ได้เร็วขึ้น</p>
      ${mine.length ? `<div class="muted" style="font-size:12px">Prompt ของฉัน</div>` + mine.map(p => `<div class="mem"><button type="button" class="linkb" style="flex:1;text-align:left;color:var(--porcelain)" data-use="m:${p.id}"><b>${esc(p.name)}</b> <span class="muted">${esc(p.content.slice(0, 50))}</span></button><button type="button" data-delp="${p.id}" aria-label="ลบ">${ic('x')}</button></div>`).join('') : ''}
      <div class="muted" style="font-size:12px">แนะนำ</div>
      ${BUILTIN_PROMPTS.map((p, i) => optHTML('b:' + i, ic('book') + esc(p[0]), esc(p[1].slice(0, 60)) + '...')).join('')}
    </div>`, (d, close) => {
      d.querySelector('#plf').onsubmit = async e => {
        e.preventDefault(); const fd = new FormData(e.target);
        try { await api('/skills', { method: 'POST', body: { name: fd.get('t').trim(), content: fd.get('b').trim(), as_text: true } }); draw(true); } catch (x) { toast(x.message, 'bad'); }
      };
      d.querySelectorAll('[data-delp]').forEach(b => b.onclick = async () => { await api('/skills/' + b.dataset.delp, { method: 'DELETE' }).catch(() => {}); draw(true); });
      d.querySelectorAll('[data-v],[data-use]').forEach(b => b.onclick = () => {
        const [kind, idx] = (b.dataset.v || b.dataset.use).split(':');
        const text = kind === 'm' ? mine.find(x => x.id === +idx)?.content : BUILTIN_PROMPTS[+idx]?.[1];
        close(); if (text) onPick(text);
      });
    });
  };
  draw(true);
}


let _skillsCache = null;
async function loadSkills(force) {
  if (!_skillsCache || force) _skillsCache = await api('/skills').catch(() => []);
  return _skillsCache;
}
// พิมพ์ / ที่ต้นช่องข้อความ = เลือก Skill (พิมพ์ต่อเพื่อค้นหา · ↑↓ Enter หรือแตะเพื่อเปิด/ปิด Skill นั้น · สูงสุด 3)
function slashSkills(t, get, set) {
  const pop = document.createElement('div'); pop.className = 'slash'; pop.hidden = true; pop.setAttribute('role', 'listbox');
  (t.closest('.compose') || t.parentNode).append(pop);
  let items = [], idx = 0, seq = 0;
  const hide = () => { pop.hidden = true; items = []; };
  const pick = s => {
    if (s.as_text) { t.value = s.content; hide(); t.oninput?.(); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return; } // พรอมต์สำเร็จรูป: ใส่ข้อความลงช่องพิมพ์
    const cur = new Set(get().map(Number));
    if (cur.has(s.id)) cur.delete(s.id); else if (cur.size >= 3) return toast('เปิด Skill ได้สูงสุด 3 อัน', 'bad'); else cur.add(s.id);
    set([...cur]); t.value = ''; t.oninput?.(); hide(); t.focus();
  };
  const draw = () => {
    const on = new Set(get().map(Number));
    pop.innerHTML = items.length ? items.map((s, i) => `<button type="button" role="option" class="${i === idx ? 'on' : ''}" data-i="${i}"><b>/${esc(s.name)}</b>${s.as_text ? '<i>พรอมต์</i>' : on.has(s.id) ? '<i>✓</i>' : ''}<small>${esc(s.description || s.content.slice(0, 70))}</small></button>`).join('') : '<p class="muted">ไม่พบ Skill ที่ตรงกัน</p>';
    pop.hidden = false;
    pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  t.addEventListener('input', async () => {
    const m = /^\/([^\s/]*)$/.exec(t.value); if (!m) return hide();
    const my = ++seq, q = m[1].toLowerCase(), all = await loadSkills();
    if (my !== seq) return;
    items = all.filter(s => !q || s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)).slice(0, 8); idx = 0; draw();
  });
  t.addEventListener('keydown', e => {
    if (pop.hidden) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return hide(); }
    if (!items.length) return;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); idx = (idx + (k === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); }
    else if ((k === 'Enter' && !e.shiftKey) || k === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(items[idx]); }
  }, true);
  pop.addEventListener('mousedown', e => e.preventDefault()); // ไม่ให้ช่องข้อความเสียโฟกัส
  pop.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(items[+b.dataset.i]); });
  t.addEventListener('blur', () => setTimeout(hide, 150));
}
async function skillsSheet(selectedIds, onChange) {
  const sel = new Set((selectedIds || []).map(Number));
  const draw = async (force) => {
    const list = (await loadSkills(force)).filter(x => !x.as_text); // พรอมต์สำเร็จรูปอยู่ในคลัง Prompt
    sheet('Skills (เลือกได้สูงสุด 3)', `<div class="sheet-form">
      <details class="ed" style="background:var(--obsidian);border:1px solid var(--hair);border-radius:16px"><summary style="padding:12px 14px"><b>+ New Skill</b></summary>
        <form id="skf" class="sheet-form" style="padding:0 14px 14px">
          <input name="name" placeholder="ชื่อ Skill (เช่น nextjs-expert)" maxlength="60" required>
          <input name="description" placeholder="คำอธิบายสั้นๆ" maxlength="200">
          <textarea name="content" rows="4" maxlength="6000" placeholder="คำสั่งหรือกติกาให้ AI ทำตามเมื่อเปิด Skill นี้..." required></textarea>
          <button class="btn blue sm">Save Skill</button>
        </form>
      </details>
      ${list.map(s => `<div class="opt ${sel.has(s.id) ? 'on' : ''}" data-sk="${s.id}" style="cursor:pointer">
        <span class="opt-t">${ic('sparkles', 'sm')} ${esc(s.name)} ${s.user_id === 0 ? '<small class="pill" style="margin-left:6px">ระบบ</small>' : `<button type="button" class="linkb" data-shsk="${s.id}" style="margin-left:8px;font-size:12px">Share</button><button type="button" class="linkb" data-delsk="${s.id}" style="margin-left:8px;color:var(--red);font-size:12px">Delete</button>`}</span>
        <span class="opt-d">${esc(s.description || s.content.slice(0, 80))}</span>
        <i>${sel.has(s.id) ? ic('check') : ''}</i>
      </div>`).join('') || '<p class="muted">ยังไม่มี Skill</p>'}
    </div>`, (d) => {
      d.querySelector('#skf').onsubmit = async e => {
        e.preventDefault();
        try {
          const created = await api('/skills', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          if (sel.size < 3) sel.add(created.id);
          onChange([...sel]); toast('สร้าง Skill แล้ว', 'ok'); draw(true);
        } catch (x) { toast(x.message, 'bad'); }
      };
      d.querySelectorAll('[data-shsk]').forEach(b => b.onclick = async e => { // ลิงก์แชร์ Skill: คนเปิดลิงก์จะได้ Skill นี้ไปใช้ในบัญชีตัวเอง
        e.stopPropagation();
        try { const r = await api(`/skills/${b.dataset.shsk}/share`, { method: 'POST' }); await copy(`${location.origin}/chat?skill=${r.token}`, b); toast('คัดลอกลิงก์แชร์ Skill แล้ว', 'ok'); } catch (x) { toast(x.message, 'bad'); }
      });
      d.querySelectorAll('[data-delsk]').forEach(b => b.onclick = async e => {
        e.stopPropagation();
        await api('/skills/' + b.dataset.delsk, { method: 'DELETE' });
        sel.delete(+b.dataset.delsk); onChange([...sel]); toast('ลบ Skill แล้ว'); draw(true);
      });
      d.querySelectorAll('[data-sk]').forEach(el => el.onclick = () => {
        const id = +el.dataset.sk;
        if (sel.has(id)) sel.delete(id);
        else if (sel.size >= 3) return toast('เปิดพร้อมกันได้สูงสุด 3 Skills');
        else sel.add(id);
        onChange([...sel]); draw(false);
      });
    });
  };
  draw(true);
}


let _mcpCache = null;
async function loadMcps(force) {
  if (!_mcpCache || force) _mcpCache = await api('/mcp').catch(() => []);
  return _mcpCache;
}
async function mcpSheet(selectedIds, onChange) {
  const sel = new Set((selectedIds || []).map(Number));
  const draw = async (force) => {
    const list = await loadMcps(force);
    sheet('Remote MCP (เลือกได้สูงสุด 3)', `<div class="sheet-form">
      <details class="ed" style="background:var(--obsidian);border:1px solid var(--hair);border-radius:16px"><summary style="padding:12px 14px"><b>+ เชื่อมต่อ Remote MCP</b></summary>
        <form id="mcf" class="sheet-form" style="padding:0 14px 14px">
          <input name="name" placeholder="ชื่อ (เช่น GitHub, Notion)" maxlength="60" required>
          <input name="url" type="url" placeholder="https://api.githubcopilot.com/mcp/" required>
          <input name="token" type="password" placeholder="Bearer Token / PAT (ถ้ามี)" autocomplete="off">
          <button class="btn blue sm" id="mcb">Connect &amp; fetch tools</button>
        </form>
      </details>
      ${list.map(s => `<div class="opt ${sel.has(s.id) ? 'on' : ''}" data-mc="${s.id}" style="cursor:pointer">
        <span class="opt-t">${ic('server', 'sm')} ${esc(s.name)} <small class="pill" style="margin-left:6px">${s.tools.length} tools</small>${s.user_id === 0 ? '<small class="pill" style="margin-left:4px">ระบบ</small>' : `<button type="button" class="linkb" data-syncmc="${s.id}" style="margin-left:8px;font-size:12px">Sync</button><button type="button" class="linkb" data-delmc="${s.id}" style="margin-left:8px;color:var(--red);font-size:12px">Delete</button>`}</span>
        <span class="opt-d">${esc(s.url)}${s.tools.length ? ' · ' + esc(s.tools.slice(0, 4).join(', ')) + (s.tools.length > 4 ? '…' : '') : ''}</span>
        <i>${sel.has(s.id) ? ic('check') : ''}</i>
      </div>`).join('') || '<p class="muted">ยังไม่ได้เชื่อมต่อ MCP Server</p>'}
    </div>`, d => {
      d.querySelector('#mcf').onsubmit = async e => {
        e.preventDefault(); const btn = d.querySelector('#mcb'); btn.disabled = true; btn.textContent = 'กำลังเชื่อมต่อ...';
        try {
          const created = await api('/mcp', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          if (sel.size < 3) sel.add(created.id);
          onChange([...sel]); toast(`เชื่อมต่อแล้ว (${created.tools.length} tools)`, 'ok'); draw(true);
        } catch (x) { toast(x.message, 'bad'); btn.disabled = false; btn.textContent = 'Connect & fetch tools'; }
      };
      d.querySelectorAll('[data-syncmc]').forEach(b => b.onclick = async e => {
        e.stopPropagation(); b.textContent = '...';
        try { const r = await api(`/mcp/${b.dataset.syncmc}/sync`, { method: 'POST' }); toast(`อัปเดตแล้ว (${r.tools.length} tools)`, 'ok'); draw(true); }
        catch (x) { toast(x.message, 'bad'); b.textContent = 'Sync'; }
      });
      d.querySelectorAll('[data-delmc]').forEach(b => b.onclick = async e => {
        e.stopPropagation();
        await api('/mcp/' + b.dataset.delmc, { method: 'DELETE' });
        sel.delete(+b.dataset.delmc); onChange([...sel]); toast('ลบ MCP แล้ว'); draw(true);
      });
      d.querySelectorAll('[data-mc]').forEach(el => el.onclick = () => {
        const id = +el.dataset.mc;
        if (sel.has(id)) sel.delete(id);
        else if (sel.size >= 3) return toast('เปิดพร้อมกันได้สูงสุด 3 MCP');
        else sel.add(id);
        onChange([...sel]); draw(false);
      });
    });
  };
  draw(true);
}

function limitSheet() {
  const u = me.usage, list = me.reset_list || [];
  const reset = list.length ? `<div class="rst"><div class="rst-h"><b>ปุ่มรีเซ็ตลิมิต</b></div>
    <p class="muted" style="font-size:13px;margin:6px 0 10px">แอดมินแจกสิทธิ์รีเซ็ตให้ กดปุ่มด้านล่างเพื่อใช้ (1 สิทธิ์ต่อครั้ง)</p>
    ${list.map(x => `<button class="btn blue rst-b" data-k="${esc(x.k)}"><span>รีเซ็ต: ${esc(x.label)}${x.exp ? `<small class="rst-e">หมดอายุ ${when(x.exp)}</small>` : ''}</span><span class="pill">เหลือ ${x.n}</span></button>`).join('')}<div class="err" id="rse"></div></div>` : '';
  sheet('ลิมิตการใช้งาน', `<p class="muted" style="margin:0 0 12px">แพลน ${esc(me.plan.name)}</p><div class="meters big">${meters(u)}</div>
    <p class="muted" style="font-size:13px">${u.use4h === false ? '' : `ลิมิต 4 ชม. รีเซ็ต ${u.reset4h ? when(u.reset4h) : 'เมื่อเริ่มใช้'} · `}ลิมิตสัปดาห์รีเซ็ต ${when(u.resetWeek)}</p>${reset}
    <div id="rsh"></div><a class="btn ${list.length ? 'out' : 'blue'}" href="/plans" style="width:100%;margin-top:10px">Upgrade plan</a>`, (d, close) => {
      api('/limits/history').then(h => { if (h.length) d.querySelector('#rsh').innerHTML = `<details class="rst-h2"><summary>ประวัติรีเซ็ตลิมิต</summary>${h.map(r => `<div class="rst-row"><span>${r.kind === 'grant' ? 'ได้รับสิทธิ์ ' + esc(r.scope || '') + ' ×' + (r.n || 1) : r.kind === 'use' ? 'ใช้สิทธิ์ ' + esc(r.scope || '') : 'แอดมินรีเซ็ตให้'}</span><small>${when(r.created_at)}</small></div>`).join('')}</details>`; }).catch(() => {});
      d.querySelectorAll('.rst-b').forEach(btn => btn.onclick = async () => {
        const x = list.find(y => y.k === btn.dataset.k);
        if (!await confirmSheet(`รีเซ็ตลิมิต: ${x.label}? จะใช้ 1 สิทธิ์`, { title: 'รีเซ็ตลิมิต', ok: 'Reset' })) return;
        try {
          const r = await api('/limits/reset', { method: 'POST', body: { k: x.k } });
          me.reset_list = r.credits; me.reset_credits = r.left; me.usage = r.usage; const lim = $('#lim') || $('#clim'); if (lim) lim.innerHTML = limHTML(r.usage);
          toast('รีเซ็ตลิมิตแล้ว: ' + x.label); close(); limitSheet();
        } catch (e) { d.querySelector('#rse').textContent = e.message; }
      });
    });
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
  notfound: () => page(nav() + `<section class="hero" style="padding:96px 0 32px"><div class="name">404</div><h1>ไม่พบหน้านี้</h1><p>ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว</p><div class="row" style="justify-content:center;margin-top:16px"><a class="btn blue" href="/">Home</a><a class="btn out" href="/chat">Open Chat</a></div></section>${footer()}`),
  home: () => landing(),
  login: () => me ? go(safeNext(qs().get('next'))) : auth(),
  terms, // plans / pricing ลงทะเบียนใน shop.js
  share: async () => {
    const tok = qs().get('t');
    if (!tok) return go('/');
    const d = await api('/share/' + encodeURIComponent(tok));
    document.title = d.title + ' · ASTRACODE';
    page(nav() + `<div class="wrap" style="max-width:780px;padding-bottom:64px">
      <section class="hero" style="padding:40px 0 20px"><div class="name">AstraCode</div><h1>${esc(d.title)}</h1><p>${when(d.created_at)} · แชตที่แชร์</p></section>
      <div class="msgs" style="padding:0">${d.messages.map(m => m.role === 'user'
        ? `<div class="msg user"><div class="b">${esc(m.content.replace(FILE_RE, (_, n) => `[ไฟล์: ${n}]`).trim())}</div></div>`
        : `<div class="msg ai"><div class="b">${md(m.content)}</div>${m.model ? `<div class="acts"><span class="muted">${esc(m.model)}</span></div>` : ''}</div>`).join('')}</div>
      <div style="text-align:center;margin-top:32px"><a class="btn blue" href="${me ? '/chat' : '/login'}">${me ? 'Open AstraCode Chat' : 'Try AstraCode free'}</a></div>
      ${footer()}</div>`);
    app.querySelectorAll('.cp-code').forEach(b => b.onclick = () => copy(b.closest('.code').querySelector('code').textContent, b)); renderRich();
  },
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
  d.innerHTML = `<div class="modal-b"><div class="modal-h"><b>แสดงผล</b><span class="sp"></span><button class="btn out sm" data-x>Close</button></div><iframe sandbox="allow-scripts allow-modals allow-forms allow-popups" title="แสดงผล"></iframe></div>`;
  const f = d.querySelector('iframe'), close = () => { d.remove(); removeEventListener('message', onMsg); };
  const onMsg = e => { if (e.source === f.contentWindow && e.data?.ready) f.contentWindow.postMessage({ html }, '*'); };
  if (window.DEMO) f.srcdoc = html; else { addEventListener('message', onMsg); f.src = '/preview.html'; }
  d.onclick = e => { if (e.target === d || e.target.dataset.x != null) close(); };
  document.body.append(d);
}
const postTile = p => `<a class="tile link post" href="/blog/${encodeURIComponent(p.slug)}">${p.cover?.startsWith('/') ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : ''}<div style="font:600 19px var(--display)">${esc(p.title)}</div><div class="muted">${esc(p.summary)}</div><div class="muted" style="font-size:12px">${when(p.created_at).split(' ')[0]}</div></a>`;
// โครงหน้าระหว่างโหลดข้อมูล (แสดงเมื่อช้ากว่า 250ms เพื่อไม่ให้กะพริบ)
const SKEL = '<div class="wrap skel"><div class="sk h"></div><div class="sk p"></div><div class="sk p s"></div><div class="sk b"></div><div class="sk b"></div></div>';
async function boot() {
  document.querySelector('.shade')?.remove();
  const skT = setTimeout(() => { if (!app.querySelector('.view')) app.innerHTML = nav() + SKEL; }, 250);
  setTimeout(() => { if (!app.querySelector('.view')) app.insertAdjacentHTML('beforeend', '<div style="text-align:center;margin:24px 16px"><p class="muted">โหลดนานผิดปกติ</p><button class="btn out" onclick="location.reload()">Try again</button></div>'); }, 8000);
  try {
    if (site.maintenance === '1' && me?.role !== 'admin' && !OPEN_IN_MAINTENANCE.includes(pageName()))
      page(nav() + `<section class="hero"><h1>ปิดปรับปรุงชั่วคราว</h1><p>เรากำลังอัปเกรดระบบ กลับมาใหม่อีกสักครู่ · <a href="/status">ดูสถานะระบบ</a></p></section>`);
    else await (PAGES[pageName()] || PAGES.home)();
    banner();
  }
  catch (x) {
    clearTimeout(skT);
    if (!me) return go('/login?next=' + encodeURIComponent(here()));
    page(nav() + `<div style="text-align:center;margin:48px 16px"><p class="err" style="max-width:420px;margin:0 auto 16px">${esc(x.message)}</p><button class="btn out" onclick="location.reload()">Try again</button></div>`);
  }
}
if (window.DEMO) addEventListener('click', e => { // เดโม: ลิงก์ภายในเว็บสลับหน้าโดยไม่โหลดใหม่
  const a = e.target.closest('a[href^="/"]'); if (!a || e.defaultPrevented) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
// ส่ง error ที่เกิดในเบราว์เซอร์ให้แอดมินเห็น (ไม่เกิน 5 รายการต่อการเปิดหน้า เฉพาะสคริปต์ของเว็บเอง ข้าม error ที่มาจาก API)
const errSent = new Set();
const reportErr = (msg, src) => {
  if (window.DEMO || errSent.size >= 5 || !msg || errSent.has(msg + src)) return; errSent.add(msg + src);
  const body = JSON.stringify({ msg: String(msg).slice(0, 300), src: String(src || '').slice(0, 200), page: location.pathname });
  try { navigator.sendBeacon?.('/api/clienterr', new Blob([body], { type: 'application/json' })) || fetch('/api/clienterr', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }); } catch { /* ส่งไม่ได้ก็ข้าม */ }
};
addEventListener('error', e => { if (e.filename?.startsWith(location.origin)) reportErr(e.message, `${e.filename.slice(location.origin.length)}:${e.lineno}:${e.colno}`); });
addEventListener('unhandledrejection', e => { const r = e.reason; if (r?.status || r?.name === 'AbortError') return; reportErr(r?.message || String(r), (r?.stack || '').split('\n').find(l => l.includes(location.origin))?.trim().replace(location.origin, '')); });
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
// รอให้สคริปต์ของหน้า (เช่น code.js) โหลดครบก่อน ไม่งั้นหน้านั้นยังไม่ได้ลงทะเบียนใน PAGES
const domReady = new Promise(r => document.readyState === 'loading' ? addEventListener('DOMContentLoaded', r) : r());
const loadSite = async () => { site = await api('/settings/public').catch(() => ({})); };
Promise.all([loadMe(), loadSite(), domReady]).then(boot);
// service worker retired: remove any copy a visitor still has (sw.js also clears its caches)
if ('serviceWorker' in navigator && !window.DEMO) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
