(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:crate-finder:v1';
  const REPORT_KEY = 'neonblock:crate-finder-report:v1';
  const OPEN_KEY = 'neonblock:crate-finder-open';
  const PANEL_ID = 'neonblock-crate-finder-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-loot-finder';
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
        skippedIds: [],
        lastTarget: null,
        lastReport: null,
        ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'))
      };
    } catch (error) {
      return { scans: 0, assists: 0, skippedIds: [], lastTarget: null, lastReport: { warning: error.message } };
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

  function crateInChunk(cx, cz) {
    if (seeded(cx, cz, 80) <= 0.67) return null;
    return {
      id: `crate-${cx}-${cz}`,
      x: cx * CHUNK_SIZE + seeded(cx, cz, 81) * 28 - 14,
      y: 1,
      z: cz * CHUNK_SIZE + seeded(cx, cz, 82) * 28 - 14,
      chunk: `${cx},${cz}`
    };
  }

  function findNearestCrate() {
    const current = playerPosition();
    if (!current) return null;
    const ignored = new Set(Array.isArray(state.skippedIds) ? state.skippedIds : []);
    const centerX = Math.round(current.x / CHUNK_SIZE);
    const centerZ = Math.round(current.z / CHUNK_SIZE);
    let best = null;

    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        const crate = crateInChunk(centerX + dx, centerZ + dz);
        if (!crate || ignored.has(crate.id)) continue;
        const distance = Math.hypot(crate.x - current.x, crate.z - current.z);
        if (!best || distance < best.distance) best = { ...crate, distance };
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

  function scanCrate() {
    state.scans = Math.max(0, Number(state.scans || 0)) + 1;
    state.lastTarget = findNearestCrate();
    saveState('scanned nearest crate');
    popup(state.lastTarget ? `Nearest crate: ${Math.round(state.lastTarget.distance)}m` : 'No unskipped crate predicted nearby');
    render();
  }

  function guideToCrate() {
    const snap = snapshot();
    const p = player(snap);
    const target = state.lastTarget || findNearestCrate();
    if (!p?.mesh?.position || !target) {
      popup('Crate Finder needs a target first');
      return render();
    }

    const approach = { x: target.x - 2.5, y: 1.2, z: target.z };
    if (p.activeVehicle?.position?.set) {
      p.activeVehicle.position.set(approach.x - 3, 0.65, approach.z);
      p.activeVehicle = null;
    }
    p.mesh.position.set(approach.x, approach.y, approach.z);
    if (p.vel?.set) p.vel.set(0, 0, 0);
    state.assists = Math.max(0, Number(state.assists || 0)) + 1;
    state.lastTarget = { ...target, assistedAt: new Date().toISOString() };
    saveState('guided player to crate');
    popup('At the crate. Press Interact to collect +$45.');
    render();
  }

  function nextCrate() {
    if (state.lastTarget?.id) {
      const skipped = new Set(Array.isArray(state.skippedIds) ? state.skippedIds : []);
      skipped.add(state.lastTarget.id);
      state.skippedIds = Array.from(skipped).slice(-80);
    }
    state.lastTarget = findNearestCrate();
    state.scans = Math.max(0, Number(state.scans || 0)) + 1;
    saveState('advanced to next crate target');
    popup(state.lastTarget ? `Next crate: ${Math.round(state.lastTarget.distance)}m` : 'No additional crate predicted nearby');
    render();
  }

  function resetSkipped() {
    state.skippedIds = [];
    state.lastTarget = findNearestCrate();
    saveState('reset skipped crate targets');
    popup('Crate target history reset');
    render();
  }

  function buildReport(reason = 'manual') {
    const snap = snapshot();
    const current = playerPosition(snap);
    const target = state.lastTarget || findNearestCrate();
    return {
      at: new Date().toISOString(),
      reason,
      runtimeReady: Boolean(window.NeonBlockGame?.getSnapshot),
      scans: Math.max(0, Number(state.scans || 0)),
      assists: Math.max(0, Number(state.assists || 0)),
      skippedTargets: Array.isArray(state.skippedIds) ? state.skippedIds.length : 0,
      streamedCrates: snap?.crates ?? 0,
      chunks: snap?.chunks ?? 0,
      player: current ? { x: Number(current.x.toFixed(1)), y: Number(current.y.toFixed(1)), z: Number(current.z.toFixed(1)) } : null,
      nearestPredictedCrate: target ? {
        id: target.id,
        chunk: target.chunk,
        distance: Math.round(target.distance || 0),
        x: Number(target.x.toFixed(1)),
        z: Number(target.z.toFixed(1))
      } : null,
      note: 'Predicted targets use the core deterministic chunk seed. Use Next Crate after collecting or if a saved crate is already gone.'
    };
  }

  async function copyReport() {
    const report = saveState('copied crate finder QA report');
    try {
      await navigator.clipboard?.writeText(JSON.stringify(report, null, 2));
      popup('Crate Finder QA copied');
    } catch {
      popup('Crate Finder QA saved locally');
    }
    render();
  }

  function injectStyles() {
    if (document.getElementById('neonblock-crate-finder-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-crate-finder-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed; right: max(12px, env(safe-area-inset-right));
        top: calc(96px + env(safe-area-inset-top)); z-index: 35;
        width: min(350px, calc(100vw - 24px)); max-height: min(72vh, 550px);
        overflow: auto; padding: 14px; border: 1px solid rgba(44, 245, 177, 0.44);
        border-radius: 18px; background: rgba(6, 16, 17, 0.91); color: #edfff9;
        box-shadow: 0 18px 60px rgba(0,0,0,0.42), 0 0 24px rgba(44,245,177,0.14);
        backdrop-filter: blur(12px); font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h3 { margin: 0 0 8px; color: #58f5c2; font-size: 17px; }
      #${PANEL_ID} p { margin: 6px 0; color: #cdfced; }
      #${PANEL_ID} .crate-target { margin: 10px 0; padding: 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; background: rgba(255,255,255,0.06); }
      #${PANEL_ID} .crate-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      #${PANEL_ID} button, #${MOBILE_BUTTON_ID} { border: 0; border-radius: 999px; padding: 8px 10px; background: rgba(44,245,177,0.18); color: #edfff9; font-weight: 800; }
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
      <h3>Crate Finder <span style="float:right;font-size:12px;color:#cdfced">F11</span></h3>
      <p id="crate-finder-status">Scanning neon loot...</p>
      <div id="crate-finder-target" class="crate-target"></div>
      <div class="crate-actions">
        <button type="button" data-crate-action="scan">Scan Crate</button>
        <button type="button" data-crate-action="guide">Go Near Crate</button>
        <button type="button" data-crate-action="next">Next Crate</button>
        <button type="button" data-crate-action="reset">Reset Targets</button>
        <button type="button" data-crate-action="save">Quick Save</button>
        <button type="button" data-crate-action="copy">Copy QA</button>
      </div>
      <pre id="crate-finder-report"></pre>
    `;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#crate-finder-status');
    targetEl = panel.querySelector('#crate-finder-target');
    reportEl = panel.querySelector('#crate-finder-report');
    panel.addEventListener('click', (event) => {
      const action = event.target?.dataset?.crateAction;
      if (action === 'scan') scanCrate();
      if (action === 'guide') guideToCrate();
      if (action === 'next') nextCrate();
      if (action === 'reset') resetSkipped();
      if (action === 'save') { saveState('manual crate finder quick save'); popup('Crate Finder saved'); render(); }
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
    button.textContent = 'Loot';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    buildPanel();
    const hidden = panel.classList.toggle('hidden');
    localStorage.setItem(OPEN_KEY, hidden ? '0' : '1');
    if (!hidden && !state.lastTarget) state.lastTarget = findNearestCrate();
    render();
  }

  function render() {
    if (!panel) return;
    const snap = snapshot();
    const target = state.lastTarget || findNearestCrate();
    const skipped = Array.isArray(state.skippedIds) ? state.skippedIds.length : 0;
    statusEl.textContent = target
      ? `Nearest unskipped crate predicted in chunk ${target.chunk}.`
      : 'No unskipped crate predicted. Move or reset target history.';
    targetEl.innerHTML = target ? `
      <p><strong>Crate:</strong> ${target.id}</p>
      <p><strong>Distance:</strong> ${Math.round(target.distance || 0)}m · <strong>Chunk:</strong> ${target.chunk}</p>
      <p><strong>Reward:</strong> $45 + 20 XP · <strong>Streamed now:</strong> ${snap?.crates ?? 0}</p>
      <p><strong>Skipped targets:</strong> ${skipped}</p>
    ` : '<p>No target yet. Reset targets if previous crates were not actually collected.</p>';
    reportEl.textContent = JSON.stringify(buildReport('render'), null, 2);
  }

  function boot() {
    buildPanel();
    addMobileButton();
    setInterval(() => {
      if (!panel?.classList.contains('hidden')) render();
    }, 4000);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F11' && !event.repeat) {
        event.preventDefault();
        togglePanel();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveState('hidden-page crate finder backup');
    });
    window.addEventListener('pagehide', () => saveState('pagehide crate finder backup'));
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
