(() => {
  'use strict';

  const KEY = 'neonblock:civic-polish';
  const REPORT_KEY = 'neonblock:civic-report';
  const TOGGLE_KEY = 'Digit3';
  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const state = loadState();
  let panel;
  let lastPos = null;
  let lastMissionCount = 0;
  let lastReport = '';

  function loadState() {
    try {
      return Object.assign({ patrolMeters: 0, cleanMiles: 0, claims: 0, wantedCalms: 0, visible: false, lastAt: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (_) {
      return { patrolMeters: 0, cleanMiles: 0, claims: 0, wantedCalms: 0, visible: false, lastAt: 0 };
    }
  }

  function saveState() {
    state.lastAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (_) { return null; }
  }

  function playerOf(snap) {
    return snap?.player || null;
  }

  function posOf(player) {
    const p = player?.mesh?.position;
    if (!p) return null;
    return { x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0 };
  }

  function dist2d(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function missionCount(player) {
    return Object.values(player?.completed || {}).filter(Boolean).length;
  }

  function rewardReady() {
    return state.patrolMeters >= 220 || state.cleanMiles >= 500;
  }

  function callSave() {
    try { window.NeonBlockGame?.saveState?.(); } catch (_) {}
  }

  function toast(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 1700);
  }

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'neonblock-civic-polish';
    panel.setAttribute('aria-label', 'Civic Duty panel');
    panel.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:86px', 'z-index:35', 'width:min(330px,calc(100vw - 24px))',
      'padding:12px', 'border:1px solid rgba(94,243,140,.55)', 'border-radius:16px',
      'background:rgba(5,8,20,.88)', 'color:#ecfff5', 'font:12px/1.35 system-ui,sans-serif',
      'box-shadow:0 0 24px rgba(94,243,140,.18)', 'backdrop-filter:blur(10px)'
    ].join(';');
    document.body.appendChild(panel);
    return panel;
  }

  function addMobileButton() {
    const rail = $('action-rail');
    if (!rail || $('btn-mobile-civic')) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = 'btn-mobile-civic';
    btn.textContent = 'Civic';
    btn.addEventListener('pointerdown', (event) => { event.preventDefault(); togglePanel(); });
    rail.insertBefore(btn, rail.firstChild);
  }

  function togglePanel(force) {
    state.visible = typeof force === 'boolean' ? force : !state.visible;
    saveState();
    render();
  }

  function claimReward() {
    const snap = snapshot();
    const player = playerOf(snap);
    if (!player) return toast('Game still loading');
    if (!rewardReady()) return toast('Patrol more city blocks first');
    const cash = 90 + Math.min(180, Math.floor(state.patrolMeters / 3));
    const xp = 35 + Math.min(90, Math.floor(state.cleanMiles / 20));
    player.cash = (Number(player.cash) || 0) + cash;
    player.xp = (Number(player.xp) || 0) + xp;
    state.claims += 1;
    state.patrolMeters = Math.max(0, state.patrolMeters - 220);
    state.cleanMiles = Math.max(0, state.cleanMiles - 500);
    saveState();
    callSave();
    toast(`Civic reward: +$${cash} / +${xp}XP`);
    render();
  }

  function calmWanted() {
    const snap = snapshot();
    const player = playerOf(snap);
    if (!player) return toast('Game still loading');
    const wanted = Number(player.wanted) || 0;
    if (wanted <= 0) return toast('Wanted level already clear');
    const cost = 40 * wanted;
    if ((Number(player.cash) || 0) < cost) return toast(`Need $${cost} to clear wanted`);
    player.cash -= cost;
    player.wanted = 0;
    state.wantedCalms += 1;
    saveState();
    callSave();
    toast(`Wanted cleared: -$${cost}`);
    render();
  }

  function copyReport() {
    const snap = snapshot();
    const player = playerOf(snap);
    const p = posOf(player);
    const report = [
      'NeonBlock Civic Duty QA',
      `time=${new Date().toISOString()}`,
      `position=${p ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}` : 'unknown'}`,
      `wanted=${Number(player?.wanted || 0)}`,
      `cash=${Math.floor(Number(player?.cash || 0))}`,
      `missionsComplete=${missionCount(player)}`,
      `patrolMeters=${Math.floor(state.patrolMeters)}`,
      `cleanDriveMeters=${Math.floor(state.cleanMiles)}`,
      `claims=${state.claims}`,
      `wantedCalms=${state.wantedCalms}`,
      `chunks=${snap?.chunks ?? 'unknown'}`,
      `vehicles=${snap?.vehicles ?? 'unknown'}`,
      `rewardReady=${rewardReady()}`
    ].join('\n');
    lastReport = report;
    try { localStorage.setItem(REPORT_KEY, report); } catch (_) {}
    navigator.clipboard?.writeText(report).then(() => toast('Civic QA copied')).catch(() => toast('Civic QA saved locally'));
    render();
  }

  function tick() {
    const snap = snapshot();
    const player = playerOf(snap);
    const current = posOf(player);
    if (current && current.y > -5 && Math.abs(current.x) < 5000 && Math.abs(current.z) < 5000) {
      const moved = clamp(dist2d(lastPos, current), 0, 20);
      if (moved > 0.05) {
        if (player.activeVehicle) state.cleanMiles += moved;
        else state.patrolMeters += moved;
      }
      lastPos = current;
    }
    const completed = missionCount(player);
    if (completed > lastMissionCount) {
      state.patrolMeters += 60;
      state.cleanMiles += 90;
      lastMissionCount = completed;
      toast('Civic bonus added for mission progress');
    } else if (completed >= 0) {
      lastMissionCount = completed;
    }
    saveState();
    render();
  }

  function render() {
    makePanel();
    panel.style.display = state.visible ? 'block' : 'none';
    if (!state.visible) return;
    const snap = snapshot();
    const player = playerOf(snap);
    const wanted = Number(player?.wanted || 0);
    const patrol = Math.floor(state.patrolMeters);
    const drive = Math.floor(state.cleanMiles);
    const next = rewardReady() ? 'Claim reward now.' : `Patrol ${Math.max(0, 220 - patrol)}m on foot or drive ${Math.max(0, 500 - drive)}m clean.`;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <strong style="font-size:14px;color:#5ef38c">Civic Duty</strong>
        <button data-close style="border:0;border-radius:10px;padding:5px 8px;background:#17223f;color:#fff">Hide</button>
      </div>
      <p style="margin:8px 0;color:#bfffe0">Peacekeeper loop for safe city play: patrol, finish missions, clear wanted, and save before leaving.</p>
      <div>Wanted: <b>${wanted}</b> ${wanted ? '• service available' : '• clear'}</div>
      <div>On-foot patrol: <b>${patrol}m</b> / 220m</div>
      <div>Clean driving: <b>${drive}m</b> / 500m</div>
      <div>Missions complete: <b>${missionCount(player)}</b></div>
      <div>Next: <b>${next}</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        <button data-claim style="border:0;border-radius:12px;padding:8px;background:#5ef38c;color:#07100b;font-weight:700">Claim</button>
        <button data-calm style="border:0;border-radius:12px;padding:8px;background:#17f3ff;color:#061014;font-weight:700">Clear Wanted</button>
        <button data-save style="border:0;border-radius:12px;padding:8px;background:#29385f;color:#fff">Quick Save</button>
        <button data-copy style="border:0;border-radius:12px;padding:8px;background:#29385f;color:#fff">Copy QA</button>
      </div>
      <small style="display:block;margin-top:8px;color:#91a7cf">Shortcut: 3 • Mobile: Civic • Reports persist locally only.</small>
    `;
    panel.querySelector('[data-close]')?.addEventListener('click', () => togglePanel(false));
    panel.querySelector('[data-claim]')?.addEventListener('click', claimReward);
    panel.querySelector('[data-calm]')?.addEventListener('click', calmWanted);
    panel.querySelector('[data-save]')?.addEventListener('click', () => { callSave(); toast('Civic quick save complete'); });
    panel.querySelector('[data-copy]')?.addEventListener('click', copyReport);
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== TOGGLE_KEY || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    togglePanel();
  });

  addEventListener('pagehide', () => {
    saveState();
    if (lastReport) { try { localStorage.setItem(REPORT_KEY, lastReport); } catch (_) {} }
    callSave();
  });

  function boot() {
    addMobileButton();
    makePanel();
    render();
    setInterval(tick, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
