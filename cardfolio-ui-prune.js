/* Cardfolio — remove user-marked UI and keep branding out of the app chrome. */
(() => {
  'use strict';

  const HIDDEN_EYEBROW_VIEWS = new Set(['home', 'portfolio', 'scan', 'watchlist']);
  const HIDDEN_TITLE_VIEWS = new Set(['portfolio', 'watchlist']);
  const HOME_HISTORY_COPY = '<span>History begins when Cardfolio records real market observations. No synthetic backfill.</span>';
  const HOME_TIMELINE_COPY = '<div class="timeline-note">Built only from recorded Cardfolio valuations.</div>';
  const SCAN_TIPS = /<aside class="scan-tips">[\s\S]*?<\/aside>/;

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

  function removeBranding() {
    document.querySelectorAll('.cardfolio-topbar-logo, img[data-cardfolio-brand], .auth-brand-logo').forEach((el) => el.remove());
    document.getElementById('cardfolio-shell-brand-css')?.remove();
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

    removeBranding();

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

  function loadCardImageViewer() {
    const existing = document.querySelector('script[data-cardfolio-card-image-viewer]');
    if (window.cardfolioCardImageViewerVersion === '20260910-2') return;
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.src = '/api/proxy?path=cardfolio-card-image-viewer.js&v=20260910-card-image-viewer-2';
    script.async = false;
    script.dataset.cardfolioCardImageViewer = '2';
    script.onerror = () => console.error('Cardfolio card image viewer failed to load.');
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
    loadCardImageViewer();
  });

  loadSaveStackGuard();
  loadIosCropEditor();
  loadCardImageViewer();
})();
