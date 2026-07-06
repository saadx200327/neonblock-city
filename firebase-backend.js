// Optional Firebase bridge for NeonBlock City.
// This file is safe without configuration: the game falls back to localStorage.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_CONFIG before this module loads
// and include Firebase web SDK modules from your own static bundle/import map.

const config = window.NEONBLOCK_FIREBASE_CONFIG;

function installOfflineBridge(reason = 'offline') {
  window.neonblockCloud = {
    mode: 'offline',
    reason,
    async save() { return Promise.reject(new Error(`Firebase cloud saves unavailable: ${reason}`)); },
    async load() { return Promise.reject(new Error(`Firebase cloud saves unavailable: ${reason}`)); }
  };
}

if (!config) {
  installOfflineBridge('missing config');
} else {
  // Placeholder bridge keeps Firebase optional and avoids breaking Netlify/static preview builds.
  // A future backend pass can wire initializeApp/getFirestore here without touching dashboard settings.
  installOfflineBridge('SDK not bundled');
}
