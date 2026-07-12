(() => {
  'use strict';

  const VERSION = 1;
  const STORAGE_PREFIX = 'neonblock:garage:v2:';
  const BACKUP_PREFIX = 'neonblock:garage:recovery:';
  const MAX_OWNED = 64;
  const MAX_CLAIMS = 128;
  const POLL_MS = 5000;

  let timer = null;
  let currentSlot = 'slot1';
  let repairs = 0;
  let readFailures = 0;
  let writeFailures = 0;
  let lastRepairAt = 0;
  let lastError = null;

  function game() {
    return window.NeonBlockGame || null;
  }

  function snapshot() {
    try {
      return game()?.getSnapshot?.() || null;
    } catch (error) {
      lastError = String(error?.message || error);
      return null;
    }
  }

  function sanitizeSlot(value) {
    const slot = String(value || 'slot1').trim();
    return /^[a-z0-9_-]{1,32}$/i.test(slot) ? slot : 'slot1';
  }

  function resolveSlot() {
    return sanitizeSlot(snapshot()?.player?.slot || currentSlot);
  }

  function storageKey(slot = currentSlot) {
    return `${STORAGE_PREFIX}${sanitizeSlot(slot)}`;
  }

  function finite(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function cleanPosition(value) {
    if (!Array.isArray(value) || value.length < 3) return null;
    const pos = value.slice(0, 3).map((number) => Number(number));
    if (!pos.every(Number.isFinite)) return null;
    if (Math.abs(pos[0]) > 100000 || Math.abs(pos[1]) > 100000 || Math.abs(pos[2]) > 100000) return null;
    return pos.map((number) => Number(number.toFixed(3)));
  }

  function cleanId(value) {
    const id = String(value || '').trim();
    if (!id || id.length > 96 || ['__proto__', 'prototype', 'constructor'].includes(id)) return null;
    return id;
  }

  function sanitizeOwned(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const records = [];
    for (const [rawId, rawRecord] of Object.entries(input)) {
      const id = cleanId(rawRecord?.id || rawId);
      if (!id || !rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) continue;
      const claimedAt = finite(rawRecord.claimedAt, Date.now(), 0, Date.now() + 86400000);
      const lastSeenAt = finite(rawRecord.lastSeenAt, claimedAt, 0, Date.now() + 86400000);
      records.push({
        id,
        name: String(rawRecord.name || 'Vehicle').slice(0, 80),
        claimedAt,
        lastSeenAt,
        gas: Math.round(finite(rawRecord.gas, 0, 0, 100)),
        hp: Math.round(finite(rawRecord.hp, 100, 0, 100)),
        pos: cleanPosition(rawRecord.pos)
      });
    }
    records.sort((a, b) => (b.lastSeenAt || b.claimedAt) - (a.lastSeenAt || a.claimedAt));
    return Object.fromEntries(records.slice(0, MAX_OWNED).map((record) => [record.id, record]));
  }

  function sanitizeClaims(input, owned) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const claims = [];
    for (const [rawId, rawTimestamp] of Object.entries(input)) {
      const id = cleanId(rawId);
      if (!id || !owned[id]) continue;
      const timestamp = Number(rawTimestamp);
      if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > Date.now() + 86400000) continue;
      claims.push([id, timestamp]);
    }
    claims.sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(claims.slice(0, MAX_CLAIMS));
  }

  function sanitizeGarage(value) {
    const owned = sanitizeOwned(value?.owned);
    return {
      owned,
      serviceClaims: sanitizeClaims(value?.serviceClaims, owned),
      hidden: Boolean(value?.hidden)
    };
  }

  function stableStringify(value) {
    return JSON.stringify(value);
  }

  function safeRead(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      readFailures += 1;
      lastError = String(error?.message || error);
      return null;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      writeFailures += 1;
      lastError = String(error?.message || error);
      return false;
    }
  }

  function repairSlot(slot = resolveSlot()) {
    currentSlot = sanitizeSlot(slot);
    const key = storageKey(currentSlot);
    const raw = safeRead(key);
    if (!raw) return { changed: false, slot: currentSlot, reason: 'empty' };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      lastError = String(error?.message || error);
      const backupKey = `${BACKUP_PREFIX}${currentSlot}:${Date.now()}`;
      safeWrite(backupKey, raw.slice(0, 200000));
      const clean = { owned: {}, serviceClaims: {}, hidden: false };
      if (safeWrite(key, stableStringify(clean))) {
        repairs += 1;
        lastRepairAt = Date.now();
        return { changed: true, slot: currentSlot, reason: 'invalid-json' };
      }
      return { changed: false, slot: currentSlot, reason: 'write-failed' };
    }

    const clean = sanitizeGarage(parsed);
    const next = stableStringify(clean);
    if (next === stableStringify(parsed)) return { changed: false, slot: currentSlot, reason: 'clean' };

    if (safeWrite(key, next)) {
      repairs += 1;
      lastRepairAt = Date.now();
      return { changed: true, slot: currentSlot, reason: 'sanitized' };
    }
    return { changed: false, slot: currentSlot, reason: 'write-failed' };
  }

  function stop() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(immediate = false) {
    stop();
    if (document.hidden) return;
    timer = setTimeout(() => {
      timer = null;
      repairSlot();
      schedule(false);
    }, immediate ? 0 : POLL_MS);
  }

  function getStatus() {
    return {
      version: VERSION,
      slot: currentSlot,
      storageKey: storageKey(),
      running: timer !== null,
      hidden: document.hidden,
      repairs,
      readFailures,
      writeFailures,
      lastRepairAt: lastRepairAt || null,
      lastError
    };
  }

  function boot() {
    currentSlot = resolveSlot();
    repairSlot(currentSlot);
    schedule(false);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else schedule(true);
    });
    window.addEventListener('pagehide', stop);
  }

  window.NeonBlockGarageDataGuard = {
    getStatus,
    repair: repairSlot,
    refresh: () => schedule(true)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
