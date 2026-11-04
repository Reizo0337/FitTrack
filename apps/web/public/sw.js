// Service worker: notificaciones push y navegación sin conexión básica. Nunca cachea /api (datos de salud).
const SHELL = 'fittrack-shell-v1';

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.add('/'))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
  }
});

self.addEventListener('push', (e) => {
  let d = { title: 'FitTrack', body: '', url: '/', tag: 'ft' };
  try { d = { ...d, ...e.data.json() }; } catch { /* payload no JSON */ }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: '/icon-180.png', data: { url: d.url } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    const c = cs.find((w) => 'focus' in w);
    return c ? (c.navigate(url), c.focus()) : self.clients.openWindow(url);
  }));
});
