// Optional Firebase bridge for NeonBlock City.
// Leave this file as-is for local-only saves. To enable cloud saves, define window.NeonBlockFirebase
// before this module loads with initialized Firebase helpers that expose save/load functions.
(function(){
  'use strict';
  const provider = window.NeonBlockFirebase;
  window.NeonBlockCloud = {
    async save(slot, payload) {
      if (!provider || typeof provider.save !== 'function') throw new Error('Firebase not configured');
      return provider.save(slot, payload);
    },
    async load(slot) {
      if (!provider || typeof provider.load !== 'function') throw new Error('Firebase not configured');
      return provider.load(slot);
    }
  };
})();
