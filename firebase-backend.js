// Optional cloud-save bridge.
// This file is intentionally safe for static hosting: it does not require Firebase config.
// If a future build provides window.firebaseSave/window.firebaseLoad, app.js can use this bridge.
window.NeonBlockCloud = {
  async save(slot, data) {
    if (typeof window.firebaseSave === 'function') return window.firebaseSave(slot, data);
    localStorage.setItem(`neonblock-city:${slot}`, JSON.stringify(data));
    return { mode: 'localStorage' };
  },
  async load(slot) {
    if (typeof window.firebaseLoad === 'function') return window.firebaseLoad(slot);
    const raw = localStorage.getItem(`neonblock-city:${slot}`);
    return raw ? JSON.parse(raw) : null;
  }
};
