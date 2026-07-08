(() => {
  'use strict';

  const STORE = 'neonblock:mobile-shell:v1';
  const DEFAULTS = { lockScroll: true, largeTouch: true, fullscreenHint: true, hidePanel: false };
  const $ = (id) => document.getElementById(id);
  const readPrefs = () => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  };
  let prefs = readPrefs();
  const writePrefs = () => localStorage.setItem(STORE, JSON.stringify(prefs));
  let lastTouchEnd = 0;
  let lastViewportHeight = 0;
  let viewportStableCount = 0;

  function isCoarsePointer() {
    return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }

  function ensureStyles() {
    if ($('neonblock-mobile-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-mobile-shell-style';
    style.textContent = `
      html.neonblock-lock-scroll,
      html.neonblock-lock-scroll body {
        position: fixed;
        overflow: hidden;
        overscroll-behavior: none;
        touch-action: none;
        width: 100%;
        height: 100%;
      }
      body.neonblock-large-touch .action-btn,
      body.neonblock-large-touch #pause-overlay button,
      body.neonblock-large-touch #settings-panel button,
      body.neonblock-large-touch #save-panel button,
      body.neonblock-large-touch #mission-board button {
        min-height: 44px;
        min-width: 44px;
      }
      #mobile-shell-panel {
        position: fixed;
        left: calc(12px + env(safe-area-inset-left, 0px));
        top: calc(12px + env(safe-area-inset-top, 0px));
        z-index: 16;
        display: grid;
        gap: 6px;
        max-width: min(88vw, 330px);
        padding: 10px;
        border: 1px solid rgba(23, 243, 255, .2);
        border-radius: 14px;
        color: #eaffff;
        background: rgba(5, 8, 20, .68);
        backdrop-filter: blur(10px);
        box-shadow: 0 0 26px rgba(23, 243, 255, .12);
        font: 700 12px/1.3 system-ui, -apple-system, Segoe UI, sans-serif;
      }
      #mobile-shell-panel[hidden] { display: none; }
      #mobile-shell-panel .shell-actions { display: flex; flex-wrap: wrap; gap: 6px; }
      #mobile-shell-panel button {
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px;
        color: #eaffff;
        background: rgba(23, 243, 255, .12);
        padding: 7px 9px;
        font: inherit;
      }
      #mobile-shell-panel button[aria-pressed="true"] {
        border-color: rgba(94, 243, 140, .6);
        background: rgba(94, 243, 140, .18);
      }
      #mobile-shell-banner {
        position: fixed;
        left: 50%;
        top: calc(14px + env(safe-area-inset-top, 0px));
        transform: translateX(-50%);
        z-index: 17;
        max-width: min(92vw, 520px);
        padding: 9px 12px;
        border: 1px solid rgba(255, 211, 56, .35);
        border-radius: 999px;
        color: #fff7d6;
        background: rgba(29, 20, 5, .82);
        box-shadow: 0 0 24px rgba(255, 211, 56, .16);
        font: 800 12px/1.25 system-ui, -apple-system, Segoe UI, sans-serif;
        text-align: center;
        pointer-events: none;
      }
      #mobile-shell-banner.hidden { opacity: 0; transform: translate(-50%, -8px); }
      @media (max-width: 720px) {
        #mobile-shell-panel { top: auto; bottom: calc(86px + env(safe-area-inset-bottom, 0px)); }
        body.neonblock-mobile-compact #mobile-shell-panel { display: none; }
      }
      @media (orientation: landscape) and (max-height: 430px) {
        #hud { transform-origin: top left; }
        #mobile-shell-panel { max-width: 280px; font-size: 11px; }
      }
    `;
    document.head.appendChild(style);
  }

  function setBanner(text, ms = 3600) {
    let banner = $('mobile-shell-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'mobile-shell-banner';
      banner.className = 'hidden';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(banner);
    }
    banner.textContent = text;
    banner.classList.remove('hidden');
    clearTimeout(setBanner.timer);
    setBanner.timer = setTimeout(() => banner.classList.add('hidden'), ms);
  }

  function syncShellClasses() {
    document.documentElement.classList.toggle('neonblock-lock-scroll', !!prefs.lockScroll && isCoarsePointer());
    document.body.classList.toggle('neonblock-large-touch', !!prefs.largeTouch && isCoarsePointer());
    document.body.classList.toggle('neonblock-mobile-compact', !!prefs.hidePanel);
  }

  function makePanel() {
    if ($('mobile-shell-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'mobile-shell-panel';
    panel.innerHTML = `
      <div id="mobile-shell-status">Mobile shell: ready</div>
      <div class="shell-actions">
        <button id="shell-fullscreen" type="button">Fullscreen</button>
        <button id="shell-scroll-lock" type="button">Scroll Lock</button>
        <button id="shell-large-touch" type="button">Large Touch</button>
        <button id="shell-hide" type="button">Hide</button>
      </div>`;
    document.body.appendChild(panel);
    syncButtons();
  }

  function syncButtons() {
    const scroll = $('shell-scroll-lock');
    const touch = $('shell-large-touch');
    const hide = $('shell-hide');
    if (scroll) { scroll.setAttribute('aria-pressed', String(!!prefs.lockScroll)); scroll.textContent = `Scroll ${prefs.lockScroll ? 'Locked' : 'Free'}`; }
    if (touch) { touch.setAttribute('aria-pressed', String(!!prefs.largeTouch)); touch.textContent = `Touch ${prefs.largeTouch ? 'Large' : 'Normal'}`; }
    if (hide) hide.textContent = prefs.hidePanel ? 'Show' : 'Hide';
  }

  function requestFullscreen() {
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
    if (!request) {
      setBanner('Fullscreen is not available in this browser. Add to Home Screen for the cleanest mobile view.');
      return;
    }
    Promise.resolve(request.call(root)).then(() => setBanner('Fullscreen on. Use Pause if you need menus.')).catch(() => {
      setBanner('Tap Fullscreen again after touching the game screen.');
    });
  }

  function updateStatus() {
    const status = $('mobile-shell-status');
    if (!status) return;
    const vv = window.visualViewport;
    const w = Math.round(vv?.width || innerWidth);
    const h = Math.round(vv?.height || innerHeight);
    const orientation = w > h ? 'landscape' : 'portrait';
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    status.textContent = `${orientation} ${w}×${h}${installed ? ' • installed' : ''}`;
  }

  function detectViewportJump() {
    const h = Math.round(window.visualViewport?.height || innerHeight);
    if (!lastViewportHeight) lastViewportHeight = h;
    const delta = Math.abs(h - lastViewportHeight);
    if (delta <= 2) viewportStableCount += 1;
    else viewportStableCount = 0;
    if (delta > 90 && isCoarsePointer()) setBanner('Browser bar moved. Scroll Lock keeps controls from sliding during play.');
    lastViewportHeight = h;
    if (viewportStableCount === 12 && prefs.fullscreenHint && isCoarsePointer() && !matchMedia('(display-mode: standalone)').matches) {
      setBanner('Tip: use Fullscreen or Add to Home Screen for smoother mobile play.', 5200);
      prefs.fullscreenHint = false;
      writePrefs();
    }
  }

  function wireEvents() {
    document.addEventListener('click', (event) => {
      const id = event.target?.id;
      if (id === 'shell-fullscreen') requestFullscreen();
      if (id === 'shell-scroll-lock') {
        prefs.lockScroll = !prefs.lockScroll;
        writePrefs();
        syncShellClasses();
        syncButtons();
        setBanner(prefs.lockScroll ? 'Scroll Lock on: fewer accidental page moves.' : 'Scroll Lock off.');
      }
      if (id === 'shell-large-touch') {
        prefs.largeTouch = !prefs.largeTouch;
        writePrefs();
        syncShellClasses();
        syncButtons();
      }
      if (id === 'shell-hide') {
        prefs.hidePanel = !prefs.hidePanel;
        writePrefs();
        syncShellClasses();
        syncButtons();
        if (prefs.hidePanel) setBanner('Mobile shell hidden. Press V to show it again.');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyV' || event.ctrlKey || event.metaKey || event.altKey) return;
      prefs.hidePanel = !prefs.hidePanel;
      writePrefs();
      syncShellClasses();
      syncButtons();
      setBanner(prefs.hidePanel ? 'Mobile shell hidden.' : 'Mobile shell visible.');
    });

    document.addEventListener('touchend', (event) => {
      const now = Date.now();
      if (now - lastTouchEnd < 320) event.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    document.addEventListener('gesturestart', (event) => event.preventDefault?.(), { passive: false });
    window.visualViewport?.addEventListener('resize', () => { updateStatus(); detectViewportJump(); });
    addEventListener('orientationchange', () => setTimeout(() => { updateStatus(); setBanner('Orientation changed. Controls recalibrated.'); }, 280));
    addEventListener('resize', updateStatus);
    addEventListener('blur', () => setBanner('Game paused in background. Tap the canvas before driving again.', 3000));
  }

  function start() {
    ensureStyles();
    makePanel();
    syncShellClasses();
    wireEvents();
    updateStatus();
    setInterval(() => { updateStatus(); detectViewportJump(); }, 1500);
    if (isCoarsePointer()) setBanner('Mobile controls ready • V toggles shell panel', 4200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
