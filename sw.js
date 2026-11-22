// 離線快取：有網路拿最新、沒網路用快取。改版時把 VERSION 加一。
const VERSION = 'v0.1.6';
const FILES = ['./', 'index.html', 'styles.css', 'manifest.json', 'plan.json', 'icon-180.png', 'icon-512.png',
  'src/app.js', 'src/store.js', 'src/sound.js', 'src/rules/rotation.js', 'src/rules/progression.js', 'src/rules/hiit.js', 'src/rules/today.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 有網路就拿最新的（改版馬上看到），沒網路才用快取。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
