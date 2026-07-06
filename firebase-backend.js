// Optional cloud-save bridge. This file does not configure Firebase by itself and is safe for static hosting.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE before this module loads with:
// { app, auth, firestore, userId } where firestore exposes doc/getDoc/setDoc from your Firebase SDK wrapper.
(function () {
  'use strict';
  const cfg = window.NEONBLOCK_FIREBASE;
  window.NeonBlockCloud = {
    enabled: Boolean(cfg && cfg.firestore && cfg.userId),
    async save(slot, payload) {
      if (!this.enabled) return false;
      const { firestore, userId } = cfg;
      if (typeof firestore.setDoc !== 'function' || typeof firestore.doc !== 'function') return false;
      await firestore.setDoc(firestore.doc(`neonblockCity/${userId}/saves/${slot}`), payload, { merge: true });
      return true;
    },
    async load(slot) {
      if (!this.enabled) return null;
      const { firestore, userId } = cfg;
      if (typeof firestore.getDoc !== 'function' || typeof firestore.doc !== 'function') return null;
      const snap = await firestore.getDoc(firestore.doc(`neonblockCity/${userId}/saves/${slot}`));
      return snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
    }
  };
})();
