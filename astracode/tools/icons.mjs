// โลโก้ Kyber (สร้างโดย Hypatia) จากโค้ด: ตัว K เรขาคณิต · ก้านและขาสีขาวเย็น · แขนบนไล่สีสเปกตรัม · พื้นหมึกเย็น (UI 2.0 Prism)
// รัน: node tools/icons.mjs (ต้องมี Playwright + Chromium ในเครื่องสำหรับทำ PNG) → เขียนไอคอนทั้งหมดของเว็บ, แอป Desktop และไฟล์แบรนด์ใน ../brand
// แก้รูปทรงที่ K() เท่านั้น ทุกไฟล์สร้างจากฟังก์ชันเดียวกัน
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), repo = join(root, '..');
const C = { black: '#0e1116', porcelain: '#eef0f6', ink: '#0e1116' }; // UI 2.0 Prism: พื้นหมึกเย็น · แขนบนไล่สีสเปกตรัม (ฟ้า→คราม→ชมพู)

// ตัว K ในกรอบ 512×512 (สูง 272 ตรงกลาง) · s = ย่อ/ขยายรอบจุดกลาง (ไอคอน maskable ต้องอยู่ในวงกลม 80%)
// แขนบนตัดให้เริ่มในก้าน (x ≥ 160) ไม่ให้ขอบ anti-alias เป็นเส้นบาง ๆ ข้างก้าน · ลำดับวาด: ขา → แขน (ทับรอยต่อ) → ก้าน
const K = ({ s = 1, stem = C.porcelain, id = 'k' } = {}) =>
  `<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="160" y1="316" x2="400" y2="76"><stop offset="0" stop-color="#14b8d9"/><stop offset=".5" stop-color="#4b4fe0"/><stop offset="1" stop-color="#d9409a"/></linearGradient><clipPath id="${id}c"><rect x="0" y="120" width="512" height="272"/></clipPath><clipPath id="${id}a"><rect x="160" y="120" width="400" height="272"/></clipPath></defs>` +
  `<g transform="translate(256 256) scale(${s}) translate(-256 -256) translate(-34 0)"><g clip-path="url(#${id}c)">` +
  `<line x1="250" y1="236" x2="430" y2="446" stroke="${stem}" stroke-width="58"/>` +
  `<line x1="140" y1="336" x2="400" y2="76" stroke="url(#${id}g)" stroke-width="58" clip-path="url(#${id}a)"/>` +
  `<rect x="148" y="0" width="58" height="512" fill="${stem}"/></g></g>`;
const svg = (inner, w = 512, h = 512) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;

// รูปแบบต่าง ๆ
const ICON = svg(`<rect width="512" height="512" rx="112" fill="${C.black}"/>${K()}`); // ไอคอนหลัก (มุมมน)
const SQUARE = (s = 1) => svg(`<rect width="512" height="512" fill="${C.black}"/>${K({ s })}`); // เต็มกรอบ: ระบบปฏิบัติการตัดมุมเอง (iOS, Android maskable)
const MARK_LIGHT = svg(K({ stem: C.ink, id: 'l' })); // ตัว K เปล่าบนพื้นสว่าง
const MARK_DARK = svg(K({ id: 'd' })); // ตัว K เปล่าบนพื้นมืด
// โลโก้แนวนอน: ไอคอน + "Kyber" + "by Hypatia" (ฟอนต์ Inter จาก Google Fonts ตอนเรนเดอร์ PNG)
const WORD = (dark) => svg(`<rect width="1200" height="400" fill="${dark ? C.black : '#ffffff'}"/>` +
  `<svg x="96" y="88" width="224" height="224" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${C.black}"/>${K({ id: dark ? 'wd' : 'wl' })}</svg>` +
  `<text x="372" y="232" font-family="Inter, system-ui, sans-serif" font-size="150" font-weight="600" letter-spacing="-4" fill="${dark ? C.porcelain : C.ink}">Kyber</text>` +
  `<text x="378" y="300" font-family="Inter, system-ui, sans-serif" font-size="44" font-weight="400" fill="${dark ? '#a3abbd' : '#5b6170'}">by Hypatia</text>`, 1200, 400);

