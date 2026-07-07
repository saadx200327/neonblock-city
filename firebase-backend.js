// Optional Firebase bridge for NeonBlock City.
// This file is intentionally safe by default: no keys, no external writes, no dashboard changes.
// To enable cloud saves later, define window.NEONBLOCK_FIREBASE with initialized helpers before app.js runs.
(function(){
  'use strict';
  const bridge = window.NEONBLOCK_FIREBASE;
  window.NeonBlockCloudSave = {
    async save(data){
      if (!bridge || typeof bridge.save !== 'function') return { mode: 'local-only' };
      return bridge.save('neonblock-city-save', data);
    },
    async load(){
      if (!bridge || typeof bridge.load !== 'function') return null;
      return bridge.load('neonblock-city-save');
    }
  };
})();
