// Optional NeonBlock City cloud-save bridge.
// This file intentionally does not include Firebase credentials and does not contact Firebase by itself.
// To enable cloud saves, define window.NeonBlockFirebaseAdapter with async save(slot, payload) and load(slot) before app.js runs.
(function () {
  'use strict';
  const adapter = window.NeonBlockFirebaseAdapter;
  window.NeonBlockCloud = {
    async save(slot, payload) {
      if (!adapter || typeof adapter.save !== 'function') return null;
      return adapter.save(slot, payload);
    },
    async load(slot) {
      if (!adapter || typeof adapter.load !== 'function') return null;
      return adapter.load(slot);
    }
  };
})();
