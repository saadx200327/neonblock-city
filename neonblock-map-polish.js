(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:map-polish';
  const state = loadState();
  let panel;
  let lastReport = state.lastReport || '';

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        hidden: !!state.hidden,
        scans: state.scans || 0,
        lastReport
      }));
    } catch (_) {}
  }

  function api() {
    return window.NeonBlockGame;
  }

  function snapshot() {
    try {
      return api()?.getSnapshot?.() || null;
    } catch (_) {
      return null;
    }
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => el.classList.add('hidden'), 1700);
  }

  function safeText(value) {
    return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function missionStatus(snap) {
    const p = snap?.player;
    const missionText = document.getElementById('hud-mission')?.textContent || 'unknown';
    const arrow = document.getElementById('waypoint-arrow')?.textContent || 'none';
    const completed = p?.completed ? Object.keys(p.completed).filter((key) => p.completed[key]).length : 0;
    return { missionText, arrow, completed };
  }

  function scanWorld(countScan = false) {
    const snap = snapshot();
    const p = snap?.player;
    const pos = p?.mesh?.position;
    if (!snap || !p || !pos) return null;
    const ownedLots = p.ownedLots ? Object.keys(p.ownedLots).length : 0;
    const mission = missionStatus(snap);
    const report = {
      time: new Date().toISOString(),
      pos: `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`,
      chunks: snap.chunks ?? 'unknown',
      vehicles: snap.vehicles ?? 0,
      crates: snap.crates ?? 0,
      lots: snap.lots ?? 0,
      ownedLots,
      cash: Math.floor(p.cash || 0),
      level: p.level || 1,
      vehicle: p.activeVehicle?.userData?.name || 'on foot',
      mission: mission.missionText,
      completedMissions: mission.completed,
      arrow: mission.arrow
    };
    if (countScan) state.scans = (state.scans || 0) + 1;
    lastReport = [
      'NeonBlock Map Scanner Report',
      `time=${report.time}`,
      `pos=${report.pos}`,
      `chunks=${report.chunks}`,
      `vehicles=${report.vehicles}`,
      `crates=${report.crates}`,
      `lots=${report.lots}`,
      `ownedLots=${report.ownedLots}`,
      `cash=${report.cash}`,
      `level=${report.level}`,
      `vehicle=${report.vehicle}`,
      `mission=${report.mission}`,
      `completedMissions=${report.completedMissions}`,
      `waypointArrow=${report.arrow}`,
      `manualScans=${state.scans || 0}`
    ].join('\n');
    if (countScan) persist();
    return report;
  }

  function returnToHub() {
    const snap = snapshot();
    const p = snap?.player;
    if (!p?.mesh?.position) return false;
    p.mesh.position.set(0, 1.35, 0);
    p.vel?.set?.(0, 0, 0);
    if (p.activeVehicle) {
      p.activeVehicle.position.copy?.(p.mesh.position);
      p.activeVehicle.position.y = 0.65;
      p.activeVehicle.userData.gas = Math.max(15, p.activeVehicle.userData.gas || 0);
    }
    api()?.saveState?.(p.slot || 'slot1');
    popup('Returned to city hub');
    render();
    return true;
  }

  function copyReport() {
    if (!lastReport) scanWorld(true);
    navigator.clipboard?.writeText(lastReport || 'No map report yet')
      .then(() => popup('Map report copied'))
      .catch(() => popup('Map report ready'));
    render();
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'map-polish-panel';
    panel.innerHTML = `
      <div class="map-polish-head"><strong>Map Scanner</strong><button type="button" data-map-close>×</button></div>
      <div class="map-polish-body" data-map-body>Waiting for game runtime...</div>
      <div class="map-polish-actions">
        <button type="button" data-map-scan>Scan</button>
        <button type="button" data-map-hub>Return hub</button>
        <button type="button" data-map-save>Save</button>
        <button type="button" data-map-copy>Copy report</button>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #map-polish-panel{position:fixed;right:12px;bottom:92px;z-index:45;width:min(330px,calc(100vw - 24px));padding:12px;border:1px solid rgba(23,243,255,.45);border-radius:16px;background:rgba(5,8,20,.88);color:#e9fbff;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.35);backdrop-filter:blur(10px)}
      #map-polish-panel.hidden{display:none}.map-polish-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.map-polish-head button{border:0;border-radius:10px;background:#1d2b45;color:#fff;padding:4px 9px}.map-polish-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.map-polish-actions button,#btn-mobile-mapscan{border:1px solid rgba(23,243,255,.5);border-radius:999px;background:rgba(23,243,255,.14);color:#e9fbff;padding:8px 10px}.map-good{color:#5ef38c}.map-warn{color:#ffd338}.map-muted{opacity:.78}@media(max-width:720px){#map-polish-panel{right:8px;bottom:150px;font-size:12px}.map-polish-actions button{padding:10px 12px}}`;
    document.head.appendChild(style);
    document.body.appendChild(panel);
    panel.querySelector('[data-map-close]').addEventListener('click', () => togglePanel(false));
    panel.querySelector('[data-map-scan]').addEventListener('click', () => { scanWorld(true); popup('Map scan complete'); render(); });
    panel.querySelector('[data-map-hub]').addEventListener('click', returnToHub);
    panel.querySelector('[data-map-save]').addEventListener('click', () => { api()?.saveState?.(); popup('Map save complete'); });
    panel.querySelector('[data-map-copy]').addEventListener('click', copyReport);
    togglePanel(!state.hidden);
    return panel;
  }

  function ensureMobileButton() {
    if (document.getElementById('btn-mobile-mapscan')) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = 'btn-mobile-mapscan';
    btn.type = 'button';
    btn.textContent = 'Map';
    btn.addEventListener('click', () => togglePanel());
    rail.insertBefore(btn, rail.firstChild);
  }

  function togglePanel(force) {
    ensurePanel();
    state.hidden = typeof force === 'boolean' ? !force : !state.hidden;
    panel.classList.toggle('hidden', !!state.hidden);
    persist();
  }

  function render() {
    ensurePanel();
    const body = panel.querySelector('[data-map-body]');
    const report = scanWorld(false);
    if (!body || !report) {
      if (body) body.textContent = 'Runtime not ready yet.';
      return;
    }
    const crowded = Number(report.chunks) > 35 || Number(report.vehicles) > 40;
    body.innerHTML = `
      <div>Mission: <span class="map-good">${safeText(report.mission)}</span></div>
      <div>Position: ${safeText(report.pos)}</div>
      <div>World: ${report.chunks} chunks • ${report.vehicles} cars • ${report.crates} crates • ${report.lots} lots</div>
      <div>Ownership: ${report.ownedLots} lots • $${report.cash} • level ${report.level}</div>
      <div>Vehicle: ${safeText(report.vehicle)}</div>
      <div>Status: <span class="${crowded ? 'map-warn' : 'map-good'}">${crowded ? 'heavy world, use low graphics if laggy' : 'streaming looks stable'}</span></div>
      <div class="map-muted">Hotkey: 9 • Manual scans: ${state.scans || 0} • Use Return hub only if lost/stuck.</div>`;
  }

  function boot() {
    ensurePanel();
    ensureMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Digit9' && !event.repeat) togglePanel();
    });
    setInterval(render, 1500);
    addEventListener('pagehide', persist);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();