(() => {
  'use strict';

  const STORE_KEY = 'neonblock:driving-assist-hidden';
  const SPEED_WARN = 34;
  const SPEED_LIMIT = 48;
  let panel;
  let brakeHeld = false;
  let lastWarn = 0;

  const $ = (id) => document.getElementById(id);

  function css() {
    const style = document.createElement('style');
    style.textContent = `
      #driving-assist-panel {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: calc(128px + env(safe-area-inset-bottom));
        z-index: 24;
        width: min(270px, calc(100vw - 24px));
        padding: 10px 12px;
        border: 1px solid rgba(94, 243, 140, 0.35);
        border-radius: 14px;
        background: rgba(5, 8, 20, 0.76);
        color: #e9fbff;
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32);
        backdrop-filter: blur(10px);
      }
      #driving-assist-panel.hidden { display: none !important; }
      #driving-assist-panel strong { color: #5ef38c; }
      #driving-assist-panel button {
        margin-top: 7px;
        min-height: 32px;
        border: 1px solid rgba(94, 243, 140, 0.4);
        border-radius: 10px;
        background: rgba(94, 243, 140, 0.13);
        color: #e9fbff;
      }
      #btn-mobile-brake {
        border-color: rgba(255, 204, 51, 0.7);
        background: rgba(255, 204, 51, 0.16);
      }
      @media (min-width: 820px) {
        #driving-assist-panel { bottom: 18px; left: 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 1400);
  }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.(); } catch (_) { return null; }
  }

  function getPlayer() {
    return snapshot()?.player || null;
  }

  function horizontalSpeed(player) {
    if (!player?.vel) return 0;
    return Math.hypot(player.vel.x || 0, player.vel.z || 0);
  }

  function applyBrake(multiplier = 0.58) {
    const player = getPlayer();
    if (!player?.activeVehicle || !player.vel) return false;
    player.vel.x *= multiplier;
    player.vel.z *= multiplier;
    return true;
  }

  function clampUnsafeSpeed(player) {
    if (!player?.activeVehicle || !player.vel) return;
    const speed = horizontalSpeed(player);
    if (speed <= SPEED_LIMIT) return;
    const scale = SPEED_LIMIT / speed;
    player.vel.x *= scale;
    player.vel.z *= scale;
    const now = Date.now();
    if (now - lastWarn > 2500) {
      lastWarn = now;
      toast('Speed stabilized to protect mobile physics');
    }
  }

  function installMobileBrake() {
    const rail = $('action-rail');
    if (!rail || $('btn-mobile-brake')) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = 'btn-mobile-brake';
    button.type = 'button';
    button.textContent = 'Brake';
    const start = (event) => { event.preventDefault(); brakeHeld = true; applyBrake(0.42); };
    const stop = () => { brakeHeld = false; };
    button.addEventListener('pointerdown', start, { passive: false });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', stop);
    rail.insertBefore(button, $('btn-mobile-unstuck') || rail.lastChild);
  }

  function installPanel() {
    if ($('driving-assist-panel')) return;
    panel = document.createElement('div');
    panel.id = 'driving-assist-panel';
    panel.innerHTML = `
      <div><strong>Driving Assist</strong> <span id="driving-assist-state">On foot</span></div>
      <div>Speed: <span id="driving-assist-speed">0</span></div>
      <div>Tip: <span id="driving-assist-tip">Enter a vehicle to use brake assist.</span></div>
      <button id="btn-driving-assist-hide" type="button">Hide K</button>
    `;
    document.body.appendChild(panel);
    $('btn-driving-assist-hide')?.addEventListener('click', togglePanel);
    panel.classList.toggle('hidden', localStorage.getItem(STORE_KEY) === '1');
  }

  function togglePanel() {
    if (!panel) return;
    const hidden = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', hidden);
    localStorage.setItem(STORE_KEY, hidden ? '1' : '0');
  }

  function updatePanel() {
    const player = getPlayer();
    if (!player || !panel) return;
    const inVehicle = Boolean(player.activeVehicle);
    const speed = Math.round(horizontalSpeed(player));
    const gas = Math.round(player.activeVehicle?.userData?.gas ?? 100);
    const state = $('driving-assist-state');
    const speedEl = $('driving-assist-speed');
    const tip = $('driving-assist-tip');
    if (state) state.textContent = inVehicle ? `${player.activeVehicle.userData?.name || 'Vehicle'} • gas ${gas}` : 'On foot';
    if (speedEl) speedEl.textContent = String(speed);
    if (tip) {
      tip.textContent = !inVehicle
        ? 'Enter a vehicle, then press Space/X or mobile Brake.'
        : speed > SPEED_WARN
          ? 'Tap Brake before tight turns to avoid overshooting missions.'
          : gas <= 15
            ? 'Gas is low. Use R or Refuel before long delivery routes.'
            : 'Space/X or mobile Brake slows the car without exiting.';
    }
    clampUnsafeSpeed(player);
  }

  function wireKeys() {
    addEventListener('keydown', (event) => {
      if (event.code === 'KeyK') togglePanel();
      if ((event.code === 'KeyX' || event.code === 'Space') && getPlayer()?.activeVehicle) {
        event.preventDefault();
        brakeHeld = true;
        applyBrake(event.code === 'Space' ? 0.5 : 0.38);
      }
    }, { passive: false });
    addEventListener('keyup', (event) => {
      if (event.code === 'KeyX' || event.code === 'Space') brakeHeld = false;
    });
    addEventListener('blur', () => {
      brakeHeld = false;
      applyBrake(0.35);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        brakeHeld = false;
        applyBrake(0.35);
      }
    });
  }

  function loop() {
    if (brakeHeld) applyBrake(0.86);
    updatePanel();
    requestAnimationFrame(loop);
  }

  function boot() {
    css();
    installPanel();
    installMobileBrake();
    wireKeys();
    requestAnimationFrame(loop);
  }

  const ready = setInterval(() => {
    if (!window.NeonBlockGame?.getSnapshot) return;
    clearInterval(ready);
    boot();
  }, 250);
})();
