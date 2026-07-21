(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:onboarding:v1';
  const HIDDEN_KEY = 'neonblock:onboarding:hidden';
  const STYLE_ID = 'neonblock-onboarding-style';

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const steps = [
    {
      id: 'move',
      label: 'Move around',
      hint: 'Use WASD/arrows on desktop or the joystick on mobile until your travel stat changes.',
      done: (snap, progress) => progress.lastDistance > 2 || progress.totalDistance > 8
    },
    {
      id: 'mission',
      label: 'Track a mission',
      hint: 'Press M or open Pause > Missions, then choose Courier, Collector, Owner, or Driver.',
      done: (snap) => Boolean(snap?.player && snap.player.activeMission) || Boolean(document.getElementById('hud-mission')?.textContent?.trim() && document.getElementById('hud-mission')?.textContent !== 'None')
    },
    {
      id: 'interact',
      label: 'Use Interact',
      hint: 'Walk near a crate, vehicle, NPC, or purple lot, then press E or the Interact button.',
      done: (snap, progress) => progress.interactPressed || progress.cashChanged || progress.xpChanged
    },
    {
      id: 'vehicle',
      label: 'Try a vehicle',
      hint: 'Find a car, press Interact to enter, use X/Space to brake, and Interact again to exit.',
      done: (snap) => Boolean(snap?.player?.activeVehicle)
    },
    {
      id: 'save',
      label: 'Confirm saving',
      hint: 'Press Ctrl/Cmd+S, use Pause > Save Game, or wait for autosave. Local saves work without Firebase.',
      done: () => Boolean(localStorage.getItem('neonblock:slot1') || localStorage.getItem('neonblock:slot2') || localStorage.getItem('neonblock:latest-good-save'))
    }
  ];

  const state = loadState();
  const progress = {
    lastPosition: null,
    lastCash: null,
    lastXp: null,
    lastDistance: 0,
    totalDistance: Number(state.totalDistance || 0),
    interactPressed: Boolean(state.interactPressed),
    cashChanged: Boolean(state.cashChanged),
    xpChanged: Boolean(state.xpChanged)
  };

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveState(next = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ...next, updatedAt: Date.now() }));
    } catch {
      // localStorage may be blocked/full; onboarding should never block play.
    }
  }

  function injectStyle() {
    if ($(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #neonblock-onboarding-panel {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: calc(132px + env(safe-area-inset-bottom));
        z-index: 44;
        width: min(340px, calc(100vw - 24px));
        padding: 12px;
        border: 1px solid rgba(23, 243, 255, 0.32);
        border-radius: 16px;
        background: rgba(5, 8, 20, 0.82);
        color: #e9fbff;
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(10px);
      }
      #neonblock-onboarding-panel.hidden { display: none; }
      .neonblock-onboarding-head { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:8px; }
      .neonblock-onboarding-title { font-weight:800; letter-spacing:0.03em; color:#17f3ff; }
      .neonblock-onboarding-close,
      .neonblock-onboarding-reset,
      .neonblock-onboarding-copy {
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        color: #e9fbff;
        padding: 6px 9px;
        min-height: 34px;
        cursor: pointer;
      }
      .neonblock-onboarding-meter { height: 8px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,0.11); margin:8px 0; }
      .neonblock-onboarding-fill { height:100%; width:0%; border-radius:999px; background:linear-gradient(90deg, #17f3ff, #9c6cff); transition:width 180ms ease; }
      .neonblock-onboarding-steps { list-style:none; margin:8px 0; padding:0; display:grid; gap:6px; }
      .neonblock-onboarding-step { display:grid; grid-template-columns:24px 1fr; gap:8px; align-items:start; padding:7px; border-radius:12px; background:rgba(255,255,255,0.055); }
      .neonblock-onboarding-step.done { background:rgba(94,243,140,0.12); }
      .neonblock-onboarding-check { width:20px; height:20px; border-radius:999px; display:grid; place-items:center; background:rgba(255,255,255,0.12); color:#ffffff; font-size:12px; }
      .neonblock-onboarding-step.done .neonblock-onboarding-check { background:rgba(94,243,140,0.85); color:#05100a; }
      .neonblock-onboarding-label { font-weight:700; }
      .neonblock-onboarding-hint { opacity:0.82; font-size:12px; margin-top:2px; }
      .neonblock-onboarding-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
      @media (max-width: 720px) {
        #neonblock-onboarding-panel { bottom: calc(176px + env(safe-area-inset-bottom)); font-size:12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    injectStyle();
    const panel = document.createElement('section');
    panel.id = 'neonblock-onboarding-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="neonblock-onboarding-head">
        <div>
          <div class="neonblock-onboarding-title">Starter Guide</div>
          <div id="neonblock-onboarding-sub">Learn the city loop without leaving the game.</div>
        </div>
        <button class="neonblock-onboarding-close" type="button" title="Hide starter guide">?</button>
      </div>
      <div class="neonblock-onboarding-meter"><div class="neonblock-onboarding-fill"></div></div>
      <ul class="neonblock-onboarding-steps"></ul>
      <div class="neonblock-onboarding-actions">
        <button class="neonblock-onboarding-reset" type="button">Reset guide</button>
        <button class="neonblock-onboarding-copy" type="button">Copy tutorial report</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.neonblock-onboarding-close').addEventListener('click', () => togglePanel());
    panel.querySelector('.neonblock-onboarding-reset').addEventListener('click', resetGuide);
    panel.querySelector('.neonblock-onboarding-copy').addEventListener('click', copyReport);
    if (localStorage.getItem(HIDDEN_KEY) === '1') panel.classList.add('hidden');
    return panel;
  }

  function getSnapshot() {
    try {
      return window.NeonBlockGame?.getSnapshot?.() || null;
    } catch {
      return null;
    }
  }

  function readPosition(snap) {
    const pos = snap?.player?.mesh?.position;
    if (!pos) return null;
    return { x: Number(pos.x) || 0, y: Number(pos.y) || 0, z: Number(pos.z) || 0 };
  }

  function updateProgressFromSnapshot(snap) {
    const pos = readPosition(snap);
    if (pos && progress.lastPosition) {
      const dx = pos.x - progress.lastPosition.x;
      const dz = pos.z - progress.lastPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0 && distance < 20) {
        progress.lastDistance = distance;
        progress.totalDistance += distance;
      }
    }
    if (pos) progress.lastPosition = pos;

    const cash = Number(snap?.player?.cash);
    const xp = Number(snap?.player?.xp);
    if (Number.isFinite(cash)) {
      if (progress.lastCash !== null && cash !== progress.lastCash) progress.cashChanged = true;
      progress.lastCash = cash;
    }
    if (Number.isFinite(xp)) {
      if (progress.lastXp !== null && xp !== progress.lastXp) progress.xpChanged = true;
      progress.lastXp = xp;
    }

    saveState({
      totalDistance: Math.round(progress.totalDistance),
      interactPressed: progress.interactPressed,
      cashChanged: progress.cashChanged,
      xpChanged: progress.xpChanged
    });
  }

  function render(panel) {
    const snap = getSnapshot();
    updateProgressFromSnapshot(snap);
    const completed = steps.filter((step) => step.done(snap, progress));
    const percent = Math.round((completed.length / steps.length) * 100);
    panel.querySelector('.neonblock-onboarding-fill').style.width = `${percent}%`;
    panel.querySelector('#neonblock-onboarding-sub').textContent = completed.length === steps.length
      ? 'Starter loop complete. Keep exploring missions, vehicles, ownership, and saves.'
      : `${completed.length}/${steps.length} starter steps complete. Press ? to hide/show.`;
    panel.querySelector('.neonblock-onboarding-steps').innerHTML = steps.map((step) => {
      const done = step.done(snap, progress);
      return `<li class="neonblock-onboarding-step ${done ? 'done' : ''}">
        <span class="neonblock-onboarding-check">${done ? '✓' : '•'}</span>
        <span><span class="neonblock-onboarding-label">${step.label}</span><span class="neonblock-onboarding-hint">${step.hint}</span></span>
      </li>`;
    }).join('');
  }

  function togglePanel(force) {
    const panel = $('neonblock-onboarding-panel') || createPanel();
    const shouldHide = typeof force === 'boolean' ? force : !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', shouldHide);
    try { localStorage.setItem(HIDDEN_KEY, shouldHide ? '1' : '0'); } catch {}
  }

  function resetGuide() {
    progress.lastPosition = null;
    progress.lastCash = null;
    progress.lastXp = null;
    progress.lastDistance = 0;
    progress.totalDistance = 0;
    progress.interactPressed = false;
    progress.cashChanged = false;
    progress.xpChanged = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    render($('neonblock-onboarding-panel'));
  }

  function copyReport() {
    const snap = getSnapshot();
    const complete = steps.filter((step) => step.done(snap, progress)).map((step) => step.id);
    const report = {
      feature: 'NeonBlock starter guide',
      completedSteps: complete,
      totalSteps: steps.length,
      travel: Math.round(progress.totalDistance),
      cash: snap?.player?.cash ?? null,
      xp: snap?.player?.xp ?? null,
      chunks: snap?.chunks ?? null,
      vehicles: snap?.vehicles ?? null,
      lots: snap?.lots ?? null,
      savedAt: new Date().toISOString()
    };
    const text = JSON.stringify(report, null, 2);
    navigator.clipboard?.writeText(text).catch(() => {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Slash' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      togglePanel();
    }
    if (event.code === 'KeyE') {
      progress.interactPressed = true;
      saveState({ interactPressed: true });
    }
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (event.target?.id === 'btn-mobile-interact') {
      progress.interactPressed = true;
      saveState({ interactPressed: true });
    }
  }, true);

  function boot() {
    const panel = createPanel();
    render(panel);
    setInterval(() => {
      const current = $('neonblock-onboarding-panel');
      if (current) render(current);
    }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
