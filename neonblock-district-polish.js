(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:district-polish';
  const REPORT_KEY = 'neonblock:district-report';
  const $ = (id) => document.getElementById(id);

  const state = loadState();
  let visible = state.visible ?? false;
  let lastChunkKey = '';
  let lastSavedAt = 0;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        visible: Boolean(parsed.visible),
        discovered: parsed.discovered && typeof parsed.discovered === 'object' ? parsed.discovered : {},
        visits: parsed.visits && typeof parsed.visits === 'object' ? parsed.visits : {},
        lastDistrict: parsed.lastDistrict || '',
        lastReport: parsed.lastReport || ''
      };
    } catch (_) {
      return { visible: false, discovered: {}, visits: {}, lastDistrict: '', lastReport: '' };
    }
  }

  function persist(force = false) {
    const now = Date.now();
    if (!force && now - lastSavedAt < 5000) return;
    lastSavedAt = now;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function getSnapshot() {
    try {
      return window.NeonBlockGame?.getSnapshot?.() || null;
    } catch (_) {
      return null;
    }
  }

  function playerPosition(snapshot) {
    const pos = snapshot?.player?.mesh?.position;
    if (!pos) return { x: 0, y: 1, z: 0 };
    return { x: Number(pos.x) || 0, y: Number(pos.y) || 1, z: Number(pos.z) || 0 };
  }

  function districtNameFromChunk(cx, cz) {
    const ring = Math.max(Math.abs(cx), Math.abs(cz));
    if (ring === 0) return 'Neon Core';
    const eastWest = cx > 0 ? 'East' : cx < 0 ? 'West' : 'Central';
    const northSouth = cz > 0 ? 'South' : cz < 0 ? 'North' : 'Midtown';
    const flavor = ['Arcade Row', 'Taxi Yard', 'Skyline Market', 'Glow Docks', 'Pixel Heights', 'Circuit Plaza'];
    const idx = Math.abs((cx * 17 + cz * 31 + ring * 7) % flavor.length);
    return `${eastWest} ${northSouth} ${flavor[idx]}`;
  }

  function districtFromPosition(pos) {
    const cx = Math.round(pos.x / 48);
    const cz = Math.round(pos.z / 48);
    const key = `${cx},${cz}`;
    return { key, cx, cz, name: districtNameFromChunk(cx, cz) };
  }

  function describeNextAction(snapshot) {
    if (!snapshot) return 'Runtime still loading. Wait for the game HUD, then move to discover districts.';
    const p = snapshot.player || {};
    if (snapshot.crates > 0) return 'Search nearby sidewalks for yellow crates to earn quick cash and XP.';
    if (!p.activeVehicle && snapshot.vehicles > 0) return 'Find a nearby vehicle and press Interact to start driving through new districts.';
    if (p.activeVehicle) return 'Drive across chunk borders to discover more neighborhoods and test streaming.';
    if (snapshot.lots > Object.keys(p.ownedLots || {}).length) return 'Look for purple lots nearby and buy one when you have enough cash.';
    return 'Head away from Neon Core until the district name changes and streaming counters update.';
  }

  function makePanel() {
    const panel = document.createElement('section');
    panel.id = 'neonblock-district-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="nbd-head">
        <strong>District Scout</strong>
        <button type="button" data-nbd="toggle">Hide</button>
      </div>
      <div class="nbd-grid">
        <div><span>Current</span><b data-nbd="current">-</b></div>
        <div><span>Discovered</span><b data-nbd="count">0</b></div>
        <div><span>Visits</span><b data-nbd="visits">0</b></div>
        <div><span>Chunk</span><b data-nbd="chunk">0,0</b></div>
      </div>
      <p data-nbd="hint">Move around the city to discover districts.</p>
      <div class="nbd-actions">
        <button type="button" data-nbd="save">Safe save</button>
        <button type="button" data-nbd="copy">Copy scout report</button>
      </div>`;
    document.body.appendChild(panel);

    const style = document.createElement('style');
    style.textContent = `
      #neonblock-district-panel{position:fixed;left:calc(12px + env(safe-area-inset-left));bottom:calc(14px + env(safe-area-inset-bottom));z-index:35;width:min(340px,calc(100vw - 24px));padding:12px;border:1px solid rgba(23,243,255,.35);border-radius:16px;background:rgba(5,8,20,.88);backdrop-filter:blur(12px);box-shadow:0 0 24px rgba(23,243,255,.18);color:#eefbff;font:13px/1.35 system-ui,Segoe UI,sans-serif;}
      #neonblock-district-panel.hidden{display:none;}
      #neonblock-district-panel .nbd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
      #neonblock-district-panel strong{font-size:15px;color:#5ef3ff;}
      #neonblock-district-panel button{border:1px solid rgba(94,243,140,.45);border-radius:999px;background:rgba(94,243,140,.12);color:#eefbff;padding:7px 10px;font-weight:700;}
      #neonblock-district-panel .nbd-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px;}
      #neonblock-district-panel .nbd-grid div{border:1px solid rgba(255,255,255,.11);border-radius:12px;padding:8px;background:rgba(255,255,255,.06);}
      #neonblock-district-panel span{display:block;color:#9fb8c8;font-size:11px;text-transform:uppercase;letter-spacing:.06em;}
      #neonblock-district-panel b{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #neonblock-district-panel p{margin:8px 0 10px;color:#cfe8f2;}
      #neonblock-district-panel .nbd-actions{display:flex;gap:8px;flex-wrap:wrap;}
      #btn-mobile-district{border-color:rgba(23,243,255,.55)!important;background:rgba(23,243,255,.15)!important;}
      @media (max-width:720px){#neonblock-district-panel{bottom:128px;font-size:12px}.nbd-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
    return panel;
  }

  const panel = makePanel();
  const fields = {
    current: panel.querySelector('[data-nbd="current"]'),
    count: panel.querySelector('[data-nbd="count"]'),
    visits: panel.querySelector('[data-nbd="visits"]'),
    chunk: panel.querySelector('[data-nbd="chunk"]'),
    hint: panel.querySelector('[data-nbd="hint"]')
  };

  function addMobileButton() {
    const rail = $('action-rail');
    if (!rail || $('btn-mobile-district')) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = 'btn-mobile-district';
    button.type = 'button';
    button.textContent = 'District';
    button.addEventListener('click', () => setVisible(!visible));
    rail.insertBefore(button, rail.firstChild);
  }

  function setVisible(next) {
    visible = Boolean(next);
    state.visible = visible;
    panel.classList.toggle('hidden', !visible);
    persist(true);
  }

  function report(snapshot, district) {
    const p = snapshot?.player || {};
    const ownedLots = Object.keys(p.ownedLots || {}).length;
    const text = [
      'NeonBlock District Scout Report',
      `District: ${district.name}`,
      `Chunk: ${district.key}`,
      `Discovered districts: ${Object.keys(state.discovered).length}`,
      `Visits here: ${state.visits[district.key] || 0}`,
      `Streamed chunks: ${snapshot?.chunks ?? 'unknown'}`,
      `Vehicles nearby: ${snapshot?.vehicles ?? 'unknown'}`,
      `Crates nearby: ${snapshot?.crates ?? 'unknown'}`,
      `Lots nearby: ${snapshot?.lots ?? 'unknown'}`,
      `Owned lots: ${ownedLots}`,
      `Vehicle mode: ${p.activeVehicle ? 'driving' : 'on foot'}`,
      `Recommended next action: ${describeNextAction(snapshot)}`
    ].join('\n');
    state.lastReport = text;
    try { localStorage.setItem(REPORT_KEY, text); } catch (_) {}
    return text;
  }

  function copyReport() {
    const snapshot = getSnapshot();
    const district = districtFromPosition(playerPosition(snapshot));
    const text = report(snapshot, district);
    navigator.clipboard?.writeText(text).then(() => flash('District report copied')).catch(() => flash('Report saved locally'));
  }

  function flash(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => popup.classList.add('hidden'), 1400);
  }

  function safeSave() {
    try {
      window.NeonBlockGame?.saveState?.();
      persist(true);
      flash('District scout saved');
    } catch (_) {
      flash('Save unavailable');
    }
  }

  panel.querySelector('[data-nbd="toggle"]').addEventListener('click', () => setVisible(false));
  panel.querySelector('[data-nbd="save"]').addEventListener('click', safeSave);
  panel.querySelector('[data-nbd="copy"]').addEventListener('click', copyReport);
  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.target?.matches?.('input,textarea,select')) return;
    if (event.code === 'Digit8') setVisible(!visible);
  });

  function tick() {
    const snapshot = getSnapshot();
    const pos = playerPosition(snapshot);
    const district = districtFromPosition(pos);
    if (district.key !== lastChunkKey) {
      lastChunkKey = district.key;
      state.discovered[district.key] = { name: district.name, firstSeen: state.discovered[district.key]?.firstSeen || Date.now() };
      state.visits[district.key] = (state.visits[district.key] || 0) + 1;
      state.lastDistrict = district.key;
      persist(true);
      if (state.visits[district.key] === 1) flash(`Discovered ${district.name}`);
    }

    fields.current.textContent = district.name;
    fields.count.textContent = Object.keys(state.discovered).length;
    fields.visits.textContent = state.visits[district.key] || 0;
    fields.chunk.textContent = district.key;
    fields.hint.textContent = describeNextAction(snapshot);
    panel.classList.toggle('hidden', !visible);
    report(snapshot, district);
    addMobileButton();
    requestAnimationFrame(tick);
  }

  setVisible(visible);
  addMobileButton();
  requestAnimationFrame(tick);
})();
