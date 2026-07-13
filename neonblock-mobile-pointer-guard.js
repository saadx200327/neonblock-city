(() => {
  'use strict';

  const sprintButton = document.getElementById('btn-mobile-sprint');
  const joystick = document.getElementById('joystick-container');
  const joystickStick = document.getElementById('joystick-stick');
  if (!sprintButton || !joystick) return;

  let sprintPointer = null;
  let joystickPointer = null;
  let blockedJoystickPointers = 0;
  let fallbackPointerEvents = 0;
  let releaseErrors = 0;
  let lifecycleReleases = 0;
  let lastReleaseReason = 'startup';
  let lastReleaseAt = 0;

  function createPointerRelease(type, pointerId) {
    try {
      return new PointerEvent(type, {
        bubbles: false,
        pointerId,
        pointerType: 'touch'
      });
    } catch (_) {
      fallbackPointerEvents += 1;
      const event = new Event(type, { bubbles: false });
      try { Object.defineProperty(event, 'pointerId', { value: pointerId }); } catch (_) {}
      try { Object.defineProperty(event, 'pointerType', { value: 'touch' }); } catch (_) {}
      return event;
    }
  }

  function dispatchRelease(target, type, pointerId) {
    try {
      target.dispatchEvent(createPointerRelease(type, pointerId));
      return true;
    } catch (error) {
      releaseErrors += 1;
      console.warn('[NeonBlock] Mobile pointer release failed.', error);
      return false;
    }
  }

  function releaseCapture(target, pointerId) {
    if (!Number.isFinite(pointerId)) return;
    try {
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
    } catch (_) {
      // Browsers may already have discarded capture during lifecycle changes.
    }
  }

  function releaseSprint(pointerId = null) {
    if (pointerId !== null && sprintPointer !== pointerId) return false;
    const releasedPointer = sprintPointer ?? pointerId ?? 0;
    sprintPointer = null;
    sprintButton.classList.remove('is-held');
    sprintButton.setAttribute('aria-pressed', 'false');
    releaseCapture(sprintButton, releasedPointer);

    // The core game listens for pointerup on this button. Dispatch a safe
    // synthetic release when the browser ends the gesture outside the button.
    dispatchRelease(sprintButton, 'pointerup', releasedPointer);
    return true;
  }

  function releaseJoystick(pointerId = null) {
    if (pointerId !== null && joystickPointer !== pointerId) return false;
    const releasedPointer = joystickPointer ?? pointerId ?? 0;

    // Keep the owner set while dispatching so capture-phase ownership checks
    // allow the core game's reset handler to receive this synthetic release.
    dispatchRelease(joystick, 'pointerup', releasedPointer);
    releaseCapture(joystick, releasedPointer);
    joystickPointer = null;
    if (joystickStick) joystickStick.style.transform = 'translate(0,0)';
    return true;
  }

  function releaseAll(reason = 'manual') {
    const hadHeldInput = sprintPointer !== null || joystickPointer !== null;
    releaseSprint();
    releaseJoystick();
    lastReleaseReason = reason;
    lastReleaseAt = Date.now();
    if (hadHeldInput && reason !== 'manual') lifecycleReleases += 1;
  }

  sprintButton.setAttribute('aria-pressed', 'false');
  sprintButton.addEventListener('pointerdown', (event) => {
    if (sprintPointer !== null && sprintPointer !== event.pointerId) return;
    sprintPointer = event.pointerId;
    sprintButton.classList.add('is-held');
    sprintButton.setAttribute('aria-pressed', 'true');
    try { sprintButton.setPointerCapture(event.pointerId); } catch (_) {}
  }, { passive: true });

  sprintButton.addEventListener('pointerup', (event) => {
    if (sprintPointer === event.pointerId) {
      sprintPointer = null;
      sprintButton.classList.remove('is-held');
      sprintButton.setAttribute('aria-pressed', 'false');
    }
  }, { passive: true });
  sprintButton.addEventListener('pointercancel', (event) => releaseSprint(event.pointerId), { passive: true });
  sprintButton.addEventListener('lostpointercapture', (event) => releaseSprint(event.pointerId), { passive: true });

  // The core joystick uses a single pointer variable. Capture-phase ownership
  // prevents a second finger from overwriting that pointer or releasing the
  // first finger's movement before the core bubble listeners run.
  joystick.addEventListener('pointerdown', (event) => {
    if (joystickPointer === null) {
      joystickPointer = event.pointerId;
      return;
    }
    if (joystickPointer !== event.pointerId) {
      blockedJoystickPointers++;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true, passive: false });

  ['pointermove', 'pointerup', 'pointercancel'].forEach((type) => {
    joystick.addEventListener(type, (event) => {
      if (joystickPointer !== null && joystickPointer !== event.pointerId) {
        blockedJoystickPointers++;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true, passive: false });
  });

  joystick.addEventListener('pointerup', (event) => {
    if (joystickPointer === event.pointerId) joystickPointer = null;
  }, { passive: true });
  joystick.addEventListener('pointercancel', (event) => {
    if (joystickPointer === event.pointerId) joystickPointer = null;
  }, { passive: true });
  joystick.addEventListener('lostpointercapture', (event) => releaseJoystick(event.pointerId), { passive: true });

  window.addEventListener('pointerup', (event) => {
    if (sprintPointer === event.pointerId && event.target !== sprintButton) releaseSprint(event.pointerId);
    if (joystickPointer === event.pointerId && !joystick.contains(event.target)) releaseJoystick(event.pointerId);
  }, true);
  window.addEventListener('pointercancel', (event) => {
    if (sprintPointer === event.pointerId) releaseSprint(event.pointerId);
    if (joystickPointer === event.pointerId) releaseJoystick(event.pointerId);
  }, true);
  window.addEventListener('blur', () => releaseAll('blur'));
  window.addEventListener('pagehide', () => releaseAll('pagehide'));
  document.addEventListener('freeze', () => releaseAll('freeze'));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll('hidden');
  });

  [sprintButton, joystick].forEach((element) => {
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.style.touchAction = 'none';
  });

  window.NeonBlockMobilePointerGuard = {
    version: 4,
    getStatus: () => ({
      sprintPointer,
      joystickPointer,
      blockedJoystickPointers,
      fallbackPointerEvents,
      releaseErrors,
      lifecycleReleases,
      lastReleaseReason,
      lastReleaseAt,
      installed: true
    }),
    releaseAll: () => releaseAll('manual')
  };
})();