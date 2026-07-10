(() => {
  'use strict';

  if (window.NeonBlockFrameLifecycleGuard) return;

  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const pending = new Map();
  let nextId = 1;
  let nativeHandle = null;
  let pausedAt = document.hidden ? performance.now() : null;
  let totalHiddenMs = 0;
  let flushes = 0;

  function runFrame(now) {
    nativeHandle = null;
    if (document.hidden) return;

    const batch = Array.from(pending.entries());
    pending.clear();
    for (const [, callback] of batch) {
      try {
        callback(now);
      } catch (error) {
        setTimeout(() => { throw error; }, 0);
      }
    }

    if (pending.size) scheduleNativeFrame();
  }

  function scheduleNativeFrame() {
    if (document.hidden || nativeHandle !== null || !pending.size) return;
    nativeHandle = nativeRequestAnimationFrame(runFrame);
  }

  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    if (typeof callback !== 'function') throw new TypeError('requestAnimationFrame callback must be a function');
    const id = nextId++;
    pending.set(id, callback);
    scheduleNativeFrame();
    return id;
  };

  window.cancelAnimationFrame = function cancelAnimationFrame(id) {
    pending.delete(id);
    if (!pending.size && nativeHandle !== null) {
      nativeCancelAnimationFrame(nativeHandle);
      nativeHandle = null;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pausedAt = performance.now();
      if (nativeHandle !== null) {
        nativeCancelAnimationFrame(nativeHandle);
        nativeHandle = null;
      }
      return;
    }

    if (pausedAt !== null) {
      totalHiddenMs += Math.max(0, performance.now() - pausedAt);
      pausedAt = null;
    }
    flushes += 1;
    scheduleNativeFrame();
  });

  window.NeonBlockFrameLifecycleGuard = {
    getStatus() {
      return {
        hidden: document.hidden,
        queuedCallbacks: pending.size,
        pausedAt,
        totalHiddenMs: Math.round(totalHiddenMs),
        resumeFlushes: flushes
      };
    },
    flush() {
      if (!document.hidden) scheduleNativeFrame();
      return this.getStatus();
    }
  };
})();
