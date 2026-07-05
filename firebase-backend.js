// Optional Firebase cloud-save bridge for NeonBlock City.
// This file is safe without Firebase dashboard setup: it falls back to local-only play.
// To enable later, define window.NEONBLOCK_FIREBASE_CONFIG before this module loads
// and make sure Firebase Web SDK module imports are allowed by your hosting setup.

const config = window.NEONBLOCK_FIREBASE_CONFIG || null;

window.NeonBlockCloud = {
  enabled: false,
  async save() {
    return false;
  },
  async load() {
    return null;
  }
};

if (config && typeof config === 'object') {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const app = appModule.initializeApp(config);
    const db = firestoreModule.getFirestore(app);
    const playerId = localStorage.getItem('neonblock:playerId') || crypto.randomUUID();
    localStorage.setItem('neonblock:playerId', playerId);

    window.NeonBlockCloud = {
      enabled: true,
      async save(slot, data) {
        await firestoreModule.setDoc(
          firestoreModule.doc(db, 'neonblockSaves', playerId, 'slots', slot),
          { ...data, updatedAt: new Date().toISOString() },
          { merge: true }
        );
        return true;
      },
      async load(slot) {
        const snap = await firestoreModule.getDoc(firestoreModule.doc(db, 'neonblockSaves', playerId, 'slots', slot));
        return snap.exists() ? snap.data() : null;
      }
    };
  } catch (error) {
    console.warn('NeonBlock Firebase cloud saves unavailable; continuing offline.', error);
  }
}
