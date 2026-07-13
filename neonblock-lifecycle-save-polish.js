(() => {
  'use strict';

  const LIFECYCLE_DEDUPE_MS = 750;
  const state = {
    saves: 0,
    pendingSaves: 0,
    asyncSaves: 0,
    failedSaves: 0,
    skippedDuplicates: 0,
    lastReason: null,
    lastSavedAt: 0,
    lastLifecycleSaveAt: 0,
    lastCompletedAt: 0,
    lastError: null
  };

  function getGame() {
    return window.NeonBlockGame && typeof window.NeonBlockGame.saveState === 'function'
      ? window.NeonBlockGame
      : null;
  }

  function completeSave(reason, startedAt, lifecycleEvent) {
    state.saves += 1;
    state.lastReason = reason;
    state.lastSavedAt = startedAt;
    state.lastCompletedAt = Date.now();
    if (lifecycleEvent) state.lastLifecycleSaveAt = startedAt;
    state.lastError = null;
  }

  function failSave(error) {
    state.failedSaves += 1;
    state.lastError = error instanceof Error ? error.message : String(error);
    console.warn('[NeonBlock City] lifecycle save failed', error);
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

    // Reserve the lifecycle timestamp before invoking the saver so visibility,
    // pagehide, freeze, and beforeunload cannot enqueue the same async save.
    if (lifecycleEvent) state.lastLifecycleSaveAt = now;

    try {
      const result = game.saveState();
      if (result && typeof result.then === 'function') {
        state.pendingSaves += 1;
        state.asyncSaves += 1;
        Promise.resolve(result)
          .then(() => completeSave(reason, now, lifecycleEvent))
          .catch(failSave)
          .finally(() => {
            state.pendingSaves = Math.max(0, state.pendingSaves - 1);
          });
        return true;
      }

      completeSave(reason, now, lifecycleEvent);
      return true;
    } catch (error) {
      failSave(error);
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
    version: 3,
    saveNow: (reason = 'manual') => saveNow(reason, true, false),
    getStatus: () => ({
      ...state,
      dedupeWindowMs: LIFECYCLE_DEDUPE_MS,
      ready: Boolean(getGame())
    })
  };
})();
