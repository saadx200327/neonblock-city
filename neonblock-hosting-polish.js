(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:hosting-polish';
  const REPORT_KEY = 'neonblock:hosting-report';
  const SHORTCUT = 'Backquote';
  const REQUIRED_LOCAL_ASSETS = [
    'index.html',
    'styles.css',
    'app.js',
    'firebase-backend.js',
    'manifest.webmanifest',
    'sw.js',
    'icon.svg'
  ];

  const state = {
    visible: localStorage.getItem(STORAGE_KEY) !== 'hidden',
    lastReport: null,
    lastCheckedAt: 0,
    assetResults: new Map(),
    copiedAt: 0
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  function makePanel() {
    const panel = document.createElement('section');
    panel.id = 'neonblock-hosting-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="nb-hosting-head">
        <strong>Hosting Doctor</strong>
        <button type="button" id="nb-hosting-toggle" aria-label="Hide hosting doctor">Hide</button>
      </div>
      <div class="nb-hosting-grid">
        <div><span>Runtime</span><b id="nb-host-runtime">checking</b></div>
        <div><span>Protocol</span><b id="nb-host-protocol">checking</b></div>
        <div><span>SW</span><b id="nb-host-sw">checking</b></div>
        <div><span>Manifest</span><b id="nb-host-manifest">checking</b></div>
        <div><span>Cache</span><b id="nb-host-cache">checking</b></div>
        <div><span>Assets</span><b id="nb-host-assets">checking</b></div>
      </div>
      <p id="nb-host-guidance">Static hosting checks are running. Use \`\` to show or hide.</p>
      <div class="nb-hosting-actions">
        <button type="button" id="nb-host-run">Run checks</button>
        <button type="button" id="nb-host-copy">Copy report</button>
        <button type="button" id="nb-host-save">Safe save</button>
      </div>
    `;
    document.body.appendChild(panel);

    const style = document.createElement('style');
    style.textContent = `
      #neonblock-hosting-panel {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: calc(12px + env(safe-area-inset-bottom));
        width: min(360px, calc(100vw - 24px));
        z-index: 62;
        padding: 12px;
        border: 1px solid rgba(79, 236, 255, 0.32);
        border-radius: 16px;
        background: rgba(5, 8, 20, 0.86);
        color: #e8fbff;
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
      }
      #neonblock-hosting-panel.hidden { display: none; }
      .nb-hosting-head, .nb-hosting-actions { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
      .nb-hosting-head strong { color: #7df9ff; letter-spacing: 0.02em; }
      .nb-hosting-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin: 10px 0; }
      .nb-hosting-grid div { padding: 7px; border-radius: 10px; background: rgba(255, 255, 255, 0.075); }
      .nb-hosting-grid span { display: block; color: rgba(232, 251, 255, 0.66); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .nb-hosting-grid b { display: block; margin-top: 3px; font-size: 12px; }
      #nb-host-guidance { margin: 8px 0 10px; color: rgba(232, 251, 255, 0.78); }
      #neonblock-hosting-panel button {
        border: 1px solid rgba(125, 249, 255, 0.34);
        border-radius: 999px;
        background: rgba(23, 243, 255, 0.12);
        color: #e8fbff;
        padding: 6px 9px;
        min-height: 34px;
      }
      @media (max-width: 720px) {
        #neonblock-hosting-panel { bottom: calc(96px + env(safe-area-inset-bottom)); }
        .nb-hosting-actions { flex-wrap: wrap; justify-content: flex-start; }
      }
    `;
    document.head.appendChild(style);
    return panel;
  }

  const panel = makePanel();
  const els = {
    runtime: $('nb-host-runtime'),
    protocol: $('nb-host-protocol'),
    sw: $('nb-host-sw'),
    manifest: $('nb-host-manifest'),
    cache: $('nb-host-cache'),
    assets: $('nb-host-assets'),
    guidance: $('nb-host-guidance'),
    toggle: $('nb-hosting-toggle'),
    run: $('nb-host-run'),
    copy: $('nb-host-copy'),
    save: $('nb-host-save')
  };

  function setVisible(visible) {
    state.visible = Boolean(visible);
    panel.classList.toggle('hidden', !state.visible);
    localStorage.setItem(STORAGE_KEY, state.visible ? 'visible' : 'hidden');
  }

  function statusText(ok, good, bad) {
    return ok ? good : bad;
  }

  function getGameState() {
    try {
      return window.NeonBlock?.getState?.() || null;
    } catch (error) {
      return null;
    }
  }

  function localAssetUrls() {
    const scriptUrls = Array.from(document.scripts || [])
      .map((script) => script.getAttribute('src'))
      .filter(Boolean)
      .filter((src) => !/^https?:\/\//i.test(src));
    const cssUrls = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.getAttribute('href'))
      .filter(Boolean);
    return Array.from(new Set([...REQUIRED_LOCAL_ASSETS, ...scriptUrls, ...cssUrls]));
  }

  async function checkAssets() {
    const urls = localAssetUrls();
    const results = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        results.push({ url, ok: response.ok, status: response.status });
        state.assetResults.set(url, { ok: response.ok, status: response.status });
      } catch (error) {
        results.push({ url, ok: false, status: 'fetch-failed' });
        state.assetResults.set(url, { ok: false, status: 'fetch-failed' });
      }
    }
    return results;
  }

  async function checkManifest() {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return { ok: false, status: 'missing-link' };
    try {
      const response = await fetch(manifestLink.href, { cache: 'no-store' });
      if (!response.ok) return { ok: false, status: response.status };
      const json = await response.json();
      return {
        ok: Boolean(json.name && json.start_url && json.icons?.length),
        status: json.name ? 'ready' : 'incomplete',
        name: json.name,
        start_url: json.start_url,
        icons: json.icons?.length || 0
      };
    } catch (error) {
      return { ok: false, status: 'manifest-fetch-failed' };
    }
  }

  async function checkCache() {
    if (!('caches' in window)) return { ok: false, status: 'unsupported' };
    try {
      const keys = await caches.keys();
      const neonKeys = keys.filter((key) => /neonblock/i.test(key));
      return { ok: neonKeys.length > 0, status: neonKeys[0] || 'not-created-yet', keys: neonKeys };
    } catch (error) {
      return { ok: false, status: 'cache-check-failed' };
    }
  }

  async function buildReport() {
    const runtimeState = getGameState();
    const protocolOk = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const swSupported = 'serviceWorker' in navigator;
    const swControlled = Boolean(navigator.serviceWorker?.controller);
    const [manifest, cache, assets] = await Promise.all([checkManifest(), checkCache(), checkAssets()]);
    const missingAssets = assets.filter((item) => !item.ok);
    const externalScripts = Array.from(document.scripts || [])
      .map((script) => script.getAttribute('src'))
      .filter(Boolean)
      .filter((src) => /^https?:\/\//i.test(src));

    const report = {
      checkedAt: new Date().toISOString(),
      location: `${location.protocol}//${location.host}${location.pathname}`,
      runtimeReady: Boolean(runtimeState?.player),
      protocolOk,
      serviceWorker: { supported: swSupported, controlled: swControlled, readyForPwa: swSupported && protocolOk },
      manifest,
      cache,
      assets: {
        total: assets.length,
        missing: missingAssets,
        ok: missingAssets.length === 0
      },
      externalScripts,
      notes: [
        protocolOk ? 'Protocol is PWA-safe for localhost or HTTPS.' : 'Use HTTPS on Netlify for service-worker installability.',
        missingAssets.length ? 'One or more local static files failed fetch checks.' : 'Local static asset paths responded successfully.',
        externalScripts.length ? 'First launch still needs CDN access for external scripts unless vendored later.' : 'No external script dependency detected.'
      ]
    };
    state.lastReport = report;
    state.lastCheckedAt = Date.now();
    localStorage.setItem(REPORT_KEY, safeJson(report));
    return report;
  }

  function render(report) {
    if (!report) return;
    els.runtime.textContent = statusText(report.runtimeReady, 'ready', 'waiting');
    els.protocol.textContent = statusText(report.protocolOk, 'PWA-safe', 'needs HTTPS');
    els.sw.textContent = report.serviceWorker.supported ? (report.serviceWorker.controlled ? 'controlled' : 'registered soon') : 'unsupported';
    els.manifest.textContent = statusText(report.manifest.ok, 'ready', String(report.manifest.status));
    els.cache.textContent = report.cache.status || 'checking';
    els.assets.textContent = report.assets.ok ? `${report.assets.total} ok` : `${report.assets.missing.length} missing`;

    const hints = [];
    if (!report.runtimeReady) hints.push('Wait for game runtime before final smoke testing.');
    if (!report.protocolOk) hints.push('Preview via localhost or HTTPS so the PWA service worker can work.');
    if (!report.assets.ok) hints.push('Fix missing static paths before upload.');
    if (report.externalScripts.length) hints.push('CDN scripts require first-load network access; PWA cache helps after load.');
    if (!hints.length) hints.push('Static hosting readiness looks healthy. Run movement, save, vehicle, and mission smoke tests next.');
    els.guidance.textContent = hints.join(' ');
  }

  async function runChecks() {
    els.guidance.textContent = 'Running static hosting checks...';
    try {
      const report = await buildReport();
      render(report);
    } catch (error) {
      els.guidance.textContent = `Hosting check failed safely: ${error?.message || error}`;
    }
  }

  async function copyReport() {
    const report = state.lastReport || await buildReport();
    const text = safeJson(report);
    try {
      await navigator.clipboard?.writeText(text);
      state.copiedAt = Date.now();
      els.guidance.textContent = 'Hosting QA report copied.';
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      els.guidance.textContent = 'Hosting QA report copied with fallback.';
    }
  }

  function safeSave() {
    try {
      window.NeonBlock?.save?.();
      els.guidance.textContent = 'Safe local save requested before hosting/export testing.';
    } catch (error) {
      els.guidance.textContent = 'Runtime save API is not ready yet; autosave fallback remains local.';
    }
  }

  els.toggle.addEventListener('click', () => setVisible(false));
  els.run.addEventListener('click', runChecks);
  els.copy.addEventListener('click', copyReport);
  els.save.addEventListener('click', safeSave);
  document.addEventListener('keydown', (event) => {
    if (event.code !== SHORTCUT || event.repeat || event.target?.matches?.('input, textarea, select')) return;
    event.preventDefault();
    setVisible(!state.visible);
    if (state.visible) runChecks();
  });

  setVisible(state.visible);
  window.addEventListener('load', () => setTimeout(runChecks, 900), { once: true });
  setTimeout(runChecks, 2400);
  window.NeonBlockHostingDoctor = { runChecks, copyReport, getReport: () => state.lastReport };
})();
