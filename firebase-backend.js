// Optional cloud-save adapter for NeonBlock City.
// The game works fully offline with localStorage. To enable cloud saves, define
// window.NEONBLOCK_FIREBASE_CONFIG before this script loads and include Firebase
// compat SDKs yourself, or replace this adapter with your project-specific code.
(function () {
  'use strict';
  const config = window.NEONBLOCK_FIREBASE_CONFIG;
  const firebase = window.firebase;
  window.NeonBlockCloud = {
    enabled: false,
    async save() { return null; },
    async load() { return null; }
  };
  if (!config || !firebase?.initializeApp || !firebase?.firestore) return;
  try {
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
    const db = firebase.firestore(app);
    const anonId = localStorage.getItem('neonblock:cloudId') || crypto.randomUUID();
    localStorage.setItem('neonblock:cloudId', anonId);
    window.NeonBlockCloud = {
      enabled: true,
      async save(slot, data) {
        await db.collection('neonblockSaves').doc(anonId).collection('slots').doc(slot).set({ data, updatedAt: Date.now() });
      },
      async load(slot) {
        const snap = await db.collection('neonblockSaves').doc(anonId).collection('slots').doc(slot).get();
        return snap.exists ? snap.data().data : null;
      }
    };
  } catch (error) {
    console.warn('NeonBlock cloud saves disabled:', error);
  }
})();
