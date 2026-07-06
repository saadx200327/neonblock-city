// Optional cloud save bridge for NeonBlock City.
// This file never requires Firebase. If a site owner later provides window.NEONBLOCK_FIREBASE_CONFIG
// plus Firebase compat SDKs or a custom adapter, the game can use cloud saves; otherwise it safely
// stays on localStorage.
(function () {
  'use strict';

  const localPrefix = 'neonblock:cloud-cache:';

  window.NeonBlockCloud = {
    ready: false,
    mode: 'local-fallback',
    async init() {
      try {
        const config = window.NEONBLOCK_FIREBASE_CONFIG;
        const firebase = window.firebase;
        if (!config || !firebase?.initializeApp || !firebase?.firestore) {
          this.ready = false;
          this.mode = 'local-fallback';
          return false;
        }
        if (!firebase.apps?.length) firebase.initializeApp(config);
        this.db = firebase.firestore();
        this.ready = true;
        this.mode = 'firebase-firestore';
        return true;
      } catch (error) {
        console.warn('[NeonBlockCloud] Firebase disabled:', error);
        this.ready = false;
        this.mode = 'local-fallback';
        return false;
      }
    },
    async save(slot, data) {
      const payload = { ...data, slot, savedAt: new Date().toISOString() };
      localStorage.setItem(localPrefix + slot, JSON.stringify(payload));
      if (!this.ready || !this.db) return payload;
      await this.db.collection('neonblock_saves').doc(slot).set(payload, { merge: true });
      return payload;
    },
    async load(slot) {
      if (this.ready && this.db) {
        const snap = await this.db.collection('neonblock_saves').doc(slot).get();
        if (snap.exists) return snap.data();
      }
      const raw = localStorage.getItem(localPrefix + slot);
      return raw ? JSON.parse(raw) : null;
    }
  };
})();
