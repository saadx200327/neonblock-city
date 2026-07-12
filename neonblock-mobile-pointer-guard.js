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

  function releaseSprint(pointerId = null) {
    if (pointerId !== null && sprintPointer !== pointerId) return;
    const releasedPointer = sprintPointer ?? pointerId ?? 0;
    sprintPointer = null;
    sprintButton.classList.remove('is-held');
    sprintButton.setAttribute('aria-pressed', 'false');

    // The core game listens for pointerup on this button. Dispatch a safe
    // synthetic release when the browser ends the gesture outside the button.
    dispatchRelease(sprintButton, 'pointerup', releasedPointer);
  }

  function releaseJoystick(pointerId = null) {
    if (pointerId !== null && joystickPointer !== pointerId) return;
    const releasedPointer = joystickPointer ?? pointerId ?? 0;

    // Keep the owner set while dispatching so capture-phase ownership checks
    // allow the core game's reset handler to receive this synthetic release.
    dispatchRelease(joystick, 'pointerup', releasedPointer);
    joystickPointer = null;
    if (joystickStick) joystickStick.style.transform = 'translate(0,0)';
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
  window.addEventListener('blur', () => {
    releaseSprint();
    releaseJoystick();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseSprint();
      releaseJoystick();
    }
  });

  [sprintButton, joystick].forEach((element) => {
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.style.touchAction = 'none';
  });

  window.NeonBlockMobilePointerGuard = {
    version: 3,
    getStatus: () => ({
      sprintPointer,
      joystickPointer,
      blockedJoystickPointers,
      fallbackPointerEvents,
      releaseErrors,
      installed: true
    }),
    releaseAll: () => {
      releaseSprint();
      releaseJoystick();
    }
  };
})();
