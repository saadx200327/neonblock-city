(() => {
  'use strict';

  const RELEASE_CODES = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyX', 'KeyE'
  ];

  const POINTER_CONTROL_IDS = [
    'joystick-container',
    'btn-mobile-sprint',
    'btn-mobile-jump',
    'btn-mobile-interact',
    'btn-mobile-unstuck',
    'btn-mobile-brake'
  ];

  let releaseCount = 0;
  let lastReleaseReason = 'startup';
  let lastReleaseAt = 0;
  let drivingBrakeReleaseCount = 0;

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
    control.setAttribute('aria-pressed', 'false');
  }

  function releaseDrivingBrake(reason) {
    const releaseBrake = window.NeonBlockDrivingPolish?.releaseBrake;
    if (typeof releaseBrake !== 'function') return;
    try {
      releaseBrake(`input-lifecycle:${reason}`);
      drivingBrakeReleaseCount += 1;
    } catch (error) {
      console.warn('[NeonBlock] Could not release driving brake input.', error);
    }
  }

  function releaseAll(reason = 'manual') {
    RELEASE_CODES.forEach(dispatchKeyRelease);
    POINTER_CONTROL_IDS.forEach(cancelPointerControl);
    releaseDrivingBrake(reason);

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
    version: 2,
    releaseAll,
    getStatus: () => ({
      version: 2,
      releaseCount,
      lastReleaseReason,
      lastReleaseAt,
      drivingBrakeReleaseCount,
      releaseCodes: [...RELEASE_CODES],
      pointerControlIds: [...POINTER_CONTROL_IDS]
    })
  });
})();
