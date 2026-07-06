// Optional Firebase bridge for NeonBlock City.
// This file never requires Firebase. If a host page later defines window.firebase
// with auth/firestore helpers, saves can be adapted here without breaking static play.
(() => {
  'use strict';
  const PREFIX = 'neonblock-city-cloud-fallback-';
  window.NeonCloudSave = {
    mode: 'local',
    async save(slot, payload) {
      localStorage.setItem(PREFIX + slot, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
      return { ok: true, mode: 'local' };
    },
    async load(slot) {
      const raw = localStorage.getItem(PREFIX + slot);
      return raw ? JSON.parse(raw) : null;
    }
  };
})();
