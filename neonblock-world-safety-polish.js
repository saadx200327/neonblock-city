(() => {
  'use strict';

  const STORE_KEY = 'neonblock:world-safety:v1';
  const PANEL_ID = 'world-safety-panel';
  const MAX_SAFE_COORDINATE = 250000;
  const MIN_Y = -8;
  const SCAN_INTERVAL_MS = 1200;
  const BOOT_INTERVAL_MS = 400;
  const STABLE_PERSIST_INTERVAL_MS = 15000;
  const STABLE_MOVE_THRESHOLD = 3;
  const MAX_STABLE_AGE_MS = 1000 * 60 * 60 * 24 * 30;
  let hidden = false;
  let lastFixAt = 0;
  let stableSpot = null;
  let lastPersistedSpot = null;
  let lastStablePersistAt = 0;
  let lastReport = 'Watching player position';
  let storageFailures = 0;
  let scanTimer = 0;
  let bootTimer = 0;
  let scans = 0;
  let stableWrites = 0;
  let skippedStableWrites = 0;
  let frozen = false;
  let pageHidden = false;
  let lifecyclePaused = document.hidden;
  let lifecyclePauses = 0;
  let lifecycleResumes = 0;
  let lastLifecycleReason = document.hidden ? 'initially hidden' : 'boot';

  const $ = (id) => document.getElementById(id);

  function readStorage(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      storageFailures += 1;
      lastReport = `Storage unavailable: ${error.message || 'read failed'}`;
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      storageFailures += 1;
      lastReport = `Storage unavailable: ${error.message || 'write failed'}`;
      return false;
    }
  }

  hidden = readStorage(`${STORE_KEY}:hidden`, '0') === '1';

  function game() {
    return window.NeonBlockGame;
  }

  function snapshot() {
    try {
      return game()?.getSnapshot?.() || null;
    } catch (error) {
      lastReport = `Snapshot unavailable: ${error.message}`;
      return null;
    }
  }

  function popup(text) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1700);
  }

  function finite(value) {
    return Number.isFinite(value);
  }

  function validStableSpot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!finite(value.x) || !finite(value.y) || !finite(value.z) || !finite(value.at)) return false;
    if (value.y < 0.8 || Math.abs(value.x) > MAX_SAFE_COORDINATE || Math.abs(value.z) > MAX_SAFE_COORDINATE) return false;
    if (value.at <= 0 || value.at > Date.now() + 60000 || Date.now() - value.at > MAX_STABLE_AGE_MS) return false;
    return true;
  }

  function movedEnough(next, previous) {
    if (!previous) return true;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const dz = next.z - previous.z;
    return (dx * dx) + (dy * dy) + (dz * dz) >= STABLE_MOVE_THRESHOLD * STABLE_MOVE_THRESHOLD;
  }

  function persistStableSpot(force = false) {
    if (!stableSpot) return false;
    const now = Date.now();
    if (!force && now - lastStablePersistAt < STABLE_PERSIST_INTERVAL_MS && !movedEnough(stableSpot, lastPersistedSpot)) {
      skippedStableWrites += 1;
      return false;
    }
    if (!writeStorage(`${STORE_KEY}:stable`, JSON.stringify(stableSpot))) return false;
    lastPersistedSpot = { ...stableSpot };
    lastStablePersistAt = now;
    stableWrites += 1;
    return true;
  }

  function rememberStableSpot(snap) {
    const pos = snap?.player?.mesh?.position;
    if (!pos || !finite(pos.x) || !finite(pos.y) || !finite(pos.z)) return;
    if (pos.y < 0.8 || Math.abs(pos.x) > MAX_SAFE_COORDINATE || Math.abs(pos.z) > MAX_SAFE_COORDINATE) return;
    stableSpot = { x: pos.x, y: Math.max(1, pos.y), z: pos.z, at: Date.now() };
    persistStableSpot(false);
  }

  function loadStableSpot() {
    if (stableSpot) return stableSpot;
    try {
      const parsed = JSON.parse(readStorage(`${STORE_KEY}:stable`, 'null') || 'null');
      if (validStableSpot(parsed)) {
        stableSpot = parsed;
        lastPersistedSpot = { ...parsed };
        lastStablePersistAt = parsed.at;
      } else if (parsed) {
        lastReport = 'Ignored invalid or stale recovery point';
      }
    } catch (_) {
      lastReport = 'Ignored unreadable recovery point';
    }
    return stableSpot;
  }

  function safeSpot() {
    const saved = loadStableSpot();
    if (saved) return saved;
    return { x: 0, y: 1.2, z: 0, at: Date.now() };
  }

  function recover(reason = 'manual recovery') {
    const snap = snapshot();
    const mesh = snap?.player?.mesh;
    if (!mesh?.position) return false;
    const spot = safeSpot();
    mesh.position.set(spot.x, Math.max(1.2, spot.y), spot.z);
    if (snap.player?.vel?.set) snap.player.vel.set(0, 0, 0);
    if (snap.player?.activeVehicle?.position) {
      snap.player.activeVehicle.position.copy(mesh.position);
      snap.player.activeVehicle.position.y = 0.65;
      if (snap.player.activeVehicle.userData) {
        snap.player.activeVehicle.userData.gas = Math.max(5, snap.player.activeVehicle.userData.gas || 0);
      }
    }
    lastFixAt = Date.now();
    lastReport = `Recovered: ${reason}`;
    try { game()?.saveState?.(snap.player?.slot || 'slot1'); } catch (_) {}
    popup(`World recovery: ${reason}`);
    updatePanel();
    return true;
  }

  function needsRecovery(pos) {
    if (!pos) return 'missing position';
    if (!finite(pos.x) || !finite(pos.y) || !finite(pos.z)) return 'invalid position';
    if (pos.y < MIN_Y) return 'below city';
    if (Math.abs(pos.x) > MAX_SAFE_COORDINATE || Math.abs(pos.z) > MAX_SAFE_COORDINATE) return 'coordinate precision limit';
    return '';
  }

  function scan() {
    scans += 1;
    const snap = snapshot();
    const pos = snap?.player?.mesh?.position;
    const reason = needsRecovery(pos);
    if (reason) {
      if (Date.now() - lastFixAt > 2500) recover(reason);
      return;
    }
    rememberStableSpot(snap);
    const chunks = snap?.chunks ?? 0;
    const total = (snap?.vehicles || 0) + (snap?.crates || 0) + (snap?.lots || 0);
    lastReport = `Stable • chunks ${chunks} • interactables ${total}`;
  }

  function ensurePanel() {
    if ($(PANEL_ID)) return $(PANEL_ID);
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed',
      'left:12px',
      'bottom:12px',
      'z-index:34',
      'max-width:260px',
      'padding:10px 12px',
      'border:1px solid rgba(94,243,140,.45)',
      'border-radius:14px',
      'background:rgba(5,8,20,.76)',
      'color:#dff',
      'font:12px/1.35 system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)',
      'backdrop-filter:blur(8px)'
    ].join(';');
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <strong>World Safety</strong>
        <button id="world-safety-hide" style="min-height:28px">Z</button>
      </div>
      <div id="world-safety-status">Starting...</div>
      <div id="world-safety-pos" style="opacity:.8;margin-top:4px"></div>
      <button id="world-safety-recover" style="margin-top:8px;width:100%;min-height:32px">Recover to safe spot</button>
    `;
    document.body.appendChild(panel);
    $('world-safety-hide')?.addEventListener('click', togglePanel);
    $('world-safety-recover')?.addEventListener('click', () => recover('manual button'));
    return panel;
  }

  function updatePanel() {
    const panel = ensurePanel();
    panel.style.display = hidden ? 'none' : 'block';
    if (hidden) return;
    const snap = snapshot();
    const pos = snap?.player?.mesh?.position;
    const status = $('world-safety-status');
    const posLine = $('world-safety-pos');
    if (status) status.textContent = lastReport;
    if (posLine && pos) posLine.textContent = `Pos ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
  }

  function togglePanel() {
    hidden = !hidden;
    writeStorage(`${STORE_KEY}:hidden`, hidden ? '1' : '0');
    updatePanel();
    popup(hidden ? 'World Safety hidden' : 'World Safety shown');
  }

  function stopScheduler() {
    clearTimeout(scanTimer);
    clearTimeout(bootTimer);
    scanTimer = 0;
    bootTimer = 0;
  }

  function isLifecycleSuspended() {
    return document.hidden || frozen || pageHidden;
  }

  function scheduleScan(delay = SCAN_INTERVAL_MS) {
    clearTimeout(scanTimer);
    if (isLifecycleSuspended() || !game()?.getSnapshot) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      if (isLifecycleSuspended()) return;
      scan();
      if (!hidden) updatePanel();
      scheduleScan();
    }, delay);
  }

  function boot() {
    clearTimeout(bootTimer);
    if (isLifecycleSuspended()) return;
    if (!game()?.getSnapshot) {
      bootTimer = setTimeout(boot, BOOT_INTERVAL_MS);
      return;
    }
    ensurePanel();
    scan();
    updatePanel();
    scheduleScan();
  }

  function pauseLifecycle(reason = 'background') {
    if (!lifecyclePaused) {
      lifecyclePaused = true;
      lifecyclePauses += 1;
      persistStableSpot(true);
    }
    lastLifecycleReason = reason;
    stopScheduler();
  }

  function resumeLifecycle(reason = 'foreground') {
    if (isLifecycleSuspended()) return;
    if (lifecyclePaused) {
      lifecyclePaused = false;
      lifecycleResumes += 1;
    }
    lastLifecycleReason = reason;
    boot();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseLifecycle('visibility hidden');
      return;
    }
    resumeLifecycle('visibility visible');
  });

  document.addEventListener('freeze', () => {
    frozen = true;
    pauseLifecycle('document freeze');
  });

  document.addEventListener('resume', () => {
    frozen = false;
    resumeLifecycle('document resume');
  });

  window.addEventListener('pagehide', () => {
    pageHidden = true;
    pauseLifecycle('pagehide');
  });

  window.addEventListener('pageshow', () => {
    pageHidden = false;
    resumeLifecycle('pageshow');
  });

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyZ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
    togglePanel();
  });

  window.addEventListener('error', (event) => {
    lastReport = `Runtime warning: ${event.message || 'script error'}`;
    if (!hidden) updatePanel();
  });

  window.NeonBlockWorldSafety = {
    recover,
    scan,
    getStableSpot: () => loadStableSpot(),
    saveNow: () => persistStableSpot(true),
    refresh: () => {
      scan();
      updatePanel();
    },
    getStatus: () => ({
      version: 4,
      maxSafeCoordinate: MAX_SAFE_COORDINATE,
      lastFixAt,
      lastReport,
      storageFailures,
      scans,
      stableWrites,
      skippedStableWrites,
      lastStablePersistAt,
      active: Boolean(scanTimer || bootTimer),
      pausedForVisibility: document.hidden,
      frozen,
      pageHidden,
      lifecyclePaused,
      lifecyclePauses,
      lifecycleResumes,
      lastLifecycleReason
    })
  };

  boot();
})();