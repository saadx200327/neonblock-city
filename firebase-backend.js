// Optional Firebase bridge. This file is safe without Firebase config.
// To enable cloud saves later, define window.NeonBlockFirebaseAdapter with async save/load methods
// from your own Firebase initialization code. Local saves work without this file doing anything.
(() => {
  const adapter = window.NeonBlockFirebaseAdapter;
  window.NeonBlockCloud = {
    async save(slot, data) {
      if (!adapter || typeof adapter.save !== 'function') return { ok: false, reason: 'firebase-not-configured' };
      return adapter.save(slot, data);
    },
    async load(slot) {
      if (!adapter || typeof adapter.load !== 'function') return null;
      return adapter.load(slot);
    }
  };
  window.dispatchEvent(new CustomEvent('neonblock-cloud-ready', { detail: { enabled: Boolean(adapter) } }));
})();
