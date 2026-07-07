// Optional cloud save bridge for NeonBlock City.
// The static game works fully with localStorage when Firebase is not configured.
// To enable cloud saves, provide a separate Firebase setup that exposes
// window.NEONBLOCK_FIREBASE = { db, auth, doc, getDoc, setDoc } from Firebase v9+.
(() => {
  'use strict';

  const firebase = window.NEONBLOCK_FIREBASE;
  const localFallback = {
    async save(slot, data) {
      localStorage.setItem(`neonblock:cloud-mirror:${slot}`, JSON.stringify(data));
      return { ok: true, mode: 'local-mirror' };
    },
    async load(slot) {
      const raw = localStorage.getItem(`neonblock:cloud-mirror:${slot}`);
      return raw ? JSON.parse(raw) : null;
    }
  };

  if (!firebase || !firebase.db || !firebase.doc || !firebase.getDoc || !firebase.setDoc) {
    window.NeonBlockCloud = localFallback;
    return;
  }

  function uid() {
    return firebase.auth?.currentUser?.uid || 'guest-static-player';
  }

  window.NeonBlockCloud = {
    async save(slot, data) {
      const ref = firebase.doc(firebase.db, 'neonblockSaves', uid(), 'slots', slot);
      await firebase.setDoc(ref, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true, mode: 'firebase' };
    },
    async load(slot) {
      const ref = firebase.doc(firebase.db, 'neonblockSaves', uid(), 'slots', slot);
      const snap = await firebase.getDoc(ref);
      return snap.exists() ? snap.data() : null;
    }
  };
})();
