(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const hud = {
    cash: document.getElementById('hud-cash'), xp: document.getElementById('hud-xp'), level: document.getElementById('hud-level'),
    wanted: document.getElementById('hud-wanted'), online: document.getElementById('hud-online'), vehicle: document.getElementById('hud-vehicle'),
    vehicleHp: document.getElementById('hud-vehicle-hp'), vehicleGas: document.getElementById('hud-vehicle-gas'), mission: document.getElementById('hud-mission'),
    fps: document.getElementById('debug-fps'), pos: document.getElementById('debug-pos'), chunks: document.getElementById('debug-chunks'),
    npcs: document.getElementById('debug-npcs'), activeVehicle: document.getElementById('debug-active-vehicle'), saveSlot: document.getElementById('debug-save-slot'),
    debugOnline: document.getElementById('debug-online'), lastError: document.getElementById('debug-last-error')
  };
  const pauseOverlay = document.getElementById('pause-overlay');
  const loading = document.getElementById('loading-screen');
  const savePanel = document.getElementById('save-panel');
  const settingsPanel = document.getElementById('settings-panel');
  const rewardPopup = document.getElementById('reward-popup');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimap = minimapCanvas.getContext('2d');

  const THREE_REF = window.THREE;
  if (!THREE_REF) {
    loading.querySelector('.loading-sub').textContent = 'Three.js failed to load. Check connection.';
    return;
  }

  const scene = new THREE_REF.Scene();
  scene.background = new THREE_REF.Color(0x070a18);
  scene.fog = new THREE_REF.Fog(0x070a18, 80, 260);
  const camera = new THREE_REF.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 600);
  const renderer = new THREE_REF.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);

  const sun = new THREE_REF.DirectionalLight(0x99ccff, 1.7); sun.position.set(30, 60, 20); scene.add(sun);
  scene.add(new THREE_REF.HemisphereLight(0x2233ff, 0x09060e, 1.5));

  const materials = {
    road: new THREE_REF.MeshStandardMaterial({ color: 0x10131f, roughness: 0.8 }),
    grass: new THREE_REF.MeshStandardMaterial({ color: 0x06180f, roughness: 0.9 }),
    player: new THREE_REF.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x075a66 }),
    car: new THREE_REF.MeshStandardMaterial({ color: 0xff3df2, emissive: 0x4b0b44 }),
    crate: new THREE_REF.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x103a20 }),
    lot: new THREE_REF.MeshStandardMaterial({ color: 0xffd166, emissive: 0x4a3512 }),
    npc: new THREE_REF.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222244 })
  };

  const player = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.2, 2.2, 1.2), materials.player);
  player.position.set(0, 1.1, 0); scene.add(player);

  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, slot: 'slot1', activeVehicle: null, paused: false, lastSave: 0,
    mission: { id: 'starter', title: 'Collect 3 neon crates', progress: 0, goal: 3, reward: 300, xp: 120 },
    ownedLots: {}, pos: player.position, velocityY: 0, grounded: true, chunks: new Map(), vehicles: [], crates: [], npcs: []
  };
  const keys = new Set();
  const controls = { joyX: 0, joyY: 0, sprint: false };
  const chunkSize = 48;
  const renderRadius = 2;
  let last = performance.now(), fpsTime = 0, frames = 0;

  function showReward(text) {
    rewardPopup.textContent = text;
    rewardPopup.classList.remove('hidden');
    clearTimeout(showReward.t);
    showReward.t = setTimeout(() => rewardPopup.classList.add('hidden'), 1800);
  }
  function setError(error) { if (hud.lastError) hud.lastError.textContent = error ? String(error).slice(0, 80) : 'none'; }
  function chunkKey(x, z) { return `${x},${z}`; }
  function makeBox(w, h, d, mat, x, y, z) { const m = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); return m; }

  function spawnChunk(cx, cz) {
    const group = new THREE_REF.Group(); group.userData.cx = cx; group.userData.cz = cz; scene.add(group);
    const baseX = cx * chunkSize, baseZ = cz * chunkSize;
    const ground = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(chunkSize, 0.2, chunkSize), materials.grass);
    ground.position.set(baseX, -0.1, baseZ); group.add(ground);
    const roadA = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(8, 0.24, chunkSize), materials.road); roadA.position.set(baseX, 0.02, baseZ); group.add(roadA);
    const roadB = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(chunkSize, 0.25, 8), materials.road); roadB.position.set(baseX, 0.03, baseZ); group.add(roadB);

    for (let i = 0; i < 5; i++) {
      const bx = baseX + ((i * 13 + cx * 7) % 38) - 19;
      const bz = baseZ + ((i * 17 + cz * 11) % 38) - 19;
      if (Math.abs(bx - baseX) < 6 || Math.abs(bz - baseZ) < 6) continue;
      const h = 5 + Math.abs((cx * 3 + cz * 5 + i * 7) % 18);
      const mat = new THREE_REF.MeshStandardMaterial({ color: new THREE_REF.Color().setHSL(((i + cx + cz) % 8) / 8, 0.6, 0.42), emissive: 0x080820, roughness: 0.55 });
      const b = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(5, h, 5), mat); b.position.set(bx, h / 2, bz); group.add(b);
    }
    if ((cx + cz) % 2 === 0) {
      const crate = makeBox(1.6, 1.6, 1.6, materials.crate, baseX + 13, 0.8, baseZ - 12); crate.userData.type = 'crate'; crate.userData.chunk = group; state.crates.push(crate); group.add(crate);
    }
    if ((cx * 9 + cz * 4) % 5 === 0) {
      const car = makeBox(2.3, 1, 3.6, materials.car, baseX - 10, 0.55, baseZ + 8); car.userData = { type: 'vehicle', hp: 100, gas: 100, name: 'Neon Kart' }; state.vehicles.push(car); group.add(car);
    }
    if ((cx - cz) % 4 === 0) {
      const lot = makeBox(6, 0.35, 6, materials.lot, baseX + 16, 0.18, baseZ + 16); lot.userData = { type: 'lot', id: chunkKey(cx, cz), price: 500 }; group.add(lot);
    }
    if ((cx + cz) % 3 === 0) {
      const npc = makeBox(1, 2, 1, materials.npc, baseX - 15, 1, baseZ - 15); npc.userData = { type: 'npc', tip: 'Tip: crates, lots, and cars save locally.' }; state.npcs.push(npc); group.add(npc);
    }
    state.chunks.set(chunkKey(cx, cz), group);
  }
  function streamWorld() {
    const pcx = Math.round(player.position.x / chunkSize), pcz = Math.round(player.position.z / chunkSize);
    for (let x = pcx - renderRadius; x <= pcx + renderRadius; x++) for (let z = pcz - renderRadius; z <= pcz + renderRadius; z++) if (!state.chunks.has(chunkKey(x, z))) spawnChunk(x, z);
    for (const [key, group] of [...state.chunks]) {
      if (Math.abs(group.userData.cx - pcx) > renderRadius + 1 || Math.abs(group.userData.cz - pcz) > renderRadius + 1) {
        scene.remove(group); state.chunks.delete(key);
        state.crates = state.crates.filter(o => o.userData.chunk !== group); state.vehicles = state.vehicles.filter(o => o.parent !== group); state.npcs = state.npcs.filter(o => o.parent !== group);
      }
    }
  }

  function save(slot = state.slot) {
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, ownedLots: state.ownedLots, pos: player.position.toArray(), mission: state.mission };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data)); state.lastSave = performance.now(); showReward('Saved');
    window.NeonBlockCloud?.save?.(slot, data).catch(setError);
  }
  async function load(slot = state.slot) {
    let raw = localStorage.getItem(`neonblock:${slot}`);
    if (!raw && window.NeonBlockCloud?.load) { const cloud = await window.NeonBlockCloud.load(slot).catch(setError); if (cloud) raw = JSON.stringify(cloud); }
    if (!raw) return showReward('No save in slot');
    const data = JSON.parse(raw); Object.assign(state, { cash: data.cash ?? 250, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, ownedLots: data.ownedLots ?? {}, mission: data.mission ?? state.mission });
    if (Array.isArray(data.pos)) player.position.fromArray(data.pos); showReward('Loaded'); updateHud();
  }
  function addProgress() {
    state.mission.progress++;
    state.cash += 60; state.xp += 35;
    if (state.mission.progress >= state.mission.goal) { state.cash += state.mission.reward; state.xp += state.mission.xp; state.mission = { id: 'driver', title: 'Buy a city lot', progress: 0, goal: 1, reward: 650, xp: 180 }; showReward('Mission complete'); }
    state.level = Math.max(1, Math.floor(state.xp / 250) + 1);
  }
  function interact() {
    const near = [...state.crates, ...state.vehicles, ...state.npcs];
    let closest = null, dist = 5;
    for (const o of near) { const d = o.position.distanceTo(player.position); if (d < dist) { closest = o; dist = d; } }
    if (closest?.userData.type === 'crate') { closest.visible = false; state.crates = state.crates.filter(c => c !== closest); addProgress(); showReward('Crate collected +$60'); }
    else if (closest?.userData.type === 'vehicle') { state.activeVehicle = state.activeVehicle === closest ? null : closest; showReward(state.activeVehicle ? 'Entered vehicle' : 'Exited vehicle'); }
    else if (closest?.userData.type === 'npc') showReward(closest.userData.tip);
    for (const group of state.chunks.values()) for (const lot of group.children.filter(c => c.userData.type === 'lot')) if (lot.position.distanceTo(player.position) < 5) {
      if (state.ownedLots[lot.userData.id]) return showReward('Lot already owned');
      if (state.cash < lot.userData.price) return showReward('Need $500');
      state.cash -= lot.userData.price; state.ownedLots[lot.userData.id] = true; if (state.mission.id === 'driver') { state.mission.progress = 1; state.cash += state.mission.reward; state.xp += state.mission.xp; showReward('Lot bought + mission complete'); } return;
    }
  }

  function update(dt) {
    if (state.paused) return;
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - controls.joyY;
    const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + controls.joyX;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || controls.sprint;
    const speed = (state.activeVehicle ? 20 : sprint ? 10 : 6) * dt;
    if (forward || side) {
      const angle = Math.atan2(side, forward);
      player.position.x += Math.sin(angle) * speed; player.position.z += Math.cos(angle) * speed;
      player.rotation.y = angle;
      if (state.activeVehicle) { state.activeVehicle.position.copy(player.position).add(new THREE_REF.Vector3(0, -0.45, 0)); state.activeVehicle.rotation.y = angle; state.activeVehicle.userData.gas = Math.max(0, state.activeVehicle.userData.gas - dt * 2); }
    }
    if ((keys.has('Space')) && state.grounded) { state.velocityY = 8; state.grounded = false; }
    state.velocityY -= 20 * dt; player.position.y += state.velocityY * dt;
    if (player.position.y <= 1.1) { player.position.y = 1.1; state.velocityY = 0; state.grounded = true; }
    if (player.position.y < -10) player.position.set(0, 1.1, 0);
    streamWorld();
    camera.position.lerp(new THREE_REF.Vector3(player.position.x - 12, player.position.y + 13, player.position.z - 16), 0.08);
    camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
    if (performance.now() - state.lastSave > 30000) save(state.slot);
  }
  function updateHud() {
    hud.cash.textContent = `$${state.cash}`; hud.xp.textContent = state.xp; hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.vehicle.textContent = state.activeVehicle ? state.activeVehicle.userData.name : 'On foot'; hud.vehicleHp.textContent = state.activeVehicle?.userData.hp ?? 100; hud.vehicleGas.textContent = Math.round(state.activeVehicle?.userData.gas ?? 100);
    hud.mission.textContent = `${state.mission.title} ${state.mission.progress}/${state.mission.goal}`; hud.online.textContent = window.NeonBlockCloud?.enabled ? 'cloud optional' : 'offline'; hud.debugOnline.textContent = hud.online.textContent;
    hud.pos.textContent = `${player.position.x.toFixed(1)},${player.position.y.toFixed(1)},${player.position.z.toFixed(1)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = hud.vehicle.textContent; hud.saveSlot.textContent = state.slot;
  }
  function drawMinimap() {
    minimap.clearRect(0, 0, 160, 160); minimap.fillStyle = '#060915'; minimap.fillRect(0, 0, 160, 160); minimap.strokeStyle = '#17f3ff55'; minimap.strokeRect(4, 4, 152, 152);
    minimap.fillStyle = '#17f3ff'; minimap.fillRect(78, 78, 4, 4);
    minimap.fillStyle = '#5ef38c'; for (const c of state.crates) minimap.fillRect(80 + (c.position.x - player.position.x) / 3, 80 + (c.position.z - player.position.z) / 3, 3, 3);
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++; fpsTime += dt;
    update(dt); updateHud(); drawMinimap(); renderer.render(scene, camera);
    if (fpsTime > 1) { hud.fps.textContent = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
    requestAnimationFrame(loop);
  }

  addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyR') player.position.set(0, 1.1, 0); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  function togglePause(force) { state.paused = typeof force === 'boolean' ? force : !state.paused; pauseOverlay.classList.toggle('hidden', !state.paused); }
  document.getElementById('btn-resume').onclick = () => togglePause(false);
  document.getElementById('btn-mobile-pause').onclick = () => togglePause();
  document.getElementById('btn-mobile-interact').onclick = interact;
  document.getElementById('btn-mobile-unstuck').onclick = () => player.position.set(0, 1.1, 0);
  document.getElementById('btn-mobile-jump').onclick = () => { if (state.grounded) { state.velocityY = 8; state.grounded = false; } };
  document.getElementById('btn-mobile-sprint').ontouchstart = () => controls.sprint = true; document.getElementById('btn-mobile-sprint').ontouchend = () => controls.sprint = false;
  document.getElementById('btn-settings').onclick = () => settingsPanel.classList.toggle('hidden'); document.getElementById('btn-close-settings').onclick = () => settingsPanel.classList.add('hidden');
  document.getElementById('btn-save').onclick = () => savePanel.classList.toggle('hidden'); document.getElementById('btn-load').onclick = () => load(state.slot); document.getElementById('btn-close-save').onclick = () => savePanel.classList.add('hidden');
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { state.slot = b.dataset.slot; save(state.slot); });
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => { state.slot = b.dataset.slot; load(state.slot); });
  document.getElementById('btn-export').onclick = () => document.getElementById('export-json').value = localStorage.getItem(`neonblock:${state.slot}`) || '';
  document.getElementById('btn-import').onclick = () => { localStorage.setItem(`neonblock:${state.slot}`, document.getElementById('export-json').value); load(state.slot); };

  const joy = document.getElementById('joystick-container'), stick = document.getElementById('joystick-stick');
  joy.addEventListener('pointermove', e => { if (!e.pressure && e.pointerType !== 'mouse') return; const r = joy.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; const m = Math.max(1, Math.hypot(x, y)); controls.joyX = Math.max(-1, Math.min(1, x / 44)); controls.joyY = Math.max(-1, Math.min(1, y / 44)); stick.style.transform = `translate(${Math.min(44, m) * x / m}px,${Math.min(44, m) * y / m}px)`; joy.setPointerCapture(e.pointerId); });
  joy.addEventListener('pointerup', () => { controls.joyX = controls.joyY = 0; stick.style.transform = ''; }); joy.addEventListener('pointercancel', () => { controls.joyX = controls.joyY = 0; stick.style.transform = ''; });

  togglePause(false); streamWorld(); load(state.slot).catch(setError); loading.classList.add('hidden'); requestAnimationFrame(loop);
})();
