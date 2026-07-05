// Optional Firebase bridge for NeonBlock City.
// Static-safe: the game works with localStorage when Firebase is not configured.
// To enable later, define window.NEONBLOCK_FIREBASE with initialized Firebase helpers before this file,
// or replace this shim with real Firebase SDK code. No dashboard or external settings are changed here.
(function () {
  const api = {
    enabled: false,
    async save(slot, data) {
      if (!this.enabled) return { ok: true, mode: 'local-only', slot, data };
      return { ok: true, mode: 'cloud', slot, data };
    },
    async load(slot) {
      if (!this.enabled) return null;
      return null;
    }
  };

  try {
    const custom = window.NEONBLOCK_FIREBASE;
    if (custom && typeof custom.save === 'function' && typeof custom.load === 'function') {
      window.NeonBlockCloud = {
        enabled: true,
        save: custom.save.bind(custom),
        load: custom.load.bind(custom)
      };
      return;
    }
  } catch (error) {
    console.warn('NeonBlock Firebase bridge disabled:', error);
  }

  window.NeonBlockCloud = api;
})();
