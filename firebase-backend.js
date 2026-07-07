// Optional Firebase bridge for NeonBlock City.
// The game works without Firebase. To enable cloud saves, define a compatible Firebase app
// in your own site code before this module runs, or replace the placeholders below locally.

const firebaseConfig = window.NEONBLOCK_FIREBASE_CONFIG || null;

async function bootFirebase() {
  if (!firebaseConfig) return null;
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app = appMod.initializeApp(firebaseConfig);
    const db = dbMod.getFirestore(app);
    const auth = authMod.getAuth(app);
    await authMod.signInAnonymously(auth).catch(() => null);
    const userId = auth.currentUser?.uid || 'local-player';
    return { dbMod, db, userId };
  } catch (error) {
    console.warn('Firebase optional cloud saves unavailable:', error);
    return null;
  }
}

const ready = bootFirebase();

window.NeonBlockCloud = {
  async save(slot, data) {
    const ctx = await ready;
    if (!ctx) return false;
    const ref = ctx.dbMod.doc(ctx.db, 'neonblockSaves', ctx.userId, 'slots', slot);
    await ctx.dbMod.setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
    return true;
  },
  async load(slot) {
    const ctx = await ready;
    if (!ctx) return null;
    const ref = ctx.dbMod.doc(ctx.db, 'neonblockSaves', ctx.userId, 'slots', slot);
    const snap = await ctx.dbMod.getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }
};
