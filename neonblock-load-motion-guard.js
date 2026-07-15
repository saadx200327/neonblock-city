(() => {
  'use strict';

  let wrapped = false;
  let loadCalls = 0;
  let motionResets = 0;
  let controlReleases = 0;
  let failures = 0;
  let lastSlot = null;
  let lastLoadedAt = 0;
  let lastError = null;

  function releaseControls() {
    try {
      const released = window.NeonBlockControlReleaseGuard?.release?.('save-load');
      if (released !== false) controlReleases += 1;
    } catch (error) {
      lastError = error?.message || 'control release failed';
    }
  }

  function resetMotion() {
    const player = window.NeonBlockGame?.getSnapshot?.()?.player;
    if (!player) return false;

    if (player.vel?.set) {
      player.vel.set(0, 0, 0);
      motionResets += 1;
    } else if (player.vel) {
      player.vel.x = 0;
      player.vel.y = 0;
      player.vel.z = 0;
      motionResets += 1;
    }

    if (player.activeVehicle?.position && player.mesh?.position) {
      player.activeVehicle.position.copy(player.mesh.position);
      player.activeVehicle.position.y = 0.65;
    }

    return true;
  }

  function install() {
    const game = window.NeonBlockGame;
    if (wrapped || !game?.loadState) return false;

    const originalLoadState = game.loadState.bind(game);
    game.loadState = function guardedLoadState(slot, data) {
      loadCalls += 1;
      lastSlot = slot || game.getSnapshot?.()?.player?.slot || 'slot1';
      releaseControls();

      try {
        const result = originalLoadState(slot, data);
        resetMotion();
        lastLoadedAt = Date.now();
        lastError = null;
        window.dispatchEvent(new CustomEvent('neonblock:saveloaded', {
          detail: { slot: lastSlot, at: lastLoadedAt }
        }));
        window.NeonBlockWorldSafety?.refresh?.();
        return result;
      } catch (error) {
        failures += 1;
        lastError = error?.message || 'save load failed';
        throw error;
      }
    };

    wrapped = true;
    return true;
  }

  function boot() {
    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 20) clearInterval(timer);
    }, 250);
  }

  window.NeonBlockLoadMotionGuard = {
    install,
    resetMotion,
    getStatus: () => ({
      version: 1,
      wrapped,
      loadCalls,
      motionResets,
      controlReleases,
      failures,
      lastSlot,
      lastLoadedAt,
      lastError
    })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
