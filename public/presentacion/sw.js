// Presentación de XPaze sin conexión: la página y sus fuentes se guardan al abrirla.
// Red primero (para recibir cambios) y copia guardada si no hay red.
const CACHE = 'xpaze-presentacion-v3';
const FILES = ['/presentacion/', '/presentacion/astronaut.webp', '/fonts/geist-300-800-latin.woff2', '/fonts/geist-300-800-latin-ext.woff2', '/favicon.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE && x.startsWith('xpaze-presentacion')).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !(u.pathname.startsWith('/presentacion/') || u.pathname.startsWith('/fonts/geist'))) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/presentacion/'))));
});
