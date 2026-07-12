(() => {
  'use strict';

  const DEBOUNCE_MS = 120;
  let refreshTimer = 0;
  let refreshes = 0;
  let releases = 0;
  let lastReason = 'boot';
  let lastViewport = snapshotViewport();

  function snapshotViewport() {
    const viewport = window.visualViewport;
    return {
      width: Math.round(viewport?.width || window.innerWidth || 0),
      height: Math.round(viewport?.height || window.innerHeight || 0),
      scale: Number((viewport?.scale || 1).toFixed(3)),
      offsetLeft: Math.round(viewport?.offsetLeft || 0),
      offsetTop: Math.round(viewport?.offsetTop || 0),
      orientation: screen.orientation?.type || (innerWidth > innerHeight ? 'landscape' : 'portrait')
    };
  }

  function releaseControls(reason) {
    try {
      window.NeonBlockControlReleaseGuard?.release?.(reason);
      window.NeonBlockMobilePointerGuard?.releaseAll?.(reason);
      releases += 1;
    } catch (error) {
      console.warn('[NeonBlock] mobile viewport release failed', error);
    }
  }

  function refresh(reason, release = false) {
    lastReason = reason;
    if (release) releaseControls(reason);
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      lastViewport = snapshotViewport();
      try {
        window.NeonBlockMobileActions?.refresh?.();
        refreshes += 1;
      } catch (error) {
        console.warn('[NeonBlock] mobile action layout refresh failed', error);
      }
    }, DEBOUNCE_MS);
  }

  function viewportChangedMeaningfully() {
    const next = snapshotViewport();
    return next.orientation !== lastViewport.orientation ||
      Math.abs(next.width - lastViewport.width) > 48 ||
      Math.abs(next.height - lastViewport.height) > 96 ||
      Math.abs(next.scale - lastViewport.scale) > 0.15;
  }

  function onViewportChange(reason) {
    refresh(reason, viewportChangedMeaningfully());
  }

  addEventListener('orientationchange', () => refresh('orientationchange', true), { passive: true });
  addEventListener('pageshow', () => refresh('pageshow', true), { passive: true });
  addEventListener('resize', () => onViewportChange('window-resize'), { passive: true });

  if (window.visualViewport) {
    visualViewport.addEventListener('resize', () => onViewportChange('visual-viewport-resize'), { passive: true });
    visualViewport.addEventListener('scroll', () => refresh('visual-viewport-scroll'), { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh('visibility-resume', true);
  });

  window.NeonBlockMobileViewportGuard = {
    refresh: (reason = 'manual') => refresh(reason, false),
    releaseAndRefresh: (reason = 'manual') => refresh(reason, true),
    getStatus: () => ({
      version: 1,
      pending: Boolean(refreshTimer),
      refreshes,
      releases,
      lastReason,
      viewport: snapshotViewport()
    })
  };

  refresh('boot');
})();
