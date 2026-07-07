// Optional Firebase bridge for NeonBlock City.
// This file intentionally does not contain Firebase credentials and does not touch any dashboard settings.
// To enable cloud saves, host a Firebase app script before app.js that exposes:
// window.firebaseApp, window.firebaseFirestore, and an authenticated window.firebaseUserId.

const localOnly = {
  async save() { return null; },
  async load() { return null; }
};

async function makeAdapter() {
  const db = window.firebaseFirestore;
  const userId = window.firebaseUserId;
  if (!db || !userId || !window.firebase?.firestore) return localOnly;
  const firestore = window.firebase.firestore();
  return {
    async save(slot, payload) {
      await firestore.collection('neonblockSaves').doc(String(userId)).collection('slots').doc(slot).set({
        payload,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return true;
    },
    async load(slot) {
      const snap = await firestore.collection('neonblockSaves').doc(String(userId)).collection('slots').doc(slot).get();
      return snap.exists ? snap.data().payload : null;
    }
  };
}

window.NeonBlockCloudSave = await makeAdapter();
