const CACHE_PREFIX = 'neonblock-city-';
const CACHE_VERSION = 'v109';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const MAX_RUNTIME_ENTRIES = 96;
const OPTIONAL_PRECACHE_CONCURRENCY = 6;
const OPTIONAL_PRECACHE_RETRIES = 1;
let lastOptionalPrecacheFailures = 0;
let lastOptionalPrecacheRecoveries = 0;
let activationRepairAttempts = 0;
let activationRepairRecoveries = 0;
let activationRepairFailures = 0;
let offlineAssetFallbacks = 0;
let lastOfflineAssetUrl = null;
let navigationFallbacks = 0;
let lastNavigationFallbackStatus = null;
const CORE_ASSETS = [
  './','./index.html','./styles.css','./app.js','./vendor/three-0.158.0.min.js','./firebase-backend.js',
  './neonblock-runtime-guard.js','./neonblock-action-edge-guard.js','./neonblock-input-lifecycle-guard.js',
  './neonblock-webgl-recovery-polish.js','./neonblock-frame-lifecycle-guard.js','./neonblock-viewport-recovery-polish.js',
  './neonblock-startup-recovery-polish.js','./neonblock-editable-input-guard.js','./neonblock-pause-input-guard.js',
  './neonblock-control-release-guard.js','./neonblock-mobile-pointer-guard.js','./neonblock-touch-context-guard.js',
  './neonblock-hardening.js','./neonblock-input-polish.js','./neonblock-economy-polish.js','./neonblock-session-polish.js',
  './neonblock-accessibility-polish.js','./neonblock-camera-polish.js','./neonblock-objective-polish.js',
  './neonblock-feedback-polish.js','./neonblock-wayfinding-polish.js','./neonblock-mobile-shell-polish.js',
  './neonblock-qa-polish.js','./neonblock-driving-polish.js','./neonblock-mission-polish.js',
  './neonblock-mobile-mission-control.js','./neonblock-property-polish.js','./neonblock-property-slot-polish.js',
  './neonblock-performance-polish.js','./neonblock-progression-polish.js','./neonblock-world-safety-polish.js',
  './neonblock-pwa-polish.js','./neonblock-pwa-lifecycle-guard.js','./neonblock-cloud-polish.js','./neonblock-onboarding-polish.js',
  './neonblock-garage-polish.js','./neonblock-garage-data-guard.js','./neonblock-controls-coach-polish.js',
  './neonblock-city-pulse-polish.js','./neonblock-hosting-polish.js','./neonblock-roadside-polish.js',
  './neonblock-save-doctor-polish.js','./neonblock-map-polish.js','./neonblock-district-polish.js',
  './neonblock-questlog-polish.js','./neonblock-vehicle-health-polish.js','./neonblock-vehicle-health-lifecycle-guard.js',
  './neonblock-emergency-kit-polish.js','./neonblock-checkpoint-polish.js','./neonblock-civic-polish.js',
  './neonblock-sidejobs-polish.js','./neonblock-inventory-polish.js','./neonblock-banking-polish.js',
  './neonblock-profile-polish.js','./neonblock-city-events-polish.js','./neonblock-transit-polish.js',
  './neonblock-delivery-board-polish.js','./neonblock-race-polish.js','./neonblock-play-settings-polish.js',
  './neonblock-streak-polish.js','./neonblock-route-challenges-polish.js','./neonblock-daily-bonus-polish.js',
  './neonblock-ride-finder-polish.js','./neonblock-property-finder-polish.js','./neonblock-crate-finder-polish.js',
  './neonblock-mobile-actions-polish.js','./neonblock-mobile-viewport-guard.js','./neonblock-save-resilience-polish.js',
  './neonblock-load-motion-guard.js','./neonblock-vehicle-restore-polish.js','./neonblock-lifecycle-save-polish.js','./manifest.webmanifest','./icon.svg'
];
const REQUIRED_ASSET_COUNT = 5;

async function addOptionalAsset(cache, asset, retries = OPTIONAL_PRECACHE_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await cache.add(asset);
      return attempt;
    } catch (_) {
      if (attempt >= retries) return -1;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  return -1;
}

async function precacheOptionalAssets(cache, assets, concurrency = OPTIONAL_PRECACHE_CONCURRENCY) {
  let cursor = 0;
  let failures = 0;
  let recoveries = 0;
  const workerCount = Math.min(Math.max(1, concurrency), assets.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < assets.length) {
      const asset = assets[cursor++];
      const retryCount = await addOptionalAsset(cache, asset);
      if (retryCount < 0) failures += 1;
      else if (retryCount > 0) recoveries += 1;
    }
  });
  await Promise.all(workers);
  return { failures, recoveries };
}

