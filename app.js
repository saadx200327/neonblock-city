(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const miniCanvas = document.getElementById('minimap-canvas');
  const mini = miniCanvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const HUD = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'),
    online: $('hud-online'), vehicle: $('hud-vehicle'), vehicleHp: $('hud-vehicle-hp'), vehicleGas: $('hud-vehicle-gas'),
    mission: $('hud-mission'), fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'),
    npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), saveSlot: $('debug-save-slot'),
    debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  const state = {
    last: performance.now(), fps: 0, frame: 0, quality: 'auto', lowPower: matchMedia('(max-width: 760px)').matches,
    paused: false, debug: false, saveSlot: 'slot1', chunkSize: 900, drawDistance: matchMedia('(max-width: 760px)').matches ? 1 : 2,
    camera: { x: 0, y: 0, zoom: 1 }, chunks: new Map(), roads: [], buildings: [], crates: [], npcs: [], lots: [], vehicles: [], particles: [],
    keys: new Set(), pointerLook: { active: false, id: null, x: 0, y: 0 }, joy: { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 },
    player: { x: 40, y: 60, vx: 0, vy: 0, size: 24, speed: 230, sprint: false, hp: 100, cash: 120, xp: 0, level: 1, wanted: 0, facing: 0, inVehicle: null },
    ownedLots: {}, openedCrates: {}, completedMissions: {}, currentMission: null, messageTimer: 0, message: 'Collect 3 neon crates, buy a lot, or enter a car.',
    missions: [
      { id: 'starter-crates', title: 'Collect 3 neon crates', goal: 3, rewardCash: 175, rewardXp: 45, type: 'crate' },
      { id: 'first-ride', title: 'Enter any vehicle', goal: 1, rewardCash: 90, rewardXp: 25, type: 'vehicle' },
      { id: 'lot-owner', title: 'Buy your first city lot', goal: 1, rewardCash: 250, rewardXp: 70, type: 'lot' }
    ]
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function keyFor(cx, cy) { return `${cx},${cy}`; }
  function seeded(cx, cy) {
    let n = (cx * 374761393 + cy * 668265263) ^ 0x5f3759df;
    return () => {
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
  }

  function resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, state.lowPower ? 1.5 : 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function showMessage(text, seconds = 2.4) {
    state.message = text;
    state.messageTimer = seconds;
    const popup = $('reward-popup');
    if (popup) {
      popup.textContent = text;
      popup.classList.remove('hidden');
      clearTimeout(showMessage.timer);
      showMessage.timer = setTimeout(() => popup.classList.add('hidden'), seconds * 1000);
    }
  }

  function chunkAt(v) { return Math.floor(v / state.chunkSize); }

  function generateChunk(cx, cy) {
    const rand = seeded(cx, cy);
    const chunk = { roads: [], buildings: [], crates: [], npcs: [], lots: [], vehicles: [] };
    const ox = cx * state.chunkSize;
    const oy = cy * state.chunkSize;

    for (let i = -1; i <= 1; i++) {
      chunk.roads.push({ x: ox + i * 280 - 34, y: oy - 450, w: 68, h: 900, vertical: true });
      chunk.roads.push({ x: ox - 450, y: oy + i * 280 - 34, w: 900, h: 68, vertical: false });
    }

    for (let i = 0; i < 10; i++) {
      const bx = ox - 390 + rand() * 780;
      const by = oy - 390 + rand() * 780;
      const nearRoad = Math.abs(((bx - ox + 450) % 280) - 140) < 54 || Math.abs(((by - oy + 450) % 280) - 140) < 54;
      if (nearRoad) continue;
      chunk.buildings.push({ x: bx, y: by, w: 70 + rand() * 110, h: 70 + rand() * 140, glow: rand(), height: 1 + Math.floor(rand() * 5) });
    }

    for (let i = 0; i < 4; i++) {
      const id = `crate:${cx}:${cy}:${i}`;
      chunk.crates.push({ id, x: ox - 390 + rand() * 780, y: oy - 390 + rand() * 780, size: 22, collected: !!state.openedCrates[id] });
    }

    for (let i = 0; i < 3; i++) {
      chunk.npcs.push({ x: ox - 360 + rand() * 720, y: oy - 360 + rand() * 720, phase: rand() * Math.PI * 2, tip: ['Tip: Sprint drains less in a car.', 'Tip: Buy lots to mark your map.', 'Tip: Export saves before switching browsers.'][i % 3] });
    }

    for (let i = 0; i < 2; i++) {
      const id = `lot:${cx}:${cy}:${i}`;
      chunk.lots.push({ id, x: ox - 310 + rand() * 620, y: oy - 310 + rand() * 620, w: 86, h: 70, price: 220 + Math.floor(rand() * 240), owned: !!state.ownedLots[id] });
    }

    for (let i = 0; i < 2; i++) {
      chunk.vehicles.push({ id: `car:${cx}:${cy}:${i}`, x: ox - 360 + rand() * 720, y: oy - 360 + rand() * 720, vx: 0, vy: 0, angle: rand() * 6.28, hp: 100, gas: 100, occupied: false });
    }
    return chunk;
  }

  function streamWorld() {
    const pcx = chunkAt(state.player.x);
    const pcy = chunkAt(state.player.y);
    const needed = new Set();
    for (let y = pcy - state.drawDistance; y <= pcy + state.drawDistance; y++) {
      for (let x = pcx - state.drawDistance; x <= pcx + state.drawDistance; x++) {
        const k = keyFor(x, y);
        needed.add(k);
        if (!state.chunks.has(k)) state.chunks.set(k, generateChunk(x, y));
      }
    }
    for (const k of [...state.chunks.keys()]) if (!needed.has(k)) state.chunks.delete(k);
    state.roads = []; state.buildings = []; state.crates = []; state.npcs = []; state.lots = []; state.vehicles = [];
    for (const c of state.chunks.values()) {
      state.roads.push(...c.roads); state.buildings.push(...c.buildings); state.crates.push(...c.crates);
      state.npcs.push(...c.npcs); state.lots.push(...c.lots); state.vehicles.push(...c.vehicles);
    }
  }

  function isBlocked(x, y, radius = 16) {
    return state.buildings.some(b => x > b.x - radius && x < b.x + b.w + radius && y > b.y - radius && y < b.y + b.h + radius);
  }

  function missionProgress(type) {
    const m = state.currentMission || state.missions.find(mm => !state.completedMissions[mm.id] && mm.type === type);
    if (!m || m.type !== type || state.completedMissions[m.id]) return;
    m.progress = (m.progress || 0) + 1;
    state.currentMission = m;
    if (m.progress >= m.goal) {
      state.completedMissions[m.id] = true;
      state.player.cash += m.rewardCash;
      state.player.xp += m.rewardXp;
      showMessage(`Mission complete: ${m.title} +$${m.rewardCash}`);
      state.currentMission = state.missions.find(mm => !state.completedMissions[mm.id]) || null;
      saveGame(false);
    } else {
      showMessage(`${m.title}: ${m.progress}/${m.goal}`);
    }
  }

  function levelCheck() {
    const need = state.player.level * 100;
    if (state.player.xp >= need) {
      state.player.xp -= need;
      state.player.level += 1;
      state.player.cash += 75;
      showMessage(`Level ${state.player.level}! Bonus $75`);
    }
  }

  function interact() {
    const p = state.player;
    if (p.inVehicle) {
      p.inVehicle.occupied = false;
      p.x += Math.cos(p.inVehicle.angle) * 46;
      p.y += Math.sin(p.inVehicle.angle) * 46;
      p.inVehicle = null;
      showMessage('Exited vehicle');
      return;
    }
    const crate = state.crates.find(c => !c.collected && dist(p, c) < 50);
    if (crate) {
      crate.collected = true; state.openedCrates[crate.id] = true;
      p.cash += 35; p.xp += 15;
      missionProgress('crate'); levelCheck(); saveGame(false);
      showMessage('Neon crate collected +$35');
      return;
    }
    const lot = state.lots.find(l => dist(p, l) < 70);
    if (lot) {
      if (state.ownedLots[lot.id]) return showMessage('You already own this lot.');
      if (p.cash < lot.price) return showMessage(`Need $${lot.price} to buy this lot.`);
      p.cash -= lot.price; state.ownedLots[lot.id] = true; lot.owned = true;
      p.xp += 35; missionProgress('lot'); levelCheck(); saveGame(false);
      showMessage(`Bought city lot for $${lot.price}`);
      return;
    }
    const car = state.vehicles.find(v => dist(p, v) < 70 && v.hp > 0 && v.gas > 0);
    if (car) {
      p.inVehicle = car; car.occupied = true; missionProgress('vehicle'); saveGame(false); showMessage('Entered vehicle'); return;
    }
    const npc = state.npcs.find(n => dist(p, n) < 58);
    if (npc) return showMessage(npc.tip, 3.2);
    showMessage('Nothing close enough to interact with.');
  }

  function inputVector() {
    let x = 0, y = 0;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) y -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) y += 1;
    x += state.joy.dx; y += state.joy.dy;
    const mag = Math.hypot(x, y);
    return mag > 1 ? { x: x / mag, y: y / mag } : { x, y };
  }

  function update(dt) {
    if (state.paused) return;
    const p = state.player;
    const iv = inputVector();
    p.sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || $('btn-mobile-sprint')?.classList.contains('pressed');

    if (p.inVehicle) {
      const car = p.inVehicle;
      const accel = 420 * dt;
      car.angle += iv.x * 2.6 * dt;
      car.vx += Math.cos(car.angle) * -iv.y * accel;
      car.vy += Math.sin(car.angle) * -iv.y * accel;
      car.vx *= 0.985; car.vy *= 0.985;
      if (Math.hypot(car.vx, car.vy) > 35) car.gas = clamp(car.gas - dt * 1.6, 0, 100);
      let nx = car.x + car.vx * dt;
      let ny = car.y + car.vy * dt;
      if (isBlocked(nx, car.y, 28)) { car.vx *= -0.25; car.hp = clamp(car.hp - 4, 0, 100); } else car.x = nx;
      if (isBlocked(car.x, ny, 28)) { car.vy *= -0.25; car.hp = clamp(car.hp - 4, 0, 100); } else car.y = ny;
      p.x = car.x; p.y = car.y;
      if (car.hp <= 0 || car.gas <= 0) { p.inVehicle = null; car.occupied = false; showMessage(car.hp <= 0 ? 'Vehicle broke down.' : 'Vehicle ran out of gas.'); }
    } else {
      const spd = p.speed * (p.sprint ? 1.55 : 1);
      p.vx = iv.x * spd; p.vy = iv.y * spd;
      if (iv.x || iv.y) p.facing = Math.atan2(iv.y, iv.x);
      const nx = p.x + p.vx * dt; const ny = p.y + p.vy * dt;
      if (!isBlocked(nx, p.y, p.size * 0.55)) p.x = nx;
      if (!isBlocked(p.x, ny, p.size * 0.55)) p.y = ny;
    }

    state.camera.x += (p.x - state.camera.x) * clamp(dt * 8, 0, 1);
    state.camera.y += (p.y - state.camera.y) * clamp(dt * 8, 0, 1);
    state.particles = state.particles.filter(pt => (pt.life -= dt) > 0);
    streamWorld();
  }

  function worldToScreen(x, y) { return { x: (x - state.camera.x) * state.camera.zoom + innerWidth / 2, y: (y - state.camera.y) * state.camera.zoom + innerHeight / 2 }; }

  function rect(obj, color, stroke) {
    const p = worldToScreen(obj.x, obj.y);
    ctx.fillStyle = color; ctx.fillRect(p.x, p.y, obj.w * state.camera.zoom, obj.h * state.camera.zoom);
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(p.x, p.y, obj.w * state.camera.zoom, obj.h * state.camera.zoom); }
  }

  function draw() {
    ctx.fillStyle = '#070a18'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    for (const road of state.roads) rect(road, '#141936', '#202a62');
    ctx.strokeStyle = '#17f3ff33'; ctx.lineWidth = 2;
    for (const road of state.roads) {
      const a = worldToScreen(road.x + road.w / 2, road.y + road.h / 2);
      ctx.beginPath();
      if (road.vertical) { ctx.moveTo(a.x, a.y - road.h / 2); ctx.lineTo(a.x, a.y + road.h / 2); }
      else { ctx.moveTo(a.x - road.w / 2, a.y); ctx.lineTo(a.x + road.w / 2, a.y); }
      ctx.stroke();
    }
    for (const b of state.buildings) rect(b, b.glow > 0.5 ? '#20265a' : '#171d44', b.glow > 0.65 ? '#17f3ff99' : '#6d63ff66');
    for (const l of state.lots) rect({ x: l.x, y: l.y, w: l.w, h: l.h }, state.ownedLots[l.id] ? '#123b2a' : '#312036', state.ownedLots[l.id] ? '#5ef38c' : '#ffcc66');
    for (const c of state.crates) if (!c.collected) {
      const p = worldToScreen(c.x, c.y); ctx.fillStyle = '#17f3ff'; ctx.fillRect(p.x - 11, p.y - 11, 22, 22); ctx.strokeStyle = '#ffffff'; ctx.strokeRect(p.x - 11, p.y - 11, 22, 22);
    }
    for (const n of state.npcs) {
      const p = worldToScreen(n.x + Math.sin(performance.now()/600 + n.phase)*5, n.y); ctx.fillStyle = '#ffcc66'; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill();
    }
    for (const v of state.vehicles) {
      const p = worldToScreen(v.x, v.y); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(v.angle); ctx.fillStyle = v.hp > 0 ? '#ff3366' : '#333'; ctx.fillRect(-24, -13, 48, 26); ctx.fillStyle = '#17f3ff'; ctx.fillRect(2, -9, 14, 18); ctx.restore();
    }
    const p = worldToScreen(state.player.x, state.player.y);
    if (!state.player.inVehicle) {
      ctx.fillStyle = '#f7f9ff'; ctx.fillRect(p.x - 12, p.y - 12, 24, 24); ctx.fillStyle = '#17f3ff'; ctx.fillRect(p.x - 6, p.y - 22, 12, 8);
    }
    ctx.restore();
    drawMessage(); drawMinimap();
  }

  function drawMessage() {
    if (!state.message || state.messageTimer <= 0) return;
    state.messageTimer -= 1 / 60;
    ctx.fillStyle = 'rgba(5,8,20,.78)'; ctx.fillRect(innerWidth / 2 - 190, 82, 380, 42);
    ctx.strokeStyle = '#17f3ff88'; ctx.strokeRect(innerWidth / 2 - 190, 82, 380, 42);
    ctx.fillStyle = '#f7f9ff'; ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(state.message, innerWidth / 2, 108);
  }

  function drawMinimap() {
    if (!mini) return;
    mini.fillStyle = '#050814'; mini.fillRect(0, 0, 160, 160);
    const scale = 0.055; const cx = 80, cy = 80;
    for (const l of state.lots) {
      const x = cx + (l.x - state.player.x) * scale, y = cy + (l.y - state.player.y) * scale;
      if (x < 0 || y < 0 || x > 160 || y > 160) continue;
      mini.fillStyle = state.ownedLots[l.id] ? '#5ef38c' : '#ffcc66'; mini.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const c of state.crates) if (!c.collected) { const x = cx + (c.x - state.player.x) * scale, y = cy + (c.y - state.player.y) * scale; mini.fillStyle = '#17f3ff'; mini.fillRect(x - 1.5, y - 1.5, 3, 3); }
    mini.fillStyle = '#fff'; mini.beginPath(); mini.arc(80, 80, 4, 0, Math.PI * 2); mini.fill();
  }

  function updateHud() {
    const p = state.player, car = p.inVehicle;
    HUD.cash.textContent = Math.floor(p.cash); HUD.xp.textContent = Math.floor(p.xp); HUD.level.textContent = p.level; HUD.wanted.textContent = p.wanted;
    HUD.vehicle.textContent = car ? 'Neon car' : 'On foot'; HUD.vehicleHp.textContent = Math.floor(car?.hp ?? 100); HUD.vehicleGas.textContent = Math.floor(car?.gas ?? 100);
    HUD.mission.textContent = state.currentMission ? `${state.currentMission.title} ${state.currentMission.progress || 0}/${state.currentMission.goal}` : 'Free roam';
    HUD.fps.textContent = state.fps.toFixed(0); HUD.pos.textContent = `${p.x.toFixed(0)}, ${p.y.toFixed(0)}`; HUD.chunks.textContent = state.chunks.size; HUD.npcs.textContent = state.npcs.length;
    HUD.activeVehicle.textContent = car ? `${car.hp.toFixed(0)}hp/${car.gas.toFixed(0)}gas` : 'None'; HUD.saveSlot.textContent = state.saveSlot;
  }

  function savePayload() {
    const p = state.player;
    return { version: 2, savedAt: new Date().toISOString(), player: { x: p.x, y: p.y, cash: p.cash, xp: p.xp, level: p.level, wanted: p.wanted }, ownedLots: state.ownedLots, openedCrates: state.openedCrates, completedMissions: state.completedMissions, currentMissionId: state.currentMission?.id || null };
  }

  async function saveGame(manual = true) {
    const payload = savePayload();
    localStorage.setItem(`neonblock:${state.saveSlot}`, JSON.stringify(payload));
    if (window.NeonBlockCloud?.save) {
      try { await window.NeonBlockCloud.save(state.saveSlot, payload); HUD.online.textContent = HUD.debugOnline.textContent = 'cloud saved'; }
      catch (e) { HUD.lastError.textContent = e.message || 'cloud save failed'; HUD.online.textContent = HUD.debugOnline.textContent = 'local only'; }
    }
    if (manual) showMessage('Game saved.');
  }

  function applySave(payload) {
    if (!payload) return false;
    Object.assign(state.player, payload.player || {});
    state.ownedLots = payload.ownedLots || {}; state.openedCrates = payload.openedCrates || {}; state.completedMissions = payload.completedMissions || {};
    state.currentMission = state.missions.find(m => m.id === payload.currentMissionId && !state.completedMissions[m.id]) || state.missions.find(m => !state.completedMissions[m.id]) || null;
    streamWorld(); updateHud(); return true;
  }

  async function loadGame(manual = true) {
    let payload = null;
    if (window.NeonBlockCloud?.load) {
      try { payload = await window.NeonBlockCloud.load(state.saveSlot); } catch (e) { HUD.lastError.textContent = e.message || 'cloud load failed'; }
    }
    if (!payload) payload = JSON.parse(localStorage.getItem(`neonblock:${state.saveSlot}`) || 'null');
    if (applySave(payload)) showMessage(manual ? 'Save loaded.' : 'Autosave loaded.');
    else if (manual) showMessage('No save found for this slot.');
  }

  function openPause(open = !state.paused) { state.paused = open; $('pause-overlay')?.classList.toggle('hidden', !open); }
  function renderMissionBoard() {
    const ul = $('mission-list'); if (!ul) return; ul.innerHTML = '';
    for (const m of state.missions) {
      const li = document.createElement('li'); li.textContent = `${state.completedMissions[m.id] ? '✓ ' : ''}${m.title} — $${m.rewardCash}/${m.rewardXp}XP`; li.tabIndex = 0;
      li.onclick = () => { state.currentMission = m; showMessage(`Tracked: ${m.title}`); };
      ul.appendChild(li);
    }
  }

  function wireUi() {
    $('btn-resume')?.addEventListener('click', () => openPause(false));
    $('btn-mobile-pause')?.addEventListener('click', () => openPause(true));
    $('btn-mobile-interact')?.addEventListener('click', interact);
    $('btn-mobile-unstuck')?.addEventListener('click', () => { state.player.x += 120; state.player.y += 120; showMessage('Unstuck moved you nearby.'); });
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => loadGame(true));
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', () => $('mission-board')?.classList.add('hidden'));
    $('graphics-quality')?.addEventListener('change', (e) => { state.quality = e.target.value; state.drawDistance = state.quality === 'high' ? 3 : state.quality === 'low' ? 1 : state.lowPower ? 1 : 2; });
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.saveSlot = b.dataset.slot; saveGame(true); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { state.saveSlot = b.dataset.slot; loadGame(true); }));
    $('btn-export')?.addEventListener('click', () => { $('export-json').value = JSON.stringify(savePayload(), null, 2); showMessage('Save JSON exported.'); });
    $('btn-import')?.addEventListener('click', () => { try { applySave(JSON.parse($('export-json').value)); saveGame(false); showMessage('Save JSON imported.'); } catch { showMessage('Invalid save JSON.'); } });
    renderMissionBoard();
  }

  function pointerControls() {
    const joyBox = $('joystick-container'), stick = $('joystick-stick');
    joyBox?.addEventListener('pointerdown', e => { state.joy.active = true; state.joy.id = e.pointerId; joyBox.setPointerCapture(e.pointerId); moveJoy(e); });
    joyBox?.addEventListener('pointermove', moveJoy);
    joyBox?.addEventListener('pointerup', endJoy); joyBox?.addEventListener('pointercancel', endJoy);
    function moveJoy(e) { if (!state.joy.active || e.pointerId !== state.joy.id) return; const r = joyBox.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width/2); const dy = e.clientY - (r.top + r.height/2); const mag = Math.min(46, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); state.joy.dx = Math.cos(a) * (mag/46); state.joy.dy = Math.sin(a) * (mag/46); stick.style.transform = `translate(${Math.cos(a)*mag}px,${Math.sin(a)*mag}px)`; }
    function endJoy(e) { if (e.pointerId !== state.joy.id) return; state.joy.active = false; state.joy.dx = 0; state.joy.dy = 0; stick.style.transform = 'translate(0,0)'; }
    $('btn-mobile-sprint')?.addEventListener('pointerdown', e => e.currentTarget.classList.add('pressed'));
    $('btn-mobile-sprint')?.addEventListener('pointerup', e => e.currentTarget.classList.remove('pressed'));
  }

  addEventListener('keydown', e => { state.keys.add(e.code); if (e.code === 'Escape') openPause(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyM') { renderMissionBoard(); $('mission-board')?.classList.toggle('hidden'); openPause(true); } if (e.code === 'F3') { state.debug = !state.debug; $('debug-overlay')?.classList.toggle('visible', state.debug); } });
  addEventListener('keyup', e => state.keys.delete(e.code));
  addEventListener('resize', resize);
  addEventListener('pagehide', () => saveGame(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(false); });

  function loop(now) {
    const dt = clamp((now - state.last) / 1000, 0, 0.05); state.last = now; state.frame++;
    state.fps += ((1 / Math.max(dt, 0.001)) - state.fps) * 0.08;
    update(dt); draw(); if (state.frame % 10 === 0) updateHud();
    requestAnimationFrame(loop);
  }

  async function boot() {
    resize(); wireUi(); pointerControls(); streamWorld(); state.currentMission = state.missions[0];
    await loadGame(false).catch(() => {});
    $('loading-screen')?.classList.add('hidden');
    $('debug-overlay')?.classList.remove('visible');
    showMessage('NeonBlock City loaded. WASD/Arrows, E interact, M missions.', 3.5);
    setInterval(() => saveGame(false), 30000);
    requestAnimationFrame(loop);
  }

  boot();
})();
