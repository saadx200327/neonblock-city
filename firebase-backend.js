// Optional NeonBlock cloud-save bridge.
// This file intentionally does not require Firebase. If Saad later adds Firebase SDK/config
// in index.html or another script, this bridge can be extended without breaking static play.
(function(){
  'use strict';
  const prefix = 'nbc_cloud_shadow_';
  window.NeonBlockCloud = {
    enabled: false,
    async save(slot, data) {
      localStorage.setItem(prefix + slot, JSON.stringify({ ...data, cloudShadowSavedAt: new Date().toISOString() }));
      return true;
    },
    async load(slot) {
      const raw = localStorage.getItem(prefix + slot);
      return raw ? JSON.parse(raw) : null;
    }
  };
})();
