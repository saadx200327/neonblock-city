(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:city-pulse';
  const REPORT_KEY = 'neonblock:city-pulse-report';
  const POLL_MS = 1000;
  const $ = (id) => document.getElementById(id);

  const diagnostics = {
    version: 2,
    storageReadFailures: 0,
    storageWriteFailures: 0,
    updateCount: 0,
    pauseCount: 0,
    resumeCount: 0,
    lastStorageError: '',
    lastUpdatedAt: 0
  };

  let pollTimer = 0;
  const state = loadState();
  const metrics = {
    startedAt: Date.now(),
    lastPos: null,
    movedMeters: 0,
    lastMoveAt: Date.now(),
    lastMode: 'starting',
    lastReportAt: 0
  };

  function safeRead(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      diagnostics.storageReadFailures += 1;
      diagnostics.lastStorageError = String(error?.message || error || 'Storage read failed');
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      diagnostics.storageWriteFailures += 1;
      diagnostics.lastStorageError = String(error?.message || error || 'Storage write failed');
      return false;
    }
  }

  function loadState() {
    try {
      return Object.assign(
        { hidden: false, compact: false, mobileButton: true },
        JSON.parse(safeRead(STORAGE_KEY, '{}') || '{}')
      );
    } catch (_) {
      return { hidden: false, compact: false, mobileButton: true };
    }
  }

  function savePanelState() {
    return safeWrite(STORAGE_KEY, JSON.stringify({
      hidden: Boolean(state.hidden),
      compact: Boolean(state.compact),
      mobileButton: Boolean(state.mobileButton)
    }));
  }

  function snapshot() {
    try {
      return window.NeonBlockGame?.getSnapshot?.() || null;
    } catch (_) {
      return null;
    }
  }

  function playerPosition(snap) {
    const pos = snap?.player?.mesh?.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  function distance2D(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function classifyWorld(snap) {
    if (!snap) return { label: 'Runtime warming up', hint: 'Wait for the loading screen to finish, then move with WASD or the joystick.' };
    const inVehicle = Boolean(snap.player?.activeVehicle);
    const cash = Math.floor(snap.player?.cash || 0);
    const lotsOwned = Object.keys(snap.player?.ownedLots || {}).length;
    const hasCrates = (snap.crates || 0) > 0;
    const hasCars = (snap.vehicles || 0) > 0;
    const hasLots = (snap.lots || 0) > 0;
    const idleFor = Date.now() - metrics.lastMoveAt;

    if (idleFor > 18000) return { label: 'Idle detected', hint: 'Move forward for a few seconds to stream fresh blocks, crates, cars, and lots.' };
    if (inVehicle) return { label: 'Driving route', hint: 'Use Sprint for speed, X or Space to brake, and watch gas before long delivery runs.' };
    if (hasCrates) return { label: 'Loot nearby', hint: 'Press E or Interact near yellow crates for fast cash and collector progress.' };
    if (hasCars) return { label: 'Vehicle nearby', hint: 'Walk to a car and press E or Interact to start driving missions faster.' };
    if (hasLots && cash >= 500 && lotsOwned === 0) return { label: 'Starter property', hint: 'Find a purple lot and buy it to unlock ownership progress and passive income.' };
    if ((snap.chunks || 0) <= 4) return { label: 'Light stream', hint: 'Keep moving in one direction to load more city chunks around you.' };
    return { label: 'Explore loop', hint: 'Cycle missions with M, follow the arrow, collect crates, claim cars, and buy lots.' };
  }

  function buildPanel() {
    if ($('city-pulse-panel')) return $('city-pulse-panel');
    const panel = document.createElement('section');
    panel.id = 'city-pulse-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="city-pulse-head">
        <strong>City Pulse</strong>
        <div>
          <button id="city-pulse-compact" type="button" title="Compact City Pulse">Mini</button>
          <button id="city-pulse-copy" type="button" title="Copy City Pulse report">Copy</button>
          <button id="city-pulse-toggle" type="button" title="Hide City Pulse">.</button>
        </div>
      </div>
      <div id="city-pulse-body">
        <div class="city-pulse-status" id="city-pulse-status">Runtime warming up</div>
        <div id="city-pulse-hint">Waiting for NeonBlock runtime...</div>
        <div class="city-pulse-grid">
          <span>Chunks <b id="city-pulse-chunks">0</b></span>
          <span>Cars <b id="city-pulse-cars">0</b></span>
          <span>Crates <b id="city-pulse-crates">0</b></span>
          <span>Lots <b id="city-pulse-lots">0</b></span>
        </div>
        <div class="city-pulse-grid">
          <span>Owned <b id="city-pulse-owned">0</b></span>
          <span>Cash <b id="city-pulse-cash">$0</b></span>
          <span>Run <b id="city-pulse-run">0m</b></span>
          <span>Idle <b id="city-pulse-idle">0s</b></span>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #city-pulse-panel{position:fixed;left:calc(12px + env(safe-area-inset-left));bottom:calc(154px + env(safe-area-inset-bottom));z-index:42;width:min(330px,calc(100vw - 24px));padding:10px;border:1px solid rgba(23,243,255,.35);border-radius:14px;background:rgba(5,8,20,.78);backdrop-filter:blur(12px);box-shadow:0 0 24px rgba(23,243,255,.16);color:#e9fbff;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;}
      #city-pulse-panel.hidden{display:none;}
      #city-pulse-panel.compact #city-pulse-body{display:none;}
      .city-pulse-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
      .city-pulse-head strong{letter-spacing:.08em;text-transform:uppercase;color:#17f3ff;}
      .city-pulse-head button,#city-pulse-mobile-btn{border:1px solid rgba(23,243,255,.35);border-radius:999px;background:rgba(12,16,32,.9);color:#e9fbff;padding:6px 9px;font-weight:700;}
      .city-pulse-status{margin-top:8px;color:#5ef38c;font-weight:800;}
      #city-pulse-hint{margin-top:4px;color:#c7d8ff;}
      .city-pulse-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;}
      .city-pulse-grid span{padding:6px;border-radius:10px;background:rgba(255,255,255,.06);color:#9fb2d9;}
      .city-pulse-grid b{display:block;color:#fff;font-size:14px;}
      #city-pulse-mobile-btn{position:fixed;right:calc(12px + env(safe-area-inset-right));bottom:calc(114px + env(safe-area-inset-bottom));z-index:43;min-height:44px;}
      @media (min-width: 760px){#city-pulse-mobile-btn{display:none;}#city-pulse-panel{bottom:18px;}}
      @media (max-width: 520px){#city-pulse-panel{bottom:calc(168px + env(safe-area-inset-bottom));font-size:12px}.city-pulse-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);

    $('city-pulse-toggle').addEventListener('click', () => togglePanel());
    $('city-pulse-compact').addEventListener('click', () => {
      state.compact = !state.compact;
      panel.classList.toggle('compact', state.compact);
      savePanelState();
    });
    $('city-pulse-copy').addEventListener('click', copyReport);
    panel.classList.toggle('hidden', state.hidden);
    panel.classList.toggle('compact', state.compact);
    return panel;
  }

  function buildMobileButton() {
    if ($('city-pulse-mobile-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'city-pulse-mobile-btn';
    btn.type = 'button';
    btn.textContent = 'City';
    btn.addEventListener('click', () => togglePanel(false));
    document.body.appendChild(btn);
  }

  function togglePanel(forceHidden) {
    const panel = buildPanel();
    state.hidden = typeof forceHidden === 'boolean' ? forceHidden : !state.hidden;
    panel.classList.toggle('hidden', state.hidden);
    savePanelState();
  }

  function updateMetrics(pos, snap) {
    if (pos && metrics.lastPos) {
      const delta = distance2D(pos, metrics.lastPos);
      if (delta > 0.08 && delta < 35) {
        metrics.movedMeters += delta;
        metrics.lastMoveAt = Date.now();
      }
    }
    if (pos) metrics.lastPos = pos;
    metrics.lastMode = snap?.player?.activeVehicle ? 'driving' : 'walking';
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function reportPayload(snap, guidance) {
    const owned = Object.keys(snap?.player?.ownedLots || {}).length;
    return {
      feature: 'City Pulse',
      generatedAt: new Date().toISOString(),
      runtimeReady: Boolean(snap),
      guidance: guidance?.label || 'unknown',
      hint: guidance?.hint || '',
      chunks: snap?.chunks || 0,
      vehicles: snap?.vehicles || 0,
      crates: snap?.crates || 0,
      lots: snap?.lots || 0,
      ownedLots: owned,
      cash: Math.floor(snap?.player?.cash || 0),
      mode: metrics.lastMode,
      movedMeters: Math.round(metrics.movedMeters),
      idleSeconds: Math.round((Date.now() - metrics.lastMoveAt) / 1000)
    };
  }

  function saveReport() {
    const snap = snapshot();
    const guidance = classifyWorld(snap);
    const text = JSON.stringify(reportPayload(snap, guidance), null, 2);
    const saved = safeWrite(REPORT_KEY, text);
    if (saved) metrics.lastReportAt = Date.now();
    return { text, saved };
  }

  async function copyReport() {
    const { text, saved } = saveReport();
    try {
      await navigator.clipboard?.writeText(text);
      toast('City Pulse report copied');
    } catch (_) {
      toast(saved ? 'City Pulse report saved locally' : 'City Pulse report ready');
    }
  }

  function toast(text) {
    const popup = $('reward-popup');
    if (popup) {
      popup.textContent = text;
      popup.classList.remove('hidden');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => popup.classList.add('hidden'), 1400);
    }
  }

  function updatePanel() {
    if (document.hidden) return;
    const panel = buildPanel();
    const snap = snapshot();
    const pos = playerPosition(snap);
    updateMetrics(pos, snap);
    const guidance = classifyWorld(snap);
    const owned = Object.keys(snap?.player?.ownedLots || {}).length;
    setText('city-pulse-status', guidance.label);
    setText('city-pulse-hint', guidance.hint);
    setText('city-pulse-chunks', snap?.chunks ?? 0);
    setText('city-pulse-cars', snap?.vehicles ?? 0);
    setText('city-pulse-crates', snap?.crates ?? 0);
    setText('city-pulse-lots', snap?.lots ?? 0);
    setText('city-pulse-owned', owned);
    setText('city-pulse-cash', `$${Math.floor(snap?.player?.cash || 0)}`);
    setText('city-pulse-run', `${Math.round(metrics.movedMeters)}m`);
    setText('city-pulse-idle', `${Math.round((Date.now() - metrics.lastMoveAt) / 1000)}s`);
    panel.classList.toggle('hidden', state.hidden);
    panel.classList.toggle('compact', state.compact);
    diagnostics.updateCount += 1;
    diagnostics.lastUpdatedAt = Date.now();
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearTimeout(pollTimer);
    pollTimer = 0;
    diagnostics.pauseCount += 1;
  }

  function schedulePolling() {
    stopPolling();
    if (document.hidden) return;
    diagnostics.resumeCount += 1;
    const tick = () => {
      pollTimer = 0;
      if (document.hidden) return;
      updatePanel();
      pollTimer = setTimeout(tick, POLL_MS);
    };
    pollTimer = setTimeout(tick, POLL_MS);
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Period' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') togglePanel();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
      saveReport();
      return;
    }
    metrics.lastPos = playerPosition(snapshot());
    updatePanel();
    schedulePolling();
  });

  window.addEventListener('pagehide', () => {
    stopPolling();
    saveReport();
  });

  window.NeonBlockCityPulse = Object.assign(window.NeonBlockCityPulse || {}, {
    refresh: updatePanel,
    saveReport,
    getStatus() {
      return {
        ...diagnostics,
        hidden: Boolean(state.hidden),
        compact: Boolean(state.compact),
        polling: Boolean(pollTimer),
        documentHidden: document.hidden,
        movedMeters: Math.round(metrics.movedMeters),
        lastMoveAt: metrics.lastMoveAt,
        lastReportAt: metrics.lastReportAt
      };
    }
  });

  buildPanel();
  buildMobileButton();
  updatePanel();
  schedulePolling();
})();