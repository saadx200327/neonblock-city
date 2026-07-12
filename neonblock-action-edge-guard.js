(() => {
  'use strict';

  const EDGE_ACTIONS = new Set(['Space', 'KeyE', 'KeyP', 'Escape', 'KeyM', 'KeyU']);
  const pendingRelease = new Map();
  let blockedRepeats = 0;
  let forcedReleases = 0;
  let releaseErrors = 0;

  function dispatchRelease(code, key, forced = false) {
    const pending = pendingRelease.get(code);
    if (!pending) return false;

    pendingRelease.delete(code);
    if (pending.frameId) cancelAnimationFrame(pending.frameId);
    if (pending.timerId) clearTimeout(pending.timerId);

    try {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code,
        key,
        bubbles: true,
        cancelable: true
      }));
      if (forced) forcedReleases += 1;
      return true;
    } catch (_) {
      releaseErrors += 1;
      return false;
    }
  }

  function releaseAfterOneFrame(event) {
    if (pendingRelease.has(event.code)) return;

    const pending = {
      key: event.key,
      frameId: 0,
      timerId: 0
    };
    pendingRelease.set(event.code, pending);

    pending.frameId = requestAnimationFrame(() => {
      dispatchRelease(event.code, event.key);
    });

    // requestAnimationFrame may pause when a tab or installed PWA is backgrounded.
    pending.timerId = window.setTimeout(() => {
      dispatchRelease(event.code, event.key, true);
    }, 120);
  }

  function releaseAllPending() {
    Array.from(pendingRelease.entries()).forEach(([code, pending]) => {
      dispatchRelease(code, pending.key, true);
    });
  }

  window.addEventListener('keydown', (event) => {
    if (!EDGE_ACTIONS.has(event.code)) return;

    if (event.repeat || pendingRelease.has(event.code)) {
      blockedRepeats += 1;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    releaseAfterOneFrame(event);
  }, true);

  window.addEventListener('blur', releaseAllPending);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllPending();
  });
  window.addEventListener('pagehide', releaseAllPending);

  window.NeonBlockActionEdgeGuard = {
    version: 3,
    guardedActions: Array.from(EDGE_ACTIONS),
    getPendingActions: () => Array.from(pendingRelease.keys()),
    releaseAll: releaseAllPending,
    getStatus: () => ({
      version: 3,
      guardedActions: Array.from(EDGE_ACTIONS),
      pendingActions: Array.from(pendingRelease.keys()),
      blockedRepeats,
      forcedReleases,
      releaseErrors
    })
  };
})();
