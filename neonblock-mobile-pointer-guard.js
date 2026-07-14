(() => {
  'use strict';

  const sprintButton = document.getElementById('btn-mobile-sprint');
  const joystick = document.getElementById('joystick-container');
  const joystickStick = document.getElementById('joystick-stick');
  if (!sprintButton || !joystick) return;

  let sprintPointer = null;
  let sprintPointerType = 'touch';
  let joystickPointer = null;
  let joystickPointerType = 'touch';
  let blockedJoystickPointers = 0;
  let fallbackPointerEvents = 0;
  let releaseErrors = 0;
  let lifecycleReleases = 0;
  let skippedInactiveReleases = 0;
  let lastReleaseReason = 'startup';
  let lastReleaseAt = 0;

  function normalizePointerType(pointerType) {
    return ['mouse', 'pen', 'touch'].includes(pointerType) ? pointerType : 'touch';
  }

  function createPointerRelease(type, pointerId, pointerType = 'touch') {
    const normalizedType = normalizePointerType(pointerType);
    try {
      return new PointerEvent(type, {
        bubbles: false,
        pointerId,
        pointerType: normalizedType,
        isPrimary: true,
        buttons: 0,
        pressure: 0
      });
    } catch (_) {
      fallbackPointerEvents += 1;
      const event = new Event(type, { bubbles: false });
      try { Object.defineProperty(event, 'pointerId', { value: pointerId }); } catch (_) {}
      try { Object.defineProperty(event, 'pointerType', { value: normalizedType }); } catch (_) {}
      try { Object.defineProperty(event, 'isPrimary', { value: true }); } catch (_) {}
      try { Object.defineProperty(event, 'buttons', { value: 0 }); } catch (_) {}
      try { Object.defineProperty(event, 'pressure', { value: 0 }); } catch (_) {}
      return event;
    }
  }

  function dispatchRelease(target, type, pointerId, pointerType) {
    try {
      target.dispatchEvent(createPointerRelease(type, pointerId, pointerType));
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
    if (sprintPointer === null) {
      skippedInactiveReleases += 1;
      return false;
    }
    if (pointerId !== null && sprintPointer !== pointerId) return false;

    const releasedPointer = sprintPointer;
    const releasedPointerType = sprintPointerType;
    sprintPointer = null;
    sprintPointerType = 'touch';
    sprintButton.classList.remove('is-held');
    sprintButton.setAttribute('aria-pressed', 'false');
    releaseCapture(sprintButton, releasedPointer);

    // The core game listens for pointerup on this button. Dispatch a safe
    // synthetic release when the browser ends the gesture outside the button.
    dispatchRelease(sprintButton, 'pointerup', releasedPointer, releasedPointerType);
    return true;
  }

  function releaseJoystick(pointerId = null) {
    if (joystickPointer === null) {
      skippedInactiveReleases += 1;
      return false;
    }
    if (pointerId !== null && joystickPointer !== pointerId) return false;

    const releasedPointer = joystickPointer;
    const releasedPointerType = joystickPointerType;

    // Keep the owner set while dispatching so capture-phase ownership checks
    // allow the core game's reset handler to receive this synthetic release.
    dispatchRelease(joystick, 'pointerup', releasedPointer, releasedPointerType);
    releaseCapture(joystick, releasedPointer);
    joystickPointer = null;
    joystickPointerType = 'touch';
    if (joystickStick) joystickStick.style.transform = 'translate(0,0)';
    return true;
  }

  function releaseAll(reason = 'manual') {
    const releasedSprint = sprintPointer !== null ? releaseSprint() : false;
    const releasedJoystick = joystickPointer !== null ? releaseJoystick() : false;
    const hadHeldInput = releasedSprint || releasedJoystick;
    lastReleaseReason = reason;
    lastReleaseAt = Date.now();
    if (hadHeldInput && reason !== 'manual') lifecycleReleases += 1;
    return hadHeldInput;
  }

  sprintButton.setAttribute('aria-pressed', 'false');
  sprintButton.addEventListener('pointerdown', (event) => {
    if (sprintPointer !== null && sprintPointer !== event.pointerId) return;
    sprintPointer = event.pointerId;
    sprintPointerType = normalizePointerType(event.pointerType);
    sprintButton.classList.add('is-held');
    sprintButton.setAttribute('aria-pressed', 'true');
    try { sprintButton.setPointerCapture(event.pointerId); } catch (_) {}
  }, { passive: true });

  sprintButton.addEventListener('pointerup', (event) => {
    if (sprintPointer === event.pointerId) {
      sprintPointer = null;
      sprintPointerType = 'touch';
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
      joystickPointerType = normalizePointerType(event.pointerType);
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
    if (joystickPointer === event.pointerId) {
      joystickPointer = null;
      joystickPointerType = 'touch';
    }
  }, { passive: true });
  joystick.addEventListener('pointercancel', (event) => {
    if (joystickPointer === event.pointerId) {
      joystickPointer = null;
      joystickPointerType = 'touch';
    }
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
    version: 6,
    getStatus: () => ({
      sprintPointer,
      sprintPointerType,
      joystickPointer,
      joystickPointerType,
      blockedJoystickPointers,
      fallbackPointerEvents,
      releaseErrors,
      lifecycleReleases,
      skippedInactiveReleases,
      lastReleaseReason,
      lastReleaseAt,
      installed: true
    }),
    releaseAll: () => releaseAll('manual')
  };
})();
