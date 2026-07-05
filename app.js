(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const miniCanvas = document.getElementById('minimap-canvas');
  const mini = miniCanvas?.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  const world = {
    chunkSize: 900,
    renderDistance: 2,
    loaded: new Map(),
    seed: 1337,
    npcs: [],
    vehicles: [],
    pickups: [],
    properties: [],
    missionTargets: []
  };

  const player = {
    x: 120, y: 120, vx: 0, vy: 0, radius: 18, speed: 235, sprint: false, cash: 250, xp: 0, level: 1,
    wanted: 0, hp: 100, inVehicle: null, facing: 0, owned: {}, currentMission: null, completed: 0
  };

  const state = {
    keys: new Set(), paused: false, last: performance.now(), fps: 0, frames: 0, fpsTimer: 0,
    cameraX: 0, cameraY: 0, slot: 'slot1', quality: localStorage.getItem('nb_quality') || 'auto', lastError: 'none', touchMove: { x: 0, y: 0 }, jumpPulse: 0
  };

  const missions = [
    { id: 'delivery', name: 'Neon Delivery', detail: 'Grab the glowing cube and deliver it to the tower.', reward: 180, xp: 75 },
    { id: 'taxi', name: 'Block Taxi', detail: 'Drive to the blue marker and drop off a rider.', reward: 260, xp: 95 },
    { id: 'repair', name: 'Street Repair', detail: 'Visit three hazard cones to repair the road.', reward: 320, xp: 120 }
  ];

  function hash(n) { n = Math.imul(n ^ 61, n ^ (n >>> 16)); n += n << 3; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }
  function rand(cx, cy, i = 0) { return hash(cx * 73856093 ^ cy * 19349663 ^ i * 83492791 ^ world.seed) / 4294967295; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function showError(e) { state.lastError = String(e?.message || e).slice(0, 80); if (hud.lastError) hud.lastError.textContent = state.lastError; console.warn(e); }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, state.quality === 'low' ? 1.25 : 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function chunkKey(cx, cy) { return `${cx},${cy}`; }
  function createChunk(cx, cy) {
    const chunk = { cx, cy, roads: [], buildings: [], props: [], pickups: [], vehicles: [], npcs: [], properties: [] };
    const ox = cx * world.chunkSize, oy = cy * world.chunkSize;
    const roadW = 112;
    chunk.roads.push({ x: ox, y: oy + world.chunkSize / 2 - roadW / 2, w: world.chunkSize, h: roadW });
    chunk.roads.push({ x: ox + world.chunkSize / 2 - roadW / 2, y: oy, w: roadW, h: world.chunkSize });

    for (let i = 0; i < 9; i++) {
      const x = ox + 70 + rand(cx, cy, i) * (world.chunkSize - 190);
      const y = oy + 70 + rand(cx, cy, i + 20) * (world.chunkSize - 190);
      if (Math.abs((x - ox) - world.chunkSize / 2) < 95 || Math.abs((y - oy) - world.chunkSize / 2) < 95) continue;
      const w = 55 + rand(cx, cy, i + 40) * 95;
      const h = 55 + rand(cx, cy, i + 60) * 95;
      chunk.buildings.push({ x, y, w, h, color: `hsl(${180 + rand(cx, cy, i + 80) * 120}, 80%, ${22 + rand(cx, cy, i + 90) * 14}%)` });
    }
    for (let i = 0; i < 3; i++) chunk.pickups.push({ x: ox + rand(cx, cy, i + 100) * world.chunkSize, y: oy + rand(cx, cy, i + 110) * world.chunkSize, kind: 'cash', value: 15 + Math.floor(rand(cx, cy, i + 120) * 45), taken: false });
    if (rand(cx, cy, 301) > 0.55) chunk.vehicles.push({ x: ox + 420 + rand(cx, cy, 302) * 80, y: oy + 350 + rand(cx, cy, 303) * 180, angle: 0, hp: 100, gas: 100, occupied: false, name: rand(cx, cy, 304) > 0.5 ? 'Neon Kart' : 'Block Cruiser' });
    if (rand(cx, cy, 401) > 0.45) chunk.properties.push({ x: ox + 90 + rand(cx, cy, 402) * 680, y: oy + 90 + rand(cx, cy, 403) * 680, price: 500 + Math.floor(rand(cx, cy, 404) * 1200), owned: false });
    for (let i = 0; i < 4; i++) chunk.npcs.push({ x: ox + rand(cx, cy, i + 500) * world.chunkSize, y: oy + rand(cx, cy, i + 520) * world.chunkSize, vx: 0, vy: 0, t: rand(cx, cy, i + 530) * 5 });
    return chunk;
  }

  function streamWorld() {
    const pcx = Math.floor(player.x / world.chunkSize);
    const pcy = Math.floor(player.y / world.chunkSize);
    const keep = new Set();
    for (let y = pcy - world.renderDistance; y <= pcy + world.renderDistance; y++) {
      for (let x = pcx - world.renderDistance; x <= pcx + world.renderDistance; x++) {
        const key = chunkKey(x, y); keep.add(key);
        if (!world.loaded.has(key)) world.loaded.set(key, createChunk(x, y));
      }
    }
    for (const key of world.loaded.keys()) if (!keep.has(key)) world.loaded.delete(key);
    world.npcs = []; world.vehicles = []; world.pickups = []; world.properties = [];
    for (const chunk of world.loaded.values()) {
      world.npcs.push(...chunk.npcs); world.vehicles.push(...chunk.vehicles); world.pickups.push(...chunk.pickups); world.properties.push(...chunk.properties);
    }
  }

  function isBlocked(x, y, r = player.radius) {
    for (const chunk of world.loaded.values()) {
      for (const b of chunk.buildings) {
        if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
      }
    }
    return false;
  }

  function inputVector() {
    let x = state.touchMove.x, y = state.touchMove.y;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) y -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) y += 1;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, active: Math.abs(x) + Math.abs(y) > 0.05 };
  }

  function update(dt) {
    if (state.paused) return;
    streamWorld();
    const input = inputVector();
    player.sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || $('btn-mobile-sprint')?.classList.contains('pressed');
    const activeVehicle = player.inVehicle;
    const speed = activeVehicle ? 430 : player.speed * (player.sprint ? 1.55 : 1);
    if (input.active) {
      player.facing = Math.atan2(input.y, input.x);
      player.vx = input.x * speed; player.vy = input.y * speed;
      if (activeVehicle) activeVehicle.gas = Math.max(0, activeVehicle.gas - dt * 2.8);
    } else {
      player.vx *= activeVehicle ? 0.94 : 0.78; player.vy *= activeVehicle ? 0.94 : 0.78;
    }
    if (activeVehicle && activeVehicle.gas <= 0) { player.vx *= 0.2; player.vy *= 0.2; }
    let nx = player.x + player.vx * dt, ny = player.y + player.vy * dt;
    const r = activeVehicle ? 25 : player.radius;
    if (!isBlocked(nx, player.y, r)) player.x = nx; else player.vx = -player.vx * 0.25;
    if (!isBlocked(player.x, ny, r)) player.y = ny; else player.vy = -player.vy * 0.25;
    if (activeVehicle) { activeVehicle.x = player.x; activeVehicle.y = player.y; activeVehicle.angle = player.facing; }

    for (const p of world.pickups) if (!p.taken && dist(player.x, player.y, p.x, p.y) < 38) { p.taken = true; player.cash += p.value; reward(`+$${p.value}`); }
    for (const n of world.npcs) { n.t += dt; n.vx = Math.cos(n.t * 0.8) * 32; n.vy = Math.sin(n.t * 0.7) * 32; n.x += n.vx * dt; n.y += n.vy * dt; if (dist(player.x, player.y, n.x, n.y) < 22 && activeVehicle) { player.wanted = clamp(player.wanted + 1, 0, 5); n.x += 80; } }
    if (player.wanted > 0) player.wanted = Math.max(0, player.wanted - dt * 0.025);
    updateMission(dt);
    updateHud();
  }

  function startMission(id) {
    const m = missions.find(v => v.id === id) || missions[0];
    player.currentMission = { ...m, progress: 0, targets: makeTargets(m.id) };
    reward(`Mission started: ${m.name}`);
    closeMenus();
  }

  function makeTargets(type) {
    const base = [];
    const px = player.x, py = player.y;
    if (type === 'repair') for (let i = 0; i < 3; i++) base.push({ x: px + 260 * (i + 1), y: py + (i % 2 ? -220 : 230), done: false });
    else if (type === 'taxi') base.push({ x: px + 650, y: py - 340, done: false }, { x: px - 520, y: py + 520, done: false });
    else base.push({ x: px + 420, y: py + 180, done: false }, { x: px + 850, y: py - 230, done: false });
    return base;
  }

  function updateMission() {
    const m = player.currentMission; if (!m) return;
    const target = m.targets.find(t => !t.done);
    if (!target) {
      player.cash += m.reward; player.xp += m.xp; player.completed += 1; levelCheck(); reward(`Completed ${m.name}: +$${m.reward} +${m.xp}XP`); player.currentMission = null; return;
    }
    if (dist(player.x, player.y, target.x, target.y) < 54) { target.done = true; reward('Checkpoint reached'); }
  }

  function levelCheck() { const next = player.level * 150; if (player.xp >= next) { player.xp -= next; player.level += 1; player.cash += 100; reward(`Level ${player.level}! Bonus $100`); } }

  function interact() {
    if (state.paused) return;
    if (player.inVehicle) { player.inVehicle.occupied = false; player.inVehicle = null; reward('Exited vehicle'); return; }
    let nearVehicle = world.vehicles.find(v => !v.occupied && dist(player.x, player.y, v.x, v.y) < 70);
    if (nearVehicle) { player.inVehicle = nearVehicle; nearVehicle.occupied = true; player.x = nearVehicle.x; player.y = nearVehicle.y; reward(`Entered ${nearVehicle.name}`); return; }
    let prop = world.properties.find(p => dist(player.x, player.y, p.x, p.y) < 70);
    if (prop) {
      const key = `${Math.round(prop.x)},${Math.round(prop.y)}`;
      if (player.owned[key] || prop.owned) { reward('You own this block property'); return; }
      if (player.cash >= prop.price) { player.cash -= prop.price; player.owned[key] = true; prop.owned = true; reward(`Property bought: $${prop.price}`); }
      else reward(`Need $${prop.price} to buy`);
      return;
    }
    openMissionBoard();
  }

  function unstuck() { player.x += 120; player.y += 120; player.vx = player.vy = 0; reward('Unstuck'); }
  function reward(text) { const el = $('reward-popup'); if (!el) return; el.textContent = text; el.classList.remove('hidden'); clearTimeout(reward._t); reward._t = setTimeout(() => el.classList.add('hidden'), 1800); }

  function draw() {
    ctx.fillStyle = '#050814'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    state.cameraX = player.x - innerWidth / 2; state.cameraY = player.y - innerHeight / 2;
    ctx.save(); ctx.translate(-state.cameraX, -state.cameraY);
    drawGrid();
    for (const chunk of world.loaded.values()) drawChunk(chunk);
    drawMissionTargets();
    for (const p of world.pickups) if (!p.taken) drawPickup(p);
    for (const v of world.vehicles) drawVehicle(v);
    for (const n of world.npcs) drawNpc(n);
    drawPlayer();
    ctx.restore();
    drawMinimap();
  }

  function drawGrid() {
    ctx.strokeStyle = '#0b1433'; ctx.lineWidth = 1;
    const startX = Math.floor(state.cameraX / 120) * 120, endX = state.cameraX + innerWidth;
    const startY = Math.floor(state.cameraY / 120) * 120, endY = state.cameraY + innerHeight;
    for (let x = startX; x < endX; x += 120) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for (let y = startY; y < endY; y += 120) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
  }
  function drawChunk(chunk) {
    ctx.fillStyle = '#10172e'; for (const r of chunk.roads) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#17f3ff44'; ctx.setLineDash([18, 18]); for (const r of chunk.roads) { ctx.beginPath(); if (r.w > r.h) { ctx.moveTo(r.x, r.y + r.h / 2); ctx.lineTo(r.x + r.w, r.y + r.h / 2); } else { ctx.moveTo(r.x + r.w / 2, r.y); ctx.lineTo(r.x + r.w / 2, r.y + r.h); } ctx.stroke(); } ctx.setLineDash([]);
    for (const b of chunk.buildings) { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#17f3ffaa'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
    for (const p of chunk.properties) { const key = `${Math.round(p.x)},${Math.round(p.y)}`; ctx.fillStyle = player.owned[key] ? '#5ef38c' : '#ffd166'; ctx.fillRect(p.x - 20, p.y - 20, 40, 40); ctx.fillStyle = '#050814'; ctx.font = '12px system-ui'; ctx.fillText('$' + p.price, p.x - 20, p.y - 28); }
  }
  function drawPickup(p) { ctx.fillStyle = '#5ef38c'; ctx.beginPath(); ctx.arc(p.x, p.y, 12 + Math.sin(performance.now() / 140) * 2, 0, Math.PI * 2); ctx.fill(); }
  function drawVehicle(v) { ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle); ctx.fillStyle = v.occupied ? '#17f3ff' : '#ff4fd8'; ctx.fillRect(-26, -16, 52, 32); ctx.fillStyle = '#050814'; ctx.fillRect(4, -10, 14, 20); ctx.restore(); }
  function drawNpc(n) { ctx.fillStyle = '#f7f9ff'; ctx.fillRect(n.x - 10, n.y - 10, 20, 20); }
  function drawPlayer() { if (player.inVehicle) return; ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.facing); ctx.fillStyle = '#17f3ff'; ctx.fillRect(-15, -15, 30, 30); ctx.fillStyle = '#f7f9ff'; ctx.fillRect(4, -5, 13, 10); ctx.restore(); }
  function drawMissionTargets() { const m = player.currentMission; if (!m) return; for (const t of m.targets) if (!t.done) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(t.x, t.y, 34 + Math.sin(performance.now() / 180) * 5, 0, Math.PI * 2); ctx.stroke(); } }
  function drawMinimap() {
    if (!mini) return; mini.fillStyle = '#050814'; mini.fillRect(0, 0, 160, 160); mini.fillStyle = '#10172e'; mini.fillRect(0, 72, 160, 16); mini.fillRect(72, 0, 16, 160);
    for (const v of world.vehicles) { mini.fillStyle = '#ff4fd8'; mini.fillRect(80 + (v.x - player.x) / 22, 80 + (v.y - player.y) / 22, 3, 3); }
    const m = player.currentMission; if (m) { const t = m.targets.find(v => !v.done); if (t) { mini.fillStyle = '#ffd166'; mini.fillRect(80 + clamp((t.x - player.x) / 22, -78, 78), 80 + clamp((t.y - player.y) / 22, -78, 78), 5, 5); } }
    mini.fillStyle = '#17f3ff'; mini.beginPath(); mini.arc(80, 80, 5, 0, Math.PI * 2); mini.fill();
  }

  function updateHud() {
    if (hud.cash) hud.cash.textContent = Math.floor(player.cash); if (hud.xp) hud.xp.textContent = Math.floor(player.xp); if (hud.level) hud.level.textContent = player.level;
    if (hud.wanted) hud.wanted.textContent = Math.floor(player.wanted); if (hud.vehicle) hud.vehicle.textContent = player.inVehicle ? player.inVehicle.name : 'On foot';
    if (hud.hp) hud.hp.textContent = Math.floor(player.inVehicle?.hp ?? player.hp); if (hud.gas) hud.gas.textContent = Math.floor(player.inVehicle?.gas ?? 100);
    if (hud.mission) hud.mission.textContent = player.currentMission ? player.currentMission.name : 'Tap Interact for missions';
    if (hud.pos) hud.pos.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}, 0`; if (hud.chunks) hud.chunks.textContent = world.loaded.size; if (hud.npcs) hud.npcs.textContent = world.npcs.length;
    if (hud.activeVehicle) hud.activeVehicle.textContent = player.inVehicle ? player.inVehicle.name : 'None'; if (hud.saveSlot) hud.saveSlot.textContent = state.slot;
    const online = window.NeonBlockCloud?.isReady?.() ? 'cloud ready' : 'local only'; if (hud.online) hud.online.textContent = online; if (hud.debugOnline) hud.debugOnline.textContent = online;
  }

  function openMissionBoard() {
    state.paused = true; $('pause-overlay')?.classList.remove('hidden'); $('mission-board')?.classList.remove('hidden');
    const list = $('mission-list'); if (list) { list.innerHTML = ''; for (const m of missions) { const li = document.createElement('li'); li.innerHTML = `<button data-mission="${m.id}">${m.name}</button><p>${m.detail}</p><small>Reward $${m.reward} / ${m.xp}XP</small>`; list.appendChild(li); } }
  }
  function openPause() { state.paused = true; $('pause-overlay')?.classList.remove('hidden'); }
  function closeMenus() { state.paused = false; for (const id of ['pause-overlay','settings-panel','mission-board','save-panel']) $(id)?.classList.add('hidden'); }
  function openSavePanel() { state.paused = true; $('pause-overlay')?.classList.remove('hidden'); $('save-panel')?.classList.remove('hidden'); }

  function saveData() { return { version: 2, savedAt: new Date().toISOString(), player: { x: player.x, y: player.y, cash: player.cash, xp: player.xp, level: player.level, wanted: player.wanted, owned: player.owned, completed: player.completed }, quality: state.quality }; }
  async function save(slot = state.slot) { state.slot = slot; const data = saveData(); localStorage.setItem('neonblock_' + slot, JSON.stringify(data)); try { await window.NeonBlockCloud?.save?.(slot, data); } catch (e) { showError(e); } reward('Game saved'); updateHud(); }
  async function load(slot = state.slot) { state.slot = slot; let raw = localStorage.getItem('neonblock_' + slot); try { const cloud = await window.NeonBlockCloud?.load?.(slot); if (cloud) raw = JSON.stringify(cloud); } catch (e) { showError(e); } if (!raw) return reward('No save found'); const data = JSON.parse(raw); Object.assign(player, data.player || {}); state.quality = data.quality || state.quality; localStorage.setItem('nb_quality', state.quality); reward('Game loaded'); updateHud(); }

  function bindControls() {
    addEventListener('resize', resize); addEventListener('keydown', e => { state.keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape' || e.code === 'KeyP') state.paused ? closeMenus() : openPause(); if (e.code === 'KeyM') openMissionBoard(); if (e.code === 'KeyR') unstuck(); });
    addEventListener('keyup', e => state.keys.delete(e.code));
    $('btn-resume')?.addEventListener('click', closeMenus); $('btn-mobile-pause')?.addEventListener('click', () => state.paused ? closeMenus() : openPause()); $('btn-mobile-interact')?.addEventListener('click', interact); $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', openSavePanel); $('btn-load')?.addEventListener('click', () => load(state.slot)); $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', closeMenus); $('mission-list')?.addEventListener('click', e => { const id = e.target?.dataset?.mission; if (id) startMission(id); });
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => save(b.dataset.slot))); document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => load(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { $('export-json').value = JSON.stringify(saveData(), null, 2); }); $('btn-import')?.addEventListener('click', () => { try { const data = JSON.parse($('export-json').value); Object.assign(player, data.player || {}); reward('Imported save'); } catch (e) { showError(e); reward('Bad JSON'); } });
    $('graphics-quality')?.addEventListener('change', e => { state.quality = e.target.value; localStorage.setItem('nb_quality', state.quality); resize(); }); if ($('graphics-quality')) $('graphics-quality').value = state.quality;
    const sprintBtn = $('btn-mobile-sprint'); sprintBtn?.addEventListener('pointerdown', () => sprintBtn.classList.add('pressed')); sprintBtn?.addEventListener('pointerup', () => sprintBtn.classList.remove('pressed')); sprintBtn?.addEventListener('pointercancel', () => sprintBtn.classList.remove('pressed'));
    bindJoystick();
  }

  function bindJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick'); if (!box || !stick) return; let active = false;
    function set(e) { const rect = box.getBoundingClientRect(); const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; let x = e.clientX - cx, y = e.clientY - cy; const len = Math.hypot(x, y); const max = 44; if (len > max) { x = x / len * max; y = y / len * max; } stick.style.transform = `translate(${x}px,${y}px)`; state.touchMove.x = x / max; state.touchMove.y = y / max; }
    box.addEventListener('pointerdown', e => { active = true; box.setPointerCapture(e.pointerId); set(e); }); box.addEventListener('pointermove', e => { if (active) set(e); });
    function end() { active = false; state.touchMove.x = 0; state.touchMove.y = 0; stick.style.transform = 'translate(0,0)'; }
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now; state.frames++; state.fpsTimer += dt; if (state.fpsTimer >= 0.5) { state.fps = Math.round(state.frames / state.fpsTimer); state.frames = 0; state.fpsTimer = 0; if (hud.fps) hud.fps.textContent = state.fps; }
    try { update(dt); draw(); } catch (e) { showError(e); }
    requestAnimationFrame(loop);
  }

  function init() { resize(); bindControls(); streamWorld(); updateHud(); $('loading-screen')?.classList.add('hidden'); reward('NeonBlock City ready'); requestAnimationFrame(loop); }
  addEventListener('load', init);
})();
