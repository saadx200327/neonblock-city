(() => {
  'use strict';

  const KEY = 'neonblock:sidejobs:v1';
  const REPORT_KEY = 'neonblock:sidejobs:lastReport';
  const PANEL_ID = 'neonblock-sidejobs-panel';
  const MOBILE_ID = 'btn-mobile-sidejobs';
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

  const jobs = [
    { id: 'courier', title: 'Block Courier', mode: 'on foot', goal: 420, cash: 90, xp: 32, hint: 'Run or walk around the city to finish a local package loop.' },
    { id: 'rideshare', title: 'Neon Rideshare', mode: 'vehicle', goal: 850, cash: 150, xp: 48, hint: 'Drive cleanly in any vehicle without running out of gas.' },
    { id: 'scout', title: 'District Scout', mode: 'explore', goal: 6, cash: 120, xp: 40, hint: 'Stream new city chunks by moving across districts.' }
  ];

  const defaultState = () => ({
    visible: false,
    activeId: 'courier',
    progress: {},
    claimed: {},
    lastPos: null,
    lastChunks: 0,
    totalCash: 0,
    totalXp: 0,
    lastMessage: 'Pick a side job and play normally.',
    updatedAt: Date.now()
  });

  function loadState() {
    try { return { ...defaultState(), ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; }
    catch { return defaultState(); }
  }

  let state = loadState();
  let lastTick = 0;

  function saveState() {
    state.updatedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function snapshot() {
    return window.NeonBlockGame?.getSnapshot?.() || null;
  }

  function player() {
    return snapshot()?.player || null;
  }

  function activeJob() {
    return jobs.find((job) => job.id === state.activeId) || jobs[0];
  }

  function posArray(p) {
    const pos = p?.mesh?.position;
    return pos ? [pos.x, pos.y, pos.z] : null;
  }

  function distance2d(a, b) {
    if (!a || !b) return 0;
    return Math.hypot((a[0] || 0) - (b[0] || 0), (a[2] || 0) - (b[2] || 0));
  }

  function addStyles() {
    if (document.getElementById('neonblock-sidejobs-style')) return;
    const style = document.createElement('style');
    style.id = 'neonblock-sidejobs-style';
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:16px;bottom:84px;width:min(340px,calc(100vw - 24px));z-index:47;background:rgba(5,8,20,.92);border:1px solid rgba(23,243,255,.35);border-radius:16px;color:#eaffff;padding:14px;font:13px/1.35 system-ui,Segoe UI,sans-serif;box-shadow:0 0 24px rgba(23,243,255,.16);backdrop-filter:blur(10px)}
      #${PANEL_ID}.hidden{display:none!important} #${PANEL_ID} h3{margin:0 0 8px;color:#17f3ff;font-size:16px} #${PANEL_ID} p{margin:6px 0;color:#ccefff} #${PANEL_ID} .sj-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} #${PANEL_ID} button{border:1px solid rgba(23,243,255,.45);background:rgba(23,243,255,.12);color:#eaffff;border-radius:10px;padding:8px 10px;font-weight:700} #${PANEL_ID} button:active{transform:translateY(1px)} #${PANEL_ID} .sj-meter{height:9px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden;margin:8px 0} #${PANEL_ID} .sj-fill{height:100%;background:linear-gradient(90deg,#17f3ff,#5ef38c);width:0%} #${PANEL_ID} .sj-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px} #${PANEL_ID} .sj-card{background:rgba(255,255,255,.06);border-radius:10px;padding:7px} #${MOBILE_ID}{border-color:rgba(94,243,140,.65)!important}
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
      <h3>Side Jobs</h3>
      <p id="sj-summary">Loading side jobs...</p>
      <div class="sj-meter"><div class="sj-fill" id="sj-fill"></div></div>
      <div class="sj-grid">
        <div class="sj-card"><b>Reward</b><br><span id="sj-reward">$0 / 0 XP</span></div>
        <div class="sj-card"><b>Status</b><br><span id="sj-status">ready</span></div>
      </div>
      <p id="sj-hint"></p>
      <div class="sj-row">
        <button type="button" data-job="courier">Courier</button>
        <button type="button" data-job="rideshare">Rideshare</button>
        <button type="button" data-job="scout">Scout</button>
        <button type="button" id="sj-claim">Claim</button>
        <button type="button" id="sj-save">Save</button>
        <button type="button" id="sj-copy">Copy QA</button>
      </div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.job) switchJob(button.dataset.job);
      if (button.id === 'sj-claim') claimJob();
      if (button.id === 'sj-save') quickSave();
      if (button.id === 'sj-copy') copyReport();
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
    button.textContent = 'Jobs';
    button.addEventListener('click', togglePanel);
    rail.insertBefore(button, rail.firstChild);
  }

  function togglePanel() {
    state.visible = !state.visible;
    makePanel().classList.toggle('hidden', !state.visible);
    saveState();
    render();
  }

  function switchJob(id) {
    state.activeId = id;
    state.lastMessage = `Tracking ${activeJob().title}.`;
    saveState();
    render();
  }

  function progressFor(job) {
    return Number(state.progress[job.id] || 0);
  }

  function progressLabel(job) {
    const progress = progressFor(job);
    if (job.id === 'scout') return `${fmt(progress)} / ${job.goal} chunks`;
    return `${fmt(progress)} / ${job.goal}m`;
  }

  function track(now) {
    if (now - lastTick < 500) return;
    lastTick = now;
    const snap = snapshot();
    const p = snap?.player;
    if (!p) return;
    const pos = posArray(p);
    const moved = distance2d(pos, state.lastPos);
    const job = activeJob();
    state.progress[job.id] = Number(state.progress[job.id] || 0);
    if (moved > 0.15 && moved < 40) {
      if (job.id === 'courier' && !p.activeVehicle) state.progress[job.id] += moved;
      if (job.id === 'rideshare' && p.activeVehicle) state.progress[job.id] += moved;
    }
    if (job.id === 'scout') {
      const chunks = Number(snap.chunks || 0);
      if (chunks > Number(state.lastChunks || 0)) state.progress.scout += chunks - Number(state.lastChunks || 0);
      state.lastChunks = Math.max(Number(state.lastChunks || 0), chunks);
    }
    if (p.activeVehicle?.userData?.gas <= 4 && job.id === 'rideshare') state.lastMessage = 'Rideshare paused: refuel soon so the job stays playable.';
    state.lastPos = pos;
    saveState();
  }

  function claimJob() {
    const p = player();
    if (!p) return;
    const job = activeJob();
    if (progressFor(job) < job.goal) {
      state.lastMessage = `Not ready: ${progressLabel(job)}.`;
      saveState();
      render();
      return;
    }
    p.cash = Number(p.cash || 0) + job.cash;
    p.xp = Number(p.xp || 0) + job.xp;
    state.totalCash += job.cash;
    state.totalXp += job.xp;
    state.progress[job.id] = 0;
    state.claimed[job.id] = Number(state.claimed[job.id] || 0) + 1;
    state.lastMessage = `${job.title} paid $${job.cash} and ${job.xp} XP.`;
    quickSave(false);
    saveState();
    render();
  }

  function quickSave(show = true) {
    try {
      window.NeonBlockGame?.saveState?.();
      state.lastMessage = show ? 'Side job progress and game state saved.' : state.lastMessage;
      saveState();
    } catch (error) {
      state.lastMessage = `Save failed: ${error.message}`;
    }
    render();
  }

  function report() {
    const snap = snapshot();
    const job = activeJob();
    return {
      feature: 'Side Jobs polish',
      activeJob: job.title,
      progress: progressLabel(job),
      ready: progressFor(job) >= job.goal,
      claimed: state.claimed,
      totalCashAwarded: state.totalCash,
      totalXpAwarded: state.totalXp,
      chunks: snap?.chunks ?? 0,
      vehicle: snap?.player?.activeVehicle?.userData?.name || 'On foot',
      cash: Math.floor(snap?.player?.cash || 0),
      lastMessage: state.lastMessage,
      savedAt: new Date().toISOString()
    };
  }

  async function copyReport() {
    const data = report();
    const text = JSON.stringify(data, null, 2);
    localStorage.setItem(REPORT_KEY, text);
    try { await navigator.clipboard?.writeText(text); state.lastMessage = 'Side job QA report copied.'; }
    catch { state.lastMessage = 'Side job QA report saved locally.'; }
    saveState();
    render();
  }

  function render() {
    const panel = makePanel();
    const job = activeJob();
    const progress = progressFor(job);
    const pct = Math.min(100, Math.round((progress / job.goal) * 100));
    panel.querySelector('#sj-summary').textContent = `${job.title}: ${progressLabel(job)} complete.`;
    panel.querySelector('#sj-fill').style.width = `${pct}%`;
    panel.querySelector('#sj-reward').textContent = `$${job.cash} / ${job.xp} XP`;
    panel.querySelector('#sj-status').textContent = progress >= job.goal ? 'ready to claim' : job.mode;
    panel.querySelector('#sj-hint').textContent = `${job.hint} ${state.lastMessage}`;
    panel.classList.toggle('hidden', !state.visible);
  }

  function loop(now) {
    track(now || performance.now());
    render();
    requestAnimationFrame(loop);
  }

  function boot() {
    addStyles();
    makePanel();
    addMobileButton();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Digit2' && !event.repeat && !/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) togglePanel();
    });
    addEventListener('pagehide', () => { quickSave(false); localStorage.setItem(REPORT_KEY, JSON.stringify(report(), null, 2)); });
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
