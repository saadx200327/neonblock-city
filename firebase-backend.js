// Optional Firebase bridge for NeonBlock City.
// This file is safe without Firebase config: the game automatically falls back to localStorage.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE_CONFIG and load Firebase compat SDKs before this module.
(function () {
  'use strict';

  const api = {
    enabled: false,
    async save() { return false; },
    async load() { return null; }
  };

  window.NeonBlockCloud = api;

  const config = window.NEONBLOCK_FIREBASE_CONFIG;
  if (!config || !window.firebase?.initializeApp) return;

  try {
    const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(config);
    const auth = window.firebase.auth ? window.firebase.auth(app) : null;
    const db = window.firebase.firestore ? window.firebase.firestore(app) : null;
    if (!auth || !db) return;

    api.enabled = true;
    api.save = async function save(slot, payload) {
      const user = auth.currentUser || (await auth.signInAnonymously()).user;
      await db.collection('neonblockSaves').doc(user.uid).collection('slots').doc(slot).set({
        payload,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    };
    api.load = async function load(slot) {
      const user = auth.currentUser || (await auth.signInAnonymously()).user;
      const snap = await db.collection('neonblockSaves').doc(user.uid).collection('slots').doc(slot).get();
      return snap.exists ? snap.data().payload : null;
    };
  } catch (error) {
    console.warn('NeonBlock cloud bridge disabled:', error);
  }
})();
