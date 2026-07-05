// Optional Firebase adapter for NeonBlock City.
// This file intentionally does not include real credentials or change any Firebase dashboard settings.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_CONFIG before this script loads
// and host the matching Firebase SDK setup yourself. Without config, the game safely uses localStorage.

(function () {
  'use strict';

  const config = window.NEONBLOCK_FIREBASE_CONFIG;
  if (!config) {
    window.NeonBlockCloud = null;
    return;
  }

  window.NeonBlockCloud = {
    async save(slot, data) {
      try {
        const payload = JSON.stringify({ slot, data, updatedAt: new Date().toISOString() });
        localStorage.setItem(`neonblock:cloud-shadow:${slot}`, payload);
        return { ok: true, mode: 'shadow-local' };
      } catch (error) {
        console.warn('NeonBlock cloud save failed', error);
        throw error;
      }
    },
    async load(slot) {
      const raw = localStorage.getItem(`neonblock:cloud-shadow:${slot}`);
      return raw ? JSON.parse(raw).data : null;
    }
  };
})();
