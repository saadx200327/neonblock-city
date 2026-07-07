// Optional cloud-save adapter for NeonBlock City.
// This file is intentionally safe by default: without a Firebase SDK/config loaded by the site owner,
// the game continues with localStorage saves only and no external dashboard/settings are changed.
window.NeonBlockCloud = {
  async save(slot, data) {
    if (!window.firebase || !window.NEONBLOCK_FIREBASE_ENABLED) return { ok: false, mode: 'local-only' };
    const db = window.firebase.firestore?.();
    if (!db) return { ok: false, mode: 'no-firestore' };
    await db.collection('neonblockSaves').doc(slot).set({ data, updatedAt: Date.now() }, { merge: true });
    return { ok: true };
  },
  async load(slot) {
    if (!window.firebase || !window.NEONBLOCK_FIREBASE_ENABLED) return null;
    const db = window.firebase.firestore?.();
    if (!db) return null;
    const doc = await db.collection('neonblockSaves').doc(slot).get();
    return doc.exists ? doc.data().data : null;
  }
};
