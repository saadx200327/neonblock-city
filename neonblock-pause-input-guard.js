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
  let lifecycleReleases = 0;
  let mobileReleases = 0;
  let mobileReleaseFailures = 0;
  let overlayAttachAttempts = 0;
  let overlayAttachSuccesses = 0;
  let lastBlockedCode = null;
  let lastReleaseReason = null;
  let lastPauseState = false;
  let observedOverlay = null;
  let overlayObserver = null;
  let discoveryObserver = null;

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

  function releaseMobileControls() {
    const mobileGuard = window.NeonBlockMobilePointerGuard;
    if (typeof mobileGuard?.releaseAll !== 'function') return false;

    try {
      const released = mobileGuard.releaseAll();
      if (released) mobileReleases += 1;
      return released;
    } catch (_) {
      mobileReleaseFailures += 1;
      return false;
    }
  }

  function releaseForLifecycle(reason) {
    const count = releaseGameplayKeys(reason);
    if (count > 0) lifecycleReleases += 1;
    return count;
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
    if (paused && !lastPauseState) {
      releaseGameplayKeys('pause-opened');
      releaseMobileControls();
    }
    lastPauseState = paused;
  }

  function attachPauseOverlay() {
    overlayAttachAttempts += 1;
    const overlay = document.getElementById('pause-overlay');
    if (!overlay || overlay === observedOverlay) return Boolean(overlay);

    overlayObserver?.disconnect();
    observedOverlay = overlay;
    lastPauseState = isPaused();
    overlayObserver = new MutationObserver(syncPauseState);
    overlayObserver.observe(overlay, {
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden']
    });
    overlayAttachSuccesses += 1;
    discoveryObserver?.disconnect();
    discoveryObserver = null;
    return true;
  }

  function observePauseOverlay() {
    if (attachPauseOverlay()) return;
    if (discoveryObserver || !document.documentElement) return;

    discoveryObserver = new MutationObserver(() => {
      attachPauseOverlay();
    });
    discoveryObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  window.addEventListener('keydown', trackKeydown, true);
  window.addEventListener('keyup', trackKeyup, true);
  window.addEventListener('blur', () => releaseForLifecycle('window-blur'));
  window.addEventListener('pagehide', () => releaseForLifecycle('pagehide'), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseForLifecycle('visibility-hidden');
  });
  document.addEventListener('freeze', () => releaseForLifecycle('freeze'));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observePauseOverlay, { once: true });
  } else {
    observePauseOverlay();
  }

  window.NeonBlockPauseInputGuard = Object.freeze({
    version: 4,
    isPaused,
    releaseAll: () => releaseGameplayKeys('manual'),
    refreshOverlay: attachPauseOverlay,
    getStatus() {
      return {
        active: true,
        paused: isPaused(),
        heldCodes: [...heldCodes],
        overlayObserved: Boolean(observedOverlay?.isConnected),
        overlayAttachAttempts,
        overlayAttachSuccesses,
        blockedKeydowns,
        releases,
        releasedKeys,
        lifecycleReleases,
        mobileReleases,
        mobileReleaseFailures,
        fallbackDispatches,
        dispatchFailures,
        lastBlockedCode,
        lastReleaseReason
      };
    }
  });
})();
