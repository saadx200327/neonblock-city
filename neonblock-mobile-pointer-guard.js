(() => {
  'use strict';

  const sprintButton = document.getElementById('btn-mobile-sprint');
  const joystick = document.getElementById('joystick-container');
  const joystickStick = document.getElementById('joystick-stick');
  if (!sprintButton || !joystick) return;

  const activePointers = new Set();
  let sprintPointer = null;

  function releaseSprint(pointerId = null) {
    if (pointerId !== null && sprintPointer !== pointerId) return;
    sprintPointer = null;
    sprintButton.classList.remove('is-held');
    sprintButton.setAttribute('aria-pressed', 'false');

    // The core game listens for pointerup on this button. Dispatch a safe
    // synthetic release when the browser ends the gesture outside the button.
    sprintButton.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: false,
      pointerId: pointerId ?? 0,
      pointerType: 'touch'
    }));
  }

  function resetJoystick() {
    activePointers.clear();
    if (joystickStick) joystickStick.style.transform = 'translate(0,0)';
    joystick.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: false,
      pointerId: 0,
      pointerType: 'touch'
    }));
  }

  sprintButton.setAttribute('aria-pressed', 'false');
  sprintButton.addEventListener('pointerdown', (event) => {
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
  sprintButton.addEventListener('pointercancel', () => releaseSprint(), { passive: true });
  sprintButton.addEventListener('lostpointercapture', () => releaseSprint(), { passive: true });

  joystick.addEventListener('pointerdown', (event) => activePointers.add(event.pointerId), { passive: true });
  joystick.addEventListener('pointerup', (event) => activePointers.delete(event.pointerId), { passive: true });
  joystick.addEventListener('pointercancel', (event) => activePointers.delete(event.pointerId), { passive: true });
  joystick.addEventListener('lostpointercapture', resetJoystick, { passive: true });

  window.addEventListener('pointerup', (event) => {
    if (sprintPointer === event.pointerId) releaseSprint(event.pointerId);
    activePointers.delete(event.pointerId);
  }, true);
  window.addEventListener('pointercancel', (event) => {
    if (sprintPointer === event.pointerId) releaseSprint(event.pointerId);
    activePointers.delete(event.pointerId);
    if (!activePointers.size) resetJoystick();
  }, true);
  window.addEventListener('blur', () => {
    releaseSprint();
    resetJoystick();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseSprint();
      resetJoystick();
    }
  });

  [sprintButton, joystick].forEach((element) => {
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.style.touchAction = 'none';
  });

  window.NeonBlockMobilePointerGuard = {
    getStatus: () => ({
      sprintPointer,
      joystickPointers: activePointers.size,
      installed: true
    }),
    releaseAll: () => {
      releaseSprint();
      resetJoystick();
    }
  };
})();