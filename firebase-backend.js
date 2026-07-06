// Optional Firebase bridge.
// This file intentionally does not contain project credentials and does not change external Firebase settings.
// To enable cloud saves, a hosting page may set window.NeonBlockFirebase with initialized
// Firebase app/auth/firestore helpers before app.js runs. Without that, the game uses localStorage.
(function () {
  'use strict';
  const cfg = window.NeonBlockFirebase;
  if (!cfg || !cfg.firestore || !cfg.auth) return;

  window.NeonBlockCloud = {
    async save(slot, data) {
      const user = cfg.auth.currentUser;
      if (!user) return null;
      const path = ['users', user.uid, 'neonblockSaves', slot];
      if (typeof cfg.setDoc === 'function' && typeof cfg.doc === 'function') {
        return cfg.setDoc(cfg.doc(cfg.firestore, ...path), { data, updatedAt: Date.now() }, { merge: true });
      }
      return null;
    },
    async load(slot) {
      const user = cfg.auth.currentUser;
      if (!user) return null;
      const path = ['users', user.uid, 'neonblockSaves', slot];
      if (typeof cfg.getDoc === 'function' && typeof cfg.doc === 'function') {
        const snap = await cfg.getDoc(cfg.doc(cfg.firestore, ...path));
        return snap && snap.exists && snap.exists() ? snap.data().data : null;
      }
      return null;
    }
  };
})();
