(() => {
  'use strict';

  const VERSION = 2;
  const STORAGE_KEY = 'neonblock:cloud-polish:hidden';
  const LAST_TEST_KEY = 'neonblock:cloud-polish:last-test';
  const REFRESH_MS = 2500;
  const $ = (id) => document.getElementById(id);
  let testInFlight = false;
  let refreshTimer = 0;
  let panelRef = null;
  let storageReadFailures = 0;
  let storageWriteFailures = 0;
  let lastStorageError = null;

  function getGame() {
    return window.NeonBlockGame || null;
  }

  function getCloud() {
    return window.NeonBlockCloud || null;
  }

  function safeJson(value) {
    try { return JSON.stringify(value, null, 2); } catch (_) { return '{}'; }
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); }
    catch (error) {
      storageReadFailures += 1;
      lastStorageError = error?.message || 'localStorage read failed';
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      storageWriteFailures += 1;
      lastStorageError = error?.message || 'localStorage write failed';
      return false;
    }
  }

  function notify(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => popup.classList.add('hidden'), 1800);
  }

  function createPanel() {
    const panel = document.createElement('section');
    panel.id = 'cloud-polish-panel';
    panel.innerHTML = `
      <div class="cloud-polish-head">
        <strong>Cloud Save</strong>
        <button id="cloud-polish-toggle" type="button" title="Hide Cloud Save panel">Cld</button>
      </div>
      <div class="cloud-polish-line">Mode: <span id="cloud-polish-mode">checking</span></div>
      <div class="cloud-polish-line">Slot: <span id="cloud-polish-slot">slot1</span></div>
      <div class="cloud-polish-line">Last test: <span id="cloud-polish-last">never</span></div>
      <div class="cloud-polish-actions">
        <button id="cloud-polish-local" type="button">Local Save</button>
        <button id="cloud-polish-test" type="button">Test Cloud</button>
        <button id="cloud-polish-copy" type="button">Copy Report</button>
      </div>
      <p id="cloud-polish-note">Firebase is optional. Local saves stay active when cloud is unavailable.</p>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function getSlot(snapshot) {
    return snapshot?.player?.slot || $('debug-save-slot')?.textContent || 'slot1';
  }

  function getLastTest() {
    try { return JSON.parse(safeStorageGet(LAST_TEST_KEY) || 'null'); } catch (_) { return null; }
  }

  function rememberTest(result) {
    safeStorageSet(LAST_TEST_KEY, JSON.stringify({ ...result, at: Date.now() }));
  }

  function describeLastTest() {
    const last = getLastTest();
    if (!last?.at) return 'never';
    const age = Math.max(0, Math.round((Date.now() - last.at) / 1000));
    return `${last.ok ? 'ok' : 'local only'} ${age}s ago`;
  }

  function storageAvailable() {
    const key = 'neonblock:cloud-polish:probe';
    try {
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function getReport() {
    const game = getGame();
    const cloud = getCloud();
    const snapshot = game?.getSnapshot?.();
    return {
      version: VERSION,
      at: new Date().toISOString(),
      mode: cloud?.enabled ? 'cloud-ready' : 'local-only',
      firebaseBridgePresent: Boolean(cloud),
      cloudEnabled: Boolean(cloud?.enabled),
      currentSlot: getSlot(snapshot),
      cloudTestInFlight: testInFlight,
      localStorageAvailable: storageAvailable(),
      storageReadFailures,
      storageWriteFailures,
      lastStorageError,
      pollingActive: Boolean(refreshTimer),
      pageVisible: !document.hidden,
      hasSaveApi: Boolean(game?.saveState),
      hasLoadApi: Boolean(game?.loadState),
      lastCloudTest: getLastTest(),
      note: 'Cloud saves are optional; this panel never initializes Firebase or changes external project settings.'
    };
  }

  function updatePanel(panel = panelRef) {
    if (!panel?.isConnected) return;
    const cloud = getCloud();
    const game = getGame();
    const snapshot = game?.getSnapshot?.();
    const modeNode = $('cloud-polish-mode');
    const slotNode = $('cloud-polish-slot');
    const lastNode = $('cloud-polish-last');
    if (modeNode) modeNode.textContent = cloud?.enabled ? 'cloud ready' : 'local only';
    if (slotNode) slotNode.textContent = getSlot(snapshot);
    if (lastNode) lastNode.textContent = describeLastTest();
    const testButton = $('cloud-polish-test');
    if (testButton) {
      testButton.disabled = testInFlight;
      testButton.textContent = testInFlight ? 'Testing…' : 'Test Cloud';
      testButton.setAttribute('aria-busy', testInFlight ? 'true' : 'false');
    }
    panel.dataset.mode = cloud?.enabled ? 'cloud' : 'local';
  }

  function stopScheduler() {
    if (!refreshTimer) return;
    clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  function scheduleRefresh() {
    stopScheduler();
    if (document.hidden) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      updatePanel();
      scheduleRefresh();
    }, REFRESH_MS);
  }

  function refreshNow() {
    updatePanel();
    scheduleRefresh();
  }

  function captureLocalSave(game, cloud, slot) {
    if (!game?.saveState) return null;
    const remoteSave = cloud?.save;
    let intercepted = null;

    if (cloud && typeof remoteSave === 'function') {
      cloud.save = async (candidateSlot, data) => {
        intercepted = { slot: candidateSlot, data };
        return true;
      };
    }

    try {
      return game.saveState(slot) || intercepted?.data || null;
    } finally {
      if (cloud && typeof remoteSave === 'function') cloud.save = remoteSave;
    }
  }

  async function testCloud(panel) {
    if (testInFlight) return;
    const game = getGame();
    const cloud = getCloud();
    const snapshot = game?.getSnapshot?.();
    const slot = getSlot(snapshot);

    if (!cloud?.enabled || typeof cloud.save !== 'function') {
      game?.saveState?.(slot);
      rememberTest({ ok: false, reason: 'cloud bridge unavailable', slot });
      updatePanel(panel);
      notify('Cloud unavailable; local save confirmed');
      return;
    }

    testInFlight = true;
    updatePanel(panel);
    try {
      const remoteSave = cloud.save;
      const data = captureLocalSave(game, cloud, slot);
      if (!data) throw new Error('Save API did not return data');
      const saved = await remoteSave.call(cloud, slot, data);
      if (saved === false) throw new Error('Cloud bridge declined save');
      rememberTest({ ok: true, reason: 'cloud save succeeded', slot });
      notify('Cloud save test passed');
    } catch (error) {
      rememberTest({ ok: false, reason: error?.message || 'cloud save failed', slot });
      notify('Cloud test failed; local save kept');
    } finally {
      testInFlight = false;
      updatePanel(panel);
    }
  }

  function persistHidden(panel) {
    const hidden = panel.classList.contains('cloud-polish-hidden');
    if (!safeStorageSet(STORAGE_KEY, hidden ? '1' : '0')) notify('Panel preference could not be saved');
  }

  function wirePanel(panel) {
    const hidden = safeStorageGet(STORAGE_KEY) === '1';
    panel.classList.toggle('cloud-polish-hidden', hidden);
    $('cloud-polish-toggle')?.addEventListener('click', () => {
      panel.classList.toggle('cloud-polish-hidden');
      persistHidden(panel);
    });
    $('cloud-polish-local')?.addEventListener('click', () => {
      const game = getGame();
      const slot = getSlot(game?.getSnapshot?.());
      if (game?.saveState) { game.saveState(slot); notify(`Local saved ${slot}`); }
      else notify('Save API not ready yet');
      updatePanel(panel);
    });
    $('cloud-polish-test')?.addEventListener('click', () => testCloud(panel));
    $('cloud-polish-copy')?.addEventListener('click', async () => {
      const text = safeJson(getReport());
      try { await navigator.clipboard?.writeText(text); notify('Cloud report copied'); }
      catch (_) { console.log('[NeonBlock City] Cloud report', text); notify('Cloud report logged'); }
    });
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyT' || event.ctrlKey || event.metaKey || event.altKey) return;
      panel.classList.toggle('cloud-polish-hidden');
      persistHidden(panel);
    });
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      #cloud-polish-panel {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: max(12px, env(safe-area-inset-bottom));
        width: min(310px, calc(100vw - 24px));
        z-index: 25;
        padding: 12px;
        border: 1px solid rgba(94, 243, 140, 0.45);
        border-radius: 16px;
        background: rgba(5, 8, 20, 0.82);
        color: #efffff;
        font: 13px/1.35 system-ui, sans-serif;
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(10px);
      }
      #cloud-polish-panel[data-mode="cloud"] { border-color: rgba(23, 243, 255, 0.72); }
      .cloud-polish-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
      .cloud-polish-line { display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; color: #c9f7ff; }
      .cloud-polish-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 9px; }
      #cloud-polish-panel button { min-height: 32px; border: 1px solid rgba(23, 243, 255, 0.36); border-radius: 10px; background: rgba(23, 243, 255, 0.12); color: #efffff; }
      #cloud-polish-panel button:disabled { cursor: wait; opacity: 0.58; }
      #cloud-polish-note { margin: 8px 0 0; color: #9bbdcc; font-size: 12px; }
      #cloud-polish-panel.cloud-polish-hidden { width: auto; padding: 8px; }
      #cloud-polish-panel.cloud-polish-hidden .cloud-polish-line,
      #cloud-polish-panel.cloud-polish-hidden .cloud-polish-actions,
      #cloud-polish-panel.cloud-polish-hidden #cloud-polish-note { display: none; }
      @media (max-width: 720px) {
        #cloud-polish-panel { bottom: calc(96px + env(safe-area-inset-bottom)); font-size: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    injectStyle();
    panelRef = createPanel();
    wirePanel(panelRef);
    refreshNow();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopScheduler();
      else refreshNow();
    });
    window.addEventListener('online', refreshNow);
    window.addEventListener('offline', refreshNow);
    window.addEventListener('pagehide', stopScheduler);

    window.NeonBlockCloudPolish = {
      version: VERSION,
      getStatus: getReport,
      refresh: refreshNow
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();