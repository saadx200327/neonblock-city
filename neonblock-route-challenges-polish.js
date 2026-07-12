(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:route-challenges:v1';
  const REPORT_KEY = 'neonblock:route-challenges-report:v1';
  const OPEN_KEY = 'neonblock:route-challenges-open';
  const PANEL_ID = 'neonblock-route-challenges-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-routes';
  const TICK_MS = 850;

  const ROUTES = [
    { id: 'foot-loop', title: 'Neon Foot Loop', mode: 'on-foot', target: 220, reward: 95, xp: 35, text: 'Travel on foot through streamed streets.' },
    { id: 'drive-loop', title: 'Turbo Road Loop', mode: 'vehicle', target: 300, reward: 150, xp: 50, text: 'Drive any vehicle without needing a live server.' },
    { id: 'owner-check', title: 'Owner Check Route', mode: 'ownership', target: 1, reward: 180, xp: 55, text: 'Own at least one lot, then claim a local-first property route bonus.' }
  ];

  const DEFAULT_STATE = {
    activeRouteId: 'foot-loop', progress: {}, claims: {}, lastPos: null,
    lastMode: 'starting', lastSnapshotAt: 0, lastSaveAt: 0, report: null
  };

  const diagnostics = {
    version: 2, storageReadFailures: 0, storageWriteFailures: 0,
    ticks: 0, renders: 0, schedulerStarts: 0, schedulerStops: 0,
    lastStorageError: null, lastTickAt: 0
  };

  let panel;
  let statusEl;
  let routeListEl;
  let reportEl;
  let timer = null;

  function recordStorageFailure(kind, error) {
    diagnostics[kind === 'read' ? 'storageReadFailures' : 'storageWriteFailures'] += 1;
    diagnostics.lastStorageError = error?.message || String(error);
  }

  function storageGet(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; }
    catch (error) { recordStorageFailure('read', error); return fallback; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (error) { recordStorageFailure('write', error); return false; }
  }

  function loadState() {
    try {
      const saved = JSON.parse(storageGet(STORAGE_KEY, '{}'));
      return { ...DEFAULT_STATE, ...(saved && typeof saved === 'object' ? saved : {}) };
    } catch (error) {
      return { ...DEFAULT_STATE, report: { at: Date.now(), warning: `State reset after parse error: ${error.message}` } };
    }
  }

  const state = loadState();

  function getSnapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; }
    catch { return null; }
  }

  function getPlayer(snapshot = getSnapshot()) { return snapshot?.player || null; }

  function getPosition(snapshot = getSnapshot()) {
    const pos = getPlayer(snapshot)?.mesh?.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    return { x: pos.x, y: Number.isFinite(pos.y) ? pos.y : 1, z: pos.z };
  }

  function distance2D(a, b) {
    if (!a || !b) return 0;
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    return Number.isFinite(dist) ? Math.min(dist, 90) : 0;
  }

  function activeRoute() { return ROUTES.find((route) => route.id === state.activeRouteId) || ROUTES[0]; }
  function routeProgress(route = activeRoute()) { return Math.max(0, Number(state.progress[route.id] || 0)); }
  function routeClaims(route = activeRoute()) { return Math.max(0, Number(state.claims[route.id] || 0)); }
  function isComplete(route = activeRoute()) { return routeProgress(route) >= route.target; }

  function addProgress(route, amount) {
    if (!route || !Number.isFinite(amount) || amount <= 0) return;
    state.progress[route.id] = Math.min(route.target, routeProgress(route) + amount);
  }

  function buildReport(reason = 'manual') {
    const snapshot = getSnapshot();
    const player = getPlayer(snapshot);
    const pos = getPosition(snapshot);
    const route = activeRoute();
    return {
      at: new Date().toISOString(), reason, activeRoute: route.id,
      progress: Math.round(routeProgress(route)), target: route.target,
      complete: isComplete(route), claims: { ...state.claims }, mode: state.lastMode,
      player: pos ? { x: Number(pos.x.toFixed(1)), y: Number(pos.y.toFixed(1)), z: Number(pos.z.toFixed(1)) } : null,
      vehicle: player?.activeVehicle?.userData?.name || 'On foot',
      cash: Math.floor(Number(player?.cash || 0)), xp: Math.floor(Number(player?.xp || 0)),
      ownedLots: Object.keys(player?.ownedLots || {}).length, chunks: snapshot?.chunks ?? 0,
      scheduler: { running: Boolean(timer), hidden: document.hidden, ...diagnostics },
      routes: ROUTES.map((item) => ({ id: item.id, progress: Math.round(routeProgress(item)), target: item.target, claims: routeClaims(item) }))
    };
  }

  function saveState(reason = 'auto') {
    state.lastSaveAt = Date.now();
    state.report = buildReport(reason);
    storageSet(STORAGE_KEY, JSON.stringify(state));
    storageSet(REPORT_KEY, JSON.stringify(state.report, null, 2));
    try { window.NeonBlockGame?.saveState?.(); }
    catch (error) { state.report.saveWarning = error.message; }
    return state.report;
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1600);
  }

  function trackProgress() {
    diagnostics.ticks += 1;
    diagnostics.lastTickAt = Date.now();
    const snapshot = getSnapshot();
    const player = getPlayer(snapshot);
    const pos = getPosition(snapshot);
    const now = Date.now();
    if (!player || !pos) {
      state.lastMode = 'waiting for runtime';
      render();
      return;
    }

    const moved = distance2D(pos, state.lastPos);
    const inVehicle = Boolean(player.activeVehicle);
    const ownedCount = Object.keys(player.ownedLots || {}).length;
    const route = activeRoute();
    if (route.mode === 'on-foot' && !inVehicle) addProgress(route, moved);
    if (route.mode === 'vehicle' && inVehicle) addProgress(route, moved);
    if (route.mode === 'ownership' && ownedCount > 0) addProgress(route, ownedCount);

    state.lastPos = pos;
    state.lastMode = inVehicle ? 'driving' : 'walking';
    state.lastSnapshotAt = now;
    if (now - state.lastSaveAt > 20000) saveState('timed route backup');
    render();
  }

  function stopScheduler() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    diagnostics.schedulerStops += 1;
  }

  function scheduleNext() {
    stopScheduler();
    if (document.hidden) return;
    timer = setTimeout(() => {
      timer = null;
      trackProgress();
      scheduleNext();
    }, TICK_MS);
    diagnostics.schedulerStarts += 1;
  }

  function refresh() {
    state.lastPos = getPosition();
    trackProgress();
    scheduleNext();
  }

  function claimActiveRoute() {
    const route = activeRoute();
    if (!isComplete(route)) return popup(`${route.title}: keep going`);
    const player = getPlayer();
    if (player) {
      player.cash = Math.max(0, Number(player.cash || 0)) + route.reward;
      player.xp = Math.max(0, Number(player.xp || 0)) + route.xp;
    }
    state.claims[route.id] = routeClaims(route) + 1;
    state.progress[route.id] = 0;
    saveState(`claimed ${route.id}`);
    popup(`${route.title}: +$${route.reward}`);
    render();
  }

  function selectRoute(id) {
    if (!ROUTES.some((route) => route.id === id)) return;
    state.activeRouteId = id;
    state.lastPos = getPosition();
    saveState(`selected ${id}`);
    render();
  }

  function nextRoute() {
    const index = ROUTES.findIndex((route) => route.id === state.activeRouteId);
    selectRoute(ROUTES[(index + 1 + ROUTES.length) % ROUTES.length].id);
  }

  async function copyReport() {
    const report = saveState('copied route QA report');
    try { await navigator.clipboard?.writeText(JSON.stringify(report, null, 2)); popup('Route QA copied'); }
    catch { popup('Route QA saved locally'); }
    render();
  }

  function injectStyles() {
    if (document.getElementById('neonblock-route-challenges-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-route-challenges-style';
    style.textContent = `
      #${PANEL_ID}{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:calc(92px + env(safe-area-inset-bottom));z-index:34;width:min(360px,calc(100vw - 24px));max-height:min(74vh,560px);overflow:auto;padding:14px;border:1px solid rgba(23,243,255,.38);border-radius:18px;background:rgba(5,8,20,.88);color:#e9fbff;box-shadow:0 18px 60px rgba(0,0,0,.42),0 0 24px rgba(23,243,255,.12);backdrop-filter:blur(12px);font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,sans-serif}
      #${PANEL_ID}.hidden{display:none} #${PANEL_ID} h3{margin:0 0 8px;color:#17f3ff;font-size:17px} #${PANEL_ID} p{margin:6px 0;color:#bfefff}
      #${PANEL_ID} .route-card{margin:8px 0;padding:9px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.055)} #${PANEL_ID} .route-card.active{border-color:rgba(94,243,140,.65)}
      #${PANEL_ID} .route-meter{height:8px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.12);margin-top:6px} #${PANEL_ID} .route-meter span{display:block;height:100%;width:0;background:linear-gradient(90deg,#17f3ff,#5ef38c)}
      #${PANEL_ID} .route-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} #${PANEL_ID} button,#${MOBILE_BUTTON_ID}{border:0;border-radius:999px;padding:8px 10px;background:rgba(23,243,255,.16);color:#e9fbff;font-weight:700}
      #${PANEL_ID} button:active,#${MOBILE_BUTTON_ID}:active{transform:translateY(1px)} #${PANEL_ID} pre{max-height:140px;overflow:auto;white-space:pre-wrap;background:rgba(0,0,0,.24);padding:8px;border-radius:10px}`;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (panel) return;
    injectStyles();
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = storageGet(OPEN_KEY, '0') === '1' ? '' : 'hidden';
    panel.innerHTML = `<h3>Route Challenges <span style="float:right;font-size:12px;color:#9defff">F7</span></h3><p id="route-challenges-status">Waiting for city runtime...</p><div id="route-challenges-list"></div><div class="route-actions"><button type="button" data-route-action="claim">Claim Route</button><button type="button" data-route-action="next">Next Route</button><button type="button" data-route-action="save">Quick Save</button><button type="button" data-route-action="copy">Copy QA</button></div><pre id="route-challenges-report"></pre>`;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#route-challenges-status');
    routeListEl = panel.querySelector('#route-challenges-list');
    reportEl = panel.querySelector('#route-challenges-report');
    panel.addEventListener('click', (event) => {
      const routeId = event.target?.dataset?.routeId;
      const action = event.target?.dataset?.routeAction;
      if (routeId) selectRoute(routeId);
      if (action === 'claim') claimActiveRoute();
      if (action === 'next') nextRoute();
      if (action === 'save') { saveState('manual route quick save'); popup('Route state saved'); render(); }
      if (action === 'copy') copyReport();
    });
  }

  function addMobileButton() {
    if (document.getElementById(MOBILE_BUTTON_ID)) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'action-btn'; button.id = MOBILE_BUTTON_ID; button.type = 'button'; button.textContent = 'Routes';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel(force) {
    buildPanel();
    const open = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    storageSet(OPEN_KEY, open ? '1' : '0');
    render();
  }

  function render() {
    if (!panel || !statusEl || !routeListEl || !reportEl) return;
    diagnostics.renders += 1;
    const snapshot = getSnapshot();
    const player = getPlayer(snapshot);
    const route = activeRoute();
    const progress = routeProgress(route);
    statusEl.textContent = `${route.title}: ${Math.floor(progress)}/${route.target} • ${state.lastMode} • ${player?.activeVehicle ? 'vehicle active' : 'on foot'} • owned ${Object.keys(player?.ownedLots || {}).length}`;
    routeListEl.innerHTML = ROUTES.map((item) => {
      const pct = Math.max(0, Math.min(100, (routeProgress(item) / item.target) * 100));
      const active = item.id === route.id ? ' active' : '';
      return `<div class="route-card${active}"><strong>${item.title}</strong><p>${item.text}</p><button type="button" data-route-id="${item.id}">Track</button><span> ${Math.floor(routeProgress(item))}/${item.target} • claims ${routeClaims(item)}</span><div class="route-meter"><span style="width:${pct}%"></span></div></div>`;
    }).join('');
    reportEl.textContent = JSON.stringify(buildReport('render'), null, 2);
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'F7') { event.preventDefault(); togglePanel(); }
  });

  window.addEventListener('pagehide', () => { stopScheduler(); saveState('pagehide route backup'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopScheduler();
      state.lastPos = null;
      saveState('hidden route backup');
    } else {
      state.lastPos = getPosition();
      trackProgress();
      scheduleNext();
    }
  });

  function boot() {
    buildPanel(); addMobileButton(); render();
    state.lastPos = getPosition();
    scheduleNext();
    setTimeout(() => saveState('route challenges boot'), 1200);
  }

  window.NeonBlockRouteChallenges = {
    getStatus: () => ({ ...diagnostics, schedulerRunning: Boolean(timer), hidden: document.hidden, activeRouteId: state.activeRouteId }),
    refresh,
    saveNow: () => saveState('manual API save')
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
