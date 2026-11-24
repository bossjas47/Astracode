// รับแจ้งเตือน Web Push เท่านั้น (ไม่แคช ไม่ดักคำขอ) · แตะแจ้งเตือน = เปิดหน้าที่เกี่ยวข้อง
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data?.json() || {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kyber', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }, tag: d.url || 'astra' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) if (c.url === url && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  })());
});
