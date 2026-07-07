// Optional Firebase bridge for NeonBlock City.
// Static/local play works without Firebase. To enable cloud saves, define
// window.NEONBLOCK_FIREBASE_CONFIG before this module loads and include Firebase SDKs externally.
(function () {
  'use strict';
  const cfg = window.NEONBLOCK_FIREBASE_CONFIG;
  const localPrefix = 'neonblock_city_cloud_shadow_';

  async function save(slot, payload) {
    const body = { ...payload, savedAt: new Date().toISOString(), slot };
    localStorage.setItem(localPrefix + slot, JSON.stringify(body));

    if (!cfg || !window.firebase?.initializeApp) return body;
    const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(cfg);
    const auth = window.firebase.auth ? window.firebase.auth(app) : null;
    if (auth && !auth.currentUser) await auth.signInAnonymously();
    const uid = auth?.currentUser?.uid || 'local-player';
    await window.firebase.firestore(app).collection('neonblockSaves').doc(uid).collection('slots').doc(slot).set(body, { merge: true });
    return body;
  }

  async function load(slot) {
    if (cfg && window.firebase?.initializeApp) {
      const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(cfg);
      const auth = window.firebase.auth ? window.firebase.auth(app) : null;
      if (auth && !auth.currentUser) await auth.signInAnonymously();
      const uid = auth?.currentUser?.uid || 'local-player';
      const snap = await window.firebase.firestore(app).collection('neonblockSaves').doc(uid).collection('slots').doc(slot).get();
      if (snap.exists) return snap.data();
    }
    const raw = localStorage.getItem(localPrefix + slot);
    return raw ? JSON.parse(raw) : null;
  }

  window.NeonBlockCloud = { save, load, enabled: Boolean(cfg) };
})();
