(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:play-settings';
  const REPORT_KEY = 'neonblock:play-settings-report';
  const DEFAULTS = {
    hudScale: 1,
    touchScale: 1,
    reduceMotion: false,
    stickyHud: true,
    confirmBeforeImport: true,
    lastQuickSaveAt: 0
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function readSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  let settings = readSettings();
  let panel;

  function writeSettings(extra = {}) {
    settings = { ...settings, ...extra };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applySettings();
    return settings;
  }

  function snapshot() {
    try {
      return window.NeonBlockGame?.getSnapshot?.() || null;
    } catch (error) {
      return { error: error.message };
    }
  }

  function saveReport(action = 'settings-check') {
    const game = snapshot();
    const report = {
      action,
      at: new Date().toISOString(),
      settings: { ...settings },
      runtime: game ? {
        cash: Math.floor(game.player?.cash || 0),
        xp: Math.floor(game.player?.xp || 0),
        level: game.player?.level || 1,
        vehicle: game.player?.activeVehicle?.userData?.name || 'On foot',
        chunks: game.chunks || 0,
        vehicles: game.vehicles || 0,
        crates: game.crates || 0,
        lots: game.lots || 0,
        graphics: game.graphics?.quality || 'auto'
      } : { available: false }
    };
    localStorage.setItem(REPORT_KEY, JSON.stringify(report));
    return report;
  }

  function toast(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 1600);
  }

  function applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--neonblock-hud-scale', String(clamp(Number(settings.hudScale) || 1, 0.75, 1.35)));
    root.style.setProperty('--neonblock-touch-scale', String(clamp(Number(settings.touchScale) || 1, 0.85, 1.35)));
    document.body.classList.toggle('nb-reduce-motion', Boolean(settings.reduceMotion));
    document.body.classList.toggle('nb-sticky-hud', Boolean(settings.stickyHud));
    if (panel && !panel.classList.contains('hidden')) renderPanel();
  }

  function injectStyle() {
    if ($('neonblock-play-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-play-settings-style';
    style.textContent = `
      #hud { transform: scale(var(--neonblock-hud-scale, 1)); transform-origin: top left; }
      #mobile-controls .action-btn, #joystick-container { transform: scale(var(--neonblock-touch-scale, 1)); transform-origin: center; }
      body.nb-sticky-hud #hud { pointer-events: none; }
      body.nb-reduce-motion *, body.nb-reduce-motion *::before, body.nb-reduce-motion *::after { scroll-behavior: auto !important; animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      #neonblock-play-settings-panel {
        position: fixed; left: max(12px, env(safe-area-inset-left)); bottom: max(12px, env(safe-area-inset-bottom)); z-index: 80;
        width: min(360px, calc(100vw - 24px)); max-height: min(78vh, 620px); overflow: auto;
        padding: 14px; border: 1px solid rgba(23,243,255,.38); border-radius: 18px;
        background: rgba(5, 8, 20, .94); color: #ecfbff; box-shadow: 0 18px 60px rgba(0,0,0,.45); backdrop-filter: blur(12px);
        font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #neonblock-play-settings-panel.hidden { display: none; }
      #neonblock-play-settings-panel h2 { margin: 0 0 8px; font-size: 18px; }
      #neonblock-play-settings-panel p { margin: 6px 0 10px; color: #bfefff; }
      #neonblock-play-settings-panel label { display: grid; gap: 5px; margin: 10px 0; }
      #neonblock-play-settings-panel input[type="range"] { width: 100%; }
      #neonblock-play-settings-panel .nb-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      #neonblock-play-settings-panel button { border: 0; border-radius: 12px; padding: 9px 11px; background: #17f3ff; color: #051018; font-weight: 800; }
      #neonblock-play-settings-panel button.secondary { background: rgba(255,255,255,.1); color: #ecfbff; border: 1px solid rgba(255,255,255,.16); }
      #btn-mobile-play-settings { background: linear-gradient(135deg, #17f3ff, #9c6cff); color: #050814; }
      @media (max-width: 720px) { #hud { max-width: calc(100vw / var(--neonblock-hud-scale, 1)); } }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'neonblock-play-settings-panel';
    panel.className = 'hidden';
    panel.setAttribute('aria-label', 'NeonBlock play settings');
    document.body.appendChild(panel);
    return panel;
  }

  function renderPanel() {
    const report = saveReport('settings-open');
    const lastSave = settings.lastQuickSaveAt ? new Date(settings.lastQuickSaveAt).toLocaleTimeString() : 'not yet';
    panel.innerHTML = `
      <h2>Play Settings</h2>
      <p>Tune HUD size, phone button size, motion, and safe saving without leaving the game.</p>
      <label>HUD scale <strong>${Number(settings.hudScale).toFixed(2)}x</strong><input id="nb-hud-scale" type="range" min="0.75" max="1.35" step="0.05" value="${settings.hudScale}"></label>
      <label>Touch controls <strong>${Number(settings.touchScale).toFixed(2)}x</strong><input id="nb-touch-scale" type="range" min="0.85" max="1.35" step="0.05" value="${settings.touchScale}"></label>
      <label><span><input id="nb-reduce-motion" type="checkbox" ${settings.reduceMotion ? 'checked' : ''}> Reduce menu motion</span></label>
      <label><span><input id="nb-sticky-hud" type="checkbox" ${settings.stickyHud ? 'checked' : ''}> Keep HUD click-through during play</span></label>
      <p><strong>Last quick save:</strong> ${lastSave}</p>
      <p><strong>Runtime:</strong> L${report.runtime.level || 1}, ${report.runtime.vehicle || 'On foot'}, ${report.runtime.chunks || 0} chunks, graphics ${report.runtime.graphics || 'auto'}.</p>
      <div class="nb-row">
        <button id="nb-quick-save">Quick Save</button>
        <button id="nb-reset-settings" class="secondary">Reset</button>
        <button id="nb-copy-settings-report" class="secondary">Copy QA</button>
        <button id="nb-close-settings" class="secondary">Close</button>
      </div>
    `;
    $('nb-hud-scale')?.addEventListener('input', (event) => writeSettings({ hudScale: Number(event.target.value) }));
    $('nb-touch-scale')?.addEventListener('input', (event) => writeSettings({ touchScale: Number(event.target.value) }));
    $('nb-reduce-motion')?.addEventListener('change', (event) => writeSettings({ reduceMotion: event.target.checked }));
    $('nb-sticky-hud')?.addEventListener('change', (event) => writeSettings({ stickyHud: event.target.checked }));
    $('nb-close-settings')?.addEventListener('click', closePanel);
    $('nb-reset-settings')?.addEventListener('click', () => {
      writeSettings({ ...DEFAULTS });
      toast('Play settings reset');
      renderPanel();
    });
    $('nb-quick-save')?.addEventListener('click', () => {
      try {
        window.NeonBlockGame?.saveState?.();
        writeSettings({ lastQuickSaveAt: Date.now() });
        saveReport('quick-save');
        toast('Quick saved from Play Settings');
        renderPanel();
      } catch (error) {
        toast('Quick save failed');
        saveReport(`quick-save-failed:${error.message}`);
      }
    });
    $('nb-copy-settings-report')?.addEventListener('click', async () => {
      const qa = JSON.stringify(saveReport('copy-settings-qa'), null, 2);
      try {
        await navigator.clipboard.writeText(qa);
        toast('Play Settings QA copied');
      } catch (_) {
        localStorage.setItem(REPORT_KEY, qa);
        toast('QA saved locally');
      }
    });
  }

  function openPanel() {
    ensurePanel();
    renderPanel();
    panel.classList.remove('hidden');
    saveReport('panel-opened');
  }

  function closePanel() {
    panel?.classList.add('hidden');
    saveReport('panel-closed');
  }

  function togglePanel() {
    ensurePanel();
    if (panel.classList.contains('hidden')) openPanel();
    else closePanel();
  }

  function injectMobileButton() {
    const rail = $('action-rail');
    if (!rail || $('btn-mobile-play-settings')) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = 'btn-mobile-play-settings';
    button.type = 'button';
    button.textContent = 'Tune';
    button.addEventListener('click', togglePanel);
    rail.appendChild(button);
  }

  function hardenTouchAndFocus() {
    let lastTouch = 0;
    document.addEventListener('touchend', (event) => {
      const now = Date.now();
      if (now - lastTouch < 320) event.preventDefault();
      lastTouch = now;
    }, { passive: false });

    window.addEventListener('blur', () => {
      saveReport('window-blur');
      try { window.NeonBlockGame?.saveState?.(); } catch (_) {}
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveReport('hidden-save');
        try { window.NeonBlockGame?.saveState?.(); } catch (_) {}
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'F3' || (event.shiftKey && event.code === 'KeyS')) {
      event.preventDefault();
      togglePanel();
    }
  }, true);

  injectStyle();
  ensurePanel();
  applySettings();
  injectMobileButton();
  hardenTouchAndFocus();
  window.NeonBlockPlaySettings = { open: openPanel, close: closePanel, getSettings: () => ({ ...settings }), saveReport };
  saveReport('loaded');
})();
