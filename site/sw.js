// Offline support (same approach as the 303 app). The app's own code (the page, css/, js/) is fetched fresh when online,
// so an update arrives as one consistent set, and served from cache when not. Icons, impulse responses and fonts are
// cache-first. The cache name carries the version; every file of the app is cached on install so it works offline at once.
const CACHE = 'kestrel-0.13.4';
const APP = ['css/shyoy.css', 'js/dsp/fx.js', 'js/dsp/engine.js',
  ...['notips', 'defs', 'state', 'audio', 'controls', 'bend', 'effects', 'sequencer', 'tabs', 'slots', 'seqmenu', 'transport', 'presets', 'namer', 'sounds', 'keyboard', 'app'].map((n) => `js/app/${n}.js`)];
const CORE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', ...APP];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// network first, bypassing the browser's HTTP cache, then the cache (offline)
const fresh = (req, key) => fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => {
  if (r.ok && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
  return r;
}).catch(() => caches.match(key));
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { e.respondWith(fresh(req, './')); return; }
  const u = new URL(req.url);
  if (u.origin === location.origin && /\/(css|js)\/[^?]*\.(css|js)$/.test(u.pathname)) { e.respondWith(fresh(req, u.origin + u.pathname)); return; }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
