(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:roadside-polish';
  const REPORT_KEY = 'neonblock:roadside-polish:qa';
  const CHUNK_SIZE = 48;
  const ROAD_HALF_WIDTH = 4.4;
  const SNAP_COOLDOWN_MS = 3500;
  const TICK_MS = 1000;
  const state = loadState();
  const diagnostics = {
    version: 2,
    storageReadFailures: 0,
    storageWriteFailures: 0,
    ticks: 0,
    renders: 0,
    lastStorageError: '',
    lastTickAt: 0
  };
  let panel;
  let timer = 0;
  let lastPos = null;
  let lastMovedAt = performance.now();
  let lastSnapAt = 0;
  let lastRoadStatus = 'checking';

  function safeRead(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch (error) {
      diagnostics.storageReadFailures += 1;
      diagnostics.lastStorageError = String(error?.message || error);
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      diagnostics.storageWriteFailures += 1;
      diagnostics.lastStorageError = String(error?.message || error);
      return false;
    }
  }

  function loadState() {
    try {
      const parsed = JSON.parse(safeRead(STORAGE_KEY, '{}') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function persist() {
    safeWrite(STORAGE_KEY, JSON.stringify({
      hidden: !!state.hidden,
      snapCount: Math.max(0, Number(state.snapCount) || 0),
      lastReport: typeof state.lastReport === 'string' ? state.lastReport : '',
      lastRoadStatus
    }));
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

  function player() {
    return snapshot()?.player || null;
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => el.classList.add('hidden'), 1700);
  }

  function roadMetrics(pos) {
    const localX = Math.abs((((pos.x + CHUNK_SIZE / 2) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE - CHUNK_SIZE / 2);
    const localZ = Math.abs((((pos.z + CHUNK_SIZE / 2) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE - CHUNK_SIZE / 2);
    const distanceToRoad = Math.min(localX, localZ);
    const onRoad = distanceToRoad <= ROAD_HALF_WIDTH;
    const preferredAxis = localX <= localZ ? 'x' : 'z';
    return { localX, localZ, distanceToRoad, onRoad, preferredAxis };
  }

  function nearestRoadPosition(pos) {
    const metrics = roadMetrics(pos);
    const target = pos.clone ? pos.clone() : { ...pos };
    if (metrics.preferredAxis === 'x') target.x = Math.round(pos.x / CHUNK_SIZE) * CHUNK_SIZE;
    else target.z = Math.round(pos.z / CHUNK_SIZE) * CHUNK_SIZE;
    target.y = Math.max(1.25, Math.min(Number(pos.y) || 1.25, 3));
    return target;
  }

  function snapToRoad(reason = 'Manual road recovery') {
    const p = player();
    if (!p?.mesh?.position) return false;
    const now = performance.now();
    if (now - lastSnapAt < SNAP_COOLDOWN_MS) {
      popup('Road recovery cooling down');
      return false;
    }
    lastSnapAt = now;
    const next = nearestRoadPosition(p.mesh.position);
    p.mesh.position.copy?.(next);
    if (p.vel?.set) p.vel.set(0, 0, 0);
    if (p.activeVehicle) {
      p.activeVehicle.position.copy?.(p.mesh.position);
      p.activeVehicle.position.y = 0.65;
      p.activeVehicle.userData.gas = Math.max(12, Number(p.activeVehicle.userData.gas) || 0);
    }
    lastPos = p.mesh.position.clone?.() || null;
    lastMovedAt = performance.now();
    state.snapCount = Math.max(0, Number(state.snapCount) || 0) + 1;
    api()?.saveState?.(p.slot || 'slot1');
    persist();
    popup(reason);
    return true;
  }

  function buildReport() {
    const snap = snapshot();
    const p = snap?.player;
    const pos = p?.mesh?.position;
    const metrics = pos ? roadMetrics(pos) : null;
    return [
      'NeonBlock Roadside QA Report',
      `time=${new Date().toISOString()}`,
      `version=${diagnostics.version}`,
      `status=${lastRoadStatus}`,
      `pos=${pos ? `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}` : 'unknown'}`,
      `onRoad=${metrics ? metrics.onRoad : 'unknown'}`,
      `distanceToRoad=${metrics ? metrics.distanceToRoad.toFixed(1) : 'unknown'}`,
      `chunks=${snap?.chunks ?? 'unknown'}`,
      `vehicle=${p?.activeVehicle?.userData?.name || 'none'}`,
      `snaps=${Math.max(0, Number(state.snapCount) || 0)}`,
      `visible=${!document.hidden}`,
      `scheduler=${timer ? 'running' : 'stopped'}`,
      `ticks=${diagnostics.ticks}`,
      `renders=${diagnostics.renders}`,
      `storageReadFailures=${diagnostics.storageReadFailures}`,
      `storageWriteFailures=${diagnostics.storageWriteFailures}`
    ].join('\n');
  }

  function saveReport() {
    const report = buildReport();
    state.lastReport = report;
    persist();
    safeWrite(REPORT_KEY, report);
    return report;
  }

  function copyReport() {
    const report = saveReport();
    navigator.clipboard?.writeText(report).then(() => popup('Roadside report copied')).catch(() => popup('Report ready in panel'));
    render(report);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'roadside-polish-panel';
    panel.innerHTML = `
      <div class="roadside-head"><strong>Roadside Assist</strong><button type="button" data-road-close>×</button></div>
      <div class="roadside-body" data-road-body>Loading road status...</div>
      <div class="roadside-actions">
        <button type="button" data-road-snap>Snap to road</button>
        <button type="button" data-road-save>Save</button>
        <button type="button" data-road-copy>Copy report</button>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #roadside-polish-panel{position:fixed;left:12px;bottom:92px;z-index:45;width:min(320px,calc(100vw - 24px));padding:12px;border:1px solid rgba(94,243,140,.45);border-radius:16px;background:rgba(5,8,20,.88);color:#eafff0;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.35);backdrop-filter:blur(10px)}
      #roadside-polish-panel.hidden{display:none}.roadside-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.roadside-head button{border:0;border-radius:10px;background:#1d2b45;color:#fff;padding:4px 9px}.roadside-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.roadside-actions button,#btn-mobile-roadside{border:1px solid rgba(94,243,140,.5);border-radius:999px;background:rgba(94,243,140,.14);color:#eafff0;padding:8px 10px}.roadside-good{color:#5ef38c}.roadside-warn{color:#ffd338}.roadside-bad{color:#ff6b8a}@media(max-width:720px){#roadside-polish-panel{bottom:150px;font-size:12px}.roadside-actions button{padding:10px 12px}}`;
    document.head.appendChild(style);
    document.body.appendChild(panel);
    panel.querySelector('[data-road-close]').addEventListener('click', () => togglePanel(false));
    panel.querySelector('[data-road-snap]').addEventListener('click', () => snapToRoad());
    panel.querySelector('[data-road-save]').addEventListener('click', () => { api()?.saveState?.(); popup('Roadside save complete'); });
    panel.querySelector('[data-road-copy]').addEventListener('click', copyReport);
    panel.classList.toggle('hidden', !!state.hidden);
    return panel;
  }

  function ensureMobileButton() {
    if (document.getElementById('btn-mobile-roadside')) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = 'btn-mobile-roadside';
    btn.type = 'button';
    btn.textContent = 'Road';
    btn.addEventListener('click', () => togglePanel());
    rail.insertBefore(btn, rail.firstChild);
  }

  function togglePanel(force) {
    ensurePanel();
    state.hidden = typeof force === 'boolean' ? !force : !state.hidden;
    panel.classList.toggle('hidden', !!state.hidden);
    if (!state.hidden) render();
    persist();
  }

  function render(extraText = '') {
    if (state.hidden) return;
    ensurePanel();
    const body = panel.querySelector('[data-road-body]');
    const snap = snapshot();
    const p = snap?.player;
    const pos = p?.mesh?.position;
    if (!body || !pos) {
      if (body) body.textContent = 'Runtime not ready yet.';
      return;
    }
    diagnostics.renders += 1;
    const metrics = roadMetrics(pos);
    const moving = lastPos ? (pos.distanceTo?.(lastPos) || 0) > 0.04 : true;
    const cls = metrics.onRoad ? 'roadside-good' : metrics.distanceToRoad > 16 ? 'roadside-bad' : 'roadside-warn';
    lastRoadStatus = metrics.onRoad ? 'on road' : metrics.distanceToRoad > 16 ? 'far from road' : 'near road';
    body.innerHTML = `
      <div>Status: <span class="${cls}">${lastRoadStatus}</span></div>
      <div>Road distance: ${metrics.distanceToRoad.toFixed(1)} blocks</div>
      <div>Movement: ${moving ? 'moving' : 'idle/stuck watch'}</div>
      <div>Vehicle: ${p.activeVehicle?.userData?.name || 'none'}</div>
      <div>Road snaps: ${Math.max(0, Number(state.snapCount) || 0)}</div>
      ${extraText ? `<pre style="white-space:pre-wrap;max-height:120px;overflow:auto">${extraText.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>` : ''}`;
  }

  function safetyTick() {
    const p = player();
    const pos = p?.mesh?.position;
    if (!pos) return;
    diagnostics.ticks += 1;
    diagnostics.lastTickAt = Date.now();
    if (lastPos && (pos.distanceTo?.(lastPos) || 0) > 0.12) lastMovedAt = performance.now();
    const metrics = roadMetrics(pos);
    const stuckOffRoad = !metrics.onRoad && metrics.distanceToRoad > 20 && performance.now() - lastMovedAt > 12000;
    const unsafeY = !Number.isFinite(pos.y) || pos.y < -1;
    if (unsafeY) snapToRoad('Recovered to nearest road');
    else if (p.activeVehicle && stuckOffRoad) snapToRoad('Vehicle recovered to road');
    lastPos = pos.clone?.() || null;
  }

  function tick() {
    safetyTick();
    render();
  }

  function stopScheduler() {
    if (!timer) return;
    clearInterval(timer);
    timer = 0;
  }

  function startScheduler() {
    stopScheduler();
    if (document.hidden) return;
    tick();
    timer = setInterval(tick, TICK_MS);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopScheduler();
      saveReport();
      lastPos = null;
      return;
    }
    lastMovedAt = performance.now();
    startScheduler();
  }

  function isEditableTarget(target) {
    return !!target?.closest?.('input,textarea,select,[contenteditable="true"]');
  }

  function getStatus() {
    return {
      ...diagnostics,
      hidden: !!state.hidden,
      visible: !document.hidden,
      schedulerRunning: !!timer,
      roadStatus: lastRoadStatus,
      snapCount: Math.max(0, Number(state.snapCount) || 0)
    };
  }

  function boot() {
    ensurePanel();
    ensureMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Quote' && !event.repeat && !isEditableTarget(event.target)) togglePanel();
    });
    document.addEventListener('visibilitychange', onVisibilityChange);
    addEventListener('pagehide', () => {
      stopScheduler();
      saveReport();
    });
    startScheduler();
    window.NeonBlockRoadside = Object.freeze({
      getStatus,
      refresh: tick,
      saveNow: saveReport,
      snapToRoad
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
