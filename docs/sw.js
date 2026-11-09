// Service worker: la app abre al instante (y sin conexión) con lo último que se descargó.
// Los datos no pasan por aquí: los gestiona Firestore con su propia caché.
// Al publicar cambios en la web, sube la versión para que el iPhone coja los archivos nuevos.
const VERSION = 'cazachollos-v2';
const APP = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/datos.js', 'js/util.js', 'js/config.js', 'js/defectos.js', 'js/ajustes.js', 'js/estado.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // SDK de Firebase (versión fija): de la caché si está
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(e.request).then((r) => r ?? fetch(e.request).then((resp) => guardar(e.request, resp))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Archivos de la app: red primero (para ver cambios), caché si no hay conexión
  e.respondWith(
    fetch(e.request)
      .then((resp) => guardar(e.request, resp))
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match('index.html'))),
  );
});

function guardar(req, resp) {
  if (resp.ok) {
    const copia = resp.clone();
    caches.open(VERSION).then((c) => c.put(req, copia));
  }
  return resp;
}
