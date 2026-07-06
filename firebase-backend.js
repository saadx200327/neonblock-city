// Optional Firebase/cloud-save bridge.
// This static game works offline with localStorage by default. If a page owner later
// provides window.NEONBLOCK_FIREBASE_CONFIG and loads Firebase SDK modules, this file
// can be expanded without changing app.js. No external dashboard settings are changed here.
(function () {
  'use strict';

  const memory = new Map();
  const keyFor = slot => `neonblock:${slot}`;

  window.NeonBlockCloud = {
    async save(slot, data) {
      memory.set(slot, data);
      try {
        localStorage.setItem(keyFor(slot), JSON.stringify(data));
      } catch (error) {
        console.warn('Local save failed', error);
      }
      return { ok: true, mode: 'local-fallback' };
    },

    async load(slot) {
      if (memory.has(slot)) return memory.get(slot);
      const raw = localStorage.getItem(keyFor(slot));
      return raw ? JSON.parse(raw) : null;
    },

    mode: 'local-fallback'
  };
})();
