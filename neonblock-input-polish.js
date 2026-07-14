(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const keyState = new Map();
  const buttonState = new Map();
  const axisDeadzone = 0.28;
  const idleProbeDelay = 1000;
  const keyByCode = {
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
    KeyE: 'e',
    KeyU: 'u',
    KeyP: 'p',
    ShiftLeft: 'Shift',
    Space: ' '
  };
  const state = {
    frameId: 0,
    idleTimerId: 0,
    suspended: document.hidden,
    connectedPadIndex: null,
    polls: 0,
    idleProbes: 0,
    activeFrames: 0,
    pauses: 0,
    resumes: 0,
    actionPresses: 0,
    disconnectReleases: 0,
    lastLifecycleReason: 'startup'
  };

  function setHudError(message) {
    const target = $('debug-last-error');
    if (target) target.textContent = message || 'none';
  }

  function popup(message, duration = 1600) {
    const target = $('reward-popup');
    if (!target) return;
    target.textContent = message;
    target.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => target.classList.add('hidden'), duration);
  }

  function keyboardEvent(type, code) {
    return new KeyboardEvent(type, {
      code,
      key: keyByCode[code] || code,
      bubbles: true,
      cancelable: true,
      composed: true
    });
  }

  function dispatchKey(type, code) {
    try {
      document.dispatchEvent(keyboardEvent(type, code));
      return true;
    } catch {
      window.dispatchEvent(keyboardEvent(type, code));
      return false;
    }
  }

  function press(code) {
    if (keyState.get(code)) return false;
    keyState.set(code, true);
    dispatchKey('keydown', code);
    return true;
  }

  function release(code) {
    if (!keyState.get(code)) return false;
    keyState.set(code, false);
    dispatchKey('keyup', code);
    return true;
  }

  function releaseAll(reason = 'release-all') {
    let released = 0;
    for (const code of keyState.keys()) {
      if (release(code)) released += 1;
    }
    buttonState.clear();
    state.disconnectReleases += released;
    state.lastLifecycleReason = reason;
    return released;
  }

  function tap(code, label) {
    press(code);
    queueMicrotask(() => release(code));
    state.actionPresses += 1;
    if (label) popup(label, 900);
  }

  function axisToKey(value, negativeCode, positiveCode) {
    if (value < -axisDeadzone) {
      press(negativeCode);
      release(positiveCode);
    } else if (value > axisDeadzone) {
      press(positiveCode);
      release(negativeCode);
    } else {
      release(negativeCode);
      release(positiveCode);
    }
  }

  function buttonPressedOnce(pad, index, code, label) {
    const pressed = Boolean(pad.buttons[index]?.pressed);
    const key = `${pad.index}:${index}`;
    const wasPressed = buttonState.get(key) === true;
    buttonState.set(key, pressed);
    if (pressed && !wasPressed) tap(code, label);
  }

  function clearIdleProbe() {
    if (!state.idleTimerId) return;
    clearTimeout(state.idleTimerId);
    state.idleTimerId = 0;
  }

  function schedulePoll() {
    if (state.frameId || state.suspended) return;
    clearIdleProbe();
    state.frameId = requestAnimationFrame(pollGamepad);
  }

  function scheduleIdleProbe() {
    if (state.idleTimerId || state.frameId || state.suspended) return;
    state.idleTimerId = setTimeout(() => {
      state.idleTimerId = 0;
      state.idleProbes += 1;
      pollGamepad();
    }, idleProbeDelay);
  }

  function pollGamepad() {
    state.frameId = 0;
    if (state.suspended) return;

    state.polls += 1;
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const pad = state.connectedPadIndex === null
      ? pads[0]
      : pads.find((candidate) => candidate.index === state.connectedPadIndex) || pads[0];

    if (!pad) {
      releaseAll('no-controller');
      state.connectedPadIndex = null;
      scheduleIdleProbe();
      return;
    }

    state.activeFrames += 1;
    state.connectedPadIndex = pad.index;
    axisToKey(pad.axes[1] || 0, 'KeyW', 'KeyS');
    axisToKey(pad.axes[0] || 0, 'KeyA', 'KeyD');

    buttonPressedOnce(pad, 0, 'Space');
    buttonPressedOnce(pad, 1, 'KeyE');
    buttonPressedOnce(pad, 2, 'KeyU');
    buttonPressedOnce(pad, 9, 'KeyP');

    if (pad.buttons[7]?.pressed || pad.buttons[10]?.pressed) press('ShiftLeft');
    else release('ShiftLeft');

    schedulePoll();
  }

  function pausePolling(reason) {
    if (state.suspended) return;
    state.suspended = true;
    state.pauses += 1;
    state.lastLifecycleReason = reason;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    clearIdleProbe();
    releaseAll(reason);
  }

  function resumePolling(reason) {
    if (document.hidden || !state.suspended) return;
    state.suspended = false;
    state.resumes += 1;
    state.lastLifecycleReason = reason;
    if (state.connectedPadIndex === null) scheduleIdleProbe();
    else schedulePoll();
  }

  function addGamepadStatus() {
    window.addEventListener('gamepadconnected', (event) => {
      state.connectedPadIndex = event.gamepad.index;
      clearIdleProbe();
      popup(`Controller connected: ${event.gamepad.id.slice(0, 28)}`);
      setHudError('none');
      schedulePoll();
    });
    window.addEventListener('gamepaddisconnected', (event) => {
      if (state.connectedPadIndex === event.gamepad.index) state.connectedPadIndex = null;
      releaseAll('controller-disconnected');
      popup('Controller disconnected');
      scheduleIdleProbe();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pausePolling('visibility-hidden');
      else resumePolling('visibility-visible');
    });
    window.addEventListener('pagehide', () => pausePolling('pagehide'), { passive: true });
    window.addEventListener('pageshow', () => resumePolling('pageshow'), { passive: true });
    document.addEventListener('freeze', () => pausePolling('freeze'));
    document.addEventListener('resume', () => resumePolling('resume'));

    scheduleIdleProbe();
  }

  function wireMissionClose() {
    const close = $('btn-close-missions');
    const board = $('mission-board');
    if (!close || !board) return;
    close.addEventListener('click', () => board.classList.add('hidden'));
  }

  function wireInstallPrompt() {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      const panel = $('settings-panel');
      if (!panel || $('btn-install-pwa')) return;
      const button = document.createElement('button');
      button.id = 'btn-install-pwa';
      button.textContent = 'Install App';
      button.addEventListener('click', async () => {
        if (!deferredPrompt) return popup('Install prompt is not ready yet');
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
      });
      panel.insertBefore(button, panel.querySelector('#btn-close-settings'));
    });
  }

  function protectSaveStorage() {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, value) => {
      try {
        originalSetItem(key, value);
      } catch (error) {
        if (String(key).startsWith('neonblock')) {
          setHudError('storage full: exported backup recommended');
          popup('Storage full — export your save JSON', 2400);
        }
        throw error;
      }
    };
  }

  function reflectNetworkState() {
    const update = () => {
      const status = navigator.onLine ? 'local' : 'offline';
      const top = $('hud-online');
      const debug = $('debug-online');
      if (top && top.textContent !== 'cloud ready') top.textContent = status;
      if (debug && debug.textContent !== 'cloud ready') debug.textContent = status;
    };
    window.addEventListener('online', () => { update(); popup('Back online'); });
    window.addEventListener('offline', () => { update(); popup('Offline mode: local saves still work'); });
    update();
  }

  function protectCanvasContext() {
    const canvas = $('game-canvas');
    if (!canvas) return;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      setHudError('WebGL context lost: reload if the city disappears');
      popup('Graphics context paused — reload if needed', 2600);
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      setHudError('none');
      popup('Graphics context restored');
    }, false);
  }

  function respectReducedMotion() {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('reduced-motion');
    const select = $('graphics-quality');
    if (select && select.value === 'auto') select.value = 'low';
    popup('Reduced motion detected: Low graphics recommended', 2200);
  }

  function boot() {
    try {
      protectSaveStorage();
      addGamepadStatus();
      wireMissionClose();
      wireInstallPrompt();
      reflectNetworkState();
      protectCanvasContext();
      respectReducedMotion();
      window.NeonBlockInputPolish = {
        version: 3,
        releaseAll: () => releaseAll('manual'),
        getStatus: () => ({ ...state, heldKeys: [...keyState].filter(([, held]) => held).map(([code]) => code) })
      };
    } catch (error) {
      setHudError(error.message || String(error));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();