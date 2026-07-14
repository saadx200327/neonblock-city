(() => {
  'use strict';

  const diagnostics = {
    recoveries: 0,
    coalescedRecoveries: 0,
    skippedHiddenRecoveries: 0,
    refreshFailures: 0,
    lastReason: null,
    lastRecoveredAt: null
  };

  let scheduled = false;

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
    requestAnimationFrame(() => {
      scheduled = false;
      diagnostics.lastReason = reason;

      try {
        window.NeonBlockPWA?.refresh?.();
        document.dispatchEvent(new Event('visibilitychange'));
        diagnostics.recoveries += 1;
        diagnostics.lastRecoveredAt = new Date().toISOString();
      } catch (error) {
        diagnostics.refreshFailures += 1;
        console.warn('[NeonBlock PWA lifecycle] recovery failed', error);
      }
    });

    return true;
  }

  window.addEventListener('pageshow', () => recover('pageshow'), { passive: true });
  document.addEventListener('resume', () => recover('resume'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recover('visibility-visible');
  });

  window.NeonBlockPWALifecycleGuard = Object.freeze({
    version: 1,
    recover: () => recover('manual'),
    getStatus: () => ({
      active: true,
      scheduled,
      hidden: document.hidden,
      ...diagnostics
    })
  });
})();
