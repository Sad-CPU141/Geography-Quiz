/* Geography Speedrun service worker (same approach as the other Game Night games).
   App files: network first, so new versions win when online; cached copy when offline.
   Flags, icons, fonts: cache first (flag file names are content hashes, so they never go stale). */
const VERSION = '__VERSION__';
const CACHE = 'geospeed-' + VERSION;
const CORE = ['./', './index.html', './app.js?v=' + VERSION, './data.js?v=' + VERSION, './map.js?v=' + VERSION, './langs.js?v=' + VERSION, './globe.js?v=' + VERSION, './vendor/d3/d3-array.min.js', './vendor/d3/d3-geo.min.js', './styles.css?v=' + VERSION, './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png',
  './fonts/anton-latin-400-normal.woff2', './fonts/barlow-latin-600-normal.woff2', './fonts/barlow-latin-700-normal.woff2',
  './fonts/barlow-semi-condensed-latin-700-normal.woff2', './fonts/barlow-semi-condensed-latin-800-normal.woff2'];
const FLAGS = __FLAGS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).then(() => Promise.all(FLAGS.map((u) => c.add(u).catch(() => {}))))).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('geospeed-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Only this game's folder (the hub and the other games share the domain).
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const isShell = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname) || /\.(js|css|webmanifest)$/.test(url.pathname);
  if (isShell) {
    // cache: 'no-cache' = always ask GitHub if there's a newer copy (its 10-minute browser cache kept old versions around).
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
