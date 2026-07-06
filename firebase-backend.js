// Optional Firebase bridge for NeonBlock City.
// This file intentionally does not contain project credentials. Static builds run fully offline unless a page injects window.NEONBLOCK_FIREBASE_CONFIG.
(function(){
  'use strict';
  const status = { mode: 'offline', reason: 'No Firebase config provided' };
  const api = {
    status,
    async save(slot, payload){
      try {
        const cfg = window.NEONBLOCK_FIREBASE_CONFIG;
        if (!cfg) return { ok:false, offline:true, reason:status.reason };
        // Future-safe placeholder: external dashboards/settings are not modified by this app.
        localStorage.setItem('neonblock-city-cloud-shadow:' + slot, JSON.stringify({ payload, savedAt: Date.now() }));
        status.mode = 'local-shadow';
        status.reason = 'Firebase config detected, using safe local shadow save in static mode';
        return { ok:true, shadow:true };
      } catch (error) {
        status.mode = 'offline';
        status.reason = error.message || String(error);
        return { ok:false, error:status.reason };
      }
    },
    async load(slot){
      const raw = localStorage.getItem('neonblock-city-cloud-shadow:' + slot);
      return raw ? JSON.parse(raw).payload : null;
    }
  };
  window.NeonBlockCloud = api;
})();
