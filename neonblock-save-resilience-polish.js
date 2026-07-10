(() => {
  'use strict';

  const SAVE_PREFIX = 'neonblock:';
  const BACKUP_PREFIX = 'neonblock:backup:';
  const QUARANTINE_PREFIX = 'neonblock:quarantine:';
  const VALID_SLOTS = new Set(['slot1', 'slot2']);

  function notify(message) {
    const popup = document.getElementById('reward-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => popup.classList.add('hidden'), 2400);
  }

  function isFiniteVector(value) {
    return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite);
  }

  function validateSave(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Save is not an object';
    if (!isFiniteVector(data.pos)) return 'Player position is invalid';
    if (data.cash !== undefined && !Number.isFinite(data.cash)) return 'Cash value is invalid';
    if (data.xp !== undefined && !Number.isFinite(data.xp)) return 'XP value is invalid';
    if (data.level !== undefined && (!Number.isFinite(data.level) || data.level < 1)) return 'Level value is invalid';
    if (data.yaw !== undefined && !Number.isFinite(data.yaw)) return 'Facing direction is invalid';
    if (data.ownedLots !== undefined && (!data.ownedLots || typeof data.ownedLots !== 'object' || Array.isArray(data.ownedLots))) return 'Ownership data is invalid';
    if (data.completed !== undefined && (!data.completed || typeof data.completed !== 'object' || Array.isArray(data.completed))) return 'Mission data is invalid';
    return '';
  }

  function parseSlot(slot) {
    const key = SAVE_PREFIX + slot;
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: false, reason: 'No save exists in this slot' };
    try {
      const data = JSON.parse(raw);
      const reason = validateSave(data);
      return reason ? { ok: false, reason, raw } : { ok: true, data, raw };
    } catch (error) {
      return { ok: false, reason: `Unreadable JSON: ${error.message}`, raw };
    }
  }

  function quarantine(slot, result) {
    if (!result.raw) return;
    const key = `${QUARANTINE_PREFIX}${slot}:${Date.now()}`;
    try { localStorage.setItem(key, result.raw); } catch (_) {}
  }

  function backup(slot) {
    const result = parseSlot(slot);
    if (!result.ok) return result;
    try {
      localStorage.setItem(BACKUP_PREFIX + slot, result.raw);
      return result;
    } catch (error) {
      return { ok: false, reason: `Backup failed: ${error.message}` };
    }
  }

  function restoreBackup(slot) {
    const raw = localStorage.getItem(BACKUP_PREFIX + slot);
    if (!raw) return { ok: false, reason: 'No healthy backup is available' };
    try {
      const data = JSON.parse(raw);
      const reason = validateSave(data);
      if (reason) return { ok: false, reason };
      localStorage.setItem(SAVE_PREFIX + slot, raw);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.btn-load-slot');
    if (!button) return;
    const slot = button.dataset.slot;
    if (!VALID_SLOTS.has(slot)) return;
    const result = parseSlot(slot);
    if (result.ok) {
      backup(slot);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    quarantine(slot, result);
    const restored = restoreBackup(slot);
    if (restored.ok) {
      notify(`${slot} was damaged; restored the last healthy backup. Tap Load again.`);
    } else {
      notify(`${slot} could not load safely. Corrupt data was preserved for recovery.`);
      console.warn('[NeonBlock Save Resilience]', result.reason, restored.reason);
    }
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.btn-save-slot');
    if (!button) return;
    const slot = button.dataset.slot;
    if (!VALID_SLOTS.has(slot)) return;
    setTimeout(() => {
      const result = backup(slot);
      if (!result.ok) console.warn('[NeonBlock Save Resilience] Backup skipped:', result.reason);
    }, 0);
  });

  window.addEventListener('pagehide', () => {
    VALID_SLOTS.forEach((slot) => backup(slot));
  });

  window.NeonBlockSaveResilience = {
    validateSave,
    inspect: (slot) => VALID_SLOTS.has(slot) ? parseSlot(slot) : { ok: false, reason: 'Unknown slot' },
    restoreBackup: (slot) => VALID_SLOTS.has(slot) ? restoreBackup(slot) : { ok: false, reason: 'Unknown slot' }
  };
})();