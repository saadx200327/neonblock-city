(() => {
  'use strict';

  const state = {
    saves: 0,
    lastReason: null,
    lastSavedAt: 0,
    lastError: null
  };

  function getGame() {
    return window.NeonBlockGame && typeof window.NeonBlockGame.saveState === 'function'
      ? window.NeonBlockGame
      : null;
  }

  function saveNow(reason, force = false) {
    const game = getGame();
    if (!game) return false;

    const now = Date.now();
    if (!force && now - state.lastSavedAt < 1200) return false;

    try {
      game.saveState();
      state.saves += 1;
      state.lastReason = reason;
      state.lastSavedAt = now;
      state.lastError = null;
      return true;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      console.warn('[NeonBlock City] lifecycle save failed', error);
      return false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow('visibility-hidden');
  });

  window.addEventListener('pagehide', () => saveNow('pagehide', true));
  window.addEventListener('beforeunload', () => saveNow('beforeunload', true));
  document.addEventListener('freeze', () => saveNow('freeze', true));

  window.NeonBlockLifecycleSave = {
    saveNow: (reason = 'manual') => saveNow(reason, true),
    getStatus: () => ({
      ...state,
      ready: Boolean(getGame())
    })
  };
})();