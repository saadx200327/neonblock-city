// Optional cloud-save bridge. This file is safe to leave unconfigured.
// To enable later, define window.NEONBLOCK_FIREBASE_CONFIG before this module loads
// and provide Firebase app/firestore modules in your own build. The static game
// keeps working with localStorage when this bridge is not configured.

const config = window.NEONBLOCK_FIREBASE_CONFIG || null;
window.NeonBlockCloud = {
  isConfigured: Boolean(config),
  async save(slot, data) {
    if (!config) return { skipped: true, reason: 'Firebase config not provided' };
    console.info('[NeonBlockCloud] Firebase config detected, but dashboard/setup is intentionally external. Local save remains active.', slot, data?.version);
    return { skipped: true, reason: 'No bundled Firebase write client' };
  },
  async load(slot) {
    if (!config) return null;
    console.info('[NeonBlockCloud] Firebase config detected. Add your Firestore client here to load:', slot);
    return null;
  }
};
