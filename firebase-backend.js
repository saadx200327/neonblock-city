// Optional NeonBlock City cloud-save bridge.
// This file intentionally does not initialize Firebase by itself and does not contain project secrets.
// To enable cloud saves later, the page owner may expose window.firebaseAuth and window.firebaseDb
// from a Firebase v8-compatible setup. Without that, the game safely uses localStorage.

(() => {
  'use strict';

  const COLLECTION = 'neonblockSaves';
  const MAX_SLOT_LENGTH = 48;
  const READY_RETRY_MS = 1500;
  const READY_RETRY_LIMIT = 20;
  const SLOT_PATTERN = /^[a-zA-Z0-9_-]+$/;

  let retryTimer = 0;
  let retryCount = 0;
  let authUnsubscribe = null;
  let lastError = null;
  let lastEnabledAt = 0;
  let lastSaveAt = 0;
  let lastLoadAt = 0;
  let queuedSaveCount = 0;
  let exactSnapshotSaves = 0;
  let capturedPayloadSnapshots = 0;
  let payloadSnapshotFailures = 0;
  let bridgeGeneration = 0;
  let staleSessionOperations = 0;
  let isolatedSessionQueues = 0;
  const slotSaveQueues = new Map();

  const bridge = {
    enabled: false,
    async save() { return false; },
    async load() { return null; },
    refresh: tryEnable,
    getStatus() {
      return {
        version: 7,
        enabled: bridge.enabled,
        authenticated: Boolean(getCurrentUser()),
        firebaseAvailable: Boolean(getFirestore()),
        retryCount,
        retryPending: Boolean(retryTimer),
        pendingSaveSlots: Array.from(slotSaveQueues.keys()),
        queuedSaveCount,
        exactSnapshotSaves,
        capturedPayloadSnapshots,
        payloadSnapshotFailures,
        bridgeGeneration,
        staleSessionOperations,
        isolatedSessionQueues,
        lastEnabledAt,
        lastSaveAt,
        lastLoadAt,
        lastError: lastError ? String(lastError.message || lastError) : null
      };
    }
  };

  function getCurrentUser() {
    return window.firebaseAuth && window.firebaseAuth.currentUser
      ? window.firebaseAuth.currentUser
      : null;
  }

  function getFirestore() {
    const db = window.firebaseDb;
    return db && typeof db.collection === 'function' ? db : null;
  }

  function normalizeSlot(slot) {
    if (typeof slot !== 'string') throw new TypeError('Cloud-save slot must be a string.');
    const value = slot.trim();
    if (!value || value.length > MAX_SLOT_LENGTH || !SLOT_PATTERN.test(value)) {
      throw new TypeError('Cloud-save slot contains unsupported characters.');
    }
    return value;
  }

  function normalizePayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('Cloud-save data must be an object.');
    }
    return data;
  }

  function snapshotPayload(data) {
    const normalized = normalizePayload(data);
    try {
      const snapshot = typeof structuredClone === 'function'
        ? structuredClone(normalized)
        : JSON.parse(JSON.stringify(normalized));
      capturedPayloadSnapshots += 1;
      return snapshot;
    } catch (error) {
      payloadSnapshotFailures += 1;
      throw new TypeError(`Cloud-save data could not be snapshotted: ${error?.message || 'unsupported value'}`);
    }
  }

  function disableBridge(error) {
    bridgeGeneration += 1;
    bridge.enabled = false;
    bridge.save = async () => false;
    bridge.load = async () => null;
    if (error) {
      lastError = error;
      console.warn('[NeonBlock City] Firebase bridge unavailable; local saves remain active:', error);
    }
  }

  function getSessionQueueKey(generation, user, slot) {
    isolatedSessionQueues += 1;
    return `${generation}:${user.uid}:${slot}`;
  }

  function queueSlotSave(queueKey, task) {
    const previous = slotSaveQueues.get(queueKey) || Promise.resolve();
    const queued = previous.catch(() => false).then(task);
    slotSaveQueues.set(queueKey, queued);
    queuedSaveCount += 1;
    return queued.finally(() => {
      if (slotSaveQueues.get(queueKey) === queued) slotSaveQueues.delete(queueKey);
    });
  }

  async function waitForSlotSave(queueKey) {
    const pending = slotSaveQueues.get(queueKey);
    if (!pending) return;
    try {
      await pending;
    } catch (_) {
      // The save path records its own error; loading should still fall back safely.
    }
  }

  function isActiveBridgeSession(generation, user) {
    const activeUser = getCurrentUser();
    const activeDb = getFirestore();
    if (generation !== bridgeGeneration || !activeUser || !activeDb || activeUser.uid !== user.uid) {
      staleSessionOperations += 1;
      return null;
    }
    return { user: activeUser, db: activeDb };
  }

  function configureBridge(user, db) {
    const generation = ++bridgeGeneration;
    bridge.enabled = true;
    lastError = null;
    lastEnabledAt = Date.now();

    bridge.save = async (slot, data) => {
      try {
        const safeSlot = normalizeSlot(slot);
        const safeData = snapshotPayload(data);
        const queueKey = getSessionQueueKey(generation, user, safeSlot);
        return await queueSlotSave(queueKey, async () => {
          const session = isActiveBridgeSession(generation, user);
          if (!session) return false;

          await session.db.collection(COLLECTION)
            .doc(session.user.uid)
            .collection('slots')
            .doc(safeSlot)
            .set({ ...safeData, updatedAt: Date.now() });
          exactSnapshotSaves += 1;
          lastSaveAt = Date.now();
          lastError = null;
          return true;
        });
      } catch (error) {
        if (generation !== bridgeGeneration) {
          staleSessionOperations += 1;
          return false;
        }
        lastError = error;
        console.warn('[NeonBlock City] Cloud save failed; local save remains available:', error);
        return false;
      }
    };

    bridge.load = async (slot) => {
      try {
        const safeSlot = normalizeSlot(slot);
        const queueKey = getSessionQueueKey(generation, user, safeSlot);
        await waitForSlotSave(queueKey);

        const session = isActiveBridgeSession(generation, user);
        if (!session) return null;

        const snapshot = await session.db.collection(COLLECTION)
          .doc(session.user.uid)
          .collection('slots')
          .doc(safeSlot)
          .get();
        if (generation !== bridgeGeneration) {
          staleSessionOperations += 1;
          return null;
        }
        lastLoadAt = Date.now();
        lastError = null;
        const data = snapshot && snapshot.exists ? snapshot.data() : null;
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
      } catch (error) {
        if (generation !== bridgeGeneration) {
          staleSessionOperations += 1;
          return null;
        }
        lastError = error;
        console.warn('[NeonBlock City] Cloud load failed; local save remains available:', error);
        return null;
      }
    };
  }

  function scheduleRetry() {
    if (retryTimer || retryCount >= READY_RETRY_LIMIT || document.visibilityState === 'hidden') return;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      retryCount += 1;
      tryEnable();
    }, READY_RETRY_MS);
  }

  function attachAuthListener() {
    if (authUnsubscribe || !window.firebaseAuth || typeof window.firebaseAuth.onAuthStateChanged !== 'function') return;
    try {
      authUnsubscribe = window.firebaseAuth.onAuthStateChanged(() => {
        retryCount = 0;
        tryEnable();
      });
    } catch (error) {
      lastError = error;
    }
  }

  async function tryEnable() {
    try {
      attachAuthListener();
      const user = getCurrentUser();
      const db = getFirestore();
      if (!user || !db) {
        disableBridge();
        scheduleRetry();
        return false;
      }
      if (!user.uid || typeof user.uid !== 'string') {
        throw new TypeError('Firebase user is missing a valid uid.');
      }
      configureBridge(user, db);
      retryCount = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = 0;
      }
      return true;
    } catch (error) {
      disableBridge(error);
      scheduleRetry();
      return false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !bridge.enabled) {
      retryCount = 0;
      tryEnable();
    }
  });

  window.addEventListener('online', () => {
    if (!bridge.enabled) {
      retryCount = 0;
      tryEnable();
    }
  });

  window.addEventListener('pagehide', () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = 0;
    }
  });

  window.NeonBlockCloud = bridge;
  window.addEventListener('load', tryEnable, { once: true });
})();