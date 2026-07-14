(() => {
  'use strict';

  const BLOCKED_GAME_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyP', 'KeyM', 'KeyU', 'Escape'
  ]);

  const KEY_BY_CODE = Object.freeze({
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: ' ', KeyE: 'e', KeyP: 'p', KeyM: 'm', KeyU: 'u', Escape: 'Escape'
  });

  let blockedKeydowns = 0;
  let blockedKeyups = 0;
  let lastBlockedCode = null;
  let syntheticReleases = 0;
  let fallbackReleases = 0;
  let releaseFailures = 0;

  function isEditable(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('textarea, input, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
  }

  function guard(event) {
    if (!isEditable(event.target) || !BLOCKED_GAME_CODES.has(event.code)) return;

    // Keep native editing behavior while preventing document-level gameplay
    // listeners from moving the player or toggling menus behind the editor.
    event.stopImmediatePropagation();
    lastBlockedCode = event.code;
    if (event.type === 'keydown') blockedKeydowns += 1;
    else blockedKeyups += 1;
  }

  function releaseSyntheticGameKeys() {
    let released = 0;
    for (const code of BLOCKED_GAME_CODES) {
      const event = new KeyboardEvent('keyup', {
        key: KEY_BY_CODE[code] || '',
        code,
        location: code.endsWith('Right') ? KeyboardEvent.DOM_KEY_LOCATION_RIGHT :
          code.endsWith('Left') ? KeyboardEvent.DOM_KEY_LOCATION_LEFT : KeyboardEvent.DOM_KEY_LOCATION_STANDARD,
        bubbles: true,
        cancelable: true,
        composed: true
      });

      try {
        document.dispatchEvent(event);
        syntheticReleases += 1;
        released += 1;
      } catch (_) {
        try {
          window.dispatchEvent(event);
          fallbackReleases += 1;
          released += 1;
        } catch (_) {
          releaseFailures += 1;
        }
      }
    }
    return released;
  }

  function onFocusIn(event) {
    if (!isEditable(event.target)) return;
    releaseSyntheticGameKeys();
  }

  document.addEventListener('keydown', guard, true);
  document.addEventListener('keyup', guard, true);
  document.addEventListener('focusin', onFocusIn, true);

  window.NeonBlockEditableInputGuard = Object.freeze({
    version: 2,
    isEditable,
    releaseAll: releaseSyntheticGameKeys,
    getStatus() {
      return {
        active: true,
        focusedEditable: isEditable(document.activeElement),
        blockedKeydowns,
        blockedKeyups,
        lastBlockedCode,
        syntheticReleases,
        fallbackReleases,
        releaseFailures
      };
    }
  });
})();