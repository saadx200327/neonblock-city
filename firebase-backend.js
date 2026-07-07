// Optional Firebase/cloud-save adapter.
// Static-safe by default: no Firebase config is required and no dashboard settings are touched.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_ADAPTER with async save/load methods before app.js runs.

(() => {
  'use strict';

  function getAdapter() {
    return window.NEONBLOCK_FIREBASE_ADAPTER || null;
  }

  window.NeonBlockCloudSave = {
    enabled: () => {
      const adapter = getAdapter();
      return !!(adapter && typeof adapter.save === 'function' && typeof adapter.load === 'function');
    },
    async save(slot, payload) {
      const adapter = getAdapter();
      if (!adapter || typeof adapter.save !== 'function') return { skipped: true, reason: 'No cloud adapter configured' };
      return adapter.save(slot, payload);
    },
    async load(slot) {
      const adapter = getAdapter();
      if (!adapter || typeof adapter.load !== 'function') return null;
      return adapter.load(slot);
    }
  };
})();
