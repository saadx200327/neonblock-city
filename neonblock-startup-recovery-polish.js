(() => {
  'use strict';

  const state = {
    startedAt: Date.now(),
    readyAt: null,
    failure: null,
    recoveryVisible: false,
    lastError: null
  };

  const loading = () => document.getElementById('loading-screen');

  function gameIsReady() {
    return Boolean(window.NeonBlockGame && document.getElementById('game-canvas'));
  }

  function loadingIsVisible() {
    const element = loading();
    return Boolean(element && !element.classList.contains('hidden'));
  }

  function describeFailure() {
    if (!window.THREE) return 'The local 3D engine did not load.';
    if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) return 'This browser does not expose WebGL graphics support.';
    if (state.lastError) return `Startup stopped: ${state.lastError}`;
    return 'The game took too long to finish starting.';
  }

  function releaseInputs() {
    window.NeonBlockInputLifecycleGuard?.releaseAll?.();
    window.NeonBlockMobilePointerGuard?.releaseAll?.();
  }

  function showRecovery(reason = describeFailure()) {
    if (gameIsReady() && !loadingIsVisible()) return false;
    const element = loading();
    if (!element) return false;

    state.failure = reason;
    state.recoveryVisible = true;
    releaseInputs();

    element.classList.remove('hidden');
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-live', 'assertive');
    element.innerHTML = '';

    const card = document.createElement('div');
    card.style.cssText = 'max-width:420px;margin:20px;padding:24px;border:1px solid rgba(23,243,255,.45);border-radius:16px;background:rgba(5,8,20,.94);text-align:center;box-shadow:0 16px 50px rgba(0,0,0,.45)';

    const title = document.createElement('div');
    title.className = 'loading-title';
    title.textContent = 'NeonBlock City could not start';

    const detail = document.createElement('p');
    detail.textContent = reason;
    detail.style.cssText = 'margin:12px 0 18px;line-height:1.45;color:#d9faff';

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry Game';
    retry.style.cssText = 'min-width:150px;padding:12px 18px;border-radius:10px;border:1px solid #17f3ff;background:#10283a;color:white;font:inherit;font-weight:700;cursor:pointer';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      retry.textContent = 'Reloading…';
      location.reload();
    });

    const hint = document.createElement('p');
    hint.textContent = 'Your local save data will be kept.';
    hint.style.cssText = 'margin:14px 0 0;font-size:.85rem;opacity:.8';

    card.append(title, detail, retry, hint);
    element.append(card);
    retry.focus({ preventScroll: true });
    return true;
  }

  function markReady() {
    if (!gameIsReady()) return false;
    state.readyAt = state.readyAt || Date.now();
    state.failure = null;
    state.recoveryVisible = false;
    return true;
  }

  window.addEventListener('error', (event) => {
    state.lastError = event?.message || 'Unknown script error';
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    state.lastError = reason?.message || String(reason || 'Unhandled startup rejection');
  });

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      if (!markReady() || loadingIsVisible()) showRecovery();
    }, 7000);
  }, { once: true });

  window.setTimeout(markReady, 0);

  window.NeonBlockStartupRecovery = {
    getStatus: () => ({
      ...state,
      ready: gameIsReady(),
      loadingVisible: loadingIsVisible(),
      elapsedMs: Date.now() - state.startedAt
    }),
    retry: () => location.reload(),
    showRecovery
  };
})();
