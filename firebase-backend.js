/*
  Optional NeonBlock City cloud-save bridge.
  This file intentionally does not contain Firebase keys or initialize a Firebase app.
  To wire cloud saves later, define compatible async save/load functions here or before app.js runs.
*/
(function(){
  'use strict';
  window.NeonBlockCloudSave = window.NeonBlockCloudSave || null;

  window.NeonBlockCloudSaveStatus = {
    enabled: Boolean(window.NeonBlockCloudSave),
    mode: window.NeonBlockCloudSave ? 'external-adapter' : 'local-only'
  };
})();
