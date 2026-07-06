// Optional Firebase/cloud-save bridge.
// The game works offline by default. To enable real Firebase later, load Firebase SDKs
// and expose window.NeonBlockCloud.save/load with the same small API below.
(() => {
  'use strict';
  const KEY = 'neonblock-city:cloud-mirror:';
  window.NeonBlockCloud = window.NeonBlockCloud || {
    async save(slot, payload) {
      localStorage.setItem(KEY + slot, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
      return { ok: true, mode: 'local-fallback' };
    },
    async load(slot) {
      const raw = localStorage.getItem(KEY + slot);
      return raw ? JSON.parse(raw) : null;
    }
  };
})();
