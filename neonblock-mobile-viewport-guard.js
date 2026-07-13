(() => {
  'use strict';

  const DEBOUNCE_MS = 120;
  let refreshTimer = 0;
  let refreshes = 0;
  let releases = 0;
  let skippedRefreshes = 0;
  let pauseCount = 0;
  let resumeCount = 0;
  let frozen = false;
  let pageHidden = false;
  let lastReason = 'boot';
  let lastLifecycleReason = 'boot';
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

  function isPaused() {
    return document.hidden || frozen || pageHidden;
  }

  function clearPendingRefresh() {
    if (!refreshTimer) return;
    clearTimeout(refreshTimer);
    refreshTimer = 0;
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
    clearPendingRefresh();

    if (isPaused()) {
      skippedRefreshes += 1;
      return;
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      if (isPaused()) {
        skippedRefreshes += 1;
        return;
      }

      lastViewport = snapshotViewport();
      try {
        window.NeonBlockMobileActions?.refresh?.();
        window.NeonBlockMobileMissionControl?.refresh?.();
        refreshes += 1;
      } catch (error) {
        console.warn('[NeonBlock] mobile action layout refresh failed', error);
      }
    }, DEBOUNCE_MS);
  }

  function pause(reason) {
    lastLifecycleReason = reason;
    clearPendingRefresh();
    releaseControls(reason);
    pauseCount += 1;
  }

  function resume(reason) {
    lastLifecycleReason = reason;
    if (isPaused()) return;
    resumeCount += 1;
    lastViewport = snapshotViewport();
    refresh(reason, true);
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
  addEventListener('resize', () => onViewportChange('window-resize'), { passive: true });
  addEventListener('pagehide', () => {
    pageHidden = true;
    pause('pagehide');
  }, { passive: true });
  addEventListener('pageshow', () => {
    pageHidden = false;
    resume('pageshow');
  }, { passive: true });

  document.addEventListener('freeze', () => {
    frozen = true;
    pause('freeze');
  });
  document.addEventListener('resume', () => {
    frozen = false;
    resume('resume');
  });

  if (window.visualViewport) {
    visualViewport.addEventListener('resize', () => onViewportChange('visual-viewport-resize'), { passive: true });
    visualViewport.addEventListener('scroll', () => refresh('visual-viewport-scroll'), { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('visibility-hidden');
    else resume('visibility-resume');
  });

  window.NeonBlockMobileViewportGuard = {
    refresh: (reason = 'manual') => refresh(reason, false),
    releaseAndRefresh: (reason = 'manual') => refresh(reason, true),
    getStatus: () => ({
      version: 2,
      pending: Boolean(refreshTimer),
      paused: isPaused(),
      frozen,
      pageHidden,
      refreshes,
      releases,
      skippedRefreshes,
      pauseCount,
      resumeCount,
      lastReason,
      lastLifecycleReason,
      viewport: snapshotViewport()
    })
  };

  refresh('boot');
})();
