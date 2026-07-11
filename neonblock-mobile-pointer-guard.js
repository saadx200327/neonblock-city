(() => {
  'use strict';

  const sprintButton = document.getElementById('btn-mobile-sprint');
  const joystick = document.getElementById('joystick-container');
  const joystickStick = document.getElementById('joystick-stick');
  if (!sprintButton || !joystick) return;

  let sprintPointer = null;
  let joystickPointer = null;
  let blockedJoystickPointers = 0;

  function releaseSprint(pointerId = null) {
    if (pointerId !== null && sprintPointer !== pointerId) return;
    const releasedPointer = sprintPointer ?? pointerId ?? 0;
    sprintPointer = null;
    sprintButton.classList.remove('is-held');
    sprintButton.setAttribute('aria-pressed', 'false');

    // The core game listens for pointerup on this button. Dispatch a safe
    // synthetic release when the browser ends the gesture outside the button.
    sprintButton.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: false,
      pointerId: releasedPointer,
      pointerType: 'touch'
    }));
  }

  function releaseJoystick(pointerId = null) {
    if (pointerId !== null && joystickPointer !== pointerId) return;
    const releasedPointer = joystickPointer ?? pointerId ?? 0;

    // Keep the owner set while dispatching so capture-phase ownership checks
    // allow the core game's reset handler to receive this synthetic release.
    joystick.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: false,
      pointerId: releasedPointer,
      pointerType: 'touch'
    }));
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
    version: 2,
    getStatus: () => ({
      sprintPointer,
      joystickPointer,
      blockedJoystickPointers,
      installed: true
    }),
    releaseAll: () => {
      releaseSprint();
      releaseJoystick();
    }
  };
})();
