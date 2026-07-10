const CACHE_NAME = 'neonblock-city-v50';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './vendor/three-0.158.0.min.js',
  './firebase-backend.js',
  './neonblock-runtime-guard.js',
  './neonblock-hardening.js',
  './neonblock-input-polish.js',
  './neonblock-economy-polish.js',
  './neonblock-session-polish.js',
  './neonblock-accessibility-polish.js',
  './neonblock-camera-polish.js',
  './neonblock-objective-polish.js',
  './neonblock-feedback-polish.js',
  './neonblock-wayfinding-polish.js',
  './neonblock-mobile-shell-polish.js',
  './neonblock-qa-polish.js',
  './neonblock-driving-polish.js',
  './neonblock-mission-polish.js',
  './neonblock-property-polish.js',
  './neonblock-performance-polish.js',
  './neonblock-progression-polish.js',
  './neonblock-world-safety-polish.js',
  './neonblock-pwa-polish.js',
  './neonblock-cloud-polish.js',
  './neonblock-onboarding-polish.js',
  './neonblock-garage-polish.js',
  './neonblock-controls-coach-polish.js',
  './neonblock-city-pulse-polish.js',
  './neonblock-hosting-polish.js',
  './neonblock-roadside-polish.js',
  './neonblock-save-doctor-polish.js',
  './neonblock-map-polish.js',
  './neonblock-district-polish.js',
  './neonblock-questlog-polish.js',
  './neonblock-vehicle-health-polish.js',
  './neonblock-emergency-kit-polish.js',
  './neonblock-checkpoint-polish.js',
  './neonblock-civic-polish.js',
  './neonblock-sidejobs-polish.js',
  './neonblock-inventory-polish.js',
  './neonblock-banking-polish.js',
  './neonblock-profile-polish.js',
  './neonblock-city-events-polish.js',
  './neonblock-transit-polish.js',
  './neonblock-delivery-board-polish.js',
  './neonblock-race-polish.js',
  './neonblock-play-settings-polish.js',
  './neonblock-streak-polish.js',
  './neonblock-route-challenges-polish.js',
  './neonblock-daily-bonus-polish.js',
  './neonblock-ride-finder-polish.js',
  './neonblock-property-finder-polish.js',
  './neonblock-crate-finder-polish.js',
  './neonblock-mobile-actions-polish.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});