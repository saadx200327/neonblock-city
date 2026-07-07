// Optional cloud-save bridge for NeonBlock City.
// This file is safe for static hosting: without a Firebase config it becomes a no-op
// and the game automatically falls back to localStorage saves.

const config = window.NEONBLOCK_FIREBASE_CONFIG || null;

async function init() {
  if (!config || !config.apiKey) return false;
  try {
    const [{ initializeApp }, { getFirestore, doc, setDoc, getDoc }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
    ]);
    const app = initializeApp(config);
    const db = getFirestore(app);
    window.NeonBlockCloud._db = db;
    window.NeonBlockCloud._doc = doc;
    window.NeonBlockCloud._setDoc = setDoc;
    window.NeonBlockCloud._getDoc = getDoc;
    return true;
  } catch (error) {
    console.warn('NeonBlock cloud saves disabled:', error);
    return false;
  }
}

async function save(slot, data) {
  if (!window.NeonBlockCloud._db) return false;
  const userKey = localStorage.getItem('neonblock-user-key') || crypto.randomUUID();
  localStorage.setItem('neonblock-user-key', userKey);
  await window.NeonBlockCloud._setDoc(
    window.NeonBlockCloud._doc(window.NeonBlockCloud._db, 'neonblockSaves', `${userKey}_${slot}`),
    { slot, data, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return true;
}

async function load(slot) {
  if (!window.NeonBlockCloud._db) return null;
  const userKey = localStorage.getItem('neonblock-user-key');
  if (!userKey) return null;
  const snap = await window.NeonBlockCloud._getDoc(
    window.NeonBlockCloud._doc(window.NeonBlockCloud._db, 'neonblockSaves', `${userKey}_${slot}`)
  );
  return snap.exists() ? snap.data().data : null;
}

window.NeonBlockCloud = { init, save, load };
