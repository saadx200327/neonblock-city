// Optional cloud save bridge for NeonBlock City.
// This file is intentionally safe with no bundled Firebase credentials.
// To enable later, define window.NEONBLOCK_FIREBASE_CONFIG before this module loads
// and include Firebase app/firestore SDKs from your own approved setup.

(function () {
  'use strict';

  const api = {
    isReady() {
      return Boolean(window.firebase?.firestore && window.NEONBLOCK_FIREBASE_CONFIG);
    },
    async save(slot, data) {
      if (!api.isReady()) return false;
      const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(window.NEONBLOCK_FIREBASE_CONFIG);
      const db = window.firebase.firestore(app);
      const userKey = localStorage.getItem('neonblock_user_key') || makeUserKey();
      await db.collection('neonblock_saves').doc(userKey).collection('slots').doc(slot).set({ ...data, updatedAt: new Date().toISOString() });
      return true;
    },
    async load(slot) {
      if (!api.isReady()) return null;
      const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(window.NEONBLOCK_FIREBASE_CONFIG);
      const db = window.firebase.firestore(app);
      const userKey = localStorage.getItem('neonblock_user_key') || makeUserKey();
      const snap = await db.collection('neonblock_saves').doc(userKey).collection('slots').doc(slot).get();
      return snap.exists ? snap.data() : null;
    }
  };

  function makeUserKey() {
    const key = 'local-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('neonblock_user_key', key);
    return key;
  }

  window.NeonBlockCloud = api;
})();
