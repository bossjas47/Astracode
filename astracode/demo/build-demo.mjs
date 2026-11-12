// สร้าง demo.html: หน้าเว็บจริง + API จำลองในเบราว์เซอร์ ไฟล์เดียว
import fs from 'node:fs';
const r = f => fs.readFileSync(f, 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
<title>AstraCode Demo</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Prompt:wght@400;500;600&display=swap" rel="stylesheet">
<style>${r('public/style.css')}
.demo-toast { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); z-index: 50; background: var(--porcelain); color: #1d1d1f; font-size: 13px; padding: 10px 18px; border-radius: 9999px; max-width: 90vw; text-align: center; animation: fadeUp .25s ease-out both; }
</style></head><body><div id="app"></div>
<script>window.DEMO = true;</script>
<script>${safe(r('demo/mock.js'))}</script>
<script>${safe(r('public/app.js'))}</script>
<script>${safe(r('public/chat.js'))}</script>
<script>${safe(r('public/admin.js'))}</script>
<script>${safe(r('public/account.js'))}</script>
<script>${safe(r('public/pages.js'))}</script>
<script>${safe(r('public/cm.js'))}</script>
<script>${safe(r('public/code.js'))}</script>
</body></html>`;
fs.writeFileSync('demo/demo.html', html);
console.log('demo.html', html.length);
