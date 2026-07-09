(() => {
  'use strict';

  const KEY = 'neonblock:banking:v1';
  const REPORT_KEY = 'neonblock:banking:lastReport';
  const PANEL_ID = 'neonblock-banking-panel';
  const MOBILE_ID = 'btn-mobile-bank';
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const now = () => Date.now();

  const defaultState = () => ({
    visible: false,
    balance: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalInterest: 0,
    lastInterestAt: 0,
    lastCashGuardAt: 0,
    lastMessage: 'Bank ready: deposit spare cash, withdraw emergency funds, and collect safe interest.',
    updatedAt: now()
  });

  function loadState() {
    try { return { ...defaultState(), ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; }
    catch { return defaultState(); }
  }

  let state = loadState();

  function saveState() {
    state.balance = Math.max(0, Number(state.balance || 0));
    state.updatedAt = now();
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function snapshot() {
    return window.NeonBlockGame?.getSnapshot?.() || null;
  }

  function player() {
    return snapshot()?.player || null;
  }

  function ownedLots(p = player()) {
    return Object.keys(p?.ownedLots || {}).length;
  }

  function addStyles() {
    if (document.getElementById('neonblock-banking-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-banking-style';
    style.textContent = `
      #${PANEL_ID}{position:fixed;left:16px;bottom:84px;width:min(356px,calc(100vw - 24px));z-index:49;background:rgba(3,10,18,.94);border:1px solid rgba(94,243,140,.45);border-radius:16px;color:#eafff0;padding:14px;font:13px/1.35 system-ui,Segoe UI,sans-serif;box-shadow:0 0 24px rgba(94,243,140,.14);backdrop-filter:blur(10px)}
      #${PANEL_ID}.hidden{display:none!important} #${PANEL_ID} h3{margin:0 0 8px;color:#5ef38c;font-size:16px} #${PANEL_ID} p{margin:6px 0;color:#cbffd8} #${PANEL_ID} .bank-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0} #${PANEL_ID} .bank-card{background:rgba(255,255,255,.06);border:1px solid rgba(94,243,140,.18);border-radius:12px;padding:8px;text-align:center} #${PANEL_ID} .bank-card b{display:block;color:#fff;font-size:12px} #${PANEL_ID} .bank-card span{font-size:17px;color:#5ef38c;font-weight:900} #${PANEL_ID} .bank-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} #${PANEL_ID} button{border:1px solid rgba(94,243,140,.52);background:rgba(94,243,140,.13);color:#eafff0;border-radius:10px;padding:8px 10px;font-weight:800} #${PANEL_ID} button:disabled{opacity:.45} #${PANEL_ID} button:active{transform:translateY(1px)} #${MOBILE_ID}{border-color:rgba(94,243,140,.75)!important}
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
      <h3>Neon Bank</h3>
      <p id="bank-summary">Loading banking status...</p>
      <div class="bank-grid">
        <div class="bank-card"><b>Wallet</b><span id="bank-wallet">0</span></div>
        <div class="bank-card"><b>Saved</b><span id="bank-balance">0</span></div>
        <div class="bank-card"><b>Lots</b><span id="bank-lots">0</span></div>
      </div>
      <p id="bank-hint"></p>
      <div class="bank-row">
        <button type="button" id="bank-deposit">Deposit $100</button>
        <button type="button" id="bank-withdraw">Withdraw $100</button>
        <button type="button" id="bank-interest">Collect Interest</button>
        <button type="button" id="bank-safe-save">Save</button>
        <button type="button" id="bank-copy">Copy QA</button>
      </div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', (event) => {
      const id = event.target.closest('button')?.id;
      if (id === 'bank-deposit') deposit(100);
      if (id === 'bank-withdraw') withdraw(100);
      if (id === 'bank-interest') collectInterest();
      if (id === 'bank-safe-save') quickSave();
      if (id === 'bank-copy') copyReport();
    });
    return panel;
  }

  function addMobileButton() {
    if (document.getElementById(MOBILE_ID)) return;
    const rail = document.getElementById('action-rail') || document.getElementById('mobile-controls');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = MOBILE_ID;
    button.type = 'button';
    button.textContent = 'Bank';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    state.visible = !state.visible;
    makePanel().classList.toggle('hidden', !state.visible);
    saveState();
    render();
  }

  function message(text) {
    state.lastMessage = text;
    saveState();
    render();
  }

  function deposit(amount) {
    const p = player();
    if (!p) return;
    const cash = Math.floor(Number(p.cash || 0));
    if (cash < amount) return message(`Need $${fmt(amount)} cash to deposit.`);
    p.cash = cash - amount;
    state.balance += amount;
    state.totalDeposited += amount;
    message(`Deposited $${fmt(amount)} into Neon Bank.`);
    quickSave(false);
  }

  function withdraw(amount) {
    const p = player();
    if (!p) return;
    if (Number(state.balance || 0) < amount) return message(`Need $${fmt(amount)} saved before withdrawal.`);
    p.cash = Number(p.cash || 0) + amount;
    state.balance -= amount;
    state.totalWithdrawn += amount;
    message(`Withdrew $${fmt(amount)} emergency cash.`);
    quickSave(false);
  }

  function interestAvailable() {
    const elapsed = now() - Number(state.lastInterestAt || 0);
    const lotBonus = Math.min(5, ownedLots());
    const base = Math.floor(Number(state.balance || 0) * 0.03);
    const payout = Math.min(250, Math.max(0, base + lotBonus * 12));
    return { elapsed, ready: elapsed > 300000, payout };
  }

  function collectInterest() {
    const p = player();
    if (!p) return;
    const interest = interestAvailable();
    if (!interest.ready) return message('Interest is cooling down. Drive, do missions, or buy lots while it builds.');
    if (interest.payout <= 0) return message('Deposit cash first to build interest. Owned lots boost payout.');
    p.cash = Number(p.cash || 0) + interest.payout;
    p.xp = Number(p.xp || 0) + Math.max(5, Math.floor(interest.payout / 10));
    state.totalInterest += interest.payout;
    state.lastInterestAt = now();
    message(`Collected $${fmt(interest.payout)} bank interest plus XP.`);
    quickSave(false);
  }

  function cashGuard() {
    const p = player();
    if (!p) return;
    const cash = Number(p.cash || 0);
    if (Number.isFinite(cash) && cash >= 0) return;
    if (now() - Number(state.lastCashGuardAt || 0) < 15000) return;
    p.cash = 0;
    state.lastCashGuardAt = now();
    message('Cash guard fixed invalid wallet value and saved safely.');
    quickSave(false);
  }

  function quickSave(show = true) {
    try {
      window.NeonBlockGame?.saveState?.();
      if (show) state.lastMessage = 'Banking and game state saved.';
    } catch (error) {
      state.lastMessage = `Save failed: ${error.message}`;
    }
    saveState();
    render();
  }

  function report() {
    const snap = snapshot();
    const p = snap?.player;
    const interest = interestAvailable();
    return {
      feature: 'Neon Bank polish',
      walletCash: Math.floor(p?.cash || 0),
      bankBalance: Math.floor(state.balance || 0),
      totalDeposited: Math.floor(state.totalDeposited || 0),
      totalWithdrawn: Math.floor(state.totalWithdrawn || 0),
      totalInterest: Math.floor(state.totalInterest || 0),
      ownedLots: ownedLots(p),
      level: Math.floor(p?.level || 1),
      xp: Math.floor(p?.xp || 0),
      chunks: snap?.chunks ?? 0,
      interestReady: interest.ready,
      interestPayout: interest.payout,
      lastMessage: state.lastMessage,
      savedAt: new Date().toISOString()
    };
  }

  async function copyReport() {
    const text = JSON.stringify(report(), null, 2);
    localStorage.setItem(REPORT_KEY, text);
    try { await navigator.clipboard?.writeText(text); state.lastMessage = 'Bank QA report copied.'; }
    catch { state.lastMessage = 'Bank QA report saved locally.'; }
    saveState();
    render();
  }

  function render() {
    const panel = makePanel();
    const p = player();
    const interest = interestAvailable();
    const cash = Math.floor(p?.cash || 0);
    panel.querySelector('#bank-wallet').textContent = `$${fmt(cash)}`;
    panel.querySelector('#bank-balance').textContent = `$${fmt(state.balance)}`;
    panel.querySelector('#bank-lots').textContent = fmt(ownedLots(p));
    panel.querySelector('#bank-summary').textContent = `Wallet $${fmt(cash)} • saved $${fmt(state.balance)} • interest ${interest.ready ? 'ready' : 'cooling down'}.`;
    panel.querySelector('#bank-hint').textContent = state.lastMessage;
    panel.querySelector('#bank-deposit').disabled = cash < 100;
    panel.querySelector('#bank-withdraw').disabled = Number(state.balance || 0) < 100;
    panel.querySelector('#bank-interest').disabled = !interest.ready || interest.payout <= 0;
    panel.classList.toggle('hidden', !state.visible);
  }

  function loop() {
    cashGuard();
    render();
    requestAnimationFrame(loop);
  }

  function boot() {
    addStyles();
    makePanel();
    addMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Digit0' && !event.repeat && !/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) togglePanel();
    });
    addEventListener('pagehide', () => { quickSave(false); localStorage.setItem(REPORT_KEY, JSON.stringify(report(), null, 2)); });
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
