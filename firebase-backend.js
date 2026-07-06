// Optional Firebase bridge for NeonBlock City.
// The game works fully offline with localStorage. To enable cloud saves,
// define window.NEONBLOCK_FIREBASE_CONFIG before this module loads and add Firebase SDK imports if desired.
(function () {
  'use strict';
  const memory = new Map();
  window.NeonBlockCloud = {
    async save(slot, data) {
      memory.set(slot, JSON.stringify(data));
      return { ok: true, mode: 'local-fallback' };
    },
    async load(slot) {
      const raw = memory.get(slot);
      return raw ? JSON.parse(raw) : null;
    }
  };
})();
