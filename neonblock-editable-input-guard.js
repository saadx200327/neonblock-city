(() => {
  'use strict';

  const BLOCKED_GAME_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyP', 'KeyM', 'KeyU', 'Escape'
  ]);

  let blockedKeydowns = 0;
  let blockedKeyups = 0;
  let lastBlockedCode = null;

  function isEditable(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('textarea, input, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
  }

  function guard(event) {
    if (!isEditable(event.target) || !BLOCKED_GAME_CODES.has(event.code)) return;

    // Keep native editing behavior (typing, cursor movement, selection, Escape in
    // browser controls) while preventing document-level game listeners from
    // moving the player, interacting, or toggling menus behind the editor.
    event.stopImmediatePropagation();
    lastBlockedCode = event.code;
    if (event.type === 'keydown') blockedKeydowns += 1;
    else blockedKeyups += 1;
  }

  function releaseSyntheticGameKeys() {
    for (const code of BLOCKED_GAME_CODES) {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  function onFocusIn(event) {
    if (!isEditable(event.target)) return;
    releaseSyntheticGameKeys();
  }

  document.addEventListener('keydown', guard, true);
  document.addEventListener('keyup', guard, true);
  document.addEventListener('focusin', onFocusIn, true);

  window.NeonBlockEditableInputGuard = Object.freeze({
    version: 1,
    isEditable,
    releaseAll: releaseSyntheticGameKeys,
    getStatus() {
      return {
        active: true,
        focusedEditable: isEditable(document.activeElement),
        blockedKeydowns,
        blockedKeyups,
        lastBlockedCode
      };
    }
  });
})();
