(() => {
  'use strict';

  const STORE = 'neonblock:cameraPolish';
  const DEFAULTS = { zoom: 1, mode: 'chase', minimap: 'normal' };
  const state = loadState();

  function $(id) {
    return document.getElementById(id);
  }

  function loadState() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (_) {}
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function flash(text) {
    const popup = $('reward-popup');
    if (popup) {
      popup.textContent = text;
      popup.classList.remove('hidden');
      clearTimeout(flash.timer);
      flash.timer = setTimeout(() => popup.classList.add('hidden'), 1500);
      return;
    }
    console.info('[NeonBlock City]', text);
  }

  function waitForGame() {
    if (!window.NeonBlockGame?.getSnapshot) {
      setTimeout(waitForGame, 250);
      return;
    }
    buildSettingsUi();
    applyCameraCss();
    applyMinimapSize();
    hookKeyboard();
    startCameraAssist();
    flash('Camera polish ready: C camera • [/] zoom • N minimap');
  }

  function buildSettingsUi() {
    const settings = $('settings-panel');
    if (!settings || $('camera-polish-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'camera-polish-panel';
    panel.className = 'settings-group';
    panel.innerHTML = `
      <h3>Camera / Map</h3>
      <label>Camera Mode
        <select id="camera-mode-select">
          <option value="chase">Chase</option>
          <option value="close">Close</option>
          <option value="cinematic">Cinematic</option>
        </select>
      </label>
      <label>Camera Zoom
        <input id="camera-zoom-range" type="range" min="0.75" max="1.45" step="0.05" value="1">
      </label>
      <label>Minimap Size
        <select id="minimap-size-select">
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </select>
      </label>
      <p class="settings-note">Shortcuts: <b>C</b> camera, <b>[</b>/<b>]</b> zoom, <b>N</b> minimap.</p>
    `;
    settings.insertBefore(panel, $('btn-close-settings'));

    const modeSelect = $('camera-mode-select');
    const zoomRange = $('camera-zoom-range');
    const minimapSelect = $('minimap-size-select');

    modeSelect.value = state.mode;
    zoomRange.value = String(state.zoom);
    minimapSelect.value = state.minimap;

    modeSelect.addEventListener('change', () => {
      state.mode = modeSelect.value;
      saveState();
      applyCameraCss();
      flash(`Camera: ${state.mode}`);
    });

    zoomRange.addEventListener('input', () => {
      state.zoom = clamp(Number(zoomRange.value) || 1, 0.75, 1.45);
      saveState();
      applyCameraCss();
    });

    minimapSelect.addEventListener('change', () => {
      state.minimap = minimapSelect.value;
      saveState();
      applyMinimapSize();
      flash(`Minimap: ${state.minimap}`);
    });
  }

  function applyCameraCss() {
    document.documentElement.style.setProperty('--neonblock-camera-zoom', String(state.zoom));
    document.body.dataset.cameraMode = state.mode;
    const range = $('camera-zoom-range');
    const select = $('camera-mode-select');
    if (range) range.value = String(state.zoom);
    if (select) select.value = state.mode;
  }

  function applyMinimapSize() {
    const minimap = $('minimap');
    const canvas = $('minimap-canvas');
    if (!minimap || !canvas) return;
    const sizes = { compact: 116, normal: 160, large: 210 };
    const size = sizes[state.minimap] || sizes.normal;
    minimap.style.width = `${size}px`;
    minimap.style.height = `${size}px`;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const select = $('minimap-size-select');
    if (select) select.value = state.minimap;
  }

  function hookKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.code === 'KeyC') {
        const modes = ['chase', 'close', 'cinematic'];
        state.mode = modes[(modes.indexOf(state.mode) + 1) % modes.length];
        saveState();
        applyCameraCss();
        flash(`Camera: ${state.mode}`);
      }
      if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
        state.zoom = clamp(state.zoom + (event.code === 'BracketRight' ? 0.05 : -0.05), 0.75, 1.45);
        saveState();
        applyCameraCss();
        flash(`Zoom: ${Math.round(state.zoom * 100)}%`);
      }
      if (event.code === 'KeyN') {
        const sizes = ['compact', 'normal', 'large'];
        state.minimap = sizes[(sizes.indexOf(state.minimap) + 1) % sizes.length];
        saveState();
        applyMinimapSize();
        flash(`Minimap: ${state.minimap}`);
      }
    });
  }

  function startCameraAssist() {
    let lastMode = '';
    setInterval(() => {
      const snapshot = window.NeonBlockGame?.getSnapshot?.();
      if (!snapshot) return;
      const player = snapshot.player;
      const mode = `${state.mode}:${player?.activeVehicle ? 'vehicle' : 'foot'}:${state.zoom}`;
      if (mode === lastMode) return;
      lastMode = mode;
      const hint = $('camera-mode-hint') || makeHint();
      hint.textContent = player?.activeVehicle
        ? `${state.mode} camera • vehicle view • [/] zoom`
        : `${state.mode} camera • on foot • C to switch`;
    }, 800);
  }

  function makeHint() {
    const hint = document.createElement('div');
    hint.id = 'camera-mode-hint';
    hint.className = 'hud-row hud-hint';
    const right = $('hud-top-right') || $('hud');
    right?.appendChild(hint);
    return hint;
  }

  window.NeonBlockCameraPolish = {
    getState: () => ({ ...state }),
    setMode(mode) {
      if (['chase', 'close', 'cinematic'].includes(mode)) {
        state.mode = mode;
        saveState();
        applyCameraCss();
      }
    },
    setZoom(zoom) {
      state.zoom = clamp(Number(zoom) || 1, 0.75, 1.45);
      saveState();
      applyCameraCss();
    }
  };

  waitForGame();
})();
