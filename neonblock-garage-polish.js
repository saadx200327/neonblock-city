(() => {
  'use strict';

  const LEGACY_STORAGE_KEY = 'neonblock:garage:v1';
  const STORAGE_PREFIX = 'neonblock:garage:v2:';
  const PANEL_ID = 'neonblock-garage-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-garage';
  const OWNED_REFUEL_COOLDOWN_MS = 5 * 60 * 1000;

  let currentSlot = resolveSlot();
  const state = loadGarage(currentSlot);
  let panel;
  let statusEl;
  let lastActiveVehicleId = null;
  let slotSwitches = 0;

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

  function sanitizeSlot(value) {
    const slot = String(value || 'slot1').trim();
    return /^[a-z0-9_-]{1,32}$/i.test(slot) ? slot : 'slot1';
  }

  function resolveSlot() {
    return sanitizeSlot(snapshot()?.player?.slot || 'slot1');
  }

  function storageKey(slot = currentSlot) {
    return `${STORAGE_PREFIX}${sanitizeSlot(slot)}`;
  }

  function emptyGarage() {
    return { owned: {}, serviceClaims: {}, hidden: false };
  }

  function normalizeGarage(parsed) {
    return {
      owned: parsed?.owned && typeof parsed.owned === 'object' ? parsed.owned : {},
      serviceClaims: parsed?.serviceClaims && typeof parsed.serviceClaims === 'object' ? parsed.serviceClaims : {},
      hidden: Boolean(parsed?.hidden)
    };
  }

  function loadGarage(slot) {
    try {
      const scopedRaw = localStorage.getItem(storageKey(slot));
      if (scopedRaw) return normalizeGarage(JSON.parse(scopedRaw));

      if (slot === 'slot1') {
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          const migrated = normalizeGarage(JSON.parse(legacyRaw));
          localStorage.setItem(storageKey(slot), JSON.stringify(migrated));
          return migrated;
        }
      }
    } catch (error) {
      console.warn('[NeonBlock Garage] local data could not be loaded', error);
    }
    return emptyGarage();
  }

  function replaceState(next) {
    state.owned = next.owned;
    state.serviceClaims = next.serviceClaims;
    state.hidden = next.hidden;
  }

  function persist() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (error) {
      setStatus('Garage local save failed. Free storage and try again.');
    }
  }

  function syncActiveSlot() {
    const nextSlot = resolveSlot();
    if (nextSlot === currentSlot) return false;

    persist();
    currentSlot = nextSlot;
    replaceState(loadGarage(currentSlot));
    lastActiveVehicleId = null;
    slotSwitches += 1;
    if (panel) panel.classList.toggle('hidden', state.hidden);
    setStatus(`Garage switched to ${currentSlot}. Ownership is isolated to this save.`);
    return true;
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
    syncActiveSlot();
    const snap = snapshot();
    const vehicle = snap?.player?.activeVehicle;
    const id = vehicleId(vehicle);
    if (!vehicle || !id) return setStatus('Enter a nearby car first, then claim it here.');
    if (isOwned(id)) return setStatus(`${vehicleName(vehicle)} is already in your ${currentSlot} garage.`);

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
    setStatus(`${vehicleName(vehicle)} registered to the ${currentSlot} Garage.`);
    render();
  }

  function serviceActiveVehicle() {
    syncActiveSlot();
    const vehicle = activeVehicle();
    const id = vehicleId(vehicle);
    if (!vehicle || !id) return setStatus('Enter an owned vehicle first to use Garage service.');
    if (!isOwned(id)) return setStatus(`Claim this vehicle in ${currentSlot} before using owner service.`);

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
    syncActiveSlot();
    const snap = snapshot();
    const vehicle = activeVehicle();
    const report = {
      feature: 'NeonBlock Garage',
      saveSlot: currentSlot,
      storageKey: storageKey(),
      ownedVehicleCount: Object.keys(state.owned).length,
      slotSwitches,
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
    syncActiveSlot();
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
      <div class="nb-garage-row"><span>Save garage</span><strong>${currentSlot}</strong></div>
      <div class="nb-garage-row"><span>Owned vehicles</span><strong>${ownedCount}</strong></div>
      <div class="nb-garage-row"><span>Current</span><strong>${vehicle ? `${vehicleName(vehicle)}${currentOwned ? ' ✓' : ''}` : 'On foot'}</strong></div>
      <div class="nb-garage-row"><span>Gas / HP</span><strong>${vehicle ? `${gas}% / ${hp}%` : '—'}</strong></div>
      <div class="nb-garage-row"><span>Cash</span><strong>${money(snap?.player?.cash)}</strong></div>
      <div class="nb-garage-actions">
        <button type="button" data-garage-claim ${!vehicle || currentOwned ? 'disabled' : ''}>${currentOwned ? 'Claimed' : 'Claim vehicle'}</button>
        <button type="button" data-garage-service ${!vehicle || !currentOwned ? 'disabled' : ''}>Owner service</button>
        <button type="button" data-garage-copy>Copy report</button>
      </div>
      <div class="nb-garage-list">
        ${records.length ? records.map((record) => `
          <div class="nb-garage-card">
            <strong>${record.name || 'Vehicle'}</strong>
            <span>${record.id}</span>
            <small>Last seen ${nowAge(record.lastSeenAt || record.claimedAt)} • Gas ${record.gas ?? '—'}% • HP ${record.hp ?? '—'}%</small>
          </div>
        `).join('') : `<small>No vehicles claimed in ${currentSlot}. Enter a car and press Claim vehicle.</small>`}
      </div>
      <small>Shortcut: <kbd>;</kbd> toggles Garage. Ownership and service cooldowns stay inside the active save slot.</small>
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
      #${PANEL_ID} button:disabled { opacity: 0.45; cursor: not-allowed; }
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
    const slotChanged = syncActiveSlot();
    const vehicle = activeVehicle();
    const id = vehicleId(vehicle);
    if (vehicle && id) {
      if (id !== lastActiveVehicleId) {
        lastActiveVehicleId = id;
        setStatus(isOwned(id) ? `${vehicleName(vehicle)} recognized in ${currentSlot}.` : `${vehicleName(vehicle)} can be claimed in ${currentSlot}.`);
      }
      touchVehicleRecord(vehicle);
    } else {
      lastActiveVehicleId = null;
    }
    if (slotChanged || !panel?.classList.contains('hidden')) render();
  }

  function getStatus() {
    return {
      saveSlot: currentSlot,
      storageKey: storageKey(),
      ownedVehicleCount: Object.keys(state.owned).length,
      serviceCooldownCount: Object.keys(state.serviceClaims).length,
      activeVehicleId: vehicleId(activeVehicle()),
      activeVehicleOwned: isOwned(vehicleId(activeVehicle())),
      slotSwitches
    };
  }

  function boot() {
    installPanel();
    installMobileButton();
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (event.target?.isContentEditable || (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (event.code === 'Semicolon') togglePanel();
    });
    setInterval(watchActiveVehicle, 1500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persist();
    });
    window.addEventListener('pagehide', persist);
  }

  window.NeonBlockGarage = {
    getStatus,
    syncActiveSlot,
    claimActiveVehicle,
    serviceActiveVehicle
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();