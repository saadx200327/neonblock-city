(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SAVE_PREFIX = 'neonblock:';
  const VALID_SLOTS = ['slot1', 'slot2'];
  const state = {
    lastFallFix: 0,
    lastHealthCheck: 0,
    warnedLandscape: false,
    preflightComplete: false,
    booted: false,
    storageAvailable: true,
    storageErrors: 0,
    lastStorageError: null
  };

  function popup(message, duration = 1700) {
    const target = $('reward-popup');
    if (!target) return;
    target.textContent = message;
    target.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => target.classList.add('hidden'), duration);
  }

  function setHudError(message) {
    const target = $('debug-last-error');
    if (target) target.textContent = message || 'none';
  }

  function noteStorageError(error) {
    state.storageAvailable = false;
    state.storageErrors += 1;
    state.lastStorageError = error?.message || String(error || 'storage unavailable');
    setHudError(`local save unavailable: ${state.lastStorageError}`);
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      noteStorageError(error);
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      state.storageAvailable = true;
      return true;
    } catch (error) {
      noteStorageError(error);
      return false;
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
      state.storageAvailable = true;
      return true;
    } catch (error) {
      noteStorageError(error);
      return false;
    }
  }

  function parseSave(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!value || !Array.isArray(value.pos)) return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  function quarantineCorruptSave(slot) {
    if (!VALID_SLOTS.includes(slot)) return false;
    const key = `${SAVE_PREFIX}${slot}`;
    const raw = storageGet(key);
    if (!raw || parseSave(raw)) return false;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backedUp = storageSet(`${key}:corrupt:${stamp}`, raw.slice(0, 200000));
    if (!backedUp || !storageRemove(key)) {
      setHudError(`corrupt ${slot} detected; backup unavailable`);
      return false;
    }
    setHudError(`corrupt ${slot} moved aside`);
    return true;
  }

  function repairSavesBeforeGameLoad() {
    if (state.preflightComplete) return false;
    state.preflightComplete = true;
    let repaired = false;
    for (const slot of VALID_SLOTS) repaired = quarantineCorruptSave(slot) || repaired;
    if (repaired) popup('A corrupt save was backed up and skipped', 2600);
    return repaired;
  }

  function currentSlot() {
    const slot = $('debug-save-slot')?.textContent?.trim();
    return VALID_SLOTS.includes(slot) ? slot : 'slot1';
  }

  function latestUsableSave() {
    const candidates = [];
    for (const slot of VALID_SLOTS) {
      const parsed = parseSave(storageGet(`${SAVE_PREFIX}${slot}`));
      if (parsed) candidates.push({ slot, parsed });
      const hidden = parseSave(storageGet(`${SAVE_PREFIX}${slot}:last-hidden-copy`));
      if (hidden) candidates.push({ slot, parsed: hidden });
    }
    candidates.sort((a, b) => (b.parsed.at || 0) - (a.parsed.at || 0));
    return candidates[0] || null;
  }

  function addQuickRecoveryTools() {
    const panel = $('save-panel');
    if (!panel || $('btn-export-latest-save')) return;

    const exportLatest = document.createElement('button');
    exportLatest.id = 'btn-export-latest-save';
    exportLatest.textContent = 'Export Latest Good Save';
    exportLatest.addEventListener('click', () => {
      const latest = latestUsableSave();
      if (!latest) return popup(state.storageAvailable ? 'No usable save found' : 'Local saves are unavailable');
      const box = $('export-json');
      if (box) box.value = JSON.stringify(latest.parsed, null, 2);
      popup(`Latest ${latest.slot} save copied`);
    });

    const loadLatest = document.createElement('button');
    loadLatest.id = 'btn-load-latest-save';
    loadLatest.textContent = 'Load Latest Good Save';
    loadLatest.addEventListener('click', () => {
      const latest = latestUsableSave();
      if (!latest || !window.NeonBlockGame?.loadState) return popup(state.storageAvailable ? 'No usable save found' : 'Local saves are unavailable');
      window.NeonBlockGame.loadState(latest.slot, latest.parsed);
      popup(`Loaded latest ${latest.slot}`);
    });

    panel.appendChild(exportLatest);
    panel.appendChild(loadLatest);
  }

  function guardFallThrough() {
    const game = window.NeonBlockGame;
    const snapshot = game?.getSnapshot?.();
    const player = snapshot?.player;
    const now = performance.now();
    if (!player?.mesh?.position || now - state.lastFallFix < 1500) return;
    if (player.mesh.position.y < -12 || Math.abs(player.mesh.position.x) > 5000 || Math.abs(player.mesh.position.z) > 5000) {
      state.lastFallFix = now;
      player.mesh.position.set(0, 4, 0);
      player.vel?.set?.(0, 0, 0);
      try { game.saveState?.(currentSlot()); } catch (error) { noteStorageError(error); }
      setHudError('fall-through recovered');
      popup('Recovered player position', 2200);
    }
  }

  function watchRuntimeHealth() {
    const now = performance.now();
    if (now - state.lastHealthCheck < 1000) return requestAnimationFrame(watchRuntimeHealth);
    state.lastHealthCheck = now;

    const loadingVisible = !$('loading-screen')?.classList.contains('hidden');
    if (loadingVisible && now > 6500) {
      setHudError('loading still visible: check Three.js/CDN access');
    }

    const snapshot = window.NeonBlockGame?.getSnapshot?.();
    if (snapshot) {
      const objectCount = (snapshot.chunks || 0) + (snapshot.vehicles || 0) + (snapshot.crates || 0) + (snapshot.lots || 0);
      if (objectCount > 260 && snapshot.graphics?.quality !== 'low') {
        setHudError('heavy world: try Low graphics on mobile');
      }
    }

    guardFallThrough();
    requestAnimationFrame(watchRuntimeHealth);
  }

  function addViewportGuards() {
    const update = () => {
      const portraitPhone = innerWidth < 620 && innerHeight > innerWidth;
      document.documentElement.classList.toggle('phone-portrait', portraitPhone);
      if (portraitPhone && !state.warnedLandscape) {
        state.warnedLandscape = true;
        popup('Tip: rotate sideways for better driving', 2400);
      }
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    update();
  }

  function addPageLifecycleSave() {
    const save = () => {
      try { window.NeonBlockGame?.saveState?.(currentSlot()); } catch (error) { noteStorageError(error); }
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('freeze', save);
  }

  function getStatus() {
    return {
      version: 3,
      booted: state.booted,
      preflightComplete: state.preflightComplete,
      storageAvailable: state.storageAvailable,
      storageErrors: state.storageErrors,
      lastStorageError: state.lastStorageError,
      latestSave: latestUsableSave()?.slot || null
    };
  }

  function bootAfterGameReady() {
    if (state.booted) return;
    repairSavesBeforeGameLoad();
    const wait = () => {
      if (!window.NeonBlockGame?.getSnapshot) return setTimeout(wait, 80);
      state.booted = true;
      addQuickRecoveryTools();
      addViewportGuards();
      addPageLifecycleSave();
      requestAnimationFrame(watchRuntimeHealth);
      window.NeonBlockRuntimeGuard = {
        version: 3,
        latestUsableSave,
        quarantineCorruptSave,
        repairSavesBeforeGameLoad,
        getStatus
      };
    };
    wait();
  }

  repairSavesBeforeGameLoad();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAfterGameReady);
  else bootAfterGameReady();
})();
