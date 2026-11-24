// สร้างไฟล์ HTML ของแต่ละหน้าจากแม่แบบเดียว: node tools/pages.mjs (ไฟล์นี้คือต้นฉบับ: แก้หัวหน้า/SEO ที่นี่ ไม่แก้ public/*.html ตรงๆ)
// SITE = โดเมนหลัก ใช้ทำลิงก์ใน og:image / canonical / JSON-LD (เปลี่ยนได้ด้วย SITE=https://... node tools/pages.mjs)
// แบรนด์: Kyber (ผลิตภัณฑ์) สร้างโดย Hypatia (บริษัท) · ช่วงเปลี่ยนผ่าน SEO 60–90 วัน: ใส่ "เดิมคือ AstraCode" ในหน้าแรกและ JSON-LD (alternateName) ให้คนที่ค้นชื่อเดิมยังเจอ
import fs from 'node:fs';
const SITE = (process.env.SITE || 'https://astracode.panderx.xyz').replace(/\/$/, '');
const BRAND = 'Kyber', MAKER = 'Hypatia', OLD = 'AstraCode';
const DESC = `${BRAND} (เดิมคือ ${OLD}) สร้างโดย ${MAKER}: ใช้ Claude, ChatGPT, Gemini และ DeepSeek ในเว็บเดียว เปิดบนมือถือได้ทันที มีโหมดเขียนโค้ด API สำหรับนักพัฒนา จ่ายผ่าน PromptPay`;
const by = s => `${s} · สร้างโดย ${MAKER}`;
const back = '<a href="/">หน้าแรก</a>';
// เนื้อหาคงที่ให้ search engine อ่านได้ก่อน JavaScript โหลด (app.js วาดหน้าจริงทับ)
const SEO = {
  home: `<main class="seo-static"><h1>${BRAND} (เดิมคือ ${OLD}) — AI ทุกตัวในเว็บเดียว ใช้บนมือถือได้</h1>
<p>${BRAND} สร้างโดย ${MAKER} รวม Claude, ChatGPT, Gemini และ DeepSeek ไว้ในที่เดียว แชตกับ AI เขียนโค้ด สร้างเว็บ และเรียก API ได้จากมือถือ คอมพิวเตอร์ Windows และ Linux จ่ายเป็นเงินบาทผ่าน PromptPay</p>
<h2>ทำอะไรได้บ้าง</h2><ul><li>แชต AI หลายโมเดล: Claude, GPT, Gemini, DeepSeek</li><li>${BRAND} Code: AI เขียนโค้ด รัน และทดสอบให้เอง เชื่อม GitHub repo ได้</li><li>${BRAND} Harness: ให้ AI ทำงานออฟฟิศและงานหลายขั้นตอนแทน</li><li>${BRAND} API: API แบบ OpenAI ใช้ key เดียวเรียกทุกโมเดล</li><li>${BRAND} Desktop: แอปสำหรับ Windows และ Linux</li></ul>
<nav><a href="/plans">แพลนและราคา</a> · <a href="/pricing">ราคาต่อ token</a> · <a href="/developers">API สำหรับนักพัฒนา</a> · <a href="/blog">บล็อก</a> · <a href="/login">เข้าสู่ระบบ</a></nav>
<p><small>© 2026 ${MAKER} · ${BRAND} สร้างโดย ${MAKER}</small></p></main>`,
  developers: `<main class="seo-static"><h1>${BRAND} API สำหรับนักพัฒนา</h1><p>API รูปแบบเดียวกับ OpenAI เรียก Claude, GPT, Gemini และ DeepSeek ด้วย key เดียว จ่ายตามการใช้งานจริงเป็นเงินบาท · สร้างโดย ${MAKER}</p>${back}</main>`,
  plans: `<main class="seo-static"><h1>แพลนและราคา ${BRAND}</h1><p>แพลนรายเดือนและรายปี ใช้ Claude, ChatGPT, Gemini และ DeepSeek ได้ในแพลนเดียว ลิมิตแสดงเป็น % ทุก 4 ชั่วโมงและรายสัปดาห์ จ่ายผ่าน PromptPay มีทดลองใช้ฟรี</p>${back}</main>`,
  pricing: `<main class="seo-static"><h1>ราคาต่อ token ของทุกโมเดล AI</h1><p>ตารางราคา input, output และ cache ของ Claude, GPT, Gemini และ DeepSeek ใน ${BRAND} พร้อมเครื่องคำนวณค่าใช้จ่ายเป็นเงินบาท</p>${back}</main>`,
};
// ฟอนต์ Anuphan (ไทย + ละติน) ของ UI 2.0 แนว Prism
const FONT = 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&display=swap';
const FONT_CODE = 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'; // หน้า Code ใช้ฟอนต์โค้ดเพิ่ม
// [ชื่อหน้า, title, สคริปต์ของหน้า, description, index ได้ไหม]
const PAGES = {
  home: ['home', `${BRAND} (เดิมคือ ${OLD}) — AI ทุกตัวในที่เดียว · สร้างโดย ${MAKER}`, [], DESC, true], // หน้าแรก: เปิดที่ / (ไฟล์ชื่อ home.html)
  login: ['login', `เข้าสู่ระบบ · ${BRAND}`, [], by(`เข้าสู่ระบบหรือสมัคร ${BRAND} (เดิมคือ ${OLD}) ฟรี ด้วยอีเมล Google หรือ LINE`), true],
  chat: ['chat', `แชต · ${BRAND}`, ['chat.js'], DESC, false],
  code: ['code', `${BRAND} Code`, ['chat.js', 'code.js'], DESC, false],
  plans: ['plans', `แพลนและราคา · ${BRAND}`, ['shop.js'], by(`แพลนรายเดือนและรายปีของ ${BRAND} ลิมิตแสดงเป็น % ทุก 4 ชั่วโมงและรายสัปดาห์ จ่ายผ่าน PromptPay`), true],
  account: ['account', `บัญชี · ${BRAND}`, ['account.js'], DESC, false],
  admin: ['admin', `หลังบ้าน · ${BRAND}`, ['admin.js'], DESC, false],
  terms: ['terms', `เงื่อนไขและความเป็นส่วนตัว · ${BRAND}`, [], by(`เงื่อนไขการใช้บริการและนโยบายความเป็นส่วนตัวของ ${BRAND}`), true],
  pricing: ['pricing', `ราคาต่อ token · ${BRAND}`, ['shop.js'], by(`ราคา input, output และ cache ต่อ token ของทุกโมเดลใน ${BRAND} พร้อมเครื่องคำนวณค่าใช้จ่าย`), true],
  developers: ['developers', `${BRAND} API สำหรับนักพัฒนา`, ['pages.js'], by(`${BRAND} API แบบ OpenAI เรียก Claude, GPT, Gemini และ DeepSeek ด้วย key เดียว จ่ายตามจริงเป็นบาท`), true],
  support: ['support', `ติดต่อเรา · ${BRAND}`, ['pages.js'], DESC, false],
  blog: ['blog', `บล็อก · ${BRAND}`, ['pages.js'], by(`ข่าวสาร วิธีใช้ และเทคนิคการใช้ AI จาก ${BRAND}`), true],
  status: ['status', `สถานะระบบ · ${BRAND}`, ['pages.js'], by(`สถานะการทำงานของทุกโมเดลใน ${BRAND} ย้อนหลัง 30 วัน`), true],
  receipt: ['receipt', `ใบเสร็จ · ${BRAND}`, ['pages.js'], DESC, false],
};
// JSON-LD: Organization (Hypatia) เป็นผู้สร้าง/ผู้เผยแพร่ของ WebSite และ SoftwareApplication (Kyber) · alternateName เก็บชื่อเดิมไว้ให้ Google ผูกแบรนด์เก่ากับใหม่
const ORG = SITE + '/#org', ALT = [OLD, 'ASTRACODE', 'Astra Code', 'แอสตร้าโค้ด'];
const LD = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': ORG, name: MAKER, url: SITE + '/', logo: SITE + '/icon-512.png' },
  { '@type': 'WebSite', '@id': SITE + '/#website', name: BRAND, alternateName: ALT, url: SITE + '/', inLanguage: 'th', publisher: { '@id': ORG } },
  { '@type': 'SoftwareApplication', '@id': SITE + '/#app', name: BRAND, alternateName: ALT, applicationCategory: 'ProductivityApplication', operatingSystem: 'Web, Windows, macOS, Linux, iOS, Android', url: SITE + '/', description: DESC,
    creator: { '@id': ORG }, publisher: { '@id': ORG }, offers: { '@type': 'Offer', price: '0', priceCurrency: 'THB' } },
] });
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
for (const [file, [page, title, scripts, desc, index]] of Object.entries(PAGES)) {
  const font = file === 'code' ? FONT_CODE : FONT;
  fs.writeFileSync(`public/${file}.html`, `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#f6f7fb">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="${BRAND}">
<meta name="application-name" content="${BRAND}">
<meta name="author" content="${MAKER}">
<title>${title}</title>
<meta name="description" content="${attr(desc)}">
${index ? `<link rel="canonical" href="${SITE}/${file === 'home' ? '' : file}">` : '<meta name="robots" content="noindex">'}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:image" content="${SITE}/og.png">
${index ? `<meta property="og:url" content="${SITE}/${file === 'home' ? '' : file}">\n` : ''}<meta property="og:locale" content="th_TH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${font}">
<link href="${font}" rel="stylesheet" media="print" data-fonts>
<script src="/theme.js"></script>
<link rel="stylesheet" href="/style.css">
${file === 'home' ? `<script type="application/ld+json">${LD}</script>\n` : ''}</head>
<body data-page="${page}">
<div id="app">${SEO[file] || ''}</div>
<script src="/app.js"></script>
${scripts.map(s => `<script src="/${s}"></script>`).join('\n')}
</body>
</html>
`);
}
console.log(Object.keys(PAGES).length, 'pages');
