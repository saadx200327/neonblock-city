(() => {
  'use strict';

  const KEY = 'neonblock:profile:v1';
  const REPORT_KEY = 'neonblock:profile:lastReport';
  const PANEL_ID = 'neonblock-profile-panel';
  const MOBILE_ID = 'btn-mobile-profile';
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const now = () => Date.now();

  const defaultState = () => ({
    visible: false,
    startedAt: now(),
    lastSeenAt: now(),
    lastPos: null,
    travel: 0,
    driveTravel: 0,
    bestLevel: 1,
    bestCash: 0,
    bestLots: 0,
    rewardsClaimed: {},
    lastMessage: 'Profile ready: track progress, claim milestone rewards, and copy a playable-session QA report.'
  });

  function loadState() {
    try { return { ...defaultState(), ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; }
    catch { return defaultState(); }
  }

  let state = loadState();

  function saveState() {
    state.lastSeenAt = now();
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function snapshot() {
    return window.NeonBlockGame?.getSnapshot?.() || null;
  }

  function player() {
    return snapshot()?.player || null;
  }

  function posArray(p = player()) {
    const pos = p?.mesh?.position;
    return pos ? [Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.z) || 0] : null;
  }

  function ownedLots(p = player()) {
    return Object.keys(p?.ownedLots || {}).length;
  }

  function completedMissions(p = player()) {
    return Object.values(p?.completed || {}).filter(Boolean).length;
  }

  function activeVehicle(p = player()) {
    return p?.activeVehicle || null;
  }

  const milestones = [
    { id: 'first-save', title: 'Safe Start', test: (p) => Number(p?.cash || 0) >= 0, cash: 25, xp: 10, hint: 'Game API loaded and wallet is valid.' },
    { id: 'walker', title: 'City Walker', test: () => state.travel >= 250, cash: 60, xp: 25, hint: 'Walk 250 meters through the streamed city.' },
    { id: 'driver', title: 'Road Rookie', test: () => state.driveTravel >= 350, cash: 90, xp: 35, hint: 'Drive 350 meters in any vehicle.' },
    { id: 'owner', title: 'Block Owner', test: (p) => ownedLots(p) >= 1, cash: 120, xp: 45, hint: 'Buy one purple lot.' },
    { id: 'mission-two', title: 'Mission Runner', test: (p) => completedMissions(p) >= 2, cash: 150, xp: 55, hint: 'Finish two mission objectives.' },
    { id: 'cash-king', title: 'Cash Builder', test: (p) => Number(p?.cash || 0) >= 1000, cash: 180, xp: 70, hint: 'Reach $1,000 wallet cash.' }
  ];

  function addStyles() {
    if (document.getElementById('neonblock-profile-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-profile-style';
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:16px;bottom:84px;width:min(372px,calc(100vw - 24px));z-index:50;background:rgba(5,8,20,.94);border:1px solid rgba(23,243,255,.45);border-radius:16px;color:#eafcff;padding:14px;font:13px/1.35 system-ui,Segoe UI,sans-serif;box-shadow:0 0 24px rgba(23,243,255,.13);backdrop-filter:blur(10px)}
      #${PANEL_ID}.hidden{display:none!important} #${PANEL_ID} h3{margin:0 0 8px;color:#17f3ff;font-size:16px} #${PANEL_ID} p{margin:6px 0;color:#c9f9ff} #${PANEL_ID} .profile-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0} #${PANEL_ID} .profile-card{background:rgba(255,255,255,.06);border:1px solid rgba(23,243,255,.18);border-radius:12px;padding:8px;text-align:center} #${PANEL_ID} .profile-card b{display:block;color:#fff;font-size:11px} #${PANEL_ID} .profile-card span{font-size:15px;color:#17f3ff;font-weight:900} #${PANEL_ID} .profile-list{display:grid;gap:6px;max-height:190px;overflow:auto;margin-top:8px} #${PANEL_ID} .profile-milestone{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:8px} #${PANEL_ID} .profile-milestone small{display:block;color:#a9d8de} #${PANEL_ID} button{border:1px solid rgba(23,243,255,.52);background:rgba(23,243,255,.13);color:#eafcff;border-radius:10px;padding:8px 10px;font-weight:800} #${PANEL_ID} button:disabled{opacity:.45} #${PANEL_ID} .profile-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} #${MOBILE_ID}{border-color:rgba(23,243,255,.75)!important}
      @media (max-width:760px){#${PANEL_ID}{left:10px;right:10px;bottom:118px;width:auto;font-size:12px}.profile-grid{grid-template-columns:repeat(2,1fr)!important}}
    `;
    document.head.appendChild(style);
  }

  function makePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = state.visible ? '' : 'hidden';
    panel.innerHTML = `
      <h3>Player Profile</h3>
      <p id="profile-summary">Loading player profile...</p>
      <div class="profile-grid">
        <div class="profile-card"><b>Level</b><span id="profile-level">1</span></div>
        <div class="profile-card"><b>Cash</b><span id="profile-cash">$0</span></div>
        <div class="profile-card"><b>Lots</b><span id="profile-lots">0</span></div>
        <div class="profile-card"><b>Travel</b><span id="profile-travel">0m</span></div>
      </div>
      <p id="profile-hint"></p>
      <div id="profile-milestones" class="profile-list"></div>
      <div class="profile-row">
        <button type="button" id="profile-claim">Claim Ready</button>
        <button type="button" id="profile-save">Save</button>
        <button type="button" id="profile-copy">Copy QA</button>
      </div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', (event) => {
      const id = event.target.closest('button')?.id;
      if (id === 'profile-claim') claimReady();
      if (id === 'profile-save') quickSave();
      if (id === 'profile-copy') copyReport();
    });
    return panel;
  }

  function addMobileButton() {
    if (document.getElementById(MOBILE_ID)) return;
    const rail = document.getElementById('action-rail') || document.getElementById('mobile-controls');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = MOBILE_ID;
    button.type = 'button';
    button.textContent = 'Profile';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    state.visible = !state.visible;
    makePanel().classList.toggle('hidden', !state.visible);
    saveState();
    render();
  }

  function trackMovement() {
    const p = player();
    const pos = posArray(p);
    if (!p || !pos) return;
    state.bestLevel = Math.max(Number(state.bestLevel || 1), Number(p.level || 1));
    state.bestCash = Math.max(Number(state.bestCash || 0), Number(p.cash || 0));
    state.bestLots = Math.max(Number(state.bestLots || 0), ownedLots(p));
    if (state.lastPos) {
      const dx = pos[0] - state.lastPos[0];
      const dz = pos[2] - state.lastPos[2];
      const dist = Math.hypot(dx, dz);
      if (Number.isFinite(dist) && dist > 0.02 && dist < 45) {
        state.travel += dist;
        if (activeVehicle(p)) state.driveTravel += dist;
      }
    }
    state.lastPos = pos;
  }

  function readyMilestones(p = player()) {
    return milestones.filter((m) => !state.rewardsClaimed[m.id] && m.test(p));
  }

  function claimReady() {
    const p = player();
    if (!p) return;
    const ready = readyMilestones(p);
    if (!ready.length) {
      state.lastMessage = 'No profile rewards ready yet. Keep moving, driving, buying lots, and finishing missions.';
      saveState();
      return render();
    }
    const cash = ready.reduce((sum, item) => sum + item.cash, 0);
    const xp = ready.reduce((sum, item) => sum + item.xp, 0);
    ready.forEach((item) => { state.rewardsClaimed[item.id] = now(); });
    p.cash = Number(p.cash || 0) + cash;
    p.xp = Number(p.xp || 0) + xp;
    state.lastMessage = `Claimed ${ready.length} profile reward${ready.length === 1 ? '' : 's'}: +$${fmt(cash)} and +${fmt(xp)} XP.`;
    quickSave(false);
    saveState();
    render();
  }

  function quickSave(show = true) {
    try {
      window.NeonBlockGame?.saveState?.();
      if (show) state.lastMessage = 'Profile and game state saved.';
    } catch (error) {
      state.lastMessage = `Save failed: ${error.message}`;
    }
    saveState();
    render();
  }

  function report() {
    const snap = snapshot();
    const p = snap?.player;
    return {
      feature: 'Player Profile polish',
      level: Math.floor(p?.level || 1),
      xp: Math.floor(p?.xp || 0),
      cash: Math.floor(p?.cash || 0),
      wanted: Math.floor(p?.wanted || 0),
      ownedLots: ownedLots(p),
      completedMissions: completedMissions(p),
      activeVehicle: p?.activeVehicle?.userData?.name || 'On foot',
      chunks: snap?.chunks ?? 0,
      vehicles: snap?.vehicles ?? 0,
      crates: snap?.crates ?? 0,
      lots: snap?.lots ?? 0,
      travelMeters: Math.round(state.travel || 0),
      driveMeters: Math.round(state.driveTravel || 0),
      bestLevel: state.bestLevel,
      bestCash: Math.floor(state.bestCash || 0),
      bestLots: state.bestLots,
      rewardsClaimed: Object.keys(state.rewardsClaimed || {}).length,
      readyRewards: readyMilestones(p).map((m) => m.id),
      lastMessage: state.lastMessage,
      savedAt: new Date().toISOString()
    };
  }

  async function copyReport() {
    const text = JSON.stringify(report(), null, 2);
    localStorage.setItem(REPORT_KEY, text);
    try { await navigator.clipboard?.writeText(text); state.lastMessage = 'Player profile QA report copied.'; }
    catch { state.lastMessage = 'Player profile QA report saved locally.'; }
    saveState();
    render();
  }

  function render() {
    const panel = makePanel();
    const p = player();
    const ready = readyMilestones(p);
    panel.querySelector('#profile-level').textContent = fmt(p?.level || 1);
    panel.querySelector('#profile-cash').textContent = `$${fmt(p?.cash || 0)}`;
    panel.querySelector('#profile-lots').textContent = fmt(ownedLots(p));
    panel.querySelector('#profile-travel').textContent = `${fmt(state.travel || 0)}m`;
    panel.querySelector('#profile-summary').textContent = `Level ${fmt(p?.level || 1)} • ${completedMissions(p)} missions done • ${fmt(state.driveTravel || 0)}m driven • ${ready.length} reward${ready.length === 1 ? '' : 's'} ready.`;
    panel.querySelector('#profile-hint').textContent = state.lastMessage;
    panel.querySelector('#profile-claim').disabled = ready.length === 0;
    panel.querySelector('#profile-milestones').innerHTML = milestones.map((m) => {
      const claimed = !!state.rewardsClaimed[m.id];
      const isReady = !claimed && m.test(p);
      return `<div class="profile-milestone"><span><b>${m.title}${claimed ? ' ✓' : isReady ? ' • ready' : ''}</b><small>${m.hint} Reward: $${fmt(m.cash)} / ${fmt(m.xp)} XP.</small></span><span>${claimed ? 'Done' : isReady ? 'Claim' : 'Open'}</span></div>`;
    }).join('');
    panel.classList.toggle('hidden', !state.visible);
  }

  function loop() {
    trackMovement();
    render();
    requestAnimationFrame(loop);
  }

  function boot() {
    addStyles();
    makePanel();
    addMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyF' && event.shiftKey && !event.repeat && !/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) togglePanel();
    });
    addEventListener('pagehide', () => { quickSave(false); localStorage.setItem(REPORT_KEY, JSON.stringify(report(), null, 2)); });
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();