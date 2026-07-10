(() => {
  'use strict';

  const STORE_KEY = 'neonblock:mobile-actions:v1';
  const DRAWER_ID = 'neonblock-mobile-action-drawer';
  const GRID_ID = 'neonblock-mobile-action-grid';
  const MORE_ID = 'btn-mobile-more';
  const CORE_IDS = new Set([
    'btn-mobile-jump',
    'btn-mobile-sprint',
    'btn-mobile-interact',
    'btn-mobile-unstuck',
    'btn-mobile-pause',
    MORE_ID
  ]);

  let rail;
  let drawer;
  let grid;
  let moreButton;
  let observer;
  let syncing = false;
  let open = readOpenState();

  function readOpenState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}').open === true; }
    catch { return false; }
  }

  function writeOpenState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ open })); } catch {}
  }

  function isMobileLayout() {
    return innerWidth <= 760 || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }

  function optionalButtons(container) {
    return Array.from(container?.querySelectorAll?.('button.action-btn[id^="btn-mobile-"]') || [])
      .filter((button) => !CORE_IDS.has(button.id));
  }

  function injectStyles() {
    if (document.getElementById('neonblock-mobile-actions-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-mobile-actions-style';
    style.textContent = `
      #${DRAWER_ID} {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        bottom: calc(14px + env(safe-area-inset-bottom));
        z-index: 42;
        width: min(430px, calc(100vw - 24px));
        max-height: min(62vh, 560px);
        overflow: auto;
        padding: 12px;
        border: 1px solid rgba(23, 243, 255, 0.38);
        border-radius: 18px;
        background: rgba(5, 8, 20, 0.94);
        color: #f7f9ff;
        box-shadow: 0 20px 70px rgba(0,0,0,0.6), 0 0 30px rgba(23,243,255,0.12);
        backdrop-filter: blur(14px);
        pointer-events: auto;
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #${DRAWER_ID}[hidden] { display: none !important; }
      #${DRAWER_ID} .mobile-action-head {
        position: sticky; top: -12px; z-index: 1;
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        margin: -12px -12px 10px; padding: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        background: rgba(5, 8, 20, 0.97);
      }
      #${DRAWER_ID} .mobile-action-title { color: #69f7ff; font-weight: 900; }
      #${DRAWER_ID} .mobile-action-sub { color: #aeb6d8; font-size: 11px; }
      #${DRAWER_ID} .mobile-action-close {
        min-width: 44px; min-height: 44px; border: 1px solid rgba(255,255,255,0.14);
        border-radius: 999px; background: rgba(255,255,255,0.08); color: #f7f9ff; font-weight: 900;
      }
      #${GRID_ID} {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      #${GRID_ID} .action-btn {
        width: 100%; min-width: 0; min-height: 46px; padding: 8px 6px;
        border-color: rgba(23,243,255,0.24); border-radius: 12px;
        white-space: normal; overflow-wrap: anywhere;
      }
      #${MORE_ID} { border-color: rgba(94,243,140,0.55); background: rgba(94,243,140,0.18); }
      #${MORE_ID}[hidden] { display: none !important; }
      @media (max-width: 420px) {
        #${GRID_ID} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (orientation: landscape) and (max-height: 480px) {
        #${DRAWER_ID} { max-height: calc(100vh - 20px); bottom: 10px; }
        #${GRID_ID} { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
    `;
    document.head.appendChild(style);
  }

  function buildDrawer() {
    if (drawer) return;
    drawer = document.createElement('section');
    drawer.id = DRAWER_ID;
    drawer.setAttribute('aria-label', 'More mobile game actions');
    drawer.innerHTML = `
      <div class="mobile-action-head">
        <div>
          <div class="mobile-action-title">More Actions</div>
          <div class="mobile-action-sub" id="mobile-action-count">0 shortcuts</div>
        </div>
        <button class="mobile-action-close" type="button" aria-label="Close more actions">Close</button>
      </div>
      <div id="${GRID_ID}"></div>
    `;
    document.body.appendChild(drawer);
    grid = drawer.querySelector(`#${GRID_ID}`);
    drawer.querySelector('.mobile-action-close').addEventListener('click', () => setOpen(false));
    grid.addEventListener('click', (event) => {
      if (event.target.closest('button.action-btn')) setOpen(false);
    });
  }

  function buildMoreButton() {
    if (moreButton || !rail) return;
    moreButton = document.getElementById(MORE_ID);
    if (!moreButton) {
      moreButton = document.createElement('button');
      moreButton.id = MORE_ID;
      moreButton.className = 'action-btn';
      moreButton.type = 'button';
      moreButton.addEventListener('click', () => setOpen(!open));
      rail.appendChild(moreButton);
    }
  }

  function setOpen(next) {
    open = Boolean(next) && isMobileLayout() && optionalButtons(grid).length > 0;
    writeOpenState();
    if (drawer) drawer.hidden = !open;
    if (moreButton) moreButton.setAttribute('aria-expanded', String(open));
  }

  function updateLabels() {
    const count = optionalButtons(grid).length;
    if (moreButton) {
      moreButton.textContent = count ? `More ${count}` : 'More';
      moreButton.hidden = !isMobileLayout() || count === 0;
      moreButton.setAttribute('aria-controls', DRAWER_ID);
      moreButton.setAttribute('aria-expanded', String(open));
      moreButton.setAttribute('aria-label', `Show ${count} more game actions`);
    }
    const countEl = drawer?.querySelector('#mobile-action-count');
    if (countEl) countEl.textContent = `${count} shortcut${count === 1 ? '' : 's'} · tap one to close`;
    if (!count || !isMobileLayout()) setOpen(false);
  }

  function moveToDrawer() {
    optionalButtons(rail).forEach((button) => grid.appendChild(button));
  }

  function restoreToRail() {
    optionalButtons(grid).forEach((button) => rail.insertBefore(button, moreButton));
  }

  function syncLayout() {
    if (syncing || !rail || !grid) return;
    syncing = true;
    if (isMobileLayout()) moveToDrawer();
    else restoreToRail();
    updateLabels();
    syncing = false;
  }

  function watchRail() {
    observer = new MutationObserver(() => {
      if (!syncing) queueMicrotask(syncLayout);
    });
    observer.observe(rail, { childList: true });
  }

  function wireEvents() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) setOpen(false);
    });
    document.addEventListener('pointerdown', (event) => {
      if (!open || drawer.contains(event.target) || moreButton.contains(event.target)) return;
      setOpen(false);
    });
    let resizeTimer;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncLayout, 140);
    });
  }

  function getSnapshot() {
    return {
      mobileLayout: isMobileLayout(),
      open,
      coreActions: Array.from(rail?.querySelectorAll?.('button.action-btn') || []).filter((button) => CORE_IDS.has(button.id)).map((button) => button.id),
      drawerActions: optionalButtons(grid).map((button) => ({ id: button.id, label: button.textContent.trim() }))
    };
  }

  function boot() {
    rail = document.getElementById('action-rail');
    if (!rail) return;
    injectStyles();
    buildDrawer();
    buildMoreButton();
    syncLayout();
    watchRail();
    wireEvents();
    window.NeonBlockMobileActions = { getSnapshot, close: () => setOpen(false), refresh: syncLayout };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
