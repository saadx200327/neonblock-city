(() => {
  'use strict';

  if (window.NeonBlockFrameLifecycleGuard) return;

  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const pending = new Map();
  const MAX_CALLBACKS_PER_FRAME = 120;
  let nextId = 1;
  let nativeHandle = null;
  let frozen = false;
  let pageHidden = false;
  let pausedAt = document.hidden ? performance.now() : null;
  let totalHiddenMs = 0;
  let flushes = 0;
  let lifecyclePauses = 0;
  let lifecycleResumes = 0;
  let deferredCallbacks = 0;
  let peakQueuedCallbacks = 0;
  let lastFrameBatchSize = 0;
  let lastLifecycleReason = document.hidden ? 'initial-hidden' : 'visible';

  function isSuspended() {
    return document.hidden || frozen || pageHidden;
  }

  function cancelNativeFrame() {
    if (nativeHandle === null) return;
    nativeCancelAnimationFrame(nativeHandle);
    nativeHandle = null;
  }

  function pause(reason) {
    if (pausedAt === null) pausedAt = performance.now();
    lastLifecycleReason = reason;
    lifecyclePauses += 1;
    cancelNativeFrame();
  }

  function resume(reason) {
    if (isSuspended()) return;
    if (pausedAt !== null) {
      totalHiddenMs += Math.max(0, performance.now() - pausedAt);
      pausedAt = null;
    }
    lastLifecycleReason = reason;
    lifecycleResumes += 1;
    flushes += 1;
    scheduleNativeFrame();
  }

  function takeFrameBatch() {
    const batch = [];
    for (const entry of pending) {
      batch.push(entry);
      pending.delete(entry[0]);
      if (batch.length >= MAX_CALLBACKS_PER_FRAME) break;
    }
    return batch;
  }

  function runFrame(now) {
    nativeHandle = null;
    if (isSuspended()) return;

    const batch = takeFrameBatch();
    lastFrameBatchSize = batch.length;
    if (pending.size) deferredCallbacks += pending.size;

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
    if (isSuspended() || nativeHandle !== null || !pending.size) return;
    nativeHandle = nativeRequestAnimationFrame(runFrame);
  }

  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    if (typeof callback !== 'function') throw new TypeError('requestAnimationFrame callback must be a function');
    const id = nextId++;
    pending.set(id, callback);
    peakQueuedCallbacks = Math.max(peakQueuedCallbacks, pending.size);
    scheduleNativeFrame();
    return id;
  };

  window.cancelAnimationFrame = function cancelAnimationFrame(id) {
    pending.delete(id);
    if (!pending.size) cancelNativeFrame();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause('visibility-hidden');
      return;
    }
    resume('visibility-visible');
  });

  document.addEventListener('freeze', () => {
    frozen = true;
    pause('document-freeze');
  });

  document.addEventListener('resume', () => {
    frozen = false;
    resume('document-resume');
  });

  window.addEventListener('pagehide', (event) => {
    pageHidden = true;
    pause(event.persisted ? 'pagehide-bfcache' : 'pagehide');
  });

  window.addEventListener('pageshow', (event) => {
    pageHidden = false;
    resume(event.persisted ? 'pageshow-bfcache' : 'pageshow');
  });

  window.NeonBlockFrameLifecycleGuard = {
    getStatus() {
      return {
        version: 3,
        hidden: document.hidden,
        frozen,
        pageHidden,
        suspended: isSuspended(),
        queuedCallbacks: pending.size,
        nativeFrameScheduled: nativeHandle !== null,
        pausedAt,
        totalHiddenMs: Math.round(totalHiddenMs),
        resumeFlushes: flushes,
        lifecyclePauses,
        lifecycleResumes,
        maxCallbacksPerFrame: MAX_CALLBACKS_PER_FRAME,
        deferredCallbacks,
        peakQueuedCallbacks,
        lastFrameBatchSize,
        lastLifecycleReason
      };
    },
    flush() {
      if (!isSuspended()) scheduleNativeFrame();
      return this.getStatus();
    }
  };
})();
