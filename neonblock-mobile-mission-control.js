(() => {
  'use strict';

  const BUTTON_ID = 'btn-mobile-missions';
  let openCount = 0;
  let blockedEditableHotkeys = 0;
  let lastError = '';

  function isEditable(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
  }

  function showMissionBoard() {
    try {
      const board = document.getElementById('mission-board');
      const trigger = document.getElementById('btn-missions');
      if (!board || !trigger) return false;
      if (board.classList.contains('hidden')) trigger.click();
      const opened = !board.classList.contains('hidden');
      if (opened) openCount += 1;
      return opened;
    } catch (error) {
      lastError = String(error?.message || error || 'Mission board failed to open');
      return false;
    }
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
    button.addEventListener('click', (event) => {
      event.preventDefault();
      showMissionBoard();
    });
    rail.appendChild(button);
    return button;
  }

  function refresh() {
    const button = ensureButton();
    if (!button) return false;
    const mobileLayout = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    button.hidden = !mobileLayout;
    button.disabled = !document.getElementById('btn-missions');
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
  };

  window.NeonBlockMobileMissionControl = {
    open: showMissionBoard,
    refresh,
    getStatus: () => ({
      version: 1,
      buttonPresent: Boolean(document.getElementById(BUTTON_ID)),
      buttonVisible: !document.getElementById(BUTTON_ID)?.hidden,
      missionBoardOpen: !document.getElementById('mission-board')?.classList.contains('hidden'),
      openCount,
      blockedEditableHotkeys,
      lastError
    })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
