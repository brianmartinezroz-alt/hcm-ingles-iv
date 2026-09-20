/* Ayudante de instalación de la app.
   Guarda la app en el teléfono para que abra rápido y funcione sin
   internet. El audio y la IA sí necesitan internet. */
var CACHE = 'hcm-ingles-iv-v2';
var BASE  = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(BASE.map(function (u) {
      return c.add(u).catch(function () {});
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;                       // nada de POST al caché
  if (r.url.indexOf('script.google.com') !== -1) return; // IA, voz y datos: siempre en vivo

  // La pagina misma se pide siempre fresca (sin la cache del navegador):
  // asi cada cadete recibe la version nueva en cuanto abre con internet.
  var pide = (r.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(r.url).pathname))
    ? fetch(r.url, { cache: 'reload', credentials: 'same-origin' })
    : fetch(r);
  e.respondWith(
    pide.then(function (resp) {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(r, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(r).then(function (hit) { return hit || caches.match('./index.html'); });
    })
  );
});
