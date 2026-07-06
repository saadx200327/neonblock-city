// Optional cloud-save bridge. This file is intentionally safe without Firebase config.
// To enable cloud saves, define window.NEONBLOCK_FIREBASE_CONFIG before this module loads
// and include Firebase web SDK modules in a future integration. Until then the game uses localStorage.

window.NeonBlockCloud = window.NeonBlockCloud || {
  enabled: false,
  async save() {
    return null;
  },
  async load() {
    return null;
  }
};

window.dispatchEvent(new CustomEvent('neonblock-cloud-ready', { detail: { enabled: false, mode: 'localStorage-fallback' } }));
