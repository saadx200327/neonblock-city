(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:deliveryBoard:v1';
  const REPORT_KEY = 'neonblock:deliveryBoard:lastReport';
  const STYLE_ID = 'neonblock-delivery-board-style';
  const PANEL_ID = 'neonblock-delivery-board-panel';
  const MOBILE_ID = 'btn-mobile-delivery-board';
  const TICK_MS = 800;
  const CONTRACTS = [
    { id: 'food-hop', title: 'Food Hop', kind: 'drive', goal: 420, cash: 95, xp: 35, hint: 'Enter any car and drive a few blocks without running out of gas.' },
    { id: 'block-runner', title: 'Block Runner', kind: 'walk', goal: 260, cash: 65, xp: 28, hint: 'Move on foot through the city grid and scout nearby interactables.' },
    { id: 'district-loop', title: 'District Loop', kind: 'mixed', goal: 520, cash: 140, xp: 55, hint: 'Mix walking and driving to simulate a full delivery route.' }
  ];

  const diagnostics = {
    version: 2,
    storageReadFailures: 0,
    storageWriteFailures: 0,
    movementTicks: 0,
    renderCount: 0,
    lastError: '',
    schedulerActive: false
  };

  let panel;
  let body;
  let status;
  let lastPos = null;
  let lastReport = '';
  let timer = 0;

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      diagnostics.storageReadFailures += 1;
      diagnostics.lastError = String(error?.message || error);
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      diagnostics.storageWriteFailures += 1;
      diagnostics.lastError = String(error?.message || error);
      return false;
    }
  }

  function defaultState() {
    return { activeId: CONTRACTS[0].id, progress: {}, completed: {}, totalWalk: 0, totalDrive: 0, streak: 0, lastClaimAt: 0 };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(readStorage(STORAGE_KEY) || '{}');
      return {
        activeId: parsed.activeId || CONTRACTS[0].id,
        progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
        completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
        totalWalk: Number(parsed.totalWalk || 0),
        totalDrive: Number(parsed.totalDrive || 0),
        streak: Number(parsed.streak || 0),
        lastClaimAt: Number(parsed.lastClaimAt || 0)
      };
    } catch (error) {
      diagnostics.lastError = String(error?.message || error);
      return defaultState();
    }
  }

  const state = loadState();

  function saveState() {
    return writeStorage(STORAGE_KEY, JSON.stringify(state));
  }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (error) { return null; }
  }

  function currentContract() {
    return CONTRACTS.find((contract) => contract.id === state.activeId) || CONTRACTS[0];
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
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    const value = Math.hypot(dx, dz);
    return Number.isFinite(value) && value < 90 ? value : 0;
  }

  function progressOf(contract = currentContract()) {
    return Number(state.progress[contract.id] || 0);
  }

  function eligibleFor(contract, driving) {
    if (contract.kind === 'drive') return driving;
    if (contract.kind === 'walk') return !driving;
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
        z-index: 38;
        width: min(360px, calc(100vw - 28px));
        max-height: min(72vh, 560px);
        overflow: auto;
        border: 1px solid rgba(23, 243, 255, 0.35);
        border-radius: 18px;
        padding: 14px;
        background: rgba(5, 8, 20, 0.88);
        color: #eafcff;
        box-shadow: 0 0 28px rgba(23, 243, 255, 0.16);
        backdrop-filter: blur(12px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #${PANEL_ID}.hidden { display: none; }
      #${PANEL_ID} h2 { margin: 0 0 8px; font-size: 17px; }
      #${PANEL_ID} p { margin: 6px 0; color: #b9d7df; font-size: 12px; line-height: 1.35; }
      #${PANEL_ID} .nb-delivery-card { border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 10px; margin: 8px 0; background: rgba(255,255,255,0.06); }
      #${PANEL_ID} .nb-delivery-active { border-color: rgba(94, 243, 140, 0.55); background: rgba(94, 243, 140, 0.09); }
      #${PANEL_ID} .nb-delivery-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
      #${PANEL_ID} button, #${MOBILE_ID} {
        border: 1px solid rgba(23, 243, 255, 0.35);
        border-radius: 999px;
        background: rgba(23, 243, 255, 0.12);
        color: #eafcff;
        padding: 8px 10px;
        font-weight: 800;
      }
      #${PANEL_ID} button:active, #${MOBILE_ID}:active { transform: translateY(1px); }
      #${PANEL_ID} progress { width: 100%; accent-color: #5ef38c; }
      #${PANEL_ID} .nb-delivery-status { color: #5ef38c; font-weight: 800; }
      @media (max-width: 740px) {
        #${PANEL_ID} { left: 14px; right: 14px; bottom: calc(132px + env(safe-area-inset-bottom)); width: auto; }
        #${MOBILE_ID} { min-width: 74px; }
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
      <h2>Delivery Board</h2>
      <p>Repeatable local contracts for movement, vehicles, and city exploration. Toggle with <strong>Shift+R</strong>.</p>
      <div class="nb-delivery-status" data-role="status">Waiting for runtime…</div>
      <div data-role="body"></div>
      <div class="nb-delivery-row">
        <button type="button" data-action="next">Next Contract</button>
        <button type="button" data-action="claim">Claim</button>
        <button type="button" data-action="save">Quick Save</button>
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
    button.textContent = 'Deliver';
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
    if (action === 'next') nextContract();
    if (action === 'claim') claimCurrent();
    if (action === 'save') quickSave();
    if (action === 'copy') copyReport();
    render();
  }

  function nextContract() {
    const index = CONTRACTS.findIndex((contract) => contract.id === currentContract().id);
    state.activeId = CONTRACTS[(index + 1) % CONTRACTS.length].id;
    saveState();
    toast(`Tracked ${currentContract().title}`);
  }

  function claimCurrent() {
    const contract = currentContract();
    const progress = progressOf(contract);
    if (progress < contract.goal) {
      toast(`Need ${Math.ceil(contract.goal - progress)}m more`);
      return;
    }
    const player = getPlayer();
    if (player) {
      player.cash = Number(player.cash || 0) + contract.cash;
      player.xp = Number(player.xp || 0) + contract.xp;
    }
    state.progress[contract.id] = 0;
    state.completed[contract.id] = Number(state.completed[contract.id] || 0) + 1;
    state.streak += 1;
    state.lastClaimAt = Date.now();
    saveState();
    quickSave(false);
    toast(`${contract.title}: +$${contract.cash}`);
  }

  function quickSave(showToast = true) {
    try {
      window.NeonBlockGame?.saveState?.();
      if (showToast) toast('Delivery progress saved');
    } catch (error) {
      if (showToast) toast('Save unavailable');
    }
  }

  async function copyReport() {
    const report = buildReport();
    lastReport = report;
    const stored = writeStorage(REPORT_KEY, report);
    try {
      await navigator.clipboard.writeText(report);
      toast('Delivery QA copied');
    } catch (error) {
      toast(stored ? 'Copy blocked; report saved locally' : 'Copy and local report storage unavailable');
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
    console.log('[NeonBlock Delivery]', text);
  }

  function trackMovement() {
    diagnostics.movementTicks += 1;
    const snap = snapshot();
    const player = getPlayer(snap);
    const pos = getPosition(player);
    if (!pos) return;
    const driving = Boolean(player?.activeVehicle);
    const delta = distance(lastPos, pos);
    lastPos = pos;
    if (!delta) return;
    if (driving) state.totalDrive += delta; else state.totalWalk += delta;
    const contract = currentContract();
    if (eligibleFor(contract, driving)) {
      state.progress[contract.id] = Math.min(contract.goal, progressOf(contract) + delta);
    }
    if (Math.random() < 0.035) saveState();
  }

  function render() {
    ensurePanel();
    diagnostics.renderCount += 1;
    const snap = snapshot();
    const player = getPlayer(snap);
    const active = currentContract();
    const driving = Boolean(player?.activeVehicle);
    const vehicleText = driving ? (player.activeVehicle?.userData?.name || 'Vehicle') : 'On foot';
    status.textContent = `${vehicleText} • Walk ${Math.floor(state.totalWalk)}m • Drive ${Math.floor(state.totalDrive)}m • Claims ${Object.values(state.completed).reduce((sum, value) => sum + Number(value || 0), 0)}`;
    body.innerHTML = CONTRACTS.map((contract) => {
      const progress = progressOf(contract);
      const percent = Math.max(0, Math.min(100, Math.round((progress / contract.goal) * 100)));
      const complete = progress >= contract.goal;
      return `
        <div class="nb-delivery-card ${contract.id === active.id ? 'nb-delivery-active' : ''}">
          <div class="nb-delivery-row"><strong>${contract.title}</strong><span>${percent}%</span></div>
          <progress max="${contract.goal}" value="${Math.min(progress, contract.goal)}"></progress>
          <p>${contract.hint}</p>
          <p>Reward: $${contract.cash} / ${contract.xp} XP • Completed ${Number(state.completed[contract.id] || 0)}x ${complete ? '• Ready to claim' : ''}</p>
        </div>
      `;
    }).join('');
    lastReport = buildReport(snap);
  }

  function buildReport(snap = snapshot()) {
    const player = getPlayer(snap);
    const pos = getPosition(player);
    const active = currentContract();
    const lines = [
      'NeonBlock Delivery Board QA',
      `version=${diagnostics.version}`,
      `active=${active.title}`,
      `progress=${Math.floor(progressOf(active))}/${active.goal}`,
      `totalWalk=${Math.floor(state.totalWalk)}`,
      `totalDrive=${Math.floor(state.totalDrive)}`,
      `claims=${JSON.stringify(state.completed)}`,
      `streak=${state.streak}`,
      `vehicle=${player?.activeVehicle?.userData?.name || 'none'}`,
      `cash=${Math.floor(Number(player?.cash || 0))}`,
      `xp=${Math.floor(Number(player?.xp || 0))}`,
      `chunks=${snap?.chunks ?? 'n/a'}`,
      `vehicles=${snap?.vehicles ?? 'n/a'}`,
      `crates=${snap?.crates ?? 'n/a'}`,
      `lots=${snap?.lots ?? 'n/a'}`,
      `pos=${pos ? `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}` : 'n/a'}`,
      `runtime=${window.NeonBlockGame ? 'ready' : 'missing'}`,
      `schedulerActive=${diagnostics.schedulerActive}`,
      `storageReadFailures=${diagnostics.storageReadFailures}`,
      `storageWriteFailures=${diagnostics.storageWriteFailures}`
    ];
    return lines.join('\n');
  }

  function stopScheduler() {
    if (timer) clearTimeout(timer);
    timer = 0;
    diagnostics.schedulerActive = false;
  }

  function scheduleNext() {
    stopScheduler();
    if (document.hidden) return;
    diagnostics.schedulerActive = true;
    timer = setTimeout(runTick, TICK_MS);
  }

  function runTick() {
    timer = 0;
    if (document.hidden) {
      diagnostics.schedulerActive = false;
      return;
    }
    trackMovement();
    if (panel && !panel.classList.contains('hidden')) render();
    scheduleNext();
  }

  function refresh() {
    lastPos = null;
    trackMovement();
    if (panel && !panel.classList.contains('hidden')) render();
    scheduleNext();
  }

  function saveNow() {
    saveState();
    lastReport = lastReport || buildReport();
    writeStorage(REPORT_KEY, lastReport);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      saveNow();
      lastPos = null;
      stopScheduler();
      return;
    }
    refresh();
  }

  function boot() {
    ensurePanel();
    ensureMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && event.shiftKey && !event.repeat) {
        event.preventDefault();
        togglePanel();
      }
    }, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    addEventListener('pagehide', () => {
      saveNow();
      stopScheduler();
    });
    setTimeout(() => {
      render();
      scheduleNext();
    }, 500);
  }

  window.NeonBlockDeliveryBoard = Object.freeze({
    getStatus: () => ({
      ...diagnostics,
      hidden: document.hidden,
      panelOpen: Boolean(panel && !panel.classList.contains('hidden')),
      activeContract: currentContract().id,
      progress: progressOf(),
      totalWalk: state.totalWalk,
      totalDrive: state.totalDrive
    }),
    refresh,
    saveNow
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
