// Optional cloud save adapter.
// This file intentionally does not include project secrets or initialize Firebase by itself.
// To enable cloud saves, define window.NEONBLOCK_FIREBASE with initialized auth/db helpers before app.js,
// or replace these no-op methods with Firebase Auth + Firestore calls in your own private branch.
(function () {
  const api = window.NEONBLOCK_FIREBASE;
  window.NeonBlockCloud = {
    async save(slot, data) {
      if (!api || !api.saveGame) return { ok: false, reason: 'firebase-not-configured' };
      return api.saveGame(slot, data);
    },
    async load(slot) {
      if (!api || !api.loadGame) return null;
      return api.loadGame(slot);
    }
  };
})();
