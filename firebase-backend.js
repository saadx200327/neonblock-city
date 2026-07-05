// Optional Firebase bridge.
// This file intentionally does not initialize Firebase by itself or change any Firebase project settings.
// If a page owner loads Firebase and exposes window.firebaseCloudSave, NeonBlock can call it later.
window.NeonBlockCloud = window.NeonBlockCloud || {
  enabled: false,
  async save(_slot, data) {
    localStorage.setItem('neonblock-cloud-fallback', JSON.stringify(data));
    return { ok: true, mode: 'local-fallback' };
  },
  async load() {
    const raw = localStorage.getItem('neonblock-cloud-fallback');
    return raw ? JSON.parse(raw) : null;
  }
};
