(() => {
  'use strict';

  const STORE_KEY = 'neonblock:controlsCoach';
  const LAST_REPORT_KEY = 'neonblock:controlsCoach:lastReport';
  const MOVEMENT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyR', 'KeyU', 'KeyX'];
  const state = loadState();
  let lastPos = null;
  let totalTravel = Number(state.totalTravel || 0);
  let lastInput = state.lastInput || 'none yet';
  let lastResetAt = Number(state.lastResetAt || 0);
  let copiedAt = 0;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ totalTravel, lastInput, lastResetAt, hidden: panel?.classList.contains('hidden') || false }));
    } catch (_) {}
  }

  function $(id) { return document.getElementById(id); }

  function snapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; } catch (_) { return null; }
  }

  function playerPosition(snap) {
    const pos = snap?.player?.mesh?.position;
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z) ? pos : null;
  }

  function addStyle() {
    if ($('neonblock-controls-coach-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-controls-coach-style';
    style.textContent = `
      #controls-coach-panel{position:fixed;left:calc(12px + env(safe-area-inset-left));bottom:calc(12px + env(safe-area-inset-bottom));z-index:43;width:min(330px,calc(100vw - 24px));padding:12px;border:1px solid rgba(23,243,255,.32);border-radius:16px;background:rgba(5,8,20,.84);box-shadow:0 12px 34px rgba(0,0,0,.38);backdrop-filter:blur(12px);color:#effcff;font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #controls-coach-panel.hidden{display:none!important}
      #controls-coach-panel h3{margin:0 0 7px;font-size:14px;color:#17f3ff;letter-spacing:.04em;text-transform:uppercase}
      #controls-coach-panel .coach-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
      #controls-coach-panel .coach-card{padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.055)}
      #controls-coach-panel .coach-label{display:block;color:#9fb7d7;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      #controls-coach-panel .coach-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      #controls-coach-panel button,.controls-coach-mobile-btn{border:1px solid rgba(23,243,255,.35);background:rgba(23,243,255,.12);color:#effcff;border-radius:999px;padding:8px 10px;font-weight:700;touch-action:manipulation}
      #controls-coach-panel .coach-tip{margin-top:7px;color:#d9e8ff;font-size:12px}
      .controls-coach-mobile-btn{position:fixed;left:calc(20px + env(safe-area-inset-left));bottom:calc(190px + env(safe-area-inset-bottom));z-index:42;display:none}
      @media (pointer:coarse){.controls-coach-mobile-btn{display:block}#controls-coach-panel{bottom:calc(82px + env(safe-area-inset-bottom));font-size:12px}}
    `;
    document.head.appendChild(style);
  }

  function makePanel() {
    addStyle();
    const el = document.createElement('section');
    el.id = 'controls-coach-panel';
    el.className = state.hidden ? 'hidden' : '';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <h3>Controls Coach <span style="float:right;color:#9fb7d7">,</span></h3>
      <div class="coach-grid">
        <div class="coach-card"><span class="coach-label">Last input</span><strong id="coach-last-input">none</strong></div>
        <div class="coach-card"><span class="coach-label">Travel this run</span><strong id="coach-travel">0m</strong></div>
        <div class="coach-card"><span class="coach-label">Mode</span><strong id="coach-mode">on foot</strong></div>
        <div class="coach-card"><span class="coach-label">Input health</span><strong id="coach-health">ready</strong></div>
      </div>
      <div class="coach-tip" id="coach-tip">Desktop: WASD/arrows move, E interact, Shift sprint. Mobile: use joystick + action buttons.</div>
      <div class="coach-actions">
        <button id="coach-reset-inputs" type="button">Reset stuck inputs</button>
        <button id="coach-quick-save" type="button">Quick save</button>
        <button id="coach-copy-report" type="button">Copy report</button>
        <button id="coach-hide" type="button">Hide</button>
      </div>
    `;
    document.body.appendChild(el);

    const mobile = document.createElement('button');
    mobile.id = 'controls-coach-mobile-toggle';
    mobile.className = 'controls-coach-mobile-btn';
    mobile.type = 'button';
    mobile.textContent = 'Controls';
    mobile.addEventListener('click', togglePanel);
    document.body.appendChild(mobile);

    $('coach-hide')?.addEventListener('click', () => { el.classList.add('hidden'); saveState(); });
    $('coach-reset-inputs')?.addEventListener('click', () => { resetInputs('manual reset'); });
    $('coach-quick-save')?.addEventListener('click', () => {
      try { window.NeonBlockGame?.saveState?.(); noteInput('quick save'); flashTip('Saved current slot locally.'); }
      catch (e) { flashTip(`Save failed: ${e.message || e}`); }
    });
    $('coach-copy-report')?.addEventListener('click', copyReport);
    return el;
  }

  const panel = makePanel();

  function togglePanel() {
    panel.classList.toggle('hidden');
    saveState();
  }

  function noteInput(label) {
    lastInput = `${label} @ ${new Date().toLocaleTimeString()}`;
    saveState();
  }

  function resetInputs(reason) {
    MOVEMENT_KEYS.forEach((code) => {
      try { window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); } catch (_) {}
    });
    try { window.dispatchEvent(new Event('blur')); } catch (_) {}
    lastResetAt = Date.now();
    noteInput(reason);
    flashTip('Input reset sent. If movement was stuck, release keys/touch and continue.');
  }

  function flashTip(text) {
    const tip = $('coach-tip');
    if (!tip) return;
    tip.textContent = text;
    clearTimeout(flashTip.timer);
    flashTip.timer = setTimeout(() => { tip.textContent = buildTip(); }, 2200);
  }

  function buildTip() {
    const snap = snapshot();
    if (snap?.player?.activeVehicle) return 'Vehicle: W/joystick drives, X or Space brakes, E exits, R refuels when available.';
    if ((snap?.crates || 0) > 0) return 'Find yellow crates, stand close, then press E or Interact for cash and XP.';
    if ((snap?.lots || 0) > 0) return 'Purple lots can be bought with Interact when you have enough cash.';
    return 'Desktop: WASD/arrows move, E interact, Shift sprint. Mobile: use joystick + action buttons.';
  }

  function copyReport() {
    const snap = snapshot();
    const report = {
      at: new Date().toISOString(),
      lastInput,
      totalTravel: Math.round(totalTravel),
      activeVehicle: snap?.player?.activeVehicle?.userData?.name || null,
      chunks: snap?.chunks ?? null,
      vehicles: snap?.vehicles ?? null,
      crates: snap?.crates ?? null,
      lots: snap?.lots ?? null,
      graphics: snap?.graphics?.quality || null,
      lastResetAt: lastResetAt ? new Date(lastResetAt).toISOString() : null
    };
    const text = `NeonBlock Controls Coach Report\n${JSON.stringify(report, null, 2)}`;
    localStorage.setItem(LAST_REPORT_KEY, text);
    copiedAt = Date.now();
    navigator.clipboard?.writeText(text).then(() => flashTip('Controls report copied.')).catch(() => flashTip('Report saved locally; clipboard blocked.'));
  }

  function updateTravel() {
    const pos = playerPosition(snapshot());
    if (!pos) return;
    if (lastPos) {
      const dx = pos.x - lastPos.x;
      const dz = pos.z - lastPos.z;
      const step = Math.hypot(dx, dz);
      if (Number.isFinite(step) && step > 0.02 && step < 25) totalTravel += step;
    }
    lastPos = { x: pos.x, y: pos.y, z: pos.z };
  }

  function render() {
    updateTravel();
    const snap = snapshot();
    const mode = snap?.player?.activeVehicle?.userData?.name || 'On foot';
    const health = document.hidden ? 'tab hidden' : (Date.now() - lastResetAt < 2500 ? 'reset sent' : 'ready');
    const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    setText('coach-last-input', lastInput);
    setText('coach-travel', `${Math.round(totalTravel)}m`);
    setText('coach-mode', mode);
    setText('coach-health', health);
    if (Date.now() - copiedAt > 2200) {
      const tip = $('coach-tip');
      if (tip) tip.textContent = buildTip();
    }
    saveState();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Comma') { e.preventDefault(); togglePanel(); return; }
    if (MOVEMENT_KEYS.includes(e.code)) noteInput(e.code);
  }, { passive: false });
  window.addEventListener('pointerdown', (e) => {
    const id = e.target?.id || '';
    if (id.includes('mobile') || id.includes('joystick')) noteInput(id || 'touch control');
  }, { passive: true });
  window.addEventListener('blur', () => resetInputs('window blur'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInputs('tab hidden'); });
  window.addEventListener('pagehide', () => { try { window.NeonBlockGame?.saveState?.(); } catch (_) {} saveState(); });

  setInterval(render, 700);
  render();
})();
