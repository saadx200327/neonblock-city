// Optional cloud save bridge for NeonBlock City.
// This file is safe without Firebase config: the game keeps using local saves.
// To enable later, set window.NEONBLOCK_FIREBASE_CONFIG before this module loads
// and include Firebase app/auth/firestore SDKs or adapt these methods to your backend.

(function () {
  'use strict';

  const config = window.NEONBLOCK_FIREBASE_CONFIG;
  const disabledBridge = {
    available: false,
    async save() { return false; },
    async load() { return null; }
  };

  if (!config || !window.firebase) {
    window.NeonBlockCloud = disabledBridge;
    return;
  }

  try {
    const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(config);
    const auth = window.firebase.auth?.(app);
    const db = window.firebase.firestore?.(app);

    if (!auth || !db) {
      window.NeonBlockCloud = disabledBridge;
      return;
    }

    async function uid() {
      if (auth.currentUser) return auth.currentUser.uid;
      const result = await auth.signInAnonymously();
      return result.user.uid;
    }

    window.NeonBlockCloud = {
      available: true,
      async save(slot, payload) {
        const userId = await uid();
        await db.collection('neonblockSaves').doc(userId).collection('slots').doc(slot).set({
          payload,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        return true;
      },
      async load(slot) {
        const userId = await uid();
        const snap = await db.collection('neonblockSaves').doc(userId).collection('slots').doc(slot).get();
        return snap.exists ? snap.data().payload : null;
      }
    };
  } catch (error) {
    console.warn('NeonBlock cloud bridge disabled:', error);
    window.NeonBlockCloud = disabledBridge;
  }
})();
