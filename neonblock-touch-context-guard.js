(() => {
  'use strict';

  const CONTROL_SELECTOR = [
    '#game-canvas',
    '#joystick-container',
    '#joystick-base',
    '#joystick-stick',
    '#mobile-controls button',
    '#action-rail button',
    '.action-btn'
  ].join(',');

  const state = {
    contextMenusBlocked: 0,
    dragsBlocked: 0,
    selectionsCleared: 0,
    lastTarget: null,
    installedAt: Date.now()
  };

  function gameplayTarget(target) {
    return target instanceof Element ? target.closest(CONTROL_SELECTOR) : null;
  }

  function describe(element) {
    if (!element) return null;
    return element.id || element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 32) || element.tagName;
  }

  function blockContextMenu(event) {
    const target = gameplayTarget(event.target);
    if (!target) return;
    event.preventDefault();
    state.contextMenusBlocked += 1;
    state.lastTarget = describe(target);
  }

  function blockDrag(event) {
    const target = gameplayTarget(event.target);
    if (!target) return;
    event.preventDefault();
    state.dragsBlocked += 1;
    state.lastTarget = describe(target);
  }

  function clearAccidentalSelection(event) {
    const target = gameplayTarget(event.target);
    if (!target || event.pointerType !== 'touch') return;
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) return;
    selection.removeAllRanges();
    state.selectionsCleared += 1;
    state.lastTarget = describe(target);
  }

  function installStyles() {
    if (document.getElementById('neonblock-touch-context-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-touch-context-style';
    style.textContent = `
      ${CONTROL_SELECTOR} {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      #game-canvas,
      #joystick-container,
      #joystick-base,
      #joystick-stick {
        touch-action: none;
      }
      #mobile-controls button,
      #action-rail button,
      .action-btn {
        touch-action: manipulation;
      }
    `;
    document.head.appendChild(style);
  }

  installStyles();
  document.addEventListener('contextmenu', blockContextMenu, { capture: true });
  document.addEventListener('dragstart', blockDrag, { capture: true });
  document.addEventListener('pointerup', clearAccidentalSelection, { capture: true, passive: true });
  document.addEventListener('pointercancel', clearAccidentalSelection, { capture: true, passive: true });

  window.NeonBlockTouchContextGuard = Object.freeze({
    version: 1,
    getStatus: () => ({ ...state, active: true })
  });
})();
