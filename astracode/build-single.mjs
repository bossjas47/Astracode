// รวมทุกไฟล์เป็น dist/worker.js ไฟล์เดียว สำหรับวางในหน้าเว็บ Cloudflare
import fs from 'node:fs';
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/manifest+json', svg: 'image/svg+xml' };
const files = Object.fromEntries(fs.readdirSync('public').map(f => ['/' + f, [types[f.split('.').pop()], fs.readFileSync('public/' + f, 'utf8')]]));
const api = fs.readFileSync('src/worker.js', 'utf8').replace('export default {', 'const API = {');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/worker.js', `${api}
const FILES = ${JSON.stringify(files)};
const ASSETS = { fetch(req) { const f = FILES[new URL(req.url).pathname] || FILES['/index.html']; return new Response(f[1], { headers: { 'content-type': f[0] } }); } };
export default { fetch: (req, env, ctx) => API.fetch(req, { ...env, ASSETS }, ctx) };
`);
