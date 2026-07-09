(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:vehicle-health-report';
  const PANEL_ID = 'neonblock-vehicle-health-panel';
  const MOBILE_ID = 'btn-mobile-vehicle-health';
  const $ = (id) => document.getElementById(id);

  const state = {
    visible: localStorage.getItem('neonblock:vehicle-health-visible') !== 'false',
    lowHpTicks: 0,
    lastServiceAt: 0,
    lastReport: ''
  };

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

  function activeVehicle(snap = snapshot()) {
    return snap?.player?.activeVehicle || null;
  }

  function popup(text) {
    const reward = $('reward-popup');
    if (!reward) return;
    reward.textContent = text;
    reward.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => reward.classList.add('hidden'), 1800);
  }

  function safeSave() {
    try {
      game()?.saveState?.();
      return true;
    } catch (error) {
      return false;
    }
  }

  function clampVehicle(vehicle) {
    if (!vehicle?.userData) return false;
    let changed = false;
    const hp = Number(vehicle.userData.hp);
    const gas = Number(vehicle.userData.gas);
    if (!Number.isFinite(hp) || hp < 0 || hp > 100) {
      vehicle.userData.hp = Math.max(0, Math.min(100, Number.isFinite(hp) ? hp : 100));
      changed = true;
    }
    if (!Number.isFinite(gas) || gas < 0 || gas > 100) {
      vehicle.userData.gas = Math.max(0, Math.min(100, Number.isFinite(gas) ? gas : 100));
      changed = true;
    }
    return changed;
  }

  function serviceVehicle(kind = 'balanced') {
    const vehicle = activeVehicle();
    const snap = snapshot();
    if (!vehicle) return popup('Enter a vehicle first');
    const now = Date.now();
    if (now - state.lastServiceAt < 3500) return popup('Service cooldown active');
    const player = snap?.player;
    const hp = Math.max(0, Math.min(100, Number(vehicle.userData.hp) || 0));
    const gas = Math.max(0, Math.min(100, Number(vehicle.userData.gas) || 0));
    const missingHp = 100 - hp;
    const missingGas = 100 - gas;
    const targetHp = kind === 'repair' ? Math.min(100, hp + 35) : Math.min(100, hp + 22);
    const targetGas = kind === 'fuel' ? Math.min(100, gas + 45) : Math.min(100, gas + 28);
    const cost = Math.max(15, Math.ceil((targetHp - hp) * 1.4 + (targetGas - gas) * 0.85));
    if (missingHp <= 0 && missingGas <= 0) return popup('Vehicle already healthy');
    if (player && player.cash < cost) return popup(`Need $${cost} for service`);
    if (player) player.cash -= cost;
    vehicle.userData.hp = targetHp;
    vehicle.userData.gas = targetGas;
    state.lastServiceAt = now;
    safeSave();
    popup(`Vehicle serviced: -$${cost}`);
  }

  function statusLine(snap = snapshot()) {
    const vehicle = activeVehicle(snap);
    if (!vehicle) return 'On foot — enter a streamed vehicle, then use service if HP/gas gets low.';
    const hp = Math.round(vehicle.userData.hp ?? 100);
    const gas = Math.round(vehicle.userData.gas ?? 100);
    if (hp <= 20) return `Critical HP ${hp}. Stop driving hard and tap Service.`;
    if (gas <= 15) return `Low gas ${gas}. Use Fuel/Service before missions.`;
    if (hp < 65 || gas < 45) return `Vehicle usable: HP ${hp}, gas ${gas}. Service soon.`;
    return `Vehicle healthy: HP ${hp}, gas ${gas}. Ready for delivery missions.`;
  }

  function makeReport() {
    const snap = snapshot();
    const vehicle = activeVehicle(snap);
    const report = [
      'NeonBlock Vehicle Health QA',
      `time=${new Date().toISOString()}`,
      `chunks=${snap?.chunks ?? 'n/a'}`,
      `vehicles_streamed=${snap?.vehicles ?? 'n/a'}`,
      `active_vehicle=${vehicle?.userData?.name || 'none'}`,
      `hp=${vehicle ? Math.round(vehicle.userData.hp ?? 100) : 'n/a'}`,
      `gas=${vehicle ? Math.round(vehicle.userData.gas ?? 100) : 'n/a'}`,
      `cash=${snap?.player ? Math.floor(snap.player.cash) : 'n/a'}`,
      `status=${statusLine(snap)}`
    ].join('\n');
    state.lastReport = report;
    localStorage.setItem(STORAGE_KEY, report);
    return report;
  }

  function copyReport() {
    const report = makeReport();
    navigator.clipboard?.writeText(report).then(() => popup('Vehicle report copied')).catch(() => popup('Vehicle report ready'));
    render();
  }

  function buildPanel() {
    if ($(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'neonblock-polish-panel';
    panel.innerHTML = `
      <div class="polish-title">Vehicle Health <span>6</span></div>
      <div id="vehicle-health-status" class="polish-line">Waiting for runtime...</div>
      <div id="vehicle-health-stats" class="polish-line">HP -- • Gas --</div>
      <div class="polish-actions">
        <button id="btn-vehicle-service">Service</button>
        <button id="btn-vehicle-fuel">Fuel</button>
        <button id="btn-vehicle-report">Copy QA</button>
      </div>
    `;
    document.body.appendChild(panel);
    $('btn-vehicle-service')?.addEventListener('click', () => serviceVehicle('balanced'));
    $('btn-vehicle-fuel')?.addEventListener('click', () => serviceVehicle('fuel'));
    $('btn-vehicle-report')?.addEventListener('click', copyReport);

    const rail = $('action-rail');
    if (rail && !$(MOBILE_ID)) {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.id = MOBILE_ID;
      btn.textContent = 'Vehicle';
      btn.addEventListener('click', () => {
        state.visible = !state.visible;
        localStorage.setItem('neonblock:vehicle-health-visible', String(state.visible));
        render();
      });
      rail.insertBefore(btn, rail.firstChild);
    }
  }

  function render() {
    buildPanel();
    const panel = $(PANEL_ID);
    const snap = snapshot();
    const vehicle = activeVehicle(snap);
    if (!panel) return;
    panel.style.display = state.visible ? 'block' : 'none';
    $('vehicle-health-status').textContent = statusLine(snap);
    $('vehicle-health-stats').textContent = vehicle
      ? `HP ${Math.round(vehicle.userData.hp ?? 100)} • Gas ${Math.round(vehicle.userData.gas ?? 100)} • Cash $${Math.floor(snap?.player?.cash ?? 0)}`
      : `Streamed vehicles ${snap?.vehicles ?? 0} • Cash $${Math.floor(snap?.player?.cash ?? 0)}`;
  }

  function tick() {
    const vehicle = activeVehicle();
    if (vehicle) {
      if (clampVehicle(vehicle)) safeSave();
      const hp = Number(vehicle.userData.hp ?? 100);
      const gas = Number(vehicle.userData.gas ?? 100);
      if (hp <= 0) {
        vehicle.userData.hp = 12;
        vehicle.userData.gas = Math.max(Number(vehicle.userData.gas || 0), 10);
        popup('Vehicle stabilized instead of breaking');
        safeSave();
      }
      if (hp < 25 || gas < 12) state.lowHpTicks += 1;
      else state.lowHpTicks = 0;
      if (state.lowHpTicks === 8) popup('Vehicle needs service');
    } else {
      state.lowHpTicks = 0;
    }
    render();
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Digit6' || event.repeat || /input|textarea|select/i.test(event.target?.tagName || '')) return;
    state.visible = !state.visible;
    localStorage.setItem('neonblock:vehicle-health-visible', String(state.visible));
    render();
  });

  window.addEventListener('pagehide', () => {
    makeReport();
    safeSave();
  });

  buildPanel();
  render();
  setInterval(tick, 1200);
})();
