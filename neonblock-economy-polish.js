(() => {
  'use strict';

  const STORAGE_KEY = 'neonblock:economy:lastIncomeAt';
  const INCOME_INTERVAL_MS = 30000;
  const REFUEL_COST = 25;
  const REFUEL_AMOUNT = 35;

  const $ = (id) => document.getElementById(id);

  function popup(text) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function getGame() {
    return window.NeonBlockGame;
  }

  function getSnapshot() {
    try {
      return getGame()?.getSnapshot?.() || null;
    } catch (error) {
      console.warn('[NeonBlock Economy]', error);
      return null;
    }
  }

  function getPlayer() {
    return getSnapshot()?.player || null;
  }

  function saveQuietly() {
    getGame()?.saveState?.();
  }

  function ownedLotCount(player) {
    return Object.keys(player?.ownedLots || {}).length;
  }

  function refuelVehicle() {
    const player = getPlayer();
    const vehicle = player?.activeVehicle;
    if (!player || !vehicle) return popup('Enter a vehicle first');
    const gas = Number(vehicle.userData.gas ?? 0);
    if (gas >= 99) return popup('Tank already full');
    if (player.cash < REFUEL_COST) return popup(`Need $${REFUEL_COST} to refuel`);
    player.cash -= REFUEL_COST;
    vehicle.userData.gas = Math.min(100, gas + REFUEL_AMOUNT);
    saveQuietly();
    popup(`Refueled +${REFUEL_AMOUNT} gas`);
  }

  function quickSave() {
    const game = getGame();
    if (!game?.saveState) return popup('Save system not ready');
    game.saveState();
    popup('Quick saved');
  }

  function payPropertyIncome(force = false) {
    const player = getPlayer();
    if (!player) return;
    const lots = ownedLotCount(player);
    if (!lots) return;

    const now = Date.now();
    const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (!force && now - last < INCOME_INTERVAL_MS) return;

    const payout = Math.min(240, lots * 18);
    player.cash += payout;
    player.xp += Math.min(40, lots * 2);
    localStorage.setItem(STORAGE_KEY, String(now));
    saveQuietly();
    popup(`Property income: +$${payout}`);
  }

  function renderHint() {
    const hint = $('economy-hint');
    if (!hint) return;
    const player = getPlayer();
    if (!player) {
      hint.textContent = 'Runtime loading...';
      return;
    }

    const lots = ownedLotCount(player);
    const vehicle = player.activeVehicle;
    if (vehicle) {
      const gas = Math.floor(vehicle.userData.gas ?? 0);
      hint.textContent = gas < 35 ? `Low gas: press R or Refuel ($${REFUEL_COST})` : `Vehicle gas ${gas}% • R refuels`;
      return;
    }
    hint.textContent = lots ? `${lots} owned lot${lots === 1 ? '' : 's'} paying passive income` : 'Buy purple lots to unlock passive income';
  }

  function addButton(parent, id, text, onClick) {
    if (!parent || $(id)) return;
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', onClick);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      onClick();
    });
    parent.appendChild(button);
  }

  function installUi() {
    const hudRight = $('hud-top-right');
    if (hudRight && !$('economy-hint')) {
      const row = document.createElement('div');
      row.id = 'economy-hint';
      row.className = 'hud-row economy-hint';
      row.textContent = 'Economy loading...';
      hudRight.appendChild(row);
    }

    addButton($('action-rail'), 'btn-mobile-refuel', 'Refuel', refuelVehicle);
    addButton(document.querySelector('#pause-overlay .menu-card'), 'btn-quick-save', 'Quick Save', quickSave);
    addButton(document.querySelector('#pause-overlay .menu-card'), 'btn-collect-income', 'Collect Income', () => payPropertyIncome(true));
  }

  function installKeys() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR') {
        event.preventDefault();
        refuelVehicle();
      }
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
        event.preventDefault();
        quickSave();
      }
    });
  }

  function waitForGame() {
    if (!getGame()?.getSnapshot) {
      setTimeout(waitForGame, 150);
      return;
    }
    installUi();
    installKeys();
    setInterval(renderHint, 700);
    setInterval(() => payPropertyIncome(false), 2500);
    renderHint();
  }

  waitForGame();
})();
