(() => {
  'use strict';

  const LIFECYCLE_DEDUPE_MS = 750;
  const state = {
    saves: 0,
    skippedDuplicates: 0,
    lastReason: null,
    lastSavedAt: 0,
    lastLifecycleSaveAt: 0,
    lastError: null
  };

  function getGame() {
    return window.NeonBlockGame && typeof window.NeonBlockGame.saveState === 'function'
      ? window.NeonBlockGame
      : null;
  }

  function saveNow(reason, force = false, lifecycleEvent = false) {
    const game = getGame();
    if (!game) return false;

    const now = Date.now();
    if (lifecycleEvent && now - state.lastLifecycleSaveAt < LIFECYCLE_DEDUPE_MS) {
      state.skippedDuplicates += 1;
      return false;
    }
    if (!force && now - state.lastSavedAt < 1200) return false;

    try {
      game.saveState();
      state.saves += 1;
      state.lastReason = reason;
      state.lastSavedAt = now;
      if (lifecycleEvent) state.lastLifecycleSaveAt = now;
      state.lastError = null;
      return true;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      console.warn('[NeonBlock City] lifecycle save failed', error);
      return false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveNow('visibility-hidden', false, true);
    }
  });

  window.addEventListener('pagehide', () => saveNow('pagehide', true, true));
  window.addEventListener('beforeunload', () => saveNow('beforeunload', true, true));
  document.addEventListener('freeze', () => saveNow('freeze', true, true));

  window.NeonBlockLifecycleSave = {
    version: 2,
    saveNow: (reason = 'manual') => saveNow(reason, true, false),
    getStatus: () => ({
      ...state,
      dedupeWindowMs: LIFECYCLE_DEDUPE_MS,
      ready: Boolean(getGame())
    })
  };
})();