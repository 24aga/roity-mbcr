// Service worker: deixa o app abrir offline. Mude VERSION a cada atualização publicada.
const VERSION = 'mbcr-v2.6.0';
const FILES = ['./', './index.html', './css/app.css', './js/template.js', './js/howto.js', './js/store.js', './js/map.js', './js/sync.js', './js/app.js', './js/leads.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/logo-white.png', './icons/logo-black.png', './icons/symbol-white.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'mbcr-fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// rede primeiro (pega atualizações), cache se estiver offline
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // fontes do Google: guarda no aparelho para funcionar offline
  if (e.request.method === 'GET' && (u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com')) {
    e.respondWith(caches.open('mbcr-fonts').then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
