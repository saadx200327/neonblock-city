(() => {
  'use strict';

  const EDGE_ACTIONS = new Set(['Space', 'KeyE', 'KeyP', 'Escape', 'KeyM', 'KeyU']);
  const pendingRelease = new Map();
  let blockedRepeats = 0;
  let forcedReleases = 0;
  let releaseErrors = 0;
  let documentReleases = 0;
  let windowFallbackReleases = 0;
  let lifecycleReleases = 0;

  function createReleaseEvent(code, pending) {
    return new KeyboardEvent('keyup', {
      code,
      key: pending.key,
      location: pending.location,
      ctrlKey: pending.ctrlKey,
      shiftKey: pending.shiftKey,
      altKey: pending.altKey,
      metaKey: pending.metaKey,
      bubbles: true,
      cancelable: true,
      composed: true
    });
  }

  function dispatchRelease(code, forced = false) {
    const pending = pendingRelease.get(code);
    if (!pending) return false;

    pendingRelease.delete(code);
    if (pending.frameId) cancelAnimationFrame(pending.frameId);
    if (pending.timerId) clearTimeout(pending.timerId);

    try {
      document.dispatchEvent(createReleaseEvent(code, pending));
      documentReleases += 1;
      if (forced) forcedReleases += 1;
      return true;
    } catch (_) {
      try {
        window.dispatchEvent(createReleaseEvent(code, pending));
        windowFallbackReleases += 1;
        if (forced) forcedReleases += 1;
        return true;
      } catch (_) {
        releaseErrors += 1;
        return false;
      }
    }
  }

  function releaseAfterOneFrame(event) {
    if (pendingRelease.has(event.code)) return;

    const pending = {
      key: event.key,
      location: event.location,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      frameId: 0,
      timerId: 0
    };
    pendingRelease.set(event.code, pending);

    pending.frameId = requestAnimationFrame(() => {
      dispatchRelease(event.code);
    });

    // requestAnimationFrame may pause when a tab or installed PWA is backgrounded.
    pending.timerId = window.setTimeout(() => {
      dispatchRelease(event.code, true);
    }, 120);
  }

  function releaseAllPending() {
    let released = 0;
    Array.from(pendingRelease.keys()).forEach((code) => {
      if (dispatchRelease(code, true)) released += 1;
    });
    if (released) lifecycleReleases += released;
    return released;
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
  document.addEventListener('freeze', releaseAllPending);

  window.NeonBlockActionEdgeGuard = {
    version: 4,
    guardedActions: Array.from(EDGE_ACTIONS),
    getPendingActions: () => Array.from(pendingRelease.keys()),
    releaseAll: releaseAllPending,
    getStatus: () => ({
      version: 4,
      guardedActions: Array.from(EDGE_ACTIONS),
      pendingActions: Array.from(pendingRelease.keys()),
      blockedRepeats,
      forcedReleases,
      releaseErrors,
      documentReleases,
      windowFallbackReleases,
      lifecycleReleases
    })
  };
})();
