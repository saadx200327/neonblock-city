// Optional Firebase/cloud-save adapter.
// This file intentionally does not configure Firebase or touch external project settings.
// If a host page injects window.NeonBlockFirebase with save/load methods, app.js can use them.
(function () {
  'use strict';
  const external = window.NeonBlockFirebase;
  window.NeonBlockCloud = {
    async save(slot, data) {
      if (external && typeof external.save === 'function') return external.save(slot, data);
      localStorage.setItem(`neonblock:cloud:${slot}`, JSON.stringify(data));
      return { ok: true, mode: 'local-fallback' };
    },
    async load(slot) {
      if (external && typeof external.load === 'function') return external.load(slot);
      const raw = localStorage.getItem(`neonblock:cloud:${slot}`);
      return raw ? JSON.parse(raw) : null;
    }
  };
})();
