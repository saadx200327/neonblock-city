(() => {
  'use strict';

  const KEY = 'neonblock:performancePolish';
  const state = readState();
  let frames = 0;
  let elapsed = 0;
  let last = performance.now();
  let lowFpsSeconds = 0;
  let highFpsSeconds = 0;
  let lastAppliedAt = 0;
  let lastFps = 0;
  let ignoredHiddenFrames = 0;
  let visibilityPauses = 0;
  let visibilityResumes = 0;
  let lifecyclePauses = 0;
  let lifecycleResumes = 0;
  let frozen = false;
  let pageHidden = false;
  let lastLifecycleReason = 'startup';
  let rafId = 0;
  let running = false;
  let panel;

  function readState() {
    try {
      return Object.assign({ hidden: false, adaptive: true, bestFps: 0, lastQuality: 'auto' }, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (_) {
      return { hidden: false, adaptive: true, bestFps: 0, lastQuality: 'auto' };
    }
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  function game() {
    return window.NeonBlockGame || null;
  }

  function snapshot() {
    try { return game()?.getSnapshot?.() || null; } catch (_) { return null; }
  }

  function isSuspended() {
    return document.hidden || frozen || pageHidden;
  }

  function applyQuality(quality, reason) {
    const api = game();
    if (!api?.applyGraphicsQuality) return false;
    api.applyGraphicsQuality(quality, true);
    state.lastQuality = quality;
    lastAppliedAt = performance.now();
    saveState();
    toast(`Performance Guard: ${quality.toUpperCase()} graphics (${reason})`);
    return true;
  }

  function toast(text) {
    const popup = document.getElementById('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => popup.classList.add('hidden'), 1800);
  }

  function createPanel() {
    panel = document.createElement('section');
    panel.id = 'performance-polish-panel';
    panel.style.cssText = [
      'position:fixed',
      'left:max(12px,env(safe-area-inset-left))',
      'bottom:max(132px,calc(env(safe-area-inset-bottom) + 132px))',
      'z-index:18',
      'width:min(280px,calc(100vw - 24px))',
      'padding:10px 12px',
      'border:1px solid rgba(23,243,255,.32)',
      'border-radius:14px',
      'background:rgba(5,8,20,.74)',
      'backdrop-filter:blur(10px)',
      'color:#e8fbff',
      'font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif',
      'box-shadow:0 12px 28px rgba(0,0,0,.32)'
    ].join(';');
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <strong style="font-size:13px;color:#17f3ff">Performance Guard</strong>
        <button data-perf="hide" style="min-height:28px">${state.hidden ? 'Show' : 'Hide'}</button>
      </div>
      <div data-perf="body">
        <div data-perf="fps">FPS: checking...</div>
        <div data-perf="world">World: checking...</div>
        <div data-perf="advice" style="margin:6px 0;color:#c9f7ff">Adaptive tuning is on.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button data-perf="adaptive" style="min-height:30px">Adaptive: ${state.adaptive ? 'On' : 'Off'}</button>
          <button data-perf="stabilize" style="min-height:30px">Stabilize Now</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-perf="hide"]').addEventListener('click', () => {
      state.hidden = !state.hidden;
      saveState();
      render();
    });
    panel.querySelector('[data-perf="adaptive"]').addEventListener('click', () => {
      state.adaptive = !state.adaptive;
      resetSampling();
      saveState();
      render();
      toast(`Adaptive performance ${state.adaptive ? 'on' : 'off'}`);
    });
    panel.querySelector('[data-perf="stabilize"]').addEventListener('click', () => applyQuality('low', 'manual stabilize'));
    render();
  }

  function render() {
    if (!panel) return;
    const body = panel.querySelector('[data-perf="body"]');
    const hide = panel.querySelector('[data-perf="hide"]');
    if (body) body.style.display = state.hidden ? 'none' : 'block';
    if (hide) hide.textContent = state.hidden ? 'Show' : 'Hide';
    if (state.hidden) return;
    const snap = snapshot();
    const quality = snap?.graphics?.quality || state.lastQuality || 'auto';
    const chunks = snap?.chunks ?? '...';
    const objects = ['vehicles', 'crates', 'lots'].map((name) => snap?.[name] ?? 0).reduce((a, b) => a + b, 0);
    const fpsEl = panel.querySelector('[data-perf="fps"]');
    const worldEl = panel.querySelector('[data-perf="world"]');
    const adviceEl = panel.querySelector('[data-perf="advice"]');
    const adaptiveEl = panel.querySelector('[data-perf="adaptive"]');
    if (fpsEl) fpsEl.textContent = `FPS: ${lastFps || '...'} • Best: ${state.bestFps || '...'}`;
    if (worldEl) worldEl.textContent = `Quality: ${quality} • Chunks: ${chunks} • Nearby objs: ${objects}`;
    if (adviceEl) adviceEl.textContent = state.adaptive ? adviceText(snap, quality) : 'Adaptive tuning is off. Use Stabilize Now if phone play feels hot or choppy.';
    if (adaptiveEl) adaptiveEl.textContent = `Adaptive: ${state.adaptive ? 'On' : 'Off'}`;
  }

  function adviceText(snap, quality) {
    if (isSuspended()) return 'Performance sampling is paused while the game is in the background.';
    if (!snap) return 'Waiting for the game world before adaptive tuning starts...';
    if (!lastFps) return 'Measuring live frame pacing...';
    if (lastFps < 24) return 'Low FPS detected. Guard will drop graphics if this continues.';
    if ((snap?.chunks || 0) > 35) return 'High chunk count. Move slower or use Low graphics on mobile.';
    if (quality === 'low' && lastFps > 48) return 'Stable on Low. You can try Medium from Settings later.';
    return 'Frame pacing looks playable.';
  }

  function resetSampling() {
    frames = 0;
    elapsed = 0;
    last = performance.now();
    lastFps = 0;
    lowFpsSeconds = 0;
    highFpsSeconds = 0;
  }

  function maybeTune(dt) {
    if (!state.adaptive || isSuspended()) return;
    const snap = snapshot();
    if (!snap) {
      lowFpsSeconds = 0;
      highFpsSeconds = 0;
      return;
    }
    const now = performance.now();
    if (now - lastAppliedAt < 20000) return;
    const quality = snap.graphics?.quality || state.lastQuality || 'auto';
    if (lastFps && lastFps < 24) {
      lowFpsSeconds += dt;
      highFpsSeconds = 0;
    } else if (lastFps > 52) {
      highFpsSeconds += dt;
      lowFpsSeconds = 0;
    } else {
      lowFpsSeconds = Math.max(0, lowFpsSeconds - dt);
      highFpsSeconds = Math.max(0, highFpsSeconds - dt);
    }
    if (lowFpsSeconds > 6 && quality !== 'low') {
      applyQuality('low', 'sustained low FPS');
      lowFpsSeconds = 0;
    } else if (highFpsSeconds > 30 && quality === 'high') {
      applyQuality('medium', 'phone-friendly stability');
      highFpsSeconds = 0;
    }
  }

  function scheduleLoop() {
    if (running || isSuspended()) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    running = false;
  }

  function pauseLifecycle(reason) {
    lastLifecycleReason = reason;
    lifecyclePauses += 1;
    stopLoop();
    render();
  }

  function resumeLifecycle(reason) {
    lastLifecycleReason = reason;
    if (isSuspended()) return;
    lifecycleResumes += 1;
    resetSampling();
    scheduleLoop();
    render();
  }

  function loop(now) {
    rafId = 0;
    if (isSuspended()) {
      ignoredHiddenFrames += 1;
      running = false;
      return;
    }
    const dt = Math.min(0.25, (now - last) / 1000 || 0);
    last = now;
    frames += 1;
    elapsed += dt;
    if (elapsed >= 1) {
      lastFps = Math.round(frames / elapsed);
      if (lastFps > (state.bestFps || 0)) {
        state.bestFps = lastFps;
        saveState();
      }
      frames = 0;
      elapsed = 0;
      maybeTune(1);
      render();
    }
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      visibilityPauses += 1;
      pauseLifecycle('visibility-hidden');
    } else {
      visibilityResumes += 1;
      resumeLifecycle('visibility-visible');
    }
  });

  document.addEventListener('freeze', () => {
    frozen = true;
    pauseLifecycle('freeze');
  });

  document.addEventListener('resume', () => {
    frozen = false;
    resumeLifecycle('resume');
  });

  window.addEventListener('pagehide', () => {
    pageHidden = true;
    pauseLifecycle('pagehide');
  });

  window.addEventListener('pageshow', () => {
    pageHidden = false;
    resumeLifecycle('pageshow');
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const editable = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (event.code !== 'KeyJ' || event.repeat || editable) return;
    state.hidden = !state.hidden;
    saveState();
    render();
    toast(`Performance Guard ${state.hidden ? 'hidden' : 'shown'}`);
  });

  window.NeonBlockPerformancePolish = {
    getStatus: () => ({
      version: 4,
      adaptive: state.adaptive,
      lastFps,
      bestFps: state.bestFps,
      lowFpsSeconds,
      highFpsSeconds,
      ignoredHiddenFrames,
      visibilityPauses,
      visibilityResumes,
      lifecyclePauses,
      lifecycleResumes,
      frozen,
      pageHidden,
      suspended: isSuspended(),
      lastLifecycleReason,
      loopRunning: running,
      animationFrameScheduled: Boolean(rafId),
      documentHidden: document.hidden,
      gameReady: Boolean(snapshot())
    }),
    resetSampling,
    refresh: () => {
      resetSampling();
      render();
      scheduleLoop();
    }
  };

  window.addEventListener('load', () => {
    createPanel();
    resetSampling();
    scheduleLoop();
  });
})();