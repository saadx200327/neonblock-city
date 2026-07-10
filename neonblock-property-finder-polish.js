(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:property-finder:v1';
  const REPORT_KEY = 'neonblock:property-finder-report:v1';
  const OPEN_KEY = 'neonblock:property-finder-open';
  const PANEL_ID = 'neonblock-property-finder-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-lot-finder';
  const CHUNK_SIZE = 48;

  const state = loadState();
  let panel;
  let statusEl;
  let targetEl;
  let reportEl;

  function loadState() {
    try {
      return {
        scans: 0,
        assists: 0,
        mode: 'nearest',
        lastTarget: null,
        lastReport: null,
        ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'))
      };
    } catch (error) {
      return { scans: 0, assists: 0, mode: 'nearest', lastTarget: null, lastReport: { warning: error.message } };
    }
  }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch { return null; }
  }

  function player(snap = snapshot()) {
    return snap?.player || null;
  }

  function playerPosition(snap = snapshot()) {
    const position = player(snap)?.mesh?.position;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    return { x: position.x, y: Number.isFinite(position.y) ? position.y : 1, z: position.z };
  }

  function seeded(cx, cz, n) {
    const value = Math.sin(cx * 129.898 + cz * 78.233 + n * 31.719) * 43758.5453;
    return value - Math.floor(value);
  }

  function lotInChunk(cx, cz) {
    if (seeded(cx, cz, 100) <= 0.72) return null;
    return {
      id: `lot-${cx}-${cz}`,
      x: cx * CHUNK_SIZE + seeded(cx, cz, 101) * 26 - 13,
      y: 1,
      z: cz * CHUNK_SIZE + seeded(cx, cz, 102) * 26 - 13,
      price: 500 + Math.floor(seeded(cx, cz, 103) * 700),
      chunk: `${cx},${cz}`
    };
  }

  function ownedLots(snap = snapshot()) {
    const owned = player(snap)?.ownedLots || {};
    return Object.keys(owned).filter((id) => owned[id]);
  }

  function findLot(mode = state.mode) {
    const snap = snapshot();
    const current = playerPosition(snap);
    if (!current) return null;
    const owned = player(snap)?.ownedLots || {};
    const cash = Math.max(0, Number(player(snap)?.cash || 0));
    const centerX = Math.round(current.x / CHUNK_SIZE);
    const centerZ = Math.round(current.z / CHUNK_SIZE);
    const candidates = [];

    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        const lot = lotInChunk(centerX + dx, centerZ + dz);
        if (!lot || owned[lot.id]) continue;
        const distance = Math.hypot(lot.x - current.x, lot.z - current.z);
        candidates.push({ ...lot, distance, affordable: cash >= lot.price });
      }
    }

    const pool = mode === 'affordable' ? candidates.filter((lot) => lot.affordable) : candidates;
    return pool.sort((a, b) => a.distance - b.distance || a.price - b.price)[0] || null;
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function saveState(reason = 'auto') {
    state.lastReport = buildReport(reason);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(REPORT_KEY, JSON.stringify(state.lastReport, null, 2));
    } catch (error) {
      state.lastReport.storageWarning = error.message;
    }
    try { window.NeonBlockGame?.saveState?.(); } catch (error) { state.lastReport.saveWarning = error.message; }
    return state.lastReport;
  }

  function scan(mode) {
    state.mode = mode;
    state.scans = Math.max(0, Number(state.scans || 0)) + 1;
    state.lastTarget = findLot(mode);
    saveState(`scanned ${mode} property`);
    if (state.lastTarget) {
      popup(`${mode === 'affordable' ? 'Affordable' : 'Nearest'} lot: $${state.lastTarget.price}, ${Math.round(state.lastTarget.distance)}m`);
    } else {
      popup(mode === 'affordable' ? 'No affordable unowned lot nearby' : 'No unowned lot predicted nearby');
    }
    render();
  }

  function guideToLot() {
    const snap = snapshot();
    const p = player(snap);
    const target = state.lastTarget || findLot(state.mode);
    if (!p?.mesh?.position || !target) {
      popup('Property Finder needs a target first');
      return render();
    }

    const approach = { x: target.x - 3.5, y: 1.2, z: target.z };
    if (p.activeVehicle?.position?.set) {
      p.activeVehicle.position.set(approach.x - 2, 0.65, approach.z);
      p.activeVehicle = null;
    }
    p.mesh.position.set(approach.x, approach.y, approach.z);
    if (p.vel?.set) p.vel.set(0, 0, 0);
    state.assists = Math.max(0, Number(state.assists || 0)) + 1;
    state.lastTarget = { ...target, assistedAt: new Date().toISOString() };
    saveState('guided player to property');
    popup(target.affordable ? 'At the lot. Press Interact to buy.' : `At the lot. Need $${target.price}.`);
    render();
  }

  function buildReport(reason = 'manual') {
    const snap = snapshot();
    const current = playerPosition(snap);
    const p = player(snap);
    const target = state.lastTarget || findLot(state.mode);
    const cash = Math.max(0, Math.floor(Number(p?.cash || 0)));
    return {
      at: new Date().toISOString(),
      reason,
      runtimeReady: Boolean(window.NeonBlockGame?.getSnapshot),
      mode: state.mode,
      scans: Math.max(0, Number(state.scans || 0)),
      assists: Math.max(0, Number(state.assists || 0)),
      cash,
      ownedCount: ownedLots(snap).length,
      chunks: snap?.chunks ?? 0,
      player: current ? { x: Number(current.x.toFixed(1)), y: Number(current.y.toFixed(1)), z: Number(current.z.toFixed(1)) } : null,
      nearestPredictedLot: target ? {
        id: target.id,
        chunk: target.chunk,
        price: target.price,
        affordable: cash >= target.price,
        shortfall: Math.max(0, target.price - cash),
        distance: Math.round(target.distance || 0),
        x: Number(target.x.toFixed(1)),
        z: Number(target.z.toFixed(1))
      } : null
    };
  }

  async function copyReport() {
    const report = saveState('copied property finder QA report');
    try {
      await navigator.clipboard?.writeText(JSON.stringify(report, null, 2));
      popup('Property Finder QA copied');
    } catch {
      popup('Property Finder QA saved locally');
    }
    render();
  }

  function injectStyles() {
    if (document.getElementById('neonblock-property-finder-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-property-finder-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed; right: max(12px, env(safe-area-inset-right));
        top: calc(96px + env(safe-area-inset-top)); z-index: 35;
        width: min(350px, calc(100vw - 24px)); max-height: min(72vh, 540px);
        overflow: auto; padding: 14px; border: 1px solid rgba(177, 93, 255, 0.46);
        border-radius: 18px; background: rgba(10, 7, 20, 0.91); color: #f8efff;
        box-shadow: 0 18px 60px rgba(0,0,0,0.42), 0 0 24px rgba(177,93,255,0.16);
        backdrop-filter: blur(12px); font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h3 { margin: 0 0 8px; color: #c986ff; font-size: 17px; }
      #${PANEL_ID} p { margin: 6px 0; color: #ead2ff; }
      #${PANEL_ID} .lot-target { margin: 10px 0; padding: 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; background: rgba(255,255,255,0.06); }
      #${PANEL_ID} .lot-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      #${PANEL_ID} button, #${MOBILE_BUTTON_ID} { border: 0; border-radius: 999px; padding: 8px 10px; background: rgba(177,93,255,0.2); color: #f8efff; font-weight: 800; }
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
    panel.className = localStorage.getItem(OPEN_KEY) === '1' ? '' : 'hidden';
    panel.innerHTML = `
      <h3>Property Finder <span style="float:right;font-size:12px;color:#ead2ff">F10</span></h3>
      <p id="property-finder-status">Scanning city lots...</p>
      <div id="property-finder-target" class="lot-target"></div>
      <div class="lot-actions">
        <button type="button" data-lot-action="nearest">Nearest Lot</button>
        <button type="button" data-lot-action="affordable">Affordable Lot</button>
        <button type="button" data-lot-action="guide">Go Near Lot</button>
        <button type="button" data-lot-action="save">Quick Save</button>
        <button type="button" data-lot-action="copy">Copy QA</button>
      </div>
      <pre id="property-finder-report"></pre>
    `;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#property-finder-status');
    targetEl = panel.querySelector('#property-finder-target');
    reportEl = panel.querySelector('#property-finder-report');
    panel.addEventListener('click', (event) => {
      const action = event.target?.dataset?.lotAction;
      if (action === 'nearest') scan('nearest');
      if (action === 'affordable') scan('affordable');
      if (action === 'guide') guideToLot();
      if (action === 'save') { saveState('manual property finder quick save'); popup('Property Finder saved'); render(); }
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
    button.textContent = 'Lot';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    buildPanel();
    const hidden = panel.classList.toggle('hidden');
    localStorage.setItem(OPEN_KEY, hidden ? '0' : '1');
    if (!hidden && !state.lastTarget) state.lastTarget = findLot(state.mode);
    render();
  }

  function render() {
    if (!panel) return;
    const snap = snapshot();
    const p = player(snap);
    const target = state.lastTarget || findLot(state.mode);
    const cash = Math.max(0, Math.floor(Number(p?.cash || 0)));
    statusEl.textContent = target
      ? `${state.mode === 'affordable' ? 'Affordable' : 'Nearest'} unowned lot predicted in chunk ${target.chunk}.`
      : (state.mode === 'affordable' ? 'No affordable unowned lot in scan range.' : 'No unowned lot predicted yet.');
    targetEl.innerHTML = target ? `
      <p><strong>Lot:</strong> ${target.id}</p>
      <p><strong>Price:</strong> $${target.price} · ${cash >= target.price ? 'affordable' : `$${target.price - cash} short`}</p>
      <p><strong>Distance:</strong> ${Math.round(target.distance || 0)}m · <strong>Cash:</strong> $${cash}</p>
      <p><strong>Owned:</strong> ${ownedLots(snap).length} · <strong>Streamed chunks:</strong> ${snap?.chunks ?? 0}</p>
    ` : '<p>Move through the city or scan another mode.</p>';
    reportEl.textContent = JSON.stringify(buildReport('render'), null, 2);
  }

  function boot() {
    buildPanel();
    addMobileButton();
    setInterval(() => {
      if (!panel?.classList.contains('hidden')) render();
    }, 4000);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F10' && !event.repeat) {
        event.preventDefault();
        togglePanel();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveState('hidden-page property finder backup');
    });
    window.addEventListener('pagehide', () => saveState('pagehide property finder backup'));
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
