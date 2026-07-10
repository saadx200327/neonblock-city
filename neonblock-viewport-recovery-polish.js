(() => {
  'use strict';

  const state = {
    scheduled: false,
    dispatching: false,
    refreshes: 0,
    lastWidth: 0,
    lastHeight: 0,
    lastReason: 'init'
  };

  function viewportSize() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1));
    return { width, height };
  }

  function applyViewport(reason = 'unknown') {
    state.scheduled = false;
    const { width, height } = viewportSize();
    document.documentElement.style.setProperty('--neonblock-vh', `${height * 0.01}px`);

    const changed = width !== state.lastWidth || height !== state.lastHeight;
    state.lastWidth = width;
    state.lastHeight = height;
    state.lastReason = reason;
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
  }

  function schedule(reason) {
    if (state.dispatching || state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => applyViewport(reason));
  }

  window.visualViewport?.addEventListener('resize', () => schedule('visualViewport.resize'), { passive: true });
  window.visualViewport?.addEventListener('scroll', () => schedule('visualViewport.scroll'), { passive: true });
  window.addEventListener('orientationchange', () => {
    schedule('orientationchange');
    setTimeout(() => schedule('orientationchange-settled'), 250);
  }, { passive: true });
  window.addEventListener('pageshow', () => schedule('pageshow'), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule('visibilitychange');
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => schedule('document-resize'));
    observer.observe(document.documentElement);
  }

  window.NeonBlockViewportRecovery = {
    refresh: () => applyViewport('manual'),
    getStatus: () => ({ ...state })
  };

  schedule('startup');
})();
