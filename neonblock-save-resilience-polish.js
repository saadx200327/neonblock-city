(() => {
  'use strict';

  const SAVE_PREFIX = 'neonblock:';
  const BACKUP_PREFIX = 'neonblock:backup:';
  const QUARANTINE_PREFIX = 'neonblock:quarantine:';
  const VALID_SLOTS = new Set(['slot1', 'slot2']);
  const SAFE_QUALITY = new Set(['auto', 'low', 'medium', 'high']);
  const MAX_POSITION = 100000;
  const MAX_COLLECTION = 5000;
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const diagnostics = {
    version: 3,
    storageReadFailures: 0,
    storageWriteFailures: 0,
    quarantinedSaves: 0,
    restoredBackups: 0,
    blockedImports: 0,
    lastError: ''
  };

  function notify(message) {
    const popup = document.getElementById('reward-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => popup.classList.add('hidden'), 2400);
  }

  function recordStorageError(error, operation) {
    const message = `${operation}: ${error?.message || error || 'storage unavailable'}`;
    diagnostics.lastError = message;
    console.warn('[NeonBlock Save Resilience]', message);
  }

  function readStorage(key) {
    try {
      return { ok: true, value: localStorage.getItem(key) };
    } catch (error) {
      diagnostics.storageReadFailures++;
      recordStorageError(error, `Read ${key}`);
      return { ok: false, reason: 'Browser storage is unavailable' };
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return { ok: true };
    } catch (error) {
      diagnostics.storageWriteFailures++;
      recordStorageError(error, `Write ${key}`);
      return { ok: false, reason: 'Browser storage is unavailable or full' };
    }
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function hasUnsafeKeys(value) {
    return Object.keys(value).some((key) => BLOCKED_KEYS.has(key));
  }

  function isFiniteVector(value) {
    return Array.isArray(value)
      && value.length >= 3
      && value.slice(0, 3).every((part) => Number.isFinite(part) && Math.abs(part) <= MAX_POSITION);
  }

  function isSafeCounter(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function validateRecord(value, label, maxKeys = MAX_COLLECTION) {
    if (!isPlainRecord(value)) return `${label} data is invalid`;
    if (hasUnsafeKeys(value)) return `${label} data contains an unsafe key`;
    if (Object.keys(value).length > maxKeys) return `${label} data is too large`;
    return '';
  }

  function validateVehicle(vehicle) {
    if (vehicle == null) return '';
    if (!isPlainRecord(vehicle) || hasUnsafeKeys(vehicle)) return 'Vehicle data is invalid';
    if (typeof vehicle.id !== 'string' || !vehicle.id || vehicle.id.length > 128) return 'Vehicle ID is invalid';
    if (vehicle.pos !== undefined && !isFiniteVector(vehicle.pos)) return 'Vehicle position is invalid';
    if (vehicle.hp !== undefined && !isSafeCounter(vehicle.hp, 0, 1000)) return 'Vehicle HP is invalid';
    if (vehicle.gas !== undefined && !isSafeCounter(vehicle.gas, 0, 1000)) return 'Vehicle gas is invalid';
    return '';
  }

  function validateSave(data) {
    if (!isPlainRecord(data) || hasUnsafeKeys(data)) return 'Save is not a safe object';
    if (!isFiniteVector(data.pos)) return 'Player position is invalid';
    if (data.cash !== undefined && !isSafeCounter(data.cash, 0, 1e12)) return 'Cash value is invalid';
    if (data.xp !== undefined && !isSafeCounter(data.xp, 0, 1e9)) return 'XP value is invalid';
    if (data.level !== undefined && !isSafeCounter(data.level, 1, 100000)) return 'Level value is invalid';
    if (data.wanted !== undefined && !isSafeCounter(data.wanted, 0, 100000)) return 'Wanted value is invalid';
    if (data.yaw !== undefined && (!Number.isFinite(data.yaw) || Math.abs(data.yaw) > 1e6)) return 'Facing direction is invalid';
    if (data.at !== undefined && (!Number.isFinite(data.at) || data.at < 0 || data.at > Date.now() + 86400000)) return 'Save timestamp is invalid';
    const ownershipReason = data.ownedLots === undefined ? '' : validateRecord(data.ownedLots, 'Ownership');
    if (ownershipReason) return ownershipReason;
    const missionReason = data.completed === undefined ? '' : validateRecord(data.completed, 'Mission');
    if (missionReason) return missionReason;
    if (data.collectedCrateIds !== undefined) {
      if (!Array.isArray(data.collectedCrateIds) || data.collectedCrateIds.length > MAX_COLLECTION) return 'Collected crate data is invalid';
      if (data.collectedCrateIds.some((id) => typeof id !== 'string' || !id || id.length > 128)) return 'Collected crate ID is invalid';
    }
    if (data.collectedCrates !== undefined && !isSafeCounter(data.collectedCrates, 0, MAX_COLLECTION)) return 'Collected crate count is invalid';
    if (data.graphicsQuality !== undefined && !SAFE_QUALITY.has(data.graphicsQuality)) return 'Graphics quality is invalid';
    if (data.activeMissionId !== undefined && typeof data.activeMissionId !== 'string') return 'Mission selection is invalid';
    return validateVehicle(data.activeVehicle);
  }

  function parseRaw(raw) {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const reason = validateSave(data);
      return reason ? { ok: false, reason, raw: typeof raw === 'string' ? raw : JSON.stringify(raw) } : { ok: true, data, raw: typeof raw === 'string' ? raw : JSON.stringify(raw) };
    } catch (error) {
      return { ok: false, reason: `Unreadable JSON: ${error.message}`, raw: typeof raw === 'string' ? raw : '' };
    }
  }

  function parseSlot(slot) {
    const stored = readStorage(SAVE_PREFIX + slot);
    if (!stored.ok) return { ok: false, reason: stored.reason };
    if (!stored.value) return { ok: false, reason: 'No save exists in this slot' };
    return parseRaw(stored.value);
  }

  function quarantine(slot, result) {
    if (!result.raw) return { ok: false, reason: 'No corrupt save payload to preserve' };
    const stored = writeStorage(`${QUARANTINE_PREFIX}${slot}:${Date.now()}`, result.raw);
    if (stored.ok) diagnostics.quarantinedSaves++;
    return stored;
  }

  function backup(slot) {
    const result = parseSlot(slot);
    if (!result.ok) return result;
    const stored = writeStorage(BACKUP_PREFIX + slot, result.raw);
    return stored.ok ? result : stored;
  }

  function restoreBackup(slot) {
    const stored = readStorage(BACKUP_PREFIX + slot);
    if (!stored.ok) return stored;
    if (!stored.value) return { ok: false, reason: 'No healthy backup is available' };
    const parsed = parseRaw(stored.value);
    if (!parsed.ok) return parsed;
    const restored = writeStorage(SAVE_PREFIX + slot, parsed.raw);
    if (!restored.ok) return restored;
    diagnostics.restoredBackups++;
    return { ok: true };
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
    const preserved = quarantine(slot, result);
    const restored = restoreBackup(slot);
    if (restored.ok) {
      notify(`${slot} was damaged; restored the last healthy backup. Tap Load again.`);
    } else if (result.reason === 'Browser storage is unavailable') {
      notify('Browser storage is unavailable. Your current game remains open, but this slot cannot load.');
    } else {
      notify(preserved.ok
        ? `${slot} could not load safely. Corrupt data was preserved for recovery.`
        : `${slot} could not load safely, and browser storage could not preserve a recovery copy.`);
      console.warn('[NeonBlock Save Resilience]', result.reason, restored.reason);
    }
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#btn-import');
    if (!button) return;
    const field = document.getElementById('export-json');
    const result = parseRaw(field?.value || '');
    if (result.ok) return;
    diagnostics.blockedImports++;
    event.preventDefault();
    event.stopImmediatePropagation();
    diagnostics.lastError = `Import blocked: ${result.reason}`;
    console.warn('[NeonBlock Save Resilience]', diagnostics.lastError);
    notify(`Import blocked: ${result.reason}`);
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
    VALID_SLOTS.forEach((slot) => {
      const result = backup(slot);
      if (!result.ok && result.reason !== 'No save exists in this slot') {
        console.warn('[NeonBlock Save Resilience] Exit backup skipped:', slot, result.reason);
      }
    });
  });

  window.NeonBlockSaveResilience = {
    validateSave,
    inspect: (slot) => VALID_SLOTS.has(slot) ? parseSlot(slot) : { ok: false, reason: 'Unknown slot' },
    restoreBackup: (slot) => VALID_SLOTS.has(slot) ? restoreBackup(slot) : { ok: false, reason: 'Unknown slot' },
    validateImport: (raw) => parseRaw(raw),
    getStatus: () => ({ ...diagnostics })
  };
})();
