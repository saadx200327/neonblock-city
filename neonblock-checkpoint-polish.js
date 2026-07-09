(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:checkpoint-polish:v1';
  const REPORT_KEY = 'neonblock:checkpoint-report';
  const AUTO_MS = 20000;
  const MIN_MOVE = 16;
  const RETURN_COST = 25;
  const $ = (id) => document.getElementById(id);

  const state = loadState();
  let panel;
  let lastAutoAt = 0;
  let lastHint = '';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.checkpoints)) return parsed;
      }
    } catch (_) {}
    return { checkpoints: [], returns: 0, manualMarks: 0, lastReport: null };
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function game() {
    return window.NeonBlockGame;
  }

  function snapshot() {
    try { return game()?.getSnapshot?.() || null; } catch (_) { return null; }
  }

  function playerFromSnap(snap = snapshot()) {
    return snap?.player || null;
  }

  function playerPos(snap = snapshot()) {
    const player = playerFromSnap(snap);
    const pos = player?.mesh?.position;
    if (!pos) return null;
    return { x: Number(pos.x) || 0, y: Number(pos.y) || 1, z: Number(pos.z) || 0 };
  }

  function activeMissionTitle(snap = snapshot()) {
    const text = document.getElementById('hud-mission')?.textContent?.trim();
    return text || 'Unknown';
  }

  function vehicleName(snap = snapshot()) {
    return snap?.player?.activeVehicle?.userData?.name || 'On foot';
  }

  function finitePos(pos) {
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z);
  }

  function dist(a, b) {
    if (!finitePos(a) || !finitePos(b)) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function formatPos(pos) {
    if (!finitePos(pos)) return 'unknown';
    return `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
  }

  function safeGround(pos) {
    return {
      x: clamp(Number(pos?.x) || 0, -900, 900),
      y: Math.max(1.25, Math.min(Number(pos?.y) || 1.25, 12)),
      z: clamp(Number(pos?.z) || 0, -900, 900)
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toast(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => popup.classList.add('hidden'), 1700);
  }

  function shouldMark(pos, now) {
    const latest = state.checkpoints[0];
    if (!finitePos(pos) || pos.y < 0.7 || Math.abs(pos.x) > 1000 || Math.abs(pos.z) > 1000) return false;
    if (!latest) return true;
    return now - lastAutoAt > AUTO_MS && dist(pos, latest.pos) >= MIN_MOVE;
  }

  function markCheckpoint(source = 'manual') {
    const snap = snapshot();
    const pos = playerPos(snap);
    if (!finitePos(pos)) return false;
    const checkpoint = {
      id: `cp-${Date.now()}`,
      at: Date.now(),
      source,
      pos: safeGround(pos),
      mission: activeMissionTitle(snap),
      vehicle: vehicleName(snap),
      cash: Math.floor(playerFromSnap(snap)?.cash || 0)
    };
    state.checkpoints.unshift(checkpoint);
    state.checkpoints = state.checkpoints.slice(0, 8);
    if (source === 'manual') state.manualMarks += 1;
    lastAutoAt = Date.now();
    persist();
    game()?.saveState?.();
    render();
    return checkpoint;
  }

  function returnToCheckpoint(index = 0) {
    const checkpoint = state.checkpoints[index];
    const snap = snapshot();
    const player = playerFromSnap(snap);
    if (!checkpoint || !player?.mesh?.position) return toast('No checkpoint saved yet');
    const cash = Number(player.cash) || 0;
    if (cash < RETURN_COST) return toast(`Need $${RETURN_COST} for checkpoint return`);
    const pos = safeGround(checkpoint.pos);
    player.cash = Math.max(0, cash - RETURN_COST);
    player.mesh.position.set(pos.x, pos.y, pos.z);
    player.vel?.set?.(0, 0, 0);
    if (player.activeVehicle?.position) {
      player.activeVehicle.position.set(pos.x + 2, 0.65, pos.z + 2);
      player.activeVehicle.userData.gas = Math.max(player.activeVehicle.userData.gas || 0, 12);
    }
    state.returns += 1;
    persist();
    game()?.saveState?.();
    toast('Returned to checkpoint');
    render();
  }

  function bestHint() {
    const snap = snapshot();
    const pos = playerPos(snap);
    const latest = state.checkpoints[0];
    if (!snap) return 'Waiting for game runtime...';
    if (!latest) return 'Mark a checkpoint before a risky drive or mission run.';
    if (dist(pos, latest.pos) > 160) return 'You are far from the last safe checkpoint. Keep one return ready.';
    if (vehicleName(snap) !== 'On foot') return 'Driving: checkpoint return will also pull your active vehicle nearby.';
    if (activeMissionTitle(snap) && activeMissionTitle(snap) !== 'None') return 'Checkpoint is ready if the mission route glitches or you fall out of bounds.';
    return 'Checkpoint ready. Use it as a safe rollback before exploring farther.';
  }

  function createPanel() {
    panel = document.createElement('aside');
    panel.id = 'checkpoint-polish-panel';
    panel.innerHTML = `
      <style>
        #checkpoint-polish-panel{position:fixed;left:12px;bottom:92px;z-index:35;width:min(330px,calc(100vw - 24px));padding:12px;border:1px solid rgba(23,243,255,.32);border-radius:16px;background:rgba(5,8,20,.9);color:#e9fbff;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 0 28px rgba(23,243,255,.13);backdrop-filter:blur(12px)}
        #checkpoint-polish-panel.hidden{display:none}
        #checkpoint-polish-panel h3{margin:0 0 8px;font-size:15px;color:#17f3ff}
        #checkpoint-polish-panel .cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
        #checkpoint-polish-panel button{border:0;border-radius:999px;padding:8px 9px;background:#17f3ff;color:#06101c;font-weight:800;cursor:pointer}
        #checkpoint-polish-panel button.secondary{background:#25314f;color:#e9fbff}
        #checkpoint-polish-panel ol{margin:8px 0 0 18px;padding:0;max-height:110px;overflow:auto}
        #checkpoint-polish-panel li{margin:4px 0;color:#b9d7e8}
        #checkpoint-polish-panel .muted{color:#9bb3c4}
        @media(max-width:760px){#checkpoint-polish-panel{left:8px;right:8px;bottom:84px;width:auto;font-size:12px}.checkpoint-mobile-btn{font-size:12px!important}}
      </style>
      <h3>Checkpoint Return <span class="muted">[4]</span></h3>
      <div id="cp-status">Loading checkpoint state...</div>
      <div class="cp-grid">
        <button id="cp-mark">Mark Safe Spot</button>
        <button id="cp-return">Return $${RETURN_COST}</button>
        <button id="cp-save" class="secondary">Quick Save</button>
        <button id="cp-copy" class="secondary">Copy QA</button>
      </div>
      <div id="cp-hint" class="muted"></div>
      <ol id="cp-list"></ol>
    `;
    document.body.appendChild(panel);
    $('cp-mark')?.addEventListener('click', () => { if (markCheckpoint('manual')) toast('Checkpoint marked'); });
    $('cp-return')?.addEventListener('click', () => returnToCheckpoint(0));
    $('cp-save')?.addEventListener('click', () => { game()?.saveState?.(); toast('Checkpoint quick save'); });
    $('cp-copy')?.addEventListener('click', copyReport);
  }

  function addMobileButton() {
    const rail = $('action-rail');
    if (!rail || $('btn-mobile-checkpoint')) return;
    const button = document.createElement('button');
    button.id = 'btn-mobile-checkpoint';
    button.className = 'action-btn checkpoint-mobile-btn';
    button.textContent = 'Check';
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); togglePanel(); });
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel(force) {
    if (!panel) return;
    const shouldHide = typeof force === 'boolean' ? !force : !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', shouldHide);
    render();
  }

  function render() {
    if (!panel) return;
    const snap = snapshot();
    const pos = playerPos(snap);
    const latest = state.checkpoints[0];
    const status = $('cp-status');
    const list = $('cp-list');
    const hint = $('cp-hint');
    if (status) {
      status.innerHTML = [
        `Position: <b>${formatPos(pos)}</b>`,
        `Latest: <b>${latest ? formatPos(latest.pos) : 'none'}</b>`,
        `Returns: <b>${state.returns}</b> • Marks: <b>${state.manualMarks}</b>`
      ].join('<br>');
    }
    lastHint = bestHint();
    if (hint) hint.textContent = lastHint;
    if (list) {
      list.innerHTML = state.checkpoints.map((cp, index) => {
        const age = Math.max(0, Math.round((Date.now() - cp.at) / 1000));
        return `<li><button class="secondary" data-cp="${index}">Return</button> ${cp.source} • ${age}s ago • ${cp.mission} • ${formatPos(cp.pos)}</li>`;
      }).join('') || '<li>No checkpoints yet.</li>';
      list.querySelectorAll('[data-cp]').forEach((button) => {
        button.addEventListener('click', () => returnToCheckpoint(Number(button.dataset.cp) || 0));
      });
    }
  }

  function buildReport() {
    const snap = snapshot();
    const report = {
      at: new Date().toISOString(),
      position: playerPos(snap),
      mission: activeMissionTitle(snap),
      vehicle: vehicleName(snap),
      checkpoints: state.checkpoints.length,
      latestCheckpoint: state.checkpoints[0] || null,
      returns: state.returns,
      manualMarks: state.manualMarks,
      hint: lastHint || bestHint(),
      chunks: snap?.chunks ?? null,
      vehiclesStreamed: snap?.vehicles ?? null,
      cratesStreamed: snap?.crates ?? null,
      lotsStreamed: snap?.lots ?? null
    };
    state.lastReport = report;
    try { localStorage.setItem(REPORT_KEY, JSON.stringify(report, null, 2)); } catch (_) {}
    persist();
    return report;
  }

  async function copyReport() {
    const text = JSON.stringify(buildReport(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('Checkpoint QA copied');
    } catch (_) {
      console.log('[NeonBlock Checkpoint QA]', text);
      toast('Checkpoint QA logged');
    }
  }

  function loop(now) {
    const pos = playerPos();
    if (shouldMark(pos, now)) markCheckpoint('auto');
    render();
    setTimeout(() => requestAnimationFrame(loop), 1500);
  }

  addEventListener('keydown', (event) => {
    if (event.code === 'Digit4' && !event.metaKey && !event.ctrlKey && !event.altKey) togglePanel();
  });

  addEventListener('pagehide', () => {
    buildReport();
    if (state.checkpoints.length) game()?.saveState?.();
  });

  function boot() {
    createPanel();
    addMobileButton();
    panel.classList.add('hidden');
    if (!state.checkpoints.length) markCheckpoint('startup');
    render();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
