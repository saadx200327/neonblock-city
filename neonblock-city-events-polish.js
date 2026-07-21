(() => {
  'use strict';

  const KEY = 'neonblock:city-events';
  const REPORT_KEY = 'neonblock:city-events-report';
  const PANEL_ID = 'neonblock-city-events-panel';
  const BUTTON_ID = 'btn-mobile-events';
  const rnd = (n) => Math.round(n * 10) / 10;

  const defaultState = () => ({
    eventId: 'street-cleanup',
    startedAt: Date.now(),
    lastClaimAt: 0,
    claimCounts: {},
    stats: { patrolMeters: 0, driveMeters: 0, cratesSeen: 0, lotsSeen: 0 },
    hidden: localStorage.getItem('neonblock:city-events-hidden') === '1'
  });

  function readState() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...defaultState(), ...stored, claimCounts: stored.claimCounts || {} };
    } catch (_) {
      return defaultState();
    }
  }

  let state = readState();
  let lastPos = null;
  let report = null;

  const events = [
    {
      id: 'street-cleanup',
      title: 'Street Cleanup',
      goal: 'Travel 180m on foot and keep wanted level at 0.',
      reward: { cash: 90, xp: 35 },
      progress(snap) {
        return Math.min(1, (state.stats.patrolMeters || 0) / 180) * (wanted(snap) > 0 ? 0.55 : 1);
      },
      hint(snap) {
        return wanted(snap) > 0 ? 'Clear wanted first, then patrol blocks on foot.' : 'Walk the sidewalks/roads until patrol progress reaches 100%.';
      }
    },
    {
      id: 'traffic-test',
      title: 'Traffic Test',
      goal: 'Drive 260m while keeping your active vehicle above 20 gas.',
      reward: { cash: 130, xp: 50 },
      progress(snap) {
        const gasGate = gas(snap) > 20 ? 1 : 0.6;
        return Math.min(1, (state.stats.driveMeters || 0) / 260) * gasGate;
      },
      hint(snap) {
        if (!activeVehicle(snap)) return 'Enter any vehicle with Interact, then drive cleanly.';
        if (gas(snap) <= 20) return 'Refuel before finishing this driving event.';
        return 'Keep driving roads until the traffic test fills.';
      }
    },
    {
      id: 'market-scan',
      title: 'Market Scan',
      goal: 'Stream the city until 2 lots and 1 crate are visible.',
      reward: { cash: 110, xp: 45 },
      progress(snap) {
        const lots = Math.min(2, snap?.lots || 0) / 2;
        const crates = Math.min(1, snap?.crates || 0);
        return (lots + crates) / 2;
      },
      hint() {
        return 'Move a few blocks so world streaming loads new lots/crates.';
      }
    }
  ];

  function game() { return window.NeonBlockGame; }
  function snap() { try { return game()?.getSnapshot?.() || null; } catch (_) { return null; } }
  function player(s) { return s?.player || {}; }
  function pos(s) { return player(s).mesh?.position || null; }
  function activeVehicle(s) { return !!player(s).activeVehicle; }
  function wanted(s) { return Number(player(s).wanted || 0); }
  function gas(s) { return Number(player(s).activeVehicle?.userData?.gas ?? 100); }
  function cash(s) { return Number(player(s).cash || 0); }
  function xp(s) { return Number(player(s).xp || 0); }
  function currentEvent() { return events.find((e) => e.id === state.eventId) || events[0]; }
  function saveState() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function safeSave() { try { game()?.saveState?.(); } catch (_) {} }

  function addStyles() {
    if (document.getElementById('neonblock-city-events-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-city-events-style';
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:14px;bottom:114px;z-index:45;width:min(330px,calc(100vw - 28px));padding:12px;border:1px solid #17f3ff66;border-radius:16px;background:rgba(5,8,20,.9);color:#e9fbff;font:13px system-ui;box-shadow:0 0 24px #17f3ff22;backdrop-filter:blur(10px)}
      #${PANEL_ID}.hidden{display:none} #${PANEL_ID} h3{margin:0 0 8px;color:#17f3ff} #${PANEL_ID} p{margin:6px 0;color:#cde8ef} #${PANEL_ID} .bar{height:10px;border-radius:999px;background:#ffffff18;overflow:hidden;margin:8px 0} #${PANEL_ID} .fill{height:100%;background:linear-gradient(90deg,#17f3ff,#5ef38c);width:0%} #${PANEL_ID} .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px} #${PANEL_ID} button,#${BUTTON_ID}{border:1px solid #17f3ffaa;border-radius:999px;background:#0c1020;color:#e9fbff;padding:8px 10px;font-weight:700} #${PANEL_ID} .muted{color:#94a9b8;font-size:12px}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    addStyles();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    panel.classList.toggle('hidden', !!state.hidden);
    return panel;
  }

  function ensureMobileButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const rail = document.getElementById('action-rail');
    if (!rail) return;
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'action-btn';
    btn.textContent = 'Events';
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); togglePanel(); });
    rail.insertBefore(btn, rail.firstChild);
  }

  function resetEventStats() {
    state.startedAt = Date.now();
    state.stats = { patrolMeters: 0, driveMeters: 0, cratesSeen: 0, lotsSeen: 0 };
  }

  function rotateEvent() {
    const idx = events.findIndex((e) => e.id === state.eventId);
    state.eventId = events[(idx + 1) % events.length].id;
    resetEventStats();
    saveState();
    render();
  }

  function claim() {
    const s = snap();
    const ev = currentEvent();
    if (ev.progress(s) < 1) return;
    const p = player(s);
    p.cash = cash(s) + ev.reward.cash;
    p.xp = xp(s) + ev.reward.xp;
    state.claimCounts[ev.id] = Number(state.claimCounts[ev.id] || 0) + 1;
    state.lastClaimAt = Date.now();
    report = buildReport(s, 'claimed');
    localStorage.setItem(REPORT_KEY, JSON.stringify(report));
    resetEventStats();
    saveState();
    safeSave();
    rotateEvent();
  }

  function buildReport(s = snap(), status = 'scan') {
    const ev = currentEvent();
    return {
      status,
      at: new Date().toISOString(),
      event: ev.title,
      progress: rnd(ev.progress(s) * 100) + '%',
      claimsForEvent: Number(state.claimCounts[ev.id] || 0),
      totalClaims: Object.values(state.claimCounts).reduce((sum, value) => sum + Number(value || 0), 0),
      cash: Math.floor(cash(s)),
      xp: Math.floor(xp(s)),
      chunks: s?.chunks || 0,
      vehicles: s?.vehicles || 0,
      crates: s?.crates || 0,
      lots: s?.lots || 0,
      activeVehicle: activeVehicle(s),
      gas: Math.floor(gas(s)),
      wanted: wanted(s),
      stats: { ...state.stats }
    };
  }

  function copyReport() {
    report = buildReport(snap(), 'copied');
    localStorage.setItem(REPORT_KEY, JSON.stringify(report));
    navigator.clipboard?.writeText(JSON.stringify(report, null, 2)).catch(() => {});
  }

  function togglePanel() {
    state.hidden = !state.hidden;
    localStorage.setItem('neonblock:city-events-hidden', state.hidden ? '1' : '0');
    saveState();
    render();
  }

  function tickStats() {
    const s = snap();
    const p = pos(s);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      if (lastPos) {
        const dx = p.x - lastPos.x;
        const dz = p.z - lastPos.z;
        const dist = Math.min(18, Math.hypot(dx, dz));
        if (activeVehicle(s)) state.stats.driveMeters += dist;
        else state.stats.patrolMeters += dist;
      }
      lastPos = { x: p.x, z: p.z };
    }
    state.stats.cratesSeen = Math.max(state.stats.cratesSeen || 0, s?.crates || 0);
    state.stats.lotsSeen = Math.max(state.stats.lotsSeen || 0, s?.lots || 0);
    saveState();
  }

  function render() {
    ensureMobileButton();
    const panel = ensurePanel();
    if (state.hidden) return;
    const s = snap();
    const ev = currentEvent();
    const progress = Math.min(100, Math.max(0, ev.progress(s) * 100));
    report = buildReport(s, 'visible');
    panel.innerHTML = `
      <h3>City Events</h3>
      <p><strong>${ev.title}</strong></p>
      <p>${ev.goal}</p>
      <div class="bar"><div class="fill" style="width:${progress}%"></div></div>
      <p>${rnd(progress)}% • Reward $${ev.reward.cash} / ${ev.reward.xp} XP • Claimed ${Number(state.claimCounts[ev.id] || 0)}x</p>
      <p class="muted">${ev.hint(s)}</p>
      <p class="muted">Patrol ${rnd(state.stats.patrolMeters)}m • Drive ${rnd(state.stats.driveMeters)}m • Lots ${s?.lots || 0} • Crates ${s?.crates || 0}</p>
      <div class="row">
        <button data-action="claim" ${progress < 100 ? 'disabled' : ''}>Claim</button>
        <button data-action="next">Next Event</button>
        <button data-action="save">Save</button>
        <button data-action="copy">Copy QA</button>
        <button data-action="hide">Hide</button>
      </div>
    `;
  }

  document.addEventListener('click', (e) => {
    const action = e.target?.dataset?.action;
    if (!action || !e.target.closest?.(`#${PANEL_ID}`)) return;
    if (action === 'claim') claim();
    if (action === 'next') rotateEvent();
    if (action === 'save') { safeSave(); report = buildReport(snap(), 'saved'); localStorage.setItem(REPORT_KEY, JSON.stringify(report)); }
    if (action === 'copy') copyReport();
    if (action === 'hide') togglePanel();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && e.shiftKey) {
      e.preventDefault();
      togglePanel();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      localStorage.setItem(REPORT_KEY, JSON.stringify(buildReport(snap(), 'hidden')));
      safeSave();
    }
  });

  setInterval(() => { tickStats(); render(); }, 1000);
  window.addEventListener('load', () => { ensureMobileButton(); render(); });
})();