// Optional cloud save bridge for NeonBlock City.
(function () {
  'use strict';
  if (!window.NeonBlockCloud) {
    window.NeonBlockCloud = {
      enabled: false,
      async save() { return { ok: false, reason: 'cloud-disabled' }; },
      async load() { return null; }
    };
  }
})();
