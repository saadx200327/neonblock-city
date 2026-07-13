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

  let releases = 0;
  let lastReason = 'boot';
  let lastReleasedAt = 0;
  let releasing = false;
  let keyReleaseFailures = 0;
  let pointerReleaseFailures = 0;

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

  function releaseControls(reason = 'manual') {
    if (releasing) return false;
    releasing = true;
    try {
      RELEASE_CODES.forEach(dispatchKeyRelease);
      MOBILE_TARGET_IDS.forEach((id) => dispatchPointerCancel(document.getElementById(id)));
      releases += 1;
      lastReason = String(reason || 'manual');
      lastReleasedAt = Date.now();
      return true;
    } finally {
      releasing = false;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) releaseControls('document-hidden');
  }

  function boot() {
    window.addEventListener('blur', () => releaseControls('window-blur'));
    window.addEventListener('pagehide', () => releaseControls('pagehide'));
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('freeze', () => releaseControls('document-freeze'));

    window.NeonBlockControlReleaseGuard = {
      release: releaseControls,
      getStatus: () => ({
        version: 2,
        releases,
        lastReason,
        lastReleasedAt,
        keyReleaseFailures,
        pointerReleaseFailures,
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