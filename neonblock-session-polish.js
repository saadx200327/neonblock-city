(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  ready(() => {
    const game = window.NeonBlockGame;
    if (!game || typeof game.getSnapshot !== 'function') return;

    const state = {
      startedAt: Date.now(),
      lastSnapshot: null,
      lowFpsFrames: 0,
      lastHintAt: 0,
      distanceText: 'Mission: --',
      achievements: new Set(JSON.parse(localStorage.getItem('neonblock:session:achievements') || '[]'))
    };

    const panel = document.createElement('section');
    panel.id = 'session-polish-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="session-polish-title">Session Assist</div>
      <div id="session-polish-distance">Mission: --</div>
      <div id="session-polish-checks">Move • Interact • Save • Drive</div>
      <div class="session-polish-actions">
        <button id="btn-session-snapshot" type="button">Snapshot</button>
        <button id="btn-session-battery" type="button">Battery Saver</button>
      </div>
    `;
    document.body.appendChild(panel);

    const style = document.createElement('style');
    style.textContent = `
      #session-polish-panel {
        position: fixed;
        left: max(12px, env(safe-area-inset-left));
        bottom: calc(128px + env(safe-area-inset-bottom));
        z-index: 18;
        width: min(245px, calc(100vw - 24px));
        padding: 10px 12px;
        border: 1px solid rgba(23, 243, 255, 0.35);
        border-radius: 14px;
        background: rgba(5, 8, 20, 0.72);
        color: #e8fbff;
        box-shadow: 0 0 24px rgba(23, 243, 255, 0.15);
        backdrop-filter: blur(10px);
        font: 600 12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
        pointer-events: auto;
      }
      #session-polish-panel.hidden-assist { display: none; }
      .session-polish-title { color: #17f3ff; font-size: 13px; margin-bottom: 4px; letter-spacing: 0.04em; text-transform: uppercase; }
      #session-polish-checks { color: #b9c7d9; margin-top: 4px; }
      .session-polish-actions { display: flex; gap: 6px; margin-top: 8px; }
      .session-polish-actions button {
        flex: 1;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 10px;
        background: rgba(255,255,255,0.08);
        color: inherit;
        padding: 7px 6px;
        font-weight: 700;
      }
      @media (max-width: 720px) {
        #session-polish-panel { bottom: calc(164px + env(safe-area-inset-bottom)); font-size: 11px; }
      }
      @media (max-width: 480px) and (orientation: portrait) {
        #session-polish-panel { width: min(210px, calc(100vw - 20px)); padding: 8px 10px; }
      }
    `;
    document.head.appendChild(style);

    const distanceEl = $('session-polish-distance');
    const checksEl = $('session-polish-checks');
    const snapshotBtn = $('btn-session-snapshot');
    const batteryBtn = $('btn-session-battery');
    const popup = (text) => {
      const el = $('reward-popup');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      clearTimeout(popup.timeout);
      popup.timeout = setTimeout(() => el.classList.add('hidden'), 1800);
    };

    function getPlayerPosition(snapshot) {
      const pos = snapshot?.player?.mesh?.position;
      if (!pos) return null;
      return { x: Number(pos.x || 0), y: Number(pos.y || 0), z: Number(pos.z || 0) };
    }

    function mark(name) {
      if (state.achievements.has(name)) return;
      state.achievements.add(name);
      localStorage.setItem('neonblock:session:achievements', JSON.stringify(Array.from(state.achievements)));
      popup(`Session check: ${name}`);
    }

    function updateChecklist(snapshot) {
      const player = snapshot?.player;
      if (!player) return;
      const pos = getPlayerPosition(snapshot);
      if (pos && (Math.abs(pos.x) > 6 || Math.abs(pos.z) > 6)) mark('moved');
      if ((player.cash || 0) !== 350 || (player.xp || 0) > 0) mark('interacted');
      if (player.activeVehicle) mark('drove');
      if (Object.keys(player.ownedLots || {}).length) mark('owned');
      if (localStorage.getItem(`neonblock:${player.slot || 'slot1'}`)) mark('saved');

      const labels = [
        ['moved', 'Move'],
        ['interacted', 'Interact'],
        ['drove', 'Drive'],
        ['owned', 'Own'],
        ['saved', 'Save']
      ];
      checksEl.textContent = labels.map(([key, label]) => `${state.achievements.has(key) ? '✓' : '○'} ${label}`).join('  ');
    }

    function updateMissionDistance(snapshot) {
      const hudMission = $('hud-mission')?.textContent || 'Mission';
      const arrow = $('waypoint-arrow')?.textContent || '';
      const posText = $('debug-pos')?.textContent || '';
      const posParts = posText.split(',').map((v) => Number(v));
      if (arrow === '★') {
        state.distanceText = `${hudMission}: collect crates`;
      } else if (posParts.length >= 3 && Number.isFinite(posParts[0]) && Number.isFinite(posParts[2])) {
        const player = getPlayerPosition(snapshot);
        const oldPlayer = getPlayerPosition(state.lastSnapshot);
        if (player && oldPlayer) {
          const dx = player.x - oldPlayer.x;
          const dz = player.z - oldPlayer.z;
          const speed = Math.hypot(dx, dz);
          state.distanceText = `${hudMission}: ${speed > 0.02 ? 'tracking waypoint' : 'start moving'}`;
        } else {
          state.distanceText = `${hudMission}: waypoint active`;
        }
      } else {
        state.distanceText = `${hudMission}: ready`;
      }
      distanceEl.textContent = state.distanceText;
    }

    function adaptivePerformance(snapshot) {
      const fps = Number($('debug-fps')?.textContent || 60);
      const graphics = snapshot?.graphics?.quality || localStorage.getItem('neonblock:graphics') || 'auto';
      if (fps && fps < 24 && graphics !== 'low') state.lowFpsFrames += 1;
      else state.lowFpsFrames = Math.max(0, state.lowFpsFrames - 1);

      if (state.lowFpsFrames >= 8 && Date.now() - state.lastHintAt > 25000) {
        state.lastHintAt = Date.now();
        popup('Low FPS: tap Battery Saver for smoother mobile play');
      }
    }

    snapshotBtn?.addEventListener('click', () => {
      const snapshot = game.getSnapshot();
      const player = snapshot?.player || {};
      const summary = {
        at: new Date().toISOString(),
        cash: Math.floor(player.cash || 0),
        xp: Math.floor(player.xp || 0),
        level: player.level || 1,
        ownedLots: Object.keys(player.ownedLots || {}).length,
        chunks: snapshot?.chunks || 0,
        vehicles: snapshot?.vehicles || 0,
        crates: snapshot?.crates || 0,
        graphics: snapshot?.graphics || {},
        sessionSeconds: Math.round((Date.now() - state.startedAt) / 1000)
      };
      localStorage.setItem('neonblock:session:lastSnapshot', JSON.stringify(summary));
      const exportBox = $('export-json');
      if (exportBox) exportBox.value = JSON.stringify(summary, null, 2);
      popup('Session snapshot copied to Save panel');
    });

    batteryBtn?.addEventListener('click', () => {
      game.applyGraphicsQuality?.('low', true);
      localStorage.setItem('neonblock:batterySaver', '1');
      popup('Battery Saver: Low graphics enabled');
    });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyH') panel.classList.toggle('hidden-assist');
      if (event.code === 'KeyB') batteryBtn?.click();
    });

    if (localStorage.getItem('neonblock:batterySaver') === '1' && (localStorage.getItem('neonblock:graphics') || 'auto') === 'auto') {
      game.applyGraphicsQuality?.('low', true);
    }

    setInterval(() => {
      const snapshot = game.getSnapshot();
      updateChecklist(snapshot);
      updateMissionDistance(snapshot);
      adaptivePerformance(snapshot);
      state.lastSnapshot = snapshot;
    }, 1000);
  });
})();
