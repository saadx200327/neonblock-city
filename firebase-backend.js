// Optional Firebase bridge for NeonBlock City.
// Static/local play works without Firebase. To enable cloud saves, another script may initialize
// window.firebase or window.firebaseApp with Auth + Firestore before this module runs.
(function () {
  "use strict";
  const hasCompat = () => window.firebase && window.firebase.firestore && window.firebase.auth;

  async function userId() {
    if (!hasCompat()) return null;
    const auth = window.firebase.auth();
    if (!auth.currentUser) await auth.signInAnonymously();
    return auth.currentUser && auth.currentUser.uid;
  }

  window.NeonBlockCloud = {
    async save(slot, data) {
      if (!hasCompat()) return false;
      const uid = await userId();
      if (!uid) return false;
      await window.firebase.firestore().collection("neonblockSaves").doc(uid).collection("slots").doc(slot).set({
        data,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    },
    async load(slot) {
      if (!hasCompat()) return null;
      const uid = await userId();
      if (!uid) return null;
      const snap = await window.firebase.firestore().collection("neonblockSaves").doc(uid).collection("slots").doc(slot).get();
      return snap.exists ? snap.data().data : null;
    }
  };
})();
