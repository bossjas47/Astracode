// Kyber frontend — vanilla JS, hash router
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const getCur = () => localStorage.getItem('cur') === 'USD' ? 'USD' : 'THB';
const usdRate = () => (+site.usd_rate > 0 ? +site.usd_rate : 34.5);
const curSign = () => getCur() === 'USD' ? '$' : '฿';
const toCur = thb => getCur() === 'USD' ? Number(thb || 0) / usdRate() : Number(thb || 0);
const fmtPlanPrice = thb => getCur() === 'USD' ? '$' + toCur(thb).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '฿' + baht(thb);
const curSegHTML = () => `<div class="seg" role="group" aria-label="สกุลเงิน" style="margin-left:6px"><button type="button" data-cur="THB" class="${getCur() === 'THB' ? 'on' : ''}">฿ THB</button><button type="button" data-cur="USD" class="${getCur() === 'USD' ? 'on' : ''}">$ USD</button></div>`;

const FB_PAGE = 'https://www.facebook.com/share/1cxdtuiuEt/'; // เพจ Facebook สำหรับติดต่อแอดมิน
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
// ตอบจบแล้วแต่ไม่มีเนื้อหา (ต้นทางตัด/ปฏิเสธเงียบ ๆ): บอกผู้ใช้ แทนที่จะโชว์ "กำลังคิด" ค้างไว้
const emptyHTML = m => m.streaming ? waitHTML(m) : '<p class="muted">โมเดลไม่ได้ส่งคำตอบกลับมา อาจถูกระบบกรองของผู้ให้บริการปฏิเสธ ลองถามใหม่ เปลี่ยนคำถาม หรือเปลี่ยนโมเดล</p>';
// ไอคอนจาก Lucide (ISC license) — ic('name')
const ICONS = {"tablet":"<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" ry=\"2\"/><line x1=\"12\" x2=\"12.01\" y1=\"18\" y2=\"18\"/>","monitor":"<rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\"/><line x1=\"8\" x2=\"16\" y1=\"21\" y2=\"21\"/><line x1=\"12\" x2=\"12\" y1=\"17\" y2=\"21\"/>","expand":"<path d=\"M15 3h6v6\"/><path d=\"M9 21H3v-6\"/><path d=\"m21 3-7 7\"/><path d=\"m3 21 7-7\"/>","rotate":"<path d=\"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/>","sheet":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M3 15h18\"/><path d=\"M9 3v18\"/>","copy":"<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>","thumbup":"<path d=\"M7 10v12\"/><path d=\"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z\"/>","thumbdown":"<path d=\"M17 14V2\"/><path d=\"M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z\"/>","volume":"<path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\"/><path d=\"M16 9a5 5 0 0 1 0 6\"/><path d=\"M19.364 18.364a9 9 0 0 0 0-12.728\"/>","bulb":"<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/><path d=\"M9 18h6\"/><path d=\"M10 22h4\"/>","bell":"<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\"/>","pin":"<path d=\"M12 17v5\"/><path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\"/>","share":"<path d=\"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8\"/><polyline points=\"16 6 12 2 8 6\"/><line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"15\"/>","mic":"<path d=\"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><line x1=\"12\" x2=\"12\" y1=\"19\" y2=\"22\"/>","book":"<path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20\"/>","msg":"<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/>","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","up":"<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>","stop":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>","down":"<path d=\"m6 9 6 6 6-6\"/>","right":"<path d=\"m9 18 6-6-6-6\"/>","newchat":"<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\"/>","pen":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>","trash":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","more":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>","file":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/>","filetext":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>","filecode":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12.5 8 15l2 2.5\"/><path d=\"m14 12.5 2 2.5-2 2.5\"/>","clip":"<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\"/>","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>","compare":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M12 3v18\"/>","download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>","code":"<path d=\"m16 18 6-6-6-6\"/><path d=\"m8 6-6 6 6 6\"/>","tag":"<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","news":"<path d=\"M15 18h-5\"/><path d=\"M18 14h-8\"/><path d=\"M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2\"/><rect width=\"8\" height=\"4\" x=\"10\" y=\"6\" rx=\"1\"/>","braces":"<path d=\"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1\"/><path d=\"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1\"/>","activity":"<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>","mail":"<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>","dash":"<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>","pie":"<path d=\"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z\"/><path d=\"M21.21 15.89A10 10 0 1 1 8 2.83\"/>","trend":"<path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/>","bank":"<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","inbox":"<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"/><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/>","layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>","cpu":"<path d=\"M12 20v2\"/><path d=\"M12 2v2\"/><path d=\"M17 20v2\"/><path d=\"M17 2v2\"/><path d=\"M2 12h2\"/><path d=\"M2 17h2\"/><path d=\"M2 7h2\"/><path d=\"M20 12h2\"/><path d=\"M20 17h2\"/><path d=\"M20 7h2\"/><path d=\"M7 20v2\"/><path d=\"M7 2v2\"/><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"/>","coupon":"<path d=\"M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\"/><path d=\"M9 9h.01\"/><path d=\"m15 9-6 6\"/><path d=\"M15 15h.01\"/>","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","server":"<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\"/><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\"/><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\"/>","play":"<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>","refresh":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>","undo":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>","redo":"<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13\"/>","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>","search":"<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>","sparkles":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>","branch":"<path d=\"M15 6a9 9 0 0 0-9 9V3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/>","pull":"<path d=\"M12 17V3\"/><path d=\"m6 11 6 6 6-6\"/><path d=\"M19 21H5\"/>","push":"<path d=\"m18 9-6-6-6 6\"/><path d=\"M12 3v14\"/><path d=\"M5 21h14\"/>","palette":"<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","braces2":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1\"/><path d=\"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1\"/>","py":"<path d=\"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"m5 16-3 3 3 3\"/><path d=\"m9 22 3-3-3-3\"/>","web":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M11 18h2\"/><path d=\"M12 12v6\"/><path d=\"M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5\"/>","smartphone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>","percent":"<line x1=\"19\" x2=\"5\" y1=\"5\" y2=\"19\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"/>","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/>","terminal":"<path d=\"m7 11 2-2-2-2\"/><path d=\"M11 13h4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/>","lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>","star":"<path d=\"M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z\"/>","flame":"<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>","logout":"<path d=\"m16 17 5-5-5-5\"/><path d=\"M21 12H9\"/><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>","shield":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/>","hand":"<path d=\"M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8\"/><path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\"/>"};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const EFFORTS = [['', 'Instant'], ['minimal', 'Minimal'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra High'], ['max', 'Max'], ['on', 'Thinking']];
// ตัวอย่างงานบนหน้าแชตว่าง: [ไอคอน, ป้าย, ข้อความที่เติมให้] · ผู้ใช้ใหม่กดแล้วพิมพ์ต่อได้ทันที
const SUGGEST = [['code', 'Help me code', 'ช่วยเขียนโค้ด Python ที่'], ['globe', 'Translate', 'แปลเป็นภาษาอังกฤษแบบเป็นธรรมชาติ:\n'], ['filetext', 'Summarize a document', 'สรุปเอกสารที่แนบเป็นข้อ ๆ ไม่เกิน 10 ข้อ พร้อมประเด็นสำคัญที่ต้องทำต่อ']]; // หน้าแชตว่าง: 3 อย่าง (ป้ายอังกฤษ · ข้อความที่เติมให้เป็นไทยตามผู้ใช้หลัก)
let me = null, installEvt = null, site = {};
// ข้อความสองภาษาจากหลังบ้าน: แอดมินพิมพ์ "ไทย || English" ในช่องข้อความ (ประกาศ คำอธิบายแพลน บล็อก ฯลฯ) หน้าเว็บเลือกฝั่งตามภาษาที่ตั้ง
// ใช้เฉพาะข้อมูลสาธารณะ ไม่แตะแชตหรือโค้ดของผู้ใช้ (ซึ่งมี || ได้ตามปกติ)
const biLang = v => typeof v === 'string' ? (v.includes(' || ') ? v.split(' || ')[window.LANG === 'en' ? 1 : 0].trim() : v)
  : Array.isArray(v) ? v.map(biLang) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, biLang(x)])) : v;
