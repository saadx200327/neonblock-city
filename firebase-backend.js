// Optional cloud-save bridge for NeonBlock City.
// This file intentionally does not include Firebase project secrets or dashboard changes.
// To enable cloud saves, define window.NEONBLOCK_FIREBASE_CONFIG before this module loads.

const fallback = {
  available: false,
  async save(slot, data) {
    localStorage.setItem('nb_cloud_fallback_' + slot, JSON.stringify(data));
    return { ok: true, mode: 'local-fallback' };
  },
  async load(slot) {
    const raw = localStorage.getItem('nb_cloud_fallback_' + slot);
    return raw ? JSON.parse(raw) : null;
  }
};

window.NeonCloud = fallback;

(async function initFirebaseBridge() {
  const config = window.NEONBLOCK_FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.projectId) return;

  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');

    const app = appMod.initializeApp(config);
    const auth = authMod.getAuth(app);
    const db = dbMod.getFirestore(app);
    const credential = await authMod.signInAnonymously(auth);

    window.NeonCloud = {
      available: true,
      async save(slot, data) {
        const uid = credential.user.uid;
        await dbMod.setDoc(dbMod.doc(db, 'neonblockSaves', uid, 'slots', slot), {
          data,
          updatedAt: dbMod.serverTimestamp()
        }, { merge: true });
        return { ok: true, mode: 'firebase' };
      },
      async load(slot) {
        const uid = credential.user.uid;
        const snap = await dbMod.getDoc(dbMod.doc(db, 'neonblockSaves', uid, 'slots', slot));
        return snap.exists() ? snap.data().data : null;
      }
    };
  } catch (error) {
    console.warn('NeonCloud Firebase bridge unavailable; using local fallback.', error);
    window.NeonCloud = fallback;
  }
})();
