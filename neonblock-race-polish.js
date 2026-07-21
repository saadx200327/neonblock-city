(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:raceBoard:v1';
  const REPORT_KEY = 'neonblock:raceBoard:lastReport';
  const STYLE_ID = 'neonblock-race-style';
  const PANEL_ID = 'neonblock-race-panel';
  const MOBILE_ID = 'btn-mobile-race-board';
  const COURSES = [
    { id: 'alley-dash', title: 'Alley Dash', mode: 'foot', goal: 180, seconds: 55, cash: 80, xp: 30, hint: 'Stay on foot and keep moving through nearby blocks.' },
    { id: 'neon-lap', title: 'Neon Lap', mode: 'drive', goal: 520, seconds: 70, cash: 150, xp: 60, hint: 'Enter any vehicle and drive a clean city loop.' },
    { id: 'hybrid-run', title: 'Hybrid Run', mode: 'mixed', goal: 650, seconds: 100, cash: 210, xp: 85, hint: 'Mix walking and driving for a longer route.' }
  ];

  const state = loadState();
  let panel;
  let body;
  let status;
  let lastPos = null;
  let lastReport = '';

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        activeId: parsed.activeId || COURSES[0].id,
        running: Boolean(parsed.running),
        startedAt: Number(parsed.startedAt || 0),
        progress: Number(parsed.progress || 0),
        best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
        completions: parsed.completions && typeof parsed.completions === 'object' ? parsed.completions : {},
        totalRaceMeters: Number(parsed.totalRaceMeters || 0),
        failedRuns: Number(parsed.failedRuns || 0)
      };
    } catch (error) {
      return { activeId: COURSES[0].id, running: false, startedAt: 0, progress: 0, best: {}, completions: {}, totalRaceMeters: 0, failedRuns: 0 };
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) {}
  }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (error) { return null; }
  }

  function getPlayer(snap = snapshot()) {
    return snap?.player || null;
  }

  function getPosition(player = getPlayer()) {
    const pos = player?.mesh?.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    return { x: pos.x, y: Number.isFinite(pos.y) ? pos.y : 1, z: pos.z };
  }

  function distance(a, b) {
    if (!a || !b) return 0;
    const value = Math.hypot(a.x - b.x, a.z - b.z);
    return Number.isFinite(value) && value < 85 ? value : 0;
  }

  function activeCourse() {
    return COURSES.find((course) => course.id === state.activeId) || COURSES[0];
  }

  function elapsedSeconds() {
    if (!state.running || !state.startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  }

  function timeLeft(course = activeCourse()) {
    return Math.max(0, course.seconds - elapsedSeconds());
  }

  function isAllowed(course, driving) {
    if (course.mode === 'foot') return !driving;
    if (course.mode === 'drive') return driving;
    return true;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: max(14px, env(safe-area-inset-right));
        bottom: calc(104px + env(safe-area-inset-bottom));
        z-index: 39;
        width: min(370px, calc(100vw - 28px));
        max-height: min(72vh, 560px);
        overflow: auto;
        border: 1px solid rgba(255, 211, 56, 0.4);
        border-radius: 18px;
        padding: 14px;
        background: rgba(5, 8, 20, 0.9);
        color: #fff8dd;
        box-shadow: 0 0 28px rgba(255, 211, 56, 0.15);
        backdrop-filter: blur(12px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h2 { margin: 0 0 8px; font-size: 17px; }
      #${PANEL_ID} p { margin: 6px 0; color: #decfa1; font-size: 12px; line-height: 1.35; }
      #${PANEL_ID} .nb-race-card { border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 10px; margin: 8px 0; background: rgba(255,255,255,0.06); }
      #${PANEL_ID} .nb-race-active { border-color: rgba(255, 211, 56, 0.58); background: rgba(255, 211, 56, 0.1); }
      #${PANEL_ID} .nb-race-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
      #${PANEL_ID} button, #${MOBILE_ID} {
        border: 1px solid rgba(255, 211, 56, 0.4);
        border-radius: 999px;
        background: rgba(255, 211, 56, 0.14);
        color: #fff8dd;
        padding: 8px 10px;
        font-weight: 800;
      }
      #${PANEL_ID} button:active, #${MOBILE_ID}:active { transform: translateY(1px); }
      #${PANEL_ID} progress { width: 100%; accent-color: #ffd338; }
      #${PANEL_ID} .nb-race-status { color: #ffd338; font-weight: 800; }
      @media (max-width: 740px) {
        #${PANEL_ID} { left: 14px; right: 14px; bottom: calc(132px + env(safe-area-inset-bottom)); width: auto; }
        #${MOBILE_ID} { min-width: 70px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    injectStyle();
    panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'hidden';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <h2>Race Board</h2>
      <p>Local time trials for movement, driving, and mixed city routes. Toggle with <strong>F2</strong>.</p>
      <div class="nb-race-status" data-role="status">Waiting for runtime…</div>
      <div data-role="body"></div>
      <div class="nb-race-row">
        <button type="button" data-action="next">Next Race</button>
        <button type="button" data-action="start">Start/Restart</button>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="copy">Copy QA</button>
      </div>
    `;
    document.body.appendChild(panel);
    body = panel.querySelector('[data-role="body"]');
    status = panel.querySelector('[data-role="status"]');
    panel.addEventListener('click', onPanelClick);
    return panel;
  }

  function ensureMobileButton() {
    if (document.getElementById(MOBILE_ID)) return;
    const rail = document.getElementById('action-rail') || document.getElementById('mobile-controls') || document.body;
    const button = document.createElement('button');
    button.id = MOBILE_ID;
    button.className = 'action-btn';
    button.type = 'button';
    button.textContent = 'Race';
    button.addEventListener('click', () => togglePanel(true));
    rail.appendChild(button);
  }

  function togglePanel(forceOpen = false) {
    ensurePanel();
    const shouldOpen = forceOpen || panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    render();
  }

  function onPanelClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    if (action === 'next') nextRace();
    if (action === 'start') startRace();
    if (action === 'cancel') cancelRace(true);
    if (action === 'copy') copyReport();
    render();
  }

  function nextRace() {
    const index = COURSES.findIndex((course) => course.id === activeCourse().id);
    state.activeId = COURSES[(index + 1) % COURSES.length].id;
    state.running = false;
    state.progress = 0;
    state.startedAt = 0;
    lastPos = null;
    saveState();
    toast(`Race selected: ${activeCourse().title}`);
  }

  function startRace() {
    const player = getPlayer();
    const driving = Boolean(player?.activeVehicle);
    const course = activeCourse();
    if (!isAllowed(course, driving)) {
      toast(course.mode === 'drive' ? 'Enter a vehicle first' : 'Exit vehicle first');
      return;
    }
    state.running = true;
    state.startedAt = Date.now();
    state.progress = 0;
    lastPos = getPosition(player);
    saveState();
    toast(`${course.title} started`);
  }

  function cancelRace(showToast = false) {
    state.running = false;
    state.startedAt = 0;
    state.progress = 0;
    lastPos = null;
    state.failedRuns += 1;
    saveState();
    if (showToast) toast('Race cancelled');
  }

  function completeRace(course) {
    const seconds = elapsedSeconds();
    const previous = Number(state.best[course.id] || 0);
    const isBest = !previous || seconds < previous;
    state.best[course.id] = isBest ? seconds : previous;
    state.completions[course.id] = Number(state.completions[course.id] || 0) + 1;
    state.running = false;
    state.startedAt = 0;
    state.progress = 0;
    const player = getPlayer();
    if (player) {
      player.cash = Number(player.cash || 0) + course.cash;
      player.xp = Number(player.xp || 0) + course.xp;
    }
    saveState();
    quickSave(false);
    toast(`${course.title} complete: +$${course.cash}${isBest ? ' best!' : ''}`);
  }

  function failRace(reason) {
    state.running = false;
    state.startedAt = 0;
    state.progress = 0;
    state.failedRuns += 1;
    lastPos = null;
    saveState();
    toast(reason || 'Race failed');
  }

  function trackRace() {
    const snap = snapshot();
    const player = getPlayer(snap);
    const pos = getPosition(player);
    if (!pos) return;
    if (!state.running) {
      lastPos = pos;
      return;
    }
    const course = activeCourse();
    const driving = Boolean(player?.activeVehicle);
    if (!isAllowed(course, driving)) {
      failRace(course.mode === 'drive' ? 'Race failed: left vehicle' : 'Race failed: entered vehicle');
      return;
    }
    if (timeLeft(course) <= 0) {
      failRace('Race timer expired');
      return;
    }
    const delta = distance(lastPos, pos);
    lastPos = pos;
    if (!delta) return;
    state.progress = Math.min(course.goal, state.progress + delta);
    state.totalRaceMeters += delta;
    if (state.progress >= course.goal) completeRace(course);
    else if (Math.random() < 0.03) saveState();
  }

  function quickSave(showToast = true) {
    try {
      window.NeonBlockGame?.saveState?.();
      if (showToast) toast('Race progress saved');
    } catch (error) {
      if (showToast) toast('Save unavailable');
    }
  }

  async function copyReport() {
    const report = buildReport();
    lastReport = report;
    try { localStorage.setItem(REPORT_KEY, report); } catch (error) {}
    try {
      await navigator.clipboard.writeText(report);
      toast('Race QA copied');
    } catch (error) {
      toast('Copy blocked; report saved locally');
    }
  }

  function toast(text) {
    const popup = document.getElementById('reward-popup');
    if (popup) {
      popup.textContent = text;
      popup.classList.remove('hidden');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => popup.classList.add('hidden'), 1600);
      return;
    }
    console.log('[NeonBlock Race]', text);
  }

  function render() {
    ensurePanel();
    const snap = snapshot();
    const player = getPlayer(snap);
    const driving = Boolean(player?.activeVehicle);
    const active = activeCourse();
    status.textContent = `${state.running ? 'Running' : 'Ready'} • ${driving ? 'Driving' : 'On foot'} • ${Math.floor(state.totalRaceMeters)}m raced • Fails ${state.failedRuns}`;
    body.innerHTML = COURSES.map((course) => {
      const isActive = course.id === active.id;
      const progress = isActive ? state.progress : 0;
      const percent = Math.max(0, Math.min(100, Math.round((progress / course.goal) * 100)));
      const best = state.best[course.id] ? `${state.best[course.id]}s best` : 'No time yet';
      const completions = Number(state.completions[course.id] || 0);
      const timer = isActive && state.running ? ` • ${timeLeft(course)}s left` : '';
      return `
        <div class="nb-race-card ${isActive ? 'nb-race-active' : ''}">
          <div class="nb-race-row"><strong>${course.title}</strong><span>${percent}%${timer}</span></div>
          <progress max="${course.goal}" value="${Math.min(progress, course.goal)}"></progress>
          <p>${course.hint}</p>
          <p>Mode: ${course.mode} • Goal ${course.goal}m in ${course.seconds}s • Reward $${course.cash}/${course.xp} XP • ${best} • Wins ${completions}</p>
        </div>
      `;
    }).join('');
    lastReport = buildReport(snap);
  }

  function buildReport(snap = snapshot()) {
    const player = getPlayer(snap);
    const pos = getPosition(player);
    const course = activeCourse();
    return [
      'NeonBlock Race Board QA',
      `active=${course.title}`,
      `running=${state.running}`,
      `progress=${Math.floor(state.progress)}/${course.goal}`,
      `timeLeft=${timeLeft(course)}`,
      `totalRaceMeters=${Math.floor(state.totalRaceMeters)}`,
      `best=${JSON.stringify(state.best)}`,
      `completions=${JSON.stringify(state.completions)}`,
      `failedRuns=${state.failedRuns}`,
      `vehicle=${player?.activeVehicle?.userData?.name || 'none'}`,
      `cash=${Math.floor(Number(player?.cash || 0))}`,
      `xp=${Math.floor(Number(player?.xp || 0))}`,
      `chunks=${snap?.chunks ?? 'n/a'}`,
      `vehicles=${snap?.vehicles ?? 'n/a'}`,
      `pos=${pos ? `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}` : 'n/a'}`,
      `runtime=${window.NeonBlockGame ? 'ready' : 'missing'}`
    ].join('\n');
  }

  function boot() {
    ensurePanel();
    ensureMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'F2' && !event.repeat) {
        event.preventDefault();
        togglePanel();
      }
    }, true);
    setInterval(() => {
      trackRace();
      if (panel && !panel.classList.contains('hidden')) render();
    }, 700);
    addEventListener('pagehide', () => {
      saveState();
      try { localStorage.setItem(REPORT_KEY, lastReport || buildReport()); } catch (error) {}
    });
    setTimeout(render, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();