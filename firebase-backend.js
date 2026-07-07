// Optional Firebase/cloud-save adapter.
// This file is safe for static hosting: it does not require Firebase config and does not touch dashboards.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_ADAPTER with async save/load methods before app.js runs.

(() => {
  'use strict';

  const adapter = window.NEONBLOCK_FIREBASE_ADAPTER;

  window.NeonBlockCloudSave = {
    async save(slot, payload) {
      if (!adapter || typeof adapter.save !== 'function') {
        throw new Error('No cloud adapter configured');
      }
      return adapter.save(slot, payload);
    },
    async load(slot) {
      if (!adapter || typeof adapter.load !== 'function') {
        throw new Error('No cloud adapter configured');
      }
      return adapter.load(slot);
    }
  };
})();
