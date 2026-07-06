(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'),
    activeVehicle: $('debug-active-vehicle'), slot: $('debug-save-slot'), onlineDebug: $('debug-online'), error: $('debug-last-error'),
    minimap: $('minimap-canvas'), arrow: $('waypoint-arrow'), reward: $('reward-popup')
  };

  if (!window.THREE) {
    loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load. Check internet/CDN or vendor the file locally.</div>';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a19);
  scene.fog = new THREE.Fog(0x070a19, 70, 235);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 650);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;

  scene.add(new THREE.HemisphereLight(0x88ccff, 0x15142c, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(35, 70, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x10152b, roughness: 0.86 }),
    road: new THREE.MeshStandardMaterial({ color: 0x090b16, roughness: 0.9 }),
    player: new THREE.MeshStandardMaterial({ color: 0x33e5ff, emissive: 0x0f7180, emissiveIntensity: 0.45 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffc857, emissive: 0x553700, emissiveIntensity: 0.25 }),
    cash: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x2ccf68, emissiveIntensity: 0.5 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x661022, emissiveIntensity: 0.3 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x1b1732, emissive: 0xffd447, emissiveIntensity: 0.18 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x14381f, emissive: 0x5ef38c, emissiveIntensity: 0.25 }),
    block: [0x151a3f, 0x24144a, 0x0d2d36, 0x2d2b12].map((c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: [0x172cff, 0xff24e5, 0x18f3ff, 0xffdc38][i], emissiveIntensity: 0.12, roughness: 0.55 }))
  };

  const state = {
    cash: 100, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false,
    player: { pos: new THREE.Vector3(0, 1.1, 0), velY: 0, yaw: 0, onGround: true },
    keys: new Set(), joystick: { x: 0, y: 0, active: false }, sprint: false,
    chunkSize: 72, chunkRadius: 2, chunks: new Map(), npcs: [], pickups: [], vehicles: [], lots: new Map(), activeVehicle: null,
    missions: [
      { id: 'courier', name: 'Neon Courier', goal: new THREE.Vector3(120, 0, -80), reward: 140, xp: 55, text: 'Reach the cyan waypoint.' },
      { id: 'collector', name: 'Block Collector', reward: 90, xp: 45, text: 'Collect 5 cash cubes.', need: 5 },
      { id: 'driver', name: 'Test Drive', reward: 170, xp: 75, text: 'Enter a vehicle and drive 250m.', need: 250 }
    ],
    mission: null, missionProgress: 0, lastSave: 0, cloud: null, clock: new THREE.Clock(), fpsTime: 0, frames: 0
  };

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.65, 0.7), mats.player);
  body.castShadow = true; body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.82), mats.player);
  head.castShadow = true; head.position.y = 2.1;
  player.add(body, head); scene.add(player);

  const waypoint = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4, 4), new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x17f3ff, emissiveIntensity: 0.85 }));
  waypoint.visible = false; waypoint.position.y = 3; scene.add(waypoint);

  const rand = (x, z, s = 1) => { const n = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const keyFor = (cx, cz) => `${cx},${cz}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function spawnPickup(x, z, group, chunk) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mats.cash);
    mesh.position.set(x, 0.8, z); mesh.castShadow = true; group.add(mesh);
    state.pickups.push({ mesh, chunk, value: 20 + Math.floor(rand(x, z, 1) * 45), taken: false });
  }
  function spawnVehicle(x, z, group, chunk) {
    const car = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.85, 5.2), mats.car); base.position.y = 0.55; base.castShadow = true; car.add(base);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.9, 2.4), mats.car); cabin.position.y = 1.25; cabin.castShadow = true; car.add(cabin);
    car.position.set(x, 0, z); group.add(car);
    state.vehicles.push({ mesh: car, chunk, gas: 100, hp: 100, yaw: rand(x, z, 3) * Math.PI * 2, speed: 0, driven: 0 });
  }
  function spawnNpc(x, z, group, chunk) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.7, 0.85), mats.npc);
    mesh.position.set(x, 0.85, z); mesh.castShadow = true; group.add(mesh);
    state.npcs.push({ mesh, chunk, home: new THREE.Vector3(x, 0.85, z), t: rand(x, z, 5) * 10 });
  }
  function spawnLot(x, z, group) {
    const price = 250 + Math.floor(rand(x, z, 6) * 500);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 0.16, 8), mats.lot);
    mesh.position.set(x, 0.08, z); group.add(mesh);
    const id = `${Math.round(x)}:${Math.round(z)}`;
    state.lots.set(id, { id, mesh, price, owned: false });
  }

  function addChunk(cx, cz) {
    const key = keyFor(cx, cz); if (state.chunks.has(key)) return;
    const group = new THREE.Group(); group.userData = { cx, cz };
    const x0 = cx * state.chunkSize, z0 = cz * state.chunkSize;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(state.chunkSize, 0.18, state.chunkSize), mats.ground);
    ground.position.set(x0, -0.1, z0); ground.receiveShadow = true; group.add(ground);
    for (let i = -1; i <= 1; i++) {
      const roadX = new THREE.Mesh(new THREE.BoxGeometry(8, 0.04, state.chunkSize), mats.road); roadX.position.set(x0 + i * 24, 0.02, z0); group.add(roadX);
      const roadZ = new THREE.Mesh(new THREE.BoxGeometry(state.chunkSize, 0.05, 8), mats.road); roadZ.position.set(x0, 0.025, z0 + i * 24); group.add(roadZ);
    }
    for (let i = 0; i < 9; i++) {
      const bx = x0 - 30 + rand(cx, cz, i) * 60, bz = z0 - 30 + rand(cx, cz, i + 20) * 60;
      if (Math.abs(bx % 24) < 7 || Math.abs(bz % 24) < 7) continue;
      const h = 6 + rand(cx, cz, i + 7) * 28;
      const b = new THREE.Mesh(new THREE.BoxGeometry(7 + rand(cx, cz, i + 9) * 5, h, 7 + rand(cx, cz, i + 11) * 5), mats.block[i % mats.block.length]);
      b.position.set(bx, h / 2, bz); b.castShadow = true; b.receiveShadow = true; group.add(b);
    }
    if (rand(cx, cz, 99) > 0.45) spawnPickup(x0 + rand(cx, cz, 88) * 50 - 25, z0 + rand(cx, cz, 89) * 50 - 25, group, key);
    if (rand(cx, cz, 44) > 0.62) spawnVehicle(x0 + rand(cx, cz, 45) * 44 - 22, z0 + rand(cx, cz, 46) * 44 - 22, group, key);
    if (rand(cx, cz, 66) > 0.58) spawnNpc(x0 + rand(cx, cz, 67) * 48 - 24, z0 + rand(cx, cz, 68) * 48 - 24, group, key);
    if (rand(cx, cz, 77) > 0.7) spawnLot(x0 + rand(cx, cz, 78) * 42 - 21, z0 + rand(cx, cz, 79) * 42 - 21, group);
    scene.add(group); state.chunks.set(key, group);
  }
  function removeChunk(key) {
    const group = state.chunks.get(key); if (!group) return;
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); scene.remove(group); state.chunks.delete(key);
    state.pickups = state.pickups.filter(p => p.chunk !== key);
    state.npcs = state.npcs.filter(n => n.chunk !== key);
    state.vehicles = state.vehicles.filter(v => v.chunk !== key || v === state.activeVehicle);
  }
  function streamWorld() {
    const cx = Math.round(state.player.pos.x / state.chunkSize), cz = Math.round(state.player.pos.z / state.chunkSize), keep = new Set();
    for (let x = cx - state.chunkRadius; x <= cx + state.chunkRadius; x++) for (let z = cz - state.chunkRadius; z <= cz + state.chunkRadius; z++) { keep.add(keyFor(x, z)); addChunk(x, z); }
    for (const key of [...state.chunks.keys()]) if (!keep.has(key)) removeChunk(key);
  }

  function inputVector() {
    let x = 0, z = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) z -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) z += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    x += state.joystick.x; z += state.joystick.y;
    const len = Math.hypot(x, z); return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }
  function updatePlayer(dt) {
    if (state.paused) return;
    const move = inputVector(), running = state.sprint || state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'), speed = running ? 22 : 13;
    if (state.activeVehicle) {
      const v = state.activeVehicle;
      v.speed += (-move.z * 26 - v.speed) * clamp(dt * 2.5, 0, 1);
      v.yaw -= move.x * dt * (v.speed >= 0 ? 1 : -1) * 1.8;
      if (v.gas > 0) {
        const dx = Math.sin(v.yaw) * v.speed * dt, dz = Math.cos(v.yaw) * v.speed * dt;
        v.mesh.position.x += dx; v.mesh.position.z += dz; v.driven += Math.hypot(dx, dz); v.gas = Math.max(0, v.gas - Math.abs(v.speed) * dt * 0.025);
      } else v.speed *= 0.96;
      v.mesh.rotation.y = v.yaw; state.player.pos.copy(v.mesh.position).add(new THREE.Vector3(0, 1.1, 0));
      if (state.mission?.id === 'driver') { state.missionProgress = Math.max(state.missionProgress, Math.floor(v.driven)); if (state.missionProgress >= state.mission.need) completeMission(); }
    } else {
      if (move.x || move.z) { state.player.yaw = Math.atan2(move.x, move.z); state.player.pos.x += move.x * speed * dt; state.player.pos.z += move.z * speed * dt; }
      state.player.velY -= 32 * dt; state.player.pos.y += state.player.velY * dt;
      if (state.player.pos.y <= 1.1) { state.player.pos.y = 1.1; state.player.velY = 0; state.player.onGround = true; }
    }
    player.position.copy(state.player.pos).add(new THREE.Vector3(0, -1.1, 0)); player.rotation.y = state.player.yaw;
  }
  function jump() { if (!state.activeVehicle && state.player.onGround) { state.player.velY = 13; state.player.onGround = false; } }
  function interact() {
    const p = state.player.pos;
    if (state.activeVehicle) { state.activeVehicle.mesh.position.copy(p).add(new THREE.Vector3(Math.sin(state.activeVehicle.yaw) * 4, 0, Math.cos(state.activeVehicle.yaw) * 4)); state.activeVehicle = null; popup('Exited vehicle'); return; }
    let nearest = null, dist = 999;
    for (const v of state.vehicles) { const d = v.mesh.position.distanceTo(p); if (d < dist) { nearest = v; dist = d; } }
    if (nearest && dist < 7) { state.activeVehicle = nearest; popup('Vehicle entered'); return; }
    for (const lot of state.lots.values()) {
      const d = lot.mesh.position.distanceTo(p);
      if (d < 7) {
        if (!lot.owned && state.cash >= lot.price) { state.cash -= lot.price; lot.owned = true; lot.mesh.material = mats.owned; popup(`Lot owned -$${lot.price}`); saveGame(); }
        else popup(lot.owned ? 'You own this lot' : `Lot costs $${lot.price}`);
        return;
      }
    }
    openMissionBoard();
  }
  function updateWorld(dt) {
    streamWorld();
    for (const p of state.pickups) if (!p.taken) {
      p.mesh.rotation.y += dt * 2.2; p.mesh.position.y = 0.8 + Math.sin(performance.now() * 0.003 + p.value) * 0.18;
      if (p.mesh.position.distanceTo(state.player.pos) < 2.4) { p.taken = true; p.mesh.visible = false; state.cash += p.value; state.xp += 8; if (state.mission?.id === 'collector') state.missionProgress++; popup(`+$${p.value}`); if (state.mission?.id === 'collector' && state.missionProgress >= state.mission.need) completeMission(); }
    }
    for (const n of state.npcs) { n.t += dt; n.mesh.position.x = n.home.x + Math.sin(n.t * 0.7) * 6; n.mesh.position.z = n.home.z + Math.cos(n.t * 0.5) * 6; n.mesh.rotation.y += dt; }
    if (state.mission?.id === 'courier') { waypoint.visible = true; waypoint.position.x = state.mission.goal.x; waypoint.position.z = state.mission.goal.z; waypoint.rotation.y += dt * 2; if (state.player.pos.distanceTo(state.mission.goal) < 6) completeMission(); } else waypoint.visible = false;
    state.level = Math.max(1, Math.floor(state.xp / 100) + 1);
  }
  function setMission(m) { state.mission = { ...m }; state.missionProgress = 0; popup(`Mission started: ${m.name}`); closeAllMenus(); }
  function completeMission() { const m = state.mission; if (!m) return; state.cash += m.reward; state.xp += m.xp; popup(`Mission complete: +$${m.reward} +${m.xp}XP`); state.mission = null; state.missionProgress = 0; saveGame(); }
  function updateCamera(dt) {
    const target = state.player.pos.clone(), back = state.activeVehicle ? 16 : 10, height = state.activeVehicle ? 10 : 7, yaw = state.activeVehicle ? state.activeVehicle.yaw : state.player.yaw;
    const desired = target.clone().add(new THREE.Vector3(-Math.sin(yaw) * back, height, -Math.cos(yaw) * back));
    camera.position.lerp(desired, clamp(dt * 5, 0, 1)); camera.lookAt(target.x, target.y + 1.4, target.z);
  }
  function drawMinimap() {
    const c = hud.minimap; if (!c) return; const ctx = c.getContext('2d'), px = state.player.pos.x, pz = state.player.pos.z;
    ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#071024'; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = '#17f3ff55';
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 20, 0); ctx.lineTo(i * 20, 160); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * 20); ctx.lineTo(160, i * 20); ctx.stroke(); }
    for (const v of state.vehicles) { const x = 80 + (v.mesh.position.x - px) * 0.35, y = 80 + (v.mesh.position.z - pz) * 0.35; if (x > 0 && x < 160 && y > 0 && y < 160) { ctx.fillStyle = '#ff3366'; ctx.fillRect(x - 2, y - 2, 4, 4); } }
    if (state.mission?.goal) { const x = 80 + (state.mission.goal.x - px) * 0.35, y = 80 + (state.mission.goal.z - pz) * 0.35; ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); hud.arrow.style.transform = `rotate(${Math.atan2(state.mission.goal.x - px, state.mission.goal.z - pz)}rad)`; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(80, 80, 4, 0, Math.PI * 2); ctx.fill();
  }
  function updateHud(dt) {
    state.frames++; state.fpsTime += dt; if (state.fpsTime > 0.5) { hud.fps.textContent = Math.round(state.frames / state.fpsTime); state.frames = 0; state.fpsTime = 0; }
    const online = state.cloud?.ready ? 'cloud-ready' : 'local'; hud.cash.textContent = `$${state.cash}`; hud.xp.textContent = state.xp; hud.level.textContent = state.level; hud.wanted.textContent = state.wanted; hud.online.textContent = online; hud.onlineDebug.textContent = online;
    hud.vehicle.textContent = state.activeVehicle ? 'Neon Runner' : 'On foot'; hud.hp.textContent = state.activeVehicle ? Math.round(state.activeVehicle.hp) : 100; hud.gas.textContent = state.activeVehicle ? Math.round(state.activeVehicle.gas) : 100;
    hud.mission.textContent = state.mission ? `${state.mission.name} ${state.mission.need ? `${state.missionProgress}/${state.mission.need}` : ''}` : 'None'; hud.pos.textContent = `${state.player.pos.x.toFixed(1)},${state.player.pos.y.toFixed(1)},${state.player.pos.z.toFixed(1)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = state.activeVehicle ? 'Neon Runner' : 'None'; hud.slot.textContent = state.slot; drawMinimap();
  }
  function savePayload() { return { version: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z, yaw: state.player.yaw }, lots: [...state.lots.values()].filter(l => l.owned).map(l => l.id), savedAt: new Date().toISOString() }; }
  async function saveGame(slot = state.slot) { try { const payload = savePayload(); localStorage.setItem(`neonblock:${slot}`, JSON.stringify(payload)); if (state.cloud?.save) await state.cloud.save(slot, payload); state.lastSave = performance.now(); popup('Game saved'); } catch (e) { hud.error.textContent = e.message || String(e); } }
  async function loadGame(slot = state.slot) { try { let raw = localStorage.getItem(`neonblock:${slot}`); if (!raw && state.cloud?.load) { const cloud = await state.cloud.load(slot); if (cloud) raw = JSON.stringify(cloud); } if (!raw) return; applySave(JSON.parse(raw)); } catch (e) { hud.error.textContent = e.message || String(e); } }
  function applySave(data) { state.cash = Number(data.cash || 100); state.xp = Number(data.xp || 0); state.level = Number(data.level || 1); state.wanted = Number(data.wanted || 0); if (data.player) { state.player.pos.set(data.player.x || 0, Math.max(1.1, data.player.y || 1.1), data.player.z || 0); state.player.yaw = data.player.yaw || 0; } const owned = new Set(data.lots || []); for (const lot of state.lots.values()) if (owned.has(lot.id)) { lot.owned = true; lot.mesh.material = mats.owned; } }
  function exportSave() { $('export-json').value = JSON.stringify(savePayload(), null, 2); }
  function importSave() { try { const txt = $('export-json').value.trim(); if (!txt) return popup('Paste save JSON first'); applySave(JSON.parse(txt)); saveGame(); popup('Imported save'); } catch (e) { hud.error.textContent = e.message || String(e); popup('Invalid JSON'); } }
  function popup(text) { hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(popup._t); popup._t = setTimeout(() => hud.reward.classList.add('hidden'), 1600); }
  function closeAllMenus() { $('pause-overlay').classList.add('hidden'); $('settings-panel').classList.add('hidden'); $('mission-board').classList.add('hidden'); $('save-panel').classList.add('hidden'); state.paused = false; }
  function togglePause(force) { state.paused = typeof force === 'boolean' ? force : !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }
  function openMissionBoard() { const list = $('mission-list'); list.innerHTML = ''; for (const m of state.missions) { const li = document.createElement('li'), btn = document.createElement('button'); btn.textContent = `${m.name} — ${m.text} ($${m.reward}, ${m.xp}XP)`; btn.onclick = () => setMission(m); li.appendChild(btn); list.appendChild(li); } togglePause(true); $('mission-board').classList.remove('hidden'); }
  function unstuck() { state.activeVehicle = null; state.player.pos.y = 1.1; state.player.velY = 0; popup('Unstuck'); }
  function bindControls() {
    addEventListener('keydown', e => { state.keys.add(e.code); if (e.code === 'Space') jump(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyM') openMissionBoard(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyR') unstuck(); });
    addEventListener('keyup', e => state.keys.delete(e.code));
    const down = (id, fn) => { const el = $(id); if (!el) return; el.addEventListener('pointerdown', e => { e.preventDefault(); fn(true); }); el.addEventListener('pointerup', e => { e.preventDefault(); fn(false); }); el.addEventListener('pointercancel', e => { e.preventDefault(); fn(false); }); };
    down('btn-mobile-jump', p => { if (p) jump(); }); down('btn-mobile-sprint', p => { state.sprint = p; }); down('btn-mobile-interact', p => { if (p) interact(); }); down('btn-mobile-unstuck', p => { if (p) unstuck(); }); down('btn-mobile-pause', p => { if (p) togglePause(); });
    const joy = $('joystick-container'), stick = $('joystick-stick');
    const resetJoy = () => { state.joystick = { x: 0, y: 0, active: false }; stick.style.transform = 'translate(0,0)'; };
    function handleJoy(e) { if (!state.joystick.active) return; const r = joy.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), max = r.width * 0.36, len = Math.min(max, Math.hypot(dx, dy)), a = Math.atan2(dy, dx), sx = Math.cos(a) * len, sy = Math.sin(a) * len; state.joystick.x = sx / max; state.joystick.y = sy / max; stick.style.transform = `translate(${sx}px,${sy}px)`; }
    joy.addEventListener('pointerdown', e => { e.preventDefault(); joy.setPointerCapture(e.pointerId); state.joystick.active = true; handleJoy(e); }); joy.addEventListener('pointermove', handleJoy); joy.addEventListener('pointerup', resetJoy); joy.addEventListener('pointercancel', resetJoy);
    $('btn-resume').onclick = closeAllMenus; $('btn-settings').onclick = () => $('settings-panel').classList.toggle('hidden'); $('btn-close-settings').onclick = () => $('settings-panel').classList.add('hidden'); $('btn-save').onclick = () => $('save-panel').classList.remove('hidden'); $('btn-load').onclick = () => loadGame(); $('btn-close-save').onclick = () => $('save-panel').classList.add('hidden'); $('btn-export').onclick = exportSave; $('btn-import').onclick = importSave; $('btn-close-missions').onclick = () => $('mission-board').classList.add('hidden');
    document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { state.slot = b.dataset.slot; saveGame(state.slot); }); document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => { state.slot = b.dataset.slot; loadGame(state.slot); });
    $('graphics-quality').onchange = e => { const q = e.target.value, ratio = q === 'low' ? 1 : q === 'high' ? Math.min(devicePixelRatio || 1, 2) : Math.min(devicePixelRatio || 1, 1.6); renderer.setPixelRatio(ratio); popup(`Graphics: ${q}`); };
  }
  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  async function initCloud() { try { if (window.NeonBlockCloud) { state.cloud = window.NeonBlockCloud; await state.cloud.init?.(); } } catch (e) { state.cloud = null; hud.error.textContent = e.message || String(e); } }
  function loop() { requestAnimationFrame(loop); const dt = Math.min(0.05, state.clock.getDelta()); updatePlayer(dt); updateWorld(dt); updateCamera(dt); updateHud(dt); if (performance.now() - state.lastSave > 30000) saveGame(state.slot); renderer.render(scene, camera); }
  async function start() { bindControls(); addEventListener('resize', resize); streamWorld(); await initCloud(); await loadGame(state.slot); loading?.classList.add('hidden'); popup('WASD/joystick to move, E to interact, M missions'); loop(); }
  start();
})();
