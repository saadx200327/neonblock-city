(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), onlineDebug: $('debug-online'), lastError: $('debug-last-error')
  };

  const loading = $('loading-screen');
  const pauseOverlay = $('pause-overlay');
  const settingsPanel = $('settings-panel');
  const missionBoard = $('mission-board');
  const missionList = $('mission-list');
  const savePanel = $('save-panel');
  const exportJson = $('export-json');
  const rewardPopup = $('reward-popup');
  const joystickBase = $('joystick-base');
  const joystickStick = $('joystick-stick');
  const minimapCanvas = $('minimap-canvas');
  const minimap = minimapCanvas ? minimapCanvas.getContext('2d') : null;

  const CONFIG = {
    chunkSize: 96,
    streamRadius: 2,
    worldLimit: 960,
    gravity: 34,
    walkSpeed: 20,
    sprintSpeed: 32,
    jumpPower: 15,
    vehicleSpeed: 58,
    vehicleReverse: 28,
    turnSpeed: 2.7,
    saveKey: 'neonblock-city-save-',
    defaultSlot: 'slot1'
  };

  const state = {
    cash: 80, xp: 0, level: 1, wanted: 0,
    saveSlot: CONFIG.defaultSlot,
    paused: false,
    lastError: 'none',
    online: 'offline',
    player: { x: 0, y: 3, z: 0, vy: 0, yaw: 0, grounded: false, inVehicle: null },
    input: { forward: 0, right: 0, sprint: false, jump: false, interact: false, unstuck: false },
    joystick: { active: false, x: 0, y: 0, id: null },
    chunks: new Map(),
    interactables: [],
    vehicles: [],
    npcs: [],
    lots: [],
    pickups: [],
    activeMission: null,
    completedMissions: {},
    ownedLots: {},
    quality: 'auto'
  };

  if (!window.THREE) {
    setError('Three.js failed to load');
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071022);
  scene.fog = new THREE.Fog(0x071022, 80, 420);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 1200);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen() ? 1.35 : 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !isSmallScreen();

  const hemi = new THREE.HemisphereLight(0x8fdfff, 0x071022, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(60, 90, 40);
  sun.castShadow = !isSmallScreen();
  scene.add(sun);

  const mats = {
    ground: new THREE.MeshLambertMaterial({ color: 0x11172d }),
    road: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    player: new THREE.MeshLambertMaterial({ color: 0x19f3ff }),
    car: new THREE.MeshLambertMaterial({ color: 0xff2fb2 }),
    crate: new THREE.MeshLambertMaterial({ color: 0x5ef38c }),
    npc: new THREE.MeshLambertMaterial({ color: 0xffdd55 }),
    lot: new THREE.MeshLambertMaterial({ color: 0x3f60ff, transparent: true, opacity: 0.45 }),
    ownedLot: new THREE.MeshLambertMaterial({ color: 0x5ef38c, transparent: true, opacity: 0.55 })
  };

  const playerMesh = makeAvatar();
  scene.add(playerMesh);

  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsFrames = 0, fpsLast = performance.now();

  const missions = [
    { id: 'crate_run', name: 'Crate Run', text: 'Collect 5 glowing crates.', target: 5, rewardCash: 180, rewardXp: 65 },
    { id: 'cab_shift', name: 'Cab Shift', text: 'Enter a vehicle and drive through 3 waypoint rings.', target: 3, rewardCash: 260, rewardXp: 95 },
    { id: 'property_flip', name: 'Property Flip', text: 'Buy any city lot.', target: 1, rewardCash: 120, rewardXp: 80 }
  ];

  initUI();
  loadGame(CONFIG.defaultSlot, true);
  ensureWorldAround();
  hideLoading();
  requestAnimationFrame(loop);

  function makeAvatar() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1.2), mats.player);
    body.position.y = 2.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), new THREE.MeshLambertMaterial({ color: 0xf6c38f }));
    head.position.y = 4.55;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1), new THREE.MeshLambertMaterial({ color: 0x3157ff }));
    legs.position.y = 0.9;
    group.add(body, head, legs);
    return group;
  }

  function makeCar(x, z, hue = 0xff2fb2) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 8), new THREE.MeshLambertMaterial({ color: hue }));
    body.position.y = 1.2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.5, 3.2), new THREE.MeshLambertMaterial({ color: 0x99f4ff }));
    cabin.position.set(0, 2.3, -0.8);
    group.add(body, cabin);
    group.userData = { type: 'vehicle', hp: 100, gas: 100, name: 'Neon Cruiser', yaw: 0 };
    scene.add(group);
    state.vehicles.push(group);
    state.interactables.push(group);
    return group;
  }

  function seeded(cx, cz, salt = 0) {
    const s = Math.sin(cx * 127.1 + cz * 311.7 + salt * 19.19) * 43758.5453;
    return s - Math.floor(s);
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function ensureWorldAround() {
    const pcx = Math.floor(state.player.x / CONFIG.chunkSize);
    const pcz = Math.floor(state.player.z / CONFIG.chunkSize);
    for (let cx = pcx - CONFIG.streamRadius; cx <= pcx + CONFIG.streamRadius; cx++) {
      for (let cz = pcz - CONFIG.streamRadius; cz <= pcz + CONFIG.streamRadius; cz++) {
        const key = chunkKey(cx, cz);
        if (!state.chunks.has(key)) createChunk(cx, cz);
      }
    }
    for (const [key, chunk] of state.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > CONFIG.streamRadius + 1 || Math.abs(cz - pcz) > CONFIG.streamRadius + 1) unloadChunk(key, chunk);
    }
  }

  function createChunk(cx, cz) {
    const group = new THREE.Group();
    group.position.set(cx * CONFIG.chunkSize, 0, cz * CONFIG.chunkSize);
    group.userData.items = [];

    const ground = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.chunkSize, 0.5, CONFIG.chunkSize), mats.ground);
    ground.position.y = -0.25;
    group.add(ground);

    const roadX = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.chunkSize, 0.08, 12), mats.road);
    roadX.position.y = 0.03;
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, CONFIG.chunkSize), mats.road);
    roadZ.position.y = 0.04;
    group.add(roadX, roadZ);

    const buildingCount = 3 + Math.floor(seeded(cx, cz, 1) * 5);
    for (let i = 0; i < buildingCount; i++) {
      const bx = (seeded(cx, cz, i + 2) - 0.5) * 78;
      const bz = (seeded(cx, cz, i + 12) - 0.5) * 78;
      if (Math.abs(bx) < 12 || Math.abs(bz) < 12) continue;
      const h = 8 + seeded(cx, cz, i + 22) * 32;
      const b = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.56 + seeded(cx, cz, i) * 0.18, 0.55, 0.22) }));
      b.position.set(bx, h / 2, bz);
      group.add(b);
    }

    scene.add(group);
    state.chunks.set(chunkKey(cx, cz), group);

    if (seeded(cx, cz, 44) > 0.55) addPickup(group, cx, cz);
    if (seeded(cx, cz, 55) > 0.68) addNpc(group, cx, cz);
    if (seeded(cx, cz, 66) > 0.72) addLot(group, cx, cz);
    if (seeded(cx, cz, 77) > 0.78) makeCar(cx * CONFIG.chunkSize + 18, cz * CONFIG.chunkSize - 18, seeded(cx, cz, 78) > 0.5 ? 0xff2fb2 : 0x33ffcc);
  }

  function unloadChunk(key, chunk) {
    const items = chunk.userData.items || [];
    for (const item of items) removeFromWorldLists(item);
    scene.remove(chunk);
    chunk.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && !Object.values(mats).includes(obj.material)) obj.material.dispose();
    });
    state.chunks.delete(key);
  }

  function addPickup(group, cx, cz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), mats.crate);
    mesh.position.set((seeded(cx, cz, 91) - 0.5) * 70, 1.6, (seeded(cx, cz, 92) - 0.5) * 70);
    mesh.userData = { type: 'pickup', value: 35, xp: 12, chunk: group };
    group.add(mesh);
    group.userData.items.push(mesh);
    state.pickups.push(mesh);
  }

  function addNpc(group, cx, cz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4, 1.6), mats.npc);
    mesh.position.set((seeded(cx, cz, 101) - 0.5) * 66, 2, (seeded(cx, cz, 102) - 0.5) * 66);
    mesh.userData = { type: 'npc', tip: ['Mission board has quick cash.', 'Cars save time, but watch gas.', 'Buy lots to own the city.'][Math.floor(seeded(cx, cz, 103) * 3)] };
    group.add(mesh);
    group.userData.items.push(mesh);
    state.npcs.push(mesh);
    state.interactables.push(mesh);
  }

  function addLot(group, cx, cz) {
    const id = `lot_${cx}_${cz}`;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(18, 0.25, 18), state.ownedLots[id] ? mats.ownedLot : mats.lot);
    mesh.position.set(28, 0.15, 28);
    mesh.userData = { type: 'lot', id, price: 220 + Math.abs(cx * 13 + cz * 17) % 280 };
    group.add(mesh);
    group.userData.items.push(mesh);
    state.lots.push(mesh);
    state.interactables.push(mesh);
  }

  function removeFromWorldLists(item) {
    for (const arr of [state.pickups, state.npcs, state.lots, state.interactables]) {
      const idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (state.input.unstuck) unstuck();
    const vehicle = state.player.inVehicle;
    if (vehicle) updateVehicle(dt, vehicle); else updatePlayer(dt);
    collectNearbyPickups();
    ensureWorldAround();
    updateMissionProgressPassive();
    updateHud(dt);
    autosaveTick();
  }

  function updatePlayer(dt) {
    const speed = state.input.sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
    const forward = state.input.forward;
    const right = state.input.right;
    if (Math.abs(forward) + Math.abs(right) > 0.02) {
      const camYaw = Math.atan2(camera.position.x - state.player.x, camera.position.z - state.player.z) + Math.PI;
      const sx = Math.sin(camYaw) * forward + Math.sin(camYaw + Math.PI / 2) * right;
      const sz = Math.cos(camYaw) * forward + Math.cos(camYaw + Math.PI / 2) * right;
      const len = Math.hypot(sx, sz) || 1;
      state.player.x += (sx / len) * speed * dt;
      state.player.z += (sz / len) * speed * dt;
      state.player.yaw = Math.atan2(sx, sz);
    }
    if (state.input.jump && state.player.grounded) {
      state.player.vy = CONFIG.jumpPower;
      state.player.grounded = false;
    }
    state.player.vy -= CONFIG.gravity * dt;
    state.player.y += state.player.vy * dt;
    if (state.player.y <= 0) {
      state.player.y = 0;
      state.player.vy = 0;
      state.player.grounded = true;
    }
    clampPlayer();
    playerMesh.visible = true;
    playerMesh.position.set(state.player.x, state.player.y, state.player.z);
    playerMesh.rotation.y = state.player.yaw;
  }

  function updateVehicle(dt, vehicle) {
    const data = vehicle.userData;
    const gasFactor = data.gas > 0 ? 1 : 0.22;
    const accel = state.input.forward >= 0 ? CONFIG.vehicleSpeed : CONFIG.vehicleReverse;
    data.yaw += -state.input.right * CONFIG.turnSpeed * dt * Math.max(0.25, Math.abs(state.input.forward));
    const move = state.input.forward * accel * gasFactor * dt;
    vehicle.position.x += Math.sin(data.yaw) * move;
    vehicle.position.z += Math.cos(data.yaw) * move;
    vehicle.rotation.y = data.yaw;
    if (Math.abs(move) > 0.1 && data.gas > 0) data.gas = Math.max(0, data.gas - Math.abs(move) * 0.012);
    state.player.x = vehicle.position.x;
    state.player.y = 0;
    state.player.z = vehicle.position.z;
    clampPlayer();
    vehicle.position.x = state.player.x;
    vehicle.position.z = state.player.z;
    playerMesh.visible = false;
  }

  function clampPlayer() {
    state.player.x = Math.max(-CONFIG.worldLimit, Math.min(CONFIG.worldLimit, state.player.x));
    state.player.z = Math.max(-CONFIG.worldLimit, Math.min(CONFIG.worldLimit, state.player.z));
  }

  function collectNearbyPickups() {
    const px = state.player.x, pz = state.player.z;
    for (const pickup of [...state.pickups]) {
      const wx = pickup.parent.position.x + pickup.position.x;
      const wz = pickup.parent.position.z + pickup.position.z;
      pickup.rotation.y += 0.04;
      if (dist2(px, pz, wx, wz) < 25) {
        state.cash += pickup.userData.value;
        addXp(pickup.userData.xp);
        progressMission('crate_run', 1);
        popup(`+$${pickup.userData.value} crate`);
        pickup.parent.remove(pickup);
        removeFromWorldLists(pickup);
      }
    }
  }

  function interact() {
    const px = state.player.x, pz = state.player.z;
    let nearest = null, best = 80;
    for (const item of state.interactables) {
      let wx = item.position.x, wz = item.position.z;
      if (item.parent && item.parent !== scene) { wx += item.parent.position.x; wz += item.parent.position.z; }
      const d = dist2(px, pz, wx, wz);
      if (d < best) { best = d; nearest = item; }
    }
    if (!nearest) { popup('Nothing nearby'); return; }
    if (nearest.userData.type === 'vehicle') {
      if (state.player.inVehicle === nearest) exitVehicle(); else enterVehicle(nearest);
    } else if (nearest.userData.type === 'npc') {
      popup(nearest.userData.tip || 'Stay neon.');
    } else if (nearest.userData.type === 'lot') {
      buyLot(nearest);
    }
  }

  function enterVehicle(vehicle) {
    state.player.inVehicle = vehicle;
    vehicle.userData.yaw = vehicle.rotation.y || 0;
    popup('Entered Neon Cruiser');
    progressMission('cab_shift', 1);
  }

  function exitVehicle() {
    const v = state.player.inVehicle;
    state.player.inVehicle = null;
    state.player.x += Math.sin((v.userData.yaw || 0) + Math.PI / 2) * 6;
    state.player.z += Math.cos((v.userData.yaw || 0) + Math.PI / 2) * 6;
    playerMesh.visible = true;
    popup('Exited vehicle');
  }

  function buyLot(lot) {
    const id = lot.userData.id;
    if (state.ownedLots[id]) { popup('You already own this lot'); return; }
    if (state.cash < lot.userData.price) { popup(`Need $${lot.userData.price} to buy this lot`); return; }
    state.cash -= lot.userData.price;
    state.ownedLots[id] = true;
    lot.material = mats.ownedLot;
    addXp(40);
    progressMission('property_flip', 1);
    popup(`Bought lot for $${lot.userData.price}`);
  }

  function updateMissionProgressPassive() {
    if (state.activeMission && state.activeMission.id === 'cab_shift' && state.player.inVehicle) {
      const v = state.player.inVehicle;
      const cx = Math.round(v.position.x / 120), cz = Math.round(v.position.z / 120);
      const key = `${cx},${cz}`;
      state.activeMission.visited = state.activeMission.visited || {};
      if (!state.activeMission.visited[key]) {
        state.activeMission.visited[key] = true;
        progressMission('cab_shift', 1);
      }
    }
  }

  function startMission(id) {
    const def = missions.find(m => m.id === id);
    if (!def) return;
    if (state.completedMissions[id]) { popup('Mission already completed'); return; }
    state.activeMission = { ...def, progress: 0, visited: {} };
    state.paused = false;
    hideMenus();
    popup(`Mission: ${def.name}`);
  }

  function progressMission(id, amount) {
    if (!state.activeMission || state.activeMission.id !== id) return;
    state.activeMission.progress = Math.min(state.activeMission.target, state.activeMission.progress + amount);
    if (state.activeMission.progress >= state.activeMission.target) {
      state.cash += state.activeMission.rewardCash;
      addXp(state.activeMission.rewardXp);
      state.completedMissions[id] = true;
      popup(`Mission complete: +$${state.activeMission.rewardCash}`);
      state.activeMission = null;
    }
  }

  function addXp(amount) {
    state.xp += amount;
    const need = state.level * 100;
    if (state.xp >= need) {
      state.xp -= need;
      state.level += 1;
      popup(`Level ${state.level}!`);
    }
  }

  function render() {
    const targetX = state.player.x;
    const targetY = state.player.y + 4;
    const targetZ = state.player.z;
    const camDist = state.player.inVehicle ? 32 : 24;
    const yaw = state.player.inVehicle ? (state.player.inVehicle.userData.yaw || 0) : state.player.yaw;
    const desired = new THREE.Vector3(targetX - Math.sin(yaw) * camDist, targetY + 16, targetZ - Math.cos(yaw) * camDist);
    camera.position.lerp(desired, 0.08);
    camera.lookAt(targetX, targetY + 2, targetZ);
    renderer.render(scene, camera);
    drawMinimap();
  }

  function drawMinimap() {
    if (!minimap) return;
    minimap.clearRect(0, 0, 160, 160);
    minimap.fillStyle = '#071022'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff55'; minimap.strokeRect(4, 4, 152, 152);
    const scale = 0.25;
    minimap.fillStyle = '#222';
    for (let i = -2; i <= 2; i++) {
      minimap.fillRect(80 + (i * CONFIG.chunkSize - (state.player.x % CONFIG.chunkSize)) * scale - 1, 0, 2, 160);
      minimap.fillRect(0, 80 + (i * CONFIG.chunkSize - (state.player.z % CONFIG.chunkSize)) * scale - 1, 160, 2);
    }
    minimap.fillStyle = '#5ef38c';
    for (const p of state.pickups) {
      const x = 80 + ((p.parent.position.x + p.position.x) - state.player.x) * scale;
      const y = 80 + ((p.parent.position.z + p.position.z) - state.player.z) * scale;
      if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x - 2, y - 2, 4, 4);
    }
    minimap.fillStyle = '#17f3ff';
    minimap.beginPath(); minimap.arc(80, 80, 5, 0, Math.PI * 2); minimap.fill();
  }

  function updateHud(dt) {
    setText(hud.cash, `$${Math.floor(state.cash)}`);
    setText(hud.xp, Math.floor(state.xp));
    setText(hud.level, state.level);
    setText(hud.wanted, state.wanted);
    setText(hud.online, state.online);
    setText(hud.onlineDebug, state.online);
    const v = state.player.inVehicle;
    setText(hud.vehicle, v ? v.userData.name : 'On foot');
    setText(hud.hp, v ? Math.round(v.userData.hp) : 100);
    setText(hud.gas, v ? Math.round(v.userData.gas) : 100);
    setText(hud.mission, state.activeMission ? `${state.activeMission.name} ${state.activeMission.progress}/${state.activeMission.target}` : 'None');
    setText(hud.pos, `${state.player.x.toFixed(0)},${state.player.y.toFixed(0)},${state.player.z.toFixed(0)}`);
    setText(hud.chunks, state.chunks.size);
    setText(hud.npcs, state.npcs.length);
    setText(hud.activeVehicle, v ? 'Yes' : 'None');
    setText(hud.saveSlot, state.saveSlot);
    setText(hud.lastError, state.lastError);
    fpsAcc += dt; fpsFrames++;
    if (performance.now() - fpsLast > 500) {
      setText(hud.fps, Math.round(fpsFrames / Math.max(0.001, fpsAcc)));
      fpsFrames = 0; fpsAcc = 0; fpsLast = performance.now();
    }
  }

  function initUI() {
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    $('btn-resume')?.addEventListener('click', togglePause);
    $('btn-settings')?.addEventListener('click', () => showPanel(settingsPanel));
    $('btn-close-settings')?.addEventListener('click', hideMenus);
    $('btn-save')?.addEventListener('click', () => showPanel(savePanel));
    $('btn-load')?.addEventListener('click', () => showPanel(savePanel));
    $('btn-close-save')?.addEventListener('click', hideMenus);
    $('btn-close-missions')?.addEventListener('click', hideMenus);
    $('graphics-quality')?.addEventListener('change', (e) => setQuality(e.target.value));
    $('btn-mobile-pause')?.addEventListener('click', togglePause);
    $('btn-mobile-jump')?.addEventListener('pointerdown', () => state.input.jump = true);
    $('btn-mobile-jump')?.addEventListener('pointerup', () => state.input.jump = false);
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => state.input.sprint = true);
    $('btn-mobile-sprint')?.addEventListener('pointerup', () => state.input.sprint = false);
    $('btn-mobile-interact')?.addEventListener('click', interact);
    $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    document.querySelectorAll('.btn-save-slot').forEach(btn => btn.addEventListener('click', () => saveGame(btn.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach(btn => btn.addEventListener('click', () => loadGame(btn.dataset.slot)));
    $('btn-export')?.addEventListener('click', exportSave);
    $('btn-import')?.addEventListener('click', importSave);
    initJoystick();
    buildMissionBoard();
    setInterval(() => cloudSave(false), 30000);
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') { state.paused = true; pauseOverlay.classList.remove('hidden'); showPanel(missionBoard); }
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyF' && state.player.inVehicle) exitVehicle();
    if (e.code === 'KeyR') unstuck();
    setKey(e.code, true);
  }

  function onKeyUp(e) { setKey(e.code, false); }

  function setKey(code, down) {
    if (code === 'KeyW' || code === 'ArrowUp') state.input.forward = down ? 1 : (state.input.forward === 1 ? 0 : state.input.forward);
    if (code === 'KeyS' || code === 'ArrowDown') state.input.forward = down ? -1 : (state.input.forward === -1 ? 0 : state.input.forward);
    if (code === 'KeyA' || code === 'ArrowLeft') state.input.right = down ? -1 : (state.input.right === -1 ? 0 : state.input.right);
    if (code === 'KeyD' || code === 'ArrowRight') state.input.right = down ? 1 : (state.input.right === 1 ? 0 : state.input.right);
    if (code === 'ShiftLeft' || code === 'ShiftRight') state.input.sprint = down;
    if (code === 'Space') state.input.jump = down;
  }

  function initJoystick() {
    const container = $('joystick-container');
    if (!container) return;
    container.addEventListener('pointerdown', (e) => {
      state.joystick.active = true; state.joystick.id = e.pointerId; container.setPointerCapture(e.pointerId); updateJoy(e);
    });
    container.addEventListener('pointermove', updateJoy);
    container.addEventListener('pointerup', resetJoy);
    container.addEventListener('pointercancel', resetJoy);
  }

  function updateJoy(e) {
    if (!state.joystick.active || e.pointerId !== state.joystick.id) return;
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = rect.width * 0.36;
    const len = Math.min(max, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    const sx = Math.cos(ang) * len, sy = Math.sin(ang) * len;
    joystickStick.style.transform = `translate(${sx}px, ${sy}px)`;
    state.input.right = Math.max(-1, Math.min(1, sx / max));
    state.input.forward = Math.max(-1, Math.min(1, -sy / max));
  }

  function resetJoy(e) {
    if (e && e.pointerId !== state.joystick.id) return;
    state.joystick.active = false; state.joystick.id = null;
    state.input.forward = 0; state.input.right = 0;
    joystickStick.style.transform = 'translate(0,0)';
  }

  function togglePause() {
    state.paused = !state.paused;
    pauseOverlay.classList.toggle('hidden', !state.paused);
    if (!state.paused) hideMenus();
  }

  function showPanel(panel) {
    [settingsPanel, missionBoard, savePanel].forEach(p => p?.classList.add('hidden'));
    panel?.classList.remove('hidden');
  }

  function hideMenus() {
    [settingsPanel, missionBoard, savePanel, missionBoard].forEach(p => p?.classList.add('hidden'));
  }

  function buildMissionBoard() {
    if (!missionList) return;
    missionList.innerHTML = '';
    for (const mission of missions) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${mission.name}</strong><br><small>${mission.text}</small><button data-mission="${mission.id}">Start</button>`;
      li.querySelector('button').addEventListener('click', () => startMission(mission.id));
      missionList.appendChild(li);
    }
  }

  function serialize() {
    return {
      version: 2,
      cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted,
      player: { x: state.player.x, y: state.player.y, z: state.player.z, yaw: state.player.yaw },
      activeMission: state.activeMission,
      completedMissions: state.completedMissions,
      ownedLots: state.ownedLots,
      savedAt: new Date().toISOString()
    };
  }

  function applySave(data) {
    if (!data || typeof data !== 'object') return false;
    state.cash = Number(data.cash ?? state.cash);
    state.xp = Number(data.xp ?? state.xp);
    state.level = Number(data.level ?? state.level);
    state.wanted = Number(data.wanted ?? state.wanted);
    state.completedMissions = data.completedMissions || {};
    state.ownedLots = data.ownedLots || {};
    state.activeMission = data.activeMission || null;
    if (data.player) {
      state.player.x = Number(data.player.x ?? state.player.x);
      state.player.y = Number(data.player.y ?? state.player.y);
      state.player.z = Number(data.player.z ?? state.player.z);
      state.player.yaw = Number(data.player.yaw ?? state.player.yaw);
    }
    return true;
  }

  function saveGame(slot = state.saveSlot, quiet = false) {
    state.saveSlot = slot || CONFIG.defaultSlot;
    const payload = JSON.stringify(serialize());
    localStorage.setItem(CONFIG.saveKey + state.saveSlot, payload);
    if (!quiet) popup(`Saved ${state.saveSlot}`);
    cloudSave(true);
  }

  function loadGame(slot = state.saveSlot, quiet = false) {
    state.saveSlot = slot || CONFIG.defaultSlot;
    const raw = localStorage.getItem(CONFIG.saveKey + state.saveSlot);
    if (raw) {
      try { applySave(JSON.parse(raw)); if (!quiet) popup(`Loaded ${state.saveSlot}`); }
      catch (e) { setError(`Load failed: ${e.message}`); }
    }
  }

  let autosaveTimer = 0;
  function autosaveTick() {
    autosaveTimer++;
    if (autosaveTimer > 600) { autosaveTimer = 0; saveGame(state.saveSlot, true); }
  }

  function exportSave() {
    if (exportJson) exportJson.value = JSON.stringify(serialize(), null, 2);
    popup('Save exported');
  }

  function importSave() {
    try {
      const data = JSON.parse(exportJson.value);
      if (applySave(data)) { saveGame(state.saveSlot, true); popup('Save imported'); }
    } catch (e) { setError(`Import failed: ${e.message}`); popup('Invalid JSON'); }
  }

  async function cloudSave(force) {
    if (!window.NeonBlockCloudSave) return;
    try {
      state.online = 'syncing';
      if (force) await window.NeonBlockCloudSave.save(state.saveSlot, serialize());
      state.online = 'online-ready';
    } catch (e) {
      state.online = 'offline';
      setError(`Cloud save skipped: ${e.message}`);
    }
  }

  function setQuality(value) {
    state.quality = value;
    const low = value === 'low' || (value === 'auto' && isSmallScreen());
    renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.8));
    scene.fog.far = low ? 280 : 420;
    popup(`Graphics: ${value}`);
  }

  function unstuck() {
    state.player.y = 6;
    state.player.vy = 0;
    if (state.player.inVehicle) {
      state.player.inVehicle.position.y = 0;
      state.player.inVehicle.position.x += 4;
      state.player.inVehicle.position.z += 4;
    }
    popup('Unstuck');
  }

  function onResize() {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function popup(text) {
    if (!rewardPopup) return;
    rewardPopup.textContent = text;
    rewardPopup.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => rewardPopup.classList.add('hidden'), 1800);
  }

  function setError(msg) {
    state.lastError = msg;
    console.warn('[NeonBlock]', msg);
  }

  function hideLoading() { setTimeout(() => loading?.classList.add('hidden'), 250); }
  function setText(el, value) { if (el) el.textContent = value; }
  function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function isSmallScreen() { return Math.min(window.innerWidth, window.innerHeight) < 700 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }
})();
