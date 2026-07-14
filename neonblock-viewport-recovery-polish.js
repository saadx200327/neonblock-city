(() => {
  'use strict';

  const state = {
    scheduled: false,
    frameId: 0,
    dispatching: false,
    suspended: document.hidden,
    frozen: false,
    pageHidden: false,
    refreshes: 0,
    cancelledFrames: 0,
    skippedWhileSuspended: 0,
    lifecyclePauses: 0,
    lifecycleResumes: 0,
    lastWidth: 0,
    lastHeight: 0,
    lastReason: 'init',
    pendingReason: ''
  };

  function isSuspended() {
    return document.hidden || state.frozen || state.pageHidden;
  }

  function viewportSize() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1));
    return { width, height };
  }

  function cancelScheduled(reason = 'cancelled') {
    if (!state.scheduled) return false;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    state.scheduled = false;
    state.cancelledFrames += 1;
    state.pendingReason = reason;
    return true;
  }

  function applyViewport(reason = 'unknown') {
    state.scheduled = false;
    state.frameId = 0;

    if (isSuspended()) {
      state.skippedWhileSuspended += 1;
      state.pendingReason = reason;
      return false;
    }

    const { width, height } = viewportSize();
    document.documentElement.style.setProperty('--neonblock-vh', `${height * 0.01}px`);

    const changed = width !== state.lastWidth || height !== state.lastHeight;
    state.lastWidth = width;
    state.lastHeight = height;
    state.lastReason = reason;
    state.pendingReason = '';
    state.refreshes += 1;

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    if (changed && !state.dispatching) {
      state.dispatching = true;
      window.dispatchEvent(new Event('resize'));
      queueMicrotask(() => { state.dispatching = false; });
    }

    return true;
  }

  function schedule(reason = 'unknown') {
    state.pendingReason = reason;

    if (state.dispatching || state.scheduled) return false;
    if (isSuspended()) {
      state.skippedWhileSuspended += 1;
      return false;
    }

    state.scheduled = true;
    state.frameId = requestAnimationFrame(() => applyViewport(state.pendingReason || reason));
    return true;
  }

  function pause(reason) {
    const wasSuspended = state.suspended;
    state.suspended = true;
    cancelScheduled(reason);
    state.lastReason = reason;
    if (!wasSuspended) state.lifecyclePauses += 1;
  }

  function resume(reason) {
    if (isSuspended()) return false;
    const wasSuspended = state.suspended;
    state.suspended = false;
    if (wasSuspended) state.lifecycleResumes += 1;
    return schedule(reason);
  }

  window.visualViewport?.addEventListener('resize', () => schedule('visualViewport.resize'), { passive: true });
  window.visualViewport?.addEventListener('scroll', () => schedule('visualViewport.scroll'), { passive: true });
  window.addEventListener('orientationchange', () => {
    schedule('orientationchange');
    setTimeout(() => schedule('orientationchange-settled'), 250);
  }, { passive: true });

  window.addEventListener('pagehide', () => {
    state.pageHidden = true;
    pause('pagehide');
  }, { passive: true });

  window.addEventListener('pageshow', () => {
    state.pageHidden = false;
    resume('pageshow');
  }, { passive: true });

  document.addEventListener('freeze', () => {
    state.frozen = true;
    pause('freeze');
  });

  document.addEventListener('resume', () => {
    state.frozen = false;
    resume('resume');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('visibilitychange-hidden');
    else resume('visibilitychange-visible');
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => schedule('document-resize'));
    observer.observe(document.documentElement);
  }

  window.NeonBlockViewportRecovery = {
    version: 2,
    refresh: () => applyViewport('manual'),
    schedule,
    getStatus: () => ({
      ...state,
      suspended: isSuspended()
    })
  };

  if (!isSuspended()) {
    state.suspended = false;
    schedule('startup');
  }
})();
