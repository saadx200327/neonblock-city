(() => {
  'use strict';

  const LEGACY_CLAIM_KEY = 'neonblock:property-last-claim';
  const SLOT_KEY_PREFIX = 'neonblock:property-last-claim:v2:';
  const VALID_SLOTS = new Set(['slot1', 'slot2']);
  const claimButton = document.getElementById('property-polish-claim');
  let activeSlot = null;
  let migratedLegacy = false;

  function currentSlot() {
    try {
      const slot = window.NeonBlockGame?.getSnapshot?.()?.player?.slot;
      return VALID_SLOTS.has(slot) ? slot : 'slot1';
    } catch (_) {
      return 'slot1';
    }
  }

  function slotKey(slot = currentSlot()) {
    return `${SLOT_KEY_PREFIX}${slot}`;
  }

  function migrateLegacyClaim() {
    if (migratedLegacy) return;
    migratedLegacy = true;
    try {
      const legacy = localStorage.getItem(LEGACY_CLAIM_KEY);
      if (legacy && !localStorage.getItem(slotKey('slot1'))) {
        localStorage.setItem(slotKey('slot1'), legacy);
      }
    } catch (_) {}
  }

  function activateSlot(slot = currentSlot()) {
    migrateLegacyClaim();
    activeSlot = slot;
    try {
      const scoped = localStorage.getItem(slotKey(slot));
      if (scoped === null) localStorage.removeItem(LEGACY_CLAIM_KEY);
      else localStorage.setItem(LEGACY_CLAIM_KEY, scoped);
    } catch (_) {}
  }

  function persistActiveSlot() {
    if (!activeSlot) activeSlot = currentSlot();
    try {
      const value = localStorage.getItem(LEGACY_CLAIM_KEY);
      if (value === null) localStorage.removeItem(slotKey(activeSlot));
      else localStorage.setItem(slotKey(activeSlot), value);
    } catch (_) {}
  }

  function syncSlot() {
    const next = currentSlot();
    if (next === activeSlot) return;
    if (activeSlot) persistActiveSlot();
    activateSlot(next);
  }

  claimButton?.addEventListener('click', () => {
    syncSlot();
    setTimeout(persistActiveSlot, 0);
  }, true);

  window.addEventListener('pagehide', persistActiveSlot);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistActiveSlot();
    else syncSlot();
  });

  activateSlot(currentSlot());
  const timer = setInterval(syncSlot, 500);

  window.NeonBlockPropertySlotPolish = {
    getStatus: () => ({
      installed: true,
      activeSlot,
      storageKey: slotKey(activeSlot || currentSlot()),
      legacyMigrated: migratedLegacy
    }),
    sync: syncSlot,
    dispose: () => clearInterval(timer)
  };
})();
