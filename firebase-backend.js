// Optional NeonBlock City cloud-save bridge.
// This file intentionally does not initialize Firebase by itself and does not contain project secrets.
// To enable cloud saves later, the page owner may expose window.firebaseApp, window.firebaseAuth,
// and window.firebaseDb from their own Firebase setup. Without that, the game safely uses localStorage.

(() => {
  'use strict';

  const bridge = {
    enabled: false,
    async save() { return false; },
    async load() { return null; }
  };

  async function tryEnable() {
    try {
      if (!window.firebaseDb || !window.firebaseAuth?.currentUser || !window.firebase?.firestore) return;
      const user = window.firebaseAuth.currentUser;
      const db = window.firebaseDb;
      bridge.enabled = true;
      bridge.save = async (slot, data) => {
        await db.collection('neonblockSaves').doc(user.uid).collection('slots').doc(slot).set({
          ...data,
          updatedAt: Date.now()
        }, { merge: true });
        return true;
      };
      bridge.load = async (slot) => {
        const doc = await db.collection('neonblockSaves').doc(user.uid).collection('slots').doc(slot).get();
        return doc.exists ? doc.data() : null;
      };
    } catch (error) {
      bridge.enabled = false;
      console.warn('[NeonBlock City] Firebase bridge disabled:', error);
    }
  }

  window.NeonBlockCloud = bridge;
  window.addEventListener('load', tryEnable, { once: true });
})();
