(() => {
  'use strict';

  const STORE_KEY = 'neonblock:driving-assist-hidden';
  const SPEED_WARN = 34;
  const SPEED_LIMIT = 48;
  const REFUEL_COST = 40;
  const REFUEL_AMOUNT = 45;
  let panel;
  let brakeButton;
  let brakeHeld = false;
  let brakePointerId = null;
  let lastWarn = 0;
  let blockedPanelRepeats = 0;
  let blockedRefuelRepeats = 0;
  let refuelCount = 0;
  let forcedBrakeReleases = 0;

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
        touch-action: none;
        -webkit-touch-callout: none;
        user-select: none;
      }
      #btn-mobile-brake[aria-pressed="true"] { transform: scale(0.96); }
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

  function getPlayer() { return snapshot()?.player || null; }

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

  function releaseBrake({ stabilize = false, forced = false } = {}) {
    if (forced && brakeHeld) forcedBrakeReleases++;
    brakeHeld = false;
    brakePointerId = null;
    brakeButton?.setAttribute('aria-pressed', 'false');
    if (stabilize) applyBrake(0.35);
  }

  function refuelVehicle() {
    const player = getPlayer();
    const vehicle = player?.activeVehicle;
    if (!vehicle?.userData) { toast('Enter a vehicle to refuel'); return false; }
    const gas = Number(vehicle.userData.gas) || 0;
    if (gas >= 99.5) { toast('Fuel tank is already full'); return false; }
    if ((Number(player.cash) || 0) < REFUEL_COST) { toast(`Need $${REFUEL_COST} to refuel`); return false; }
    player.cash -= REFUEL_COST;
    vehicle.userData.gas = Math.min(100, gas + REFUEL_AMOUNT);
    refuelCount++;
    window.NeonBlockGame?.saveState?.(player.slot || 'slot1');
    toast(`Refueled +${REFUEL_AMOUNT} gas • -$${REFUEL_COST}`);
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
    brakeButton = document.createElement('button');
    brakeButton.className = 'action-btn';
    brakeButton.id = 'btn-mobile-brake';
    brakeButton.type = 'button';
    brakeButton.textContent = 'Brake';
    brakeButton.setAttribute('aria-label', 'Hold to brake vehicle');
    brakeButton.setAttribute('aria-pressed', 'false');

    brakeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!getPlayer()?.activeVehicle) return;
      brakePointerId = event.pointerId;
      brakeHeld = true;
      brakeButton.setAttribute('aria-pressed', 'true');
      try { brakeButton.setPointerCapture(event.pointerId); } catch (_) {}
      applyBrake(0.42);
    }, { passive: false });

    const stop = (event) => {
      if (brakePointerId !== null && event?.pointerId !== undefined && event.pointerId !== brakePointerId) return;
      releaseBrake();
    };
    brakeButton.addEventListener('pointerup', stop);
    brakeButton.addEventListener('pointercancel', stop);
    brakeButton.addEventListener('lostpointercapture', stop);
    rail.insertBefore(brakeButton, $('btn-mobile-unstuck') || rail.lastChild);
  }

  function installPanel() {
    if ($('driving-assist-panel')) return;
    panel = document.createElement('div');
    panel.id = 'driving-assist-panel';
    panel.innerHTML = `
      <div><strong>Driving Assist</strong> <span id="driving-assist-state">On foot</span></div>
      <div>Speed: <span id="driving-assist-speed">0</span></div>
      <div>Tip: <span id="driving-assist-tip">Enter a vehicle to use brake assist.</span></div>
      <button id="btn-driving-assist-refuel" type="button">Refuel $${REFUEL_COST} (R)</button>
      <button id="btn-driving-assist-hide" type="button">Hide K</button>
    `;
    document.body.appendChild(panel);
    $('btn-driving-assist-refuel')?.addEventListener('click', refuelVehicle);
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
    const refuelButton = $('btn-driving-assist-refuel');
    if (!inVehicle && brakeHeld) releaseBrake({ forced: true });
    if (state) state.textContent = inVehicle ? `${player.activeVehicle.userData?.name || 'Vehicle'} • gas ${gas}` : 'On foot';
    if (speedEl) speedEl.textContent = String(speed);
    if (refuelButton) refuelButton.disabled = !inVehicle || gas >= 100 || (Number(player.cash) || 0) < REFUEL_COST;
    if (tip) {
      tip.textContent = !inVehicle
        ? 'Enter a vehicle, then press Space/X or mobile Brake.'
        : speed > SPEED_WARN
          ? 'Tap Brake before tight turns to avoid overshooting missions.'
          : gas <= 15
            ? `Gas is low. Press R or Refuel for $${REFUEL_COST}.`
            : 'Space/X or mobile Brake slows the car without exiting.';
    }
    clampUnsafeSpeed(player);
  }

  function wireKeys() {
    addEventListener('keydown', (event) => {
      if (event.code === 'KeyK') {
        if (event.repeat) { blockedPanelRepeats++; event.preventDefault(); return; }
        togglePanel();
      }
      if (event.code === 'KeyR') {
        if (event.repeat) { blockedRefuelRepeats++; event.preventDefault(); return; }
        if (getPlayer()?.activeVehicle) { event.preventDefault(); refuelVehicle(); }
      }
      if ((event.code === 'KeyX' || event.code === 'Space') && getPlayer()?.activeVehicle) {
        event.preventDefault();
        brakeHeld = true;
        applyBrake(event.code === 'Space' ? 0.5 : 0.38);
      }
    }, { passive: false });
    addEventListener('keyup', (event) => {
      if (event.code === 'KeyX' || event.code === 'Space') releaseBrake();
    });
    addEventListener('pointerup', (event) => {
      if (brakePointerId !== null && event.pointerId === brakePointerId) releaseBrake();
    }, true);
    addEventListener('pointercancel', (event) => {
      if (brakePointerId !== null && event.pointerId === brakePointerId) releaseBrake({ forced: true });
    }, true);
    addEventListener('blur', () => releaseBrake({ stabilize: true, forced: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseBrake({ stabilize: true, forced: true });
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

  window.NeonBlockDrivingPolish = {
    version: 4,
    refuelVehicle,
    releaseBrake: () => releaseBrake({ stabilize: true, forced: true }),
    getStatus: () => ({
      brakeHeld,
      brakePointerId,
      panelHidden: Boolean(panel?.classList.contains('hidden')),
      blockedPanelRepeats,
      blockedRefuelRepeats,
      forcedBrakeReleases,
      refuelCount,
      refuelCost: REFUEL_COST,
      refuelAmount: REFUEL_AMOUNT,
      speedLimit: SPEED_LIMIT
    })
  };

  const ready = setInterval(() => {
    if (!window.NeonBlockGame?.getSnapshot) return;
    clearInterval(ready);
    boot();
  }, 250);
})();