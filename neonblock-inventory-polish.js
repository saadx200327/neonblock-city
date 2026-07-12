(() => {
  'use strict';

  const KEY = 'neonblock:inventory:v1';
  const REPORT_KEY = 'neonblock:inventory:lastReport';
  const PANEL_ID = 'neonblock-inventory-panel';
  const MOBILE_ID = 'btn-mobile-inventory';
  const POLL_MS = 1000;
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const diagnostics = {
    version: 2,
    storageReadFailures: 0,
    storageWriteFailures: 0,
    rewardScans: 0,
    renders: 0,
    lastError: null,
    timerActive: false
  };
  let timer = 0;

  const defaultState = () => ({
    visible: false,
    items: { medkit: 1, fuel: 1, cityPass: 1 },
    totalUsed: 0,
    lastCrates: 0,
    lastOwnedLots: 0,
    lastLevel: 1,
    lastMessage: 'Starter backpack ready: medkit, fuel cell, and city pass.',
    updatedAt: Date.now()
  });

  function readStorage(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; }
    catch (error) {
      diagnostics.storageReadFailures += 1;
      diagnostics.lastError = error?.message || String(error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      diagnostics.storageWriteFailures += 1;
      diagnostics.lastError = error?.message || String(error);
      return false;
    }
  }

  function loadState() {
    try {
      const parsed = JSON.parse(readStorage(KEY, '{}') || '{}');
      return { ...defaultState(), ...parsed, items: { ...defaultState().items, ...(parsed.items || {}) } };
    } catch (error) {
      diagnostics.storageReadFailures += 1;
      diagnostics.lastError = error?.message || String(error);
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    state.updatedAt = Date.now();
    return writeStorage(KEY, JSON.stringify(state));
  }

  function snapshot() { return window.NeonBlockGame?.getSnapshot?.() || null; }
  function player() { return snapshot()?.player || null; }
  function activeVehicle(p = player()) { return p?.activeVehicle || null; }
  function countOwnedLots(p = player()) { return Object.keys(p?.ownedLots || {}).length; }

  function addStyles() {
    if (document.getElementById('neonblock-inventory-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-inventory-style';
    style.textContent = `
      #${PANEL_ID}{position:fixed;left:16px;bottom:84px;width:min(348px,calc(100vw - 24px));z-index:48;background:rgba(5,8,20,.93);border:1px solid rgba(255,211,56,.4);border-radius:16px;color:#fff8df;padding:14px;font:13px/1.35 system-ui,Segoe UI,sans-serif;box-shadow:0 0 24px rgba(255,211,56,.14);backdrop-filter:blur(10px)}
      #${PANEL_ID}.hidden{display:none!important} #${PANEL_ID} h3{margin:0 0 8px;color:#ffd338;font-size:16px} #${PANEL_ID} p{margin:6px 0;color:#fff0b8} #${PANEL_ID} .inv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0} #${PANEL_ID} .inv-card{background:rgba(255,255,255,.065);border:1px solid rgba(255,211,56,.14);border-radius:12px;padding:8px;text-align:center} #${PANEL_ID} .inv-card b{display:block;color:#fff;font-size:12px} #${PANEL_ID} .inv-card span{font-size:18px;color:#ffd338;font-weight:900} #${PANEL_ID} .inv-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} #${PANEL_ID} button{border:1px solid rgba(255,211,56,.48);background:rgba(255,211,56,.13);color:#fff8df;border-radius:10px;padding:8px 10px;font-weight:800} #${PANEL_ID} button:disabled{opacity:.45} #${PANEL_ID} button:active{transform:translateY(1px)} #${MOBILE_ID}{border-color:rgba(255,211,56,.75)!important}
      @media (max-width:760px){#${PANEL_ID}{left:10px;right:10px;bottom:118px;width:auto;font-size:12px}}
    `;
    document.head.appendChild(style);
  }

  function makePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = state.visible ? '' : 'hidden';
    panel.innerHTML = `
      <h3>Backpack</h3><p id="inv-summary">Loading inventory...</p>
      <div class="inv-grid"><div class="inv-card"><b>Medkits</b><span id="inv-medkit">0</span></div><div class="inv-card"><b>Fuel Cells</b><span id="inv-fuel">0</span></div><div class="inv-card"><b>City Passes</b><span id="inv-pass">0</span></div></div>
      <p id="inv-hint"></p><div class="inv-row"><button type="button" id="inv-use-medkit">Repair</button><button type="button" id="inv-use-fuel">Fuel</button><button type="button" id="inv-use-pass">Cash Pass</button><button type="button" id="inv-save">Save</button><button type="button" id="inv-copy">Copy QA</button></div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', (event) => {
      const id = event.target.closest('button')?.id;
      if (id === 'inv-use-medkit') useMedkit();
      if (id === 'inv-use-fuel') useFuel();
      if (id === 'inv-use-pass') usePass();
      if (id === 'inv-save') quickSave();
      if (id === 'inv-copy') copyReport();
    });
    return panel;
  }

  function addMobileButton() {
    if (document.getElementById(MOBILE_ID)) return;
    const rail = document.getElementById('action-rail') || document.getElementById('mobile-controls');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'action-btn'; button.id = MOBILE_ID; button.type = 'button'; button.textContent = 'Bag';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    state.visible = !state.visible;
    makePanel().classList.toggle('hidden', !state.visible);
    saveState();
    render();
  }

  function addItem(id, amount, reason) {
    state.items[id] = Math.max(0, Number(state.items[id] || 0) + amount);
    state.lastMessage = `${reason}: +${amount} ${label(id)}.`;
  }

  function label(id) { return id === 'medkit' ? 'medkit' : id === 'fuel' ? 'fuel cell' : 'city pass'; }

  function trackRewards() {
    diagnostics.rewardScans += 1;
    const snap = snapshot();
    const p = snap?.player;
    if (!p) return false;
    const crates = Number(snap.crates || 0);
    const ownedLots = countOwnedLots(p);
    const level = Number(p.level || 1);
    const collectedEstimate = Math.max(0, Number(state.lastCrates || 0) - crates);
    let changed = false;
    if (collectedEstimate > 0) { addItem('fuel', Math.min(2, collectedEstimate), 'Crate route bonus'); changed = true; }
    if (ownedLots > Number(state.lastOwnedLots || 0)) { addItem('cityPass', ownedLots - Number(state.lastOwnedLots || 0), 'Property owner bonus'); changed = true; }
    if (level > Number(state.lastLevel || 1)) { addItem('medkit', level - Number(state.lastLevel || 1), 'Level-up safety bonus'); changed = true; }
    if (state.lastCrates !== crates || state.lastOwnedLots !== ownedLots || state.lastLevel !== level) changed = true;
    state.lastCrates = crates; state.lastOwnedLots = ownedLots; state.lastLevel = level;
    if (changed) saveState();
    return changed;
  }

  function useMedkit() {
    const car = activeVehicle();
    if (!car) return message('Enter a vehicle first, then repair it from the backpack.');
    if (Number(state.items.medkit || 0) <= 0) return message('No medkits left. Level up to earn more.');
    car.userData.hp = Math.max(Number(car.userData.hp || 0), 85); state.items.medkit -= 1; state.totalUsed += 1;
    message('Vehicle repaired to safe HP.'); quickSave(false);
  }

  function useFuel() {
    const car = activeVehicle();
    if (!car) return message('Enter a vehicle first, then use a fuel cell.');
    if (Number(state.items.fuel || 0) <= 0) return message('No fuel cells left. Collect crates to earn route fuel.');
    car.userData.gas = Math.max(Number(car.userData.gas || 0), 80); state.items.fuel -= 1; state.totalUsed += 1;
    message('Vehicle refueled from backpack.'); quickSave(false);
  }

  function usePass() {
    const p = player();
    if (!p) return;
    if (Number(state.items.cityPass || 0) <= 0) return message('No city passes left. Buy lots to earn more.');
    p.cash = Number(p.cash || 0) + 75; p.xp = Number(p.xp || 0) + 15; state.items.cityPass -= 1; state.totalUsed += 1;
    message('City pass redeemed for $75 and 15 XP.'); quickSave(false);
  }

  function message(text) { state.lastMessage = text; saveState(); render(); }

  function quickSave(show = true) {
    try { window.NeonBlockGame?.saveState?.(); if (show) state.lastMessage = 'Inventory and game state saved.'; }
    catch (error) { state.lastMessage = `Save failed: ${error.message}`; }
    saveState(); render();
  }

  function report() {
    const snap = snapshot(); const p = snap?.player; const car = activeVehicle(p);
    return { feature: 'Backpack inventory polish', version: diagnostics.version, items: state.items, totalUsed: state.totalUsed, cash: Math.floor(p?.cash || 0), xp: Math.floor(p?.xp || 0), level: Math.floor(p?.level || 1), ownedLots: countOwnedLots(p), vehicle: car?.userData?.name || 'On foot', vehicleHp: car ? Math.floor(car.userData.hp || 0) : null, vehicleGas: car ? Math.floor(car.userData.gas || 0) : null, chunks: snap?.chunks ?? 0, cratesVisible: snap?.crates ?? 0, hidden: document.hidden, schedulerActive: diagnostics.timerActive, storageReadFailures: diagnostics.storageReadFailures, storageWriteFailures: diagnostics.storageWriteFailures, rewardScans: diagnostics.rewardScans, renders: diagnostics.renders, lastError: diagnostics.lastError, lastMessage: state.lastMessage, savedAt: new Date().toISOString() };
  }

  async function copyReport() {
    const text = JSON.stringify(report(), null, 2);
    const stored = writeStorage(REPORT_KEY, text);
    try { await navigator.clipboard?.writeText(text); state.lastMessage = 'Backpack QA report copied.'; }
    catch { state.lastMessage = stored ? 'Backpack QA report saved locally.' : 'Backpack QA report ready, but browser storage is unavailable.'; }
    saveState(); render();
  }

  function render() {
    diagnostics.renders += 1;
    const panel = makePanel(); const p = player(); const car = activeVehicle(p);
    panel.querySelector('#inv-medkit').textContent = fmt(state.items.medkit);
    panel.querySelector('#inv-fuel').textContent = fmt(state.items.fuel);
    panel.querySelector('#inv-pass').textContent = fmt(state.items.cityPass);
    panel.querySelector('#inv-summary').textContent = car ? `${car.userData.name}: ${fmt(car.userData.hp)} HP / ${fmt(car.userData.gas)} gas.` : `On foot with $${fmt(p?.cash)} and ${fmt(p?.xp)} XP.`;
    panel.querySelector('#inv-hint').textContent = state.lastMessage;
    panel.querySelector('#inv-use-medkit').disabled = !car || Number(state.items.medkit || 0) <= 0;
    panel.querySelector('#inv-use-fuel').disabled = !car || Number(state.items.fuel || 0) <= 0;
    panel.querySelector('#inv-use-pass').disabled = Number(state.items.cityPass || 0) <= 0;
    panel.classList.toggle('hidden', !state.visible);
  }

  function stopScheduler() {
    if (timer) clearTimeout(timer);
    timer = 0; diagnostics.timerActive = false;
  }

  function tick() {
    stopScheduler();
    if (document.hidden) return;
    const changed = trackRewards();
    if (state.visible || changed) render();
    timer = setTimeout(tick, POLL_MS); diagnostics.timerActive = true;
  }

  function refresh() { trackRewards(); render(); }

  function onVisibilityChange() {
    if (document.hidden) {
      stopScheduler();
      saveState();
      writeStorage(REPORT_KEY, JSON.stringify(report(), null, 2));
    } else {
      refresh();
      tick();
    }
  }

  function boot() {
    addStyles(); makePanel(); addMobileButton();
    document.addEventListener('keydown', (event) => { if (event.code === 'Digit1' && !event.repeat && !/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) togglePanel(); });
    document.addEventListener('visibilitychange', onVisibilityChange);
    addEventListener('pagehide', () => { stopScheduler(); quickSave(false); writeStorage(REPORT_KEY, JSON.stringify(report(), null, 2)); });
    refresh(); tick();
  }

  window.NeonBlockInventory = { getStatus: report, refresh, saveNow: () => { saveState(); writeStorage(REPORT_KEY, JSON.stringify(report(), null, 2)); return report(); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
