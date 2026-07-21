(() => {
  'use strict';

  const KEY = 'neonblock:progressionPolish';
  const DEFAULTS = {
    hidden: false,
    lastPos: null,
    meters: 0,
    drivenMeters: 0,
    lastLevel: 1,
    claimed: {}
  };
  const state = readState();
  let panel;
  let lastSampleAt = performance.now();

  const ACHIEVEMENTS = [
    { id: 'firstSteps', title: 'First Steps', desc: 'Travel 120m on foot or wheels.', cash: 60, xp: 20, test: (s) => s.meters >= 120 },
    { id: 'cityRunner', title: 'City Runner', desc: 'Travel 600m across streamed city chunks.', cash: 140, xp: 45, test: (s) => s.meters >= 600 },
    { id: 'starterCash', title: 'Starter Stack', desc: 'Hold $750 cash at once.', cash: 90, xp: 30, test: (_s, snap) => (snap?.player?.cash || 0) >= 750 },
    { id: 'propertyStarter', title: 'Property Starter', desc: 'Own your first lot.', cash: 120, xp: 45, test: (_s, snap) => Object.keys(snap?.player?.ownedLots || {}).length >= 1 },
    { id: 'blockLandlord', title: 'Block Landlord', desc: 'Own 3 city lots.', cash: 260, xp: 90, test: (_s, snap) => Object.keys(snap?.player?.ownedLots || {}).length >= 3 },
    { id: 'licensedDriver', title: 'Licensed Driver', desc: 'Drive 220m in any vehicle.', cash: 130, xp: 50, test: (s) => s.drivenMeters >= 220 },
    { id: 'missionPro', title: 'Mission Pro', desc: 'Complete 2 missions.', cash: 180, xp: 70, test: (_s, snap) => Object.keys(snap?.player?.completed || {}).length >= 2 },
    { id: 'levelUp', title: 'Level Up', desc: 'Reach level 2.', cash: 100, xp: 35, test: (_s, snap) => (snap?.player?.level || 1) >= 2 }
  ];

  function readState() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  function game() {
    return window.NeonBlockGame || null;
  }

  function snapshot() {
    try { return game()?.getSnapshot?.() || null; } catch (_) { return null; }
  }

  function toast(text) {
    const popup = document.getElementById('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 1800);
  }

  function formatMeters(value) {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
    return `${Math.floor(value)}m`;
  }

  function createPanel() {
    panel = document.createElement('section');
    panel.id = 'progression-polish-panel';
    panel.style.cssText = [
      'position:fixed',
      'right:max(12px,env(safe-area-inset-right))',
      'bottom:max(132px,calc(env(safe-area-inset-bottom) + 132px))',
      'z-index:19',
      'width:min(300px,calc(100vw - 24px))',
      'padding:10px 12px',
      'border:1px solid rgba(94,243,140,.36)',
      'border-radius:14px',
      'background:rgba(5,8,20,.76)',
      'backdrop-filter:blur(10px)',
      'color:#eafff1',
      'font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif',
      'box-shadow:0 12px 28px rgba(0,0,0,.32)'
    ].join(';');
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <strong style="font-size:13px;color:#5ef38c">Progression</strong>
        <button data-prog="hide" style="min-height:28px">${state.hidden ? 'Show' : 'Hide'}</button>
      </div>
      <div data-prog="body">
        <div data-prog="summary">Checking progress...</div>
        <div data-prog="next" style="margin:6px 0;color:#d7ffe1">Next achievement loading...</div>
        <div data-prog="list" style="display:grid;gap:5px;max-height:150px;overflow:auto;padding-right:2px"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <button data-prog="claim" style="min-height:30px">Claim Ready</button>
          <button data-prog="copy" style="min-height:30px">Copy Progress</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-prog="hide"]').addEventListener('click', () => {
      state.hidden = !state.hidden;
      saveState();
      render();
    });
    panel.querySelector('[data-prog="claim"]').addEventListener('click', claimReady);
    panel.querySelector('[data-prog="copy"]').addEventListener('click', copyReport);
    render();
  }

  function nextAchievement(snap) {
    return ACHIEVEMENTS.find((achievement) => !state.claimed[achievement.id] && !achievement.test(state, snap)) || null;
  }

  function readyAchievements(snap) {
    return ACHIEVEMENTS.filter((achievement) => !state.claimed[achievement.id] && achievement.test(state, snap));
  }

  function claimReady() {
    const snap = snapshot();
    const ready = readyAchievements(snap);
    if (!ready.length) return toast('No achievements ready yet');
    const player = snap?.player;
    if (!player) return toast('Progression waiting for game runtime');
    const cash = ready.reduce((sum, item) => sum + item.cash, 0);
    const xp = ready.reduce((sum, item) => sum + item.xp, 0);
    ready.forEach((item) => { state.claimed[item.id] = Date.now(); });
    player.cash = (player.cash || 0) + cash;
    player.xp = (player.xp || 0) + xp;
    saveState();
    try { game()?.saveState?.(player.slot || 'slot1'); } catch (_) {}
    toast(`Achievements claimed: +$${cash} +${xp}XP`);
    render();
  }

  function copyReport() {
    const snap = snapshot();
    const lines = [
      'NeonBlock City Progress Report',
      `Distance: ${formatMeters(state.meters)}`,
      `Driving: ${formatMeters(state.drivenMeters)}`,
      `Cash: $${Math.floor(snap?.player?.cash || 0)}`,
      `Level: ${snap?.player?.level || 1}`,
      `Owned lots: ${Object.keys(snap?.player?.ownedLots || {}).length}`,
      `Completed missions: ${Object.keys(snap?.player?.completed || {}).length}`,
      `Claimed achievements: ${Object.keys(state.claimed).length}/${ACHIEVEMENTS.length}`
    ];
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Progress report copied')).catch(() => toast('Copy unavailable'));
  }

  function render() {
    if (!panel) return;
    const snap = snapshot();
    const body = panel.querySelector('[data-prog="body"]');
    const hide = panel.querySelector('[data-prog="hide"]');
    if (body) body.style.display = state.hidden ? 'none' : 'block';
    if (hide) hide.textContent = state.hidden ? 'Show' : 'Hide';
    const owned = Object.keys(snap?.player?.ownedLots || {}).length;
    const completed = Object.keys(snap?.player?.completed || {}).length;
    const ready = readyAchievements(snap);
    const next = nextAchievement(snap);
    const summary = panel.querySelector('[data-prog="summary"]');
    const nextEl = panel.querySelector('[data-prog="next"]');
    const list = panel.querySelector('[data-prog="list"]');
    const claim = panel.querySelector('[data-prog="claim"]');
    if (summary) summary.textContent = `Travel ${formatMeters(state.meters)} • Drive ${formatMeters(state.drivenMeters)} • Lots ${owned} • Missions ${completed}`;
    if (nextEl) nextEl.textContent = ready.length ? `${ready.length} reward${ready.length === 1 ? '' : 's'} ready to claim.` : next ? `Next: ${next.title} — ${next.desc}` : 'All progression rewards claimed.';
    if (claim) claim.textContent = ready.length ? `Claim ${ready.length} Ready` : 'Claim Ready';
    if (list) {
      list.innerHTML = ACHIEVEMENTS.map((achievement) => {
        const claimed = Boolean(state.claimed[achievement.id]);
        const readyNow = !claimed && achievement.test(state, snap);
        const status = claimed ? '✓ Claimed' : readyNow ? '★ Ready' : 'Locked';
        return `<div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px;background:${readyNow ? 'rgba(94,243,140,.12)' : 'rgba(255,255,255,.04)'}"><strong>${achievement.title}</strong><br><span>${achievement.desc}</span><br><small>${status} • +$${achievement.cash} +${achievement.xp}XP</small></div>`;
      }).join('');
    }
  }

  function sampleProgress(now) {
    const snap = snapshot();
    const pos = snap?.player?.mesh?.position;
    if (!pos) return;
    if (state.lastPos && Number.isFinite(state.lastPos.x) && Number.isFinite(state.lastPos.z)) {
      const dx = pos.x - state.lastPos.x;
      const dz = pos.z - state.lastPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01 && dist < 18) {
        state.meters += dist;
        if (snap.player.activeVehicle) state.drivenMeters += dist;
      }
    }
    state.lastPos = { x: pos.x, z: pos.z };
    state.lastLevel = snap?.player?.level || state.lastLevel || 1;
    if (now - lastSampleAt > 4000) {
      lastSampleAt = now;
      saveState();
      render();
    }
  }

  function loop(now) {
    sampleProgress(now);
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyY' || event.repeat) return;
    state.hidden = !state.hidden;
    saveState();
    render();
    toast(`Progression ${state.hidden ? 'hidden' : 'shown'}`);
  });

  window.addEventListener('load', () => {
    createPanel();
    requestAnimationFrame(loop);
  });
})();
