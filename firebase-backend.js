// Optional cloud-save bridge for NeonBlock City.
// This file intentionally does not include Firebase credentials or initialize external projects.
// To enable cloud saves later, define window.NeonBlockCloud with async save(slot, data) and load(slot) methods.
(function () {
  'use strict';
  if (!window.NeonBlockCloud) {
    window.NeonBlockCloud = null;
  }
})();
