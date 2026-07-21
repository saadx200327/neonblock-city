(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:property-polish';
  const CLAIM_KEY = 'neonblock:property-last-claim';
  const $ = (id) => document.getElementById(id);

  function game() {
    return window.NeonBlockGame || null;
  }

  function snapshot() {
    try {
      const api = game();
      return api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    } catch (error) {
      return null;
    }
  }

  function getOwnedLots(snap) {
    const owned = snap?.player?.ownedLots || {};
    return Object.keys(owned).filter((id) => owned[id]);
  }

  function parseLotId(id) {
    const match = /^lot-(-?\d+)-(-?\d+)$/.exec(id || '');
    if (!match) return null;
    return { cx: Number(match[1]), cz: Number(match[2]) };
  }

  function lotWorldPosition(id) {
    const parsed = parseLotId(id);
    if (!parsed) return null;
    return { x: parsed.cx * 48, z: parsed.cz * 48 };
  }

  function distanceToLot(snap, id) {
    const pos = lotWorldPosition(id);
    const player = snap?.player?.mesh?.position;
    if (!pos || !player) return null;
    return Math.hypot((player.x || 0) - pos.x, (player.z || 0) - pos.z);
  }

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writePrefs(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      // Non-critical; gameplay must continue if localStorage is full.
    }
  }

  const prefs = Object.assign({ hidden: false }, readPrefs());
  const panel = document.createElement('div');
  panel.id = 'property-polish-panel';
  panel.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:208px',
    'z-index:35',
    'width:min(300px,calc(100vw - 24px))',
    'padding:10px 12px',
    'border:1px solid rgba(120,180,255,.35)',
    'border-radius:14px',
    'background:rgba(5,10,25,.78)',
    'backdrop-filter:blur(10px)',
    'color:#eaf6ff',
    'font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif',
    'box-shadow:0 8px 30px rgba(0,0,0,.35)'
  ].join(';');
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
      <strong>Property Ledger</strong>
      <button id="property-polish-toggle" type="button" style="font:inherit;border:0;border-radius:999px;padding:3px 8px;background:#172545;color:#dff7ff">${prefs.hidden ? 'Show' : 'Hide'}</button>
    </div>
    <div id="property-polish-body">
      <div id="property-polish-summary">Loading ownership...</div>
      <div id="property-polish-nearest" style="margin-top:4px;color:#a9c7ff"></div>
      <div id="property-polish-income" style="margin-top:4px;color:#9effc2"></div>
      <button id="property-polish-claim" type="button" style="margin-top:8px;width:100%;border:0;border-radius:10px;padding:7px 8px;background:#28d980;color:#04120a;font-weight:800">Collect property bonus</button>
      <button id="property-polish-copy" type="button" style="margin-top:6px;width:100%;border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:6px 8px;background:rgba(255,255,255,.08);color:#eaf6ff">Copy ledger report</button>
    </div>`;
  document.body.appendChild(panel);

  const body = $('property-polish-body');
  const toggle = $('property-polish-toggle');
  const summary = $('property-polish-summary');
  const nearest = $('property-polish-nearest');
  const income = $('property-polish-income');
  const claim = $('property-polish-claim');
  const copy = $('property-polish-copy');

  function setHidden(hidden) {
    prefs.hidden = Boolean(hidden);
    writePrefs(prefs);
    if (body) body.style.display = prefs.hidden ? 'none' : '';
    if (toggle) toggle.textContent = prefs.hidden ? 'Show' : 'Hide';
  }

  function claimableAmount(count) {
    const lastClaim = Number(localStorage.getItem(CLAIM_KEY) || 0);
    const elapsedMinutes = Math.max(0, (Date.now() - lastClaim) / 60000);
    const amount = Math.floor(Math.min(360, elapsedMinutes * Math.max(1, count) * 2));
    return { amount, elapsedMinutes };
  }

  function popup(text) {
    const reward = $('reward-popup');
    if (!reward) return;
    reward.textContent = text;
    reward.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => reward.classList.add('hidden'), 1800);
  }

  function currentReport() {
    const snap = snapshot();
    const owned = getOwnedLots(snap);
    const claimable = claimableAmount(owned.length);
    return {
      ownedCount: owned.length,
      ownedLots: owned,
      cash: Math.floor(snap?.player?.cash || 0),
      xp: Math.floor(snap?.player?.xp || 0),
      claimable: claimable.amount,
      chunks: snap?.chunks || 0,
      activeVehicle: snap?.player?.activeVehicle?.userData?.name || 'On foot'
    };
  }

  function render() {
    const snap = snapshot();
    if (!snap) {
      summary.textContent = 'Waiting for game runtime...';
      nearest.textContent = '';
      income.textContent = '';
      claim.disabled = true;
      return;
    }

    const owned = getOwnedLots(snap);
    const count = owned.length;
    summary.textContent = count ? `${count} owned lot${count === 1 ? '' : 's'} producing passive value.` : 'No properties owned yet. Buy purple lots with Interact.';

    const nearestOwned = owned
      .map((id) => ({ id, distance: distanceToLot(snap, id) }))
      .filter((item) => Number.isFinite(item.distance))
      .sort((a, b) => a.distance - b.distance)[0];
    nearest.textContent = nearestOwned ? `Nearest owned lot: ${nearestOwned.id} • ${Math.round(nearestOwned.distance)}m away` : (count ? 'Owned lots will show distance once their chunk math is available.' : 'Look for purple pads in streamed city chunks.');

    const claimable = claimableAmount(count);
    income.textContent = count ? `Bonus ready: $${claimable.amount} • rate scales with owned lots.` : 'Property bonus unlocks after buying your first lot.';
    claim.disabled = !count || claimable.amount < 1;
    claim.textContent = claim.disabled ? 'No property bonus ready' : `Collect $${claimable.amount} property bonus`;
  }

  toggle?.addEventListener('click', () => setHidden(!prefs.hidden));

  claim?.addEventListener('click', () => {
    const snap = snapshot();
    const owned = getOwnedLots(snap);
    const ready = claimableAmount(owned.length).amount;
    if (!snap?.player || ready < 1) return;
    snap.player.cash = Math.floor((snap.player.cash || 0) + ready);
    snap.player.xp = Math.floor((snap.player.xp || 0) + Math.max(1, Math.floor(ready / 8)));
    localStorage.setItem(CLAIM_KEY, String(Date.now()));
    try { game()?.saveState?.(snap.player.slot || 'slot1'); } catch (error) {}
    popup(`Property bonus +$${ready}`);
    render();
  });

  copy?.addEventListener('click', async () => {
    const report = currentReport();
    const text = [
      'NeonBlock City Property Ledger',
      `Owned lots: ${report.ownedCount}`,
      `Cash: $${report.cash}`,
      `XP: ${report.xp}`,
      `Claimable bonus: $${report.claimable}`,
      `Chunks streamed: ${report.chunks}`,
      `Vehicle: ${report.activeVehicle}`,
      `Lots: ${report.ownedLots.join(', ') || 'none'}`
    ].join('\n');
    try {
      await navigator.clipboard?.writeText(text);
      popup('Property ledger copied');
    } catch (error) {
      popup('Copy unavailable');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyO' && !event.ctrlKey && !event.metaKey && !event.altKey) setHidden(!prefs.hidden);
  });

  setHidden(prefs.hidden);
  setInterval(render, 1000);
  setTimeout(render, 300);
})();
