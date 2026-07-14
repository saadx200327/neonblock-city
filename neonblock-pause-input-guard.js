(() => {
  'use strict';

  const KEY_META = Object.freeze({
    KeyW: { key: 'w' }, KeyA: { key: 'a' }, KeyS: { key: 's' }, KeyD: { key: 'd' },
    ArrowUp: { key: 'ArrowUp' }, ArrowDown: { key: 'ArrowDown' },
    ArrowLeft: { key: 'ArrowLeft' }, ArrowRight: { key: 'ArrowRight' },
    ShiftLeft: { key: 'Shift', location: 1 }, ShiftRight: { key: 'Shift', location: 2 },
    Space: { key: ' ' }, KeyE: { key: 'e' }, KeyU: { key: 'u' },
    KeyX: { key: 'x' }, KeyR: { key: 'r' }
  });
  const GAMEPLAY_CODES = new Set(Object.keys(KEY_META));
  const heldCodes = new Set();

  let blockedKeydowns = 0;
  let releases = 0;
  let releasedKeys = 0;
  let fallbackDispatches = 0;
  let dispatchFailures = 0;
  let lastBlockedCode = null;
  let lastReleaseReason = null;
  let lastPauseState = false;

  function isPaused() {
    const overlay = document.getElementById('pause-overlay');
    return !!overlay && !overlay.classList.contains('hidden');
  }

  function dispatchRelease(code) {
    const meta = KEY_META[code] || {};
    const eventInit = {
      key: meta.key || '',
      code,
      location: meta.location || 0,
      bubbles: true,
      cancelable: true,
      composed: true,
      repeat: false
    };

    try {
      return document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    } catch (_) {
      try {
        fallbackDispatches += 1;
        return window.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      } catch (_) {
        dispatchFailures += 1;
        return false;
      }
    }
  }

  function releaseGameplayKeys(reason = 'manual') {
    if (!heldCodes.size) return 0;

    const pending = [...heldCodes];
    heldCodes.clear();
    releases += 1;
    releasedKeys += pending.length;
    lastReleaseReason = reason;

    for (const code of pending) dispatchRelease(code);
    return pending.length;
  }

  function trackKeydown(event) {
    if (!GAMEPLAY_CODES.has(event.code)) return;

    if (isPaused()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      lastBlockedCode = event.code;
      blockedKeydowns += 1;
      return;
    }

    heldCodes.add(event.code);
  }

  function trackKeyup(event) {
    if (GAMEPLAY_CODES.has(event.code)) heldCodes.delete(event.code);
  }

  function syncPauseState() {
    const paused = isPaused();
    if (paused && !lastPauseState) releaseGameplayKeys('pause-opened');
    lastPauseState = paused;
  }

  window.addEventListener('keydown', trackKeydown, true);
  window.addEventListener('keyup', trackKeyup, true);
  window.addEventListener('blur', () => releaseGameplayKeys('window-blur'));

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
    version: 2,
    isPaused,
    releaseAll: () => releaseGameplayKeys('manual'),
    getStatus() {
      return {
        active: true,
        paused: isPaused(),
        heldCodes: [...heldCodes],
        blockedKeydowns,
        releases,
        releasedKeys,
        fallbackDispatches,
        dispatchFailures,
        lastBlockedCode,
        lastReleaseReason
      };
    }
  });
})();
