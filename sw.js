/* ============================================================
   OficiosAR — Service Worker (PWA instalable + uso offline)
   Estrategias:
   1. App shell (navegaciones): red primero, respaldo desde caché.
   2. Datos del Google Sheet (CSV): red primero; la última copia
      queda guardada para que el directorio abra sin internet.
   3. Recursos externos (Tailwind CDN, Google Fonts): caché
      primero con actualización en segundo plano (SWR).
   ============================================================ */

const APP_SHELL_CACHE = 'oficiosar-shell-v3';
const DATA_CACHE = 'oficiosar-data-v3';
const RUNTIME_CACHE = 'oficiosar-runtime-v3';
const IMAGE_CACHE = 'oficiosar-images-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Fotos de las fichas demo y sponsors: se guardan una por una para que
// el install no falle si alguna imagen todavía no está disponible.
const IMAGE_URLS = [
  './img/demo-gasista.jpg',
  './img/demo-plomero.jpg',
  './img/demo-electricista.jpg',
  './img/demo-taller-rossi.jpg',
  './img/demo-gimnasio.jpg',
  './img/demo-tecnico-aire.jpg',
  './img/demo-pintora.jpg',
  './img/demo-cerrajero.jpg',
  './img/demo-gomeria.jpg',
  './img/demo-ferreteria.jpg',
  './img/demo-veterinaria.jpg',
  './img/demo-corralon.jpg',
  './img/demo-fletes.jpg',
  './img/demo-pelu-canina.jpg',
  './img/demo-cuidado-mayores.jpg',
  './img/demo-autoelectrica.jpg',
  './img/sponsor-ferreteria-tropezon.jpg',
  './img/sponsor-sanitarios-norte.jpg',
  './img/sponsor-corralon-belgrano.jpg',
  './img/sponsor-electricidad-si.jpg',
  './img/sponsor-bulonera.jpg',
  './img/sponsor-pintureria-rex.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
      caches.open(IMAGE_CACHE).then((cache) =>
        Promise.all(IMAGE_URLS.map((url) => cache.add(url).catch(() => {})))
      )
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => ![APP_SHELL_CACHE, DATA_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  // 1) Navegaciones dentro de la app: red primero + respaldo offline
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // 2) Contador de visitas: SIEMPRE por red (nunca cachear el número)
  if (url.hostname === 'abacus.jasoncameron.dev' || url.hostname === 'hits.sh') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3) Datos del directorio (Google Sheets CSV): red primero, caché de respaldo
  if (url.hostname === 'docs.google.com') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error()))
    );
    return;
  }

  // 4) Fotos propias (img/): caché primero con respaldo de red
  if (url.origin === self.location.origin && url.pathname.includes('/img/')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(IMAGE_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // 5) Resto de recursos (CDNs, fuentes): caché primero + revalidación en segundo plano
  event.respondWith(
    caches.match(request).then((hit) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => hit);
      return hit || networkFetch;
    })
  );
});