// ?next= ต้องเป็นเส้นทางในเว็บเราเท่านั้น (กัน open redirect เช่น //evil.com, https://evil.com, /\evil.com)
const safeNext = n => /^\/(?![\/\\])/.test(String(n || '')) ? n : '/chat';
// แถบที่เลื่อนข้างได้ (ซ่อน scrollbar): หมุนล้อเมาส์ = เลื่อนซ้าย-ขวา · เดิมบนคอมเลื่อนไม่ได้เลย (ได้แค่ทัชแพด/จอสัมผัส)
if (typeof document !== 'undefined') document.addEventListener('wheel', e => {
  if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  for (let el = e.target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const ox = getComputedStyle(el).overflowX; if (ox !== 'auto' && ox !== 'scroll') continue;
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return; // กล่องที่เลื่อนลงได้: ปล่อยเลื่อนลงตามปกติ
    const max = el.scrollWidth - el.clientWidth; if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
    el.scrollLeft += e.deltaY; e.preventDefault(); return;
  }
}, { passive: false });
async function api(path, opt = {}) {
  if (opt.body && !(opt.body instanceof FormData)) { opt.body = JSON.stringify(opt.body); opt.headers = { 'content-type': 'application/json' }; }
  const pre = !opt.method && !opt.body && window.__pre?.[path]; if (pre) delete window.__pre[path]; // คำขอที่ theme.js เริ่มไว้ตั้งแต่หัวหน้า (ใช้ครั้งเดียว)
  const r = (pre && await pre.catch(() => null)) || await fetch('/api' + path, opt);
  const json = r.headers.get('content-type')?.includes('json'), d = json ? await r.json().catch(() => null) : null;
  if (r.status === 401) me = null;
  if (!r.ok) { // ไม่ใช่ JSON = error จาก Vercel/Cloudflare เอง โชว์รหัสกับต้นข้อความไว้หาสาเหตุ
    const raw = json ? '' : (await r.text().catch(() => '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    errNote(`API ${opt.method || 'GET'} ${path.split('?')[0]} → ${r.status} ${d?.error || raw || ''}`);
    throw Object.assign(new Error(d?.error || (d?.need2fa ? 'ต้องใช้รหัส 2FA' : `ผิดพลาด (HTTP ${r.status}${raw ? ': ' + raw : ''})`)), { data: d, status: r.status });
  }
  if (/^\/(pricing|plans|settings\/public|status)(\/|\?|$)/.test(path) && (!opt.method || opt.method === 'GET')) return biLang(d);
  return d;
}

// error ล่าสุดในหน้า (แนบไปกับปุ่ม "แจ้งปัญหา" อัตโนมัติ)
if (typeof window !== 'undefined') window.__errs = window.__errs || [];
function errNote(m) { try { window.__errs.push(new Date().toTimeString().slice(0, 8) + ' ' + String(m).slice(0, 240)); if (window.__errs.length > 20) window.__errs.shift(); } catch { /* */ } }
if (typeof window !== 'undefined') addEventListener('error', e => errNote('JS: ' + (e.message || e.error?.message || 'error') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
if (typeof window !== 'undefined') addEventListener('unhandledrejection', e => errNote('Promise: ' + (e.reason?.message || e.reason || '')));
// รูปที่ผู้ใช้แนบในข้อความ (เซิร์ฟเวอร์เก็บไว้แล้วอ้างเป็น ![รูปที่แนบ](/api/img/...)): แสดงเป็นรูปย่อ ไม่แสดงเป็นข้อความดิบ
const ATT_IMG_RE = /\n*!\[รูปที่แนบ\]\((\/api\/img\/\d+\/[\w-]+\.(?:png|jpg))\)/g;
const attImgsOf = s => [...String(s || '').matchAll(ATT_IMG_RE)].map(m => m[1]);
const noAttImgs = s => String(s || '').replace(ATT_IMG_RE, '');
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
    return `<div class="code ${file ? 'file' : ''}"><div class="code-h">${file ? `<span class="fname">${ic('filetext')} ${esc(file)}</span>` : `<span>${esc(lang || 'code')}</span>`}${/^(html|svg|xml)$/i.test(lang) ? `<button class="run-code">${ic('play')} Preview</button>` : ''}${/^html$/i.test(lang) && typeof me !== 'undefined' && me?.plan && !me.plan.artifacts && document.body.dataset.page === 'chat' ? `<button class="art-up" title="แพลนที่ชำระเงิน: AI สร้างเป็นหน้าเว็บที่แก้เป็นเวอร์ชันและแชร์ลิงก์ได้">${ic('sparkles')} อัปเกรดเพื่อเปิดเป็นหน้าเว็บ</button>` : ''}${/^(python|py)$/i.test(lang) && !file && pageName() === 'chat' ? `<button class="run-py">${ic('play')} Run</button>` : ''}<button class="cp-code">Copy</button><button class="dl-code ${file ? 'main' : ''}" data-name="${esc(file || info.match(/\bpath=(\S+)/)?.[1]?.split('/').pop() || '')}" data-lang="${esc(lang)}" aria-label="ดาวน์โหลด">${ic('download')}${file ? ' Download' : ''}</button></div><pre tabindex="0"><code>${body}</code></pre></div>`;
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
// ระหว่างคิด: แสดง "กำลังคิด" + เวลาที่นับสด + หัวข้อที่ AI กำลังคิดอยู่ (หัวข้อตัวหนาล่าสุด หรือประโยคล่าสุด) · คิดเสร็จ: "คิดไป N วินาที"
const thinkTopic = s => { const t = String(s || ''), hs = [...t.matchAll(/\*\*([^*\n]{3,90})\*\*/g)]; if (hs.length) return hs.at(-1)[1].trim(); const ls = t.replace(/\*\*/g, '').split(/\n+/).map(x => x.trim()).filter(x => x.length > 3); return (ls.at(-1) || '').slice(-90); };
const thinkLabel = (m, i = 1, n = 1) => {
  if (m.streaming && !m.content) { const tp = thinkTopic(m.thinking); return `<span class="shimmer">กำลังคิด</span>${m.t0 ? `<span class="think-t" data-t0="${m.t0}">${Math.max(0, Math.round((Date.now() - m.t0) / 1000))} วิ</span>` : ''}${tp ? `<span class="think-now">${esc(tp)}</span>` : ''}`; }
  return `คิดไป${m.thinkSec ? ` ${m.thinkSec} วินาที` : 'แล้ว'}${n > 1 ? ` · รอบที่ ${i}/${n}` : ''}`;
};
// ความคิด: หัวข้อตัวหนา = ขั้นตอน (มีจุดนำ) · รายการ - / * = จุด · `โค้ด` = ตัวพิมพ์โค้ด · ที่เหลือคงบรรทัดเดิม
const thinkText = s => esc(s).replace(/`([^`\n]{1,120})`/g, '<code>$1</code>').replace(/^[ \t]*[-*•][ \t]+/gm, '• ')
  .replace(/\*\*([^*\n]+)\*\*/g, '<b class="th-h">$1</b>').replace(/\n*(<b class="th-h">[^<]*<\/b>)\n*/g, '$1').trim(); // หัวข้อเป็นบล็อก: ตัดบรรทัดว่างรอบหัวข้อ (ระยะห่างใช้ CSS)
const thinkHTML = (m, i = 1, n = 1) => m.thinking ? `<details class="think${m.streaming && !m.content ? ' live' : ''}"><summary>${ic('sparkles', 'sm think-ic')}<span class="think-s">${thinkLabel(m, i, n)}</span>${ic('down', 'sm chev')}</summary><div class="think-b">${thinkText(m.thinking)}</div></details>` : '';
// นับวินาทีสดของกล่องที่กำลังคิด (ทุกกล่องในหน้า)
if (typeof document !== 'undefined' && !window.__thinkTick) window.__thinkTick = setInterval(() => { for (const e of document.querySelectorAll('.think-t[data-t0]')) e.textContent = Math.max(0, Math.round((Date.now() - +e.dataset.t0) / 1000)) + ' วิ'; }, 1000);
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
  if (hasSegs(m)) { // คิดหลายรอบ: วาดใหม่ทั้งชุด แต่คงกล่องที่ผู้ใช้เปิดไว้ และตำแหน่งเลื่อนในกล่อง (เดิมหุบเองทุกครั้งที่มีข้อความใหม่)
    const b0 = el.querySelector('.b'), was = [...b0.querySelectorAll('.think')].map(d => ({ open: d.open, top: d.querySelector('.think-b')?.scrollTop || 0 }));
    el.querySelector(':scope > .think')?.remove(); b0.innerHTML = segHTML(m, body);
    [...b0.querySelectorAll('.think')].forEach((d, i) => { if (was[i]?.open) { d.open = true; const tb = d.querySelector('.think-b'); if (tb) tb.scrollTop = was[i].top; } });
    return;
  }
  let th = el.querySelector('.think');
  if (m.thinking && !th) { el.insertAdjacentHTML('afterbegin', thinkHTML(m)); th = el.querySelector('.think'); }
  if (th) {
    const b = th.querySelector('.think-b'), stick = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    b.innerHTML = thinkText(m.thinking); th.querySelector('.think-s').innerHTML = thinkLabel(m); th.classList.toggle('live', !!(m.streaming && !m.content));
    if (stick) b.scrollTop = b.scrollHeight;
  }
  if (m.todos?.length && typeof todoHTML === 'function' && el.closest('#cmsgs')) { const td = el.querySelector('.todos'), h = todoHTML(m); if (td) td.outerHTML = h; else el.querySelector('.b').insertAdjacentHTML('beforebegin', h); } // รายการงานสด (โหมด Code)
  if (m.mcps?.length && typeof toolSteps === 'function' && el.closest('#cmsgs')) { // โหมด Code: ขั้นตอนเครื่องมือแบบพับได้ (code.js)
    const ts = el.querySelector('.tsteps'), h = toolSteps(m);
    if (ts) ts.outerHTML = h; else el.querySelector('.b').insertAdjacentHTML('beforebegin', h);
  } else if (m.mcps?.length) {
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
// คัดลอก: มี html = วางใน Word/Docs ได้หน้าตาเดิม ส่วนแอปแชตได้ข้อความล้วน · clipboard API ใช้ไม่ได้ (เบราว์เซอร์เก่า/ในแอป) ใช้ textarea แทน
async function copy(text, btn, html) {
  let ok = false;
  if (html && window.ClipboardItem) try { await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]); ok = true; } catch { /* ไม่รองรับ html: ใช้ข้อความล้วน */ }
  if (!ok) try { await navigator.clipboard.writeText(text); ok = true; } catch { /* ไม่มีสิทธิ์ clipboard */ }
  if (!ok) { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;opacity:0'; document.body.append(t); t.select(); try { ok = document.execCommand('copy'); } catch { /* ไม่รองรับ */ } t.remove(); }
  if (!ok) return toast('คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอก', 'bad');
  btn = btn?.closest?.('button') || btn; if (!btn) return;
  const o = btn.innerHTML; btn.innerHTML = ic('check', 'sm') + ' คัดลอกแล้ว'; setTimeout(() => btn.innerHTML = o, 1500);
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
// แอป Kyber Desktop รุ่นเก่า (0.2.x): ปุ่มเปิดหน้าต่าง "ทำงานในเครื่อง" (ครั้งแรกสร้าง API key ชื่อ Desktop) · รุ่นใหม่ (มี .fs) ทำงานในเครื่องจากแชต/Code ได้เลย จึงไม่ต้องมีปุ่มนี้
const osName = () => /Mac/i.test(navigator.platform) ? 'mac' : /Linux/i.test(navigator.platform) && !/Android/i.test(navigator.userAgent) ? 'linux' : 'win';
const dlLink = (cls = '') => window.astraDesktop ? '' : `<a class="${cls}" href="/#download">${ic('download')}<span>ดาวน์โหลดแอปคอม</span></a>`;
const deskLink = (cls = '') => window.astraDesktop && !window.astraDesktop.fs && me ? `<a class="${cls}" href="#" data-desk>${ic('code')}<span>ทำงานในเครื่อง</span></a>` : '';
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-desk]'); if (!b || !window.astraDesktop) return; e.preventDefault();
  try { let k = ''; if (await window.astraDesktop.needKey()) k = (await api('/keys', { method: 'POST', body: { name: 'Desktop' } })).key; await window.astraDesktop.openAgent(k); }
  catch (x) { toast(x.message, 'bad'); }
});
const navL = (h, t, i) => `<a class="l${curl().pathname === h ? ' on' : ''}" href="${h}">${ic(i)}<span>${t}</span></a>`;
// มุมขวาบน: ล็อกอินแล้ว = วงแหวนลิมิต (กดเปิดรายละเอียด) + ยอด Wallet + ปุ่มบัญชี · ยังไม่ล็อกอิน = Log in + Get started free
const navRight = () => me
  ? `<div class="nav-r"><button type="button" class="nav-lim" aria-label="ลิมิตการใช้งาน">${limHTML(me.usage)}</button><button type="button" class="nav-bell" aria-label="การแจ้งเตือน">${ic('bell')}<i hidden></i></button><a class="nav-wal" href="/plans?topup=1" aria-label="เติมเงิน Wallet (ยอด ฿${baht(me.balance)})"><span class="w-amt">฿${baht(me.balance)}</span><span class="w-add">${ic('wallet', 'sm')}+<span class="w-t">เติมเงิน</span></span></a><a class="nav-av" href="/account" aria-label="บัญชี ${esc(me.email)}">${esc((me.email || '?')[0].toUpperCase())}</a></div>`
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
// แทน onclick=/onsubmit= ใน HTML (CSP ห้ามสคริปต์ inline): data-reload = โหลดหน้าใหม่ · data-select = เลือกข้อความในช่อง · data-nosubmit = ฟอร์มไม่ส่งเอง
document.addEventListener('click', e => { if (e.target.closest?.('[data-reload]')) location.reload(); else if (e.target.matches?.('input[data-select],textarea[data-select]')) e.target.select(); });
document.addEventListener('submit', e => { if (e.target.matches?.('form[data-nosubmit]')) e.preventDefault(); }, true);
document.addEventListener('click', e => { const b = e.target.closest?.('[data-lang]'); if (!b || b.dataset.lang === (window.LANG || 'th')) return; try { localStorage.setItem('lang', b.dataset.lang); } catch { /* ไม่มีที่เก็บ */ } location.reload(); });
// ทางลัดในแถบข้าง (UI 2.5): ของที่ลูกค้าหาไม่เจอเดิมซ่อนอยู่ในตั้งค่า ยกขึ้นมาไว้แถวเดียวกัน · onChat = หน้าแชตเปิดแผ่นในหน้าเดียว
const sideQuick = (onChat = false) => {
  const it = (tag, attrs, icon, t, sub = '') => `<${tag} class="qn" ${attrs}>${ic(icon, 'sm')}<span>${t}</span>${sub ? `<small${tag === 'button' && attrs.includes('spc') ? ' id="spcN"' : ''}>${sub}</small>` : ''}</${tag}>`;
  return `<nav class="side-qn" aria-label="ทางลัด">
    ${onChat ? it('button', 'type="button" id="spc"', 'folder', 'Workspace', 'เครื่องมือ + โฟลเดอร์') : it('a', 'href="/chat?open=spaces"', 'folder', 'Workspace')}
    ${me?.plan?.artifacts ? (onChat ? it('button', 'type="button" id="arts"', 'code', 'Artifacts') : it('a', 'href="/chat?open=arts"', 'code', 'Artifacts')) : ''}
    ${it('a', 'href="/developers"', 'braces', 'API นักพัฒนา', 'คีย์ · เอกสาร')}
    ${window.astraDesktop ? deskLink('qn') : it('a', 'href="/#download"', 'download', 'แอปบนคอม', 'Windows · Linux')}
    ${it('a', 'href="/plans"', 'layers', 'แพลนและเติมเงิน', me ? '฿' + baht(me.balance) : '')}
  </nav>`;
};
// การ์ดโปรไฟล์ในเมนูข้าง: วงกลมตัวอักษร + อีเมล + แพลน (กดไปหน้าบัญชี)
const navProfile = () => `<a class="prof${curl().pathname === '/account' ? ' on' : ''}" href="/account"><span class="nav-av">${esc((me.email || '?')[0].toUpperCase())}</span><span class="pi"><b>${esc(me.email)}</b><small>${esc(me.plan?.name || '')}${me.role === 'admin' ? ' · Admin' : ''}</small></span></a>`;
// แถบข้างเดียวกับหน้าแชตทุกหน้า: จอกว้างแสดงค้างไว้ · มือถือเป็นลิ้นชักจากปุ่มเมนู
// ล็อกอินแล้ว = สลับ Chat / Code, แชตใหม่, แชตล่าสุด, แถวผู้ใช้ (เมนูบัญชี + ตั้งค่า) · ยังไม่ล็อกอิน = ลิงก์หน้าสาธารณะ + เข้าสู่ระบบ
const nav = () => {
  const path = curl().pathname, inCode = path.startsWith('/code');
  const body = me ? `<div class="mode-seg" role="group" aria-label="Mode"><a href="/chat" class="${inCode ? '' : path === '/chat' ? 'on' : ''}">${ic('msg', 'sm')}<span>Chat</span></a><a href="/code" class="${inCode ? 'on' : ''}">${ic('code', 'sm')}<span>Code</span></a><a href="/chat?mode=cowork" title="Kyber Harness">${ic('layers', 'sm')}<span>Harness</span></a></div>
    <a class="side-new" href="${inCode ? '/code' : '/chat'}">${ic('plus', 'sm')}<span>${inCode ? 'New project' : 'New chat'}</span></a>
    ${inCode ? '' : sideQuick(false)}
    <div class="side-sec"><span>${inCode ? 'Projects' : 'Chats'}</span></div>
    <div class="nav-recents" data-kind="${inCode ? 'code' : 'chat'}"><p class="muted">Loading…</p></div>
    <button type="button" class="side-user" data-acct aria-haspopup="menu" aria-expanded="false" title="${esc(me.email)}"><span class="av sm">${esc((me.email || 'A')[0].toUpperCase())}</span><span class="su-t"><b>${esc(me.email.split('@')[0])}</b><small>${esc(me.plan?.name || '')} · <span class="su-pct">${Math.round(Math.max(me.usage?.pct4h || 0, me.usage?.pctWeek || 0))}</span>% used</small></span>${ic('up', 'sm')}</button>`
    : `${navL('/', 'Home', 'sparkles')}${navL('/pricing', 'Pricing', 'tag')}${navL('/plans', 'Plans', 'layers')}${navL('/developers', 'API', 'braces')}${window.astraDesktop ? '' : navL('/#download', 'Desktop app', 'download')}${navL('/blog', 'Blog', 'news')}${navL('/status', 'Status', 'activity')}
    <span class="sp"></span>${langSeg()}<a class="btn out" href="/login">Log in</a><a class="btn blue" href="/login">Get started free</a>`;
  return `<nav class="nav"><div class="nav-top"><button class="nav-btn" type="button" aria-label="Menu" aria-expanded="false">${ic('menu')}</button><a class="logo" href="/">Kyber<span class="v25">2.5</span></a>${navRight()}</div>
  <div class="nav-scrim"></div><div class="nav-panel"><div class="nav-head"><a class="logo" href="/">Kyber<span class="v25">2.5</span></a><button class="nav-btn nav-x" type="button" aria-label="Close menu">${ic('x')}</button></div>
  ${body}</div></nav>`;
};
// แชตล่าสุด / โปรเจกต์ในแถบข้างของหน้าอื่น (โหลดครั้งเดียวต่อ 60 วินาที)
let sideCache = {};
async function navRecents() {
  const box = document.querySelector('.nav-recents'); if (!box || !me) return;
  const kind = box.dataset.kind, hit = sideCache[kind];
  const rows = hit && Date.now() - hit.at < 60e3 ? hit.rows : await api(kind === 'code' ? '/projects' : '/chats').catch(() => null);
  if (rows) sideCache[kind] = { at: Date.now(), rows };
  if (!document.body.contains(box)) return;
  const clean = t => esc(String(t || '').replace(/^\p{Extended_Pictographic}️?\s*/u, ''));
  box.innerHTML = !rows ? '<p class="muted">Could not load</p>'
    : kind === 'code' ? (rows.slice(0, 15).map(p => `<a class="l" href="/code?p=${p.id}">${ic('code', 'sm')}<span>${clean(p.name)}</span></a>`).join('') || '<p class="muted">No projects yet</p>')
    : (rows.filter(c => !c.folder_id).sort((a, b) => (b.pinned || 0) - (a.pinned || 0)).slice(0, 15).map(c => `<a class="l" href="/chat?id=${c.id}">${ic(c.pinned ? 'star' : 'msg', c.pinned ? 'sm bm-on' : 'sm')}<span>${clean(c.title)}</span></a>`).join('') || '<p class="muted">No chats yet</p>');
}
// เมนูบัญชี (แถวผู้ใช้ล่างแถบข้าง ทุกหน้า): ลิมิต, ตั้งค่า, แพลน, เติมเงิน, ติดต่อ, หลังบ้าน, ออกจากระบบ
function acctMenu(btn, host) {
  const old = host?.querySelector('.acct-pop');
  if (old) { old.remove(); btn?.setAttribute('aria-expanded', 'false'); return; }
  const u = me.usage || {}, bar = (label, v) => `<div class="ap-bar"><span>${label}</span><span>${Math.round(v || 0)}%</span><i><b style="width:${Math.min(100, Math.max(2, v || 0))}%"></b></i></div>`;
  const pop = document.createElement('div'); pop.className = 'acct-pop'; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Account menu');
  pop.innerHTML = `<div class="ap-head"><div class="ap-who"><span>${esc(me.email)}</span><em>${esc(me.plan?.name || '')}</em></div>${u.use4h === false ? '' : bar('4-hour window', u.pct4h)}${bar('This week', u.pctWeek)}</div>
    <button type="button" role="menuitem" data-ap="settings">${ic('settings')}<span>Settings</span></button>
    <a role="menuitem" href="/plans">${ic('layers')}<span>Plans &amp; upgrade</span></a>
    <a role="menuitem" href="/pricing">${ic('tag')}<span>Pricing (ราคาต่อโมเดล)</span></a>
    <a role="menuitem" href="/developers">${ic('braces')}<span>API สำหรับนักพัฒนา</span></a>
    <a role="menuitem" href="/plans?topup=1">${ic('wallet')}<span>Top up</span><small>฿${baht(me.balance)}</small></a>
    <hr>
    <a role="menuitem" href="${FB_PAGE}" target="_blank" rel="noopener">${ic('msg')}<span>แชตกับแอดมิน (Facebook)</span></a>
    <button type="button" role="menuitem" data-ap="bug">${ic('alert')}<span>แจ้งปัญหา / บั๊ก</span></button>
    <a role="menuitem" href="/support">${ic('mail')}<span>Contact &amp; support</span></a>
    ${['admin', 'support', 'viewer'].includes(me.role) ? `<a role="menuitem" href="/admin">${ic('dash')}<span>Admin</span></a>` : ''}
    <button type="button" role="menuitem" data-ap="out" class="ap-out">${ic('logout')}<span>Log out</span></button>`;
  host.append(pop); btn?.setAttribute('aria-expanded', 'true'); pop.querySelector('[role=menuitem]')?.focus();
  const close = () => { pop.remove(); btn?.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); };
  const outside = e => { if (!pop.contains(e.target) && !btn?.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('click', outside, true));
  pop.onkeydown = e => { if (e.key === 'Escape') { close(); btn?.focus(); } };
  pop.onclick = async e => {
    const it = e.target.closest('[role=menuitem]'); if (!it) return;
    close();
    if (it.dataset.ap === 'settings') { e.preventDefault(); settingsSheet(); }
    if (it.dataset.ap === 'bug') { e.preventDefault(); bugSheet(); }
    if (it.dataset.ap === 'out') { e.preventDefault(); await api('/logout', { method: 'POST' }).catch(() => {}); me = null; go('/'); }
  };
}
// ตั้งค่า (ทุกหน้า): แพลน, เติมเงิน, ลิมิต, บัญชี, แชต (ถังขยะ/ข้อความที่บันทึก), นักพัฒนา, แอปคอม, ช่วยเหลือ, ภาษา
// ตั้งค่า → Connectors / Skills / Plugins: โค้ดหน้านี้โหลดเมื่อเปิดครั้งแรก (ไม่ทำให้ทุกหน้าหนักขึ้น)
let connJs = null;
function openConnectors(tab, view) {
  connJs ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/connectors-ui.js'; s.onload = ok; s.onerror = () => { connJs = null; no(new Error('โหลดไม่สำเร็จ ลองใหม่')); }; document.head.append(s); });
  return connJs.then(() => window.connectorsPage(tab, view)).catch(x => toast(x.message, 'bad'));
}
function settingsSheet() {
  const row = (href, icon, t, d = '') => `<a class="opt" href="${href}"><span class="opt-t">${ic(icon)}${t}</span>${d ? `<span class="opt-d">${d}</span>` : ''}</a>`;
  const btn = (k, icon, t, d = '') => `<button type="button" class="opt" data-k="${k}"><span class="opt-t">${ic(icon)}${t}</span>${d ? `<span class="opt-d">${d}</span>` : ''}</button>`;
  const onChat = typeof binSheet === 'function'; // หน้าแชตเปิดถังขยะ/ข้อความที่บันทึกได้ทันที · หน้าอื่นพาไปเปิดที่หน้าแชต
  sheet('Settings', `<div class="sheet-form set-sheet">
    <h4>Plan &amp; usage</h4>
    ${row('/plans', 'layers', 'Plan · ' + esc(me.plan?.name || ''), 'View or change your plan')}
    ${row('/pricing', 'tag', 'Pricing', 'ราคาต่อ token ของทุกโมเดล + เครื่องคิดเลข')}
    ${row('/plans?topup=1', 'wallet', 'Top up · ฿' + baht(me.balance), 'PromptPay · for models outside your plan and when the limit is full')}
    ${btn('lim', 'clock', 'Usage limits', '4-hour and weekly windows')}
    <h4>Account</h4>
    ${row('/account', 'user', 'Account &amp; security', 'Profile, 2FA, passkeys, custom instructions, memory, theme')}
    <label class="opt set-toggle"><span class="opt-t">${ic('bulb')}Auto-save memory</span><span class="opt-d">AI remembers lasting facts you share (up to 3 a day). You can undo each one.</span><input type="checkbox" data-k="automem" ${me.auto_memory ? 'checked' : ''}></label>
    <h4>Chats</h4>
    ${onChat ? btn('bin', 'trash', 'Archive &amp; trash', 'Deleted chats can be restored for 30 days') : row('/chat?open=bin', 'trash', 'Archive &amp; trash', 'Deleted chats can be restored for 30 days')}
    ${onChat ? btn('arts', 'code', 'Artifacts', 'Pages the AI built in your chats') : row('/chat?open=arts', 'code', 'Artifacts', 'Pages the AI built in your chats')}
    ${onChat ? btn('saved', 'book', 'Saved messages', 'Answers you bookmarked before') : row('/chat?open=saved', 'book', 'Saved messages', 'Answers you bookmarked before')}
    <h4>Connectors &amp; tools</h4>
    ${btn('conn', 'layers', 'Connectors · Skills · Plugins', 'Connect Google, Notion, GitHub and more so the AI can use them in every chat')}
    <h4>Developers &amp; apps</h4>
    ${row('/developers', 'braces', 'Developer API', 'API keys and OpenAI-compatible usage')}
    ${window.astraDesktop ? '' : row('/#download', 'download', 'Desktop app', 'Windows · Linux: let the AI work with files on your computer')}
    <h4>Help</h4>
    <a class="opt" href="${FB_PAGE}" target="_blank" rel="noopener"><span class="opt-t">${ic('msg')}แชตกับแอดมิน (Facebook)</span><span class="opt-d">ตอบเร็วที่สุด</span></a>
    ${row('/support', 'mail', 'Contact &amp; support')}
    ${row('/pricing', 'tag', 'Pricing', 'Model prices per 1M tokens')}
    ${row('/blog?c=1', 'sparkles', 'What’s new')}
    ${row('/blog', 'news', 'Blog')}
    ${row('/status', 'activity', 'System status')}
    <h4>Language</h4>${langSeg()}
  </div>`, (d, close) => {
    d.querySelectorAll('a.opt').forEach(a => a.addEventListener('click', close));
    d.querySelector('[data-k=lim]').onclick = () => { close(); limitSheet(); };
    d.querySelector('[data-k=conn]').onclick = () => { close(); openConnectors(); };
    d.querySelector('[data-k=automem]').onchange = async e => { const on = e.target.checked; try { await api('/me', { method: 'PUT', body: { auto_memory: on } }); me.auto_memory = on ? 1 : 0; toast(on ? 'Auto-save memory on' : 'Auto-save memory off', 'ok'); } catch (x) { e.target.checked = !on; toast(x.message, 'bad'); } };
    if (onChat) { d.querySelector('[data-k=bin]').onclick = () => { close(); binSheet(); }; d.querySelector('[data-k=saved]').onclick = () => { close(); bookmarksSheet(); }; d.querySelector('[data-k=arts]').onclick = () => { close(); artsSheet(); }; }
  });
}
document.addEventListener('click', e => { const b = e.target.closest?.('.nav [data-acct]'); if (!b || !me) return; e.stopPropagation(); acctMenu(b, b.closest('.nav-panel')); });
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
const page = html => { const again = !!app.querySelector('.view'), y = scrollY; app.innerHTML = `<div class="view${again ? ' still' : ''}${html.startsWith('<nav class="nav"') ? ' with-side' : ''}">${html}</div>`; navRecents(); if (again) scrollTo(0, y); let seen = 0; try { seen = +localStorage.getItem('clSeen') || 0; } catch { /* ไม่มีที่เก็บ */ } if (site?.cl_latest > seen) app.querySelector('#clnav')?.classList.add('dot'); if (me) notifLoad(); };

// การ์ดแพลน: บอกแค่ใช้ได้กี่เท่าของ Free + ชื่อโมเดล (ตามลำดับที่ตั้งในหลังบ้าน ที่เหลือพับไว้) · ไม่โชว์จำนวนข้อความ
const PLAN_TOP = 8, pmChip = (m, hide) => `<span class="pm-chip${m.free ? ' free' : ''}"${hide ? ' hidden' : ''}>${m.free ? '<b>ฟรีไม่จำกัด</b> ' : ''}${esc(m.name)}</span>`;
document.addEventListener('click', e => { const b = e.target.closest?.('.pm-more'); if (!b) return; e.stopPropagation(); b.parentElement.querySelectorAll('.pm-chip[hidden]').forEach(c => c.hidden = false); b.remove(); }, true); // ก่อนตัวเลือกแพลนของการ์ด
function planTiles(plans, sel, period) { // UI 2.0: รายการแนวตั้ง · แพลนแนะนำ/ที่เลือกกางรายละเอียด แพลนอื่นแตะเพื่อกาง (หน้า /plans แตะ = เลือกแพลน)
  const promo = p => p.price > 0 && !p.once && promoOn(), xf = p => promo(p) ? Math.round(p.x_free * site.promo.xweek) : p.x_free;
  const maxX = Math.max(1, ...plans.map(p => xf(p) || 1)), shop = sel !== undefined;
  const openId = sel || plans.find(p => p.featured)?.id || plans.find(p => p.price > 0)?.id;
  const unit = p => p.price > 0 ? (period === 'year' ? '/ปี' : p.days && p.days !== 30 ? `/${p.days} วัน` : '/เดือน') : '';
  return `${plans.some(promo) ? `<div class="pl-promo">${ic('sparkles', 'sm')}<span><b>โปรถึง ${promoEnd()}</b> · รอบ 4 ชม. x${site.promo.x4h} · ลิมิตสัปดาห์ x${site.promo.xweek} ทุกแพลนที่ชำระเงิน</span></div>` : ''}
  <div class="pl" role="list">${plans.map(p => `<div role="listitem" class="tile plan${sel === p.id ? ' sel' : ''}${p.featured ? ' feat' : ''}${p.id === openId ? ' open' : ''}" data-plan="${p.id}" tabindex="0" aria-expanded="${p.id === openId}">
    <div class="pl-h"><div class="pl-n"><b>${esc(p.name)}</b>${p.featured ? '<span class="pl-badge">แนะนำ</span>' : ''}${p.seats > 1 ? `<small>ทีม ${p.seats} คน</small>` : ''}</div>
      <div class="pl-p">${p.price > 0 ? fmtPlanPrice(period === 'year' ? p.price_year : p.price) : 'ฟรี'}<small>${unit(p)}</small></div>${ic('down', 'sm pl-chev')}</div>
    ${p.x_free > 1 ? `<div class="pl-x"><span>ลิมิตมากกว่า Free <b>${num(xf(p))} เท่า</b>${promo(p) ? ` <small class="muted">ช่วงโปร · ปกติ ${num(p.x_free)} เท่า</small>` : ''}${p.seats > 1 ? ' <small class="muted">รวมทั้งทีม</small>' : ''}</span><i class="pl-bar"><i style="width:${Math.max(4, Math.round(Math.sqrt(xf(p) / maxX) * 100))}%"></i></i></div>` : ''}
    <div class="pl-more">
      ${period === 'year' && p.price_year ? `<div class="ok pl-li">${ic('check', 'sm')} ประหยัด ${Math.round((1 - p.price_year / (p.price * 12)) * 100)}% เทียบรายเดือน</div>` : ''}
      ${p.description ? `<p class="pl-desc">${esc(p.description)}</p>` : ''}
      ${p.compare ? `<div class="pl-li">${ic('trend', 'sm')}<span>${esc(p.compare)}</span></div>` : ''}
      ${p.seats > 1 ? `<div class="pl-li">${ic('users', 'sm')}<span>สูงสุด ${p.seats} คน · ${p.shared_pool ? 'งบรวมทั้งทีม' : 'แยกโควตาต่อคน'}</span></div>` : ''}
      ${p.price >= 1490 && !p.once && !(p.days > 0 && p.days <= 7) ? `<div class="pl-li">${ic('sparkles', 'sm')}<span>แถม Claude Eco เทียบเท่า $100 ทุกเดือน <small class="muted">(ตามราคา API ทางการ · สมาชิกใหม่ · ใช้ได้ 25 วัน)</small></span></div>` : ''}
      ${p.api_limit ? `<div class="pl-li">${ic('check', 'sm')}<span>ใช้ API Key หักจากลิมิตแพลน</span></div>` : ''}
      ${p.once ? `<div class="pl-li">${ic('clock', 'sm')}<span>ซื้อได้ครั้งเดียวต่อบัญชี</span></div>` : ''}
      <div class="pm-head">ใช้ได้ ${p.models.length} โมเดล</div>
      <div class="pm-chips">${p.models.slice(0, PLAN_TOP).map(m => pmChip(m)).join('')}${p.models.length > PLAN_TOP ? `<button type="button" class="pm-more">+${p.models.length - PLAN_TOP} โมเดล</button>${p.models.slice(PLAN_TOP).map(m => pmChip(m, true)).join('')}` : ''}</div>
      ${shop ? (sel === p.id ? '' : `<button type="button" class="btn ${p.featured ? 'blue' : 'out'} pl-cta pl-pick">เลือก ${esc(p.name)}</button>`) : `<a class="btn ${p.featured ? 'blue' : 'out'} pl-cta" href="${!(p.price > 0) ? (me ? '/chat' : '/login') : me ? `/plans?plan=${p.id}` : '/login?next=' + encodeURIComponent('/plans?plan=' + p.id)}">${p.price > 0 ? 'เลือก ' + esc(p.name) : 'เริ่มใช้ฟรี'}</a>`}
    </div></div>`).join('')}</div>
    <p class="muted pl-foot">ทุกโมเดลในแพลนใช้ลิมิตก้อนเดียวกัน โมเดลที่เก่งกว่าใช้ลิมิตเร็วกว่า</p>`;
}
// แตะแถวแพลนเพื่อกาง/หุบ (หน้า /plans ผูก onclick เลือกแพลนเพิ่มเอง)
document.addEventListener('click', e => { const t = e.target.closest?.('.pl .tile.plan'); if (!t || e.target.closest('a,button:not(.pl-pick)')) return; const on = !t.classList.contains('open') || t.classList.contains('sel'); t.classList.toggle('open', on); t.setAttribute('aria-expanded', on); });
document.addEventListener('keydown', e => { const t = e.target.closest?.('.pl .tile.plan'); if (t && (e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); t.click(); } });
function compareTable(plans) {
  const names = [...new Set(plans.flatMap(p => p.models.map(m => m.name)))];
  return `<div class="tw"><table class="cmp"><tr><th></th>${plans.map(p => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr>
    <tr><th scope="row">ราคา/เดือน</th>${plans.map(p => `<td>${p.price > 0 ? fmtPlanPrice(p.price) : 'ฟรี'}</td>`).join('')}</tr>
    <tr><th scope="row">ใช้ได้มากกว่า Free</th>${plans.map(p => `<td>${p.x_free > 1 ? num(p.x_free) + ' เท่า' : '—'}</td>`).join('')}</tr>
    ${names.map(n => `<tr><th scope="row">${esc(n)}</th>${plans.map(p => `<td>${p.models.some(x => x.name === n) ? '<span class="ok">✓</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
    <tr><th scope="row">จำนวนผู้ใช้</th>${plans.map(p => `<td>${p.seats > 1 ? `${p.seats} คน (${p.shared_pool ? 'งบรวม' : 'แยกโควตา'})` : '1 คน'}</td>`).join('')}</tr>
    <tr><th scope="row">API Key</th>${plans.map(p => `<td>${p.api_limit ? '<span class="ok">หักลิมิตแพลนได้</span>' : '<span class="muted">หัก Wallet</span>'}</td>`).join('')}</tr>
    <tr><th scope="row">รีเซ็ตลิมิต</th>${plans.map(() => '<td>4 ชม. + สัปดาห์</td>').join('')}</tr></table></div>
`;
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

// ส่วนดาวน์โหลดแอปคอม: ปุ่มหลักตามระบบของผู้เข้าชม + ตัวอย่าง Agent คุมเครื่อง
function dlBand() {
  if (window.astraDesktop) return '';
  const os = osName(), P = { win: ['Windows', '/download/desktop', 'Windows 10 / 11 · ไฟล์ .exe'], linux: ['Linux', '/download/desktop?os=linux', 'AppImage'] };
  const main = P[os] || P.win, others = Object.entries(P).filter(([k]) => P[os] ? k !== os : k !== 'win'); // Mac หยุดพัฒนาแล้ว: แสดง Windows เป็นหลัก
  const feats = [['terminal', 'Agent ทำงานจนเสร็จ', 'แก้ไฟล์ รันคำสั่ง ทดสอบ แก้ซ้ำเองจนผ่าน เหมือน Claude Code'], ['cpu', 'คุมเมาส์ คีย์บอร์ด หน้าจอ', 'เปิดโปรแกรม คลิก พิมพ์ ใน Excel, Blender, เบราว์เซอร์ หยุดได้ทันทีด้วย Ctrl+Alt+Esc'], ['filetext', 'ทำไฟล์ Office ให้เลย', 'สร้าง Word, Excel, PowerPoint, PDF จากไฟล์ในโฟลเดอร์'], ['layers', 'ปลั๊กอิน MCP คลิกเดียว', 'คุมเบราว์เซอร์, GitHub, Google, ความจำถาวร ติดตั้ง Node.js ให้เอง'], ['smartphone', 'สั่งจากมือถือได้', 'คอมทำงาน มือถือดูความคืบหน้าและกดอนุญาต'], ['bell', 'งานตั้งเวลา', 'เช่น สรุปยอดขายทุกเช้า 07:30 เป็น Excel']];
  return `<div class="band dlband" id="download"><h2>แอป Kyber บนคอม</h2><p class="muted" style="text-align:center;margin:-8px auto 22px;max-width:620px">บัญชีเดียวกับเว็บ ลิมิตเดียวกัน แต่ AI ทำงานกับไฟล์และโปรแกรมในเครื่องคุณได้จริง</p>
    <div class="dl-grid"><div class="dl-main">
      <a class="btn blue dl-btn" href="${main[1]}">${ic('download')} ดาวน์โหลดสำหรับ ${main[0]}</a><div class="muted" style="font-size:13px;margin:6px 0 14px">${main[2]} · ฟรี · อัปเดตเอง</div>
      ${os === 'mac' ? '<p class="muted dl-note">แอปบนคอมรองรับ Windows และ Linux · บน Mac ใช้งานผ่านเว็บได้ครบทุกอย่าง</p>' : ''}
      <div class="dl-others">${others.map(([, p]) => `<a href="${p[1]}">${p[0]}</a>`).join('')}<a href="/download/cli" title="ใช้ใน VS Code / Terminal">CLI (เทอร์มินัล)</a></div>
      <ul class="dl-feat">${feats.map(([i, t, d]) => `<li>${ic(i, 'sm')}<div><b>${t}</b><span class="muted">${d}</span></div></li>`).join('')}</ul></div>
      <div class="showcase dl-shot" aria-hidden="true" inert><div class="sc-bar"><span class="sc-dots"><i></i><i></i><i></i></span><span class="sc-pill">${ic('folder', 'sm')} C:\\งานบัญชี</span><span class="sc-pill">Agent · ทำเองทั้งหมด</span></div>
        <div class="sc-chat"><div class="sc-u">รวมใบเสร็จ PDF ทั้งโฟลเดอร์ ทำ Excel แล้วส่งสรุปเข้า Gmail</div>
          <div class="sc-a"><div class="dl-step"><b>✓</b> read_document <code>ใบเสร็จ/*.pdf</code> <small>32 ไฟล์</small></div><div class="dl-step"><b>✓</b> bash <code>python รวมยอด.py</code></div><div class="dl-step"><b>✓</b> make_document <code>สรุปใบเสร็จ-พ.ย.xlsx</code></div><div class="dl-step"><b>✓</b> computer <code>open excel · ตรวจสูตร</code></div><div class="dl-step"><b>✓</b> gmail_draft <code>ถึง บัญชี@บริษัท</code></div>
          <p style="margin:10px 0 0">เสร็จแล้ว รวม <b>฿184,250</b> จาก 32 ใบ · VAT ถูกต้องทุกใบ · ร่างอีเมลรอให้กดส่ง</p></div></div></div>
    </div></div>`;
}
// ---------- หน้าแรก ----------
async function landing() {
  const [plans, posts, pr] = await Promise.all([api('/plans').catch(() => []), api('/blog').catch(() => []), api('/pricing').catch(() => ({ models: [] }))]);
  const cheapest = plans.filter(p => p.price > 0).sort((a, b) => a.price - b.price)[0];
  // ถูกกว่าซื้อ API ทางการ: เฉพาะโมเดลที่ตั้งราคาทางการไว้และเราถูกกว่า (เรียงตามลำดับโมเดลในระบบ) · ทางการแปลงเป็นบาทด้วยอัตราเดียวกับหน้าราคา
  const vs = pr.models.filter(m => m.official?.in > 0 && m.official?.out > 0 && m.out > 0).map(m => ({ m, pct: Math.round((1 - m.out / (m.official.out * usdRate())) * 100) })).filter(x => x.pct > 0).slice(0, 6);
  const vsRow = ({ m, pct }) => `<tr><td><b>${esc(m.name)}</b><div><span class="pill sale">ถูกกว่า <b>${pct}%</b></span></div></td><td class="vsp"><div>Input ${curSign()}${money(toCur(m.in))}<small class="muted"> · ทางการ ${curSign()}${money(toCur(m.official.in * usdRate()))}</small></div><div>Output ${curSign()}${money(toCur(m.out))}<small class="muted"> · ทางการ ${curSign()}${money(toCur(m.official.out * usdRate()))}</small></div></td></tr>`;
  page(nav() + `<section class="hero"><div class="name">Kyber</div><p class="muted" style="margin:-6px auto 10px">สร้างโดย Hypatia · เดิมคือ AstraCode</p>
    <h1>AI ทุกตัว<br><span class="h1-2">ที่ทำงานแทนคุณได้จริง</span></h1>
    <p>Claude, ChatGPT, Gemini และ DeepSeek ในที่เดียว ใช้ได้ทั้งมือถือ เว็บ และแอปบนคอมที่ให้ Agent คุมเครื่องทำงานจนเสร็จ${cheapest ? ` · เริ่มต้น <b>${fmtPlanPrice(cheapest.price)}</b>/เดือน` : ''}</p>
    ${me ? `<div class="row" style="justify-content:center"><a class="btn blue" href="/chat">Open Chat</a><a class="btn out" href="/account">My account</a>${window.astraDesktop ? '' : `<a class="btn out" href="#download" data-dlgo>${ic('download', 'sm')} ดาวน์โหลดแอปคอม</a>`}</div>` : '<div id="homeAuth" class="home-auth"></div>'}
    <div class="k25-row"><a class="k25-pill" href="/kyber25"><b>ใหม่</b>Kyber 2.5 · Agent ที่ฟังคุณทันที →</a></div>
    <a class="statusb" href="/status" id="stb" hidden></a>
    <div class="showcase" aria-hidden="true" inert>
      <div class="sc-bar"><span class="sc-dots"><i></i><i></i><i></i></span><span class="sc-pill">Claude Sonnet 5.5</span><span class="sc-pill">Thinking · High</span><span class="sp"></span><span class="lim"><i class="lmini" style="--p:24"><b></b></i>24%</span></div>
      <div class="sc-chat">
        <div class="sc-u">เขียนฟังก์ชัน Python เช็กเลขเฉพาะ พร้อมตัวอย่างทดสอบ</div>
        <div class="sc-a"><span class="sc-pill" style="margin-bottom:8px;display:inline-flex;gap:6px;align-items:center">${ic('sparkles', 'sm')} Thinking · 2 วินาที</span>
          ${md('```python\ndef is_prime(n: int) -> bool:\n    if n < 2:\n        return False\n    return all(n % i != 0 for i in range(2, int(n**0.5) + 1))\n```')}
        </div>
      </div>
    </div></section>
    <div class="wrap">
    <div class="band" id="feat"><h2>ทำอะไรได้บ้าง</h2><div class="fg">${[
      ['code', 'เขียนโค้ดบนเว็บ', 'ให้ AI แก้ไฟล์ รันผล แล้ว push ขึ้น GitHub ได้เลย', '/code'],
      ['layers', 'Agent ทำงานจนเสร็จ', 'สั่งครั้งเดียวแล้วปิดแอปได้ ทำงานต่อบนเซิร์ฟเวอร์ เสร็จแล้วแจ้งเตือน'],
      ['search', 'Deep research', 'ค้นเว็บหลายหัวข้อพร้อมกัน แล้วเขียนรายงานพร้อมแหล่งอ้างอิง'],
      ['filetext', 'ทำเอกสารให้เลย', 'สร้างและแก้ Excel, Word, PowerPoint, PDF จากไฟล์ของคุณ'],
      ['braces', 'API สำหรับนักพัฒนา', 'ใช้ทุกโมเดลผ่าน API แบบ OpenAI และ Anthropic หักจากลิมิตแพลนได้', '/developers'],
      ['wallet', `จ่ายง่าย เห็นลิมิตชัด`, `PromptPay${cheapest ? ` เริ่มต้น ${fmtPlanPrice(cheapest.price)}/เดือน` : ''} ไม่ต้องใช้บัตร · ลิมิตรีเซ็ตทุก 4 ชม.`],
    ].map(([i, t, d, h]) => `<${h ? `a href="${h}"` : 'div'} class="fi">${ic(i)}<b>${t}</b><span>${d}</span></${h ? 'a' : 'div'}>`).join('')}</div></div>
    <div class="band" id="plans"><h2>แพลน</h2><div style="text-align:center;margin-bottom:14px">${curSegHTML()}</div>${planTiles(plans)}</div>
    <p class="pl-all"><a href="/plans">ดูรายละเอียดและเทียบทุกแพลน →</a></p>
    ${dlBand()}
    ${vs.length ? `<div class="band" id="vs"><h2>ถูกกว่าซื้อ API ทางการ</h2><p class="muted" style="text-align:center;margin:-4px 0 14px">ราคาต่อ 1M token เทียบกับราคาทางการของเจ้าของโมเดล (คิดที่ $1 = ฿<b>${usdRate()}</b>)</p><div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>ราคาต่อ 1M token</th></tr>${vs.map(vsRow).join('')}</table></div><p style="text-align:center;margin-top:12px"><a href="/pricing">ดูราคาทุกโมเดล ›</a></p></div>` : ''}
    <div class="band"><h2>ทีม AI ทำงานแทนคุณ</h2><p class="muted" style="text-align:center;margin:-4px 0 14px">สั่งครั้งเดียวแล้วปิดแอปได้ ทำงานต่อบนเซิร์ฟเวอร์ เสร็จแล้วแจ้งทางอีเมล</p><div class="grid demos" aria-hidden="true" inert>
      <div class="tile demo"><div class="dm-h">${ic('code', 'sm')} ทีม Agent · โหมด Code</div><div class="dm-q">ทำเว็บร้านกาแฟ หน้าแรก เมนู และฟอร์มติดต่อ</div>
        <div class="dm-row lead"><b>หัวหน้า</b><span>แบ่งงาน 3 ชิ้น</span></div>
        ${[['หน้าแรก', 'index.html', 1], ['หน้าเมนู', 'menu.html', 2], ['ฟอร์มติดต่อ', 'contact.html', 3]].map(([t, f, i]) => `<div class="dm-row w" style="--i:${i}"><b>ลูกทีม</b><span>${t} <small>${f}</small></span><i class="dm-bar"><i></i></i><em>✓</em></div>`).join('')}
        <div class="dm-row rv"><b>ผู้ตรวจ</b><span>ตรวจรวม แก้ลิงก์เมนู 1 จุด · เสร็จ</span></div></div>
      <div class="tile demo"><div class="dm-h">${ic('search', 'sm')} Deep research · แชต</div><div class="dm-q">เปรียบเทียบรถยนต์ไฟฟ้าราคาไม่เกิน 1 ล้านในไทย</div>
        ${[['ราคาและรุ่น', 6], ['สถานีชาร์จ', 4], ['ต้นทุนต่อเดือน', 5]].map(([t, n], i) => `<div class="dm-row w" style="--i:${i + 1}"><b>ค้น</b><span>${t} <small>${n} แหล่ง</small></span><i class="dm-bar"><i></i></i><em>✓</em></div>`).join('')}
        <div class="dm-rep"><i></i><i></i><i></i><small>รายงานพร้อมอ้างอิง [1]–[15]</small></div></div>
    </div></div>
    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>
    <div class="band"><h2>คำถามที่พบบ่อย</h2>${faqHTML()}</div>
    ${posts.length ? `<div class="band"><h2>บทความล่าสุด</h2><div class="grid">${posts.slice(0, 3).map(postTile).join('')}</div></div>` : ''}
    ${footer()}</div>`);
  api('/status').then(d => { // สรุปสถานะโมเดลใต้ปุ่ม (ไม่รอก่อนวาดหน้า)
    const b = $('#stb'); if (!b || !d?.models?.length) return; const bad = d.models.filter(m => m.state !== 'ok').length;
    b.className = 'statusb ' + (bad ? 'warn' : 'ok'); b.innerHTML = bad ? `● โมเดลมีปัญหา <b>${bad}</b> ตัว · ดูสถานะ` : '● ทุกโมเดลทำงานปกติ'; b.hidden = false;
  }).catch(() => {});
  app.querySelectorAll('[data-dlgo]').forEach(a => a.onclick = e => { e.preventDefault(); $('#download')?.scrollIntoView({ behavior: 'smooth' }); });
  if (location.hash === '#download') setTimeout(() => $('#download')?.scrollIntoView(), 300);
  const plBtn = $('a[href="#plans"]'); if (plBtn) plBtn.onclick = e => { e.preventDefault(); $('#plans')?.scrollIntoView({ behavior: 'smooth' }); };
  // สลับสกุลเงิน: วาดใหม่เฉพาะส่วนแพลนกับตารางเทียบ ไม่โหลดทั้งหน้า (กันหน้าสะดุด/ภาพแตกบนมือถือ)
  const bindCur = () => app.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => {
    localStorage.setItem('cur', b.dataset.cur);
    const y = scrollY;
    $('#plans').innerHTML = `<h2>แพลน</h2><div style="text-align:center;margin-bottom:14px">${curSegHTML()}</div>${planTiles(plans)}`;
    bindCur(); scrollTo(0, y);
  });
  bindCur();
  bindInstall();
  homeFx();
  if (!me && $('#homeAuth')) auth($('#homeAuth')); // ยังไม่ล็อกอิน: ฟอร์มเข้าสู่ระบบ/สมัครอยู่บนหน้าแรกเลย
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
function auth(host = null) { // host = วางฟอร์มในหน้าอื่น (หน้าแรก) · ไม่ส่ง = หน้า /login เต็มหน้า
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
    const html = `<div class="auth ${host ? 'auth-inline' : 'wrap'}">${host && tabs ? '' : `<h1>${title[mode]}</h1>`}
      ${tabs ? `<div class="tabs"><button class="${mode === 'login' ? 'on' : ''}" data-m="login">Log in</button><button class="${mode === 'register' ? 'on' : ''}" data-m="register">Sign up</button></div>` : ''}
      <form class="card" id="f">${tabs && (site.google || site.line) ? `<div class="social">${site.google ? `<a class="btn out" href="/api/oauth/google${ref ? '?ref=' + encodeURIComponent(ref) : ''}">Continue with Google</a>` : ''}
        ${site.line ? `<a class="btn out line" href="/api/oauth/line${ref ? '?ref=' + encodeURIComponent(ref) : ''}">Continue with LINE</a>` : ''}<div class="or"><span>หรือ</span></div></div>` : ''}
      ${forms[mode]()}
      ${site.turnstile && ['login', 'register', 'forgot', 'verify', 'code'].includes(mode) ? '<div id="cft" style="margin:12px 0"></div>' : ''}<div class="err" id="e">${esc(msg)}</div><button class="btn blue" style="width:100%">${btn[mode]}</button>
      ${mode === 'verify' ? '<div class="row" style="justify-content:center;margin-top:12px"><button type="button" class="btn out sm" id="resend">Resend link</button><a href="#" data-m="login">ใช้อีเมลอื่น</a></div>' : ''}
      ${mode === 'login' && window.PublicKeyCredential ? '<button type="button" class="btn out" id="pkl" style="width:100%;margin-top:10px">เข้าสู่ระบบด้วย Passkey</button>' : ''}
      ${mode === 'login' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="forgot">ลืมรหัสผ่าน?</a></p>' : ''}
      ${!tabs && mode !== 'verify' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="login">กลับไปเข้าสู่ระบบ</a></p>' : ''}
      <p class="muted" style="text-align:center;margin:12px 0 0">การ${mode === 'register' ? 'สมัคร' : 'ใช้งาน'}ถือว่ายอมรับ<a href="/terms">เงื่อนไขและนโยบายความเป็นส่วนตัว</a></p></form></div>`;
    if (host) { if (!document.body.contains(host)) return; host.innerHTML = html; } else page(nav() + html);
    (host || app).querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.preventDefault(); mode = b.dataset.m; msg = ''; draw(); });
    if (site.turnstile && $('#cft')) { // กันบอท (เปิดเมื่อแอดมินตั้ง Turnstile)
      const go = () => window.turnstile.render('#cft', { sitekey: site.turnstile, theme: 'dark' });
      if (window.turnstile) go(); else { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.onload = go; document.head.append(sc); }
    }
    const busy = (b, on) => { b.disabled = on; b.classList.toggle('loading', on); };
    $('#pkl')?.addEventListener('click', async e => { busy(e.target, true); $('#e').textContent = ''; try { await passkeyLogin(); await done(); } catch (x) { if (x.name !== 'NotAllowedError') $('#e').textContent = x.message; busy(e.target, false); } });
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
const loadMe = async () => { me = await api('/me').catch(() => null); if (me?.plan) me.plan = biLang(me.plan); try { me ? localStorage.setItem('li', '1') : localStorage.removeItem('li'); } catch { /* ไม่มีที่เก็บ */ } }; // li = เคยล็อกอิน: theme.js ขอข้อมูลแชตล่วงหน้าเฉพาะคนที่ล็อกอิน

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
  xlsxStyle: [CDN + 'xlsx-js-style@1.2.0/dist/xlsx.bundle.js', 'sha384-OUW9euuUyxyHcAhTqbhI+Iyb8LMssXt/cpz0yXhs9UWG2/R/uaWdakx/4cfww7Vb'], // เขียน Excel แบบมีสีพื้น/ตัวหนา/รูปแบบตัวเลข
  pptx: [CDN + 'pptxgenjs@3.12.0/dist/pptxgen.bundle.js', 'sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ'], // สไลด์ PowerPoint
  html2pdf: [CDN + 'html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js', 'sha384-aBc0BOllaGWrQx51DYt978St/L7B+21jzNGc4N/jnGD0NxGwj8S/ftRgW0AkXIak'], // PDF จริง (วาดจากหน้าเว็บ ภาษาไทยไม่เพี้ยน)
  docx: [CDN + 'docx@8.5.0/build/index.umd.js', 'sha384-4xaIisuLEy2lo2HkB2C4rEf7v8jbTb2kuogX6TkuEt9feTWKBSFSOzsqNNbV+sKh'], // สร้าง Word .docx จริง
};
const FILE_MAX = 700000, FILES_MAX = 20, IMG_MAX = 20, RAW_MAX = 20e6; // ตัวอักษรต่อไฟล์, จำนวนไฟล์, ขนาดไฟล์ดิบ
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonc|xml|ya?ml|toml|ini|env|log|html?|css|scss|sass|less|m?js|cjs|jsx|ts|tsx|vue|svelte|py|ipynb|rb|php|java|kt|kts|swift|go|rs|c|h|cpp|hpp|cc|cs|m|mm|sh|bash|zsh|ps1|bat|sql|r|lua|luau|dart|scala|pl|ex|exs|erl|hs|clj|gradle|conf|cfg|properties|tex|srt|vtt|gd|tscn|tres)$/i;
const loading = {};
LIBS.katexCss = CDN + 'katex@0.16.11/dist/katex.min.css';
LIBS.katex = [CDN + 'katex@0.16.11/dist/katex.min.js', 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg'];
LIBS.mermaid = [CDN + 'mermaid@10.9.3/dist/mermaid.min.js', 'sha384-R63zfMfSwJF4xCR11wXii+QUsbiBIdiDzDbtxia72oGWfkT7WHJfmD/I/eeHPJyT'];
let katexCssLoaded = false;
async function renderRich(root = app) {
  root.querySelectorAll('.msg table:not([data-x])').forEach(tb => { // ตารางในคำตอบ: ดาวน์โหลดเป็นไฟล์ Excel ได้ (CSV + BOM ให้ Excel อ่านภาษาไทยถูก)
    tb.dataset.x = '1'; const b = document.createElement('button'); b.type = 'button'; b.className = 'btn out sm tbl-x'; b.innerHTML = ic('download', 'sm') + ' Excel';
    b.onclick = () => { const csv = [...tb.rows].map(r => [...r.cells].map(c => { const v = c.innerText.trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'table-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
    (tb.closest('.tw') || tb).after(b);
  });
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
  ['1. บริการ', 'Kyber (เดิมคือ AstraCode) ซึ่งพัฒนาโดย Hypatia ให้บริการแชตกับโมเดล AI จากผู้ให้บริการหลายราย (เช่น OpenAI, Anthropic, Google, DeepSeek, Moonshot) ผ่านเว็บไซต์ รายชื่อโมเดลที่ใช้ได้ขึ้นอยู่กับแพลน และอาจเปลี่ยนแปลงได้ตามความพร้อมของผู้ให้บริการ'],
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
const footer = () => `<footer class="foot"><div><b>Kyber</b><span class="muted">AI ทุกตัวในมือถือเครื่องเดียว · สร้างโดย Hypatia</span></div>
  <div><a href="/#download">ดาวน์โหลดแอปคอม (Windows / Linux)</a><a href="/pricing">ราคาต่อ token</a><a href="/developers">API สำหรับนักพัฒนา</a><a href="/blog">บล็อก</a></div>
  <div><a href="/status">สถานะระบบ</a><a href="/support">Contact us</a><a href="/security">ความปลอดภัยของข้อมูล</a><a href="/terms">เงื่อนไขและความเป็นส่วนตัว</a></div>
  <p class="muted">© ${new Date().getFullYear()} Hypatia · Kyber (เดิมคือ AstraCode) สร้างโดย Hypatia</p></footer>`;


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
    a.href = URL.createObjectURL(blob); a.download = `kyber-${Date.now()}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (x) { toast('ดาวน์โหลดรูปไม่ได้: ' + x.message, 'bad'); }
});
document.addEventListener('click', e => { const b = e.target.closest('.dl-code'); if (b) downloadCode(b).catch(x => toast('ดาวน์โหลดไม่ได้: ' + x.message, 'bad')); });

// ---------- ส่วนเลือกแบบแอปมือถือ (แชต + โหมด Code) ----------
// ลิมิตที่หัวจอ: แถบแสงสเปกตรัมขนาดเล็ก (ยิ่งใช้มากยิ่งเลื่อนไปปลายชมพู) + % ของรอบที่ใช้ไปมากกว่า
// หลายแพลน: ใบที่เลือกใช้ (0 = อัตโนมัติ: ใบหลักก่อน เต็มแล้วสลับใบ) · จำไว้ต่อเครื่อง
const subSel = () => { try { return +localStorage.getItem('subSel') || 0; } catch { return 0; } };
const curSub = () => { const s = me?.subs; if (!s || s.length < 2) return null; return s.find(x => x.id === subSel()) || s.find(x => x.primary) || s[0]; };
// limHTML อัปเดตตัวเลข % used มุมล่างซ้ายด้วย (เดิมค้างค่าตอนเปิดหน้า)
const limHTML = u0 => { const cs = curSub(), u = cs || u0, p = Math.max(u.pct4h, u.pctWeek); queueMicrotask(() => { document.querySelectorAll('.su-pct').forEach(e => { e.textContent = Math.round(p); }); document.querySelectorAll('.su-bar i').forEach(e => { e.style.width = Math.min(100, p) + '%'; }); }); return (cs ? `<span class="lname">${esc(cs.name)}</span>` : '') + limHTML0(u, p); };
const limHTML0 = (u, p) => { return `<i class="lmini ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" style="--p:${Math.min(100, p)}"><b></b></i>${Math.round(p)}%${me?.reset_credits > 0 ? '<i class="gdot" title="มีสิทธิ์รีเซ็ตลิมิต"></i>' : ''}`; };
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
const DEFAULT_EFFORTS = { openai: ['', 'low', 'medium', 'high', 'xhigh'], anthropic: ['', 'low', 'medium', 'high', 'max'], deepseek: ['', 'low', 'medium', 'high', 'max'], kimi: ['', 'on'], gemini: ['', 'minimal', 'low', 'medium', 'high'], auto: ['', 'low', 'medium', 'high', 'max'] };
// ระดับการคิดที่ใช้กับโมเดลนี้: ผู้ใช้ที่ยังไม่เคยเลือกเอง (ไม่มี effort ในเครื่อง) เริ่มที่ Medium ถ้าโมเดลรองรับ
// (เดิมเริ่มที่ Instant = Claude/Fable ไม่คิดก่อนตอบ งานยากออกมาด้อยกว่าเรียกโมเดลตรง) · คนที่เคยเลือก Instant เองยังได้ Instant
function effortFor(m, cur) {
  const efs = modelEfforts(m); if (!efs.length) return cur;
  let saved = null; try { saved = localStorage.getItem('effort'); } catch { /* ไม่มีที่เก็บ */ }
  if (saved == null) return efs.includes('medium') ? 'medium' : efs.includes('on') ? 'on' : efs.find(x => x) || efs[0];
  return efs.includes(cur) ? cur : efs[0];
}
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
  const close = () => { if (d.classList.contains('out')) return; d.classList.add('out'); setTimeout(() => d.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180); }; // ปิดแบบเลื่อนลง/จางหาย
  d.onclick = e => { if (e.target === d || e.target.closest('.x')) close(); };
  d.onkeydown = e => { if (e.key === 'Escape') close(); };
  document.body.append(d); const sh = d.querySelector('.sheet'); sh?.setAttribute('tabindex', '-1'); (d.querySelector('.opt.on') || sh)?.focus({ preventScroll: true });
  bind?.(d, close);
}
// ---------- AI ประชุม: เสียง → WAV 16kHz mono ช่วงละ 3 นาที → ส่งทีละช่วง (ถอดทันทีที่เซิร์ฟเวอร์) ----------
const MEET_RATE = 16000, MEET_SEG_S = 180;
function meetWav(f32) { // Float32 [-1,1] → WAV PCM16
  const b = new ArrayBuffer(44 + f32.length * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, MEET_RATE, true); v.setUint32(28, MEET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, f32.length * 2, true);
  for (let i = 0; i < f32.length; i++) { const x = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([b], { type: 'audio/wav' });
}
function meetResample(x, from) { // linear · ใช้เมื่อเบราว์เซอร์เปิด AudioContext 16kHz ไม่ได้
  if (from === MEET_RATE) return x;
  const r = from / MEET_RATE, out = new Float32Array(Math.floor(x.length / r));
  for (let i = 0; i < out.length; i++) { const p = i * r, j = Math.floor(p), f = p - j; out[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f; }
  return out;
}
// คิวส่งช่วงเสียง: ทีละช่วงตามลำดับ · เน็ตหลุดลองใหม่ (สูงสุด 6 ครั้ง ห่างขึ้นเรื่อยๆ)
function meetUploader(id, onState) {
  const q = []; let busy = false, sent = 0, failed = 0;
  const run = async () => {
    if (busy) return; busy = true;
    while (q.length) {
      const job = q[0]; let ok = false;
      for (let a = 0; a < 6 && !ok; a++) {
        try { const r = await fetch(`/api/meetings/${id}/seg/${job.n}?dur=${job.dur.toFixed(2)}`, { method: 'POST', body: job.blob, headers: { 'content-type': 'audio/wav' } }); const d = await r.json().catch(() => ({}));
          if (r.ok || r.status === 409) { ok = true; job.res = d; } else if (r.status < 500 && r.status !== 429) { ok = true; job.res = { error: d.error || 'ส่งไม่สำเร็จ' }; } else throw new Error(d.error || r.status);
        } catch { await new Promise(r => setTimeout(r, Math.min(30e3, 2e3 * 2 ** a))); }
      }
      q.shift(); if (ok) sent++; else failed++; onState?.({ sent, failed, left: q.length, last: job.res });
    }
    busy = false; onState?.({ sent, failed, left: 0, idle: true });
  };
  return { add(n, f32) { q.push({ n, dur: f32.length / MEET_RATE, blob: meetWav(f32) }); onState?.({ sent, failed, left: q.length }); run(); }, get pending() { return q.length || busy; }, drain: () => new Promise(r => { const t = setInterval(() => { if (!q.length && !busy) { clearInterval(t); r(); } }, 300); }) };
}
// อัดสด: เก็บ PCM จากไมค์ ตัดทุก 3 นาที · onLevel = ระดับเสียง 0..1
async function meetRecorder(id, { onLevel, onState } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  let ac; try { ac = new AudioContext({ sampleRate: MEET_RATE }); } catch { ac = new AudioContext(); }
  const src = ac.createMediaStreamSource(stream), proc = ac.createScriptProcessor(4096, 1, 1), up = meetUploader(id, onState);
  let buf = [], len = 0, n = 0, paused = false, wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* ไม่รองรับ */ }
  const flush = () => { if (!len) return; const all = new Float32Array(len); let o = 0; for (const c of buf) { all.set(c, o); o += c.length; } buf = []; len = 0; const x = meetResample(all, ac.sampleRate); if (x.length > MEET_RATE * 0.5) up.add(n++, x); };
  proc.onaudioprocess = e => { if (paused) return; const d = e.inputBuffer.getChannelData(0); buf.push(new Float32Array(d)); len += d.length; let pk = 0; for (let i = 0; i < d.length; i += 16) pk = Math.max(pk, Math.abs(d[i])); onLevel?.(pk); if (len >= ac.sampleRate * MEET_SEG_S) flush(); };
  src.connect(proc); proc.connect(ac.destination);
  return {
    get seconds() { return (n * MEET_SEG_S) + len / ac.sampleRate; }, up,
    pause(v) { paused = v; },
    async stop() { proc.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop()); flush(); await ac.close().catch(() => {}); try { await wake?.release(); } catch { /* ปล่อยแล้ว */ } await up.drain(); },
  };
}
// ไฟล์เสียง/วิดีโอ: ถอดรหัสในเบราว์เซอร์ (ได้ 16kHz ทันทีถ้าเบราว์เซอร์รองรับ) แล้วตัดช่วงส่ง
async function meetDecode(file) {
  const raw = await file.arrayBuffer(); let ac; try { ac = new AudioContext({ sampleRate: MEET_RATE }); } catch { ac = new AudioContext(); }
  try { const ab = await ac.decodeAudioData(raw); const ch = ab.numberOfChannels, x = new Float32Array(ab.length); for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < d.length; i++) x[i] += d[i] / ch; } return meetResample(x, ab.sampleRate); }
  finally { ac.close().catch(() => {}); }
}
async function meetProcessFile(file, onProgress) {
  if (file.size > 400e6) throw new Error('ไฟล์ใหญ่เกิน 400MB · ตัดไฟล์ให้สั้นลงก่อน');
  onProgress?.({ step: 'decode' });
  let x; try { x = await meetDecode(file); } catch { throw new Error('เปิดไฟล์เสียงนี้ไม่ได้ ลองไฟล์ mp3, m4a หรือ wav'); }
  const total = Math.ceil(x.length / (MEET_RATE * MEET_SEG_S)); if (total > 60) throw new Error('ไฟล์ยาวเกิน 3 ชั่วโมง');
  const m = await api('/meetings', { method: 'POST', body: { title: file.name.replace(/\.[^.]+$/, '').slice(0, 100) } });
  const up = meetUploader(m.id, st => onProgress?.({ step: 'upload', done: st.sent + st.failed, total, failed: st.failed }));
  for (let i = 0; i < total; i++) up.add(i, x.subarray(i * MEET_RATE * MEET_SEG_S, (i + 1) * MEET_RATE * MEET_SEG_S));
  x = null; await up.drain(); onProgress?.({ step: 'summary' });
  await api(`/meetings/${m.id}/finish`, { method: 'POST' }).catch(() => {});
  return m.id;
}
// แนบไฟล์เสียงในแชต: ถามก่อนว่าจะถอดเป็นบันทึกประชุมไหม
function meetFileSheet(file) {
  sheet('ถอดเสียงไฟล์นี้', `<div class="sheet-form"><p class="sheet-msg"><b>${esc(file.name)}</b><br><small class="muted">${(file.size / 1e6).toFixed(1)}MB · ได้บทถอดความแยกคนพูด สรุป และงานที่ต้องทำ · หักลิมิตแพลนตามความยาว</small></p>
    <div class="meet-prog" id="mfp" hidden><div class="meter"><div class="fill" style="width:0%"></div></div><small class="muted" aria-live="polite"></small></div>
    <button type="button" class="btn blue" id="mfgo">${ic('mic', 'sm')} ถอดเสียงเป็นบันทึกประชุม</button><small class="muted">อย่าเพิ่งปิดหน้านี้จนกว่าจะส่งไฟล์ครบ</small></div>`, (d, close) => {
    d.querySelector('#mfgo').onclick = async e => {
      e.target.disabled = true; const pg = d.querySelector('#mfp'), bar = pg.querySelector('.fill'), lab = pg.querySelector('small'); pg.hidden = false;
      try {
        const id = await meetProcessFile(file, p => { if (p.step === 'decode') lab.textContent = 'กำลังอ่านไฟล์เสียง…'; else if (p.step === 'upload') { bar.style.width = Math.round(p.done / p.total * 90) + '%'; lab.textContent = `ถอดเสียงแล้ว ${p.done}/${p.total} ช่วง${p.failed ? ` · ไม่สำเร็จ ${p.failed}` : ''}`; } else { bar.style.width = '95%'; lab.textContent = 'กำลังสรุป…'; } });
        close(); go('/meetings?id=' + id);
      } catch (x) { e.target.disabled = false; lab.textContent = x.message; lab.className = 'bad'; }
    };
  });
}
// Kyber Sites: เผยแพร่โปรเจกต์ (หน้า Code) หรือ Artifact เป็นเว็บจริงที่ /s/<ชื่อ>/ · มีเว็บจากต้นทางนี้แล้ว = อัปเดตเวอร์ชันใหม่
async function sitePublish({ src, src_id, title = '' }) {
  let d0; try { d0 = await api('/sites'); } catch (x) { return toast(x.message, 'bad'); }
  const url = s => location.origin + '/s/' + s.slug + '/', ex = d0.sites.find(s => s.src === src && s.src_id === +src_id);
  if (!d0.paid) return sheet('เผยแพร่เป็นเว็บ', `<div class="sheet-form"><p class="sheet-msg">เผยแพร่เว็บให้คนอื่นเข้าได้ ใช้ได้กับแพลนที่ชำระเงิน</p><a class="btn blue" href="/plans">ดูแพลน</a></div>`);
  if (ex) return sheet('อัปเดตเว็บ', `<div class="sheet-form"><p class="sheet-msg">ต้นทางนี้เผยแพร่อยู่ที่</p><div class="row"><input readonly value="${esc(url(ex))}"><button type="button" class="btn out sm" id="spc">คัดลอก</button></div>
    <button type="button" class="btn blue" id="spu">อัปเดตเว็บเป็นเวอร์ชันล่าสุด</button><a class="btn out" href="${esc(url(ex))}" target="_blank" rel="noopener">เปิดเว็บ</a><a class="btn ghost" href="/sites">จัดการเว็บทั้งหมด</a>
    <small class="muted">ตอนนี้ v${ex.ver} · ย้อนกลับเวอร์ชันเก่าได้ที่หน้าเว็บของฉัน</small></div>`, (d, close) => {
    d.querySelector('#spc').onclick = e => copy(url(ex), e.target);
    d.querySelector('#spu').onclick = async e => { e.target.disabled = true; try { const r = await api(`/sites/${ex.id}/publish`, { method: 'POST' }); close(); toast(`อัปเดตเว็บแล้ว (v${r.ver})`, 'ok'); } catch (x) { e.target.disabled = false; toast(x.message, 'bad'); } };
  });
  const full = d0.sites.length >= d0.quota, sug = String(title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  sheet('เผยแพร่เป็นเว็บ', `<div class="sheet-form"><p class="sheet-msg">ได้ลิงก์ที่ใครก็เปิดได้ทันที แก้แล้วกดอัปเดตได้ตลอด</p>
    ${full ? `<p class="bad">แพลนของคุณเผยแพร่ได้ ${d0.quota} เว็บ (ใช้ครบแล้ว) · ลบเว็บเก่าที่ <a href="/sites">เว็บของฉัน</a> ก่อน</p>` : ''}
    <label>ชื่อเว็บ (ภาษาอังกฤษ ตัวเลข และ -)<div class="site-slug"><span>${esc(location.host)}/s/</span><input id="sps" maxlength="40" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(sug.length >= 3 ? sug : '')}" placeholder="myshop"></div></label><small id="spm" class="muted" aria-live="polite"></small>
    <label>ชื่อที่แสดง<input id="spt" maxlength="80" value="${esc(title)}"></label>
    <button type="button" class="btn blue" id="spo" ${full ? 'disabled' : ''}>เผยแพร่</button>
    <small class="muted">เว็บรันแยกจากบัญชีของคุณ (sandbox) · ฟอร์มที่ส่งไป <code>__form</code> เข้ากล่องข้อความที่หน้าเว็บของฉัน · ห้ามมีช่องรหัสผ่าน</small></div>`, (d, close) => {
    const inp = d.querySelector('#sps'), msg = d.querySelector('#spm'), btn = d.querySelector('#spo'); let tm;
    const check = () => { clearTimeout(tm); const v = inp.value.trim().toLowerCase(); if (!v) { msg.textContent = ''; return; } tm = setTimeout(async () => { try { const r = await api('/sites/check?slug=' + encodeURIComponent(v)); msg.textContent = r.ok ? '✓ ใช้ชื่อนี้ได้' : r.error; msg.className = r.ok ? 'ok' : 'bad'; } catch { /* ลองใหม่ตอนกด */ } }, 300); };
    inp.oninput = check; check();
    btn.onclick = async () => { btn.disabled = true; btn.textContent = 'กำลังเผยแพร่…';
      try { const r = await api('/sites', { method: 'POST', body: { slug: inp.value.trim().toLowerCase(), title: d.querySelector('#spt').value, src, src_id } }); close(); copy(url(r.site)); toast('เผยแพร่แล้ว · คัดลอกลิงก์ให้แล้ว', 'ok'); open(url(r.site), '_blank', 'noopener'); }
      catch (x) { btn.disabled = false; btn.textContent = 'เผยแพร่'; msg.textContent = x.message; msg.className = 'bad'; } };
  });
}
// ดู context แบบละเอียด: อะไรกินหน้าต่าง context ของโมเดลอยู่เท่าไร + ย่อแชต + เปิด/ปิดย่ออัตโนมัติ
const CTX_COLORS = { system: '#7aa2f7', instr: '#bb9af7', mem: '#2ac3de', skill: '#9ece6a', rules: '#e0af68', summary: '#73daca', files: '#f7768e', user: '#7dcfff', assistant: '#a9b1d6' };
async function ctxSheet({ chatId, modelId, projectId, skills = [], onCompact, onPickModel }) {
  const q = new URLSearchParams(); if (chatId) q.set('chat_id', chatId); if (modelId) q.set('model_id', modelId); if (projectId) q.set('project_id', projectId); if (skills.length) q.set('skills', skills.join(','));
  const [r, jobs] = await Promise.all([api('/context?' + q).catch(x => { toast(x.message, 'bad'); return null; }), projectId ? api('/agent?project=' + projectId).catch(() => []) : []]); if (!r) return;
  // Agent บนเซิร์ฟเวอร์ทำงานนอกแชตนี้: แสดง context ของงานล่าสุด (24 ชม.) แยกรายสมาชิก · ctx_peak = input ของรอบที่ใหญ่สุด
  const ag = jobs.find(j => j.role !== 'research' && Date.now() - j.created_at < 864e5), mctx = id => ((me.models.find(x => x.id === id)?.ctx_k || 128) * 1000);
  const agRows = ag ? [{ ...ag, title: ag.role === 'lead' ? 'หัวหน้าทีม' : 'Agent' }, ...(ag.team || []).map(k => ({ ...k, title: (k.role === 'review' ? 'ผู้ตรวจ' : 'ลูกทีม') + ' · ' + (k.title || '') }))] : [];
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)), pm = (a, b) => b ? (a / b * 100).toFixed(a / b < 0.01 ? 2 : 1) + '%' : '-';
  // แถบบน: ใช้ไป / เผื่อคำตอบ / ว่าง เทียบทั้งหน้าต่าง context · แถบส่วนประกอบ: สัดส่วนจริงของสิ่งที่ใช้อยู่ (ไม่บังคับความกว้างขั้นต่ำจนส่วนเล็กดูเท่าส่วนใหญ่)
  const seg = (n, total, c, l) => n > 0 ? `<i style="width:${Math.max(n / total * 100, 0.6)}%;background:${c}" title="${esc(l)} ${k(n)}"></i>` : '';
  const meter = seg(r.used, r.max, 'var(--blue, #3b82f6)', 'ใช้ไป') + seg(r.reserve, r.max, 'rgba(var(--ov, 255,255,255), .18)', 'เผื่อคำตอบ');
  const est = r.parts.reduce((a, p) => a + p.tok, 0) || 1, parts = r.parts.map(p => `<i style="flex:${p.tok};background:${CTX_COLORS[p.k] || '#888'}" title="${esc(p.label)} ${k(p.tok)}"></i>`).join('');
  const t = r.tokens || {}, inAll = (t.fresh || 0) + (t.cw || 0) + (t.cr || 0), kp = (l, v, sub = '') => `<div class="cx-k"><small class="muted">${l}</small><b>${v}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
  sheet('Context ของแชตนี้', `<div class="sheet-form ctxs">
    <div class="cx-head"><b>${k(r.used)}</b><span class="muted"> / ${k(r.max)} token · ${r.pct}%</span></div>
    <small class="muted" style="margin-top:-6px">${r.model ? esc(r.model) + ' · ' : ''}${r.real ? 'ตัวเลขจริงจากผู้ให้บริการ (คำตอบล่าสุด)' : 'ประมาณจากจำนวนตัวอักษร'} · ส่งให้โมเดล ${r.msgs} ข้อความ${r.compacted ? ' · เคยย่อแชตแล้ว' : ''}</small>
    <div class="ctxbar meter">${meter}</div>
    <div class="cx-leg"><span><i style="background:var(--blue, #3b82f6)"></i>ใช้ไป ${k(r.used)}</span><span><i style="background:rgba(var(--ov, 255,255,255), .18)"></i>เผื่อคำตอบ ${k(r.reserve)}</span><span><i></i>ว่าง ${k(r.free)}</span></div>
    ${r.byModel?.length ? `<b style="margin-top:8px">Token ในแชตนี้ <small class="muted">ตัวเลขจริงจากผู้ให้บริการ · ${t.replies} คำตอบ</small></b>
    <div class="cx-kpis">${kp('Input', k(t.fresh), 'ส่งเข้าใหม่')}${kp('Cache write', k(t.cw), 'เขียนลง cache')}${kp('Cache read', k(t.cr), 'อ่านจาก cache')}${kp('Output', k(t.out), 'AI ตอบ')}${kp('ติด cache', t.hit == null ? '-' : t.hit + '%', inAll ? `${k(t.cr)} จาก ${k(inAll)} ขาเข้า` : '')}</div>
    ${t.known < t.replies ? `<small class="muted">คำตอบเก่า ${t.replies - t.known} ข้อความไม่มีข้อมูล cache (นับเป็น Input ทั้งหมด)</small>` : ''}
    ${r.byModel.length > 1 ? `<div class="tw"><table class="tbl cx-t"><tr><th>โมเดล</th><th>ตอบ</th><th>Input</th><th>C.write</th><th>C.read</th><th>Output</th><th>ติด cache</th></tr>${r.byModel.map(m => `<tr><td>${esc(m.name)}</td><td>${m.replies}</td><td>${k(m.fresh)}</td><td>${k(m.cw)}</td><td>${k(m.cr)}</td><td>${k(m.tout)}</td><td>${pm(m.cr, m.fresh + m.cw + m.cr)}</td></tr>`).join('')}</table></div>` : ''}` : ''}
    <b style="margin-top:8px">อะไรอยู่ใน context <small class="muted">ประมาณ</small></b>
    <div class="ctxbar">${parts}</div>
    <div class="tw"><table class="tbl">${r.parts.map(p => `<tr><td><span class="dot" style="background:${CTX_COLORS[p.k] || '#888'}"></span>${esc(p.label)}${p.detail ? `<br><small class="muted">${esc(p.detail)}</small>` : ''}</td><td>${k(p.tok)}</td><td class="muted">${pm(p.tok, est)}</td></tr>`).join('')}</table></div>
    <label class="sw-row"><span class="sw"><input type="checkbox" id="cxauto" ${me.auto_compact !== false ? 'checked' : ''}><span></span></span> ย่อแชตอัตโนมัติเมื่อ context ใกล้เต็ม</label>
    ${r.models?.length > 1 ? `<b style="margin-top:6px">ถ้าคุยต่อด้วยโมเดลอื่น</b><div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>ขนาด context</th><th>เต็ม</th></tr>${r.models.map(m => { const p2 = Math.round(r.used / m.max * 1000) / 10; return `<tr ${onPickModel ? `data-pickm="${m.id}" style="cursor:pointer"` : ''} class="${m.id === r.model_id ? 'on' : ''}"><td>${esc(m.name)}${m.id === r.model_id ? ' <small class="muted">(ใช้อยู่)</small>' : ''}</td><td>${k(m.max)}</td><td class="${p2 >= 90 ? 'bad' : p2 >= 70 ? 'warn' : ''}">${p2}%</td></tr>`; }).join('')}</table></div>${onPickModel ? '<small class="muted">แตะแถวเพื่อสลับไปใช้โมเดลนั้น</small>' : ''}` : ''}
    ${agRows.length ? `<b style="margin-top:6px">Agent บนเซิร์ฟเวอร์ (งานล่าสุด · ${esc(ag.status)})</b><p class="muted" style="margin:0;font-size:12.5px">Agent ทำงานนอกแชตนี้ แต่ละตัวมี context แยกกัน · ตัวเลขจริงจากผู้ให้บริการ</p><div class="tw"><table class="tbl"><tr><th>สมาชิก</th><th>context สูงสุด</th><th>token เข้า/ออก</th></tr>${agRows.map(x => `<tr><td>${esc(x.title.slice(0, 40))}<br><small class="muted">${esc(me.models.find(m => m.id === x.model_id)?.name || '')}${x.doing ? ' · ' + esc(x.doing) : ''}</small></td><td>${x.ctx_peak ? `${k(x.ctx_peak)} / ${k(mctx(x.model_id))}<br><small class="muted">${(x.ctx_peak / mctx(x.model_id) * 100).toFixed(1)}%</small>` : '<span class="muted">ยังไม่เริ่ม</span>'}</td><td>${x.tin ? k(x.tin) + ' / ' + k(x.tout || 0) : '-'}</td></tr>`).join('')}</table></div>` : ''}
    ${chatId ? '<button type="button" class="btn blue sm" id="cxnow">ย่อแชตตอนนี้</button>' : ''}
    <p class="muted" style="margin:0;font-size:12.5px">ส่วนประกอบเป็นการประมาณจากจำนวนตัวอักษร (ภาษาไทยนับหนักกว่าอังกฤษ) · ติด cache = token ขาเข้าที่อ่านจาก cache ÷ ขาเข้าทั้งหมด ยิ่งสูงยิ่งถูกและเร็ว · ย่อแชต = สรุปข้อความเก่าเหลือ 2 ข้อความล่าสุด</p></div>`, (d, close) => {
    d.querySelectorAll('[data-pickm]').forEach(tr => tr.onclick = () => { close(); onPickModel(+tr.dataset.pickm); });
    d.querySelector('#cxauto').onchange = async e => { try { await api('/me', { method: 'PUT', body: { auto_compact: e.target.checked } }); me.auto_compact = e.target.checked; toast(e.target.checked ? 'เปิดย่อแชตอัตโนมัติ' : 'ปิดย่อแชตอัตโนมัติ', 'ok'); } catch (x) { e.target.checked = !e.target.checked; toast(x.message, 'bad'); } };
    const now = d.querySelector('#cxnow'); if (now) now.onclick = async () => { now.disabled = true; now.textContent = 'กำลังย่อ...'; try { const c = await api(`/chats/${chatId}/compact`, { method: 'POST' }); toast(c.ok ? 'ย่อแชตแล้ว' : 'แชตยังสั้นเกินกว่าจะย่อ', c.ok ? 'ok' : ''); close(); if (c.ok) onCompact?.(); } catch (x) { toast(x.message, 'bad'); now.disabled = false; now.textContent = 'ย่อแชตตอนนี้'; } };
  });
}
function toast(msg, kind = '', o = {}) { // o.onClick = กดแล้วทำอะไร (ค้างนานขึ้น) · o.ms = เวลาแสดง
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  if (o.onClick) { t.style.cursor = 'pointer'; t.setAttribute('role', 'button'); t.onclick = () => { t.remove(); o.onClick(); }; }
  document.body.append(t); setTimeout(() => t.remove(), o.ms || (o.onClick ? 9000 : 2800)); return t;
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
const pickTo = sel => (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { if (me?.models.find(m => String(m.id) === b.dataset.v)?.locked) { close(); toast('โมเดลนี้ต้องเติมเครดิต (ขั้นต่ำ ฿1) แล้วจ่ายตามที่ใช้จริง'); return go('/plans?topup=1'); } const s = $(sel); s.value = b.dataset.v; s.dispatchEvent(new Event('change')); close(); });
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
const vOpt = (v, logo, title, tags, mult, on, vk = '', vc = '') => `<button class="vopt ${on ? 'on' : ''} ${me?.models.find(m => String(m.id) === String(v))?.locked ? 'lock' : ''}" data-v="${esc(v)}" data-vk="${esc(vk)}" data-vc="${esc(vc)}">${logo}<span class="vtxt"><b>${title}</b><small>${tags}</small></span>${mult}${on ? `<i class="vck">${ic('check')}</i>` : ''}</button>`;
// โมเดลใหม่ (new_until ยังไม่หมด) ขึ้นบนสุดจนผู้ใช้เปิดหน้าเลือกโมเดลเห็นครั้งหนึ่ง แล้วกลับไปตามลำดับปกติ (ป้าย "ใหม่" ยังอยู่จนหมดเวลา)
const seenNew = () => { try { return JSON.parse(localStorage.getItem('newSeen') || '[]'); } catch { return []; } };
const pickOrder = ms => { const s = seenNew(), fresh = m => m.new_until > Date.now() && !s.includes(m.id); return [...ms.filter(fresh), ...ms.filter(m => !fresh(m))]; };
const newSeen = ms => { try { localStorage.setItem('newSeen', JSON.stringify([...new Set([...seenNew(), ...ms.filter(m => m.new_until > Date.now()).map(m => m.id)])].slice(-50))); } catch { /* ไม่มีที่เก็บ */ } };
// หมวดตามงาน (ช่อง cats ในหลังบ้าน) · โมเดลสร้างรูปเข้าหมวดรูปเอง
const MODEL_CATS = [['general', 'ทั่วไป'], ['code', 'เขียนโค้ด'], ['math', 'คณิต/ตรรกะ'], ['write', 'งานเขียน'], ['docs', 'อ่านเอกสาร'], ['image', 'สร้างรูป'], ['fast', 'เร็ว/ประหยัด'], ['special', 'เฉพาะทาง'], ['uncen', 'Uncensored']];
const catsOf = m => [...new Set([...String(m.cats || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean), ...(m.provider === 'image' ? ['image'] : [])])];
let _mst = null; // คุณภาพจริงต่อโมเดล (เสถียร % · ลิมิตกี่เท่า) ดึงครั้งเดียวต่อหน้า
const mstTag = s => s && (s.ok != null || s.ag != null) ? `<span class="vq" title="7 วันล่าสุด: คำขอที่สำเร็จ · กินลิมิตต่อข้อความเทียบตัวที่ประหยัดสุด${s.pass != null ? ' · ผ่านแบบทดสอบโค้ด' : ''}">${s.ok != null ? `${s.ok >= 98 ? '✓' : s.ok >= 90 ? '•' : '⚠'} เสถียร ${s.ok}%` : ''}${s.x ? ` · ลิมิต ${s.x}x` : ''}${s.pass != null ? ` · ผ่านเทสต์ ${s.pass}%` : ''}${s.ag != null ? ` · Agent จบงาน ${s.ag}% (${s.agn} งาน)` : ''}</span>` : '';
// ป้ายเตือนใต้กล่องพิมพ์ตามโมเดลที่เลือก (หน้าแชต + หน้าโค้ด)
// ตระกูล Uncen: กำลังปรับคุณภาพ · Harness (Agent/Code) + โมเดลที่ไม่เหมาะกับงานหลายขั้นตอน: เตือนว่าอาจพลาด
const isUncen = m => /uncen/i.test(m?.name || '');
const harnessWeak = (m, flagged = []) => /uncen|flash|lite|nano|mini\b/i.test(m?.name || '') || flagged.some(x => x.model === m?.name?.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''));
function modelWarnHTML(m, { harness = false, flagged = [] } = {}) {
  if (!m) return '';
  const w = [];
  if (isUncen(m)) w.push(['upd', 'กำลังอยู่ระหว่างการอัปเดตคุณภาพ · Model จะตอบช้าลงและสะดุดเป็นบางครั้ง']);
  if (harness && harnessWeak(m, flagged)) w.push(['weak', 'Model นี้ไม่เก่งงานด้านนี้ (Agent / เขียนโค้ดหลายขั้นตอน) อาจมีข้อผิดพลาดได้ · แนะนำ Claude Sonnet / Opus หรือ ChatGPT 6.2']);
  return w.map(([k, t]) => `<div class="mwarn mwarn-${k}" role="status">${ic('alert', 'sm')}<span>${t}</span></div>`).join('');
}
// ---------- หน้าเลือกโมเดล (UI 2.5 Noir): ค้นหา · มุมมอง แนะนำ/ทั้งหมด/ค่าย · แถวโมเดลพร้อมสถานะจริงและตัวคูณลิมิต ----------
const PICK_GROUPS = [['code', 'สำหรับงานโค้ดและ Agent'], ['general', 'ใช้ประจำวัน'], ['write', 'งานเขียน'], ['docs', 'อ่านเอกสารและรูป'], ['math', 'คณิตและตรรกะ'], ['image', 'สร้างรูป']];
function modelSheet(which) {
  const cur = $(which).value, auto = $(which).querySelector('option[value="auto"]');
  const free = m => m.mcredit > 0 ? `เครดิต ฿${m.mcredit}` : me.plan?.free_models?.includes(m.id) ? 'ฟรีไม่จำกัด' : me.claude_credit && /^claude\b.*\beco$/i.test(m.name.trim()) ? `แถม ≈$${me.claude_credit.usd}` : '';
  const right = m => { const f = free(m); return f ? `<span class="np-free">${esc(f)}</span>` : site.picker_mult === '0' ? '' : `<span class="np-x">×${m.multiplier}</span>`; };
  const tags = m => (m.new_until > Date.now() ? '<span class="np-new">ใหม่</span>' : '') + (isUncen(m) ? '<span class="np-upd">กำลังอัปเดต</span>' : '') + (m.locked ? `<span class="np-lock">${ic('lock', 'sm')}</span>` : '');
  const line = m => esc(m.note || [m.wallet && 'จ่ายจาก Wallet', m.vision && 'อ่านรูป', m.effort !== 'none' && 'Thinking'].filter(Boolean).join(' · ') || 'ทั่วไป');
  const row = m => `<button type="button" class="np-row${String(m.id) === cur ? ' on' : ''}${m.locked ? ' lock' : ''}" data-v="${m.id}" data-q="${esc((m.name + ' ' + (m.note || '')).toLowerCase())}">${vendorLogo(m.name)}<span class="np-t"><b>${esc(m.name)}${tags(m)}</b><small><i class="np-dot" data-dot="${m.id}"></i>${line(m)}</small></span>${right(m)}${String(m.id) === cur ? `<i class="np-ck">${ic('check')}</i>` : ''}</button>`;
  const ms = pickOrder(me.models), groupOf = m => (PICK_GROUPS.find(([k]) => catsOf(m).includes(k)) || ['other'])[0];
  const views = {
    rec: () => [...PICK_GROUPS, ['other', 'อื่น ๆ']].map(([k, l]) => { const g = ms.filter(m => groupOf(m) === k); return g.length ? `<div class="np-sec">${l}</div>${g.map(row).join('')}` : ''; }).join(''),
    all: () => ms.map(row).join(''),
    vendor: () => [...new Map(ms.map(m => [vendorOf(m.name), 1])).keys()].map(v => `<div class="np-sec">${esc(v)}</div>${ms.filter(m => vendorOf(m.name) === v).map(row).join('')}`).join(''),
  };
  let view = 'rec'; try { view = localStorage.getItem('pickView') || 'rec'; } catch { /* */ } if (!views[view]) view = 'rec';
  sheet(which.endsWith('2') ? 'โมเดลที่ 2 (เทียบ)' : 'เลือกโมเดล', `<div class="np">
      <label class="np-search">${ic('search', 'sm')}<input type="search" placeholder="ค้นหาโมเดล หรือพิมพ์งานที่จะทำ…" aria-label="ค้นหาโมเดล" autocomplete="off"></label>
      <div class="np-seg" role="tablist" aria-label="มุมมอง">${[['rec', 'แนะนำ'], ['all', 'ทั้งหมด'], ['vendor', 'ค่าย']].map(([k, l]) => `<button type="button" role="tab" data-pv="${k}" aria-selected="${k === view}" class="${k === view ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${auto ? `<button type="button" class="np-auto${cur === 'auto' ? ' on' : ''}" data-v="auto"><span class="vlogo auto">${ic('sparkles')}</span><span class="np-t"><b>อัตโนมัติ</b><small>ระบบเลือกให้: ถามทั่วไปใช้โมเดลประหยัด โจทย์ยากหรือโค้ดใช้โมเดลเก่ง</small></span>${cur === 'auto' ? `<i class="np-ck">${ic('check')}</i>` : ''}</button>` : ''}
      <div class="np-list" id="npList">${views[view]()}</div>
      <p class="np-empty" hidden>ไม่พบโมเดลที่ตรงกับคำค้น</p>
      <a class="opt-more" href="/pricing">ดูราคาและรายละเอียดโมเดล →</a></div>`, (d, close) => {
    // สถานะจริง 7 วัน: สำเร็จ ≥95% เขียว · ≥80% เหลือง · ต่ำกว่านั้นแดง (ยังไม่มีข้อมูล = เทา)
    const paint = () => d.querySelectorAll('[data-dot]').forEach(e => { const s = _mst?.[e.dataset.dot]; if (!s?.ok) return; e.className = 'np-dot ' + (s.ok >= 95 ? 'g' : s.ok >= 80 ? 'y' : 'r'); e.title = `สำเร็จ ${s.ok}% ใน 7 วัน`; });
    const bind = () => { pickTo(which)(d, close); paint(); };
    const q = d.querySelector('.np-search input'), list = d.querySelector('#npList'), empty = d.querySelector('.np-empty');
    const filt = () => {
      const t = q.value.trim().toLowerCase(); let n = 0;
      list.querySelectorAll('.np-row').forEach(r => { const hit = !t || r.dataset.q.includes(t); r.hidden = !hit; if (hit) n++; });
      list.querySelectorAll('.np-sec').forEach(h => { let x = h.nextElementSibling, any = false; while (x && !x.classList.contains('np-sec')) { if (!x.hidden) any = true; x = x.nextElementSibling; } h.hidden = !any; });
      empty.hidden = n > 0;
    };
    d.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => {
      view = b.dataset.pv; try { localStorage.setItem('pickView', view); } catch { /* */ }
      d.querySelectorAll('[data-pv]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
      list.innerHTML = views[view](); bind(); filt();
    });
    q.oninput = filt;
    bind(); newSeen(me.models);
    if (!_mst) api('/model-stats').then(r => { _mst = r || {}; paint(); }).catch(() => {});
    d.querySelector('.sheet')?.classList.add('np-sheet');
  });
}
// ระดับความคิด (UI 2.5): แต่ละระดับมีแถบสัญญาณบอกความลึก · จุดบอกความเร็วและลิมิตที่ใช้ · แตะแล้วเลือกเลย
const EFFORT_RANK = { '': 0, minimal: 1, on: 2, low: 2, medium: 3, high: 4, xhigh: 5, max: 5 };
const effBars = (v, n = 5) => `<span class="ef-bars" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.max(1, EFFORT_RANK[v] ?? 0) && (EFFORT_RANK[v] ?? 0) > 0 ? 'on' : ''}" style="height:${5 + i * 3}px"></i>`).join('')}</span>`;
const effDots = (k, on) => `<span class="ef-dots" aria-label="${k} ${on} จาก 5">${Array.from({ length: 5 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span>`;
function effortSheet(sel, m) {
  const cur = $(sel).value, list = modelEfforts(m), rec = list.includes('medium') ? 'medium' : list.includes('on') ? 'on' : '';
  const row = v => { const [n, d] = EFFORT_INFO[v], r = EFFORT_RANK[v] ?? 0;
    return `<button type="button" class="ef-row${v === cur ? ' on' : ''}" data-v="${esc(v)}">${effBars(v)}<span class="ef-t"><b>${n}${v === rec ? '<span class="ef-rec">แนะนำ</span>' : ''}</b><small>${d}</small><span class="ef-m">${effDots('ความเร็ว', Math.max(1, 5 - r))}<em>เร็ว</em>${effDots('ลิมิต', Math.max(1, r))}<em>ใช้ลิมิต</em></span></span>${v === cur ? `<i class="np-ck">${ic('check')}</i>` : ''}</button>`; };
  sheet('ระดับความคิด', `<div class="ef">${list.map(row).join('')}<p class="ef-note">ยิ่งคิดมาก คำตอบยิ่งดีกับโจทย์ยาก แต่ช้าขึ้นและใช้ลิมิตมากขึ้น${m?.name ? ` · โมเดล: ${esc(m.name)}` : ''}</p></div>`, (d, close) => { pickTo(sel)(d, close); d.querySelector('.sheet')?.classList.add('np-sheet'); });
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
          <select name="model_id" aria-label="โมเดลประจำ"><option value="">โมเดลประจำ: ใช้ตัวที่เลือกอยู่</option>${(me?.models || []).filter(m => !['image', 'embedding'].includes(m.provider)).map(m => `<option value="${m.id}">โมเดลประจำ: ${esc(m.name)}</option>`).join('')}</select>
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
        else { sel.add(id); skillModel(list.find(x => x.id === id)); }
        onChange([...sel]); draw(false);
      });
    });
  };
  draw(true);
}


// Skill ที่ผูกโมเดลประจำ: เปิดแล้วสลับไปโมเดลนั้นให้ (ถ้าแพลน/Wallet ใช้ได้)
function skillModel(s) {
  const el = document.querySelector('#model') || document.querySelector('#cmodel'); if (!s?.model_id || !el || +el.value === s.model_id) return;
  if (![...el.options].some(o => +o.value === s.model_id)) return toast('โมเดลประจำของ Skill นี้ไม่อยู่ในแพลนของคุณ ใช้โมเดลที่เลือกอยู่แทน');
  el.value = String(s.model_id); el.dispatchEvent(new Event('change')); toast(`สลับเป็น ${me.models.find(m => m.id === s.model_id)?.name || 'โมเดลประจำ'} ตาม Skill`, 'ok');
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
    const gs = await api('/google').catch(() => ({}));
    sheet('Remote MCP (เลือกได้สูงสุด 3)', `<div class="sheet-form">
      ${gs.enabled ? `<div class="opt" style="cursor:default"><span class="opt-t">${ic('globe', 'sm')} Google: Gmail · Drive · Sheets · ปฏิทิน</span><span class="opt-d">${gs.connected ? `เชื่อมแล้ว ${esc(gs.email || '')} · แตะรายการ Google ด้านล่างเพื่อเปิดใช้ในแชต` : 'กดเชื่อมครั้งเดียว ให้ AI อ่าน/ส่งอีเมล ค้นไฟล์ แก้ตาราง ลงนัด แทนคุณ'}</span>
        <span class="row" style="margin-top:6px">${gs.connected ? '<button type="button" class="btn out sm" id="gdis">ยกเลิกการเชื่อม</button>' : '<a class="btn blue sm" href="/api/google/connect">เชื่อม Google</a>'}</span></div>` : ''}
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
      d.querySelector('#gdis')?.addEventListener('click', async () => { if (!await confirmSheet('ยกเลิกการเชื่อม Google? AI จะเข้า Gmail/Drive/ปฏิทินไม่ได้อีก', { title: 'Google', ok: 'ยกเลิกการเชื่อม' })) return; await api('/google', { method: 'DELETE' }).catch(() => {}); toast('ยกเลิกการเชื่อม Google แล้ว'); draw(true); });
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
  // การ์ดต่อรอบ: % ตัวใหญ่ + แถบสีตามระดับ (ปกติ / ใกล้เต็ม / เต็ม) + เวลาที่เหลือก่อนรีเซ็ต
  const left = t => { if (!t) return 'เริ่มนับเมื่อส่งข้อความแรก'; const ms = t - Date.now(); if (ms <= 0) return 'รีเซ็ตแล้ว'; const h = ms / 3600e3; return `รีเซ็ตใน ${h < 1 ? Math.max(1, Math.round(ms / 60e3)) + ' นาที' : h < 48 ? Math.round(h) + ' ชม.' : Math.round(h / 24) + ' วัน'} · ${when(t)}`; };
  const card = (label, p, t) => { const v = Math.min(100, Math.max(0, +p || 0)), lv = v >= 100 ? 'full' : v >= 80 ? 'hi' : '', rest = Math.max(0, 100 - (v >= 10 ? Math.round(v) : v)), f = x => x < 10 && x > 0 ? x.toFixed(1) : Math.round(x);
    return `<div class="ls-card lq ${lv}"><div class="lq-top"><span class="lq-l">${label}</span><span class="lq-r">${lv === 'full' ? 'เต็มแล้ว' : `เหลือ <b>${f(rest)}%</b>`}</span></div><div class="lq-num"><b>${f(v)}</b><span>% ใช้ไปแล้ว</span></div><div class="ls-bar lq-bar" role="progressbar" aria-label="${label}" aria-valuenow="${Math.round(v)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${v}%"></i></div><div class="lq-t">${ic('clock', 'sm')}<span>${left(t)}</span></div></div>`; };
  const multi = me.subs?.length > 1, sel = subSel(), cs = curSub();
  const subCard = x => `<div class="ls-sub${x.id === cs?.id ? ' on' : ''}"><div class="ls-head"><span class="ls-plan">${esc(x.name)}${x.primary ? ' <span class="pill">ใบหลัก</span>' : ''}</span><span class="muted">หมดอายุ ${when(x.expires)}</span></div>
    ${x.use4h === false ? '' : card('รอบ 4 ชั่วโมง', x.pct4h, x.reset4h)}${card('สัปดาห์นี้', x.pctWeek, x.resetWeek)}
    <div class="ls-sub-acts"><button type="button" class="btn sm ${sel === x.id ? 'blue' : 'out'}" data-subuse="${x.id}">${sel === x.id ? ic('check', 'sm') + ' ใช้ใบนี้อยู่' : 'ใช้ใบนี้'}</button>${x.primary ? '' : `<button type="button" class="btn out sm" data-subprim="${x.id}">ตั้งเป็นใบหลัก</button>`}</div></div>`;
  sheet('ลิมิตการใช้งาน', `<div class="ls">
    ${multi ? `<div class="ls-head"><span class="ls-plan">แพลนของคุณ ${me.subs.length} ใบ</span><span class="muted">Wallet ฿${baht(me.balance)}${me.wallet_overflow ? ' · ใช้ต่อเมื่อลิมิตเต็ม' : ''}</span></div>
    <button type="button" class="btn sm ${sel ? 'out' : 'blue'} ls-auto" data-subuse="0">${sel ? '' : ic('check', 'sm') + ' '}อัตโนมัติ: ใบหลักก่อน เต็มแล้วสลับใบถัดไป</button>
    ${me.subs.map(subCard).join('')}` : `<div class="ls-head"><span class="ls-plan">${esc(me.plan.name)}</span><span class="muted">Wallet ฿${baht(me.balance)}${me.wallet_overflow ? ' · ใช้ต่อเมื่อลิมิตเต็ม' : ''}</span></div>
    ${u.use4h === false ? '' : card('รอบ 4 ชั่วโมง', u.pct4h, u.reset4h)}${card('สัปดาห์นี้', u.pctWeek, u.resetWeek)}`}
    <p class="muted ls-note">ลิมิตคิดตามต้นทุนจริงของแต่ละข้อความ โมเดลที่เก่งกว่าใช้ลิมิตเร็วกว่า</p>${reset}
    <div id="rsh"></div>
    <div class="ls-acts"><a class="btn out" href="/plans?topup=1">${ic('wallet', 'sm')} เติมเงิน</a><a class="btn ${list.length ? 'out' : 'blue'}" href="/plans">${ic('layers', 'sm')} อัปเกรดแพลน</a></div></div>`, (d, close) => {
      api('/limits/history').then(h => { if (h.length) d.querySelector('#rsh').innerHTML = `<details class="rst-h2"><summary>ประวัติรีเซ็ตลิมิต</summary>${h.map(r => `<div class="rst-row"><span>${r.kind === 'grant' ? 'ได้รับสิทธิ์ ' + esc(r.scope || '') + ' ×' + (r.n || 1) : r.kind === 'use' ? 'ใช้สิทธิ์ ' + esc(r.scope || '') : 'แอดมินรีเซ็ตให้'}</span><small>${when(r.created_at)}</small></div>`).join('')}</details>`; }).catch(() => {});
      d.querySelectorAll('[data-subuse]').forEach(b => b.onclick = () => { try { localStorage.setItem('subSel', b.dataset.subuse); } catch { /* ไม่มีที่เก็บ */ } const lim = $('#lim') || $('#clim'); if (lim) lim.innerHTML = limHTML(me.usage); close(); limitSheet(); });
      d.querySelectorAll('[data-subprim]').forEach(b => b.onclick = async () => { try { await api(`/subs/${b.dataset.subprim}/primary`, { method: 'POST' }); await loadMe(); toast('ตั้งเป็นใบหลักแล้ว', 'ok'); close(); limitSheet(); } catch (e) { toast(e.message, 'bad'); } });
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
    document.title = d.title + ' · Kyber';
    page(nav() + `<div class="wrap" style="max-width:780px;padding-bottom:64px">
      <section class="hero" style="padding:40px 0 20px"><div class="name">Kyber</div><h1>${esc(d.title)}</h1><p>${when(d.created_at)} · แชตที่แชร์</p></section>
      <div class="msgs" style="padding:0">${d.messages.map(m => m.role === 'user'
        ? `<div class="msg user"><div class="b">${esc(m.content.replace(ATT_IMG_RE, '\n[รูปที่แนบ]').replace(FILE_RE, (_, n) => `[ไฟล์: ${n}]`).trim())}</div></div>`
        : `<div class="msg ai"><div class="b">${md(m.content)}</div>${m.model ? `<div class="acts"><span class="muted">${esc(m.model)}</span></div>` : ''}</div>`).join('')}</div>
      <div style="text-align:center;margin-top:32px"><a class="btn blue" href="${me ? '/chat' : '/login'}">${me ? 'Open Kyber Chat' : 'Try Kyber free'}</a></div>
      ${footer()}</div>`);
    app.querySelectorAll('.cp-code').forEach(b => b.onclick = () => copy(b.closest('.code').querySelector('code').textContent, b)); renderRich();
  },
};
const OPEN_IN_MAINTENANCE = ['home', 'login', 'terms', 'status', 'blog', 'pricing'];
const promoOn = () => site.promo?.until > Date.now();
const promoEnd = () => new Date(site.promo.until).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// แถบประกาศหลายอัน (โปรลิมิต · โปรเติมเงิน · ทดลองใกล้หมด) เรียงในกล่องเดียว ไม่ทับกัน
function annAdd(b) { let d = app.querySelector(':scope > .ann-dock'); if (!d) { d = document.createElement('div'); d.className = 'ann-dock'; app.prepend(d); } d.append(b); }
function promoStrip() { // โปรเติม Wallet แถม %: แถบเล็กบนสุด ปิดได้ (จำไว้)
  const tp = site.topup_promo; if (!tp || !me || localStorage.getItem('tpromo') === String(tp.end)) return;
  if (tp.end <= Date.now()) return;
  // UI 2.5: แถบนับถอยหลังถึงวันหมดโปรจริง (วัน ชม. นาที วินาที) · แตะข้อความไปหน้าเติมเงิน
  const b = document.createElement('div'); b.className = 'ann promo cd25';
  const two = n => String(n).padStart(2, '0'), tick = () => { const ms = Math.max(0, tp.end - Date.now()), s0 = Math.floor(ms / 1000); return `${two(Math.floor(s0 / 86400))}<small>D</small> ${two(Math.floor(s0 / 3600) % 24)}<small>H</small> ${two(Math.floor(s0 / 60) % 60)}<small>M</small> ${two(s0 % 60)}<small>S</small>`; };
  b.innerHTML = `<a class="cd-l" href="/plans?topup=1"><span class="cd-x">${esc(tp.label)} · </span>แถม ${tp.pct}% · เติม Wallet ฿${tp.min}+<span class="cd-x"> · จบใน</span></a><span class="cd-t" role="timer" aria-label="เวลาที่เหลือของโปร">${tick()}</span><button aria-label="ปิด">${ic('x')}</button>`;
  const t = b.querySelector('.cd-t'), iv = setInterval(() => { if (!b.isConnected) return clearInterval(iv); t.innerHTML = tick(); if (tp.end <= Date.now()) { clearInterval(iv); b.remove(); } }, 1000);
  b.querySelector('button').onclick = () => { try { localStorage.setItem('tpromo', String(tp.end)); } catch { /* ไม่มีที่เก็บ */ } clearInterval(iv); b.remove(); };
  annAdd(b);
}
function trialStrip() { // คนทดลองใกล้หมด/หมดแล้ว: โค้ดอัปเกรด (จาก /api/me)
  const o = me?.trial_offer; if (!o || pageName() === 'plans') return;
  const left = Math.ceil((o.trial_end - Date.now()) / 864e5), b = document.createElement('div'); b.className = 'ann promo';
  b.innerHTML = `<span>${ic('sparkles', 'sm')} ${left > 0 ? `แพลนทดลองเหลือ ${left} วัน` : 'แพลนทดลองหมดแล้ว'} · อัปเกรดลด ${o.pct}% ด้วยโค้ด <b>${esc(o.code)}</b> · <a href="/plans?coupon=${encodeURIComponent(o.code)}">เลือกแพลน</a></span>`;
  annAdd(b);
}
function banner() { trialStrip(); promoStrip(); // ประกาศจากแอดมิน: ปิดได้ จำไว้ว่าปิดข้อความไหน · โปรเพิ่มลิมิตที่ยังไม่หมดเขต แสดงก่อน (หายเองเมื่อหมดโปร)
  const t = promoOn() ? (site.promo.label || `โปรเดือนนี้: ทุกแพลนใช้งานได้ x${site.promo.x4h} ในรอบ 4 ชม. (ลิมิตสัปดาห์ x${site.promo.xweek})`) + ` ถึง ${promoEnd()}` : site.announcement; if (!t || localStorage.getItem('ann') === t || ['admin', 'code', 'receipt'].includes(pageName())) return;
  const b = document.createElement('div'); b.className = 'ann ' + (site.announcement_level || 'info');
  b.innerHTML = `<span>${promoOn() ? ic('sparkles', 'sm') + ' ' : ''}${inline(esc(t.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')))}</span><button aria-label="ปิดประกาศ">${ic('x')}</button>`;
  b.querySelector('button').onclick = () => { localStorage.setItem('ann', t); b.remove(); };
  annAdd(b);
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
  setTimeout(() => { if (!app.querySelector('.view')) app.insertAdjacentHTML('beforeend', '<div style="text-align:center;margin:24px 16px"><p class="muted">โหลดนานผิดปกติ</p><button class="btn out" data-reload>Try again</button></div>'); }, 8000);
  try {
    if (site.maintenance === '1' && me?.role !== 'admin' && !OPEN_IN_MAINTENANCE.includes(pageName()))
      page(nav() + `<section class="hero"><h1>ปิดปรับปรุงชั่วคราว</h1><p>เรากำลังอัปเกรดระบบ กลับมาใหม่อีกสักครู่ · <a href="/status">ดูสถานะระบบ</a></p></section>`);
    else await (PAGES[pageName()] || PAGES.home)();
    banner();
  }
  catch (x) {
    clearTimeout(skT);
    if (!me) return go('/login?next=' + encodeURIComponent(here()));
    page(nav() + `<div style="text-align:center;margin:48px 16px"><p class="err" style="max-width:420px;margin:0 auto 16px">${esc(x.message)}</p><button class="btn out" data-reload>Try again</button></div>`);
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

// ลายนิ้วมือเบราว์เซอร์ (เพื่อจับแอคหลุมที่สมัครหลายบัญชีจากเครื่องเดียว): ค่าหยาบๆ จาก canvas/หน้าจอ/timezone แล้ว hash · ส่งครั้งเดียวต่อวันต่อเครื่อง ไม่เก็บข้อมูลส่วนตัว
// ปุ่ม "แจ้งปัญหา": เล่าปัญหา + แนบภาพหน้าจอ (≤3) · แนบหน้า/แอป/เบราว์เซอร์/error ล่าสุดให้อัตโนมัติ → เข้าเรื่อง "ติดต่อ" ในหลังบ้าน
const shrinkShot = f => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src); res(c.toDataURL('image/jpeg', 0.85)); }; im.onerror = rej; im.src = URL.createObjectURL(f); });
function bugSheet() {
  const errs = (window.__errs || []).slice(-10), app = window.astraDesktop ? 'แอปบนคอม' : 'เว็บ';
  sheet('แจ้งปัญหา / บั๊ก', `<form class="sheet-form" id="bgf"><textarea name="text" rows="4" maxlength="4000" required placeholder="เกิดอะไรขึ้น ทำอะไรอยู่ตอนเจอ เช่น กดส่งแล้วขึ้น error / ตัวหนังสืออ่านไม่ออก"></textarea>
    <label class="muted" style="font-size:13px">ภาพหน้าจอ (ไม่บังคับ สูงสุด 3 ภาพ)</label><input type="file" name="img" accept="image/*" multiple>
    <label class="sw-row"><span class="sw"><input type="checkbox" name="meta" checked><span></span></span>แนบข้อมูลเครื่องให้ทีมงาน (หน้าเว็บ, ${esc(app)}, เบราว์เซอร์, error ล่าสุด ${errs.length} รายการ · ไม่มีรหัสผ่าน/ข้อความแชต)</label>
    <button class="btn blue">ส่งให้ทีมงาน</button><p class="muted" style="font-size:12.5px;margin:0">ทีมงานตอบกลับในหน้า <a href="/support">ติดต่อ</a> และแจ้งเตือนเมื่อมีคำตอบ</p></form>`, (d, close) => {
    d.querySelector('#bgf').onsubmit = async e => {
      e.preventDefault(); const f = e.target, btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'กำลังส่ง…';
      try {
        const images = []; for (const file of [...f.img.files].slice(0, 3)) images.push(await shrinkShot(file).catch(() => null));
        const ver = window.astraDesktop?.version ? await Promise.resolve(window.astraDesktop.version()).catch(() => '') : '';
        const meta = f.meta.checked ? { url: location.pathname + location.search, app: app + (ver ? ' ' + ver : ''), ua: navigator.userAgent, screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`, theme: document.documentElement.dataset.theme, errors: errs } : null;
        await api('/bugreport', { method: 'POST', body: { text: f.text.value, images: images.filter(Boolean), meta } });
        close(); toast('ส่งให้ทีมงานแล้ว ขอบคุณที่ช่วยบอกครับ 🙏', 'ok');
      } catch (x) { toast(x.message, 'bad'); btn.disabled = false; btn.textContent = 'ส่งให้ทีมงาน'; }
    };
  });
}
// แอป Desktop รุ่นเก่า (ไม่ได้ปิดแอปจริงนาน อัปเดตเลยไม่ติดตั้ง): แถบแจ้งด้านบน + ปุ่มโหลดรุ่นใหม่ · ปิดได้ แสดงใหม่วันถัดไป
const verLt = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
async function desktopUpdateBar() {
  try {
    const D = window.astraDesktop; if (!D?.version || document.getElementById('dupd')) return;
    if (localStorage.getItem('dupdOff') === new Date().toDateString()) return;
    const [mine, latest] = await Promise.all([Promise.resolve(D.version()).catch(() => ''), fetch('/api/desktop/latest').then(r => r.json()).then(d => d.version).catch(() => null)]);
    if (!mine || !latest || !verLt(mine, latest)) return;
    const b = document.createElement('div'); b.id = 'dupd'; b.className = 'dupd'; b.setAttribute('role', 'status');
    b.innerHTML = `<span>แอปของคุณเป็นรุ่น <b>${esc(mine)}</b> · รุ่นใหม่ <b>${esc(latest)}</b> แก้บั๊ก Agent และเร็วขึ้น · วิธีอัปเดต: คลิกขวาไอคอน Kyber ที่ถาดมุมขวาล่าง → ออก แล้วเปิดใหม่ หรือ</span><a class="btn blue sm" href="/download/desktop?os=win">โหลดรุ่นใหม่</a><button type="button" aria-label="ปิด">${ic('x', 'sm')}</button>`;
    b.querySelector('button').onclick = () => { try { localStorage.setItem('dupdOff', new Date().toDateString()); } catch { /* */ } b.remove(); };
    document.body.prepend(b);
  } catch { /* ไม่ใช่แอป / ออฟไลน์ */ }
}
if (typeof window !== 'undefined' && window.astraDesktop) setTimeout(desktopUpdateBar, 3000);
async function sendFp() {
  try {
    if (!me || localStorage.getItem('fpd') === new Date().toDateString()) return;
    const c = document.createElement('canvas'); c.width = 200; c.height = 40; const x = c.getContext('2d');
    x.textBaseline = 'top'; x.font = '14px Arial'; x.fillStyle = '#069'; x.fillText('Kyber,fp!8', 2, 2); x.fillStyle = 'rgba(102,0,0,.5)'; x.fillRect(90, 10, 60, 20);
    const raw = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, screen.colorDepth, new Date().getTimezoneOffset(), navigator.hardwareConcurrency || '', navigator.deviceMemory || '', navigator.platform, (navigator.languages || []).join(','), c.toDataURL().slice(-120)].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const fp = [...new Uint8Array(buf)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
    await api('/signal', { method: 'POST', body: { fp } }); localStorage.setItem('fpd', new Date().toDateString());
  } catch { /* ไม่สำคัญ ข้ามได้ */ }
}

// มิเตอร์ลิมิตเก่าค้าง: รีเซ็ต/เติมจากอีกหน้าต่าง (เว็บ ↔ แอปบนคอม) หน้าที่เปิดค้างไว้ยังโชว์ % เดิม → กลับมาที่หน้า/โฟกัสหน้าต่าง ดึงลิมิตใหม่ (ไม่เกินทุก 20 วินาที)
let meAt = Date.now();
async function refreshUsage() {
  if (!me || document.hidden || Date.now() - meAt < 20e3) return; meAt = Date.now();
  try { const m = await api('/me'); if (!m?.usage) return; Object.assign(me, { usage: m.usage, reset_credits: m.reset_credits, reset_list: m.reset_list, subs: m.subs ?? me.subs }); const lim = $('#lim') || $('#clim'); if (lim) lim.innerHTML = limHTML(me.usage); } catch { /* ออฟไลน์: ใช้ค่าเดิม */ }
}
addEventListener('focus', refreshUsage); document.addEventListener('visibilitychange', refreshUsage); setInterval(refreshUsage, 120e3);
Promise.all([loadMe(), loadSite(), domReady]).then(boot).then(sendFp);
// เริ่มโหลดหน้าถัดไปตั้งแต่นิ้วแตะลิงก์ (prerender) และโหลด HTML ล่วงหน้าเมื่อชี้/ใกล้แตะ · ไม่แตะ /api (ดาวน์โหลด, OAuth) และลิงก์ที่เปิดแท็บใหม่
if (!window.DEMO && HTMLScriptElement.supports?.('speculationrules')) {
  const where = { and: [{ href_matches: '/*' }, { not: { href_matches: ['/api/*', '/v1/*', '/share*'] } }, { not: { selector_matches: '[download], [target=_blank], [data-new], [data-chat]' } }] };
  const sr = document.createElement('script'); sr.type = 'speculationrules';
  sr.textContent = JSON.stringify({ prerender: [{ where, eagerness: 'moderate' }], prefetch: [{ where, eagerness: 'eager' }] }); // ชี้/ใกล้แตะ = เตรียมหน้าไว้ทั้งหน้า (รวม JS) เปลี่ยนหน้าแล้วขึ้นทันที
  document.head.append(sr);
}
// service worker retired: remove any copy a visitor still has (sw.js also clears its caches)
if ('serviceWorker' in navigator && !window.DEMO) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => { if (!/push-sw\.js$/.test(r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '')) r.unregister(); })).catch(() => {});
// Passkey (WebAuthn): ข้อมูลไบนารีส่งเป็น base64url
const pkB64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pkBin = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function passkeyLogin() {
  const o = await api('/passkey/login-options');
  const c = await navigator.credentials.get({ publicKey: { challenge: pkBin(o.challenge), rpId: o.rpId, userVerification: o.userVerification, timeout: o.timeout } });
  await api('/passkey/login', { method: 'POST', body: { id: c.id, clientDataJSON: pkB64(c.response.clientDataJSON), authenticatorData: pkB64(c.response.authenticatorData), signature: pkB64(c.response.signature) } });
}
async function passkeyAdd() {
  if (!window.PublicKeyCredential) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Passkey');
  const o = await api('/passkey/register-options', { method: 'POST' });
  const c = await navigator.credentials.create({ publicKey: { ...o, challenge: pkBin(o.challenge), user: { ...o.user, id: pkBin(o.user.id) }, excludeCredentials: o.excludeCredentials.map(x => ({ ...x, id: pkBin(x.id) })) } });
  const pub = c.response.getPublicKey?.(); if (!pub) throw new Error('เบราว์เซอร์นี้สร้าง Passkey ได้แต่ส่ง public key ไม่ได้ ลองอัปเดตเบราว์เซอร์');
  await api('/passkey/register', { method: 'POST', body: { id: c.id, clientDataJSON: pkB64(c.response.clientDataJSON), publicKey: pkB64(pub), alg: c.response.getPublicKeyAlgorithm(), name: /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'อุปกรณ์' } });
}
// แจ้งเตือนเข้ามือถือ (Web Push): ใช้ service worker แยกที่รับแค่ push · iPhone ต้องเพิ่มเว็บลงหน้าจอโฮมก่อน
const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function pushReg() { return navigator.serviceWorker.register('/push-sw.js', { scope: '/push/' }); }
async function pushState() { if (!pushOK() || Notification.permission !== 'granted') return false; const r = await navigator.serviceWorker.getRegistration('/push/'); return !!(await r?.pushManager.getSubscription()); }
async function enablePush() {
  if (!pushOK()) throw new Error(/iP(hone|ad)/.test(navigator.userAgent) ? 'iPhone/iPad: กดแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดจากไอคอนนั้นก่อน' : 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
  if (await Notification.requestPermission() !== 'granted') throw new Error('ไม่ได้รับอนุญาตให้แจ้งเตือน เปิดได้ที่การตั้งค่าเว็บไซต์ของเบราว์เซอร์');
  const reg = await pushReg(), { key } = await api('/push/key');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) });
  await api('/push/sub', { method: 'POST', body: sub.toJSON() });
}
async function disablePush() {
  const r = await navigator.serviceWorker.getRegistration('/push/'), sub = await r?.pushManager.getSubscription();
  if (sub) { await api('/push/sub', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
}

// ---------- วิดีโอที่ AI สร้างในแชต / Code [[vid:id]]: การ์ดที่เช็กสถานะเองจนเสร็จ แล้วเล่นได้ทันที ----------
const VID_RE = /\[\[vid:(\d+)\]\]/g;
const vidStrip = t => String(t || '').replace(VID_RE, '');
const vidCards = t => [...new Set([...String(t || '').matchAll(VID_RE)].map(m => m[1]))].map(id => `<div class="vid-card" data-vid="${id}"><div class="vid-wait"><span class="cw-spin"></span> กำลังสร้างวิดีโอ… ประมาณ 1–5 นาที</div></div>`).join('');
const VID_DONE = new Map();
async function vidPoll() {
  for (const el of document.querySelectorAll('.vid-card:not([data-ok])')) {
    const id = el.dataset.vid, known = VID_DONE.get(id);
    const v = known || await api('/videos/' + id).catch(() => null); if (!v) continue;
    if (v.status === 'done' || v.status === 'failed') VID_DONE.set(id, v);
    if (v.status === 'done') { el.dataset.ok = '1'; el.innerHTML = `<video src="${v.url}" controls playsinline preload="metadata" class="${v.aspect === '9:16' ? 'tall' : ''}"></video><div class="row"><small class="muted">${v.duration || 5} วินาที · ${v.aspect} · ฿${v.charged}</small><a class="btn out sm" href="${v.url}" download="kyber-video-${v.id}.mp4">${ic('download', 'sm')} ดาวน์โหลด</a></div>`; }
    else if (v.status === 'failed') { el.dataset.ok = '1'; el.innerHTML = `<div class="vid-wait failed">${ic('x')} สร้างวิดีโอไม่สำเร็จ (คืนเงินแล้ว)${v.error ? ': ' + esc(v.error.slice(0, 120)) : ''}</div>`; }
  }
}
setInterval(() => { if (document.querySelector('.vid-card:not([data-ok])') && document.visibilityState === 'visible') vidPoll(); }, 10000);
new MutationObserver(() => { const el = document.querySelector('.vid-card:not([data-ok]):not([data-seen])'); if (el) { document.querySelectorAll('.vid-card:not([data-seen])').forEach(x => x.dataset.seen = '1'); setTimeout(vidPoll, 300); } }).observe(document.documentElement, { childList: true, subtree: true });
