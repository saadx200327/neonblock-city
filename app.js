/* NeonBlock City - original block-style browser game.
   Static-first, Netlify/PWA ready, optional cloud saves through window.NeonCloud. */
(function () {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: text('hud-cash'), xp: text('hud-xp'), level: text('hud-level'), wanted: text('hud-wanted'), online: text('hud-online'),
    vehicle: text('hud-vehicle'), vehicleHp: text('hud-vehicle-hp'), vehicleGas: text('hud-vehicle-gas'), mission: text('hud-mission'),
    fps: text('debug-fps'), pos: text('debug-pos'), chunks: text('debug-chunks'), npcs: text('debug-npcs'), activeVehicle: text('debug-active-vehicle'), saveSlot: text('debug-save-slot'), debugOnline: text('debug-online'), lastError: text('debug-last-error'),
    reward: document.getElementById('reward-popup'), minimap: document.getElementById('minimap-canvas'), waypoint: document.getElementById('waypoint-arrow')
  };

  if (!window.THREE) {
    showFatal('Three.js failed to load. Check internet connection or vendor the library locally.');
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.FogExp2(0x050814, 0.012);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  const clock = new THREE.Clock();
  const world = new THREE.Group();
  scene.add(world);

  const sun = new THREE.DirectionalLight(0xb8f7ff, 1.15);
  sun.position.set(60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x17f3ff, 0x101020, 1.8));

  const mats = {
    road: mat(0x161a25), roadLine: mat(0x56f5ff), grass: mat(0x0b442f), sidewalk: mat(0x252b3d), player: mat(0x17f3ff),
    car: mat(0xff4fd8), taxi: mat(0xffd447), owned: mat(0x5ef38c), locked: mat(0xff3366), npc: mat(0xf7f9ff), pickup: mat(0x58ff9a), mission: mat(0xffa94f)
  };

  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, saveSlot: 'slot1', quality: localStorage.getItem('nb_quality') || 'auto',
    position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), yaw: 0, onGround: true, activeVehicle: null,
    chunks: new Map(), vehicles: new Map(), pickups: new Map(), npcs: new Map(), ownedLots: new Set(JSON.parse(localStorage.getItem('nb_owned_lots') || '[]')),
    mission: null, missionProgress: 0, lastAutosave: 0, lastHud: 0, lastFrame: performance.now(), fps: 0, lastError: 'none'
  };

  const player = makePlayer();
  scene.add(player.root);

  const controls = {
    keys: Object.create(null), pointer: { active: false, x: 0, y: 0 }, joystick: { active: false, id: null, x: 0, y: 0 },
    jump: false, sprint: false, interact: false
  };

  const missions = [
    { id: 'courier', title: 'Neon Courier', goal: 'Collect 5 green data cubes', target: 5, rewardCash: 180, rewardXp: 60 },
    { id: 'driver', title: 'Block Taxi', goal: 'Drive through 3 orange beacons', target: 3, rewardCash: 260, rewardXp: 90 },
    { id: 'owner', title: 'First Property', goal: 'Buy any lot', target: 1, rewardCash: 100, rewardXp: 80 }
  ];

  initInput();
  initMenus();
  resize();
  window.addEventListener('resize', resize);
  loadGame('autosave', true);
  startMission('courier');
  loading.classList.add('hidden');
  requestAnimationFrame(loop);

  function loop(now) {
    const dt = Math.min(clock.getDelta(), 0.045);
    const fpsDt = Math.max(1, now - state.lastFrame);
    state.fps = Math.round(1000 / fpsDt);
    state.lastFrame = now;

    streamWorldAround(state.position);
    updatePlayer(dt);
    updateVehicles(dt);
    updateNPCs(dt);
    updateCamera(dt);
    updateMission(dt);
    if (now - state.lastHud > 150) { updateHud(); state.lastHud = now; }
    if (now - state.lastAutosave > 15000) { saveGame('autosave'); state.lastAutosave = now; }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function updatePlayer(dt) {
    const input = readMoveInput();
    const inVehicle = state.activeVehicle && state.vehicles.get(state.activeVehicle);
    if (inVehicle) {
      driveVehicle(inVehicle, input, dt);
      const exit = wasInteractPressed();
      if (exit) exitVehicle(inVehicle);
      state.position.copy(inVehicle.mesh.position).add(new THREE.Vector3(0, 1, 0));
      player.root.position.copy(state.position);
      player.root.visible = false;
      return;
    }

    player.root.visible = true;
    const speed = controls.sprint || controls.keys.ShiftLeft || controls.keys.ShiftRight ? 11 : 7;
    const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const desired = new THREE.Vector3().addScaledVector(forward, input.y).addScaledVector(right, input.x);
    if (desired.lengthSq() > 0.001) desired.normalize().multiplyScalar(speed);
    state.velocity.x = THREE.MathUtils.lerp(state.velocity.x, desired.x, 1 - Math.pow(0.001, dt));
    state.velocity.z = THREE.MathUtils.lerp(state.velocity.z, desired.z, 1 - Math.pow(0.001, dt));
    state.velocity.y -= 28 * dt;
    if ((controls.jump || controls.keys.Space) && state.onGround) { state.velocity.y = 12; state.onGround = false; }
    controls.jump = false;
    state.position.addScaledVector(state.velocity, dt);
    if (state.position.y < 1) { state.position.y = 1; state.velocity.y = 0; state.onGround = true; }
    player.root.position.copy(state.position);
    player.root.rotation.y = Math.atan2(state.velocity.x, state.velocity.z || 0.0001);

    collectNearby();
    if (wasInteractPressed()) interactNearby();
  }

  function driveVehicle(vehicle, input, dt) {
    const accel = input.y * vehicle.accel * dt;
    vehicle.speed = THREE.MathUtils.clamp(vehicle.speed + accel, -vehicle.maxSpeed * 0.45, vehicle.maxSpeed);
    vehicle.speed *= Math.pow(0.965, dt * 60);
    if (Math.abs(input.x) > 0.05 && Math.abs(vehicle.speed) > 0.3) vehicle.yaw += input.x * dt * 2.4 * Math.sign(vehicle.speed);
    vehicle.mesh.rotation.y = vehicle.yaw;
    vehicle.mesh.position.x += Math.sin(vehicle.yaw) * vehicle.speed * dt;
    vehicle.mesh.position.z += Math.cos(vehicle.yaw) * vehicle.speed * dt;
    vehicle.gas = Math.max(0, vehicle.gas - Math.abs(vehicle.speed) * dt * 0.06);
    if (vehicle.gas <= 0) vehicle.speed *= 0.88;
  }

  function updateVehicles(dt) {
    state.vehicles.forEach(v => {
      if (v.id !== state.activeVehicle) {
        v.mesh.rotation.y = v.yaw;
        if (v.ai) {
          v.speed = THREE.MathUtils.lerp(v.speed, 5, dt);
          v.mesh.position.x += Math.sin(v.yaw) * v.speed * dt;
          v.mesh.position.z += Math.cos(v.yaw) * v.speed * dt;
          if (Math.abs(v.mesh.position.x % 96) < 0.4 || Math.abs(v.mesh.position.z % 96) < 0.4) v.yaw += (hash(v.id) % 2 ? 1 : -1) * dt * 0.25;
        }
      }
    });
  }

  function updateNPCs(dt) {
    state.npcs.forEach(n => {
      n.t += dt;
      n.mesh.position.x += Math.sin(n.t + n.seed) * dt * 0.8;
      n.mesh.position.z += Math.cos(n.t * 0.7 + n.seed) * dt * 0.8;
      n.mesh.rotation.y += dt;
    });
  }

  function updateCamera(dt) {
    const target = state.activeVehicle ? state.vehicles.get(state.activeVehicle).mesh.position : state.position;
    const back = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).multiplyScalar(-12);
    const desired = target.clone().add(back).add(new THREE.Vector3(0, state.activeVehicle ? 8 : 6, 0));
    camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
    camera.lookAt(target.x, target.y + 2, target.z);
  }

  function streamWorldAround(pos) {
    const chunkSize = 64;
    const cx = Math.floor(pos.x / chunkSize);
    const cz = Math.floor(pos.z / chunkSize);
    const radius = qualityRadius();
    const needed = new Set();
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        const key = x + ',' + z;
        needed.add(key);
        if (!state.chunks.has(key)) buildChunk(x, z, chunkSize, key);
      }
    }
    state.chunks.forEach((chunk, key) => {
      if (!needed.has(key)) {
        world.remove(chunk.group);
        chunk.dispose.forEach(obj => obj.geometry && obj.geometry.dispose());
        state.chunks.delete(key);
      }
    });
  }

  function buildChunk(cx, cz, size, key) {
    const group = new THREE.Group();
    const dispose = [];
    const ox = cx * size, oz = cz * size;
    const floor = box(size, 0.12, size, mats.grass); floor.position.set(ox + size / 2, -0.06, oz + size / 2); group.add(floor); dispose.push(floor);
    const roadX = box(size, 0.04, 9, mats.road); roadX.position.set(ox + size / 2, 0.02, oz + size / 2); group.add(roadX); dispose.push(roadX);
    const roadZ = box(9, 0.04, size, mats.road); roadZ.position.set(ox + size / 2, 0.03, oz + size / 2); group.add(roadZ); dispose.push(roadZ);
    const lineX = box(size, 0.05, 0.35, mats.roadLine); lineX.position.set(ox + size / 2, 0.07, oz + size / 2); group.add(lineX); dispose.push(lineX);
    const lineZ = box(0.35, 0.05, size, mats.roadLine); lineZ.position.set(ox + size / 2, 0.08, oz + size / 2); group.add(lineZ); dispose.push(lineZ);

    for (let i = 0; i < 5; i++) {
      const seed = hash(key + ':b:' + i);
      const bx = ox + 8 + (seed % 48);
      const bz = oz + 8 + ((seed >> 8) % 48);
      if (Math.abs((bx - ox) - size / 2) < 8 || Math.abs((bz - oz) - size / 2) < 8) continue;
      const h = 8 + (seed % 30);
      const b = box(6 + (seed % 7), h, 6 + ((seed >> 4) % 8), mat(0x101832 + (seed % 0x222222)));
      b.position.set(bx, h / 2, bz); b.castShadow = true; b.receiveShadow = true; group.add(b); dispose.push(b);
      const glow = box(b.geometry.parameters.width * 0.85, 0.4, 0.25, mats.roadLine); glow.position.set(bx, h * 0.72, bz + b.geometry.parameters.depth / 2 + 0.02); group.add(glow); dispose.push(glow);
    }

    const lotId = 'lot-' + key;
    const owned = state.ownedLots.has(lotId);
    const lot = box(12, 0.12, 12, owned ? mats.owned : mats.locked); lot.position.set(ox + 12, 0.1, oz + 12); lot.userData = { type: 'lot', id: lotId, price: 250 + Math.abs(cx + cz) * 15 }; group.add(lot); dispose.push(lot);

    if (!state.vehicles.has('car-' + key) && Math.abs(cx) + Math.abs(cz) < 16) addVehicle('car-' + key, ox + size / 2 + 9, oz + size / 2 + 2, hash(key) % 2 ? 0 : Math.PI / 2, key);
    if (!state.pickups.has('pickup-' + key)) addPickup('pickup-' + key, ox + 50, oz + 16, key);
    if (!state.npcs.has('npc-' + key) && (hash(key) % 3 === 0)) addNPC('npc-' + key, ox + 18, oz + 48, key);

    world.add(group);
    state.chunks.set(key, { group, dispose });
  }

  function addVehicle(id, x, z, yaw, key) {
    const mesh = new THREE.Group();
    const body = box(4.2, 1.1, 7, hash(id) % 2 ? mats.car : mats.taxi); body.position.y = 1.1; body.castShadow = true; mesh.add(body);
    const cabin = box(3.4, 1.1, 3.2, mat(0x2cf8ff)); cabin.position.set(0, 2.1, -0.6); mesh.add(cabin);
    mesh.position.set(x, 0, z); mesh.rotation.y = yaw; world.add(mesh);
    state.vehicles.set(id, { id, key, mesh, yaw, speed: 0, maxSpeed: 26, accel: 32, hp: 100, gas: 100, ai: hash(id) % 4 === 0 });
  }

  function addPickup(id, x, z, key) {
    const mesh = box(1.4, 1.4, 1.4, mats.pickup); mesh.position.set(x, 1.2, z); mesh.userData = { type: 'pickup' }; world.add(mesh);
    state.pickups.set(id, { id, key, mesh, value: 25, xp: 10 });
  }

  function addNPC(id, x, z, key) {
    const mesh = box(1.6, 3.2, 1.2, mats.npc); mesh.position.set(x, 1.6, z); world.add(mesh);
    state.npcs.set(id, { id, key, mesh, t: 0, seed: hash(id) });
  }

  function collectNearby() {
    state.pickups.forEach((p, id) => {
      if (p.mesh.position.distanceTo(state.position) < 2.2) {
        world.remove(p.mesh); state.pickups.delete(id); state.cash += p.value; addXp(p.xp); reward('+$' + p.value + ' data cube');
        if (state.mission && state.mission.id === 'courier') state.missionProgress++;
      }
    });
  }

  function interactNearby() {
    let nearestVehicle = null, dv = 999;
    state.vehicles.forEach(v => { const d = v.mesh.position.distanceTo(state.position); if (d < dv) { dv = d; nearestVehicle = v; } });
    if (nearestVehicle && dv < 6) { enterVehicle(nearestVehicle); return; }
    let bought = false;
    state.chunks.forEach(c => c.group.children.forEach(obj => {
      if (!obj.userData || obj.userData.type !== 'lot' || bought) return;
      if (obj.position.distanceTo(state.position) < 8) {
        if (state.ownedLots.has(obj.userData.id)) return reward('Lot already owned');
        if (state.cash < obj.userData.price) return reward('Need $' + obj.userData.price + ' to buy lot');
        state.cash -= obj.userData.price; state.ownedLots.add(obj.userData.id); obj.material = mats.owned; bought = true; reward('Bought city lot');
        if (state.mission && state.mission.id === 'owner') state.missionProgress = 1;
      }
    }));
    if (!bought) openMissionBoard();
  }

  function enterVehicle(v) { state.activeVehicle = v.id; v.ai = false; reward('Entered vehicle - Interact to exit'); }
  function exitVehicle(v) { state.activeVehicle = null; state.position.copy(v.mesh.position).add(new THREE.Vector3(4, 1, 0)); player.root.position.copy(state.position); reward('Exited vehicle'); }

  function updateMission() {
    if (!state.mission) return;
    if (state.mission.id === 'driver' && state.activeVehicle) {
      const p = state.vehicles.get(state.activeVehicle).mesh.position;
      if (Math.abs((p.x + p.z) % 80) < 0.7) state.missionProgress = Math.min(state.mission.target, state.missionProgress + 1);
    }
    if (state.missionProgress >= state.mission.target) {
      state.cash += state.mission.rewardCash; addXp(state.mission.rewardXp); reward('Mission complete: ' + state.mission.title);
      const next = missions[(missions.findIndex(m => m.id === state.mission.id) + 1) % missions.length];
      startMission(next.id);
    }
  }

  function startMission(id) { state.mission = missions.find(m => m.id === id) || missions[0]; state.missionProgress = 0; }
  function addXp(xp) { state.xp += xp; while (state.xp >= state.level * 100) { state.xp -= state.level * 100; state.level++; reward('Level ' + state.level); } }

  function updateHud() {
    hud.cash('$' + Math.round(state.cash)); hud.xp(Math.round(state.xp)); hud.level(state.level); hud.wanted(state.wanted);
    const online = window.NeonCloud && window.NeonCloud.available ? 'cloud-ready' : 'offline'; hud.online(online); hud.debugOnline(online);
    const v = state.activeVehicle && state.vehicles.get(state.activeVehicle);
    hud.vehicle(v ? 'Neon Cruiser' : 'On foot'); hud.vehicleHp(v ? Math.round(v.hp) : 100); hud.vehicleGas(v ? Math.round(v.gas) : 100);
    hud.mission(state.mission ? state.mission.title + ' ' + state.missionProgress + '/' + state.mission.target : 'None');
    hud.fps(state.fps); hud.pos(state.position.x.toFixed(0) + ',' + state.position.y.toFixed(0) + ',' + state.position.z.toFixed(0)); hud.chunks(state.chunks.size); hud.npcs(state.npcs.size); hud.activeVehicle(v ? v.id : 'None'); hud.saveSlot(state.saveSlot); hud.lastError(state.lastError);
    drawMinimap();
  }

  function drawMinimap() {
    const ctx = hud.minimap && hud.minimap.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#050814'; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = '#17f3ff55'; ctx.strokeRect(0, 0, 160, 160);
    ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(80, 80, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff4fd8'; state.vehicles.forEach(v => { const dx = (v.mesh.position.x - state.position.x) * 0.25, dz = (v.mesh.position.z - state.position.z) * 0.25; if (Math.abs(dx) < 78 && Math.abs(dz) < 78) ctx.fillRect(80 + dx - 2, 80 + dz - 2, 4, 4); });
    ctx.fillStyle = '#5ef38c'; state.pickups.forEach(p => { const dx = (p.mesh.position.x - state.position.x) * 0.25, dz = (p.mesh.position.z - state.position.z) * 0.25; if (Math.abs(dx) < 78 && Math.abs(dz) < 78) ctx.fillRect(80 + dx - 1, 80 + dz - 1, 2, 2); });
  }

  function initInput() {
    window.addEventListener('keydown', e => { controls.keys[e.code] = true; if (e.code === 'Escape') togglePause(); if (e.code === 'KeyE') controls.interact = true; if (e.code === 'KeyR') unstuck(); });
    window.addEventListener('keyup', e => { controls.keys[e.code] = false; });
    window.addEventListener('pointermove', e => { if (document.pointerLockElement === canvas) state.yaw -= e.movementX * 0.0025; });
    canvas.addEventListener('click', () => canvas.requestPointerLock && canvas.requestPointerLock());
    const joy = document.getElementById('joystick-container'), stick = document.getElementById('joystick-stick');
    if (joy && stick) {
      joy.addEventListener('pointerdown', e => { controls.joystick.active = true; controls.joystick.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
      joy.addEventListener('pointermove', moveJoy);
      joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
    }
    bindBtn('btn-mobile-jump', () => controls.jump = true);
    bindBtn('btn-mobile-sprint', () => controls.sprint = true, () => controls.sprint = false);
    bindBtn('btn-mobile-interact', () => controls.interact = true);
    bindBtn('btn-mobile-unstuck', unstuck);
    bindBtn('btn-mobile-pause', togglePause);

    function moveJoy(e) {
      if (!controls.joystick.active || e.pointerId !== controls.joystick.id) return;
      const rect = joy.getBoundingClientRect(); const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy; const max = rect.width * 0.36; const len = Math.min(max, Math.hypot(dx, dy)); const ang = Math.atan2(dy, dx);
      controls.joystick.x = Math.cos(ang) * len / max; controls.joystick.y = -Math.sin(ang) * len / max;
      stick.style.transform = 'translate(' + (Math.cos(ang) * len) + 'px,' + (Math.sin(ang) * len) + 'px)';
      e.preventDefault();
    }
    function endJoy(e) { if (e.pointerId !== controls.joystick.id) return; controls.joystick.active = false; controls.joystick.x = 0; controls.joystick.y = 0; stick.style.transform = 'translate(0,0)'; }
  }

  function readMoveInput() {
    let x = 0, y = 0;
    if (controls.keys.KeyW || controls.keys.ArrowUp) y += 1;
    if (controls.keys.KeyS || controls.keys.ArrowDown) y -= 1;
    if (controls.keys.KeyA || controls.keys.ArrowLeft) x -= 1;
    if (controls.keys.KeyD || controls.keys.ArrowRight) x += 1;
    x += controls.joystick.x; y += controls.joystick.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  function wasInteractPressed() { const v = controls.interact; controls.interact = false; return v; }
  function bindBtn(id, down, up) { const el = document.getElementById(id); if (!el) return; el.addEventListener('pointerdown', e => { e.preventDefault(); down(); }); if (up) { el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); } }
  function unstuck() { state.position.set(Math.round(state.position.x / 8) * 8, 4, Math.round(state.position.z / 8) * 8); state.velocity.set(0, 0, 0); reward('Unstuck'); }

  function initMenus() {
    id('btn-resume', togglePause); id('btn-settings', () => show('settings-panel')); id('btn-close-settings', () => hide('settings-panel'));
    id('btn-save', () => show('save-panel')); id('btn-load', () => show('save-panel')); id('btn-close-save', () => hide('save-panel'));
    id('btn-close-missions', () => hide('mission-board'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => saveGame(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    id('btn-export', exportSave); id('btn-import', importSave);
    const q = document.getElementById('graphics-quality'); if (q) { q.value = state.quality; q.addEventListener('change', () => { state.quality = q.value; localStorage.setItem('nb_quality', q.value); }); }
  }
  function openMissionBoard() { const list = document.getElementById('mission-list'); if (list) { list.innerHTML = ''; missions.forEach(m => { const li = document.createElement('li'); const btn = document.createElement('button'); btn.textContent = m.title + ' - ' + m.goal; btn.onclick = () => { startMission(m.id); hide('mission-board'); reward('Mission started'); }; li.appendChild(btn); list.appendChild(li); }); } show('mission-board'); show('pause-overlay'); }
  function togglePause() { document.getElementById('pause-overlay').classList.toggle('hidden'); }
  function show(idName) { const el = document.getElementById(idName); if (el) el.classList.remove('hidden'); }
  function hide(idName) { const el = document.getElementById(idName); if (el) el.classList.add('hidden'); }
  function id(idName, fn) { const el = document.getElementById(idName); if (el) el.addEventListener('click', fn); }

  function snapshot() { return { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, pos: state.position.toArray(), yaw: state.yaw, ownedLots: Array.from(state.ownedLots), mission: state.mission && state.mission.id, missionProgress: state.missionProgress }; }
  function applySnapshot(s) { if (!s) return; state.cash = +s.cash || 120; state.xp = +s.xp || 0; state.level = +s.level || 1; state.wanted = +s.wanted || 0; if (Array.isArray(s.pos)) state.position.fromArray(s.pos); state.yaw = +s.yaw || 0; state.ownedLots = new Set(s.ownedLots || []); startMission(s.mission || 'courier'); state.missionProgress = +s.missionProgress || 0; localStorage.setItem('nb_owned_lots', JSON.stringify(Array.from(state.ownedLots))); }
  function saveGame(slot) { try { state.saveSlot = slot || state.saveSlot; const data = snapshot(); localStorage.setItem('nb_' + state.saveSlot, JSON.stringify(data)); if (window.NeonCloud && window.NeonCloud.save) window.NeonCloud.save(state.saveSlot, data).catch(setErr); reward('Saved ' + state.saveSlot); } catch (e) { setErr(e); } }
  function loadGame(slot, silent) { try { state.saveSlot = slot || state.saveSlot; const raw = localStorage.getItem('nb_' + state.saveSlot); if (raw) applySnapshot(JSON.parse(raw)); if (!silent) reward('Loaded ' + state.saveSlot); } catch (e) { setErr(e); } }
  function exportSave() { const out = document.getElementById('export-json'); if (out) out.value = JSON.stringify(snapshot(), null, 2); }
  function importSave() { try { const out = document.getElementById('export-json'); applySnapshot(JSON.parse(out.value)); saveGame(state.saveSlot); reward('Imported save'); } catch (e) { setErr(e); reward('Import failed'); } }

  function makePlayer() { const root = new THREE.Group(); const body = box(1.4, 2, 0.8, mats.player); body.position.y = 1.7; const head = box(1, 1, 1, mat(0xffd2a6)); head.position.y = 3.2; root.add(body, head); return { root }; }
  function box(w, h, d, material) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.receiveShadow = true; return m; }
  function mat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, emissive: new THREE.Color(color).multiplyScalar(0.08) }); }
  function hash(str) { let h = 2166136261; for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function qualityRadius() { if (state.quality === 'low') return 1; if (state.quality === 'high') return 3; return state.fps && state.fps < 38 ? 1 : 2; }
  function text(idName) { const el = document.getElementById(idName); return value => { if (el) el.textContent = value; }; }
  function reward(msg) { if (!hud.reward) return; hud.reward.textContent = msg; hud.reward.classList.remove('hidden'); clearTimeout(reward.timer); reward.timer = setTimeout(() => hud.reward.classList.add('hidden'), 1700); }
  function setErr(e) { state.lastError = (e && e.message) || String(e); console.warn(e); }
  function showFatal(msg) { if (loading) loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">' + msg + '</div>'; }
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
})();
