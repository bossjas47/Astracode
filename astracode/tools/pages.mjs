// สร้างไฟล์ HTML ของแต่ละหน้าจากแม่แบบเดียว: node tools/pages.mjs
// SITE = โดเมนหลัก ใช้ทำลิงก์ใน og:image / canonical (เปลี่ยนได้ด้วย SITE=https://... node tools/pages.mjs)
import fs from 'node:fs';
const SITE = (process.env.SITE || 'https://astracode.panderx.xyz').replace(/\/$/, '');
const DESC = 'ใช้ ChatGPT, Claude, Gemini, DeepSeek และ Kimi ในเว็บเดียว เปิดบนมือถือได้ทันที มีโหมดเขียนโค้ด API สำหรับนักพัฒนา จ่ายผ่าน PromptPay';
// [ชื่อหน้า, title, สคริปต์ของหน้า, description, index ได้ไหม]
const PAGES = {
  home: ['home', 'AstraCode — AI ทุกตัว ในมือถือเครื่องเดียว', [], DESC, true], // หน้าแรก: เปิดที่ / (ไฟล์ชื่อ home.html)
  login: ['login', 'เข้าสู่ระบบ · AstraCode', [], 'เข้าสู่ระบบหรือสมัคร AstraCode ฟรี ด้วยอีเมล Google หรือ LINE', true],
  chat: ['chat', 'แชต · AstraCode', ['chat.js'], DESC, false],
  code: ['code', 'Code · AstraCode', ['cm.js', 'code.js'], DESC, false],
  plans: ['plans', 'แพลนและราคา · AstraCode', [], 'แพลนรายเดือนและรายปีของ AstraCode ลิมิตแสดงเป็น % ทุก 4 ชั่วโมงและรายสัปดาห์ จ่ายผ่าน PromptPay', true],
  account: ['account', 'บัญชี · AstraCode', ['account.js'], DESC, false],
  admin: ['admin', 'หลังบ้าน · AstraCode', ['admin.js'], DESC, false],
  terms: ['terms', 'เงื่อนไขและความเป็นส่วนตัว · AstraCode', [], 'เงื่อนไขการใช้บริการและนโยบายความเป็นส่วนตัวของ AstraCode', true],
  pricing: ['pricing', 'ราคาต่อ token · AstraCode', [], 'ราคา input, output และ cache ต่อ token ของทุกโมเดลใน AstraCode พร้อมเครื่องคำนวณค่าใช้จ่าย', true],
  developers: ['developers', 'API สำหรับนักพัฒนา · AstraCode', ['pages.js'], 'API แบบ OpenAI เรียก Claude, GPT, Gemini, DeepSeek และ Kimi ด้วย key เดียว จ่ายตามจริงเป็นบาท', true],
  support: ['support', 'ติดต่อเรา · AstraCode', ['pages.js'], DESC, false],
  blog: ['blog', 'บล็อก · AstraCode', ['pages.js'], 'ข่าวสาร วิธีใช้ และเทคนิคการใช้ AI จาก AstraCode', true],
  status: ['status', 'สถานะระบบ · AstraCode', ['pages.js'], 'สถานะการทำงานของทุกโมเดลใน AstraCode ย้อนหลัง 30 วัน', true],
  receipt: ['receipt', 'ใบเสร็จ · AstraCode', ['pages.js'], DESC, false],
};
const LD = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebSite', name: 'AstraCode', url: SITE + '/', inLanguage: 'th' },
  { '@type': 'SoftwareApplication', name: 'AstraCode', applicationCategory: 'ProductivityApplication', operatingSystem: 'Web, iOS, Android', url: SITE + '/', description: DESC, offers: { '@type': 'Offer', price: '0', priceCurrency: 'THB' } },
] });
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
for (const [file, [page, title, scripts, desc, index]] of Object.entries(PAGES)) fs.writeFileSync(`public/${file}.html`, `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#000000">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<title>${title}</title>
<meta name="description" content="${attr(desc)}">
${index ? `<link rel="canonical" href="${SITE}/${file === 'home' ? '' : file}">` : '<meta name="robots" content="noindex">'}
<meta property="og:type" content="website">
<meta property="og:site_name" content="AstraCode">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:locale" content="th_TH">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Prompt:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${file === 'home' ? `<script type="application/ld+json">${LD}</script>\n` : ''}</head>
<body data-page="${page}">
<div id="app"></div>
<script src="/app.js"></script>
${scripts.map(s => `<script src="/${s}"></script>`).join('\n')}
</body>
</html>
`);
console.log(Object.keys(PAGES).length, 'pages');
