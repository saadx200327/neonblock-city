(() => {
  'use strict';

  async function save(slot, data) {
    localStorage.setItem('neonblock_cloud_' + slot, JSON.stringify(data));
    return { ok: true, mode: 'local-fallback' };
  }

  async function load(slot) {
    const raw = localStorage.getItem('neonblock_cloud_' + slot);
    return raw ? JSON.parse(raw) : null;
  }

  window.NeonBlockCloud = { save, load };
})();
