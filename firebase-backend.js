// Optional cloud-save bridge.
// This static game works fully offline with localStorage. To enable Firebase later,
// define window.NEONBLOCK_FIREBASE with initialized save/load functions before app.js,
// or replace this adapter without changing app.js.
(function () {
  'use strict';

  const localOnly = {
    async save(slot, data) {
      localStorage.setItem(`neonblock:cloud:${slot}`, JSON.stringify({ ...data, savedAt: Date.now() }));
      return { ok: true, provider: 'local-fallback' };
    },
    async load(slot) {
      const raw = localStorage.getItem(`neonblock:cloud:${slot}`);
      return raw ? JSON.parse(raw) : null;
    }
  };

  window.NeonBlockCloud = window.NEONBLOCK_FIREBASE || localOnly;
})();
