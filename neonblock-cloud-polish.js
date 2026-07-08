(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:cloud-polish:hidden';
  const LAST_TEST_KEY = 'neonblock:cloud-polish:last-test';
  const $ = (id) => document.getElementById(id);

  function getGame() {
    return window.NeonBlockGame || null;
  }

  function getCloud() {
    return window.NeonBlockCloud || null;
  }

  function safeJson(value) {
    try { return JSON.stringify(value, null, 2); } catch (_) { return '{}'; }
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
    try { return JSON.parse(localStorage.getItem(LAST_TEST_KEY) || 'null'); } catch (_) { return null; }
  }

  function rememberTest(result) {
    try { localStorage.setItem(LAST_TEST_KEY, JSON.stringify({ ...result, at: Date.now() })); } catch (_) {}
  }

  function describeLastTest() {
    const last = getLastTest();
    if (!last?.at) return 'never';
    const age = Math.max(0, Math.round((Date.now() - last.at) / 1000));
    return `${last.ok ? 'ok' : 'local only'} ${age}s ago`;
  }

  function getReport() {
    const game = getGame();
    const cloud = getCloud();
    const snapshot = game?.getSnapshot?.();
    return {
      at: new Date().toISOString(),
      mode: cloud?.enabled ? 'cloud-ready' : 'local-only',
      firebaseBridgePresent: Boolean(cloud),
      cloudEnabled: Boolean(cloud?.enabled),
      currentSlot: getSlot(snapshot),
      localStorageAvailable: (() => {
        try { localStorage.setItem('neonblock:cloud-polish:probe', '1'); localStorage.removeItem('neonblock:cloud-polish:probe'); return true; } catch (_) { return false; }
      })(),
      hasSaveApi: Boolean(game?.saveState),
      hasLoadApi: Boolean(game?.loadState),
      lastCloudTest: getLastTest(),
      note: 'Cloud saves are optional; this panel never initializes Firebase or changes external project settings.'
    };
  }

  function updatePanel(panel) {
    const cloud = getCloud();
    const game = getGame();
    const snapshot = game?.getSnapshot?.();
    const mode = cloud?.enabled ? 'cloud ready' : 'local only';
    $('cloud-polish-mode').textContent = mode;
    $('cloud-polish-slot').textContent = getSlot(snapshot);
    $('cloud-polish-last').textContent = describeLastTest();
    panel.dataset.mode = cloud?.enabled ? 'cloud' : 'local';
  }

  async function testCloud(panel) {
    const game = getGame();
    const cloud = getCloud();
    const snapshot = game?.getSnapshot?.();
    const slot = getSlot(snapshot);
    const data = game?.saveState?.(slot);
    if (!cloud?.enabled || !cloud?.save) {
      rememberTest({ ok: false, reason: 'cloud bridge unavailable', slot });
      updatePanel(panel);
      notify('Cloud unavailable; local save confirmed');
      return;
    }
    try {
      await cloud.save(slot, data || { at: Date.now(), slot });
      rememberTest({ ok: true, reason: 'cloud save succeeded', slot });
      notify('Cloud save test passed');
    } catch (error) {
      rememberTest({ ok: false, reason: error?.message || 'cloud save failed', slot });
      notify('Cloud test failed; local save kept');
    }
    updatePanel(panel);
  }

  function wirePanel(panel) {
    const hidden = localStorage.getItem(STORAGE_KEY) === '1';
    panel.classList.toggle('cloud-polish-hidden', hidden);
    $('cloud-polish-toggle').addEventListener('click', () => {
      panel.classList.toggle('cloud-polish-hidden');
      localStorage.setItem(STORAGE_KEY, panel.classList.contains('cloud-polish-hidden') ? '1' : '0');
    });
    $('cloud-polish-local').addEventListener('click', () => {
      const game = getGame();
      const slot = getSlot(game?.getSnapshot?.());
      if (game?.saveState) { game.saveState(slot); notify(`Local saved ${slot}`); }
      else notify('Save API not ready yet');
      updatePanel(panel);
    });
    $('cloud-polish-test').addEventListener('click', () => testCloud(panel));
    $('cloud-polish-copy').addEventListener('click', async () => {
      const text = safeJson(getReport());
      try { await navigator.clipboard?.writeText(text); notify('Cloud report copied'); }
      catch (_) { console.log('[NeonBlock City] Cloud report', text); notify('Cloud report logged'); }
    });
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyT' || event.ctrlKey || event.metaKey || event.altKey) return;
      panel.classList.toggle('cloud-polish-hidden');
      localStorage.setItem(STORAGE_KEY, panel.classList.contains('cloud-polish-hidden') ? '1' : '0');
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
    const panel = createPanel();
    wirePanel(panel);
    updatePanel(panel);
    setInterval(() => updatePanel(panel), 2500);
    window.addEventListener('online', () => updatePanel(panel));
    window.addEventListener('offline', () => updatePanel(panel));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
