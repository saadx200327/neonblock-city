(() => {
  'use strict';

  const STORE = 'neonblock:feedback:v1';
  const DEFAULTS = { sound: false, haptics: true, prompts: true };
  const $ = (id) => document.getElementById(id);
  const readPrefs = () => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  };
  const writePrefs = () => localStorage.setItem(STORE, JSON.stringify(prefs));
  let prefs = readPrefs();
  let audioContext = null;
  let lastCash = null;
  let lastXp = null;
  let lastVehicle = null;
  let lastSavedAt = 0;

  function ensureStyles() {
    if (document.getElementById('neonblock-feedback-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-feedback-style';
    style.textContent = `
      #feedback-hint {
        position: fixed;
        left: 50%;
        bottom: calc(112px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        z-index: 12;
        max-width: min(92vw, 520px);
        padding: 10px 14px;
        border: 1px solid rgba(23, 243, 255, .28);
        border-radius: 999px;
        color: #eaffff;
        background: rgba(5, 8, 20, .78);
        box-shadow: 0 0 24px rgba(23, 243, 255, .14);
        font: 700 13px/1.25 system-ui, -apple-system, Segoe UI, sans-serif;
        text-align: center;
        pointer-events: none;
        opacity: .94;
        transition: opacity .18s ease, transform .18s ease;
      }
      #feedback-hint.hidden { opacity: 0; transform: translate(-50%, 8px); }
      #feedback-panel {
        position: fixed;
        right: calc(14px + env(safe-area-inset-right, 0px));
        bottom: calc(14px + env(safe-area-inset-bottom, 0px));
        z-index: 13;
        display: grid;
        gap: 6px;
        min-width: 174px;
        padding: 10px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 14px;
        color: #eaffff;
        background: rgba(5, 8, 20, .72);
        backdrop-filter: blur(10px);
        font: 700 12px/1.25 system-ui, -apple-system, Segoe UI, sans-serif;
      }
      #feedback-panel .feedback-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      #feedback-panel button {
        border: 1px solid rgba(23, 243, 255, .28);
        border-radius: 999px;
        color: #eaffff;
        background: rgba(23, 243, 255, .12);
        padding: 6px 8px;
        font: inherit;
      }
      #feedback-panel button[aria-pressed="true"] { background: rgba(94, 243, 140, .2); border-color: rgba(94, 243, 140, .55); }
      @media (max-width: 720px) {
        #feedback-panel { left: 10px; right: auto; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); min-width: 150px; }
        #feedback-hint { bottom: calc(170px + env(safe-area-inset-bottom, 0px)); }
      }
    `;
    document.head.appendChild(style);
  }

  function makePanel() {
    let hint = $('feedback-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'feedback-hint';
      hint.className = 'hidden';
      hint.setAttribute('role', 'status');
      hint.setAttribute('aria-live', 'polite');
      document.body.appendChild(hint);
    }
    let panel = $('feedback-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'feedback-panel';
      panel.innerHTML = `
        <div id="feedback-save">Save: waiting</div>
        <div id="feedback-distance">Waypoint: --</div>
        <div class="feedback-actions">
          <button id="feedback-toggle-prompts" type="button">Prompts</button>
          <button id="feedback-toggle-sound" type="button">Sound</button>
          <button id="feedback-toggle-haptics" type="button">Haptics</button>
        </div>`;
      document.body.appendChild(panel);
    }
    syncButtons();
  }

  function syncButtons() {
    const toggles = [
      ['feedback-toggle-prompts', 'prompts'],
      ['feedback-toggle-sound', 'sound'],
      ['feedback-toggle-haptics', 'haptics']
    ];
    toggles.forEach(([id, key]) => {
      const btn = $(id);
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(!!prefs[key]));
      btn.textContent = `${key[0].toUpperCase()}${key.slice(1)} ${prefs[key] ? 'On' : 'Off'}`;
    });
  }

  function beep(freq = 520, ms = 70) {
    if (!prefs.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + ms / 1000);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + ms / 1000 + 0.02);
    } catch {}
  }

  function pulse(pattern = 18) {
    if (prefs.haptics && navigator.vibrate) navigator.vibrate(pattern);
  }

  function getSnapshot() {
    try { return window.NeonBlockGame?.getSnapshot?.() || null; }
    catch { return null; }
  }

  function numberFromText(id) {
    const el = $(id);
    if (!el) return null;
    const n = Number(String(el.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function setHint(text, important = false) {
    const hint = $('feedback-hint');
    if (!hint) return;
    if (!prefs.prompts && !important) {
      hint.classList.add('hidden');
      return;
    }
    hint.textContent = text;
    hint.classList.toggle('hidden', !text);
  }

  function trackRewards() {
    const cash = numberFromText('hud-cash');
    const xp = numberFromText('hud-xp');
    if (lastCash !== null && cash !== null && cash > lastCash) { beep(660, 70); pulse(20); }
    if (lastXp !== null && xp !== null && xp > lastXp) beep(780, 55);
    lastCash = cash;
    lastXp = xp;
  }

  function trackVehicle(snapshot) {
    const current = snapshot?.player?.activeVehicle?.userData?.id || null;
    if (lastVehicle !== null && current !== lastVehicle) { beep(current ? 440 : 330, 80); pulse(current ? [16, 24, 16] : 18); }
    lastVehicle = current;
  }

  function trackSave() {
    let latest = 0;
    for (const key of ['neonblock:slot1', 'neonblock:slot2', 'neonblock:last-good']) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed?.at) latest = Math.max(latest, parsed.at);
      } catch {}
    }
    const label = $('feedback-save');
    if (!label) return;
    if (!latest) {
      label.textContent = 'Save: waiting';
      return;
    }
    lastSavedAt = latest;
    const seconds = Math.max(0, Math.floor((Date.now() - latest) / 1000));
    label.textContent = seconds < 3 ? 'Save: just now' : `Save: ${seconds}s ago`;
  }

  function trackWaypoint(snapshot) {
    const distanceEl = $('feedback-distance');
    const missionEl = $('hud-mission');
    if (!snapshot?.player?.mesh?.position || !distanceEl) return;
    const text = missionEl?.textContent || 'Mission';
    const pos = snapshot.player.mesh.position;
    const vehicles = snapshot.vehicles || 0;
    const crates = snapshot.crates || 0;
    const lots = snapshot.lots || 0;
    const vehicle = snapshot.player.activeVehicle;
    const gas = vehicle?.userData?.gas ?? null;
    let hint = '';
    if (gas !== null && gas <= 12) hint = 'Low gas: press R or tap Refuel if you have cash.';
    else if (crates > 0) hint = 'Crate nearby: move close and press E / Interact.';
    else if (lots > 0) hint = 'Property nearby: purple lots can be bought with Interact.';
    else if (vehicles > 0 && !vehicle) hint = 'Vehicle nearby: press E / Interact to drive.';
    else hint = `${text}: follow the arrow or open Missions with M.`;
    setHint(hint);
    const px = Number(pos.x || 0);
    const pz = Number(pos.z || 0);
    const approx = Math.round(Math.hypot(px, pz));
    distanceEl.textContent = vehicle ? `Drive: gas ${Math.floor(gas ?? 0)}%` : `City distance: ${approx}m`;
  }

  function wire() {
    document.addEventListener('click', (event) => {
      const id = event.target?.id;
      const map = {
        'feedback-toggle-prompts': 'prompts',
        'feedback-toggle-sound': 'sound',
        'feedback-toggle-haptics': 'haptics'
      };
      const key = map[id];
      if (!key) return;
      prefs[key] = !prefs[key];
      writePrefs();
      syncButtons();
      if (key === 'sound' && prefs.sound) beep(720, 90);
      if (key === 'haptics' && prefs.haptics) pulse([20, 20, 20]);
    });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyF' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const panel = $('feedback-panel');
        if (panel) panel.hidden = !panel.hidden;
      }
    });
  }

  function loop() {
    const snapshot = getSnapshot();
    trackRewards();
    trackVehicle(snapshot);
    trackSave();
    trackWaypoint(snapshot);
    requestAnimationFrame(loop);
  }

  function start() {
    ensureStyles();
    makePanel();
    wire();
    setHint('Feedback HUD ready • F hides this panel', true);
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
