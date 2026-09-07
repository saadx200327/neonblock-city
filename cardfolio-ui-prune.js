/* Cardfolio — remove only the user-marked UI copy/sections from the live app. */
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

  function applyMarkedRemovals() {
    const view = state?.view || 'home';
    const eyebrow = document.getElementById('viewEyebrow');
    const title = document.getElementById('viewTitle');

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

  document.addEventListener('DOMContentLoaded', () => {
    applyMarkedRemovals();
    requestAnimationFrame(applyMarkedRemovals);
  });

  loadSaveStackGuard();
})();
