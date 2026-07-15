(() => {
  'use strict';

  let wrapped = false;
  let loadCalls = 0;
  let successfulLoads = 0;
  let unsuccessfulLoads = 0;
  let asyncLoads = 0;
  let asyncFailures = 0;
  let pendingAsyncLoads = 0;
  let emptyLoadInvalidations = 0;
  let staleLoadCompletions = 0;
  let staleLoadFailures = 0;
  let staleResetSkips = 0;
  let emptyLoadSkips = 0;
  let emptyLoadNotices = 0;
  let staleNoticeHides = 0;
  let supersededNoticeHides = 0;
  let successfulLoadNoticeInvalidations = 0;
  let slotResolutionFailures = 0;
  let motionResets = 0;
  let deferredMotionResets = 0;
  let controlReleases = 0;
  let avoidedFailedLoadReleases = 0;
  let failures = 0;
  let thrownFailures = 0;
  let rejectedFailures = 0;
  let thenableInspectionFailures = 0;
  let failureEvents = 0;
  let loadGeneration = 0;
  let noticeGeneration = 0;
  let noticeHideTimer = 0;
  let lastSlot = null;
  let lastLoadedAt = 0;
  let lastUnsuccessfulLoadAt = 0;
  let lastEmptySlotAt = 0;
  let lastFailureAt = 0;
  let lastSlotResolutionFailureAt = 0;
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

  function resolveLoadSlot(game, requestedSlot) {
    if (requestedSlot) return requestedSlot;

    try {
      return game.getSnapshot?.()?.player?.slot || 'slot1';
    } catch (error) {
      slotResolutionFailures += 1;
      lastSlotResolutionFailureAt = Date.now();
      lastError = error?.message || 'save slot resolution failed';
      return 'slot1';
    }
  }

  function invalidateEmptySlotNotice() {
    noticeGeneration += 1;
    if (!noticeHideTimer) return false;

    clearTimeout(noticeHideTimer);
    noticeHideTimer = 0;
    successfulLoadNoticeInvalidations += 1;
    return true;
  }

  function showEmptySlotNotice(slot) {
    const generation = ++noticeGeneration;
    const noticeText = `No save found in ${slot}`;
    const notify = () => {
      if (generation !== noticeGeneration) return;

      const popup = document.getElementById('reward-popup');
      if (popup) {
        popup.textContent = noticeText;
        popup.classList.remove('hidden');

        if (noticeHideTimer) clearTimeout(noticeHideTimer);
        noticeHideTimer = setTimeout(() => {
          noticeHideTimer = 0;
          if (generation !== noticeGeneration) {
            staleNoticeHides += 1;
            return;
          }
          if (popup.textContent !== noticeText) {
            supersededNoticeHides += 1;
            return;
          }
          popup.classList.add('hidden');
        }, 1600);
      }

      emptyLoadNotices += 1;
      lastEmptySlotAt = Date.now();
      window.dispatchEvent(new CustomEvent('neonblock:saveloadempty', {
        detail: { slot, at: lastEmptySlotAt }
      }));
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(notify);
    } else {
      setTimeout(notify, 0);
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

  function emitFailureEvent(slot, reason, error) {
    lastFailureAt = Date.now();
    failureEvents += 1;
    window.dispatchEvent(new CustomEvent('neonblock:saveloadfailed', {
      detail: {
        slot,
        at: lastFailureAt,
        reason,
        message: String(error?.message || reason).slice(0, 160)
      }
    }));
  }

  function recordUnsuccessfulLoad(slot, result) {
    unsuccessfulLoads += 1;
    avoidedFailedLoadReleases += 1;
    lastUnsuccessfulLoadAt = Date.now();
    lastError = 'save load returned false';
    emitFailureEvent(slot, 'loader-returned-false');
    return result;
  }

  function completeLoad(generation, slot, result, releaseOnSuccess = false) {
    if (generation !== loadGeneration) {
      staleLoadCompletions += 1;
      return result;
    }
    if (result === false) return recordUnsuccessfulLoad(slot, result);

    invalidateEmptySlotNotice();
    if (releaseOnSuccess) releaseControls();
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

  function recordFailure(error, isAsync, generation, slot, reasonOverride) {
    if (generation !== loadGeneration) {
      staleLoadFailures += 1;
      return;
    }

    failures += 1;
    if (isAsync) {
      asyncFailures += 1;
      rejectedFailures += 1;
    } else {
      thrownFailures += 1;
    }
    lastError = error?.message || 'save load failed';
    emitFailureEvent(slot, reasonOverride || (isAsync ? 'loader-rejected' : 'loader-threw'), error);
  }

  function getThenMethod(result, generation, slot) {
    if (!result || (typeof result !== 'object' && typeof result !== 'function')) return null;

    try {
      return typeof result.then === 'function' ? result.then : null;
    } catch (error) {
      thenableInspectionFailures += 1;
      recordFailure(error, false, generation, slot, 'loader-then-access-threw');
      throw error;
    }
  }

  function assimilateThenable(result, thenMethod) {
    return new Promise((resolve, reject) => {
      try {
        thenMethod.call(result, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  function install() {
    const game = window.NeonBlockGame;
    if (wrapped || !game?.loadState) return false;

    const originalLoadState = game.loadState.bind(game);
    game.loadState = function guardedLoadState(slot, data) {
      loadCalls += 1;
      const resolvedSlot = resolveLoadSlot(game, slot);
      const generation = ++loadGeneration;
      lastSlot = resolvedSlot;

      if (!hasLoadPayload(resolvedSlot, data)) {
        emptyLoadSkips += 1;
        if (pendingAsyncLoads > 0) emptyLoadInvalidations += pendingAsyncLoads;
        showEmptySlotNotice(resolvedSlot);
        return false;
      }

      let result;
      try {
        result = originalLoadState(slot, data);
      } catch (error) {
        recordFailure(error, false, generation, resolvedSlot);
        throw error;
      }

      const thenMethod = getThenMethod(result, generation, resolvedSlot);
      if (thenMethod) {
        asyncLoads += 1;
        pendingAsyncLoads += 1;
        return assimilateThenable(result, thenMethod).then(
          value => {
            pendingAsyncLoads = Math.max(0, pendingAsyncLoads - 1);
            return completeLoad(generation, resolvedSlot, value, true);
          },
          error => {
            pendingAsyncLoads = Math.max(0, pendingAsyncLoads - 1);
            recordFailure(error, true, generation, resolvedSlot);
            throw error;
          }
        );
      }

      if (result !== false) releaseControls();
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
      version: 15,
      wrapped,
      loadCalls,
      successfulLoads,
      unsuccessfulLoads,
      asyncLoads,
      asyncFailures,
      pendingAsyncLoads,
      emptyLoadInvalidations,
      staleLoadCompletions,
      staleLoadFailures,
      staleResetSkips,
      emptyLoadSkips,
      emptyLoadNotices,
      staleNoticeHides,
      supersededNoticeHides,
      successfulLoadNoticeInvalidations,
      slotResolutionFailures,
      noticeGeneration,
      noticeHidePending: Boolean(noticeHideTimer),
      motionResets,
      deferredMotionResets,
      controlReleases,
      avoidedFailedLoadReleases,
      failures,
      thrownFailures,
      rejectedFailures,
      thenableInspectionFailures,
      failureEvents,
      loadGeneration,
      lastSlot,
      lastLoadedAt,
      lastUnsuccessfulLoadAt,
      lastEmptySlotAt,
      lastFailureAt,
      lastSlotResolutionFailureAt,
      lastError
    })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
