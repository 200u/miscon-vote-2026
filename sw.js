const CACHE_NAME = 'm26-offline-v1';
const ASSETS = [
  './',
  './index.html',
  './vote.html',
  './admin.html',
  './result.html',
  './aggregate.html',
  './shared.js',
  './qrcode-v3.js',
  './manifest.webmanifest',
  './images/akane.jpg',
  './images/hamamero.jpg',
  './images/reina.jpg',
  './images/sorara.jpg',
  './images/yusepi.jpg',
  './images/ruta.jpg',
  './images/hina.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(
      ASSETS.map(asset => cache.add(asset).catch(() => undefined))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => cached)));
});
