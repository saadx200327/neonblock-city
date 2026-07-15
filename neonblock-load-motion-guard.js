(() => {
  'use strict';

  let wrapped = false;
  let loadCalls = 0;
  let successfulLoads = 0;
  let asyncLoads = 0;
  let asyncFailures = 0;
  let staleResetSkips = 0;
  let emptyLoadSkips = 0;
  let motionResets = 0;
  let deferredMotionResets = 0;
  let controlReleases = 0;
  let failures = 0;
  let loadGeneration = 0;
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

  function hasLoadPayload(slot, data) {
    if (data !== null && data !== undefined) return true;
    try {
      return localStorage.getItem(`neonblock:${slot}`) !== null;
    } catch (error) {
      lastError = error?.message || 'save slot lookup failed';
      return true;
    }
  }

  function scheduleDeferredResets(generation) {
    let remaining = 3;

    const run = () => {
      if (generation !== loadGeneration) {
        staleResetSkips += 1;
        return;
      }

      if (resetMotion()) deferredMotionResets += 1;
      window.NeonBlockWorldSafety?.refresh?.();
      remaining -= 1;

      if (remaining > 0) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(run);
        } else {
          setTimeout(run, 16);
        }
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function completeLoad(generation, slot, result) {
    if (generation !== loadGeneration) return result;

    resetMotion();
    scheduleDeferredResets(generation);
    successfulLoads += 1;
    lastLoadedAt = Date.now();
    lastError = null;
    window.dispatchEvent(new CustomEvent('neonblock:saveloaded', {
      detail: { slot, at: lastLoadedAt }
    }));
    window.NeonBlockWorldSafety?.refresh?.();
    return result;
  }

  function recordFailure(error, isAsync) {
    failures += 1;
    if (isAsync) asyncFailures += 1;
    lastError = error?.message || 'save load failed';
  }

  function install() {
    const game = window.NeonBlockGame;
    if (wrapped || !game?.loadState) return false;

    const originalLoadState = game.loadState.bind(game);
    game.loadState = function guardedLoadState(slot, data) {
      loadCalls += 1;
      const resolvedSlot = slot || game.getSnapshot?.()?.player?.slot || 'slot1';
      lastSlot = resolvedSlot;

      if (!hasLoadPayload(resolvedSlot, data)) {
        emptyLoadSkips += 1;
        return originalLoadState(slot, data);
      }

      const generation = ++loadGeneration;
      releaseControls();

      let result;
      try {
        result = originalLoadState(slot, data);
      } catch (error) {
        recordFailure(error, false);
        throw error;
      }

      if (result && typeof result.then === 'function') {
        asyncLoads += 1;
        return Promise.resolve(result).then(
          value => completeLoad(generation, resolvedSlot, value),
          error => {
            recordFailure(error, true);
            throw error;
          }
        );
      }

      return completeLoad(generation, resolvedSlot, result);
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
      version: 3,
      wrapped,
      loadCalls,
      successfulLoads,
      asyncLoads,
      asyncFailures,
      staleResetSkips,
      emptyLoadSkips,
      motionResets,
      deferredMotionResets,
      controlReleases,
      failures,
      loadGeneration,
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