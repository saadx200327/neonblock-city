(() => {
  'use strict';

  const GAME_VERSION = 'loop16-playability';
  const SAVE_PREFIX = 'neonblock-city:';
  const WORLD_CHUNK = 90;
  const STREAM_RADIUS = 2;
  const isSmallScreen = matchMedia('(max-width: 760px), (pointer: coarse)').matches;

  const $ = (id) => document.getElementById(id);
  const ui = {
    loading: $('loading-screen'), cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), vehicleHp: $('hud-vehicle-hp'), vehicleGas: $('hud-vehicle-gas'), mission: $('hud-mission'), reward: $('reward-popup'),
    pause: $('pause-overlay'), settings: $('settings-panel'), savePanel: $('save-panel'), missionBoard: $('mission-board'), missionList: $('mission-list'),
    debug: $('debug-overlay'), fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error'),
    mini: $('minimap-canvas'), joystick: $('joystick-container'), stick: $('joystick-stick'), exportJson: $('export-json')
  };

  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', online: false, paused: false,
    quality: localStorage.getItem(SAVE_PREFIX + 'quality') || 'auto', ownedLots: [], collectedPickups: [], completedMissions: [],
    mission: null, missionProgress: 0, lastSave: 0, lastError: 'none'
  };
  const player = { pos: new THREE.Vector3(0, 1.2, 0), vel: new THREE.Vector3(), yaw: 0, onGround: true, sprinting: false, inVehicle: null };
  const input = { f: 0, r: 0, jump: false, sprint: false, interact: false, lookX: 0, lookY: 0 };
  const keys = new Set();
  const streamed = new Map();
  const interactables = [];
  const vehicles = [];
  const pickups = [];
  const npcs = [];
  const lots = [];

  const missions = [
    { id: 'starter-delivery', name: 'Block Delivery', desc: 'Pick up 3 neon bolts around downtown.', type: 'pickup', goal: 3, reward: 180, xp: 60 },
    { id: 'taxi-loop', name: 'Taxi Loop', desc: 'Enter a car and drive through 3 route gates.', type: 'drive', goal: 3, reward: 240, xp: 90 },
    { id: 'land-owner', name: 'First Lot', desc: 'Buy one glowing ownership lot.', type: 'own', goal: 1, reward: 120, xp: 80 }
  ];

  if (!window.THREE) {
    fail('Three.js did not load. Check internet/CDN or vendor the library before deploying.');
    return;
  }

  const canvas = $('game-canvas');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a18);
  scene.fog = new THREE.Fog(0x070a18, 80, isSmallScreen ? 280 : 420);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSmallScreen, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isSmallScreen ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !isSmallScreen;

  const hemi = new THREE.HemisphereLight(0x87ceff, 0x161020, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(25, 45, 10);
  sun.castShadow = !isSmallScreen;
  scene.add(sun);

  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x26324c, roughness: 0.75 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x073b45 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x332100 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x2c1065, transparent: true, opacity: 0.55 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x0c6427 }),
    gate: new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x64142b, transparent: true, opacity: 0.72 })
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x07111f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.8), materials.player);
  body.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.85), materials.player);
  head.position.y = 1.9;
  playerMesh.add(body, head);
  scene.add(playerMesh);

  const waypoint = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 8, 32), materials.gate);
  waypoint.rotation.x = Math.PI / 2;
  waypoint.visible = false;
  scene.add(waypoint);

  function seeded(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16)) >>> 0) / 4294967295;
  }
  function chunkKey(cx, cz) { return cx + ',' + cz; }
  function playerChunk() { return [Math.floor(player.pos.x / WORLD_CHUNK), Math.floor(player.pos.z / WORLD_CHUNK)]; }

  function makeBox(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = !isSmallScreen;
    m.receiveShadow = true;
    return m;
  }

  function streamWorld() {
    const [pcx, pcz] = playerChunk();
    const wanted = new Set();
    for (let dx = -STREAM_RADIUS; dx <= STREAM_RADIUS; dx++) {
      for (let dz = -STREAM_RADIUS; dz <= STREAM_RADIUS; dz++) {
        const cx = pcx + dx, cz = pcz + dz, key = chunkKey(cx, cz);
        wanted.add(key);
        if (!streamed.has(key)) createChunk(cx, cz, key);
      }
    }
    for (const [key, group] of streamed) {
      if (!wanted.has(key)) {
        scene.remove(group);
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        streamed.delete(key);
      }
    }
  }

  function createChunk(cx, cz, key) {
    const group = new THREE.Group();
    const rand = seeded(key);
    const ox = cx * WORLD_CHUNK, oz = cz * WORLD_CHUNK;
    group.add(makeBox(WORLD_CHUNK, 0.08, 14, materials.road, ox + WORLD_CHUNK / 2, 0.02, oz + WORLD_CHUNK / 2));
    group.add(makeBox(14, 0.08, WORLD_CHUNK, materials.road, ox + WORLD_CHUNK / 2, 0.025, oz + WORLD_CHUNK / 2));
    group.add(makeBox(WORLD_CHUNK, 0.07, 4, materials.sidewalk, ox + WORLD_CHUNK / 2, 0.04, oz + 7));
    group.add(makeBox(4, 0.07, WORLD_CHUNK, materials.sidewalk, ox + 7, 0.04, oz + WORLD_CHUNK / 2));

    const count = isSmallScreen ? 5 : 8;
    for (let i = 0; i < count; i++) {
      const h = 5 + rand() * 24;
      const x = ox + 14 + rand() * (WORLD_CHUNK - 28);
      const z = oz + 14 + rand() * (WORLD_CHUNK - 28);
      if (Math.abs((x % WORLD_CHUNK) - WORLD_CHUNK / 2) < 12 || Math.abs((z % WORLD_CHUNK) - WORLD_CHUNK / 2) < 12) continue;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + rand() * 0.18, 0.55, 0.32), emissive: new THREE.Color().setHSL(0.55 + rand() * 0.18, 0.75, 0.08) });
      group.add(makeBox(8 + rand() * 12, h, 8 + rand() * 12, mat, x, h / 2, z));
    }

    if ((cx + cz) % 2 === 0) addPickup(group, key + ':p', ox + 20 + rand() * 50, oz + 20 + rand() * 50);
    if ((cx - cz) % 3 === 0) addLot(group, key + ':l', ox + 58, oz + 20, 100 + Math.abs(cx * 35 + cz * 45));
    if ((cx + cz) % 4 === 0) addVehicle(group, key + ':v', ox + 48, oz + 48);
    if ((cx * 7 + cz) % 5 === 0) addNpc(group, key + ':n', ox + 35, oz + 58);
    scene.add(group);
    streamed.set(key, group);
  }

  function addPickup(group, id, x, z) {
    if (state.collectedPickups.includes(id)) return;
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), materials.pickup);
    mesh.position.set(x, 1.6, z);
    group.add(mesh);
    pickups.push({ id, mesh, value: 25 });
  }
  function addVehicle(group, id, x, z) {
    if (vehicles.some(v => v.id === id)) return;
    const car = new THREE.Group();
    car.add(makeBox(4.2, 1.1, 6, new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x062f36 }), 0, 0.8, 0));
    car.add(makeBox(3, 0.7, 2.5, new THREE.MeshStandardMaterial({ color: 0x050814, roughness: 0.3 }), 0, 1.55, -0.4));
    car.position.set(x, 0, z);
    group.add(car);
    vehicles.push({ id, mesh: car, hp: 100, gas: 100, speed: 0 });
  }
  function addNpc(group, id, x, z) {
    if (npcs.some(n => n.id === id)) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), materials.npc);
    mesh.position.set(x, 0.9, z);
    group.add(mesh);
    npcs.push({ id, mesh, tip: 'Tip: Use E or Interact near cars, lots, and mission items.' });
  }
  function addLot(group, id, x, z, price) {
    if (lots.some(l => l.id === id)) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.12, 12), materials.lot);
    mesh.position.set(x, 0.08, z);
    group.add(mesh);
    lots.push({ id, mesh, price });
  }

  function chooseMission(id) {
    const m = missions.find(x => x.id === id) || missions.find(x => !state.completedMissions.includes(x.id)) || missions[0];
    state.mission = m.id; state.missionProgress = 0;
    showReward('Mission started: ' + m.name);
    updateHud();
  }
  function activeMission() { return missions.find(m => m.id === state.mission); }
  function addMissionProgress(type, amount = 1) {
    const m = activeMission();
    if (!m || m.type !== type || state.completedMissions.includes(m.id)) return;
    state.missionProgress = Math.min(m.goal, state.missionProgress + amount);
    if (state.missionProgress >= m.goal) {
      state.completedMissions.push(m.id);
      state.cash += m.reward; state.xp += m.xp; state.level = 1 + Math.floor(state.xp / 120);
      showReward('Mission complete: +' + m.reward + ' cash, +' + m.xp + ' XP');
      const next = missions.find(x => !state.completedMissions.includes(x.id));
      state.mission = next ? next.id : null; state.missionProgress = 0;
    }
    saveGame(false); updateHud();
  }

  function interact() {
    let nearest = null, best = 8;
    const origin = player.inVehicle ? player.inVehicle.mesh.position : player.pos;
    for (const v of vehicles) { const d = origin.distanceTo(v.mesh.position); if (d < best) nearest = { type: 'vehicle', item: v, d }, best = d; }
    for (const l of lots) { const d = origin.distanceTo(l.mesh.position); if (d < best) nearest = { type: 'lot', item: l, d }, best = d; }
    for (const n of npcs) { const d = origin.distanceTo(n.mesh.position); if (d < best) nearest = { type: 'npc', item: n, d }, best = d; }
    if (!nearest && player.inVehicle) { player.inVehicle = null; showReward('Exited vehicle'); return; }
    if (!nearest) { showReward('Nothing nearby'); return; }
    if (nearest.type === 'vehicle') {
      player.inVehicle = player.inVehicle === nearest.item ? null : nearest.item;
      showReward(player.inVehicle ? 'Entered vehicle' : 'Exited vehicle');
    } else if (nearest.type === 'lot') {
      if (state.ownedLots.includes(nearest.item.id)) showReward('You already own this lot');
      else if (state.cash >= nearest.item.price) { state.cash -= nearest.item.price; state.ownedLots.push(nearest.item.id); showReward('Lot purchased for $' + nearest.item.price); addMissionProgress('own'); }
      else showReward('Need $' + nearest.item.price + ' to buy this lot');
    } else showReward(nearest.item.tip);
    saveGame(false); updateHud();
  }

  function updateInput() {
    input.f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    input.r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.sprint;
  }

  function tick(dt) {
    updateInput();
    if (state.paused) return;
    if (input.interact) { input.interact = false; interact(); }
    if (player.inVehicle) moveVehicle(dt); else movePlayer(dt);
    collectPickups();
    streamWorld();
    updateCamera(dt); updateHud(); drawMinimap();
    if (performance.now() - state.lastSave > 12000) saveGame(false);
  }

  function movePlayer(dt) {
    const speed = input.sprint ? 10 : 6;
    const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const move = forward.multiplyScalar(input.f).add(right.multiplyScalar(input.r));
    if (move.lengthSq() > 1) move.normalize();
    player.vel.x = move.x * speed; player.vel.z = move.z * speed;
    if (input.jump && player.onGround) { player.vel.y = 8.5; player.onGround = false; input.jump = false; }
    player.vel.y -= 24 * dt;
    player.pos.addScaledVector(player.vel, dt);
    if (player.pos.y < 1.2) { player.pos.y = 1.2; player.vel.y = 0; player.onGround = true; }
    playerMesh.visible = true; playerMesh.position.copy(player.pos); playerMesh.rotation.y = player.yaw;
  }
  function moveVehicle(dt) {
    const v = player.inVehicle;
    v.speed += input.f * 20 * dt;
    v.speed *= 0.965;
    if (Math.abs(v.speed) > 0.3) v.mesh.rotation.y -= input.r * dt * Math.sign(v.speed) * 1.8;
    v.speed = THREE.MathUtils.clamp(v.speed, -12, 26);
    v.gas = Math.max(0, v.gas - Math.abs(v.speed) * dt * 0.04);
    if (v.gas <= 0) v.speed = 0;
    const dir = new THREE.Vector3(Math.sin(v.mesh.rotation.y), 0, Math.cos(v.mesh.rotation.y));
    v.mesh.position.addScaledVector(dir, v.speed * dt);
    player.pos.set(v.mesh.position.x, 1.2, v.mesh.position.z);
    player.yaw = v.mesh.rotation.y;
    playerMesh.visible = false;
    if (Math.abs(v.speed) > 12) addMissionProgress('drive', dt * 0.35);
  }
  function collectPickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.mesh.rotation.y += 0.05;
      if (player.pos.distanceTo(p.mesh.position) < 3) {
        state.cash += p.value; state.xp += 10; state.collectedPickups.push(p.id); p.mesh.visible = false; pickups.splice(i, 1);
        showReward('Picked up neon bolt +$' + p.value); addMissionProgress('pickup');
      }
    }
  }
  function updateCamera(dt) {
    player.yaw -= input.lookX * 0.004;
    input.lookX *= 0.5;
    const target = player.inVehicle ? player.inVehicle.mesh.position : player.pos;
    const behind = new THREE.Vector3(Math.sin(player.yaw + Math.PI), 0, Math.cos(player.yaw + Math.PI)).multiplyScalar(player.inVehicle ? 16 : 10);
    const desired = target.clone().add(behind).add(new THREE.Vector3(0, player.inVehicle ? 9 : 6, 0));
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(target.x, target.y + 2, target.z);
  }

  function updateHud() {
    ui.cash.textContent = '$' + Math.floor(state.cash); ui.xp.textContent = Math.floor(state.xp); ui.level.textContent = state.level; ui.wanted.textContent = state.wanted;
    ui.online.textContent = state.online ? 'cloud-ready' : 'offline'; ui.debugOnline.textContent = ui.online.textContent;
    const v = player.inVehicle; ui.vehicle.textContent = v ? 'Neon Cruiser' : 'On foot'; ui.vehicleHp.textContent = v ? Math.round(v.hp) : 100; ui.vehicleGas.textContent = v ? Math.round(v.gas) : 100;
    const m = activeMission(); ui.mission.textContent = m ? `${m.name} ${Math.floor(state.missionProgress)}/${m.goal}` : 'Free roam';
    ui.chunks.textContent = streamed.size; ui.npcs.textContent = npcs.length; ui.activeVehicle.textContent = v ? v.id : 'None'; ui.saveSlot.textContent = state.slot; ui.lastError.textContent = state.lastError;
    ui.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`;
    waypoint.visible = !!m; if (m) waypoint.position.set(player.pos.x + 20, 0.2, player.pos.z + 20);
  }
  function drawMinimap() {
    const ctx = ui.mini && ui.mini.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0,0,160,160); ctx.fillStyle = '#050814cc'; ctx.fillRect(0,0,160,160); ctx.strokeStyle = '#17f3ff66'; ctx.strokeRect(2,2,156,156);
    const px = player.pos.x, pz = player.pos.z;
    function dot(x,z,color,s=3){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(80+(x-px)/4,80+(z-pz)/4,s,0,Math.PI*2); ctx.fill(); }
    vehicles.forEach(v => dot(v.mesh.position.x, v.mesh.position.z, '#17f3ff', 3));
    lots.forEach(l => dot(l.mesh.position.x, l.mesh.position.z, state.ownedLots.includes(l.id) ? '#5ef38c' : '#7c3aed', 3));
    pickups.forEach(p => dot(p.mesh.position.x, p.mesh.position.z, '#5ef38c', 2));
    dot(px,pz,'#fff',4);
  }

  function savePayload() { return { version: GAME_VERSION, state, player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw } }; }
  async function saveGame(show = true) {
    state.lastSave = performance.now(); const payload = savePayload();
    localStorage.setItem(SAVE_PREFIX + state.slot, JSON.stringify(payload));
    if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(state.slot, payload); state.online = true; } catch (e) { state.online = false; state.lastError = 'cloud save optional: ' + e.message; } }
    if (show) showReward('Game saved');
  }
  async function loadGame(slot = state.slot) {
    let raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (!raw && window.NeonBlockCloud?.load) { try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); } catch (e) { state.lastError = e.message; } }
    if (!raw) { showReward('No save in ' + slot); return; }
    try {
      const data = JSON.parse(raw); Object.assign(state, data.state || {}); state.slot = slot;
      if (data.player) { player.pos.set(data.player.x || 0, data.player.y || 1.2, data.player.z || 0); player.yaw = data.player.yaw || 0; }
      showReward('Loaded ' + slot); updateHud(); streamWorld();
    } catch (e) { state.lastError = e.message; showReward('Save import failed'); }
  }

  function showReward(text) { ui.reward.textContent = text; ui.reward.classList.remove('hidden'); clearTimeout(showReward.t); showReward.t = setTimeout(() => ui.reward.classList.add('hidden'), 2400); }
  function fail(msg) { state.lastError = msg; if (ui.loading) ui.loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">' + msg + '</div>'; console.error(msg); }
  function openPause(open = true) { state.paused = open; ui.pause.classList.toggle('hidden', !open); }
  function buildMissionBoard() {
    ui.missionList.innerHTML = missions.map(m => `<li><button data-mission="${m.id}">${m.name}</button><p>${m.desc}</p></li>`).join('');
    ui.missionList.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { chooseMission(b.dataset.mission); ui.missionBoard.classList.add('hidden'); openPause(false); }));
  }

  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Escape') openPause(!state.paused); if (e.code === 'KeyE') input.interact = true; if (e.code === 'Space') input.jump = true; if (e.code === 'KeyM') { openPause(true); ui.missionBoard.classList.remove('hidden'); } if (e.code === 'F3') ui.debug.classList.toggle('debug-visible'); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('mousemove', (e) => { if (!state.paused && e.buttons === 1) input.lookX += e.movementX; });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(false); });

  function bindButton(id, down, up) { const b = $(id); if (!b) return; ['pointerdown','touchstart'].forEach(ev => b.addEventListener(ev, e => { e.preventDefault(); down(); })); ['pointerup','pointercancel','touchend'].forEach(ev => b.addEventListener(ev, e => { e.preventDefault(); (up || (()=>{}))(); })); }
  bindButton('btn-mobile-jump', () => input.jump = true);
  bindButton('btn-mobile-sprint', () => input.sprint = true, () => input.sprint = false);
  bindButton('btn-mobile-interact', () => input.interact = true);
  bindButton('btn-mobile-unstuck', () => { player.pos.y = 2; player.vel.set(0,0,0); if (player.inVehicle) player.inVehicle.mesh.position.y = 0; showReward('Unstuck'); });
  bindButton('btn-mobile-pause', () => openPause(true));
  bindButton('btn-resume', () => openPause(false));
  bindButton('btn-settings', () => ui.settings.classList.toggle('hidden'));
  bindButton('btn-close-settings', () => ui.settings.classList.add('hidden'));
  bindButton('btn-save', () => { ui.savePanel.classList.toggle('hidden'); });
  bindButton('btn-load', () => loadGame(state.slot));
  bindButton('btn-close-save', () => ui.savePanel.classList.add('hidden'));
  bindButton('btn-close-missions', () => ui.missionBoard.classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; saveGame(true); }));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot)));
  $('btn-export')?.addEventListener('click', () => { ui.exportJson.value = JSON.stringify(savePayload(), null, 2); });
  $('btn-import')?.addEventListener('click', () => { try { const data = JSON.parse(ui.exportJson.value); localStorage.setItem(SAVE_PREFIX + state.slot, JSON.stringify(data)); loadGame(state.slot); } catch { showReward('Invalid JSON'); } });
  $('graphics-quality')?.addEventListener('change', e => { state.quality = e.target.value; localStorage.setItem(SAVE_PREFIX + 'quality', state.quality); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, state.quality === 'low' ? 1 : isSmallScreen ? 1.25 : 1.75)); });

  let joyId = null, joyOrigin = null;
  ui.joystick?.addEventListener('pointerdown', e => { joyId = e.pointerId; joyOrigin = { x: e.clientX, y: e.clientY }; ui.joystick.setPointerCapture(joyId); });
  ui.joystick?.addEventListener('pointermove', e => { if (e.pointerId !== joyId || !joyOrigin) return; const dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y; const max = 42; const len = Math.min(max, Math.hypot(dx,dy)); const a = Math.atan2(dy,dx); input.r = Math.cos(a) * len / max; input.f = -Math.sin(a) * len / max; ui.stick.style.transform = `translate(${Math.cos(a)*len}px,${Math.sin(a)*len}px)`; });
  ui.joystick?.addEventListener('pointerup', () => { joyId = null; joyOrigin = null; input.f = 0; input.r = 0; ui.stick.style.transform = 'translate(0,0)'; });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch' && e.buttons) input.lookX += e.movementX || 0; });

  let last = performance.now(), fpsTime = last, frames = 0;
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++; if (now - fpsTime > 500) { ui.fps.textContent = Math.round(frames * 1000 / (now - fpsTime)); frames = 0; fpsTime = now; } tick(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }

  buildMissionBoard(); chooseMission(missions.find(m => !state.completedMissions.includes(m.id))?.id || missions[0].id); loadGame(state.slot).finally?.(() => {});
  streamWorld(); updateHud(); ui.loading?.classList.add('hidden'); requestAnimationFrame(loop);
})();
