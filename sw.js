/* Ayudante de instalación de la app.
   Guarda la app en el teléfono para que abra rápido y funcione sin internet.

   Tres cosas que antes estaban mal y que aquí se corrigen:

   1. Cuando una petición fallaba, se devolvía la página de la app como
      respuesta a CUALQUIER cosa. Un audio que no cargaba recibía HTML, el
      reproductor tronaba, y la app concluía que la grabación no existía.
      Ahora la página solo se devuelve cuando lo que se pedía era una página.

   2. El caché es de todo el dominio, no de esta app: al activarse se
      borraban los cachés de las otras apps (dinero, English For All) y las
      otras borraban el de esta. Ahora solo se toca lo que empieza con PREFIJO.

   3. Se guardaba todo lo que respondiera 200, incluidos los PDF de
      presentaciones de 3 MB. En un teléfono eso llena el almacén, el
      navegador empieza a desalojar y la app se queda sin su propio arranque.
      Ahora hay lista negra por ruta y tope de tamaño.                        */

var PREFIJO = 'hcm-ingles-iv-';
var CACHE   = PREFIJO + 'v3';
var BASE    = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
var TOPE    = 1500000;          // 1.5 MB: más grande que esto no se guarda
var NUNCA   = /\/presentaciones\/|\.pdf($|\?)/i;   // se ven en línea, no se guardan

function guardar(req, resp) {
  if (!resp || resp.status !== 200 || resp.type !== 'basic') return;
  if (NUNCA.test(req.url)) return;
  var largo = parseInt(resp.headers.get('content-length') || '0', 10);
  if (largo > TOPE) return;
  var copia = resp.clone();
  caches.open(CACHE)
    .then(function (c) { return c.put(req, copia); })
    .catch(function () {});     // sin cuota: se sigue sirviendo en vivo
}

function esPagina(req) {
  if (req.mode === 'navigate') return true;
  var d = req.destination;
  return d === 'document' || d === 'iframe';
}

function sinRed() {
  return new Response('', { status: 504, statusText: 'Sin conexion' });
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(BASE.map(function (u) {
      return c.add(u).catch(function () {});
    }));
  }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) {
      // solo los cachés viejos de ESTA app
      return (k !== CACHE && k.indexOf(PREFIJO) === 0) ? caches.delete(k) : null;
    }));
  }).then(function () { return self.clients.claim(); }).catch(function () {}));
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;                  // POST: nunca al caché
  var u;
  try { u = new URL(r.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;   // voz, IA y datos: en vivo

  // La página misma se pide siempre fresca, para que el cadete reciba la
  // versión nueva en cuanto abra con internet.
  if (esPagina(r)) {
    e.respondWith(
      fetch(r.url, { cache: 'reload', credentials: 'same-origin' })
        .then(function (resp) { guardar(r, resp); return resp; })
        .catch(function () {
          return caches.match(r).then(function (hit) {
            return hit || caches.match('./index.html').then(function (h2) {
              return h2 || sinRed();
            });
          });
        })
    );
    return;
  }

  // Audio: primero lo guardado. Así una frase que ya sonó una vez suena al
  // instante y sin internet, y no se vuelve a pedir al servidor de voz.
  if (/\.(webm|mp3|m4a|ogg|wav)($|\?)/i.test(u.pathname)) {
    e.respondWith(
      caches.match(r).then(function (hit) {
        if (hit) return hit;
        return fetch(r).then(function (resp) { guardar(r, resp); return resp; })
                       .catch(function () { return sinRed(); });
      })
    );
    return;
  }

  // Todo lo demás: red primero, caché como respaldo. Nunca la página.
  e.respondWith(
    fetch(r).then(function (resp) { guardar(r, resp); return resp; })
      .catch(function () {
        return caches.match(r).then(function (hit) { return hit || sinRed(); });
      })
  );
});
