(() => {
  'use strict';

  const VERSION = 3;
  const BUTTON_ID = 'btn-mobile-missions';
  let openCount = 0;
  let closeCount = 0;
  let blockedEditableHotkeys = 0;
  let boardStateUpdates = 0;
  let focusMoves = 0;
  let observer = null;
  let observedBoard = null;
  let lastError = '';

  function isEditable(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
  }

  function getBoard() {
    return document.getElementById('mission-board');
  }

  function isBoardOpen(board = getBoard()) {
    return Boolean(board && !board.classList.contains('hidden') && !board.hidden && board.getAttribute('aria-hidden') !== 'true');
  }

  function syncButtonState() {
    const button = document.getElementById(BUTTON_ID);
    const opened = isBoardOpen();
    if (!button) return;
    button.setAttribute('aria-expanded', opened ? 'true' : 'false');
    button.setAttribute('aria-label', opened ? 'Close mission board' : 'Open mission board');
    button.classList.toggle('active', opened);
    boardStateUpdates += 1;
  }

  function focusMissionBoard(board) {
    if (!board) return;
    const target = board.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || board;
    if (target === board && !board.hasAttribute('tabindex')) board.setAttribute('tabindex', '-1');
    try {
      target.focus({ preventScroll: true });
      focusMoves += 1;
    } catch (_) {
      try {
        target.focus();
        focusMoves += 1;
      } catch (_) {}
    }
  }

  function setMissionBoard(open) {
    try {
      const board = getBoard();
      const trigger = document.getElementById('btn-missions');
      if (!board || !trigger) return false;
      const wasOpen = isBoardOpen(board);
      if (wasOpen !== open) trigger.click();
      const opened = isBoardOpen(board);
      syncButtonState();
      if (opened && !wasOpen) {
        openCount += 1;
        requestAnimationFrame(() => focusMissionBoard(board));
      } else if (!opened && wasOpen) {
        closeCount += 1;
      }
      return opened === open;
    } catch (error) {
      lastError = String(error?.message || error || 'Mission board state change failed');
      return false;
    }
  }

  function openMissionBoard() {
    return setMissionBoard(true);
  }

  function closeMissionBoard() {
    return setMissionBoard(false);
  }

  function toggleMissionBoard() {
    return setMissionBoard(!isBoardOpen());
  }

  function ensureButton() {
    const rail = document.getElementById('action-rail');
    if (!rail) return null;
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'action-btn';
    button.textContent = 'Missions';
    button.setAttribute('aria-label', 'Open mission board');
    button.setAttribute('aria-controls', 'mission-board');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      toggleMissionBoard();
    });
    rail.appendChild(button);
    return button;
  }

  function watchBoard() {
    const board = getBoard();
    if (observer && observedBoard === board) return;
    observer?.disconnect();
    observer = null;
    observedBoard = null;
    if (!board || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(syncButtonState);
    observer.observe(board, { attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
    observedBoard = board;
  }

  function refresh() {
    const button = ensureButton();
    if (!button) return false;
    const mobileLayout = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    button.hidden = !mobileLayout;
    button.disabled = !document.getElementById('btn-missions');
    syncButtonState();
    watchBoard();
    return !button.hidden && !button.disabled;
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyL' || !isEditable(event.target)) return;
    blockedEditableHotkeys += 1;
    event.stopImmediatePropagation();
  }, true);

  const start = () => {
    refresh();
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', refresh, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
    window.addEventListener('pagehide', () => {
      observer?.disconnect();
      observer = null;
      observedBoard = null;
    }, { once: true });
  };

  window.NeonBlockMobileMissionControl = {
    version: VERSION,
    open: openMissionBoard,
    close: closeMissionBoard,
    toggle: toggleMissionBoard,
    refresh,
    getStatus: () => {
      const button = document.getElementById(BUTTON_ID);
      const board = getBoard();
      return {
        version: VERSION,
        buttonPresent: Boolean(button),
        buttonVisible: Boolean(button && !button.hidden),
        missionBoardOpen: isBoardOpen(board),
        observerActive: Boolean(observer),
        openCount,
        closeCount,
        focusMoves,
        boardStateUpdates,
        blockedEditableHotkeys,
        lastError
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();