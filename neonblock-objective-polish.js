(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORE = 'neonblock:objective-polish:v1';
  const DAY_MS = 24 * 60 * 60 * 1000;

  const state = loadState();
  let lastPos = null;
  let lastSaveAt = 0;

  function loadState() {
    try {
      return Object.assign({
        day: todayKey(),
        distance: 0,
        crateBase: null,
        lotBase: null,
        vehicleSeconds: 0,
        claimed: false,
        lastHint: ''
      }, JSON.parse(localStorage.getItem(STORE) || '{}'));
    } catch (_) {
      return { day: todayKey(), distance: 0, crateBase: null, lotBase: null, vehicleSeconds: 0, claimed: false, lastHint: '' };
    }
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function saveLocal(force = false) {
    const now = performance.now();
    if (!force && now - lastSaveAt < 4000) return;
    lastSaveAt = now;
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
  }

  function getGame() {
    return window.NeonBlockGame?.getSnapshot?.();
  }

  function resetIfNewDay(snapshot) {
    const key = todayKey();
    if (state.day === key) return;
    state.day = key;
    state.distance = 0;
    state.vehicleSeconds = 0;
    state.crateBase = snapshot?.player ? snapshot.player.cash : null;
    state.lotBase = snapshot?.player?.ownedLots ? Object.keys(snapshot.player.ownedLots).length : null;
    state.claimed = false;
    lastPos = null;
    saveLocal(true);
  }

  function ensurePanel() {
    let panel = $('objective-polish');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'objective-polish';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="objective-title">City Objectives</div>
      <div id="objective-nearby">Nearby: scanning...</div>
      <div id="objective-daily">Daily: 0%</div>
      <button id="btn-claim-daily" type="button">Claim Daily</button>
    `;
    document.body.appendChild(panel);
    const style = document.createElement('style');
    style.textContent = `
      #objective-polish{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:calc(138px + env(safe-area-inset-bottom));z-index:18;max-width:260px;padding:10px 12px;border:1px solid rgba(23,243,255,.32);border-radius:14px;background:rgba(5,8,20,.72);backdrop-filter:blur(10px);box-shadow:0 0 24px rgba(23,243,255,.12);font:12px/1.35 system-ui,sans-serif;color:#eafcff;pointer-events:auto}
      #objective-polish .objective-title{font-weight:800;color:#17f3ff;margin-bottom:4px;letter-spacing:.04em;text-transform:uppercase}
      #objective-polish button{margin-top:7px;width:100%;border:0;border-radius:10px;padding:7px 8px;background:#17f3ff;color:#06101c;font-weight:800}
      #objective-polish button[disabled]{opacity:.48;filter:grayscale(1)}
      @media (max-width:720px){#objective-polish{right:max(10px,env(safe-area-inset-right));left:auto;bottom:calc(96px + env(safe-area-inset-bottom));max-width:210px;font-size:11px}}
      body.neonblock-low-motion #objective-polish{backdrop-filter:none;box-shadow:none}
    `;
    document.head.appendChild(style);
    $('btn-claim-daily')?.addEventListener('click', claimDaily);
    return panel;
  }

  function distance2D(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.hypot(dx, dz);
  }

  function scanNearby(snapshot) {
    const player = snapshot?.player;
    const p = player?.mesh?.position;
    if (!p) return 'Nearby: loading...';
    const items = [];
    const lists = [
      ['vehicle', snapshot.vehicles, 'vehicle'],
      ['crate', snapshot.crates, 'crate'],
      ['lot', snapshot.lots, 'property']
    ];
    // `getSnapshot` exposes counts, not arrays, so give context from player state plus active vehicle.
    if (player.activeVehicle) items.push(`driving ${player.activeVehicle.userData?.name || 'vehicle'}`);
    if (!player.activeVehicle && snapshot.vehicles > 0) items.push(`${snapshot.vehicles} streamed vehicles`);
    if (snapshot.crates > 0) items.push(`${snapshot.crates} crates nearby`);
    const ownedCount = Object.keys(player.ownedLots || {}).length;
    if (snapshot.lots > ownedCount) items.push('buyable lots nearby');
    if (!items.length) return 'Nearby: keep moving to stream more city blocks';
    return `Nearby: ${items.slice(0, 2).join(' • ')}`;
  }

  function updateProgress(snapshot, dt) {
    const player = snapshot?.player;
    const pos = player?.mesh?.position;
    if (!player || !pos) return;
    if (state.crateBase === null) state.crateBase = player.cash;
    if (state.lotBase === null) state.lotBase = Object.keys(player.ownedLots || {}).length;
    if (lastPos) state.distance += Math.min(30, distance2D(pos, lastPos));
    lastPos = pos.clone ? pos.clone() : { x: pos.x, z: pos.z };
    if (player.activeVehicle) state.vehicleSeconds += dt;
  }

  function dailyPercent(snapshot) {
    const player = snapshot?.player;
    const ownedLots = Object.keys(player?.ownedLots || {}).length;
    const moved = Math.min(1, state.distance / 350);
    const drove = Math.min(1, state.vehicleSeconds / 45);
    const owns = ownedLots > (state.lotBase ?? ownedLots) ? 1 : 0;
    return Math.round(((moved + drove + owns) / 3) * 100);
  }

  function claimDaily() {
    const snapshot = getGame();
    const player = snapshot?.player;
    if (!player || state.claimed || dailyPercent(snapshot) < 100) return;
    player.cash += 250;
    player.xp += 90;
    state.claimed = true;
    saveLocal(true);
    window.NeonBlockGame?.saveState?.(player.slot || 'slot1');
    showToast('Daily city objectives complete: +$250 +90 XP');
  }

  function showToast(text) {
    const popup = $('reward-popup');
    if (popup) {
      popup.textContent = text;
      popup.classList.remove('hidden');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => popup.classList.add('hidden'), 1800);
    } else {
      console.info('[NeonBlock City]', text);
    }
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const snapshot = getGame();
    if (!snapshot?.player) return;
    resetIfNewDay(snapshot);
    const dt = Math.min(1, Math.max(0, (now - last) / 1000));
    last = now;
    updateProgress(snapshot, dt);
    const panel = ensurePanel();
    const nearby = $('objective-nearby');
    const daily = $('objective-daily');
    const button = $('btn-claim-daily');
    const percent = dailyPercent(snapshot);
    if (nearby) nearby.textContent = scanNearby(snapshot);
    if (daily) daily.textContent = `Daily: ${percent}% • move 350m, drive 45s, buy 1 lot`;
    if (button) {
      button.disabled = state.claimed || percent < 100;
      button.textContent = state.claimed ? 'Daily Claimed' : percent >= 100 ? 'Claim Daily +$250' : 'Claim Daily';
    }
    saveLocal(false);
  }

  addEventListener('pagehide', () => saveLocal(true));
  requestAnimationFrame(loop);
})();
