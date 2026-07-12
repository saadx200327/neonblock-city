(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:pwa-polish:hidden';
  const REPORT_KEY = 'neonblock:pwa-polish:last-report';
  const REFRESH_MS = 15000;
  const $ = (id) => document.getElementById(id);

  const diagnostics = {
    refreshes: 0,
    skippedHiddenRefreshes: 0,
    storageReadErrors: 0,
    storageWriteErrors: 0,
    lastRefreshAt: null,
    lastError: null
  };

  let refreshTimer = 0;
  let refreshInFlight = null;

  function make(tag, attrs = {}, text = '') {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') el.className = value;
      else if (key === 'style') el.setAttribute('style', value);
      else el.setAttribute(key, value);
    });
    if (text) el.textContent = text;
    return el;
  }

  function fmtBool(value) {
    return value ? 'yes' : 'no';
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      diagnostics.storageReadErrors += 1;
      diagnostics.lastError = String(error?.message || error);
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      diagnostics.storageWriteErrors += 1;
      diagnostics.lastError = String(error?.message || error);
      return false;
    }
  }

  function toast(message) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 2400);
  }

  function saveNow(reason = 'pwa') {
    const api = window.NeonBlockAPI;
    try {
      if (api?.saveGame) {
        api.saveGame(api.getState?.().player?.slot || 'slot1');
        toast(`Saved before ${reason}.`);
        return true;
      }
    } catch (error) {
      diagnostics.lastError = String(error?.message || error);
      console.warn('[NeonBlock PWA] save failed', error);
    }
    return false;
  }

  function getCacheNames() {
    if (!('caches' in window)) return Promise.resolve([]);
    return caches.keys().catch((error) => {
      diagnostics.lastError = String(error?.message || error);
      return [];
    });
  }

  async function buildReport() {
    const cacheNames = await getCacheNames();
    const swController = Boolean(navigator.serviceWorker?.controller);
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch((error) => {
      diagnostics.lastError = String(error?.message || error);
      return null;
    }) : null;
    const apiReady = Boolean(window.NeonBlockAPI?.getState);
    let state = null;
    if (apiReady) {
      try {
        state = window.NeonBlockAPI.getState();
      } catch (error) {
        diagnostics.lastError = String(error?.message || error);
      }
    }
    const externalScripts = [...document.scripts]
      .map((script) => script.src)
      .filter((src) => src && !src.startsWith(location.origin));
    const localScripts = [...document.scripts]
      .map((script) => script.getAttribute('src'))
      .filter((src) => src && !/^https?:\/\//i.test(src));
    const report = {
      generatedAt: new Date().toISOString(),
      online: navigator.onLine,
      standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
      serviceWorkerSupported: 'serviceWorker' in navigator,
      serviceWorkerControlled: swController,
      serviceWorkerScope: reg?.scope || null,
      updateWaiting: Boolean(reg?.waiting),
      cacheSupported: 'caches' in window,
      cacheNames,
      localScripts,
      externalScripts,
      runtimeReady: apiReady,
      player: state?.player ? {
        cash: state.player.cash,
        xp: state.player.xp,
        level: state.player.level,
        slot: state.player.slot,
        inVehicle: Boolean(state.player.activeVehicle)
      } : null,
      world: state ? {
        chunks: state.chunks?.size ?? state.chunks,
        vehicles: state.vehicles?.length,
        crates: state.crates?.length,
        lots: state.lots?.length
      } : null
    };
    storageSet(REPORT_KEY, JSON.stringify(report));
    return report;
  }

  function downloadReport(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = make('a', { href: url, download: `neonblock-pwa-report-${Date.now()}.json` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function initPanel() {
    if ($('pwa-polish-panel')) return;
    const panel = make('section', {
      id: 'pwa-polish-panel',
      'aria-live': 'polite',
      style: 'position:fixed;left:12px;bottom:12px;z-index:45;max-width:330px;padding:12px;border:1px solid rgba(90,255,220,.35);border-radius:16px;background:rgba(5,8,20,.82);color:#e7fbff;font:12px/1.35 system-ui, sans-serif;box-shadow:0 0 28px rgba(0,255,210,.16);backdrop-filter:blur(10px);'
    });
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">
        <strong>PWA Ready</strong>
        <button id="pwa-toggle" type="button" style="min-width:38px;">I</button>
      </div>
      <div id="pwa-status">Checking install/offline state...</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        <button id="pwa-save" type="button">Save</button>
        <button id="pwa-update" type="button">Update Check</button>
        <button id="pwa-report" type="button">Report</button>
      </div>
      <div id="pwa-warning" style="margin-top:8px;color:#ffd86b;"></div>
    `;
    document.body.appendChild(panel);

    const hidden = storageGet(STORAGE_KEY) === '1';
    if (hidden) panel.style.transform = 'translateY(calc(100% - 38px))';

    $('pwa-toggle')?.addEventListener('click', () => {
      const nextHidden = storageGet(STORAGE_KEY) !== '1';
      storageSet(STORAGE_KEY, nextHidden ? '1' : '0');
      panel.style.transform = nextHidden ? 'translateY(calc(100% - 38px))' : '';
    });
    $('pwa-save')?.addEventListener('click', () => saveNow('PWA/offline test'));
    $('pwa-update')?.addEventListener('click', async () => {
      saveNow('update check');
      const reg = await navigator.serviceWorker?.getRegistration?.().catch((error) => {
        diagnostics.lastError = String(error?.message || error);
        return null;
      });
      if (reg?.update) {
        await reg.update().catch((error) => {
          diagnostics.lastError = String(error?.message || error);
        });
        toast(reg.waiting ? 'Update ready. Reload to apply.' : 'PWA cache checked.');
      } else toast('Service worker is not active yet.');
      refresh(true);
    });
    $('pwa-report')?.addEventListener('click', async () => downloadReport(await buildReport()));

    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.code !== 'KeyI' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      $('pwa-toggle')?.click();
    });
  }

  async function refresh(force = false) {
    if (document.hidden && !force) {
      diagnostics.skippedHiddenRefreshes += 1;
      return null;
    }
    if (refreshInFlight) return refreshInFlight;
    const status = $('pwa-status');
    const warning = $('pwa-warning');
    if (!status || !warning) return null;

    refreshInFlight = (async () => {
      const report = await buildReport();
      status.textContent = `Online: ${fmtBool(report.online)} · SW: ${fmtBool(report.serviceWorkerControlled)} · Cache: ${report.cacheNames.length} · Installed: ${fmtBool(report.standalone)}`;
      const warnings = [];
      if (!report.serviceWorkerSupported) warnings.push('Browser does not support service workers.');
      else if (!report.serviceWorkerControlled) warnings.push('Reload once after first visit so the PWA cache controls this page.');
      if (report.externalScripts.length) warnings.push('First launch needs network for external scripts; after a successful load, the service worker may cache fetched assets.');
      if (!report.runtimeReady) warnings.push('Runtime API not ready yet; wait for loading screen to finish before testing offline.');
      warning.textContent = warnings.join(' ');
      diagnostics.refreshes += 1;
      diagnostics.lastRefreshAt = report.generatedAt;
      return report;
    })().catch((error) => {
      diagnostics.lastError = String(error?.message || error);
      console.warn('[NeonBlock PWA] refresh failed', error);
      return null;
    }).finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  }

  function stopScheduler() {
    if (!refreshTimer) return;
    clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  function scheduleRefresh(delay = REFRESH_MS) {
    stopScheduler();
    if (document.hidden) return;
    refreshTimer = setTimeout(async () => {
      refreshTimer = 0;
      await refresh();
      scheduleRefresh();
    }, delay);
  }

  function bindServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      toast('PWA cache updated. Save is safe; reload if visuals look stale.');
      refresh(true);
    });
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            toast(navigator.serviceWorker.controller ? 'Update downloaded. Save, then reload.' : 'Offline cache installed.');
            refresh(true);
          }
        });
      });
    }).catch((error) => {
      diagnostics.lastError = String(error?.message || error);
    });
  }

  function boot() {
    initPanel();
    bindServiceWorkerUpdates();
    refresh(true);
    scheduleRefresh();
    window.addEventListener('online', () => refresh(true));
    window.addEventListener('offline', () => refresh(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopScheduler();
        saveNow('tab switch');
        return;
      }
      refresh(true);
      scheduleRefresh();
    });
    window.addEventListener('pagehide', stopScheduler);
  }

  window.NeonBlockPWA = Object.freeze({
    refresh: () => refresh(true),
    saveNow,
    buildReport,
    getStatus: () => ({
      version: 2,
      schedulerActive: Boolean(refreshTimer),
      refreshInFlight: Boolean(refreshInFlight),
      hidden: document.hidden,
      ...diagnostics
    })
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
