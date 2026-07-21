(() => {
  'use strict';

  const RELEASE_CODES = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE'
  ];
  const KEY_BY_CODE = Object.freeze({
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    Space: ' ',
    KeyE: 'e'
  });
  const MOBILE_TARGET_IDS = [
    'joystick-container',
    'btn-mobile-sprint',
    'btn-mobile-jump',
    'btn-mobile-interact'
  ];
  const RELEASE_COALESCE_MS = 80;

  let releases = 0;
  let lastReason = 'boot';
  let lastReleasedAt = 0;
  let releasing = false;
  let keyReleaseFailures = 0;
  let pointerReleaseFailures = 0;
  let mobileGuardReleases = 0;
  let mobileGuardReleaseFailures = 0;
  let coalescedReleases = 0;
  let lastCoalescedReason = null;
  let hadPointerLock = Boolean(document.pointerLockElement);
  let pointerLockReleases = 0;

  function dispatchKeyRelease(code) {
    const init = {
      code,
      key: KEY_BY_CODE[code] || code,
      bubbles: true,
      cancelable: false,
      composed: true
    };

    try {
      document.dispatchEvent(new KeyboardEvent('keyup', init));
      return true;
    } catch {
      try {
        window.dispatchEvent(new KeyboardEvent('keyup', init));
        return true;
      } catch {
        keyReleaseFailures += 1;
        return false;
      }
    }
  }

  function dispatchPointerCancel(target) {
    if (!target) return false;
    try {
      target.dispatchEvent(new PointerEvent('pointercancel', {
        pointerId: -1,
        pointerType: 'touch',
        bubbles: true,
        cancelable: false,
        composed: true
      }));
      return true;
    } catch {
      try {
        target.dispatchEvent(new Event('pointercancel', { bubbles: true, composed: true }));
        return true;
      } catch {
        pointerReleaseFailures += 1;
        return false;
      }
    }
  }

  function releaseTrackedMobilePointers() {
    const mobileGuard = window.NeonBlockMobilePointerGuard;
    if (typeof mobileGuard?.releaseAll !== 'function') return false;

    try {
      const released = mobileGuard.releaseAll();
      if (released) mobileGuardReleases += 1;
      return released;
    } catch {
      mobileGuardReleaseFailures += 1;
      return false;
    }
  }

  function releaseControls(reason = 'manual', options = {}) {
    if (releasing) return false;

    const normalizedReason = String(reason || 'manual');
    const now = Date.now();
    if (options.force !== true && lastReleasedAt && now - lastReleasedAt < RELEASE_COALESCE_MS) {
      coalescedReleases += 1;
      lastCoalescedReason = normalizedReason;
      return false;
    }

    releasing = true;
    try {
      RELEASE_CODES.forEach(dispatchKeyRelease);
      releaseTrackedMobilePointers();
      MOBILE_TARGET_IDS.forEach((id) => dispatchPointerCancel(document.getElementById(id)));
      releases += 1;
      lastReason = normalizedReason;
      lastReleasedAt = now;
      return true;
    } finally {
      releasing = false;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) releaseControls('document-hidden');
  }

  function onPointerLockChange() {
    const hasPointerLock = Boolean(document.pointerLockElement);
    if (hadPointerLock && !hasPointerLock) {
      if (releaseControls('pointer-lock-lost')) pointerLockReleases += 1;
    }
    hadPointerLock = hasPointerLock;
  }

  function boot() {
    window.addEventListener('blur', () => releaseControls('window-blur'));
    window.addEventListener('pagehide', () => releaseControls('pagehide'));
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('freeze', () => releaseControls('document-freeze'));
    document.addEventListener('pointerlockchange', onPointerLockChange);

    window.NeonBlockControlReleaseGuard = {
      release: (reason) => releaseControls(reason, { force: true }),
      getStatus: () => ({
        version: 5,
        releases,
        lastReason,
        lastReleasedAt,
        keyReleaseFailures,
        pointerReleaseFailures,
        mobileGuardReleases,
        mobileGuardReleaseFailures,
        coalescedReleases,
        lastCoalescedReason,
        pointerLockReleases,
        pointerLocked: Boolean(document.pointerLockElement),
        releaseCoalesceMs: RELEASE_COALESCE_MS,
        hidden: document.hidden,
        focused: document.hasFocus()
      })
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();