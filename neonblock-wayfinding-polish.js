(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:wayfinding-hidden';
  const GOALS = {
    'Courier Sprint': { x: 55, z: -50, hint: 'Head toward the delivery zone and keep sprinting on straight roads.' },
    'First Property': { x: -48, z: 42, hint: 'Find a purple lot, stop nearby, then press Interact to buy it.' },
    'Vehicle Delivery': { x: -70, z: 65, hint: 'Enter a nearby car, keep gas above 0, and drive to the marker.' }
  };

  function $(id) { return document.getElementById(id); }
  function safeSnapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (_) { return null; }
  }
  function getPlayerPos(snapshot) {
    const pos = snapshot?.player?.mesh?.position;
    if (!pos) return null;
    return { x: Number(pos.x) || 0, y: Number(pos.y) || 0, z: Number(pos.z) || 0 };
  }
  function distance2d(a, b) {
    return Math.hypot((b.x || 0) - (a.x || 0), (b.z || 0) - (a.z || 0));
  }
  function compassFromVector(dx, dz) {
    const angle = Math.atan2(dx, dz) * 180 / Math.PI;
    const normalized = (angle + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(normalized / 45) % 8];
  }
  function currentMissionName() {
    return ($('hud-mission')?.textContent || 'None').trim();
  }
  function nearestOpportunity(snapshot) {
    const pos = getPlayerPos(snapshot);
    if (!pos) return 'World still loading...';
    const counts = {
      vehicles: Number(snapshot?.vehicles || 0),
      crates: Number(snapshot?.crates || 0),
      lots: Number(snapshot?.lots || 0)
    };
    if (snapshot?.player?.activeVehicle) return 'You are driving. Watch gas and use R / Refuel before long routes.';
    if (counts.vehicles > 0) return `${counts.vehicles} vehicle${counts.vehicles === 1 ? '' : 's'} streamed nearby. Look for yellow/red cars and press Interact.`;
    if (counts.crates > 0) return `${counts.crates} crate${counts.crates === 1 ? '' : 's'} nearby. Crates give fast cash + XP.`;
    if (counts.lots > 0) return `${counts.lots} property lot${counts.lots === 1 ? '' : 's'} nearby. Purple lots can be bought for passive income.`;
    return 'Keep moving through roads to stream new vehicles, crates, NPCs, and lots.';
  }

  function makePanel() {
    const panel = document.createElement('section');
    panel.id = 'wayfinding-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="wf-head">
        <strong>Route Assist</strong>
        <button type="button" id="btn-wayfinding-toggle" aria-label="Hide route assist">Hide</button>
      </div>
      <div class="wf-grid">
        <span>Mission</span><b id="wf-mission">None</b>
        <span>Distance</span><b id="wf-distance">--</b>
        <span>Direction</span><b id="wf-direction">--</b>
      </div>
      <p id="wf-hint">Move to stream the city.</p>
      <p id="wf-nearby">Looking for nearby opportunities...</p>
    `;
    document.body.appendChild(panel);

    const style = document.createElement('style');
    style.textContent = `
      #wayfinding-panel {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: calc(152px + env(safe-area-inset-bottom));
        width: min(300px, calc(100vw - 24px));
        z-index: 18;
        padding: 12px;
        border: 1px solid rgba(23,243,255,.35);
        border-radius: 16px;
        background: rgba(5,8,20,.78);
        color: #eafcff;
        box-shadow: 0 12px 36px rgba(0,0,0,.35);
        backdrop-filter: blur(12px);
        font: 13px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
      }
      #wayfinding-panel.hidden { display: none; }
      #wayfinding-panel .wf-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
      #wayfinding-panel button { border:0; border-radius:999px; padding:6px 9px; color:#041018; background:#17f3ff; font-weight:800; }
      #wayfinding-panel .wf-grid { display:grid; grid-template-columns:auto 1fr; gap:4px 10px; }
      #wayfinding-panel .wf-grid span { color:#9fb8c7; }
      #wayfinding-panel .wf-grid b { text-align:right; }
      #wayfinding-panel p { margin:8px 0 0; color:#cfefff; }
      #wayfinding-panel #wf-nearby { color:#9df7c2; }
      @media (max-width: 760px) {
        #wayfinding-panel { bottom: calc(118px + env(safe-area-inset-bottom)); font-size:12px; }
      }
      @media (orientation: landscape) and (max-height: 520px) {
        #wayfinding-panel { left:auto; right:max(12px, env(safe-area-inset-right)); bottom:12px; width:min(260px, 42vw); }
      }
    `;
    document.head.appendChild(style);
    return panel;
  }

  const panel = makePanel();
  const hidden = localStorage.getItem(STORAGE_KEY) === '1';
  panel.classList.toggle('hidden', hidden);

  function setHidden(value) {
    panel.classList.toggle('hidden', value);
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    const btn = $('btn-wayfinding-toggle');
    if (btn) btn.textContent = value ? 'Show' : 'Hide';
  }

  $('btn-wayfinding-toggle')?.addEventListener('click', () => setHidden(!panel.classList.contains('hidden')));
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyG' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setHidden(!panel.classList.contains('hidden'));
    }
  });

  function update() {
    const snapshot = safeSnapshot();
    const pos = getPlayerPos(snapshot);
    const name = currentMissionName();
    const goal = GOALS[name];
    const missionEl = $('wf-mission');
    const distanceEl = $('wf-distance');
    const directionEl = $('wf-direction');
    const hintEl = $('wf-hint');
    const nearbyEl = $('wf-nearby');

    if (missionEl) missionEl.textContent = name || 'None';
    if (nearbyEl) nearbyEl.textContent = nearestOpportunity(snapshot);

    if (!pos || !goal) {
      if (distanceEl) distanceEl.textContent = name === 'Crate Collector' ? '3 crates' : '--';
      if (directionEl) directionEl.textContent = name === 'Crate Collector' ? 'Search' : '--';
      if (hintEl) hintEl.textContent = name === 'Crate Collector'
        ? 'Move across intersections to stream crates, then press Interact near yellow cubes.'
        : 'Pick a mission from the Mission Board or talk to a pink NPC.';
      return;
    }

    const dist = distance2d(pos, goal);
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    if (distanceEl) distanceEl.textContent = `${Math.round(dist)}m`;
    if (directionEl) directionEl.textContent = compassFromVector(dx, dz);
    if (hintEl) hintEl.textContent = dist < 12 ? 'You are close. Slow down and press Interact if the objective needs it.' : goal.hint;
  }

  update();
  setInterval(update, 500);
})();
