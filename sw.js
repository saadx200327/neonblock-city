const CACHE_NAME = 'neonblock-city-v12';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest'];

self.addEventListener('install', function(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
    return cache.addAll(APP_SHELL);
  }));
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(function(cached) {
    return cached || fetch(event.request);
  }));
});
