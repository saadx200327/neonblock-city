(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const mini = document.getElementById('minimap-canvas');
  const mctx = mini.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  const WORLD = { chunk: 640, radius: 2, seed: 1337 };
  const keys = new Set();
  const pointer = { x: 0, y: 0, down: false };
  const joy = { active: false, id: null, x: 0, y: 0, mag: 0 };
  const state = {
    t: 0, dt: 0, fps: 60, last: performance.now(), saveSlot: 'slot1', paused: false, quality: 'auto',
    player: { x: 0, y: 0, vx: 0, vy: 0, dir: 0, speed: 180, hp: 100, cash: 150, xp: 0, level: 1, wanted: 0, onFoot: true, vehicleId: null },
    camera: { x: 0, y: 0, zoom: 1 }, chunks: new Map(), npcs: [], pickups: [], vehicles: [], properties: [], particles: [],
    mission: null, missionTick: 0, autosaveTick: 0, toastTick: 0, toast: ''
  };

  const missions = [
    { id: 'courier', name: 'Courier Dash', text: 'Collect 3 neon parcels', goal: 3, cash: 260, xp: 80 },
    { id: 'taxi', name: 'Taxi Run', text: 'Drive through 4 yellow checkpoints', goal: 4, cash: 400, xp: 120 },
    { id: 'owner', name: 'First Property', text: 'Buy any building deed', goal: 1, cash: 500, xp: 150 }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function rand(n) { const x = Math.sin(n * 999.13 + WORLD.seed) * 43758.5453; return x - Math.floor(x); }
  function chunkKey(cx, cy) { return cx + ',' + cy; }
  function storageKey(slot = state.saveSlot) { return 'neonblock-city-v10-' + slot; }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.camera.zoom = innerWidth < 720 ? 0.82 : 1;
  }

  function toast(message) {
    state.toast = message;
    state.toastTick = 2.4;
    const el = $('reward-popup');
    if (el) { el.textContent = message; el.classList.remove('hidden'); }
  }

  function makeChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    const baseX = cx * WORLD.chunk;
    const baseY = cy * WORLD.chunk;
    const roads = [];
    for (let i = -1; i <= 1; i++) {
      roads.push({ x: baseX + WORLD.chunk / 2 - 34, y: baseY + i * WORLD.chunk, w: 68, h: WORLD.chunk });
      roads.push({ x: baseX + i * WORLD.chunk, y: baseY + WORLD.chunk / 2 - 34, w: WORLD.chunk, h: 68 });
    }
    const buildings = [];
    for (let i = 0; i < 12; i++) {
      const r = rand(cx * 113 + cy * 67 + i);
      const w = 72 + rand(i + cx) * 90;
      const h = 72 + rand(i + cy) * 110;
      const x = baseX + 45 + rand(i * 9 + cx) * (WORLD.chunk - w - 90);
      const y = baseY + 45 + r * (WORLD.chunk - h - 90);
      if (Math.abs(x - (baseX + WORLD.chunk / 2)) < 80 || Math.abs(y - (baseY + WORLD.chunk / 2)) < 80) continue;
      buildings.push({ x, y, w, h, color: ['#2931a3', '#8a2be2', '#00bcd4', '#f72585'][i % 4], owner: false });
    }
    const chunk = { key, cx, cy, roads, buildings };
    for (let i = 0; i < 4; i++) spawnNpc(baseX + rand(i + cx) * WORLD.chunk, baseY + rand(i + cy + 44) * WORLD.chunk);
    if ((Math.abs(cx) + Math.abs(cy)) % 2 === 0) spawnVehicle(baseX + WORLD.chunk / 2 + 92, baseY + WORLD.chunk / 2 + 92);
    if ((cx + cy) % 2 === 0) state.pickups.push({ x: baseX + 140, y: baseY + 130, kind: 'parcel', taken: false });
    if ((cx - cy) % 3 === 0) state.properties.push({ x: baseX + 430, y: baseY + 410, price: 500 + 80 * Math.abs(cx + cy), owned: false });
    return chunk;
  }

  function streamWorld() {
    const pcx = Math.floor(state.player.x / WORLD.chunk);
    const pcy = Math.floor(state.player.y / WORLD.chunk);
    const keep = new Set();
    for (let x = pcx - WORLD.radius; x <= pcx + WORLD.radius; x++) for (let y = pcy - WORLD.radius; y <= pcy + WORLD.radius; y++) {
      const key = chunkKey(x, y); keep.add(key); if (!state.chunks.has(key)) state.chunks.set(key, makeChunk(x, y));
    }
    for (const k of state.chunks.keys()) if (!keep.has(k)) state.chunks.delete(k);
    state.npcs = state.npcs.filter(n => Math.abs(n.x - state.player.x) < WORLD.chunk * 3 && Math.abs(n.y - state.player.y) < WORLD.chunk * 3);
    state.vehicles = state.vehicles.filter(v => v.id === state.player.vehicleId || (Math.abs(v.x - state.player.x) < WORLD.chunk * 3 && Math.abs(v.y - state.player.y) < WORLD.chunk * 3));
  }

  function spawnNpc(x, y) { state.npcs.push({ x, y, vx: 0, vy: 0, mood: rand(x + y) > .5 ? 'walker' : 'vendor', tick: rand(x) * 4 }); }
  function spawnVehicle(x, y) { state.vehicles.push({ id: 'car' + Math.random().toString(36).slice(2), x, y, vx: 0, vy: 0, dir: 0, hp: 100, gas: 100, color: rand(x) > .5 ? '#17f3ff' : '#ffcc00' }); }

  function startMission(id) {
    const template = missions.find(m => m.id === id) || missions[0];
    state.mission = { ...template, progress: 0, target: { x: state.player.x + 420, y: state.player.y - 320 } };
    toast('Mission started: ' + template.name);
    closeMenus();
  }

  function completeMission() {
    const m = state.mission; if (!m) return;
    state.player.cash += m.cash; state.player.xp += m.xp; state.player.level = 1 + Math.floor(state.player.xp / 220);
    toast('Completed ' + m.name + ' +$' + m.cash + ' +' + m.xp + 'XP');
    state.mission = null;
  }

  function updateInput(dt) {
    let ax = 0, ay = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
    ax += joy.x; ay += joy.y;
    const mag = Math.hypot(ax, ay) || 1; ax /= mag; ay /= mag;
    const inVehicle = !state.player.onFoot && state.vehicles.find(v => v.id === state.player.vehicleId);
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || $('btn-mobile-sprint')?.dataset.down === '1';
    const speed = inVehicle ? 360 : (sprint ? 250 : 165);
    const obj = inVehicle || state.player;
    obj.vx = ax * speed; obj.vy = ay * speed;
    obj.x += obj.vx * dt; obj.y += obj.vy * dt;
    if (ax || ay) obj.dir = Math.atan2(ay, ax);
    if (inVehicle) { inVehicle.gas = clamp(inVehicle.gas - (Math.abs(ax) + Math.abs(ay)) * dt * 2.2, 0, 100); state.player.x = inVehicle.x; state.player.y = inVehicle.y; }
  }

  function interact() {
    const p = state.player;
    const nearCar = state.vehicles.find(v => dist(p.x, p.y, v.x, v.y) < 70);
    if (nearCar && p.onFoot) { p.onFoot = false; p.vehicleId = nearCar.id; toast('Entered vehicle'); return; }
    if (!p.onFoot) { p.onFoot = true; p.vehicleId = null; toast('Exited vehicle'); return; }
    const pickup = state.pickups.find(it => !it.taken && dist(p.x, p.y, it.x, it.y) < 58);
    if (pickup) { pickup.taken = true; p.cash += 35; p.xp += 12; if (state.mission?.id === 'courier') state.mission.progress++; toast('Parcel collected +$35'); return; }
    const prop = state.properties.find(pr => !pr.owned && dist(p.x, p.y, pr.x, pr.y) < 72);
    if (prop) {
      if (p.cash >= prop.price) { p.cash -= prop.price; prop.owned = true; p.xp += 65; if (state.mission?.id === 'owner') state.mission.progress++; toast('Property bought'); }
      else toast('Need $' + prop.price + ' to buy');
      return;
    }
    openMissionBoard();
  }

  function update(dt) {
    if (state.paused) return;
    state.t += dt; state.missionTick += dt; state.autosaveTick += dt;
    updateInput(dt); streamWorld();
    for (const n of state.npcs) { n.tick -= dt; if (n.tick <= 0) { n.tick = 1 + rand(n.x + state.t) * 3; const a = rand(n.y + state.t) * Math.PI * 2; n.vx = Math.cos(a) * 42; n.vy = Math.sin(a) * 42; } n.x += n.vx * dt; n.y += n.vy * dt; }
    if (state.mission) {
      if (state.mission.id === 'taxi' && !state.player.onFoot && dist(state.player.x, state.player.y, state.mission.target.x, state.mission.target.y) < 85) { state.mission.progress++; state.mission.target.x += 260 - rand(state.t) * 520; state.mission.target.y += 260 - rand(state.t + 2) * 520; toast('Checkpoint ' + state.mission.progress + '/' + state.mission.goal); }
      if (state.mission.progress >= state.mission.goal) completeMission();
    }
    if (state.autosaveTick > 25) { state.autosaveTick = 0; saveGame(state.saveSlot, true); }
    if (state.toastTick > 0) { state.toastTick -= dt; if (state.toastTick <= 0) $('reward-popup')?.classList.add('hidden'); }
    state.camera.x += (state.player.x - state.camera.x) * Math.min(1, dt * 8); state.camera.y += (state.player.y - state.camera.y) * Math.min(1, dt * 8);
  }

  function screen(x, y) { return { x: (x - state.camera.x) * state.camera.zoom + innerWidth / 2, y: (y - state.camera.y) * state.camera.zoom + innerHeight / 2 }; }
  function drawRect(x, y, w, h, color) { const p = screen(x, y); ctx.fillStyle = color; ctx.fillRect(p.x, p.y, w * state.camera.zoom, h * state.camera.zoom); }
  function drawCircle(x, y, r, color) { const p = screen(x, y); ctx.beginPath(); ctx.arc(p.x, p.y, r * state.camera.zoom, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }

  function render() {
    ctx.fillStyle = '#060915'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    for (const ch of state.chunks.values()) {
      drawRect(ch.cx * WORLD.chunk, ch.cy * WORLD.chunk, WORLD.chunk, WORLD.chunk, '#0a1230');
      ch.roads.forEach(r => drawRect(r.x, r.y, r.w, r.h, '#1d2548'));
      ch.buildings.forEach(b => { drawRect(b.x + 5, b.y + 8, b.w, b.h, '#03050e'); drawRect(b.x, b.y, b.w, b.h, b.color); });
    }
    state.properties.forEach(pr => { if (Math.abs(pr.x - state.player.x) < 1300 && Math.abs(pr.y - state.player.y) < 1300) { drawCircle(pr.x, pr.y, 24, pr.owned ? '#5ef38c' : '#ffd166'); } });
    state.pickups.forEach(it => { if (!it.taken) drawCircle(it.x, it.y, 14 + Math.sin(state.t * 5) * 3, '#17f3ff'); });
    if (state.mission?.target) drawCircle(state.mission.target.x, state.mission.target.y, 34, '#ffcc00');
    state.vehicles.forEach(v => { const p = screen(v.x, v.y); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(v.dir); ctx.fillStyle = v.color; ctx.fillRect(-26, -15, 52, 30); ctx.fillStyle = '#02040a'; ctx.fillRect(4, -11, 16, 22); ctx.restore(); });
    state.npcs.forEach(n => drawCircle(n.x, n.y, 12, n.mood === 'vendor' ? '#ff4d8d' : '#b8f7ff'));
    if (state.player.onFoot) { drawCircle(state.player.x, state.player.y, 18, '#ffffff'); drawCircle(state.player.x + Math.cos(state.player.dir) * 14, state.player.y + Math.sin(state.player.dir) * 14, 7, '#17f3ff'); }
    ctx.restore();
    drawMinimap(); updateHud();
  }

  function drawMinimap() {
    mctx.clearRect(0, 0, mini.width, mini.height); mctx.fillStyle = '#071022'; mctx.fillRect(0, 0, mini.width, mini.height);
    const scale = .08, ox = mini.width / 2, oy = mini.height / 2;
    mctx.fillStyle = '#17f3ff'; mctx.fillRect(ox - 3, oy - 3, 6, 6);
    mctx.fillStyle = '#ffcc00'; if (state.mission?.target) mctx.fillRect(ox + (state.mission.target.x - state.player.x) * scale - 3, oy + (state.mission.target.y - state.player.y) * scale - 3, 6, 6);
    mctx.strokeStyle = '#324069'; mctx.strokeRect(0, 0, mini.width, mini.height);
  }

  function updateHud() {
    const p = state.player, car = state.vehicles.find(v => v.id === p.vehicleId);
    hud.cash.textContent = '$' + Math.floor(p.cash); hud.xp.textContent = Math.floor(p.xp); hud.level.textContent = p.level; hud.wanted.textContent = p.wanted;
    hud.vehicle.textContent = car ? 'Neon Cruiser' : 'On foot'; hud.hp.textContent = car ? Math.floor(car.hp) : p.hp; hud.gas.textContent = car ? Math.floor(car.gas) : '--';
    hud.mission.textContent = state.mission ? `${state.mission.name} ${state.mission.progress}/${state.mission.goal}` : 'None';
    hud.fps.textContent = Math.round(state.fps); hud.pos.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = car ? car.id.slice(0, 8) : 'None'; hud.saveSlot.textContent = state.saveSlot;
  }

  function savePayload() {
    return { version: 10, player: state.player, mission: state.mission, properties: state.properties.map(p => ({ x: p.x, y: p.y, price: p.price, owned: p.owned })), savedAt: new Date().toISOString() };
  }
  async function saveGame(slot = state.saveSlot, silent = false) {
    localStorage.setItem(storageKey(slot), JSON.stringify(savePayload()));
    try { await window.NBCCloud?.save?.(slot, savePayload()); hud.online.textContent = 'cloud optional'; hud.debugOnline.textContent = 'cloud optional'; } catch (e) { hud.lastError.textContent = 'cloud skipped'; }
    if (!silent) toast('Saved ' + slot);
  }
  async function loadGame(slot = state.saveSlot) {
    let raw = localStorage.getItem(storageKey(slot));
    try { const cloud = await window.NBCCloud?.load?.(slot); if (cloud) raw = JSON.stringify(cloud); } catch (e) { hud.lastError.textContent = 'cloud skipped'; }
    if (!raw) return toast('No save in ' + slot);
    const data = JSON.parse(raw); Object.assign(state.player, data.player || {}); state.mission = data.mission || null;
    if (data.properties) state.properties = data.properties;
    toast('Loaded ' + slot); closeMenus();
  }

  function openMissionBoard() {
    const list = $('mission-list'); list.innerHTML = '';
    missions.forEach(m => { const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = `${m.name} - ${m.text}`; b.onclick = () => startMission(m.id); li.appendChild(b); list.appendChild(li); });
    $('pause-overlay').classList.remove('hidden'); $('mission-board').classList.remove('hidden'); state.paused = true;
  }
  function closeMenus() { state.paused = false; $('pause-overlay').classList.add('hidden'); document.querySelectorAll('#pause-overlay .menu-card').forEach(e => e.classList.add('hidden')); document.querySelector('#pause-overlay .menu-card')?.classList.remove('hidden'); }
  function openPause() { state.paused = true; $('pause-overlay').classList.remove('hidden'); }

  function bind() {
    addEventListener('resize', resize); resize();
    addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') state.paused ? closeMenus() : openPause(); if (e.code === 'KeyM') openMissionBoard(); if (e.code === 'KeyR') { state.player.x = 0; state.player.y = 0; toast('Unstuck'); } });
    addEventListener('keyup', e => keys.delete(e.code));
    $('btn-resume').onclick = closeMenus; $('btn-settings').onclick = () => $('settings-panel').classList.toggle('hidden'); $('btn-close-settings').onclick = () => $('settings-panel').classList.add('hidden');
    $('btn-save').onclick = () => { $('save-panel').classList.toggle('hidden'); }; $('btn-load').onclick = () => loadGame(state.saveSlot);
    $('btn-close-save').onclick = () => $('save-panel').classList.add('hidden'); $('btn-close-missions').onclick = closeMenus; $('btn-mobile-pause').onclick = openPause; $('btn-mobile-interact').onclick = interact; $('btn-mobile-unstuck').onclick = () => { state.player.x = 0; state.player.y = 0; toast('Unstuck'); };
    document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { state.saveSlot = b.dataset.slot; saveGame(state.saveSlot); });
    document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => { state.saveSlot = b.dataset.slot; loadGame(state.saveSlot); });
    $('btn-export').onclick = () => { $('export-json').value = JSON.stringify(savePayload(), null, 2); };
    $('btn-import').onclick = () => { try { const data = JSON.parse($('export-json').value); Object.assign(state.player, data.player || {}); state.mission = data.mission || null; toast('Imported save JSON'); } catch { toast('Invalid JSON'); } };
    const sprint = $('btn-mobile-sprint'); ['pointerdown','pointerup','pointercancel','pointerleave'].forEach(type => sprint.addEventListener(type, e => { sprint.dataset.down = type === 'pointerdown' ? '1' : '0'; }));
    const jc = $('joystick-container'), stick = $('joystick-stick');
    jc.addEventListener('pointerdown', e => { joy.active = true; joy.id = e.pointerId; jc.setPointerCapture(e.pointerId); moveJoy(e); });
    jc.addEventListener('pointermove', moveJoy); ['pointerup','pointercancel'].forEach(type => jc.addEventListener(type, () => { joy.active = false; joy.x = joy.y = joy.mag = 0; stick.style.transform = 'translate(0,0)'; }));
    function moveJoy(e) { if (!joy.active || e.pointerId !== joy.id) return; const r = jc.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const len = Math.min(46, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); joy.x = Math.cos(a) * (len / 46); joy.y = Math.sin(a) * (len / 46); stick.style.transform = `translate(${Math.cos(a)*len}px,${Math.sin(a)*len}px)`; }
  }

  function loop(now) {
    const raw = (now - state.last) / 1000; state.last = now; state.dt = Math.min(raw, 0.05); state.fps = state.fps * .92 + (1 / Math.max(state.dt, .001)) * .08;
    update(state.dt); render(); requestAnimationFrame(loop);
  }

  bind(); streamWorld(); loadGame('slot1').catch(() => {}); $('loading-screen')?.classList.add('hidden'); toast('NeonBlock City v10 ready'); requestAnimationFrame(loop);
})();
