(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:daily-bonus:v1';
  const REPORT_KEY = 'neonblock:daily-bonus-report:v1';
  const PANEL_ID = 'neonblock-daily-bonus-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-daily';
  const OPEN_KEY = 'neonblock:daily-bonus-open';
  const DAY_MS = 86400000;

  const DEFAULT_STATE = {
    streak: 0,
    lastClaimDay: '',
    lastSeenDay: '',
    totalClaims: 0,
    totalCash: 0,
    totalXp: 0,
    lastSaveAt: 0,
    report: null
  };

  const state = loadState();
  let panel;
  let statusEl;
  let rewardEl;
  let reportEl;

  function todayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  function dayIndex(day = todayKey()) {
    return Math.floor(new Date(`${day}T00:00:00.000Z`).getTime() / DAY_MS);
  }

  function loadState() {
    try {
      return { ...DEFAULT_STATE, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) };
    } catch (error) {
      return { ...DEFAULT_STATE, report: { at: new Date().toISOString(), warning: `State reset after parse error: ${error.message}` } };
    }
  }

  function getSnapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch { return null; }
  }

  function getPlayer(snapshot = getSnapshot()) {
    return snapshot?.player || null;
  }

  function currentReward() {
    const nextStreak = Math.max(1, Number(state.streak || 0) + (canClaimToday() ? 1 : 0));
    const capped = Math.min(nextStreak, 14);
    return {
      cash: 120 + capped * 35,
      xp: 35 + capped * 12,
      label: `${capped} day${capped === 1 ? '' : 's'}`
    };
  }

  function canClaimToday() {
    return state.lastClaimDay !== todayKey();
  }

  function missedYesterday() {
    if (!state.lastClaimDay) return false;
    return dayIndex(todayKey()) - dayIndex(state.lastClaimDay) > 1;
  }

  function normalizeDailyState() {
    const today = todayKey();
    if (state.lastSeenDay !== today) {
      if (missedYesterday()) state.streak = 0;
      state.lastSeenDay = today;
      saveState('new daily visit');
    }
  }

  function saveState(reason = 'auto') {
    state.lastSaveAt = Date.now();
    state.report = buildReport(reason);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(REPORT_KEY, JSON.stringify(state.report, null, 2));
    try { window.NeonBlockGame?.saveState?.(); } catch (error) { state.report.saveWarning = error.message; }
    return state.report;
  }

  function popup(text) {
    const el = document.getElementById('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1700);
  }

  function claimDaily() {
    normalizeDailyState();
    if (!canClaimToday()) {
      popup('Daily bonus already claimed');
      render();
      return;
    }

    const player = getPlayer();
    const reward = currentReward();
    if (player) {
      player.cash = Math.max(0, Number(player.cash || 0)) + reward.cash;
      player.xp = Math.max(0, Number(player.xp || 0)) + reward.xp;
    }

    state.streak = Math.max(0, Number(state.streak || 0)) + 1;
    state.lastClaimDay = todayKey();
    state.totalClaims = Math.max(0, Number(state.totalClaims || 0)) + 1;
    state.totalCash = Math.max(0, Number(state.totalCash || 0)) + reward.cash;
    state.totalXp = Math.max(0, Number(state.totalXp || 0)) + reward.xp;
    saveState('claimed daily bonus');
    popup(`Daily bonus: +$${reward.cash}`);
    render();
  }

  function buildReport(reason = 'manual') {
    const snapshot = getSnapshot();
    const player = getPlayer(snapshot);
    const reward = currentReward();
    return {
      at: new Date().toISOString(),
      reason,
      today: todayKey(),
      claimReady: canClaimToday(),
      streak: Math.max(0, Number(state.streak || 0)),
      lastClaimDay: state.lastClaimDay || null,
      nextReward: reward,
      totalClaims: Math.max(0, Number(state.totalClaims || 0)),
      totalCash: Math.max(0, Number(state.totalCash || 0)),
      totalXp: Math.max(0, Number(state.totalXp || 0)),
      playerCash: Math.floor(Number(player?.cash || 0)),
      playerXp: Math.floor(Number(player?.xp || 0)),
      chunks: snapshot?.chunks ?? 0,
      runtimeReady: Boolean(window.NeonBlockGame?.getSnapshot)
    };
  }

  async function copyReport() {
    const report = saveState('copied daily bonus QA report');
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard?.writeText(text);
      popup('Daily QA copied');
    } catch {
      popup('Daily QA saved locally');
    }
    render();
  }

  function injectStyles() {
    if (document.getElementById('neonblock-daily-bonus-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-daily-bonus-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        bottom: calc(92px + env(safe-area-inset-bottom));
        z-index: 35;
        width: min(340px, calc(100vw - 24px));
        max-height: min(72vh, 520px);
        overflow: auto;
        padding: 14px;
        border: 1px solid rgba(255, 204, 82, 0.44);
        border-radius: 18px;
        background: rgba(8, 7, 18, 0.9);
        color: #fff9df;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.42), 0 0 24px rgba(255, 204, 82, 0.14);
        backdrop-filter: blur(12px);
        font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h3 { margin: 0 0 8px; color: #ffcc52; font-size: 17px; }
      #${PANEL_ID} p { margin: 6px 0; color: #ffeeb8; }
      #${PANEL_ID} .daily-reward { margin: 10px 0; padding: 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; background: rgba(255,255,255,0.06); }
      #${PANEL_ID} .daily-ready { color: #5ef38c; font-weight: 800; }
      #${PANEL_ID} .daily-wait { color: #9defff; font-weight: 800; }
      #${PANEL_ID} .daily-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      #${PANEL_ID} button, #${MOBILE_BUTTON_ID} { border: 0; border-radius: 999px; padding: 8px 10px; background: rgba(255,204,82,0.18); color: #fff9df; font-weight: 800; }
      #${PANEL_ID} button:active, #${MOBILE_BUTTON_ID}:active { transform: translateY(1px); }
      #${PANEL_ID} pre { max-height: 130px; overflow: auto; white-space: pre-wrap; background: rgba(0,0,0,0.24); padding: 8px; border-radius: 10px; }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (panel) return;
    injectStyles();
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = localStorage.getItem(OPEN_KEY) === '1' ? '' : 'hidden';
    panel.innerHTML = `
      <h3>Daily Bonus <span style="float:right;font-size:12px;color:#ffeeb8">F8</span></h3>
      <p id="daily-bonus-status">Checking local streak...</p>
      <div id="daily-bonus-reward" class="daily-reward"></div>
      <div class="daily-actions">
        <button type="button" data-daily-action="claim">Claim Daily</button>
        <button type="button" data-daily-action="save">Quick Save</button>
        <button type="button" data-daily-action="copy">Copy QA</button>
      </div>
      <pre id="daily-bonus-report"></pre>
    `;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#daily-bonus-status');
    rewardEl = panel.querySelector('#daily-bonus-reward');
    reportEl = panel.querySelector('#daily-bonus-report');
    panel.addEventListener('click', (event) => {
      const action = event.target?.dataset?.dailyAction;
      if (action === 'claim') claimDaily();
      if (action === 'save') { saveState('manual daily quick save'); popup('Daily state saved'); render(); }
      if (action === 'copy') copyReport();
    });
  }

  function addMobileButton() {
    if (document.getElementById(MOBILE_BUTTON_ID)) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const button = document.createElement('button');
    button.id = MOBILE_BUTTON_ID;
    button.className = 'action-btn';
    button.type = 'button';
    button.textContent = 'Daily';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    buildPanel();
    const hidden = panel.classList.toggle('hidden');
    localStorage.setItem(OPEN_KEY, hidden ? '0' : '1');
    render();
  }

  function render() {
    if (!panel) return;
    normalizeDailyState();
    const reward = currentReward();
    const ready = canClaimToday();
    statusEl.innerHTML = ready
      ? '<span class="daily-ready">Ready:</span> claim today’s offline-safe reward.'
      : '<span class="daily-wait">Claimed:</span> come back tomorrow to continue the streak.';
    rewardEl.innerHTML = `
      <p><strong>Streak:</strong> ${Math.max(0, Number(state.streak || 0))} day${Number(state.streak || 0) === 1 ? '' : 's'}</p>
      <p><strong>${ready ? 'Today reward' : 'Next reward'}:</strong> $${reward.cash} + ${reward.xp} XP (${reward.label})</p>
      <p><strong>Total claimed:</strong> ${Math.max(0, Number(state.totalClaims || 0))}</p>
    `;
    reportEl.textContent = JSON.stringify(buildReport('render'), null, 2);
  }

  function boot() {
    buildPanel();
    addMobileButton();
    normalizeDailyState();
    setInterval(render, 5000);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F8' && !event.repeat) {
        event.preventDefault();
        togglePanel();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveState('hidden-page daily backup');
    });
    window.addEventListener('pagehide', () => saveState('pagehide daily backup'));
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();