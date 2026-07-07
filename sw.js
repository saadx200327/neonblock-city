// Minimal service worker for installability. It intentionally avoids external network or dashboard behavior.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
