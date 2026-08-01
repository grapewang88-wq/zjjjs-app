/* 简易离线缓存 —— 首屏与题库缓存后可离线刷题 */
const CACHE = 'zjjjs-v16';
const ASSETS = ['./', './index.html', './app.js', './styles.css', './bank.json',
  './chapters.json', './lecture.json', './changes.json', './manifest.webmanifest', './icon.svg',
  './assets/bubu/bubu-happy-big.png', './assets/bubu/bubu-wink.png', './assets/bubu/bubu-sad.png',
  './assets/bubu/bubu-sleep.png', './assets/bubu/bubu-surprise.png', './assets/bubu/bubu-base.png',
  './assets/hero.jpg', './assets/icon-app-180.png', './assets/icon-app-192.png', './assets/icon-app-512.png',
  './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // 跨域(定位API等)不拦
  // stale-while-revalidate:先给缓存秒开,同时后台拉新写回缓存,下次刷新即拿到修复后的数据
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
