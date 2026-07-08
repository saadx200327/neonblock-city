(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const keyState = new Map();
  const axisDeadzone = 0.28;
  const repeatMs = 180;
  const lastTap = new Map();

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

  function press(code) {
    if (keyState.get(code)) return;
    keyState.set(code, true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  }

  function release(code) {
    if (!keyState.get(code)) return;
    keyState.set(code, false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  }

  function tap(code, label) {
    const now = performance.now();
    if (now - (lastTap.get(code) || 0) < repeatMs) return;
    lastTap.set(code, now);
    press(code);
    setTimeout(() => release(code), 60);
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

  function pollGamepad() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const pad = pads[0];
    if (!pad) {
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].forEach(release);
      requestAnimationFrame(pollGamepad);
      return;
    }

    axisToKey(pad.axes[1] || 0, 'KeyW', 'KeyS');
    axisToKey(pad.axes[0] || 0, 'KeyA', 'KeyD');

    if (pad.buttons[0]?.pressed) tap('Space');
    if (pad.buttons[1]?.pressed) tap('KeyE');
    if (pad.buttons[2]?.pressed) tap('KeyU');
    if (pad.buttons[9]?.pressed) tap('KeyP');
    if (pad.buttons[7]?.pressed || pad.buttons[10]?.pressed) press('ShiftLeft');
    else release('ShiftLeft');

    requestAnimationFrame(pollGamepad);
  }

  function addGamepadStatus() {
    window.addEventListener('gamepadconnected', (event) => {
      popup(`Controller connected: ${event.gamepad.id.slice(0, 28)}`);
      setHudError('none');
    });
    window.addEventListener('gamepaddisconnected', () => {
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].forEach(release);
      popup('Controller disconnected');
    });
    requestAnimationFrame(pollGamepad);
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
      window.NeonBlockInputPolish = { version: 1 };
    } catch (error) {
      setHudError(error.message || String(error));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
