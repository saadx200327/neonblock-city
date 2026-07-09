(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:garage:v1';
  const PANEL_ID = 'neonblock-garage-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-garage';
  const OWNED_REFUEL_COOLDOWN_MS = 5 * 60 * 1000;

  const state = loadGarage();
  let panel;
  let statusEl;
  let lastActiveVehicleId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function game() {
    return window.NeonBlockGame || null;
  }

  function snapshot() {
    try {
      return game()?.getSnapshot?.() || null;
    } catch (error) {
      return null;
    }
  }

  function loadGarage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        owned: parsed.owned && typeof parsed.owned === 'object' ? parsed.owned : {},
        serviceClaims: parsed.serviceClaims && typeof parsed.serviceClaims === 'object' ? parsed.serviceClaims : {},
        hidden: Boolean(parsed.hidden)
      };
    } catch (error) {
      return { owned: {}, serviceClaims: {}, hidden: false };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      setStatus('Garage local save failed. Free storage and try again.');
    }
  }

  function activeVehicle() {
    return snapshot()?.player?.activeVehicle || null;
  }

  function vehicleId(vehicle) {
    return vehicle?.userData?.id || null;
  }

  function vehicleName(vehicle) {
    return vehicle?.userData?.name || 'Vehicle';
  }

  function isOwned(id) {
    return Boolean(id && state.owned[id]);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function money(value) {
    return `$${Math.max(0, Math.floor(value || 0))}`;
  }

  function nowAge(timestamp) {
    if (!timestamp) return 'never';
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  }

  function claimActiveVehicle() {
    const snap = snapshot();
    const vehicle = snap?.player?.activeVehicle;
    const id = vehicleId(vehicle);
    if (!vehicle || !id) return setStatus('Enter a nearby car first, then claim it here.');
    if (isOwned(id)) return setStatus(`${vehicleName(vehicle)} is already in your garage.`);

    state.owned[id] = {
      id,
      name: vehicleName(vehicle),
      claimedAt: Date.now(),
      lastSeenAt: Date.now(),
      gas: Math.round(vehicle.userData?.gas ?? 0),
      hp: Math.round(vehicle.userData?.hp ?? 100),
      pos: vehicle.position?.toArray?.() || null
    };
    persist();
    safeSave();
    setStatus(`${vehicleName(vehicle)} registered to your Garage.`);
    render();
  }

  function serviceActiveVehicle() {
    const vehicle = activeVehicle();
    const id = vehicleId(vehicle);
    if (!vehicle || !id) return setStatus('Enter an owned vehicle first to use Garage service.');
    if (!isOwned(id)) return setStatus('Claim this vehicle before using owner service.');

    const lastClaim = state.serviceClaims[id] || 0;
    const remaining = OWNED_REFUEL_COOLDOWN_MS - (Date.now() - lastClaim);
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60000);
      return setStatus(`Garage service cooldown: ${minutes}m remaining.`);
    }

    vehicle.userData.gas = Math.min(100, Math.max(vehicle.userData.gas || 0, 75));
    vehicle.userData.hp = Math.min(100, Math.max(vehicle.userData.hp || 0, 90));
    state.serviceClaims[id] = Date.now();
    touchVehicleRecord(vehicle);
    persist();
    safeSave();
    setStatus('Owner service applied: gas to 75%+, HP to 90%+.');
    render();
  }

  function touchVehicleRecord(vehicle) {
    const id = vehicleId(vehicle);
    if (!id || !state.owned[id]) return;
    state.owned[id] = {
      ...state.owned[id],
      name: vehicleName(vehicle),
      lastSeenAt: Date.now(),
      gas: Math.round(vehicle.userData?.gas ?? state.owned[id].gas ?? 0),
      hp: Math.round(vehicle.userData?.hp ?? state.owned[id].hp ?? 100),
      pos: vehicle.position?.toArray?.() || state.owned[id].pos || null
    };
    persist();
  }

  function safeSave() {
    try {
      game()?.saveState?.();
    } catch (error) {
      setStatus(`Local save skipped: ${error.message}`);
    }
  }

  function copyReport() {
    const snap = snapshot();
    const vehicle = activeVehicle();
    const report = {
      feature: 'NeonBlock Garage',
      ownedVehicleCount: Object.keys(state.owned).length,
      activeVehicle: vehicle ? {
        id: vehicleId(vehicle),
        name: vehicleName(vehicle),
        owned: isOwned(vehicleId(vehicle)),
        gas: Math.round(vehicle.userData?.gas ?? 0),
        hp: Math.round(vehicle.userData?.hp ?? 100)
      } : null,
      player: snap?.player?.mesh?.position?.toArray ? {
        position: snap.player.mesh.position.toArray().map((n) => Number(n.toFixed(2))),
        cash: Math.floor(snap.player.cash || 0),
        level: snap.player.level || 1
      } : null,
      savedAt: new Date().toISOString()
    };
    const text = JSON.stringify(report, null, 2);
    navigator.clipboard?.writeText(text).then(() => setStatus('Garage QA report copied.')).catch(() => {
      setStatus(text);
    });
  }

  function togglePanel(force) {
    if (!panel) return;
    const hidden = typeof force === 'boolean' ? force : !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', hidden);
    state.hidden = hidden;
    persist();
    if (!hidden) render();
  }

  function render() {
    if (!panel) return;
    const snap = snapshot();
    const vehicle = activeVehicle();
    const id = vehicleId(vehicle);
    const ownedCount = Object.keys(state.owned).length;
    const currentOwned = isOwned(id);
    const gas = Math.round(vehicle?.userData?.gas ?? 0);
    const hp = Math.round(vehicle?.userData?.hp ?? 100);
    const records = Object.values(state.owned)
      .sort((a, b) => (b.lastSeenAt || b.claimedAt || 0) - (a.lastSeenAt || a.claimedAt || 0))
      .slice(0, 4);

    panel.querySelector('[data-garage-body]').innerHTML = `
      <div class="nb-garage-row"><span>Owned vehicles</span><strong>${ownedCount}</strong></div>
      <div class="nb-garage-row"><span>Current</span><strong>${vehicle ? `${vehicleName(vehicle)}${currentOwned ? ' ✓' : ''}` : 'On foot'}</strong></div>
      <div class="nb-garage-row"><span>Gas / HP</span><strong>${vehicle ? `${gas}% / ${hp}%` : '—'}</strong></div>
      <div class="nb-garage-row"><span>Cash</span><strong>${money(snap?.player?.cash)}</strong></div>
      <div class="nb-garage-actions">
        <button type="button" data-garage-claim>${currentOwned ? 'Claimed' : 'Claim vehicle'}</button>
        <button type="button" data-garage-service>Owner service</button>
        <button type="button" data-garage-copy>Copy report</button>
      </div>
      <div class="nb-garage-list">
        ${records.length ? records.map((record) => `
          <div class="nb-garage-card">
            <strong>${record.name || 'Vehicle'}</strong>
            <span>${record.id}</span>
            <small>Last seen ${nowAge(record.lastSeenAt || record.claimedAt)} • Gas ${record.gas ?? '—'}% • HP ${record.hp ?? '—'}%</small>
          </div>
        `).join('') : '<small>No vehicles claimed yet. Enter a car and press Claim vehicle.</small>'}
      </div>
      <small>Shortcut: <kbd>;</kbd> toggles Garage. Owned vehicles keep a local registry and get cooldown-based service.</small>
    `;

    panel.querySelector('[data-garage-claim]')?.addEventListener('click', claimActiveVehicle);
    panel.querySelector('[data-garage-service]')?.addEventListener('click', serviceActiveVehicle);
    panel.querySelector('[data-garage-copy]')?.addEventListener('click', copyReport);
  }

  function installStyles() {
    if ($('neonblock-garage-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-garage-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: max(168px, calc(env(safe-area-inset-bottom) + 132px));
        width: min(320px, calc(100vw - 24px));
        z-index: 32;
        padding: 12px;
        border: 1px solid rgba(23, 243, 255, 0.32);
        border-radius: 16px;
        background: rgba(5, 8, 20, 0.82);
        box-shadow: 0 0 26px rgba(23, 243, 255, 0.15);
        color: #e9fbff;
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(12px);
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h3 { margin: 0 0 8px; font-size: 15px; color: #17f3ff; }
      #${PANEL_ID} button {
        border: 1px solid rgba(23, 243, 255, 0.4);
        border-radius: 10px;
        padding: 8px 9px;
        color: #e9fbff;
        background: rgba(23, 243, 255, 0.1);
      }
      .nb-garage-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .nb-garage-row { display: flex; justify-content: space-between; gap: 8px; margin: 5px 0; }
      .nb-garage-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
      .nb-garage-list { display: grid; gap: 6px; margin: 8px 0; }
      .nb-garage-card { display: grid; gap: 2px; padding: 7px; border-radius: 10px; background: rgba(255,255,255,0.06); }
      .nb-garage-card span, #${PANEL_ID} small { color: rgba(233, 251, 255, 0.76); }
      #${PANEL_ID} kbd { padding: 1px 5px; border-radius: 5px; background: rgba(255,255,255,0.12); }
      @media (max-width: 760px) {
        #${PANEL_ID} { bottom: max(202px, calc(env(safe-area-inset-bottom) + 170px)); font-size: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    if ($(PANEL_ID)) return;
    installStyles();
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = state.hidden ? 'hidden' : '';
    panel.innerHTML = `
      <div class="nb-garage-head">
        <h3>Garage</h3>
        <button type="button" data-garage-hide>Hide</button>
      </div>
      <div data-garage-body></div>
      <small id="neonblock-garage-status">Local vehicle ownership only. No backend required.</small>
    `;
    document.body.appendChild(panel);
    statusEl = $('neonblock-garage-status');
    panel.querySelector('[data-garage-hide]')?.addEventListener('click', () => togglePanel(true));
    render();
  }

  function installMobileButton() {
    const rail = $('action-rail');
    if (!rail || $(MOBILE_BUTTON_ID)) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = MOBILE_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Garage';
    button.addEventListener('click', () => togglePanel(false));
    rail.insertBefore(button, rail.firstChild);
  }

  function watchActiveVehicle() {
    const vehicle = activeVehicle();
    const id = vehicleId(vehicle);
    if (vehicle && id) {
      if (id !== lastActiveVehicleId) {
        lastActiveVehicleId = id;
        setStatus(isOwned(id) ? `${vehicleName(vehicle)} recognized from Garage.` : `${vehicleName(vehicle)} can be claimed.`);
      }
      touchVehicleRecord(vehicle);
    } else {
      lastActiveVehicleId = null;
    }
    render();
  }

  function boot() {
    installPanel();
    installMobileButton();
    window.addEventListener('keydown', (event) => {
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.code === 'Semicolon') togglePanel();
    });
    setInterval(watchActiveVehicle, 1500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persist();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
