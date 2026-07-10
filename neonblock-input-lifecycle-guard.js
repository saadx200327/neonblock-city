(() => {
  'use strict';

  const RELEASE_CODES = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE'
  ];

  let releaseCount = 0;
  let lastReleaseReason = 'startup';
  let lastReleaseAt = 0;

  function dispatchKeyRelease(code) {
    try {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code,
        key: code === 'Space' ? ' ' : code,
        bubbles: true
      }));
    } catch (_) {
      const event = document.createEvent('Event');
      event.initEvent('keyup', true, true);
      Object.defineProperty(event, 'code', { value: code });
      window.dispatchEvent(event);
    }
  }

  function cancelPointerControl(id) {
    const control = document.getElementById(id);
    if (!control) return;
    control.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    control.classList.remove('active', 'pressed', 'is-active');
  }

  function releaseAll(reason = 'manual') {
    RELEASE_CODES.forEach(dispatchKeyRelease);
    [
      'joystick-container',
      'btn-mobile-sprint',
      'btn-mobile-jump',
      'btn-mobile-interact',
      'btn-mobile-unstuck'
    ].forEach(cancelPointerControl);

    releaseCount += 1;
    lastReleaseReason = reason;
    lastReleaseAt = Date.now();
  }

  window.addEventListener('blur', () => releaseAll('window-blur'));
  window.addEventListener('pagehide', () => releaseAll('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releaseAll('document-hidden');
  });

  window.NeonBlockInputLifecycleGuard = Object.freeze({
    releaseAll,
    getStatus: () => ({ releaseCount, lastReleaseReason, lastReleaseAt })
  });
})();
