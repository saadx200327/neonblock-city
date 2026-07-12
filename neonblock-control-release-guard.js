(() => {
  'use strict';

  const RELEASE_CODES = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE'
  ];
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

  function dispatchKeyRelease(code) {
    try {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code,
        key: code,
        bubbles: true,
        cancelable: false
      }));
    } catch {}
  }

  function dispatchPointerCancel(target) {
    if (!target) return;
    try {
      target.dispatchEvent(new PointerEvent('pointercancel', {
        pointerId: -1,
        pointerType: 'touch',
        bubbles: true,
        cancelable: false
      }));
    } catch {
      try { target.dispatchEvent(new Event('pointercancel', { bubbles: true })); } catch {}
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
        version: 1,
        releases,
        lastReason,
        lastReleasedAt,
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
