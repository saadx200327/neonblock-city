(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:qaPanelHidden';
  const $ = (id) => document.getElementById(id);

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function safeSnapshot() {
    try {
      return window.NeonBlockGame?.getSnapshot?.() || null;
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  }

  function writeDebugError(message) {
    const error = $('debug-last-error');
    if (error) error.textContent = message;
  }

  function popup(message) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function button(label, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function addPanel() {
    const panel = document.createElement('section');
    panel.id = 'qa-polish-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <strong>Runtime QA</strong>
      <div id="qa-polish-status">Waiting for game snapshot...</div>
      <div id="qa-polish-actions"></div>
    `;
    document.body.appendChild(panel);

    const actions = $('qa-polish-actions');
    actions.append(
      button('Smoke Check', runSmokeCheck),
      button('Emergency Save', () => {
        try {
          window.NeonBlockGame?.saveState?.();
          localStorage.setItem('neonblock:lastManualQaSave', String(Date.now()));
          popup('QA emergency save complete');
        } catch (error) {
          writeDebugError(`QA save failed: ${error?.message || error}`);
          popup('QA save failed');
        }
      }),
      button('Hide Q', () => {
        panel.classList.toggle('hidden');
        localStorage.setItem(STORAGE_KEY, panel.classList.contains('hidden') ? '1' : '0');
      })
    );

    if (localStorage.getItem(STORAGE_KEY) === '1') panel.classList.add('hidden');
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyQ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        panel.classList.toggle('hidden');
        localStorage.setItem(STORAGE_KEY, panel.classList.contains('hidden') ? '1' : '0');
      }
    });
  }

  function runSmokeCheck() {
    const snap = safeSnapshot();
    const checks = [];
    checks.push(['Runtime API', !!window.NeonBlockGame]);
    checks.push(['Snapshot readable', !!snap && !snap.error]);
    checks.push(['Player object', !!snap?.player?.mesh?.position]);
    checks.push(['World chunks streamed', Number(snap?.chunks || 0) > 0]);
    checks.push(['Interact lists bounded', Number(snap?.vehicles || 0) + Number(snap?.crates || 0) + Number(snap?.lots || 0) < 220]);
    checks.push(['Save function', typeof window.NeonBlockGame?.saveState === 'function']);
    checks.push(['Load function', typeof window.NeonBlockGame?.loadState === 'function']);

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
    const status = failed.length ? `Needs check: ${failed.join(', ')}` : 'Smoke check passed';
    const statusEl = $('qa-polish-status');
    if (statusEl) statusEl.textContent = status;
    writeDebugError(status);
    popup(status);
    return { at: Date.now(), checks, status };
  }

  function guardPlayerBounds() {
    const snap = safeSnapshot();
    const pos = snap?.player?.mesh?.position;
    if (!pos) return;
    const tooLow = Number(pos.y) < -25;
    const tooFar = Math.abs(Number(pos.x)) > 5000 || Math.abs(Number(pos.z)) > 5000;
    if (!tooLow && !tooFar) return;
    pos.set(0, 4, 0);
    snap.player.vel?.set?.(0, 0, 0);
    writeDebugError('QA recovered player from unsafe bounds');
    popup('Recovered player position');
    try { window.NeonBlockGame?.saveState?.(); } catch (_) {}
  }

  function refreshStatus() {
    const snap = safeSnapshot();
    const status = $('qa-polish-status');
    if (!status) return;
    if (!snap || snap.error) {
      status.textContent = snap?.error ? `Snapshot error: ${snap.error}` : 'Waiting for game snapshot...';
      return;
    }
    const pos = snap.player?.mesh?.position;
    const cash = Math.floor(Number(snap.player?.cash || 0));
    status.textContent = `chunks ${snap.chunks} • vehicles ${snap.vehicles} • crates ${snap.crates} • lots ${snap.lots} • cash $${cash} • pos ${pos ? `${pos.x.toFixed(0)},${pos.z.toFixed(0)}` : 'n/a'}`;
  }

  ready(() => {
    addPanel();
    setInterval(refreshStatus, 1500);
    setInterval(guardPlayerBounds, 3000);
    setTimeout(runSmokeCheck, 2500);
  });
})();
