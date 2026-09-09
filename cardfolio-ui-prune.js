/* Cardfolio — remove user-marked UI and keep the Cardfolio brand centered in the app shell. */
(() => {
  'use strict';

  const HIDDEN_EYEBROW_VIEWS = new Set(['home', 'portfolio', 'scan', 'watchlist']);
  const HIDDEN_TITLE_VIEWS = new Set(['portfolio', 'watchlist']);
  const HOME_HISTORY_COPY = '<span>History begins when Cardfolio records real market observations. No synthetic backfill.</span>';
  const HOME_TIMELINE_COPY = '<div class="timeline-note">Built only from recorded Cardfolio valuations.</div>';
  const SCAN_TIPS = /<aside class="scan-tips">[\s\S]*?<\/aside>/;
  // Use the dedicated PNG image function. The generic /api/proxy path is for text assets
  // and can return a non-image response for binary WebP files, which renders as a broken image.
  const HEADER_LOGO_SRC = '/api/cardfolio-icon?v=20260909-header-1';
  const HEADER_LOGO_FALLBACK_SRC = '/cardfolio-icon.svg?v=20260909-header-1';

  const baseHomeView = homeView;
  homeView = function () {
    return baseHomeView()
      .replace(HOME_HISTORY_COPY, '')
      .replace(HOME_TIMELINE_COPY, '');
  };

  const baseScanView = scanView;
  scanView = function () {
    return baseScanView().replace(SCAN_TIPS, '');
  };

  function ensureBrandStyles() {
    if (document.getElementById('cardfolio-shell-brand-css')) return;
    const style = document.createElement('style');
    style.id = 'cardfolio-shell-brand-css';
    style.textContent = `
      .topbar{position:sticky}
      .cardfolio-topbar-logo{
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        display:grid;
        place-items:center;
        pointer-events:none;
        z-index:1;
      }
      .cardfolio-topbar-logo img{
        display:block;
        width:108px;
        max-width:24vw;
        height:auto;
        max-height:82px;
        object-fit:contain;
        filter:drop-shadow(0 7px 16px rgba(25,55,95,.08));
      }
      .topbar>div:first-child,.topbar>.top-actions{position:relative;z-index:2}
      @media(max-width:720px){
        .cardfolio-topbar-logo img{width:96px;max-width:25vw;max-height:72px}
      }
      @media(max-width:390px){
        .cardfolio-topbar-logo img{width:86px;max-width:24vw;max-height:66px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHeaderLogo() {
    ensureBrandStyles();
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    let brand = topbar.querySelector('.cardfolio-topbar-logo');
    if (brand) return;
    brand = document.createElement('div');
    brand.className = 'cardfolio-topbar-logo';
    brand.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img');
    image.src = HEADER_LOGO_SRC;
    image.alt = '';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      if (image.dataset.cardfolioFallbackApplied) return;
      image.dataset.cardfolioFallbackApplied = '1';
      image.src = HEADER_LOGO_FALLBACK_SRC;
    });
    brand.appendChild(image);
    topbar.appendChild(brand);
  }

  function applyWatchlistRemovals() {
    if ((state?.view || 'home') !== 'watchlist') return;

    document.querySelector('.watch-v2-head .eyebrow')?.remove();
    document.querySelector('.watch-v2-head p')?.remove();

    const hasLists =
      Boolean(document.querySelector('.watch-list-chip')) ||
      (Array.isArray(state?.watchlists) && state.watchlists.length > 0);

    const newList = document.getElementById('watchNewList');
    if (newList) newList.hidden = !hasLists;
  }

  function applyMarkedRemovals() {
    const view = state?.view || 'home';
    const eyebrow = document.getElementById('viewEyebrow');
    const title = document.getElementById('viewTitle');

    ensureHeaderLogo();

    if (eyebrow) eyebrow.style.visibility = HIDDEN_EYEBROW_VIEWS.has(view) ? 'hidden' : '';
    if (title) title.style.visibility = HIDDEN_TITLE_VIEWS.has(view) ? 'hidden' : '';

    if (view === 'home') {
      document.querySelectorAll('.asset-chart.empty-chart span').forEach((el) => {
        if (el.textContent.trim() === 'History begins when Cardfolio records real market observations. No synthetic backfill.') el.remove();
      });
      document.querySelectorAll('.timeline-note').forEach((el) => {
        if (el.textContent.trim() === 'Built only from recorded Cardfolio valuations.') el.remove();
      });
    }

    if (view === 'scan') document.querySelector('.scan-tips')?.remove();
    if (view === 'watchlist') applyWatchlistRemovals();
  }

  const baseSetView = setView;
  setView = function (view) {
    const result = baseSetView(view);
    applyMarkedRemovals();
    return result;
  };

  function loadSaveStackGuard() {
    if (document.querySelector('script[data-cardfolio-save-stack-guard]')) return;
    const script = document.createElement('script');
    script.src = '/api/proxy?path=cardfolio-save-stack-guard.js';
    script.async = false;
    script.dataset.cardfolioSaveStackGuard = '1';
    script.onerror = () => console.error('Cardfolio save stack guard failed to load.');
    document.head.appendChild(script);
  }

  function loadIosCropEditor() {
    if (document.querySelector('script[data-cardfolio-ios-crop]') || window.cardfolioCropEditorVersion) return;
    const script = document.createElement('script');
    script.src = '/api/proxy?path=cardfolio-crop-ios.js&v=20260907-ioscrop-1';
    script.async = false;
    script.dataset.cardfolioIosCrop = '1';
    script.onerror = () => console.error('Cardfolio iPhone-style crop editor failed to load.');
    document.head.appendChild(script);
  }

  function observeDynamicUi() {
    const root = document.getElementById('app') || document.body;
    if (!root || root.dataset.cardfolioUiPruneObserved) return;
    root.dataset.cardfolioUiPruneObserved = '1';
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        applyMarkedRemovals();
      });
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyMarkedRemovals();
    requestAnimationFrame(applyMarkedRemovals);
    observeDynamicUi();
    loadIosCropEditor();
  });

  loadSaveStackGuard();
  loadIosCropEditor();
})();
