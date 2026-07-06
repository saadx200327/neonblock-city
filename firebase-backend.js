// Optional cloud save bridge for NeonBlock City.
// This file intentionally does not include Firebase credentials or touch any dashboard settings.
// To enable cloud saves later, define window.firebaseApp and Firestore helpers before app.js,
// or replace this adapter with project-specific Firebase initialization in a separate PR.
(function () {
  'use strict';
  const local = {
    async save(slot, payload) {
      localStorage.setItem('neonblock-city-cloud-fallback:' + slot, JSON.stringify(payload));
      return { ok: true, mode: 'local-fallback' };
    },
    async load(slot) {
      const raw = localStorage.getItem('neonblock-city-cloud-fallback:' + slot);
      return raw ? JSON.parse(raw) : null;
    }
  };
  window.NeonCloudSave = window.NeonCloudSave || local;
})();
