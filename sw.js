// 離線快取：先用快取，背景更新。改版時把 VERSION 加一。
const VERSION = 'v0.1.0';
const FILES = ['./', 'index.html', 'styles.css', 'manifest.json', 'plan.json', 'icon-180.png', 'icon-512.png',
  'src/app.js', 'src/store.js', 'src/sound.js', 'src/rules/rotation.js', 'src/rules/progression.js', 'src/rules/hiit.js', 'src/rules/today.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
