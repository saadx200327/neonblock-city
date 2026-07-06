// Optional cloud-save bridge for NeonBlock City.
// This file intentionally does not contain Firebase project keys or touch dashboard settings.
// To enable cloud saves, a host page can provide window.NEONBLOCK_FIREBASE with an initialized
// Firebase app/db/auth implementation. Without that, the game safely falls back to localStorage.

(function () {
  const localPrefix = 'neonblock:cloud-fallback:';

  async function fallbackSave(slot, payload) {
    localStorage.setItem(localPrefix + slot, JSON.stringify({ savedAt: new Date().toISOString(), payload }));
    return { mode: 'local-fallback' };
  }

  async function fallbackLoad(slot) {
    const raw = localStorage.getItem(localPrefix + slot);
    if (!raw) return null;
    try { return JSON.parse(raw).payload || null; } catch { return null; }
  }

  window.NeonCloudSave = {
    enabled: false,
    async save(slot, payload) {
      const bridge = window.NEONBLOCK_FIREBASE;
      if (!bridge || typeof bridge.saveGame !== 'function') return fallbackSave(slot, payload);
      window.NeonCloudSave.enabled = true;
      return bridge.saveGame(slot, payload);
    },
    async load(slot) {
      const bridge = window.NEONBLOCK_FIREBASE;
      if (!bridge || typeof bridge.loadGame !== 'function') return fallbackLoad(slot);
      window.NeonCloudSave.enabled = true;
      return bridge.loadGame(slot);
    }
  };
})();
