// Optional NeonBlock City cloud-save bridge.
// This file intentionally does not initialize Firebase or require dashboard changes.
// To enable cloud saves later, a page can define window.NeonBlockCloudProvider
// with async save(slot, data) and load(slot) methods before app.js runs.
(function(){
  'use strict';
  const provider = window.NeonBlockCloudProvider;
  window.NeonBlockCloud = {
    async save(slot, data){
      if (!provider || typeof provider.save !== 'function') return { mode: 'local-only' };
      return provider.save(slot, data);
    },
    async load(slot){
      if (!provider || typeof provider.load !== 'function') return null;
      return provider.load(slot);
    }
  };
})();
