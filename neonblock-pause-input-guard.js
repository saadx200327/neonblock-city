(() => {
  'use strict';

  const GAMEPLAY_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyU', 'KeyX', 'KeyR'
  ]);

  let blockedKeydowns = 0;
  let releases = 0;
  let lastBlockedCode = null;
  let lastPauseState = false;

  function isPaused() {
    const overlay = document.getElementById('pause-overlay');
    return !!overlay && !overlay.classList.contains('hidden');
  }

  function releaseGameplayKeys() {
    releases += 1;
    for (const code of GAMEPLAY_CODES) {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  function guardPausedKeydown(event) {
    if (!isPaused() || !GAMEPLAY_CODES.has(event.code)) return;
    event.stopImmediatePropagation();
    lastBlockedCode = event.code;
    blockedKeydowns += 1;
  }

  function syncPauseState() {
    const paused = isPaused();
    if (paused && !lastPauseState) releaseGameplayKeys();
    lastPauseState = paused;
  }

  window.addEventListener('keydown', guardPausedKeydown, true);
  window.addEventListener('blur', releaseGameplayKeys);

  function observePauseOverlay() {
    const overlay = document.getElementById('pause-overlay');
    if (!overlay) return;
    lastPauseState = isPaused();
    new MutationObserver(syncPauseState).observe(overlay, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observePauseOverlay, { once: true });
  } else {
    observePauseOverlay();
  }

  window.NeonBlockPauseInputGuard = Object.freeze({
    version: 1,
    isPaused,
    releaseAll: releaseGameplayKeys,
    getStatus() {
      return {
        active: true,
        paused: isPaused(),
        blockedKeydowns,
        releases,
        lastBlockedCode
      };
    }
  });
})();
