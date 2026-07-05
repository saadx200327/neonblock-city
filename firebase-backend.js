// Optional cloud-save adapter for NeonBlock City.
// This file intentionally does not contain Firebase project credentials.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_ADAPTER
// with async save(slot, data) and load(slot) functions before app.js runs.
(() => {
  'use strict';

  const localFallback = {
    enabled: false,
    async save(slot, data) {
      localStorage.setItem(`nbc_cloud_shadow_${slot}`, JSON.stringify({ ...data, savedAt: Date.now() }));
      return { ok: true, mode: 'local-fallback' };
    },
    async load(slot) {
      const raw = localStorage.getItem(`nbc_cloud_shadow_${slot}`);
      return raw ? JSON.parse(raw) : null;
    }
  };

  const adapter = window.NEONBLOCK_FIREBASE_ADAPTER;
  window.NeonBlockCloud = adapter && typeof adapter.save === 'function'
    ? { enabled: true, save: adapter.save.bind(adapter), load: adapter.load?.bind(adapter) }
    : localFallback;
})();
