// Optional Firebase bridge.
// This file intentionally does nothing unless a separate page script defines
// window.NEONBLOCK_FIREBASE with initialized app/auth/db helpers.
// Local saves work without Firebase, Netlify settings, or any dashboard changes.

window.NeonBlockCloud = {
  async save(payload) {
    const cfg = window.NEONBLOCK_FIREBASE;
    if (!cfg || !cfg.db || !cfg.userId || !cfg.setDoc || !cfg.doc) {
      throw new Error('Firebase not configured');
    }
    const ref = cfg.doc(cfg.db, 'neonblockSaves', cfg.userId);
    await cfg.setDoc(ref, payload, { merge: true });
    return true;
  },
  async load() {
    const cfg = window.NEONBLOCK_FIREBASE;
    if (!cfg || !cfg.db || !cfg.userId || !cfg.getDoc || !cfg.doc) {
      throw new Error('Firebase not configured');
    }
    const ref = cfg.doc(cfg.db, 'neonblockSaves', cfg.userId);
    const snap = await cfg.getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }
};
