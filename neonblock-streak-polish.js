(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:streakBoard:v1';
  const REPORT_KEY = 'neonblock:streakBoard:lastReport';
  const PANEL_ID = 'neonblock-streak-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-streak';
  const DAY_MS = 24 * 60 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const toast = (message) => {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 2200);
  };

  const defaultState = () => ({
    day: todayKey(),
    streak: 0,
    lastClaimDay: '',
    bestStreak: 0,
    lastSeenDay: todayKey(),
    sessionStart: Date.now(),
    base: null,
    last: null,
    goals: {},
    reports: []
  });

  function loadState() {
    try {
      return { ...defaultState(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}) };
    } catch (_error) {
      return defaultState();
    }
  }

  let state = loadState();
  let lastSaveAt = 0;

  function getGame() {
    return window.NeonBlockGame || null;
  }

  function getSnapshot() {
    try {
      return getGame()?.getSnapshot?.() || null;
    } catch (_error) {
      return null;
    }
  }

  function playerFromSnapshot(snapshot) {
    return snapshot?.player || null;
  }

  function playerPos(player) {
    const pos = player?.mesh?.position;
    if (!pos) return { x: 0, y: 1, z: 0 };
    return { x: safeNumber(pos.x), y: safeNumber(pos.y, 1), z: safeNumber(pos.z) };
  }

  function activeVehicle(player) {
    return player?.activeVehicle || null;
  }

  function distance2D(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(safeNumber(a.x) - safeNumber(b.x), safeNumber(a.z) - safeNumber(b.z));
  }

  function ensureDay() {
    const nowDay = todayKey();
    if (state.day === nowDay) return;
    const previousTime = Date.parse(`${state.day || nowDay}T00:00:00Z`);
    const currentTime = Date.parse(`${nowDay}T00:00:00Z`);
    const gapDays = Math.max(1, Math.round((currentTime - previousTime) / DAY_MS));
    state.day = nowDay;
    state.base = null;
    state.last = null;
    state.goals = {};
    if (state.lastClaimDay && gapDays > 1) state.streak = 0;
    state.lastSeenDay = nowDay;
    saveLocal(true);
  }

  function currentMetrics() {
    const snapshot = getSnapshot();
    const player = playerFromSnapshot(snapshot);
    const position = playerPos(player);
    const vehicle = activeVehicle(player);
    const ownedLots = player?.ownedLots ? Object.keys(player.ownedLots).length : 0;
    const completed = player?.completed ? Object.values(player.completed).filter(Boolean).length : 0;
    return {
      time: Date.now(),
      position,
      cash: safeNumber(player?.cash),
      xp: safeNumber(player?.xp),
      level: safeNumber(player?.level, 1),
      wanted: safeNumber(player?.wanted),
      chunks: safeNumber(snapshot?.chunks),
      vehicles: safeNumber(snapshot?.vehicles),
      crates: safeNumber(snapshot?.crates),
      lots: safeNumber(snapshot?.lots),
      ownedLots,
      completed,
      inVehicle: Boolean(vehicle),
      gas: safeNumber(vehicle?.userData?.gas ?? 0),
      hp: safeNumber(vehicle?.userData?.hp ?? 0)
    };
  }

  function ensureBase(metrics) {
    if (!state.base) state.base = metrics;
    if (!state.last) state.last = metrics;
  }

  function updateGoalProgress() {
    ensureDay();
    const metrics = currentMetrics();
    ensureBase(metrics);
    const last = state.last || metrics;
    const moved = distance2D(metrics.position, last.position);
    const cleanMove = Number.isFinite(moved) && moved < 180 ? moved : 0;
    const deltaCash = Math.max(0, metrics.cash - safeNumber(state.base?.cash));
    const deltaXp = Math.max(0, metrics.xp - safeNumber(state.base?.xp));
    state.goals.travel = safeNumber(state.goals.travel) + cleanMove;
    if (metrics.inVehicle) state.goals.drive = safeNumber(state.goals.drive) + cleanMove;
    state.goals.streamMax = Math.max(safeNumber(state.goals.streamMax), metrics.chunks);
    state.goals.ownedLots = Math.max(safeNumber(state.goals.ownedLots), metrics.ownedLots);
    state.goals.completed = Math.max(safeNumber(state.goals.completed), metrics.completed);
    state.goals.cashEarned = Math.max(safeNumber(state.goals.cashEarned), deltaCash);
    state.goals.xpEarned = Math.max(safeNumber(state.goals.xpEarned), deltaXp);
    state.goals.cleanDriving = Math.max(safeNumber(state.goals.cleanDriving), metrics.inVehicle && metrics.wanted === 0 ? safeNumber(state.goals.drive) : 0);
    state.last = metrics;
    if (Date.now() - lastSaveAt > 5000) saveLocal();
  }

  function goalRows() {
    const goals = state.goals || {};
    return [
      { id: 'travel', label: 'Explore 350m', value: safeNumber(goals.travel), target: 350 },
      { id: 'drive', label: 'Drive 250m', value: safeNumber(goals.drive), target: 250 },
      { id: 'stream', label: 'Stream 6 chunks', value: safeNumber(goals.streamMax), target: 6 },
      { id: 'earn', label: 'Earn $150', value: safeNumber(goals.cashEarned), target: 150 },
      { id: 'clean', label: 'Clean drive 150m', value: safeNumber(goals.cleanDriving), target: 150 }
    ].map((goal) => ({ ...goal, done: goal.value >= goal.target }));
  }

  function completedGoals() {
    return goalRows().filter((goal) => goal.done).length;
  }

  function canClaim() {
    return state.lastClaimDay !== todayKey() && completedGoals() >= 3;
  }

  function claimReward() {
    updateGoalProgress();
    if (!canClaim()) {
      toast('Finish 3 daily goals first');
      renderPanel();
      return;
    }
    const snapshot = getSnapshot();
    const player = playerFromSnapshot(snapshot);
    if (!player) {
      toast('Game not ready yet');
      return;
    }
    const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
    state.streak = state.lastClaimDay === yesterday ? safeNumber(state.streak) + 1 : 1;
    state.bestStreak = Math.max(safeNumber(state.bestStreak), state.streak);
    state.lastClaimDay = todayKey();
    const rewardCash = 120 + Math.min(380, state.streak * 30);
    const rewardXp = 40 + Math.min(160, state.streak * 10);
    player.cash = safeNumber(player.cash) + rewardCash;
    player.xp = safeNumber(player.xp) + rewardXp;
    safeSave();
    saveReport('claim');
    toast(`Daily streak +${state.streak}: $${rewardCash} / ${rewardXp} XP`);
    renderPanel();
  }

  function safeSave() {
    try {
      getGame()?.saveState?.();
      localStorage.setItem('neonblock:lastSafeStreakSave', new Date().toISOString());
    } catch (_error) {}
    saveLocal(true);
  }

  function saveLocal(force = false) {
    if (!force && Date.now() - lastSaveAt < 1200) return;
    lastSaveAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {}
  }

  function makeReport(reason = 'snapshot') {
    updateGoalProgress();
    const metrics = currentMetrics();
    const rows = goalRows();
    return {
      title: 'NeonBlock Streak Board QA',
      reason,
      generatedAt: new Date().toISOString(),
      day: state.day,
      streak: safeNumber(state.streak),
      bestStreak: safeNumber(state.bestStreak),
      lastClaimDay: state.lastClaimDay || 'none',
      completedGoals: completedGoals(),
      goals: rows.map((goal) => ({ id: goal.id, label: goal.label, value: Math.round(goal.value), target: goal.target, done: goal.done })),
      player: {
        cash: Math.round(metrics.cash),
        xp: Math.round(metrics.xp),
        level: metrics.level,
        wanted: metrics.wanted,
        inVehicle: metrics.inVehicle,
        chunks: metrics.chunks,
        ownedLots: metrics.ownedLots,
        completedMissions: metrics.completed
      },
      checks: {
        runtimeReady: Boolean(getGame()?.getSnapshot),
        rewardAvailable: canClaim(),
        savedLocally: Boolean(localStorage.getItem(STORAGE_KEY)),
        optionalCloudUntouched: true
      }
    };
  }

  function saveReport(reason = 'snapshot') {
    const report = makeReport(reason);
    state.reports = [report, ...(state.reports || [])].slice(0, 5);
    try {
      localStorage.setItem(REPORT_KEY, JSON.stringify(report, null, 2));
    } catch (_error) {}
    saveLocal(true);
    return report;
  }

  function copyReport() {
    const text = JSON.stringify(saveReport('copy'), null, 2);
    navigator.clipboard?.writeText(text).then(() => toast('Streak QA copied')).catch(() => {
      const box = $('neonblock-streak-report');
      if (box) box.value = text;
      toast('Report ready to copy');
    });
    renderPanel();
  }

  function injectStyles() {
    if ($('neonblock-streak-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-streak-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed; right: 14px; bottom: 92px; z-index: 45; width: min(360px, calc(100vw - 24px));
        padding: 14px; border: 1px solid rgba(54, 238, 255, 0.35); border-radius: 18px;
        background: rgba(5, 10, 24, 0.88); color: #e8fbff; font-family: system-ui, sans-serif;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34); backdrop-filter: blur(14px);
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h2 { margin: 0 0 8px; font-size: 18px; }
      #${PANEL_ID} p { margin: 5px 0; color: rgba(232, 251, 255, 0.82); font-size: 12px; line-height: 1.35; }
      .streak-grid { display: grid; gap: 7px; margin: 10px 0; }
      .streak-goal { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 8px; background: rgba(255,255,255,0.05); }
      .streak-goal strong { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
      .streak-bar { height: 6px; margin-top: 6px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.12); }
      .streak-fill { height: 100%; width: var(--streak-fill, 0%); background: linear-gradient(90deg, #18f3ff, #a66cff); }
      .streak-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .streak-actions button, #${MOBILE_BUTTON_ID} { border: 0; border-radius: 999px; padding: 8px 10px; font-weight: 800; background: #18f3ff; color: #06111f; }
      .streak-actions button.secondary { background: rgba(255,255,255,0.12); color: #e8fbff; border: 1px solid rgba(255,255,255,0.18); }
      #neonblock-streak-report { width: 100%; min-height: 58px; margin-top: 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.22); color: #dff; font-size: 11px; }
      @media (max-width: 740px) { #${PANEL_ID} { left: 10px; right: 10px; bottom: 132px; width: auto; max-height: 48vh; overflow: auto; } }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($(PANEL_ID)) return $(PANEL_ID);
    injectStyles();
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'hidden';
    panel.innerHTML = `
      <h2>Streak Board</h2>
      <p id="neonblock-streak-summary">Tracking daily play goals...</p>
      <div class="streak-grid" id="neonblock-streak-goals"></div>
      <div class="streak-actions">
        <button id="neonblock-streak-claim">Claim Daily</button>
        <button class="secondary" id="neonblock-streak-save">Quick Save</button>
        <button class="secondary" id="neonblock-streak-copy">Copy QA</button>
        <button class="secondary" id="neonblock-streak-close">Close</button>
      </div>
      <textarea id="neonblock-streak-report" readonly placeholder="Copyable streak QA report"></textarea>
    `;
    document.body.appendChild(panel);
    $('neonblock-streak-claim')?.addEventListener('click', claimReward);
    $('neonblock-streak-save')?.addEventListener('click', () => { safeSave(); saveReport('quick-save'); toast('Streak save complete'); renderPanel(); });
    $('neonblock-streak-copy')?.addEventListener('click', copyReport);
    $('neonblock-streak-close')?.addEventListener('click', () => panel.classList.add('hidden'));
    return panel;
  }

  function ensureMobileButton() {
    if ($(MOBILE_BUTTON_ID)) return;
    const rail = $('action-rail');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = MOBILE_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Streak';
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      togglePanel();
    });
    rail.insertBefore(button, rail.firstChild);
  }

  function renderPanel() {
    const panel = ensurePanel();
    updateGoalProgress();
    const rows = goalRows();
    const summary = $('neonblock-streak-summary');
    if (summary) {
      const ready = canClaim();
      summary.textContent = `Today: ${completedGoals()}/3 goals ready • Streak ${safeNumber(state.streak)} • Best ${safeNumber(state.bestStreak)} • ${ready ? 'reward available' : 'keep exploring'}`;
    }
    const goals = $('neonblock-streak-goals');
    if (goals) {
      goals.innerHTML = rows.map((goal) => {
        const pct = Math.max(0, Math.min(100, (goal.value / goal.target) * 100));
        return `<div class="streak-goal"><strong><span>${goal.done ? '✓ ' : ''}${goal.label}</span><span>${Math.round(goal.value)}/${goal.target}</span></strong><div class="streak-bar"><div class="streak-fill" style="--streak-fill:${pct}%"></div></div></div>`;
      }).join('');
    }
    const claim = $('neonblock-streak-claim');
    if (claim) claim.disabled = !canClaim();
    const reportBox = $('neonblock-streak-report');
    if (reportBox) reportBox.value = JSON.stringify(makeReport('panel'), null, 2);
  }

  function togglePanel(force) {
    const panel = ensurePanel();
    const shouldShow = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldShow);
    if (shouldShow) renderPanel();
  }

  function keyboardHandler(event) {
    if (event.defaultPrevented) return;
    if (event.code === 'F4') {
      event.preventDefault();
      togglePanel();
    }
  }

  function boot() {
    ensurePanel();
    ensureMobileButton();
    document.addEventListener('keydown', keyboardHandler, true);
    setInterval(() => {
      updateGoalProgress();
      if (!$(PANEL_ID)?.classList.contains('hidden')) renderPanel();
    }, 1000);
    window.addEventListener('pagehide', () => { saveReport('pagehide'); safeSave(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { saveReport('hidden'); safeSave(); } });
    window.NeonBlockStreakBoard = { toggle: togglePanel, report: () => saveReport('api'), claim: claimReward };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
