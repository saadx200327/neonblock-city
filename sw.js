// Static PWA service worker for NeonBlock City.
// Keeps install safe on static hosts and avoids external network/dashboard changes.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
