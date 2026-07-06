// Optional cloud-save bridge. The game remains fully playable offline with localStorage.
// To enable real Firebase later, add a separate config/init module that defines window.NeonBlockFirebaseAdapter
// with async save(slot, data) and load(slot) methods. This file intentionally does not contain secrets.

const localFallback = {
  enabled: false,
  async save(slot, data) {
    localStorage.setItem('neonblock-cloud-shadow-' + slot, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  },
  async load(slot) {
    const raw = localStorage.getItem('neonblock-cloud-shadow-' + slot);
    return raw ? JSON.parse(raw) : null;
  }
};

window.NeonBlockCloud = window.NeonBlockFirebaseAdapter || localFallback;
