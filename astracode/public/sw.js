// Kill switch: the offline cache worker is retired. Existing installs fetch this file, clear every cache,
// unregister themselves and reload their open pages once, so a stale worker can never serve old assets again.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
})()));
