(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:pwa-polish:hidden';
  const REPORT_KEY = 'neonblock:pwa-polish:last-report';
  const $ = (id) => document.getElementById(id);

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
      console.warn('[NeonBlock PWA] save failed', error);
    }
    return false;
  }

  function getCacheNames() {
    if (!('caches' in window)) return Promise.resolve([]);
    return caches.keys().catch(() => []);
  }

  async function buildReport() {
    const cacheNames = await getCacheNames();
    const swController = Boolean(navigator.serviceWorker?.controller);
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
    const apiReady = Boolean(window.NeonBlockAPI?.getState);
    const state = apiReady ? window.NeonBlockAPI.getState() : null;
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
    localStorage.setItem(REPORT_KEY, JSON.stringify(report));
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

    const hidden = localStorage.getItem(STORAGE_KEY) === '1';
    if (hidden) panel.style.transform = 'translateY(calc(100% - 38px))';

    $('pwa-toggle')?.addEventListener('click', () => {
      const nextHidden = localStorage.getItem(STORAGE_KEY) !== '1';
      localStorage.setItem(STORAGE_KEY, nextHidden ? '1' : '0');
      panel.style.transform = nextHidden ? 'translateY(calc(100% - 38px))' : '';
    });
    $('pwa-save')?.addEventListener('click', () => saveNow('PWA/offline test'));
    $('pwa-update')?.addEventListener('click', async () => {
      saveNow('update check');
      const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
      if (reg?.update) {
        await reg.update().catch(() => null);
        toast(reg.waiting ? 'Update ready. Reload to apply.' : 'PWA cache checked.');
      } else toast('Service worker is not active yet.');
      refresh();
    });
    $('pwa-report')?.addEventListener('click', async () => downloadReport(await buildReport()));

    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyI' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      $('pwa-toggle')?.click();
    });
  }

  async function refresh() {
    const status = $('pwa-status');
    const warning = $('pwa-warning');
    if (!status || !warning) return;
    const report = await buildReport();
    status.textContent = `Online: ${fmtBool(report.online)} · SW: ${fmtBool(report.serviceWorkerControlled)} · Cache: ${report.cacheNames.length} · Installed: ${fmtBool(report.standalone)}`;
    const warnings = [];
    if (!report.serviceWorkerSupported) warnings.push('Browser does not support service workers.');
    else if (!report.serviceWorkerControlled) warnings.push('Reload once after first visit so the PWA cache controls this page.');
    if (report.externalScripts.length) warnings.push('First launch needs network for Three.js CDN; after a successful load, SW can cache fetched assets.');
    if (!report.runtimeReady) warnings.push('Runtime API not ready yet; wait for loading screen to finish before testing offline.');
    warning.textContent = warnings.join(' ');
  }

  function bindServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      toast('PWA cache updated. Save is safe; reload if visuals look stale.');
      refresh();
    });
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            toast(navigator.serviceWorker.controller ? 'Update downloaded. Save, then reload.' : 'Offline cache installed.');
            refresh();
          }
        });
      });
    }).catch(() => {});
  }

  function boot() {
    initPanel();
    bindServiceWorkerUpdates();
    refresh();
    setInterval(refresh, 15000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveNow('tab switch');
      refresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
