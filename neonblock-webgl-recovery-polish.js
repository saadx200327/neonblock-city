(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  let lossCount = 0;
  let restoreCount = 0;
  let lostAt = 0;
  let overlay = null;
  let reloadTimer = 0;

  function releaseInputs(reason) {
    try {
      window.NeonBlockInputLifecycleGuard?.releaseAll?.(reason);
    } catch (error) {
      console.warn('[NeonBlock WebGL Recovery] Input release failed', error);
    }
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'neonblock-webgl-recovery';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'assertive');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '10050',
      display: 'none',
      placeItems: 'center',
      padding: '24px',
      background: 'rgba(5, 8, 20, 0.94)',
      color: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(430px, 100%)',
      padding: '22px',
      border: '1px solid rgba(23, 243, 255, 0.55)',
      borderRadius: '16px',
      background: '#0c1020',
      boxShadow: '0 18px 60px rgba(0, 0, 0, 0.45)'
    });

    const title = document.createElement('h2');
    title.textContent = 'Restoring NeonBlock City';
    title.style.margin = '0 0 10px';

    const message = document.createElement('p');
    message.dataset.webglMessage = 'true';
    message.textContent = 'The graphics system paused. Your current page state is still here while the browser restores the game.';
    message.style.margin = '0 0 16px';
    message.style.lineHeight = '1.45';

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload Game';
    reload.dataset.webglReload = 'true';
    reload.hidden = true;
    Object.assign(reload.style, {
      minHeight: '44px',
      padding: '10px 16px',
      border: '0',
      borderRadius: '10px',
      fontWeight: '700',
      cursor: 'pointer'
    });
    reload.addEventListener('click', () => location.reload());

    card.append(title, message, reload);
    overlay.append(card);
    document.body.append(overlay);
    return overlay;
  }

  function showRecovery() {
    const panel = ensureOverlay();
    const message = panel.querySelector('[data-webgl-message]');
    const reload = panel.querySelector('[data-webgl-reload]');
    panel.style.display = 'grid';
    if (message) message.textContent = 'The graphics system paused. Your current page state is still here while the browser restores the game.';
    if (reload) reload.hidden = true;

    clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      if (!lostAt) return;
      if (message) message.textContent = 'Graphics recovery is taking longer than expected. Reload to resume from the latest local save.';
      if (reload) reload.hidden = false;
    }, 8000);
  }

  function hideRecovery() {
    clearTimeout(reloadTimer);
    reloadTimer = 0;
    if (overlay) overlay.style.display = 'none';
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lossCount += 1;
    lostAt = Date.now();
    releaseInputs('webgl-context-lost');
    showRecovery();
    window.dispatchEvent(new CustomEvent('neonblock:webgl-lost', { detail: { lossCount, lostAt } }));
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    restoreCount += 1;
    const recoveredAfterMs = lostAt ? Date.now() - lostAt : 0;
    lostAt = 0;
    hideRecovery();
    window.dispatchEvent(new CustomEvent('neonblock:webgl-restored', { detail: { restoreCount, recoveredAfterMs } }));
  }, false);

  window.NeonBlockWebGLRecovery = Object.freeze({
    getStatus() {
      return {
        supported: true,
        contextLost: Boolean(lostAt),
        lossCount,
        restoreCount,
        lostAt: lostAt || null,
        overlayVisible: overlay?.style.display === 'grid'
      };
    },
    showForQA: showRecovery,
    hideForQA: hideRecovery
  });
})();
