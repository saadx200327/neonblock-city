// Optional Firebase bridge for NeonBlock City.
// This file intentionally does not include project credentials or touch Firebase settings.
// If a page defines window.firebase + window.NEONBLOCK_FIREBASE_CONFIG later, this bridge can be expanded.
// Otherwise it safely falls back to localStorage so the static game always works.

(function () {
  'use strict';
  const prefix = 'neonblock-cloud-shadow-';

  window.NBCCloud = {
    async save(slot, payload) {
      localStorage.setItem(prefix + slot, JSON.stringify(payload));
      return { ok: true, mode: 'localStorage-shadow' };
    },
    async load(slot) {
      const raw = localStorage.getItem(prefix + slot);
      return raw ? JSON.parse(raw) : null;
    },
    async status() {
      return { available: true, mode: 'localStorage-shadow', firebaseConfigured: false };
    }
  };
})();