const out = {
  [join(root, 'public/icon.svg')]: ICON,
  [join(repo, 'brand/kyber-icon.svg')]: ICON,
  [join(repo, 'brand/kyber-mark-dark.svg')]: MARK_DARK,
  [join(repo, 'brand/kyber-mark-light.svg')]: MARK_LIGHT,
  [join(repo, 'brand/kyber-logo-dark.svg')]: WORD(true),
  [join(repo, 'brand/kyber-logo-light.svg')]: WORD(false),
};
// [ไฟล์ PNG, svg, ขนาด, พื้นหลังโปร่งใสไหม]
const png = [
  [join(root, 'public/icon-192.png'), ICON, 192, 192, true],
  [join(root, 'public/icon-512.png'), ICON, 512, 512, true],
  [join(root, 'public/icon-maskable-512.png'), SQUARE(0.8), 512, 512, false],
  [join(root, 'public/apple-touch-icon.png'), SQUARE(0.86), 180, 180, false],
  [join(repo, 'desktop/build/icon.png'), ICON, 1024, 1024, true],
  [join(repo, 'brand/kyber-icon-1024.png'), ICON, 1024, 1024, true],
  [join(repo, 'brand/kyber-profile-1024.png'), SQUARE(0.86), 1024, 1024, false], // รูปโปรไฟล์เพจ/โซเชียล (แพลตฟอร์มตัดเป็นวงกลมเอง)
  [join(repo, 'brand/kyber-logo-dark.png'), WORD(true), 1200, 400, false],
  [join(repo, 'brand/kyber-logo-light.png'), WORD(false), 1200, 400, false],
];

// ภาพตัวอย่างลิงก์ (og.png 1200×630) แบบเดียวกับเดิม + ไอคอน K หน้าชื่อ
const OG = `<div style="position:relative;width:1200px;height:630px;background:#000;font-family:Inter,system-ui,sans-serif">
<div style="position:absolute;left:60px;top:60px;width:1080px;height:510px;background:#1f1f21;border-radius:28px;color:#f4f4f5">
<div style="position:absolute;left:60px;top:84px;display:flex;align-items:center;gap:16px"><div style="width:60px;height:60px">${ICON.replace('width="512" height="512"', 'width="60" height="60"').replace(/id="k/g, 'id="og').replace(/#k([ca])/g, '#og$1')}</div>
<span style="font-size:38px;font-weight:600;letter-spacing:-.5px">Kyber</span><span style="font-size:22px;color:#8e8e93;margin-top:8px">by Hypatia</span></div>
<div style="position:absolute;right:60px;top:86px;width:240px;height:56px;border-radius:28px;background:#0a6fdb;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:500">Try free</div>
<div style="position:absolute;left:58px;top:176px;font-size:84px;line-height:1.12;font-weight:600;letter-spacing:-2px">Every AI model.<br>One phone.</div>
<div style="position:absolute;left:60px;top:402px;font-size:27px;color:#8e8e93">Claude · GPT · Gemini · DeepSeek · Kimi&nbsp; —&nbsp; Chat, Code, API</div>
<div style="position:absolute;left:60px;top:448px;font-size:21px;color:#6e6e73">formerly AstraCode</div></div></div>`;
png.push([join(root, 'public/og.png'), OG, 1200, 630, false]);

for (const [f, s] of Object.entries(out)) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s + '\n'); }
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(), p = await b.newPage();
for (const [f, s, w, h, clear] of png) {
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<!doctype html><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet"><style>html,body{margin:0;background:transparent}body>svg{display:block;width:${w}px;height:${h}px}</style>${s}`);
  await p.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(f), { recursive: true }); await p.screenshot({ path: f, omitBackground: clear });
}
await b.close();
console.log(Object.keys(out).length + png.length, 'files');
