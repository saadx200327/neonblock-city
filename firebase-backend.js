// Optional Firebase bridge for NeonBlock City.
// This file intentionally does nothing unless a page or local customization provides
// window.NEONBLOCK_FIREBASE with initialized Firebase helpers. The game always falls
// back to localStorage, so Netlify/static previews work without dashboard changes.

window.NeonBlockCloud = {
  async save(slot, data) {
    const bridge = window.NEONBLOCK_FIREBASE;
    if (!bridge || typeof bridge.save !== 'function') return { offline: true };
    return bridge.save(slot, data);
  },
  async load(slot) {
    const bridge = window.NEONBLOCK_FIREBASE;
    if (!bridge || typeof bridge.load !== 'function') return null;
    return bridge.load(slot);
  }
};
