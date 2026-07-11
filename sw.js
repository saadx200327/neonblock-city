const CACHE_PREFIX = 'neonblock-city-';
const CACHE_NAME = `${CACHE_PREFIX}v74`;
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './vendor/three-0.158.0.min.js',
  './firebase-backend.js',
  './neonblock-runtime-guard.js',
  './neonblock-action-edge-guard.js',
  './neonblock-input-lifecycle-guard.js',
  './neonblock-webgl-recovery-polish.js',
  './neonblock-frame-lifecycle-guard.js',
  './neonblock-viewport-recovery-polish.js',
  './neonblock-startup-recovery-polish.js',
  './neonblock-editable-input-guard.js',
  './neonblock-pause-input-guard.js',
  './neonblock-mobile-pointer-guard.js',
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
  './neonblock-save-resilience-polish.js',
  './neonblock-vehicle-restore-polish.js',
  './neonblock-lifecycle-save-polish.js',
  './manifest.webmanifest',
  './icon.svg'
];

const REQUIRED_ASSET_COUNT = 5;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS.slice(0, REQUIRED_ASSET_COUNT));
      const results = await Promise.allSettled(
        CORE_ASSETS.slice(REQUIRED_ASSET_COUNT).map((asset) => cache.add(asset))
      );
      const failures = results.filter((result) => result.status === 'rejected').length;
      if (failures) console.warn(`[NeonBlock SW] ${failures} optional assets were not precached.`);
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );

    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();
  })());
});

async function cachedAppShell() {
  return (await caches.match('./index.html')) || (await caches.match('./'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = (await event.preloadResponse) || (await fetch(request));
        if (response && response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put('./index.html', copy))
              .catch(() => {})
          );
          return response;
        }

        return (await cachedAppShell()) || response;
      } catch (error) {
        return (await cachedAppShell()) || new Response(
          'NeonBlock City is offline and its app shell is not cached yet.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || !response.ok || response.type === 'opaque') return response;

        const requestUrl = new URL(request.url);
        if (requestUrl.origin === self.location.origin) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      });
    })
  );
});
