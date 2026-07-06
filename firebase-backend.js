// Optional Firebase bridge for NeonBlock City.
// The game works fully offline with localStorage. To enable cloud saves, define
// window.NEONBLOCK_FIREBASE_CONFIG before this module loads and allow Firestore
// reads/writes for the chosen collection in your own Firebase project.

const config = window.NEONBLOCK_FIREBASE_CONFIG;

if (!config) {
  window.NeonBlockCloud = null;
} else {
  try {
    const [{ initializeApp }, { getFirestore, doc, getDoc, setDoc, serverTimestamp }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
    ]);
    const app = initializeApp(config);
    const db = getFirestore(app);
    const deviceId = localStorage.getItem('neonblock-city:device') || crypto.randomUUID();
    localStorage.setItem('neonblock-city:device', deviceId);
    window.NeonBlockCloud = {
      async save(slot, payload) {
        await setDoc(doc(db, 'neonblockSaves', deviceId + '_' + slot), { payload, updatedAt: serverTimestamp() }, { merge: true });
      },
      async load(slot) {
        const snap = await getDoc(doc(db, 'neonblockSaves', deviceId + '_' + slot));
        return snap.exists() ? snap.data().payload : null;
      }
    };
  } catch (error) {
    console.warn('NeonBlock optional Firebase bridge disabled:', error);
    window.NeonBlockCloud = null;
  }
}
