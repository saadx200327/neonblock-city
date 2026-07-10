(() => {
  'use strict';

  const EDGE_ACTIONS = new Set(['Space', 'KeyE']);
  const pendingRelease = new Set();

  function releaseAfterOneFrame(event) {
    if (pendingRelease.has(event.code)) return;
    pendingRelease.add(event.code);

    requestAnimationFrame(() => {
      pendingRelease.delete(event.code);
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: event.code,
        key: event.key,
        bubbles: true,
        cancelable: true
      }));
    });
  }

  window.addEventListener('keydown', (event) => {
    if (!EDGE_ACTIONS.has(event.code)) return;

    if (event.repeat || pendingRelease.has(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    releaseAfterOneFrame(event);
  }, true);

  window.addEventListener('blur', () => pendingRelease.clear());

  window.NeonBlockActionEdgeGuard = {
    version: 1,
    guardedActions: Array.from(EDGE_ACTIONS),
    getPendingActions: () => Array.from(pendingRelease)
  };
})();
