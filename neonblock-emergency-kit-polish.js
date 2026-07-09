(() => {
  'use strict';

  const PANEL_ID = 'neonblock-emergency-kit-panel';
  const MOBILE_ID = 'btn-mobile-emergency-kit';
  const REPORT_KEY = 'neonblock:emergency-kit-report';
  const VISIBLE_KEY = 'neonblock:emergency-kit-visible';
  const $ = (id) => document.getElementById(id);

  const state = {
    visible: localStorage.getItem(VISIBLE_KEY) !== 'false',
    lastTowAt: 0,
    lastHealAt: 0,
    lastReport: localStorage.getItem(REPORT_KEY) || ''
  };

  function game() {
    return window.NeonBlockGame || null;
  }

  function snapshot() {
    try {
      return game()?.getSnapshot?.() || null;
    } catch (_) {
      return null;
    }
  }

  function player(snap = snapshot()) {
    return snap?.player || null;
  }

  function popup(text) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function safeSave() {
    try {
      game()?.saveState?.();
      return true;
    } catch (_) {
      return false;
    }
  }

  function clampPlayerPosition(reason = 'manual') {
    const snap = snapshot();
    const p = player(snap);
    const mesh = p?.mesh;
    if (!mesh?.position) return false;

    const pos = mesh.position;
    const unsafe = !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) || pos.y < 0.45 || Math.abs(pos.x) > 900 || Math.abs(pos.z) > 900;
    if (!unsafe && reason !== 'manual') return false;

    const clamp = (value) => Number.isFinite(value) ? Math.max(-220, Math.min(220, value)) : 0;
    pos.set(clamp(pos.x), 3, clamp(pos.z));
    p.vel?.set?.(0, 0, 0);
    if (p.activeVehicle?.position) {
      p.activeVehicle.position.copy(pos);
      p.activeVehicle.position.y = 0.65;
      p.activeVehicle.userData.gas = Math.max(Number(p.activeVehicle.userData.gas || 0), 18);
      p.activeVehicle.userData.hp = Math.max(Number(p.activeVehicle.userData.hp || 0), 20);
    }
    safeSave();
    popup(reason === 'auto' ? 'Emergency Kit auto-recovered position' : 'Emergency Kit moved you to safe ground');
    return true;
  }

  function towToHub() {
    const snap = snapshot();
    const p = player(snap);
    if (!p?.mesh?.position) return popup('Runtime not ready yet');
    const now = Date.now();
    if (now - state.lastTowAt < 5000) return popup('Emergency tow cooldown active');
    const cost = p.activeVehicle ? 35 : 10;
    if ((p.cash || 0) < cost) return popup(`Need $${cost} for emergency tow`);
    p.cash -= cost;
    p.mesh.position.set(0, 3, 0);
    p.vel?.set?.(0, 0, 0);
    if (p.activeVehicle?.position) {
      p.activeVehicle.position.set(0, 0.65, 0);
      p.activeVehicle.userData.gas = Math.max(Number(p.activeVehicle.userData.gas || 0), 25);
      p.activeVehicle.userData.hp = Math.max(Number(p.activeVehicle.userData.hp || 0), 30);
    }
    state.lastTowAt = now;
    safeSave();
    popup(`Emergency tow: -$${cost}`);
    render();
  }

  function fieldRepair() {
    const snap = snapshot();
    const p = player(snap);
    const vehicle = p?.activeVehicle;
    if (!vehicle?.userData) return popup('Enter a vehicle first');
    const now = Date.now();
    if (now - state.lastHealAt < 4500) return popup('Repair cooldown active');
    const hp = Math.max(0, Math.min(100, Number(vehicle.userData.hp) || 0));
    const gas = Math.max(0, Math.min(100, Number(vehicle.userData.gas) || 0));
    if (hp >= 50 && gas >= 20) return popup('Vehicle is safe enough');
    const cost = Math.max(20, Math.ceil((50 - Math.min(50, hp)) * 1.2 + (20 - Math.min(20, gas)) * 0.8));
    if ((p.cash || 0) < cost) return popup(`Need $${cost} for field repair`);
    p.cash -= cost;
    vehicle.userData.hp = Math.max(hp, 50);
    vehicle.userData.gas = Math.max(gas, 20);
    state.lastHealAt = now;
    safeSave();
    popup(`Field repair: -$${cost}`);
    render();
  }

  function statusText(snap = snapshot()) {
    const p = player(snap);
    if (!p?.mesh?.position) return 'Waiting for game runtime...';
    const pos = p.mesh.position;
    const vehicle = p.activeVehicle;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return 'Invalid position detected — recover now.';
    if (pos.y < 0.45) return 'Below safe ground — recover now.';
    if (Math.abs(pos.x) > 900 || Math.abs(pos.z) > 900) return 'Far outside streamed city — recover now.';
    if (vehicle?.userData && (Number(vehicle.userData.hp || 0) < 25 || Number(vehicle.userData.gas || 0) < 12)) return 'Vehicle critical — use Field Repair.';
    return 'Safe. Use Tow only if stuck, lost, or testing recovery.';
  }

  function makeReport() {
    const snap = snapshot();
    const p = player(snap);
    const vehicle = p?.activeVehicle;
    const pos = p?.mesh?.position;
    const report = [
      'NeonBlock Emergency Kit QA',
      `time=${new Date().toISOString()}`,
      `position=${pos ? `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}` : 'n/a'}`,
      `chunks=${snap?.chunks ?? 'n/a'}`,
      `vehicles=${snap?.vehicles ?? 'n/a'}`,
      `cash=${p ? Math.floor(p.cash || 0) : 'n/a'}`,
      `active_vehicle=${vehicle?.userData?.name || 'none'}`,
      `vehicle_hp=${vehicle ? Math.round(vehicle.userData.hp ?? 100) : 'n/a'}`,
      `vehicle_gas=${vehicle ? Math.round(vehicle.userData.gas ?? 100) : 'n/a'}`,
      `status=${statusText(snap)}`
    ].join('\n');
    state.lastReport = report;
    localStorage.setItem(REPORT_KEY, report);
    return report;
  }

  function copyReport() {
    const report = makeReport();
    navigator.clipboard?.writeText(report).then(() => popup('Emergency report copied')).catch(() => popup('Emergency report ready'));
    render();
  }

  function buildPanel() {
    if ($(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'neonblock-polish-panel';
    panel.innerHTML = `
      <div class="polish-title">Emergency Kit <span>5</span></div>
      <div id="emergency-kit-status" class="polish-line">Waiting for runtime...</div>
      <div id="emergency-kit-stats" class="polish-line">Pos -- • Cash --</div>
      <div class="polish-actions">
        <button id="btn-emergency-recover">Recover</button>
        <button id="btn-emergency-tow">Tow Hub</button>
        <button id="btn-emergency-repair">Field Repair</button>
        <button id="btn-emergency-report">Copy QA</button>
      </div>
    `;
    document.body.appendChild(panel);
    $('btn-emergency-recover')?.addEventListener('click', () => { clampPlayerPosition('manual'); render(); });
    $('btn-emergency-tow')?.addEventListener('click', towToHub);
    $('btn-emergency-repair')?.addEventListener('click', fieldRepair);
    $('btn-emergency-report')?.addEventListener('click', copyReport);

    const rail = $('action-rail');
    if (rail && !$(MOBILE_ID)) {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.id = MOBILE_ID;
      btn.textContent = 'SOS';
      btn.addEventListener('click', () => {
        state.visible = !state.visible;
        localStorage.setItem(VISIBLE_KEY, String(state.visible));
        render();
      });
      rail.insertBefore(btn, rail.firstChild);
    }
  }

  function render() {
    buildPanel();
    const panel = $(PANEL_ID);
    if (!panel) return;
    panel.style.display = state.visible ? 'block' : 'none';
    const snap = snapshot();
    const p = player(snap);
    const pos = p?.mesh?.position;
    const vehicle = p?.activeVehicle;
    $('emergency-kit-status').textContent = statusText(snap);
    $('emergency-kit-stats').textContent = pos
      ? `Pos ${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)} • Cash $${Math.floor(p.cash || 0)} • ${vehicle ? `${vehicle.userData.name} HP ${Math.round(vehicle.userData.hp ?? 100)} Gas ${Math.round(vehicle.userData.gas ?? 100)}` : 'On foot'}`
      : 'Runtime not ready';
  }

  function tick() {
    clampPlayerPosition('auto');
    render();
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Digit5' || event.repeat || /input|textarea|select/i.test(event.target?.tagName || '')) return;
    state.visible = !state.visible;
    localStorage.setItem(VISIBLE_KEY, String(state.visible));
    render();
  });

  window.addEventListener('pagehide', () => {
    makeReport();
    safeSave();
  });

  buildPanel();
  render();
  setInterval(tick, 1400);
})();