async function repairMissingCoreAssets(cache) {
  const optionalAssets = CORE_ASSETS.slice(REQUIRED_ASSET_COUNT);
  const checks = await Promise.all(optionalAssets.map(async (asset) => ({ asset, cached: Boolean(await cache.match(asset)) })));
  const missing = checks.filter((entry) => !entry.cached).map((entry) => entry.asset);
  activationRepairAttempts = missing.length;
  activationRepairRecoveries = 0;
  activationRepairFailures = 0;
  if (!missing.length) return;

  const result = await precacheOptionalAssets(cache, missing);
  activationRepairRecoveries = missing.length - result.failures;
  activationRepairFailures = result.failures;
  if (activationRepairRecoveries) console.info(`[NeonBlock SW] Repaired ${activationRepairRecoveries} missing cached asset(s) during activation.`);
  if (activationRepairFailures) console.warn(`[NeonBlock SW] ${activationRepairFailures} cached asset(s) remain unavailable after activation repair.`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(CORE_ASSETS.slice(0, REQUIRED_ASSET_COUNT));
    const result = await precacheOptionalAssets(cache, CORE_ASSETS.slice(REQUIRED_ASSET_COUNT));
    lastOptionalPrecacheFailures = result.failures;
    lastOptionalPrecacheRecoveries = result.recoveries;
    if (result.recoveries) console.info(`[NeonBlock SW] Recovered ${result.recoveries} optional precache request(s) after retry.`);
    if (result.failures) console.warn(`[NeonBlock SW] ${result.failures} optional assets were not precached.`);
    await self.skipWaiting();
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    const cache = await caches.open(CACHE_NAME);
    await repairMissingCoreAssets(cache);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (type === 'NEONBLOCK_SW_STATUS') {
    event.source?.postMessage?.({
      type: 'NEONBLOCK_SW_STATUS', cacheName: CACHE_NAME, version: CACHE_VERSION,
      optionalPrecacheConcurrency: OPTIONAL_PRECACHE_CONCURRENCY,
      optionalPrecacheRetries: OPTIONAL_PRECACHE_RETRIES,
      lastOptionalPrecacheFailures,
      lastOptionalPrecacheRecoveries,
      activationRepairAttempts,
      activationRepairRecoveries,
      activationRepairFailures,
      offlineAssetFallbacks,
      lastOfflineAssetUrl,
      navigationFallbacks,
      lastNavigationFallbackStatus
    });
  }
});

async function currentCacheMatch(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}
async function cachedAppShell() {
  return (await currentCacheMatch('./index.html')) || (await currentCacheMatch('./'));
}
async function trimRuntimeCache(cache) {
  const requests = await cache.keys();
  const protectedUrls = new Set(CORE_ASSETS.map((asset) => new URL(asset, self.registration.scope).href));
  const removable = requests.filter((request) => !protectedUrls.has(request.url));
  const overflow = removable.length - MAX_RUNTIME_ENTRIES;
  if (overflow > 0) await Promise.all(removable.slice(0, overflow).map((request) => cache.delete(request)));
}
function isCacheableResponse(response) {
  if (!response || !response.ok || response.type === 'opaque' || response.status === 206) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/\b(?:no-store|private)\b/i.test(cacheControl);
}
function offlineAssetResponse(request) {
  const contentTypes = {
    script: 'application/javascript; charset=utf-8',
    style: 'text/css; charset=utf-8',
    image: 'image/svg+xml',
    manifest: 'application/manifest+json; charset=utf-8'
  };
  offlineAssetFallbacks += 1;
  lastOfflineAssetUrl = request.url;
  return new Response('', {
    status: 503,
    statusText: 'Offline asset unavailable',
    headers: {
      'Content-Type': contentTypes[request.destination] || 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-NeonBlock-Offline': '1'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = (await event.preloadResponse) || (await fetch(request));
        if (isCacheableResponse(response)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {}));
          return response;
        }
        const shell = await cachedAppShell();
        if (response && response.status < 500) return response;
        if (shell) {
          navigationFallbacks += 1;
          lastNavigationFallbackStatus = response?.status || 0;
          return shell;
        }
        if (response) return response;
        return new Response('NeonBlock City is unavailable and its app shell is not cached yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      } catch (_) {
        const shell = await cachedAppShell();
        if (shell) {
          navigationFallbacks += 1;
          lastNavigationFallbackStatus = 0;
          return shell;
        }
        return new Response('NeonBlock City is offline and its app shell is not cached yet.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await currentCacheMatch(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (!isCacheableResponse(response)) return response;
      if (new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
          await cache.put(request, copy);
          await trimRuntimeCache(cache);
        }).catch(() => {}));
      }
      return response;
    } catch (_) {
      const lateCached = await currentCacheMatch(request);
      if (lateCached) return lateCached;
      if (new URL(request.url).origin === self.location.origin) return offlineAssetResponse(request);
      throw _;
    }
  })());
});
