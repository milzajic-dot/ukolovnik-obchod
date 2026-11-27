// Service worker: instalace aplikace (PWA), oznámení na telefon a počet úkolů na ikoně.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

function setBadge(n) {
  try {
    const nav = self.navigator;
    if (!nav || !nav.setAppBadge) return Promise.resolve();
    return (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge()).catch(() => {});
  } catch (e) { return Promise.resolve(); }
}

// Zpráva z Firebase Cloud Messaging: { data: { title, body, tag, url, badge } }
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (x) { p = { data: { body: e.data && e.data.text() } }; }
  const d = p.data || p.notification || p;
  const n = parseInt(d.badge, 10);
  e.waitUntil(Promise.all([
    Number.isFinite(n) ? setBadge(n) : Promise.resolve(),
    self.registration.showNotification(d.title || 'Úkolovník obchodu', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      data: { url: d.url || '/#ukoly' },
    }),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#ukoly';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => 'focus' in x);
    if (c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
