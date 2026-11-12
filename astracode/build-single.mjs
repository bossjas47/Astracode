// รวมทุกไฟล์เป็น dist/worker.js ไฟล์เดียว สำหรับวางในหน้าเว็บ Cloudflare
import fs from 'node:fs';
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const bin = f => f.endsWith('.png'); // ไฟล์ไบนารีเก็บเป็น base64
const files = Object.fromEntries(fs.readdirSync('public').map(f => ['/' + f, [types[f.split('.').pop()], fs.readFileSync('public/' + f, bin(f) ? 'base64' : 'utf8'), bin(f) ? 1 : 0]]));
const api = fs.readFileSync('src/worker.js', 'utf8').replace('export default {', 'const API = {');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/worker.js', `${api}
const FILES = ${JSON.stringify(files)};
const ASSETS = { fetch(req) { const p = new URL(req.url).pathname, f = FILES[p] || FILES[p + '.html']; if (!f) return new Response('not found', { status: 404 }); return new Response(f[2] ? Uint8Array.from(atob(f[1]), c => c.charCodeAt(0)) : f[1], { headers: { 'content-type': f[0] } }); } };
export default { fetch: (req, env, ctx) => API.fetch(req, { ...env, ASSETS }, ctx), scheduled: (ev, env, ctx) => API.scheduled(ev, { ...env, ASSETS }, ctx) };
`);
