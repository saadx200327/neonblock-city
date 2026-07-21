(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEYS = {
    hudScale: 'neonblock:hudScale',
    lowMotion: 'neonblock:lowMotion'
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isTypingTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
  }

  function toast(message) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 1800);
  }

  function injectStyles() {
    if ($('neonblock-accessibility-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-accessibility-style';
    style.textContent = `
      :root { --neonblock-hud-scale: 1; }
      #hud { transform: scale(var(--neonblock-hud-scale)); transform-origin: top left; }
      #neonblock-accessibility-tools,
      #neonblock-save-health { display: grid; gap: 8px; margin: 10px 0; }
      #neonblock-accessibility-tools .tool-row,
      #neonblock-save-health .tool-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      #neonblock-save-health small { color: #aeefff; opacity: 0.9; }
      body.neonblock-low-motion *, body.neonblock-low-motion *::before, body.neonblock-low-motion *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getHudScale() {
    const raw = Number(localStorage.getItem(STORAGE_KEYS.hudScale));
    return Number.isFinite(raw) ? clamp(raw, 0.8, 1.35) : 1;
  }

  function setHudScale(next) {
    const value = clamp(next, 0.8, 1.35);
    localStorage.setItem(STORAGE_KEYS.hudScale, String(value));
    document.documentElement.style.setProperty('--neonblock-hud-scale', String(value));
    updateHudScaleLabel();
    return value;
  }

  function updateHudScaleLabel() {
    const label = $('neonblock-hud-scale-value');
    if (label) label.textContent = `${Math.round(getHudScale() * 100)}%`;
  }

  function setLowMotion(enabled) {
    localStorage.setItem(STORAGE_KEYS.lowMotion, enabled ? '1' : '0');
    document.body.classList.toggle('neonblock-low-motion', enabled);
    const btn = $('btn-low-motion');
    if (btn) btn.textContent = enabled ? 'Low Motion: On' : 'Low Motion: Off';
    if (enabled && window.NeonBlockGame?.applyGraphicsQuality) {
      window.NeonBlockGame.applyGraphicsQuality('low', true);
    }
  }

  function installSettingsTools() {
    const settings = $('settings-panel');
    if (!settings || $('neonblock-accessibility-tools')) return;

    const wrap = document.createElement('div');
    wrap.id = 'neonblock-accessibility-tools';
    wrap.innerHTML = `
      <h3>Accessibility</h3>
      <div class="tool-row" aria-label="HUD scale controls">
        <button id="btn-hud-smaller" type="button">HUD -</button>
        <span>HUD <strong id="neonblock-hud-scale-value">100%</strong></span>
        <button id="btn-hud-bigger" type="button">HUD +</button>
        <button id="btn-hud-reset" type="button">Reset HUD</button>
      </div>
      <div class="tool-row">
        <button id="btn-low-motion" type="button">Low Motion: Off</button>
      </div>
    `;
    settings.insertBefore(wrap, $('btn-close-settings') || null);

    $('btn-hud-smaller')?.addEventListener('click', () => toast(`HUD ${Math.round(setHudScale(getHudScale() - 0.1) * 100)}%`));
    $('btn-hud-bigger')?.addEventListener('click', () => toast(`HUD ${Math.round(setHudScale(getHudScale() + 0.1) * 100)}%`));
    $('btn-hud-reset')?.addEventListener('click', () => toast(`HUD ${Math.round(setHudScale(1) * 100)}%`));
    $('btn-low-motion')?.addEventListener('click', () => {
      const enabled = localStorage.getItem(STORAGE_KEYS.lowMotion) !== '1';
      setLowMotion(enabled);
      toast(enabled ? 'Low motion enabled' : 'Low motion disabled');
    });
    updateHudScaleLabel();
  }

  function readSlotStatus(slot) {
    const raw = localStorage.getItem(`neonblock:${slot}`);
    if (!raw) return `${slot}: empty`;
    try {
      const data = JSON.parse(raw);
      const ageMs = Date.now() - Number(data.at || 0);
      const ageMin = Number.isFinite(ageMs) && ageMs > 0 ? Math.max(0, Math.round(ageMs / 60000)) : '?';
      const cash = Number.isFinite(Number(data.cash)) ? `$${Math.floor(Number(data.cash))}` : '$?';
      const level = Number.isFinite(Number(data.level)) ? `L${Number(data.level)}` : 'L?';
      return `${slot}: OK • ${level} • ${cash} • ${ageMin}m ago`;
    } catch (_error) {
      return `${slot}: corrupt JSON quarantinable`;
    }
  }

  function installSaveHealth() {
    const panel = $('save-panel');
    if (!panel || $('neonblock-save-health')) return;
    const box = document.createElement('div');
    box.id = 'neonblock-save-health';
    box.innerHTML = `
      <h3>Save Health</h3>
      <small id="neonblock-save-health-text">Checking slots...</small>
      <div class="tool-row">
        <button id="btn-copy-save-health" type="button">Copy Save Report</button>
      </div>
    `;
    panel.insertBefore(box, $('export-json') || null);

    $('btn-copy-save-health')?.addEventListener('click', () => {
      const report = buildSaveReport();
      const target = $('export-json');
      if (target) target.value = report;
      navigator.clipboard?.writeText(report).catch(() => {});
      toast('Save report ready');
    });
    refreshSaveHealth();
    setInterval(refreshSaveHealth, 5000);
  }

  function refreshSaveHealth() {
    const text = $('neonblock-save-health-text');
    if (!text) return;
    text.textContent = `${readSlotStatus('slot1')} | ${readSlotStatus('slot2')}`;
  }

  function buildSaveReport() {
    const snapshot = window.NeonBlockGame?.getSnapshot?.();
    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      location: location.href,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      saveHealth: [readSlotStatus('slot1'), readSlotStatus('slot2')],
      runtime: snapshot ? {
        chunks: snapshot.chunks,
        vehicles: snapshot.vehicles,
        crates: snapshot.crates,
        lots: snapshot.lots,
        graphics: snapshot.graphics,
        player: {
          cash: snapshot.player?.cash,
          xp: snapshot.player?.xp,
          level: snapshot.player?.level,
          wanted: snapshot.player?.wanted,
          slot: snapshot.player?.slot,
          activeVehicle: snapshot.player?.activeVehicle?.userData?.id || null,
          position: snapshot.player?.mesh?.position?.toArray?.() || null
        }
      } : null
    }, null, 2);
  }

  function installKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (isTypingTarget(event.target)) return;
      if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        setHudScale(getHudScale() + 0.1);
        toast(`HUD ${Math.round(getHudScale() * 100)}%`);
      }
      if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        setHudScale(getHudScale() - 0.1);
        toast(`HUD ${Math.round(getHudScale() * 100)}%`);
      }
    });
  }

  function installRuntimeFallback() {
    setTimeout(() => {
      if (window.NeonBlockGame) return;
      const loading = $('loading-screen');
      if (!loading || loading.classList.contains('hidden')) return;
      loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Runtime did not start. Check the browser console and confirm Three.js CDN access.</div>';
      const debug = $('debug-last-error');
      if (debug) debug.textContent = 'runtime did not start; check Three.js CDN/network';
    }, 8000);
  }

  function boot() {
    injectStyles();
    setHudScale(getHudScale());
    setLowMotion(localStorage.getItem(STORAGE_KEYS.lowMotion) === '1' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    installSettingsTools();
    installSaveHealth();
    installKeyboardShortcuts();
    installRuntimeFallback();
    window.NeonBlockAccessibility = { setHudScale, getHudScale, setLowMotion, buildSaveReport };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
