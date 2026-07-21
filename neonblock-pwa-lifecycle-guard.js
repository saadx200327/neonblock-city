(() => {
  'use strict';

  const diagnostics = {
    recoveries: 0,
    coalescedRecoveries: 0,
    skippedHiddenRecoveries: 0,
    refreshFailures: 0,
    syntheticVisibilityEvents: 0,
    ignoredSyntheticVisibilityEvents: 0,
    lastReason: null,
    lastRecoveredAt: null,
    lastError: null
  };

  let scheduled = false;
  let dispatchingSyntheticVisibility = false;

  function recover(reason = 'manual') {
    if (document.hidden) {
      diagnostics.skippedHiddenRecoveries += 1;
      diagnostics.lastReason = reason;
      return false;
    }

    if (scheduled) {
      diagnostics.coalescedRecoveries += 1;
      diagnostics.lastReason = reason;
      return false;
    }

    scheduled = true;
    requestAnimationFrame(async () => {
      diagnostics.lastReason = reason;

      try {
        await Promise.resolve(window.NeonBlockPWA?.refresh?.());

        dispatchingSyntheticVisibility = true;
        diagnostics.syntheticVisibilityEvents += 1;
        document.dispatchEvent(new Event('visibilitychange'));

        diagnostics.recoveries += 1;
        diagnostics.lastRecoveredAt = new Date().toISOString();
        diagnostics.lastError = null;
      } catch (error) {
        diagnostics.refreshFailures += 1;
        diagnostics.lastError = String(error?.message || error);
        console.warn('[NeonBlock PWA lifecycle] recovery failed', error);
      } finally {
        dispatchingSyntheticVisibility = false;
        scheduled = false;
      }
    });

    return true;
  }

  window.addEventListener('pageshow', () => recover('pageshow'), { passive: true });
  document.addEventListener('resume', () => recover('resume'));
  document.addEventListener('visibilitychange', () => {
    if (dispatchingSyntheticVisibility) {
      diagnostics.ignoredSyntheticVisibilityEvents += 1;
      return;
    }
    if (!document.hidden) recover('visibility-visible');
  });

  window.NeonBlockPWALifecycleGuard = Object.freeze({
    version: 2,
    recover: () => recover('manual'),
    getStatus: () => ({
      active: true,
      scheduled,
      dispatchingSyntheticVisibility,
      hidden: document.hidden,
      ...diagnostics
    })
  });
})();