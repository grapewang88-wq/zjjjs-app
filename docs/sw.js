/* 简易离线缓存 —— 首屏与题库缓存后可离线刷题 */
const CACHE = 'zjjjs-v5';
const ASSETS = ['./', './index.html', './app.js', './styles.css', './bank.json', './manifest.webmanifest', './icon.svg',
  './assets/bubu/bubu-happy-big.png', './assets/bubu/bubu-wink.png', './assets/bubu/bubu-sad.png',
  './assets/bubu/bubu-sleep.png', './assets/bubu/bubu-surprise.png', './assets/bubu/bubu-base.png',
  './assets/hero.jpg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => { });
      return res;
    }).catch(() => hit))
  );
});
