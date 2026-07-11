(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:missionPolish';
  const PANEL_ID = 'mission-polish-panel';
  const UPDATE_INTERVAL_MS = 700;
  const MISSION_TEXT = {
    courier: {
      title: 'Courier Sprint',
      hint: 'Follow the green mission marker and stop inside the delivery zone.',
      action: 'Stay on foot if traffic feels hard; sprinting is enough for this route.'
    },
    collector: {
      title: 'Crate Collector',
      hint: 'Sweep nearby city chunks and use Interact when the prompt says crate.',
      action: 'Crates are persistent now, so every collected crate safely counts.'
    },
    owner: {
      title: 'First Property',
      hint: 'Look for a purple lot marker, stand close, then press Interact to buy it.',
      action: 'Need more cash? Collect crates or finish courier first.'
    },
    driver: {
      title: 'Vehicle Delivery',
      hint: 'Enter any nearby car, keep gas above zero, and drive to the delivery marker.',
      action: 'Use Brake on mobile or X/Space on desktop before sharp turns.'
    }
  };

  const state = loadState();
  let lastMission = '';
  let lastSnapshotAt = 0;
  let lastMissionRepairAt = 0;
  let updateTimer = 0;
  let updateCount = 0;
  let hiddenPauseCount = 0;

  function loadState() {
    try {
      return Object.assign({ hidden: false, compact: false, lastSeenMission: '', missionStarts: {}, bestDistances: {} }, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (_) {
      return { hidden: false, compact: false, lastSeenMission: '', missionStarts: {}, bestDistances: {} };
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function el(id) { return document.getElementById(id); }

  function css() {
    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: max(128px, calc(112px + env(safe-area-inset-bottom)));
        z-index: 21;
        width: min(310px, calc(100vw - 24px));
        padding: 12px;
        border: 1px solid rgba(23, 243, 255, 0.32);
        border-radius: 16px;
        background: rgba(5, 8, 20, 0.78);
        color: #e9fbff;
        box-shadow: 0 12px 40px rgba(0,0,0,0.32);
        backdrop-filter: blur(12px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        pointer-events: auto;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID}.compact .mission-polish-body { display: none; }
      #${PANEL_ID} .mission-polish-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      #${PANEL_ID} strong { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #17f3ff; }
      #${PANEL_ID} button { border: 0; border-radius: 10px; padding: 7px 9px; background: rgba(23,243,255,0.13); color: #e9fbff; font-weight: 700; }
      #${PANEL_ID} .mission-polish-body { margin-top: 8px; display: grid; gap: 6px; font-size: 12px; line-height: 1.35; }
      #${PANEL_ID} .mission-polish-progress { height: 7px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,0.14); }
      #${PANEL_ID} .mission-polish-bar { height: 100%; width: 0%; border-radius: inherit; background: linear-gradient(90deg, #17f3ff, #5ef38c); transition: width 180ms ease; }
      #${PANEL_ID} .mission-polish-muted { color: rgba(233,251,255,0.72); }
      #${PANEL_ID} .mission-polish-hotkeys { color: rgba(233,251,255,0.62); font-size: 11px; }
      #mission-list button[aria-disabled="true"] { opacity: 0.58; cursor: not-allowed; }
      @media (max-width: 720px) {
        #${PANEL_ID} { bottom: max(188px, calc(170px + env(safe-area-inset-bottom))); width: min(280px, calc(100vw - 20px)); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = el(PANEL_ID);
    if (panel) return panel;
    css();
    panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="mission-polish-head">
        <strong>Mission Coach</strong>
        <span>
          <button type="button" data-action="compact" title="Compact mission coach">Mini</button>
          <button type="button" data-action="hide" title="Hide mission coach">L</button>
        </span>
      </div>
      <div class="mission-polish-body">
        <div id="mission-polish-title">Finding mission...</div>
        <div class="mission-polish-progress"><div class="mission-polish-bar" id="mission-polish-bar"></div></div>
        <div class="mission-polish-muted" id="mission-polish-hint">Move around the city to stream nearby objectives.</div>
        <div id="mission-polish-action">Press M to choose another mission.</div>
        <div class="mission-polish-hotkeys">L hide/show • M mission board • E interact</div>
      </div>
    `;
    panel.classList.toggle('hidden', state.hidden);
    panel.classList.toggle('compact', state.compact);
    panel.addEventListener('click', (event) => {
      const action = event.target?.dataset?.action;
      if (action === 'compact') {
        state.compact = !state.compact;
        panel.classList.toggle('compact', state.compact);
        saveState();
      }
      if (action === 'hide') togglePanel();
    });
    document.body.appendChild(panel);
    return panel;
  }

  function getSnapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (_) { return null; }
  }

  function getMissionName() {
    return (el('hud-mission')?.textContent || '').trim();
  }

  function getMissionId(name) {
    const lower = name.toLowerCase();
    if (lower.includes('courier')) return 'courier';
    if (lower.includes('crate') || lower.includes('collector')) return 'collector';
    if (lower.includes('property') || lower.includes('owner')) return 'owner';
    if (lower.includes('vehicle') || lower.includes('driver')) return 'driver';
    return 'unknown';
  }

  function showNotice(text) {
    const popup = el('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(showNotice.timeout);
    showNotice.timeout = setTimeout(() => popup.classList.add('hidden'), 1600);
  }

  function annotateMissionButtons(completed = {}) {
    const list = el('mission-list');
    if (!list) return;
    list.querySelectorAll('button[data-mission]').forEach((button) => {
      const done = Boolean(completed[button.dataset.mission]);
      button.setAttribute('aria-disabled', String(done));
      button.title = done ? 'Mission already completed' : 'Track this mission';
    });
  }

  function ensureMissionButtonsRendered() {
    const list = el('mission-list');
    if (!list || list.querySelector('button[data-mission]')) return list;
    const toggle = el('btn-missions');
    const board = el('mission-board');
    if (!toggle || !board) return list;
    const wasHidden = board.classList.contains('hidden');
    toggle.click();
    if (board.classList.contains('hidden') !== wasHidden) toggle.click();
    return list;
  }

  function repairCompletedMission(snapshot, missionId) {
    const completed = snapshot?.player?.completed || {};
    annotateMissionButtons(completed);
    if (!completed[missionId]) return false;

    const nextMissionId = Object.keys(MISSION_TEXT).find((id) => !completed[id]);
    if (!nextMissionId) return false;
    if (performance.now() - lastMissionRepairAt < 1200) return false;

    lastMissionRepairAt = performance.now();
    const list = ensureMissionButtonsRendered();
    const nextButton = list?.querySelector(`button[data-mission="${nextMissionId}"]`);
    if (!nextButton) return false;
    nextButton.click();
    showNotice(`Completed mission skipped • Tracking ${MISSION_TEXT[nextMissionId].title}`);
    return true;
  }

  function distanceToKnownTarget(missionId, position) {
    const targets = {
      courier: { x: 55, z: -50, radius: 7 },
      owner: { x: -48, z: 42, radius: 7 },
      driver: { x: -70, z: 65, radius: 8 }
    };
    const target = targets[missionId];
    if (!target || !position) return null;
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const dist = Math.hypot(dx, dz);
    return { dist, progress: Math.max(0, Math.min(1, 1 - (dist - target.radius) / 130)) };
  }

  function progressFor(missionId, snapshot) {
    if (!snapshot?.player) return { text: 'Runtime warming up...', percent: 0 };
    const player = snapshot.player;
    const pos = player.mesh?.position;
    if (missionId === 'collector') {
      let savedCrates = 0;
      try { savedCrates = JSON.parse(localStorage.getItem(`neonblock:${player.slot || 'slot1'}`) || '{}')?.collectedCrates || 0; } catch (_) {}
      const collected = Math.max(0, Number(player?.completed?.collector ? 3 : savedCrates));
      return { text: `${Math.min(3, collected)}/3 crates tracked`, percent: Math.min(1, collected / 3) };
    }
    if (missionId === 'owner') {
      const count = Object.keys(player.ownedLots || {}).length;
      if (count > 0) return { text: `${count} property owned`, percent: 1 };
    }
    const target = distanceToKnownTarget(missionId, pos);
    if (target) {
      const best = state.bestDistances[missionId];
      state.bestDistances[missionId] = typeof best === 'number' ? Math.min(best, target.dist) : target.dist;
      return { text: `${Math.round(target.dist)}m from target • best ${Math.round(state.bestDistances[missionId])}m`, percent: target.progress };
    }
    return { text: 'Explore nearby chunks for the next opportunity.', percent: 0.25 };
  }

  function updateCoach() {
    const panel = ensurePanel();
    const missionName = getMissionName();
    const missionId = getMissionId(missionName);
    const snapshot = getSnapshot();
    const completed = snapshot?.player?.completed || {};
    updateCount += 1;

    if (repairCompletedMission(snapshot, missionId)) return;

    const allComplete = Object.keys(MISSION_TEXT).every((id) => completed[id]);
    const info = allComplete
      ? { title: 'All Missions Complete', hint: 'Every core city mission is complete.', action: 'Keep exploring, collecting, driving, and expanding your property portfolio.' }
      : (MISSION_TEXT[missionId] || { title: missionName || 'Current Mission', hint: 'Use M to pick a mission and E/Interact near objects.', action: 'Keep moving to stream more city blocks.' });
    const progress = allComplete ? { text: '4/4 complete', percent: 1 } : progressFor(missionId, snapshot);

    if (missionName && missionName !== lastMission) {
      lastMission = missionName;
      state.lastSeenMission = missionName;
      state.missionStarts[missionId] = state.missionStarts[missionId] || Date.now();
      saveState();
      try { window.NeonBlockGame?.saveState?.(); } catch (_) {}
    }

    el('mission-polish-title').textContent = `${info.title}: ${progress.text}`;
    el('mission-polish-hint').textContent = info.hint;
    el('mission-polish-action').textContent = info.action;
    el('mission-polish-bar').style.width = `${Math.round(progress.percent * 100)}%`;
    if (performance.now() - lastSnapshotAt > 30000) {
      lastSnapshotAt = performance.now();
      saveState();
    }
    panel.classList.toggle('hidden', state.hidden);
  }

  function clearUpdateTimer() {
    if (!updateTimer) return;
    clearTimeout(updateTimer);
    updateTimer = 0;
  }

  function scheduleUpdate(delay = UPDATE_INTERVAL_MS) {
    clearUpdateTimer();
    if (document.hidden) return;
    updateTimer = window.setTimeout(() => {
      updateTimer = 0;
      if (document.hidden) {
        hiddenPauseCount += 1;
        return;
      }
      updateCoach();
      scheduleUpdate();
    }, delay);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      hiddenPauseCount += 1;
      clearUpdateTimer();
      return;
    }
    updateCoach();
    scheduleUpdate();
  }

  function togglePanel() {
    state.hidden = !state.hidden;
    ensurePanel().classList.toggle('hidden', state.hidden);
    saveState();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyL' && !event.repeat) togglePanel();
  });

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#mission-list button[data-mission]');
    if (!button) return;
    const completed = getSnapshot()?.player?.completed || {};
    if (!completed[button.dataset.mission]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showNotice('That mission is already complete');
  }, true);

  window.addEventListener('neonblock:objective:claimed', () => {
    try { window.NeonBlockGame?.saveState?.(); } catch (_) {}
  });

  const start = () => {
    ensurePanel();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) {
      updateCoach();
      scheduleUpdate();
    }
  };

  window.NeonBlockMissionPolish = {
    getStatus: () => {
      const snapshot = getSnapshot();
      const missionId = getMissionId(getMissionName());
      return {
        version: 2,
        missionId,
        completed: { ...(snapshot?.player?.completed || {}) },
        activeMissionAlreadyCompleted: Boolean(snapshot?.player?.completed?.[missionId]),
        documentHidden: document.hidden,
        schedulerActive: Boolean(updateTimer),
        updateIntervalMs: UPDATE_INTERVAL_MS,
        updateCount,
        hiddenPauseCount
      };
    },
    repair: () => repairCompletedMission(getSnapshot(), getMissionId(getMissionName())),
    refresh: () => {
      updateCoach();
      scheduleUpdate();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();