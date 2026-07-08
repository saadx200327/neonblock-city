(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    lastGasLabel: '',
    lastGasWarn: 0,
    lastHiddenSave: 0,
    lastFps: 60
  };

  function setError(message) {
    const target = $('debug-last-error');
    if (target) target.textContent = message || 'none';
  }

  function setPopup(message, duration = 1500) {
    const target = $('reward-popup');
    if (!target) return;
    target.textContent = message;
    target.classList.remove('hidden');
    clearTimeout(setPopup.timeout);
    setPopup.timeout = setTimeout(() => target.classList.add('hidden'), duration);
  }

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function bestSlotName() {
    const debugSlot = $('debug-save-slot')?.textContent?.trim();
    return debugSlot || 'slot1';
  }

  function latestLocalSave() {
    const preferred = localStorage.getItem(`neonblock:${bestSlotName()}`);
    if (preferred) return safeJsonParse(preferred);
    return safeJsonParse(localStorage.getItem('neonblock:slot1')) || safeJsonParse(localStorage.getItem('neonblock:slot2'));
  }

  function mirrorSaveBeforeHide() {
    const now = Date.now();
    if (now - state.lastHiddenSave < 2000) return;
    state.lastHiddenSave = now;
    const latest = latestLocalSave();
    if (!latest) return;
    latest.at = now;
    latest.reason = 'page-hidden-safety-copy';
    localStorage.setItem(`neonblock:${bestSlotName()}:last-hidden-copy`, JSON.stringify(latest));
  }

  function clearStuckTouchStates() {
    document.body.classList.remove('touch-stuck');
    for (const button of document.querySelectorAll('.action-btn')) button.blur();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  }

  function hardenTouchControls() {
    const controls = $('mobile-controls');
    if (!controls) return;
    controls.addEventListener('contextmenu', (event) => event.preventDefault());
    controls.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
    for (const button of controls.querySelectorAll('button')) {
      button.setAttribute('type', 'button');
      button.addEventListener('pointercancel', clearStuckTouchStates);
      button.addEventListener('lostpointercapture', clearStuckTouchStates);
      button.addEventListener('pointerleave', () => button.blur());
    }
  }

  function hardenKeyboardControls() {
    window.addEventListener('blur', clearStuckTouchStates);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        mirrorSaveBeforeHide();
        clearStuckTouchStates();
      }
    });
    window.addEventListener('keydown', (event) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    }, { passive: false });
  }

  function watchHudForRuntimeProblems() {
    window.setInterval(() => {
      const fps = Number($('debug-fps')?.textContent || state.lastFps || 60);
      state.lastFps = fps || state.lastFps;
      if (fps && fps < 24) {
        setError('low fps: try Graphics → Low');
      }

      const gas = $('hud-vehicle-gas')?.textContent || '';
      const vehicle = $('hud-vehicle')?.textContent || 'On foot';
      const now = Date.now();
      if (vehicle !== 'On foot' && gas === '0' && gas !== state.lastGasLabel && now - state.lastGasWarn > 4000) {
        state.lastGasWarn = now;
        state.lastGasLabel = gas;
        setPopup('Vehicle out of gas — exit or find another car', 1800);
      }
      if (gas !== '0') state.lastGasLabel = gas;
    }, 1000);
  }

  function addSaveTools() {
    const panel = $('save-panel');
    if (!panel || $('btn-copy-hidden-save')) return;
    const button = document.createElement('button');
    button.id = 'btn-copy-hidden-save';
    button.textContent = 'Recover Hidden Backup';
    button.addEventListener('click', () => {
      const backup = localStorage.getItem(`neonblock:${bestSlotName()}:last-hidden-copy`);
      if (!backup) return setPopup('No hidden backup yet');
      const exportBox = $('export-json');
      if (exportBox) exportBox.value = JSON.stringify(safeJsonParse(backup), null, 2);
      setPopup('Backup copied to export box');
    });
    panel.appendChild(button);
  }

  function boot() {
    hardenTouchControls();
    hardenKeyboardControls();
    watchHudForRuntimeProblems();
    addSaveTools();
    window.NeonBlockHardening = { version: 1, latestLocalSave, mirrorSaveBeforeHide };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
