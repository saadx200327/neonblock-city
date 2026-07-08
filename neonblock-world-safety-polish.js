(() => {
  'use strict';

  const STORE_KEY = 'neonblock:world-safety:v1';
  const PANEL_ID = 'world-safety-panel';
  const SAFE_LIMIT = 1200;
  const MIN_Y = -8;
  let hidden = localStorage.getItem(`${STORE_KEY}:hidden`) === '1';
  let lastFixAt = 0;
  let stableSpot = null;
  let lastReport = 'Watching player position';

  const $ = (id) => document.getElementById(id);

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

  function playerMesh() {
    return snapshot()?.player?.mesh || null;
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

  function rememberStableSpot(snap) {
    const pos = snap?.player?.mesh?.position;
    if (!pos || !finite(pos.x) || !finite(pos.y) || !finite(pos.z)) return;
    if (pos.y < 0.8 || Math.abs(pos.x) > SAFE_LIMIT || Math.abs(pos.z) > SAFE_LIMIT) return;
    stableSpot = { x: pos.x, y: Math.max(1, pos.y), z: pos.z, at: Date.now() };
    try {
      localStorage.setItem(`${STORE_KEY}:stable`, JSON.stringify(stableSpot));
    } catch (_) {}
  }

  function loadStableSpot() {
    if (stableSpot) return stableSpot;
    try {
      const parsed = JSON.parse(localStorage.getItem(`${STORE_KEY}:stable`) || 'null');
      if (parsed && finite(parsed.x) && finite(parsed.y) && finite(parsed.z)) stableSpot = parsed;
    } catch (_) {}
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
    if (Math.abs(pos.x) > SAFE_LIMIT || Math.abs(pos.z) > SAFE_LIMIT) return 'outside streamed city';
    return '';
  }

  function scan() {
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
    const snap = snapshot();
    const pos = snap?.player?.mesh?.position;
    const status = $('world-safety-status');
    const posLine = $('world-safety-pos');
    if (status) status.textContent = lastReport;
    if (posLine && pos) posLine.textContent = `Pos ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
  }

  function togglePanel() {
    hidden = !hidden;
    localStorage.setItem(`${STORE_KEY}:hidden`, hidden ? '1' : '0');
    updatePanel();
    popup(hidden ? 'World Safety hidden' : 'World Safety shown');
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyZ' || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    togglePanel();
  });

  window.addEventListener('error', (event) => {
    lastReport = `Runtime warning: ${event.message || 'script error'}`;
    updatePanel();
  });

  window.NeonBlockWorldSafety = { recover, scan, getStableSpot: () => loadStableSpot() };

  const boot = setInterval(() => {
    if (!game()?.getSnapshot) return;
    clearInterval(boot);
    ensurePanel();
    scan();
    updatePanel();
    setInterval(() => { scan(); updatePanel(); }, 1200);
  }, 400);
})();
