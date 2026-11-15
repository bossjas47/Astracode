// PWA: ติดตั้งลงหน้าจอหลักได้ + ใช้งานหน้าเดิมต่อได้เมื่อออฟไลน์
// JS/CSS/HTML: ใช้เครือข่ายก่อนเสมอ (ไม่ให้ app.js กับ chat.js คนละเวอร์ชันกัน) แล้วค่อยใช้ที่เก็บไว้ตอนออฟไลน์ · รูป/ฟอนต์: ใช้ที่เก็บไว้ก่อนแล้วอัปเดตเบื้องหลัง · ไม่เก็บ /api, /v1, /p, หน้าพรีวิว
const V = 'astra-v2';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.add('/offline.html'))); });
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== V) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || /^\/(api|v1|p|preview|node-runner|pyworker|__sw__)(\/|\.|$)/.test(u.pathname)) return;
  const keep = res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; };
  if (r.mode === 'navigate' || /\.(?:js|css|json)$/.test(u.pathname))
    return e.respondWith(fetch(r).then(keep).catch(async () => (await caches.match(r)) || (r.mode === 'navigate' ? await caches.match('/offline.html') : Response.error())));
  if (/\.(?:svg|png|jpe?g|webp|ico|woff2?)$/.test(u.pathname))
    e.respondWith(caches.match(r).then(hit => { const net = fetch(r).then(keep).catch(() => hit); return hit || net; }));
});
