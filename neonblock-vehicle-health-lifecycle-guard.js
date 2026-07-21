(() => {
  'use strict';

  const diagnostics = {
    version: 2,
    pageshowRecoveries: 0,
    resumeRecoveries: 0,
    visibilityRecoveries: 0,
    skippedHidden: 0,
    coalescedRecoveries: 0,
    refreshFailures: 0,
    lastReason: 'startup'
  };

  let recoveryQueued = false;

  function recover(reason) {
    diagnostics.lastReason = reason;
    if (document.hidden) {
      diagnostics.skippedHidden += 1;
      return false;
    }
    if (recoveryQueued) {
      diagnostics.coalescedRecoveries += 1;
      return false;
    }

    recoveryQueued = true;
    requestAnimationFrame(() => {
      try {
        // The existing vehicle-health module restarts its interval from its
        // visibilitychange handler. Dispatching here restores that scheduler
        // after BFCache/PWA lifecycle resumes where visibility may not toggle.
        document.dispatchEvent(new Event('visibilitychange'));
        window.NeonBlockVehicleHealth?.refresh?.();
      } catch (error) {
        diagnostics.refreshFailures += 1;
        diagnostics.lastReason = `${reason}: ${error?.message || error || 'recovery failed'}`;
      } finally {
        recoveryQueued = false;
      }
    });
    return true;
  }

  window.addEventListener('pageshow', () => {
    diagnostics.pageshowRecoveries += 1;
    recover('pageshow');
  }, { passive: true });

  document.addEventListener('resume', () => {
    diagnostics.resumeRecoveries += 1;
    recover('resume');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    diagnostics.visibilityRecoveries += 1;
    recover('visibility-visible');
  });

  window.NeonBlockVehicleHealthLifecycleGuard = Object.freeze({
    version: 2,
    recover: () => recover('manual'),
    getStatus: () => ({ ...diagnostics, recoveryQueued })
  });
})();
