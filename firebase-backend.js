// Optional cloud-save bridge.
// This file intentionally does not contain Firebase keys or initialize any external project.
// To enable cloud saves later, define window.NeonBlockFirebaseAdapter with async save(slot,data) and load(slot).
(function () {
  'use strict';
  const adapter = window.NeonBlockFirebaseAdapter;
  window.NeonBlockCloud = {
    async save(slot, data) {
      if (!adapter || typeof adapter.save !== 'function') return false;
      await adapter.save(slot, data);
      return true;
    },
    async load(slot) {
      if (!adapter || typeof adapter.load !== 'function') return null;
      return adapter.load(slot);
    }
  };
})();
