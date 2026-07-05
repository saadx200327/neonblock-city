// Optional Firebase/cloud-save bridge.
// The game is fully playable offline. To enable real Firebase, define a compatible
// adapter before app.js loads, or replace these methods with Firebase SDK calls.
window.NeonBlockCloud = {
  isConfigured: false,
  async save(slot, data) {
    localStorage.setItem(`neonblock-cloud-fallback-${slot}`, JSON.stringify(data));
    return { ok: true, mode: 'local-fallback' };
  },
  async load(slot) {
    const raw = localStorage.getItem(`neonblock-cloud-fallback-${slot}`);
    return raw ? JSON.parse(raw) : null;
  }
};
