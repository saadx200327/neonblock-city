(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:ride-finder:v1';
  const REPORT_KEY = 'neonblock:ride-finder-report:v1';
  const PANEL_ID = 'neonblock-ride-finder-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-ride';
  const OPEN_KEY = 'neonblock:ride-finder-open';
  const CHUNK_SIZE = 48;
  const REFRESH_MS = 4000;

  const diagnostics = {
    version: 2,
    storageReadFailures: 0,
    storageWriteFailures: 0,
    refreshes: 0,
    timerActive: false,
    lastError: null
  };
  const state = loadState();
  let panel;
  let statusEl;
  let targetEl;
  let reportEl;
  let refreshTimer = 0;

  function recordError(error) {
    diagnostics.lastError = error?.message || String(error || 'Unknown error');
  }

  function readStorage(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch (error) {
      diagnostics.storageReadFailures += 1;
      recordError(error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      diagnostics.storageWriteFailures += 1;
      recordError(error);
      return false;
    }
  }

  function loadState() {
    try {
      return {
        scans: 0,
        assists: 0,
        lastTarget: null,
        lastReport: null,
        ...(JSON.parse(readStorage(STORAGE_KEY, '{}') || '{}'))
      };
    } catch (error) {
      recordError(error);
      return { scans: 0, assists: 0, lastTarget: null, lastReport: { warning: error.message } };
    }
  }

  function saveState(reason = 'auto') {
    state.lastReport = buildReport(reason);
    writeStorage(STORAGE_KEY, JSON.stringify(state));
    writeStorage(REPORT_KEY, JSON.stringify(state.lastReport, null, 2));
    try { window.NeonBlockGame?.saveState?.(); } catch (error) { state.lastReport.saveWarning = error.message; recordError(error); }
    return state.lastReport;
  }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (error) { recordError(error); return null; }
  }

  function player(snap = snapshot()) {
    return snap?.player || null;
  }

  function pos(snap = snapshot()) {
    const p = player(snap)?.mesh?.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    return { x: p.x, y: Number.isFinite(p.y) ? p.y : 1, z: p.z };
  }

  function seeded(cx, cz, n) {
    const value = Math.sin(cx * 129.898 + cz * 78.233 + n * 31.719) * 43758.5453;
    return value - Math.floor(value);
  }

  function vehicleInChunk(cx, cz) {
    if (seeded(cx, cz, 90) <= 0.72) return null;
    const isTaxi = seeded(cx, cz, 91) > 0.5;
    return {
      id: `vehicle-${cx}-${cz}`,
      name: isTaxi ? 'Taxi' : 'Neon Car',
      x: cx * CHUNK_SIZE + 12,
      y: 1,
      z: cz * CHUNK_SIZE,
      chunk: `${cx},${cz}`
    };
  }

  function findNearestRide() {
    const current = pos();
    if (!current) return null;
    const centerX = Math.round(current.x / CHUNK_SIZE);
    const centerZ = Math.round(current.z / CHUNK_SIZE);
    let best = null;
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        const candidate = vehicleInChunk(centerX + dx, centerZ + dz);
        if (!candidate) continue;
        const distance = Math.hypot(candidate.x - current.x, candidate.z - current.z);
        if (!best || distance < best.distance) best = { ...candidate, distance };
      }
    }
    return best;
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1700);
  }

  function scanRide() {
    state.scans = Math.max(0, Number(state.scans || 0)) + 1;
    state.lastTarget = findNearestRide();
    saveState('scanned nearest ride');
    popup(state.lastTarget ? `Nearest ride: ${Math.round(state.lastTarget.distance)}m` : 'No ride predicted nearby');
    render();
  }

  function guideToRide() {
    const snap = snapshot();
    const p = player(snap);
    const target = state.lastTarget || findNearestRide();
    if (!p?.mesh?.position || !target) {
      popup('Ride Finder needs the city runtime first');
      return render();
    }
    const approachX = target.x - 3;
    const approachZ = target.z;
    p.mesh.position.set(approachX, 1.2, approachZ);
    if (p.vel?.set) p.vel.set(0, 0, 0);
    p.activeVehicle = null;
    state.assists = Math.max(0, Number(state.assists || 0)) + 1;
    state.lastTarget = { ...target, assistedAt: new Date().toISOString() };
    saveState('guided player to nearest ride');
    popup(`Moved near ${target.name}. Press Interact to enter.`);
    render();
  }

  function buildReport(reason = 'manual') {
    const snap = snapshot();
    const current = pos(snap);
    const target = state.lastTarget || findNearestRide();
    return {
      at: new Date().toISOString(),
      reason,
      runtimeReady: Boolean(window.NeonBlockGame?.getSnapshot),
      scans: Math.max(0, Number(state.scans || 0)),
      assists: Math.max(0, Number(state.assists || 0)),
      player: current ? { x: Number(current.x.toFixed(1)), y: Number(current.y.toFixed(1)), z: Number(current.z.toFixed(1)) } : null,
      activeVehicle: player(snap)?.activeVehicle?.userData?.name || null,
      streamedVehicles: snap?.vehicles ?? 0,
      chunks: snap?.chunks ?? 0,
      scheduler: { active: diagnostics.timerActive, hidden: document.hidden, refreshes: diagnostics.refreshes },
      storage: { readFailures: diagnostics.storageReadFailures, writeFailures: diagnostics.storageWriteFailures, lastError: diagnostics.lastError },
      nearestPredictedRide: target ? {
        id: target.id,
        name: target.name,
        chunk: target.chunk,
        distance: Math.round(target.distance || 0),
        x: Number(target.x.toFixed(1)),
        z: Number(target.z.toFixed(1))
      } : null
    };
  }

  async function copyReport() {
    const report = saveState('copied ride finder QA report');
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard?.writeText(text);
      popup('Ride QA copied');
    } catch {
      popup('Ride QA saved locally');
    }
    render();
  }

  function injectStyles() {
    if (document.getElementById('neonblock-ride-finder-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-ride-finder-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        top: calc(96px + env(safe-area-inset-top));
        z-index: 35;
        width: min(340px, calc(100vw - 24px));
        max-height: min(72vh, 520px);
        overflow: auto;
        padding: 14px;
        border: 1px solid rgba(255, 53, 95, 0.44);
        border-radius: 18px;
        background: rgba(8, 7, 18, 0.9);
        color: #fff2f5;
        box-shadow: 0 18px 60px rgba(0,0,0,0.42), 0 0 24px rgba(255,53,95,0.14);
        backdrop-filter: blur(12px);
        font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h3 { margin: 0 0 8px; color: #ff6384; font-size: 17px; }
      #${PANEL_ID} p { margin: 6px 0; color: #ffd4de; }
      #${PANEL_ID} .ride-target { margin: 10px 0; padding: 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; background: rgba(255,255,255,0.06); }
      #${PANEL_ID} .ride-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      #${PANEL_ID} button, #${MOBILE_BUTTON_ID} { border: 0; border-radius: 999px; padding: 8px 10px; background: rgba(255,53,95,0.18); color: #fff2f5; font-weight: 800; }
      #${PANEL_ID} button:active, #${MOBILE_BUTTON_ID}:active { transform: translateY(1px); }
      #${PANEL_ID} pre { max-height: 130px; overflow: auto; white-space: pre-wrap; background: rgba(0,0,0,0.24); padding: 8px; border-radius: 10px; }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (panel) return;
    injectStyles();
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = readStorage(OPEN_KEY, '0') === '1' ? '' : 'hidden';
    panel.innerHTML = `
      <h3>Ride Finder <span style="float:right;font-size:12px;color:#ffd4de">F9</span></h3>
      <p id="ride-finder-status">Scanning streamed roads...</p>
      <div id="ride-finder-target" class="ride-target"></div>
      <div class="ride-actions">
        <button type="button" data-ride-action="scan">Scan Ride</button>
        <button type="button" data-ride-action="guide">Go Near Ride</button>
        <button type="button" data-ride-action="save">Quick Save</button>
        <button type="button" data-ride-action="copy">Copy QA</button>
      </div>
      <pre id="ride-finder-report"></pre>
    `;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#ride-finder-status');
    targetEl = panel.querySelector('#ride-finder-target');
    reportEl = panel.querySelector('#ride-finder-report');
    panel.addEventListener('click', (event) => {
      const action = event.target?.dataset?.rideAction;
      if (action === 'scan') scanRide();
      if (action === 'guide') guideToRide();
      if (action === 'save') { saveState('manual ride finder quick save'); popup('Ride Finder saved'); render(); }
      if (action === 'copy') copyReport();
    });
  }

  function addMobileButton() {
    if (document.getElementById(MOBILE_BUTTON_ID)) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const button = document.createElement('button');
    button.id = MOBILE_BUTTON_ID;
    button.className = 'action-btn';
    button.type = 'button';
    button.textContent = 'Ride';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function stopScheduler() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = 0;
    diagnostics.timerActive = false;
  }

  function scheduleRefresh() {
    stopScheduler();
    if (document.hidden || panel?.classList.contains('hidden')) return;
    diagnostics.timerActive = true;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      diagnostics.timerActive = false;
      if (!document.hidden && !panel?.classList.contains('hidden')) {
        render();
        scheduleRefresh();
      }
    }, REFRESH_MS);
  }

  function togglePanel() {
    buildPanel();
    const hidden = panel.classList.toggle('hidden');
    writeStorage(OPEN_KEY, hidden ? '0' : '1');
    if (!hidden && !state.lastTarget) state.lastTarget = findNearestRide();
    render();
    scheduleRefresh();
  }

  function render() {
    if (!panel) return;
    diagnostics.refreshes += 1;
    const target = state.lastTarget || findNearestRide();
    const snap = snapshot();
    statusEl.textContent = target
      ? `${target.name} predicted in chunk ${target.chunk}.`
      : 'No ride predicted yet. Move or press Scan Ride.';
    targetEl.innerHTML = target ? `
      <p><strong>Nearest:</strong> ${target.name}</p>
      <p><strong>Distance:</strong> ${Math.round(target.distance || 0)}m</p>
      <p><strong>Chunk:</strong> ${target.chunk}</p>
      <p><strong>Streamed vehicles now:</strong> ${snap?.vehicles ?? 0}</p>
    ` : '<p>No target yet.</p>';
    reportEl.textContent = JSON.stringify(buildReport('render'), null, 2);
  }

  function refresh() {
    if (!document.hidden && !panel?.classList.contains('hidden')) render();
    scheduleRefresh();
    return buildReport('manual refresh');
  }

  function boot() {
    buildPanel();
    addMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F9' && !event.repeat) {
        event.preventDefault();
        togglePanel();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopScheduler();
        saveState('hidden-page ride finder backup');
      } else {
        refresh();
      }
    });
    window.addEventListener('pagehide', () => {
      stopScheduler();
      saveState('pagehide ride finder backup');
    });
    render();
    scheduleRefresh();
  }

  window.NeonBlockRideFinder = {
    getStatus: () => ({ ...diagnostics, panelOpen: Boolean(panel && !panel.classList.contains('hidden')), hidden: document.hidden }),
    refresh,
    saveNow: () => saveState('manual API save')
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
