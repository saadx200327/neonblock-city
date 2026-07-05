// Optional cloud-save adapter for NeonBlock City.
// This file is intentionally safe for static hosting: no Firebase config is embedded here.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_CONFIG and load Firebase SDKs before app.js.
(function () {
  'use strict';

  const cloud = {
    enabled: false,
    reason: 'Firebase not configured; using localStorage saves.',
    async save() { return false; },
    async load() { return null; }
  };

  async function init() {
    try {
      const config = window.NEONBLOCK_FIREBASE_CONFIG;
      if (!config || !window.firebase?.initializeApp) {
        window.NeonBlockCloud = cloud;
        return;
      }
      const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(config);
      const auth = window.firebase.auth ? window.firebase.auth() : null;
      const db = window.firebase.firestore ? window.firebase.firestore() : null;
      if (!auth || !db) {
        window.NeonBlockCloud = cloud;
        return;
      }
      const user = auth.currentUser || (await auth.signInAnonymously()).user;
      window.NeonBlockCloud = {
        enabled: true,
        userId: user.uid,
        async save(slot, payload) {
          await db.collection('neonblockSaves').doc(user.uid).collection('slots').doc(slot).set({
            ...payload,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          return true;
        },
        async load(slot) {
          const snap = await db.collection('neonblockSaves').doc(user.uid).collection('slots').doc(slot).get();
          return snap.exists ? snap.data() : null;
        }
      };
    } catch (error) {
      console.warn('NeonBlock cloud save disabled:', error);
      window.NeonBlockCloud = { ...cloud, reason: error.message };
    }
  }

  window.NeonBlockCloud = cloud;
  init();
})();
