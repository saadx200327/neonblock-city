(() => {
  'use strict';

  const STORAGE_PREFIX = 'neonblock:';
  const PANEL_ID = 'neonblock-save-doctor-panel';
  const MOBILE_BUTTON_ID = 'btn-mobile-save-doctor';
  const REPORT_KEY = `${STORAGE_PREFIX}save-doctor:last-report`;
  const BACKUP_KEY = `${STORAGE_PREFIX}save-doctor:latest-backup`;
  const IMPORTANT_SLOTS = ['slot1', 'slot2'];

  const $ = (id) => document.getElementById(id);

  function getGame() {
    return window.NeonBlockGame || null;
  }

  function safeSnapshot() {
    try {
      return getGame()?.getSnapshot?.() || null;
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  }

  function readSave(slot) {
    const key = `${STORAGE_PREFIX}${slot}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { slot, key, exists: false, valid: false, bytes: 0, ageMs: null, data: null, error: 'missing' };
    try {
      const data = JSON.parse(raw);
      const ageMs = data?.at ? Date.now() - Number(data.at) : null;
      const pos = Array.isArray(data?.pos) ? data.pos : null;
      const sanePosition = !!pos && pos.length >= 3 && pos.every((n) => Number.isFinite(Number(n))) && Math.abs(Number(pos[0])) < 100000 && Math.abs(Number(pos[2])) < 100000;
      return {
        slot,
        key,
        exists: true,
        valid: sanePosition && typeof data === 'object',
        bytes: raw.length,
        ageMs,
        data,
        error: sanePosition ? null : 'invalid position'
      };
    } catch (error) {
      return { slot, key, exists: true, valid: false, bytes: raw.length, ageMs: null, data: null, error: error?.message || 'invalid JSON' };
    }
  }

  function listNeonBlockKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    return keys.sort();
  }

  function formatAge(ageMs) {
    if (ageMs == null || !Number.isFinite(ageMs)) return 'unknown';
    if (ageMs < 1000) return 'just now';
    if (ageMs < 60000) return `${Math.round(ageMs / 1000)}s ago`;
    if (ageMs < 3600000) return `${Math.round(ageMs / 60000)}m ago`;
    return `${Math.round(ageMs / 3600000)}h ago`;
  }

  function storageEstimate() {
    const keys = listNeonBlockKeys();
    const bytes = keys.reduce((total, key) => total + key.length + (localStorage.getItem(key)?.length || 0), 0);
    return { keys, bytes };
  }

  function buildReport() {
    const snapshot = safeSnapshot();
    const saves = IMPORTANT_SLOTS.map(readSave);
    const storage = storageEstimate();
    const activeSlot = snapshot?.player?.slot || 'slot1';
    const activeSave = readSave(activeSlot);
    const report = {
      at: new Date().toISOString(),
      runtimeReady: !!getGame(),
      activeSlot,
      activeSlotValid: activeSave.valid,
      slots: saves.map((save) => ({
        slot: save.slot,
        exists: save.exists,
        valid: save.valid,
        age: formatAge(save.ageMs),
        bytes: save.bytes,
        error: save.error
      })),
      storageKeys: storage.keys.length,
      storageBytes: storage.bytes,
      player: snapshot?.player ? {
        cash: Math.floor(snapshot.player.cash || 0),
        xp: Math.floor(snapshot.player.xp || 0),
        level: snapshot.player.level || 1,
        ownedLots: Object.keys(snapshot.player.ownedLots || {}).length,
        completedMissions: Object.keys(snapshot.player.completed || {}).length,
        activeVehicle: snapshot.player.activeVehicle?.userData?.name || null,
        position: snapshot.player.mesh?.position ? [
          Number(snapshot.player.mesh.position.x.toFixed(1)),
          Number(snapshot.player.mesh.position.y.toFixed(1)),
          Number(snapshot.player.mesh.position.z.toFixed(1))
        ] : null
      } : null,
      world: snapshot ? {
        chunks: snapshot.chunks,
        vehicles: snapshot.vehicles,
        crates: snapshot.crates,
        lots: snapshot.lots,
        graphics: snapshot.graphics?.quality || 'unknown'
      } : null
    };
    localStorage.setItem(REPORT_KEY, JSON.stringify(report, null, 2));
    return report;
  }

  function writeBackup() {
    const game = getGame();
    if (!game?.saveState) return { ok: false, message: 'Game save API not ready yet.' };
    const snapshot = safeSnapshot();
    const slot = snapshot?.player?.slot || 'slot1';
    const data = game.saveState(slot);
    const payload = {
      at: new Date().toISOString(),
      slot,
      data,
      allSlots: IMPORTANT_SLOTS.reduce((map, saveSlot) => {
        map[saveSlot] = localStorage.getItem(`${STORAGE_PREFIX}${saveSlot}`) || null;
        return map;
      }, {})
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(payload, null, 2));
    return { ok: true, message: `Backup written for ${slot}.` };
  }

  function restoreLatestBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return { ok: false, message: 'No Save Doctor backup exists yet.' };
    try {
      const payload = JSON.parse(raw);
      const slot = payload.slot || 'slot1';
      const rawSlot = payload.allSlots?.[slot] || JSON.stringify(payload.data || {});
      JSON.parse(rawSlot);
      localStorage.setItem(`${STORAGE_PREFIX}${slot}`, rawSlot);
      getGame()?.loadState?.(slot);
      return { ok: true, message: `Restored latest backup into ${slot}.` };
    } catch (error) {
      return { ok: false, message: `Restore failed: ${error?.message || error}` };
    }
  }

  function downloadReport() {
    const report = buildReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `neonblock-save-doctor-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  function copyReport(button) {
    const text = JSON.stringify(buildReport(), null, 2);
    navigator.clipboard?.writeText(text).then(() => {
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy save report'; }, 1200);
    }).catch(() => {
      const area = $('save-doctor-output');
      if (area) area.textContent = text;
    });
  }

  function ensurePanel() {
    if ($(PANEL_ID)) return $(PANEL_ID);
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'neonblock-floating-panel hidden';
    panel.innerHTML = `
      <div class="panel-title">Save Doctor <button type="button" id="save-doctor-close" aria-label="Close Save Doctor">×</button></div>
      <div id="save-doctor-status">Checking saves...</div>
      <div class="panel-actions">
        <button type="button" id="save-doctor-backup">Safe backup now</button>
        <button type="button" id="save-doctor-restore">Restore backup</button>
        <button type="button" id="save-doctor-download">Download report</button>
        <button type="button" id="save-doctor-copy">Copy save report</button>
      </div>
      <pre id="save-doctor-output"></pre>
    `;
    document.body.appendChild(panel);
    $('save-doctor-close').onclick = () => panel.classList.add('hidden');
    $('save-doctor-backup').onclick = () => {
      const result = writeBackup();
      updatePanel(result.message);
    };
    $('save-doctor-restore').onclick = () => {
      const result = restoreLatestBackup();
      updatePanel(result.message);
    };
    $('save-doctor-download').onclick = downloadReport;
    $('save-doctor-copy').onclick = () => copyReport($('save-doctor-copy'));
    return panel;
  }

  function ensureMobileButton() {
    if ($(MOBILE_BUTTON_ID)) return;
    const rail = $('action-rail');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'action-btn';
    button.id = MOBILE_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Save+':
    button.addEventListener('click', () => togglePanel(true));
    rail.insertBefore(button, $('btn-mobile-pause') || null);
  }

  function updatePanel(message = '') {
    const panel = ensurePanel();
    const status = $('save-doctor-status');
    const output = $('save-doctor-output');
    const report = buildReport();
    const slotSummary = report.slots.map((slot) => `${slot.slot}: ${slot.exists ? (slot.valid ? 'valid' : `bad (${slot.error})`) : 'empty'} • ${slot.age} • ${slot.bytes} chars`).join('\n');
    const lines = [
      message,
      `Runtime: ${report.runtimeReady ? 'ready' : 'waiting'}`,
      `Active slot: ${report.activeSlot} (${report.activeSlotValid ? 'valid' : 'needs attention'})`,
      slotSummary,
      `Storage: ${report.storageKeys} NeonBlock keys, about ${report.storageBytes} chars`,
      report.player ? `Player: L${report.player.level}, $${report.player.cash}, lots ${report.player.ownedLots}, vehicle ${report.player.activeVehicle || 'none'}` : 'Player: unavailable',
      report.world ? `World: ${report.world.chunks} chunks, ${report.world.vehicles} cars, ${report.world.crates} crates, ${report.world.lots} lots, graphics ${report.world.graphics}` : 'World: unavailable'
    ].filter(Boolean);
    if (status) status.textContent = lines.join(' | ');
    if (output) output.textContent = JSON.stringify(report, null, 2);
    panel.dataset.activeSlotValid = String(report.activeSlotValid);
  }

  function togglePanel(forceOpen = false) {
    const panel = ensurePanel();
    panel.classList.toggle('hidden', forceOpen ? false : !panel.classList.contains('hidden'));
    updatePanel();
  }

  function autoBackupFreshSaves() {
    const activeSlot = safeSnapshot()?.player?.slot || 'slot1';
    const save = readSave(activeSlot);
    if (save.valid && (save.ageMs == null || save.ageMs < 45000)) {
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify({
          at: new Date().toISOString(),
          slot: activeSlot,
          data: save.data,
          allSlots: IMPORTANT_SLOTS.reduce((map, saveSlot) => {
            map[saveSlot] = localStorage.getItem(`${STORAGE_PREFIX}${saveSlot}`) || null;
            return map;
          }, {})
        }, null, 2));
      } catch (_) {}
    }
  }

  function boot() {
    ensurePanel();
    ensureMobileButton();
    updatePanel('Save Doctor ready.');
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Backslash' && !event.ctrlKey && !event.metaKey && !event.altKey) togglePanel();
    });
    window.addEventListener('pagehide', autoBackupFreshSaves);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoBackupFreshSaves(); });
    setInterval(() => {
      autoBackupFreshSaves();
      if (!$(PANEL_ID)?.classList.contains('hidden')) updatePanel();
    }, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
