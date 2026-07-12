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

  const bridge = {
    enabled: false,
    async save() { return false; },
    async load() { return null; },
    refresh: tryEnable,
    getStatus() {
      return {
        version: 2,
        enabled: bridge.enabled,
        authenticated: Boolean(getCurrentUser()),
        firebaseAvailable: Boolean(getFirestore()),
        retryCount,
        retryPending: Boolean(retryTimer),
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

  function disableBridge(error) {
    bridge.enabled = false;
    bridge.save = async () => false;
    bridge.load = async () => null;
    if (error) {
      lastError = error;
      console.warn('[NeonBlock City] Firebase bridge unavailable; local saves remain active:', error);
    }
  }

  function configureBridge(user, db) {
    bridge.enabled = true;
    lastError = null;
    lastEnabledAt = Date.now();

    bridge.save = async (slot, data) => {
      try {
        const activeUser = getCurrentUser();
        const activeDb = getFirestore();
        if (!activeUser || !activeDb || activeUser.uid !== user.uid) {
          disableBridge();
          scheduleRetry();
          return false;
        }

        const safeSlot = normalizeSlot(slot);
        const safeData = normalizePayload(data);
        await activeDb.collection(COLLECTION)
          .doc(activeUser.uid)
          .collection('slots')
          .doc(safeSlot)
          .set({ ...safeData, updatedAt: Date.now() }, { merge: true });
        lastSaveAt = Date.now();
        lastError = null;
        return true;
      } catch (error) {
        lastError = error;
        console.warn('[NeonBlock City] Cloud save failed; local save remains available:', error);
        return false;
      }
    };

    bridge.load = async (slot) => {
      try {
        const activeUser = getCurrentUser();
        const activeDb = getFirestore();
        if (!activeUser || !activeDb || activeUser.uid !== user.uid) {
          disableBridge();
          scheduleRetry();
          return null;
        }

        const safeSlot = normalizeSlot(slot);
        const snapshot = await activeDb.collection(COLLECTION)
          .doc(activeUser.uid)
          .collection('slots')
          .doc(safeSlot)
          .get();
        lastLoadAt = Date.now();
        lastError = null;
        const data = snapshot && snapshot.exists ? snapshot.data() : null;
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
      } catch (error) {
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
