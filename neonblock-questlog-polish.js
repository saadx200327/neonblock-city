(() => {
  'use strict';

  const STORE_KEY = 'neonblock:questlog-polish';
  const REPORT_KEY = 'neonblock:questlog-report';
  const MISSIONS = [
    { id: 'courier', title: 'Courier Sprint', type: 'distance', target: [55, -50], hint: 'Follow the waypoint arrow to the delivery zone.' },
    { id: 'collector', title: 'Crate Collector', type: 'crate', hint: 'Collect 3 unique yellow neon crates.' },
    { id: 'owner', title: 'First Property', type: 'property', hint: 'Buy any purple lot when you have enough cash.' },
    { id: 'driver', title: 'Vehicle Delivery', type: 'distanceVehicle', target: [-70, 65], hint: 'Enter any car and drive to the delivery marker.' }
  ];

  const state = loadState();
  let panel;
  let body;
  let lastReport = '';
  let lastPersist = 0;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function persist(force = false) {
    const now = Date.now();
    if (!force && now - lastPersist < 5000) return;
    lastPersist = now;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      hidden: !!state.hidden,
      opened: state.opened || 0,
      lastMission: state.lastMission || 'unknown',
      lastAction: state.lastAction || 'none',
      updatedAt: now
    }));
  }

  function getSnapshot() {
    try {
      return window.NeonBlockGame?.getSnapshot?.() || null;
    } catch (_) {
      return null;
    }
  }

  function getPlayer(snapshot) {
    return snapshot?.player || null;
  }

  function getMission(player) {
    const completed = player?.completed || {};
    return MISSIONS.find((mission) => !completed[mission.id]) || MISSIONS[0];
  }

  function distanceTo(player, target) {
    if (!player?.mesh?.position || !target) return null;
    const dx = target[0] - player.mesh.position.x;
    const dz = target[1] - player.mesh.position.z;
    return Math.round(Math.hypot(dx, dz));
  }

  function missionProgress(player, mission) {
    const completed = player?.completed || {};
    if (completed[mission.id]) return 'Complete';
    if (mission.type === 'crate') {
      let collected = 0;
      try {
        const raw = localStorage.getItem(`neonblock:${player?.slot || 'slot1'}`);
        collected = raw ? (JSON.parse(raw).collectedCrateIds || []).length : 0;
      } catch (_) {}
      return `${Math.min(3, collected)}/3 crates`;
    }
    if (mission.type === 'property') {
      return `${Object.keys(player?.ownedLots || {}).length} owned lots`;
    }
    const distance = distanceTo(player, mission.target);
    return distance == null ? 'Distance unavailable' : `${distance}m away${mission.type === 'distanceVehicle' && !player?.activeVehicle ? ' • enter a vehicle' : ''}`;
  }

  function nextAction(player, mission) {
    if (!player) return 'Wait for the game runtime to finish loading.';
    if (mission.type === 'crate') return 'Drive or run through streamed blocks and press Interact near yellow crates.';
    if (mission.type === 'property') {
      const cash = Math.floor(player.cash || 0);
      return cash >= 500 ? 'Find a purple lot and press Interact to buy it.' : `Earn more cash first. Current cash: $${cash}.`;
    }
    if (mission.type === 'distanceVehicle' && !player.activeVehicle) return 'Press Interact near a car, then follow the waypoint.';
    return mission.hint;
  }

  function createButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'neonblock-questlog-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <style>
        #neonblock-questlog-panel{position:fixed;left:16px;bottom:126px;z-index:44;width:min(320px,calc(100vw - 32px));padding:12px;border:1px solid rgba(94,243,140,.45);border-radius:16px;background:rgba(5,8,20,.88);box-shadow:0 0 24px rgba(94,243,140,.18);color:#eafff1;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;backdrop-filter:blur(12px)}
        #neonblock-questlog-panel.hidden{display:none}
        #neonblock-questlog-panel h3{margin:0 0 8px;font-size:15px;color:#5ef38c;letter-spacing:.04em;text-transform:uppercase}
        #neonblock-questlog-panel p{margin:6px 0;color:#d7ffe2}
        #neonblock-questlog-panel .quest-row{display:flex;justify-content:space-between;gap:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:6px;margin-top:6px}
        #neonblock-questlog-panel .quest-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        #neonblock-questlog-panel button,.neonblock-questlog-mobile{border:1px solid rgba(94,243,140,.45);border-radius:999px;background:rgba(94,243,140,.12);color:#eafff1;padding:7px 10px;font-weight:700}
        .neonblock-questlog-mobile{position:fixed;right:14px;bottom:434px;z-index:45;display:none}
        @media (max-width: 760px){#neonblock-questlog-panel{left:10px;bottom:106px;width:min(300px,calc(100vw - 20px));font-size:12px}.neonblock-questlog-mobile{display:block}}
      </style>
      <h3>Quest Log <span style="float:right">7</span></h3>
      <div id="neonblock-questlog-body">Loading quest status...</div>
      <div class="quest-actions"></div>
    `;
    body = panel.querySelector('#neonblock-questlog-body');
    const actions = panel.querySelector('.quest-actions');
    actions.append(
      createButton('Quick save', () => {
        window.NeonBlockGame?.saveState?.();
        state.lastAction = 'quick-save';
        persist(true);
        flash('Quest log saved.');
      }),
      createButton('Copy report', copyReport),
      createButton('Hide', () => togglePanel(false))
    );
    document.body.appendChild(panel);

    const mobile = document.createElement('button');
    mobile.className = 'neonblock-questlog-mobile';
    mobile.type = 'button';
    mobile.textContent = 'Quest';
    mobile.addEventListener('click', () => togglePanel());
    document.body.appendChild(mobile);

    if (state.hidden) panel.classList.add('hidden');
  }

  function togglePanel(force) {
    ensurePanel();
    const hidden = typeof force === 'boolean' ? !force : !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', hidden);
    state.hidden = hidden;
    state.opened = (state.opened || 0) + 1;
    state.lastAction = hidden ? 'hide' : 'open';
    persist(true);
    update();
  }

  function flash(text) {
    const popup = document.getElementById('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => popup.classList.add('hidden'), 1400);
  }

  function buildReport(snapshot, mission, player) {
    const completed = player?.completed || {};
    const report = {
      feature: 'Quest Log polish',
      activeMission: mission.title,
      progress: missionProgress(player, mission),
      nextAction: nextAction(player, mission),
      completedMissions: Object.keys(completed).filter((key) => completed[key]),
      cash: Math.floor(player?.cash || 0),
      level: player?.level || 1,
      chunks: snapshot?.chunks || 0,
      vehicles: snapshot?.vehicles || 0,
      crates: snapshot?.crates || 0,
      lots: snapshot?.lots || 0,
      savedAt: new Date().toISOString()
    };
    return JSON.stringify(report, null, 2);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(lastReport || 'Quest report unavailable');
      localStorage.setItem(REPORT_KEY, lastReport || '');
      state.lastAction = 'copy-report';
      persist(true);
      flash('Quest report copied.');
    } catch (_) {
      localStorage.setItem(REPORT_KEY, lastReport || '');
      flash('Quest report saved locally.');
    }
  }

  function update() {
    ensurePanel();
    const snapshot = getSnapshot();
    const player = getPlayer(snapshot);
    const mission = getMission(player);
    state.lastMission = mission.id;
    lastReport = buildReport(snapshot, mission, player);
    if (!panel.classList.contains('hidden')) {
      body.innerHTML = `
        <p><strong>${mission.title}</strong></p>
        <p>${mission.hint}</p>
        <div class="quest-row"><span>Progress</span><strong>${missionProgress(player, mission)}</strong></div>
        <div class="quest-row"><span>Next move</span><strong>${nextAction(player, mission)}</strong></div>
        <div class="quest-row"><span>World</span><strong>${snapshot?.chunks || 0} chunks • ${snapshot?.vehicles || 0} cars</strong></div>
        <div class="quest-row"><span>Player</span><strong>$${Math.floor(player?.cash || 0)} • Lv ${player?.level || 1}</strong></div>
      `;
    }
    persist(false);
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Digit7' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      togglePanel();
    }
  });

  window.addEventListener('pagehide', () => {
    try { localStorage.setItem(REPORT_KEY, lastReport || ''); } catch (_) {}
  });

  ensurePanel();
  update();
  setInterval(update, 1000);
})();
