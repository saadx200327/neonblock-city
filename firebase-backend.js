// Optional Firebase bridge. This file intentionally does not include project keys.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_ADAPTER with save/load methods
// from your own Firebase initialization code. Without it, the game safely uses localStorage only.
(function () {
  'use strict';
  const adapter = window.NEONBLOCK_FIREBASE_ADAPTER;
  window.NeonBlockCloudSave = {
    available: Boolean(adapter && typeof adapter.save === 'function'),
    async save(slot, data) {
      if (!this.available) return { skipped: true, reason: 'No Firebase adapter configured' };
      return adapter.save(slot, data);
    },
    async load(slot) {
      if (!adapter || typeof adapter.load !== 'function') return null;
      return adapter.load(slot);
    }
  };
})();
