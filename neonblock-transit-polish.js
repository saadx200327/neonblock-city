(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:transit-state';
  const REPORT_KEY = 'neonblock:transit-report';
  const BUTTON_ID = 'btn-mobile-transit';
  const PANEL_ID = 'neonblock-transit-panel';

  const STOPS = [
    { id: 'hub', name: 'Spawn Hub', x: 0, z: 0, cost: 0, hint: 'central safe return' },
    { id: 'courier', name: 'Courier Yard', x: 55, z: -50, cost: 35, hint: 'courier mission zone' },
    { id: 'garage', name: 'Garage Row', x: 12, z: 48, cost: 45, hint: 'vehicle recovery lane' },
    { id: 'market', name: 'Market Blocks', x: -48, z: 42, cost: 45, hint: 'property and crate route' },
    { id: 'driver', name: 'Driver Dropoff', x: -70, z: 65, cost: 60, hint: 'vehicle delivery zone' }
  ];

  let visible = false;
  let state = loadState();
  let panel;
  let lastReport = loadReport();
  let lastRender = 0;

  function loadState() {
    try {
      return Object.assign({ unlocked: { hub: true }, trips: 0, spent: 0, lastStop: 'hub', visited: {} }, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (_) {
      return { unlocked: { hub: true }, trips: 0, spent: 0, lastStop: 'hub', visited: {} };
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function loadReport() {
    try { return JSON.parse(localStorage.getItem(REPORT_KEY) || 'null'); } catch (_) { return null; }
  }

  function saveReport(report) {
    lastReport = report;
    try { localStorage.setItem(REPORT_KEY, JSON.stringify(report)); } catch (_) {}
  }

  function game() {
    return window.NeonBlockGame;
  }

  function snapshot() {
    return game()?.getSnapshot?.() || null;
  }

  function player() {
    return snapshot()?.player || null;
  }

  function pos() {
    const p = player();
    return p?.mesh?.position || null;
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => el.classList.add('hidden'), 1700);
  }

  function distanceTo(stop) {
    const p = pos();
    if (!p) return Infinity;
    return Math.hypot((p.x || 0) - stop.x, (p.z || 0) - stop.z);
  }

  function nearestStop() {
    return STOPS.slice().sort((a, b) => distanceTo(a) - distanceTo(b))[0];
  }

  function discoverStops() {
    const snap = snapshot();
    if (!snap) return;
    const ownedCount = Object.keys(snap.player?.ownedLots || {}).length;
    const chunks = snap.chunks || 0;
    STOPS.forEach((stop) => {
      const d = distanceTo(stop);
      if (d < 34 || (stop.id === 'market' && ownedCount > 0) || chunks >= 9) {
        state.unlocked[stop.id] = true;
        state.visited[stop.id] = (state.visited[stop.id] || 0) + (d < 18 ? 1 : 0);
      }
    });
    state.unlocked.hub = true;
    saveState();
  }

  function setPlayerPosition(stop) {
    const snap = snapshot();
    const p = snap?.player;
    if (!p?.mesh?.position) return false;
    p.mesh.position.set(stop.x, 1, stop.z);
    if (p.vel?.set) p.vel.set(0, 0, 0);
    if (p.activeVehicle?.position?.set) {
      p.activeVehicle.position.set(stop.x + 3, 0.65, stop.z + 2);
      if (p.activeVehicle.userData) p.activeVehicle.userData.gas = Math.max(8, Number(p.activeVehicle.userData.gas) || 0);
    }
    return true;
  }

  function canPay(stop) {
    const p = player();
    return stop.cost <= 0 || (p && Number(p.cash) >= stop.cost);
  }

  function travel(stopId) {
    discoverStops();
    const stop = STOPS.find((item) => item.id === stopId);
    const p = player();
    if (!stop || !p) return popup('Transit unavailable until game loads');
    if (!state.unlocked[stop.id]) return popup('Transit stop locked: discover it first');
    if (!canPay(stop)) return popup(`Need $${stop.cost} for transit`);
    if (stop.cost > 0) p.cash = Math.max(0, Number(p.cash || 0) - stop.cost);
    if (!setPlayerPosition(stop)) return popup('Transit failed: player not ready');
    state.trips += 1;
    state.spent += stop.cost;
    state.lastStop = stop.id;
    state.visited[stop.id] = (state.visited[stop.id] || 0) + 1;
    saveState();
    try { game()?.saveState?.(); } catch (_) {}
    popup(`Transit: ${stop.name}`);
    render(true);
  }

  function makeReport() {
    const snap = snapshot();
    const current = nearestStop();
    const report = {
      at: new Date().toISOString(),
      currentStop: current?.name || 'Unknown',
      distanceToCurrentStop: current ? Math.round(distanceTo(current)) : null,
      unlockedStops: STOPS.filter((stop) => state.unlocked[stop.id]).map((stop) => stop.name),
      trips: state.trips,
      spent: state.spent,
      cash: Math.floor(Number(snap?.player?.cash || 0)),
      activeVehicle: snap?.player?.activeVehicle?.userData?.name || 'none',
      chunks: snap?.chunks || 0,
      lastReportSeen: Boolean(lastReport),
      recommendation: recommendation()
    };
    saveReport(report);
    return report;
  }

  function recommendation() {
    const snap = snapshot();
    const cash = Number(snap?.player?.cash || 0);
    const activeVehicle = Boolean(snap?.player?.activeVehicle);
    const unlocked = STOPS.filter((stop) => state.unlocked[stop.id]).length;
    if (!snap) return 'Wait for the game runtime to finish loading.';
    if (unlocked < 3) return 'Drive or walk through more districts to unlock more transit stops.';
    if (activeVehicle) return 'Use transit when stuck, then continue driving from the relocated vehicle.';
    if (cash < 60) return 'Use Spawn Hub for free or earn cash before paid transit.';
    return 'Fast travel to the mission-side stop, quick-save, then continue the objective.';
  }

  function copyReport() {
    const text = JSON.stringify(makeReport(), null, 2);
    navigator.clipboard?.writeText(text).then(() => popup('Transit QA copied')).catch(() => popup('Transit QA ready in console'));
    console.log('[NeonBlock Transit QA]', text);
    render(true);
  }

  function quickSave() {
    try {
      game()?.saveState?.();
      saveState();
      makeReport();
      popup('Transit state saved');
    } catch (e) {
      popup(`Transit save failed: ${e.message}`);
    }
    render(true);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-live', 'polite');
    panel.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:118px', 'z-index:45', 'width:min(360px,calc(100vw - 24px))',
      'max-height:min(62vh,520px)', 'overflow:auto', 'padding:12px', 'border:1px solid rgba(23,243,255,.45)',
      'border-radius:16px', 'background:rgba(5,8,20,.88)', 'box-shadow:0 0 24px rgba(23,243,255,.18)',
      'color:#e8fbff', 'font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif', 'backdrop-filter:blur(10px)', 'display:none'
    ].join(';');
    document.body.appendChild(panel);
    return panel;
  }

  function buttonHtml(stop) {
    const locked = !state.unlocked[stop.id];
    const d = Math.round(distanceTo(stop));
    const afford = canPay(stop);
    const disabled = locked || !afford ? 'disabled' : '';
    const label = locked ? 'Locked' : stop.cost ? `$${stop.cost}` : 'Free';
    return `<button data-transit-stop="${stop.id}" ${disabled} style="width:100%;margin:4px 0;padding:9px;border-radius:10px;border:1px solid ${locked ? 'rgba(255,255,255,.18)' : 'rgba(94,243,140,.55)'};background:${locked ? 'rgba(255,255,255,.06)' : 'rgba(23,243,255,.12)'};color:#e8fbff;text-align:left;">${stop.name} <strong style="float:right">${label}</strong><br><small>${stop.hint} • ${Number.isFinite(d) ? d + 'm away' : 'loading'}</small></button>`;
  }

  function render(force = false) {
    const now = performance.now();
    if (!force && now - lastRender < 350) return;
    lastRender = now;
    discoverStops();
    const el = ensurePanel();
    if (!visible) { el.style.display = 'none'; return; }
    const report = makeReport();
    el.style.display = 'block';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">
        <strong style="font-size:15px;color:#17f3ff;">Neon Transit</strong>
        <button data-transit-close style="border:0;border-radius:999px;padding:5px 9px;background:rgba(255,255,255,.12);color:#fff;">×</button>
      </div>
      <div style="margin-bottom:8px;color:#bfefff;">Fast travel to discovered city stops. Active vehicles are moved nearby and low gas is stabilized. Shortcut: <strong>Shift+T</strong>.</div>
      <div style="display:grid;gap:4px;margin-bottom:8px;">${STOPS.map(buttonHtml).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <button data-transit-save>Quick Save</button>
        <button data-transit-copy>Copy QA</button>
      </div>
      <div style="font-size:12px;color:#bfefff;">Stops: ${report.unlockedStops.length}/${STOPS.length} • Trips: ${report.trips} • Spent: $${report.spent}</div>
      <div style="font-size:12px;color:#8fffd2;margin-top:6px;">${recommendation()}</div>
    `;
  }

  function isTransitShortcut(event) {
    return event.code === 'KeyT' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  function wirePanel() {
    document.addEventListener('click', (event) => {
      const close = event.target.closest?.('[data-transit-close]');
      if (close) { visible = false; render(true); return; }
      const save = event.target.closest?.('[data-transit-save]');
      if (save) { quickSave(); return; }
      const copy = event.target.closest?.('[data-transit-copy]');
      if (copy) { copyReport(); return; }
      const stopButton = event.target.closest?.('[data-transit-stop]');
      if (stopButton) travel(stopButton.getAttribute('data-transit-stop'));
    });

    document.addEventListener('keydown', (event) => {
      if (!isTransitShortcut(event)) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      visible = !visible;
      render(true);
    }, true);
  }

  function addMobileButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = 'Transit';
    btn.addEventListener('click', () => { visible = !visible; render(true); });
    rail.insertBefore(btn, rail.firstChild);
  }

  function boot() {
    ensurePanel();
    wirePanel();
    addMobileButton();
    setInterval(() => render(false), 500);
    window.addEventListener('pagehide', () => { saveState(); saveReport(makeReport()); });
    setTimeout(() => { discoverStops(); render(true); }, 1200);
    window.NeonBlockTransit = { travel, getReport: makeReport, getState: () => ({ ...state }) };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
