(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), vehicleHp: $('hud-vehicle-hp'), vehicleGas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), onlineDebug: $('debug-online'), lastError: $('debug-last-error')
  };
  const minimapCanvas = $('minimap-canvas');
  const mini = minimapCanvas.getContext('2d');
  const rewardPopup = $('reward-popup');
  const pauseOverlay = $('pause-overlay');
  const missionBoard = $('mission-board');
  const missionList = $('mission-list');
  const savePanel = $('save-panel');
  const settingsPanel = $('settings-panel');
  const debugOverlay = $('debug-overlay');

  if (!window.THREE) {
    showFatal('Three.js failed to load. Check the CDN connection or vendor Three locally.');
    return;
  }

  const THREE = window.THREE;
  const state = {
    cash: 250,
    xp: 0,
    level: 1,
    wanted: 0,
    saveSlot: 'slot1',
    quality: localStorage.getItem('nbc-quality') || 'auto',
    online: false,
    paused: false,
    lastSaveAt: 0,
    dirty: true,
    missionId: null,
    missionProgress: {},
    ownedLots: {},
    picked: {},
    activeVehicleId: null,
    lastError: 'none'
  };

  const input = {
    keys: Object.create(null),
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    sprint: false,
    jump: false,
    interact: false,
    pointerDown: false,
    lastPointer: null
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a18);
  scene.fog = new THREE.FogExp2(0x070a18, 0.018);

  const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(getPixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !isSmallScreen();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0x9adfff, 0x101020, 2.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(70, 120, 30);
  sun.castShadow = renderer.shadowMap.enabled;
  scene.add(sun);

  const mats = {
    player: new THREE.MeshStandardMaterial({ color: 0x22f5ff, roughness: 0.45, metalness: 0.08 }),
    road: new THREE.MeshStandardMaterial({ color: 0x111523, roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x072514, roughness: 0.95 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x2a2f46, roughness: 0.85 }),
    neonPink: new THREE.MeshStandardMaterial({ color: 0xff2bd6, emissive: 0x661155, roughness: 0.4 }),
    neonBlue: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x115566, roughness: 0.4 }),
    neonGreen: new THREE.MeshStandardMaterial({ color: 0x51ff8a, emissive: 0x115522, roughness: 0.4 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.38, metalness: 0.1 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x154f2a }),
    lot: new THREE.MeshStandardMaterial({ color: 0xfff06a, emissive: 0x443b00, transparent: true, opacity: 0.75 })
  };

  const world = new THREE.Group();
  const dynamic = new THREE.Group();
  scene.add(world, dynamic);

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.55, 0.75), mats.player);
  body.castShadow = true;
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.82), new THREE.MeshStandardMaterial({ color: 0xf4c7a1 }));
  head.castShadow = true;
  head.position.y = 2.25;
  player.add(body, head);
  player.position.set(0, 0, 0);
  dynamic.add(player);

  const physics = { vel: new THREE.Vector3(), yaw: 0.25, pitch: -0.35, grounded: true };
  const chunks = new Map();
  const chunkSize = 80;
  const streamRadius = isSmallScreen() ? 1 : 2;
  const clock = new THREE.Clock();
  const vehicles = new Map();
  const npcs = [];
  const pickups = [];
  const lots = [];

  const missions = [
    { id: 'delivery', title: 'Neon Delivery', text: 'Collect 3 green data cubes around the city.', reward: 300, xp: 80, target: 3 },
    { id: 'driver', title: 'Test Drive', text: 'Enter a hover car and drive 300 meters.', reward: 420, xp: 100, target: 300 },
    { id: 'owner', title: 'First Property', text: 'Buy any glowing ownership lot.', reward: 200, xp: 60, target: 1 }
  ];

  function getPixelRatio() {
    if (matchMedia('(max-width: 760px)').matches) return Math.min(devicePixelRatio || 1, 1.45);
    return Math.min(devicePixelRatio || 1, 2);
  }
  function isSmallScreen() { return matchMedia('(max-width: 760px)').matches; }
  function markDirty() { state.dirty = true; }
  function showFatal(message) {
    if (loading) loading.innerHTML = `<div class="loading-title">NeonBlock City</div><div class="loading-sub">${message}</div>`;
  }
  function toast(text) {
    rewardPopup.textContent = text;
    rewardPopup.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => rewardPopup.classList.add('hidden'), 2400);
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function dist2(a, b) { const dx = a.x - b.x; const dz = a.z - b.z; return Math.hypot(dx, dz); }

  function seeded(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function makeBuilding(x, z, w, d, h, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = renderer.shadowMap.enabled;
    mesh.receiveShadow = renderer.shadowMap.enabled;
    return mesh;
  }

  function createChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return;
    const group = new THREE.Group();
    group.userData.key = key;
    const ox = cx * chunkSize;
    const oz = cz * chunkSize;

    const ground = new THREE.Mesh(new THREE.BoxGeometry(chunkSize, 0.2, chunkSize), mats.grass);
    ground.position.set(ox, -0.1, oz);
    ground.receiveShadow = true;
    group.add(ground);

    for (let i = -1; i <= 1; i++) {
      const roadX = new THREE.Mesh(new THREE.BoxGeometry(12, 0.04, chunkSize), mats.road);
      roadX.position.set(ox + i * 28, 0.02, oz);
      const roadZ = new THREE.Mesh(new THREE.BoxGeometry(chunkSize, 0.04, 12), mats.road);
      roadZ.position.set(ox, 0.03, oz + i * 28);
      group.add(roadX, roadZ);
    }

    for (let i = 0; i < 9; i++) {
      const r = seeded(cx * 13 + i, cz * 17 - i);
      const bx = ox - 32 + ((i * 23) % 64);
      const bz = oz - 30 + ((i * 31) % 64);
      if (Math.abs(bx - ox) < 9 || Math.abs(bz - oz) < 9) continue;
      const h = 6 + Math.floor(r * 18);
      const mat = r > 0.66 ? mats.neonPink : r > 0.33 ? mats.neonBlue : mats.neonGreen;
      group.add(makeBuilding(bx, bz, 7 + r * 7, 7 + seeded(i, cx) * 8, h, mat));
    }

    const lotId = `lot-${cx}-${cz}`;
    if ((Math.abs(cx) + Math.abs(cz)) % 3 === 1 && !lots.find((l) => l.id === lotId)) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 9), mats.lot);
      lot.position.set(ox + 22, 0.16, oz - 22);
      lot.userData = { id: lotId, price: 500 + (Math.abs(cx) + Math.abs(cz)) * 75 };
      group.add(lot);
      lots.push(lot);
    }

    const pickupId = `cube-${cx}-${cz}`;
    if ((cx !== 0 || cz !== 0) && seeded(cx, cz) > 0.45 && !state.picked[pickupId] && !pickups.find((p) => p.userData.id === pickupId)) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), mats.pickup);
      cube.position.set(ox - 20 + seeded(cx, cz) * 38, 1.2, oz + 18 - seeded(cz, cx) * 34);
      cube.userData = { id: pickupId, taken: false };
      group.add(cube);
      pickups.push(cube);
    }

    if (seeded(cx + 91, cz - 21) > 0.65 && npcs.length < 28) {
      const npc = makeNPC(ox - 26 + seeded(cx, cz) * 50, oz - 20 + seeded(cz, cx) * 40);
      group.add(npc);
      npcs.push(npc);
    }

    if (seeded(cx - 44, cz + 55) > 0.62 && vehicles.size < 18) {
      const car = makeVehicle(`car-${cx}-${cz}`, ox + 10 - seeded(cx, cz) * 24, oz + 10 - seeded(cz, cx) * 24);
      group.add(car);
      vehicles.set(car.userData.id, car);
    }

    world.add(group);
    chunks.set(key, group);
  }

  function unloadFarChunks() {
    const pcx = Math.round(player.position.x / chunkSize);
    const pcz = Math.round(player.position.z / chunkSize);
    for (const [key, group] of chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > streamRadius + 1 || Math.abs(cz - pcz) > streamRadius + 1) {
        world.remove(group);
        group.traverse((obj) => {
          if (obj.geometry && obj.userData.dispose !== false) obj.geometry.dispose?.();
        });
        chunks.delete(key);
      }
    }
    for (let i = npcs.length - 1; i >= 0; i--) if (!npcs[i].parent) npcs.splice(i, 1);
    for (let i = pickups.length - 1; i >= 0; i--) if (!pickups[i].parent) pickups.splice(i, 1);
    for (let i = lots.length - 1; i >= 0; i--) if (!lots[i].parent) lots.splice(i, 1);
    for (const [id, car] of vehicles) if (!car.parent && state.activeVehicleId !== id) vehicles.delete(id);
  }

  function streamWorld() {
    const pcx = Math.round(player.position.x / chunkSize);
    const pcz = Math.round(player.position.z / chunkSize);
    for (let x = pcx - streamRadius; x <= pcx + streamRadius; x++) {
      for (let z = pcz - streamRadius; z <= pcz + streamRadius; z++) createChunk(x, z);
    }
    unloadFarChunks();
  }

  function makeNPC(x, z) {
    const npc = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.65), new THREE.MeshStandardMaterial({ color: 0xb694ff }));
    torso.position.y = 0.9;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshStandardMaterial({ color: 0xf4c7a1 }));
    head.position.y = 1.85;
    npc.add(torso, head);
    npc.position.set(x, 0, z);
    npc.userData = { tip: ['Find cubes for fast cash.', 'Cars use E / Interact.', 'Buy yellow lots to build ownership.', 'Press M for missions.'][Math.floor(seeded(x, z) * 4)] };
    return npc;
  }

  function makeVehicle(id, x, z) {
    const car = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.8, 5.2), mats.vehicle);
    base.position.y = 0.65;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 2.2), mats.neonBlue);
    cab.position.set(0, 1.22, -0.2);
    car.add(base, cab);
    car.position.set(x, 0, z);
    car.userData = { id, hp: 100, gas: 100, speed: 0, yaw: seeded(x, z) * Math.PI * 2, driven: 0 };
    car.rotation.y = car.userData.yaw;
    return car;
  }

  function updatePlayer(dt) {
    const activeCar = state.activeVehicleId ? vehicles.get(state.activeVehicleId) : null;
    const forward = Number(input.keys.KeyW || input.keys.ArrowUp) - Number(input.keys.KeyS || input.keys.ArrowDown) + input.moveY;
    const side = Number(input.keys.KeyD || input.keys.ArrowRight) - Number(input.keys.KeyA || input.keys.ArrowLeft) + input.moveX;
    input.sprint = input.keys.ShiftLeft || input.keys.ShiftRight || input.sprint;

    if (activeCar) {
      const car = activeCar;
      const u = car.userData;
      u.yaw -= side * dt * 2.2;
      const accel = forward * dt * 22;
      if (u.gas > 0) u.speed = clamp(u.speed + accel, -12, 28);
      u.speed *= Math.pow(0.86, dt * 8);
      const distance = Math.abs(u.speed * dt);
      if (Math.abs(forward) > 0.05 && u.gas > 0) u.gas = Math.max(0, u.gas - distance * 0.04);
      u.driven += distance;
      car.position.x -= Math.sin(u.yaw) * u.speed * dt;
      car.position.z -= Math.cos(u.yaw) * u.speed * dt;
      car.rotation.y = u.yaw;
      player.position.copy(car.position).add(new THREE.Vector3(0, 0, 0));
      physics.yaw = u.yaw;
      progressMission('driver', distance);
      return;
    }

    physics.yaw -= input.lookX * 0.004;
    physics.pitch = clamp(physics.pitch - input.lookY * 0.0025, -1.1, -0.1);
    input.lookX = 0; input.lookY = 0;

    const speed = input.sprint ? 10 : 6;
    const sin = Math.sin(physics.yaw), cos = Math.cos(physics.yaw);
    const vx = (side * cos - forward * sin) * speed;
    const vz = (-forward * cos - side * sin) * speed;
    player.position.x += vx * dt;
    player.position.z += vz * dt;
    if ((input.jump || input.keys.Space) && physics.grounded) {
      physics.vel.y = 8.5; physics.grounded = false;
    }
    physics.vel.y -= 24 * dt;
    player.position.y += physics.vel.y * dt;
    if (player.position.y <= 0) { player.position.y = 0; physics.vel.y = 0; physics.grounded = true; }
    player.rotation.y = physics.yaw;
    input.jump = false;
  }

  function updateCamera() {
    const activeCar = state.activeVehicleId ? vehicles.get(state.activeVehicleId) : null;
    const target = activeCar ? activeCar.position : player.position;
    const distance = activeCar ? 13 : 8;
    const height = activeCar ? 6 : 4.2;
    const offset = new THREE.Vector3(Math.sin(physics.yaw) * distance, height, Math.cos(physics.yaw) * distance);
    camera.position.lerp(target.clone().add(offset), 0.12);
    camera.lookAt(target.x, target.y + 1.5, target.z);
  }

  function updateInteractions(dt) {
    for (const cube of pickups) {
      cube.rotation.y += dt * 2;
      cube.position.y = 1.2 + Math.sin(performance.now() * 0.003 + cube.position.x) * 0.18;
      if (!cube.userData.taken && dist2(player.position, cube.position) < 2.2) {
        cube.userData.taken = true;
        state.picked[cube.userData.id] = true;
        state.cash += 75; state.xp += 18;
        cube.visible = false;
        progressMission('delivery', 1);
        toast('Picked data cube +$75');
        markDirty();
      }
    }
    if (input.interact || input.keys.KeyE) {
      input.interact = false;
      const car = nearestVehicle(4.2);
      if (state.activeVehicleId) exitVehicle();
      else if (car) enterVehicle(car);
      else interactLotOrNpc();
    }
  }

  function nearestVehicle(range) {
    let best = null, bestD = Infinity;
    for (const car of vehicles.values()) {
      const d = dist2(player.position, car.position);
      if (d < range && d < bestD) { best = car; bestD = d; }
    }
    return best;
  }
  function enterVehicle(car) { state.activeVehicleId = car.userData.id; toast('Entered hover car'); markDirty(); }
  function exitVehicle() {
    const car = vehicles.get(state.activeVehicleId);
    if (car) player.position.copy(car.position).add(new THREE.Vector3(3, 0, 0));
    state.activeVehicleId = null; toast('Exited vehicle'); markDirty();
  }
  function interactLotOrNpc() {
    for (const lot of lots) {
      if (dist2(player.position, lot.position) < 4.5) {
        const id = lot.userData.id;
        if (state.ownedLots[id]) return toast('You already own this lot.');
        if (state.cash < lot.userData.price) return toast(`Need $${lot.userData.price} to buy this lot.`);
        state.cash -= lot.userData.price;
        state.ownedLots[id] = true;
        progressMission('owner', 1);
        toast('Lot purchased. Ownership saved.');
        markDirty();
        return;
      }
    }
    for (const npc of npcs) if (dist2(player.position, npc.position) < 3.5) return toast(`NPC: ${npc.userData.tip}`);
    toast('Nothing nearby to interact with.');
  }

  function startMission(id) {
    state.missionId = id;
    state.missionProgress[id] = state.missionProgress[id] || 0;
    toast(`Mission started: ${missions.find((m) => m.id === id).title}`);
    markDirty();
  }
  function progressMission(id, amount) {
    if (state.missionId !== id) return;
    const mission = missions.find((m) => m.id === id);
    state.missionProgress[id] = (state.missionProgress[id] || 0) + amount;
    if (state.missionProgress[id] >= mission.target) {
      state.cash += mission.reward; state.xp += mission.xp; state.missionId = null;
      toast(`Mission complete +$${mission.reward}`);
    }
    markDirty();
  }
  function renderMissionBoard() {
    missionList.innerHTML = '';
    for (const m of missions) {
      const li = document.createElement('li');
      const progress = Math.floor(state.missionProgress[m.id] || 0);
      li.innerHTML = `<strong>${m.title}</strong><p>${m.text}</p><small>${progress}/${m.target} • Reward $${m.reward}</small>`;
      const btn = document.createElement('button');
      btn.textContent = state.missionId === m.id ? 'Active' : 'Start';
      btn.disabled = state.missionId === m.id;
      btn.addEventListener('click', () => { startMission(m.id); missionBoard.classList.add('hidden'); pauseOverlay.classList.add('hidden'); state.paused = false; });
      li.appendChild(btn);
      missionList.appendChild(li);
    }
  }

  function save(slot = state.saveSlot) {
    const data = {
      v: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, missionId: state.missionId,
      missionProgress: state.missionProgress, ownedLots: state.ownedLots, picked: state.picked,
      player: { x: player.position.x, y: player.position.y, z: player.position.z, yaw: physics.yaw },
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(`neonblock-save-${slot}`, JSON.stringify(data));
      state.lastSaveAt = performance.now(); state.dirty = false;
      window.neonblockCloud?.save?.(slot, data).then(() => setOnline(true)).catch((err) => setError(err));
      return data;
    } catch (err) { setError(err); return null; }
  }
  function load(slot = state.saveSlot) {
    try {
      const raw = localStorage.getItem(`neonblock-save-${slot}`);
      if (!raw) return toast('No local save found.');
      applySave(JSON.parse(raw));
      toast(`Loaded ${slot}`);
    } catch (err) { setError(err); }
  }
  function applySave(data) {
    state.cash = data.cash ?? state.cash; state.xp = data.xp ?? state.xp; state.level = data.level ?? state.level;
    state.wanted = data.wanted ?? state.wanted; state.missionId = data.missionId || null;
    state.missionProgress = data.missionProgress || {}; state.ownedLots = data.ownedLots || {}; state.picked = data.picked || {};
    if (data.player) { player.position.set(data.player.x || 0, data.player.y || 0, data.player.z || 0); physics.yaw = data.player.yaw || 0; }
    state.activeVehicleId = null; markDirty(); streamWorld();
  }
  function autosave() {
    if (state.dirty && performance.now() - state.lastSaveAt > 15000) save(state.saveSlot);
  }
  function setError(err) {
    state.lastError = err?.message || String(err);
    hud.lastError.textContent = state.lastError;
    setOnline(false);
  }
  function setOnline(value) { state.online = !!value; hud.online.textContent = value ? 'cloud' : 'offline'; hud.onlineDebug.textContent = hud.online.textContent; }

  function updateHud(dt) {
    state.level = Math.max(1, Math.floor(state.xp / 150) + 1);
    const car = state.activeVehicleId ? vehicles.get(state.activeVehicleId) : null;
    hud.cash.textContent = `$${Math.floor(state.cash)}`;
    hud.xp.textContent = Math.floor(state.xp);
    hud.level.textContent = state.level;
    hud.wanted.textContent = state.wanted;
    hud.vehicle.textContent = car ? 'Hover car' : 'On foot';
    hud.vehicleHp.textContent = car ? Math.floor(car.userData.hp) : '100';
    hud.vehicleGas.textContent = car ? Math.floor(car.userData.gas) : '100';
    const mission = missions.find((m) => m.id === state.missionId);
    hud.mission.textContent = mission ? `${mission.title} ${Math.floor(state.missionProgress[mission.id] || 0)}/${mission.target}` : 'None';
    hud.pos.textContent = `${player.position.x.toFixed(1)},${player.position.y.toFixed(1)},${player.position.z.toFixed(1)}`;
    hud.chunks.textContent = chunks.size;
    hud.npcs.textContent = npcs.length;
    hud.activeVehicle.textContent = car ? car.userData.id : 'None';
    hud.saveSlot.textContent = state.saveSlot;
    if (dt) hud.fps.textContent = Math.round(1 / dt);
  }

  function drawMinimap() {
    const w = minimapCanvas.width, h = minimapCanvas.height;
    mini.clearRect(0, 0, w, h);
    mini.fillStyle = '#071021cc'; mini.fillRect(0, 0, w, h);
    mini.strokeStyle = '#17f3ff55'; mini.strokeRect(0.5, 0.5, w - 1, h - 1);
    const scale = 1.4;
    const plot = (pos, color, size = 3) => {
      const x = w / 2 + (pos.x - player.position.x) / scale;
      const y = h / 2 + (pos.z - player.position.z) / scale;
      if (x < 0 || y < 0 || x > w || y > h) return;
      mini.fillStyle = color; mini.fillRect(x - size / 2, y - size / 2, size, size);
    };
    for (const car of vehicles.values()) plot(car.position, '#ffd166', 4);
    for (const cube of pickups) if (!cube.userData.taken) plot(cube.position, '#5ef38c', 3);
    for (const lot of lots) plot(lot.position, state.ownedLots[lot.userData.id] ? '#17f3ff' : '#fff06a', 4);
    plot(player.position, '#ffffff', 6);
  }

  function bindUI() {
    $('btn-mobile-pause').addEventListener('click', togglePause);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-settings').addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
    $('btn-close-settings').addEventListener('click', () => settingsPanel.classList.add('hidden'));
    $('btn-save').addEventListener('click', () => savePanel.classList.toggle('hidden'));
    $('btn-load').addEventListener('click', () => savePanel.classList.toggle('hidden'));
    $('btn-close-save').addEventListener('click', () => savePanel.classList.add('hidden'));
    $('btn-mobile-unstuck').addEventListener('click', () => { player.position.y = 1; physics.vel.set(0, 0, 0); state.activeVehicleId = null; toast('Unstuck.'); });
    $('btn-mobile-jump').addEventListener('pointerdown', () => input.jump = true);
    $('btn-mobile-sprint').addEventListener('pointerdown', () => input.sprint = true);
    $('btn-mobile-sprint').addEventListener('pointerup', () => input.sprint = false);
    $('btn-mobile-interact').addEventListener('click', () => input.interact = true);
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { state.saveSlot = b.dataset.slot; save(state.saveSlot); toast(`Saved ${state.saveSlot}`); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => { state.saveSlot = b.dataset.slot; load(state.saveSlot); }));
    $('btn-export').addEventListener('click', () => { $('export-json').value = JSON.stringify(save(state.saveSlot), null, 2); });
    $('btn-import').addEventListener('click', () => { try { applySave(JSON.parse($('export-json').value)); toast('Imported save JSON.'); } catch (err) { setError(err); } });
    $('graphics-quality').value = state.quality;
    $('graphics-quality').addEventListener('change', (e) => { state.quality = e.target.value; localStorage.setItem('nbc-quality', state.quality); renderer.setPixelRatio(state.quality === 'low' ? 1 : getPixelRatio()); toast('Graphics updated.'); });
    window.addEventListener('keydown', (e) => {
      input.keys[e.code] = true;
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyM') openMissionBoard();
      if (e.code === 'F3') { e.preventDefault(); debugOverlay.classList.toggle('visible'); }
    });
    window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', () => save(state.saveSlot));
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(state.saveSlot); });
    bindJoystick();
    bindLook();
  }
  function togglePause() { state.paused = !state.paused; pauseOverlay.classList.toggle('hidden', !state.paused); }
  function openMissionBoard() { renderMissionBoard(); state.paused = true; pauseOverlay.classList.remove('hidden'); missionBoard.classList.remove('hidden'); }
  $('btn-close-missions').addEventListener('click', () => missionBoard.classList.add('hidden'));

  function bindJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick');
    let active = false;
    const reset = () => { active = false; input.moveX = 0; input.moveY = 0; stick.style.transform = 'translate(0,0)'; };
    box.addEventListener('pointerdown', (e) => { active = true; box.setPointerCapture(e.pointerId); move(e); });
    box.addEventListener('pointermove', (e) => active && move(e));
    box.addEventListener('pointerup', reset); box.addEventListener('pointercancel', reset);
    function move(e) {
      const rect = box.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = clamp(e.clientX - cx, -44, 44), dy = clamp(e.clientY - cy, -44, 44);
      input.moveX = dx / 44; input.moveY = -dy / 44;
      stick.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }
  function bindLook() {
    canvas.addEventListener('pointerdown', (e) => { input.pointerDown = true; input.lastPointer = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!input.pointerDown || !input.lastPointer) return;
      input.lookX += e.clientX - input.lastPointer.x;
      input.lookY += e.clientY - input.lastPointer.y;
      input.lastPointer = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { input.pointerDown = false; input.lastPointer = null; });
  }
  function onResize() {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(getPixelRatio()); renderer.setSize(innerWidth, innerHeight);
  }

  function gameLoop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) {
      updatePlayer(dt);
      streamWorld();
      updateInteractions(dt);
      updateCamera();
      autosave();
    }
    updateHud(dt);
    drawMinimap();
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
  }

  function boot() {
    debugOverlay.classList.remove('visible');
    pauseOverlay.classList.add('hidden');
    bindUI();
    streamWorld();
    loadAuto();
    updateCamera();
    setTimeout(() => loading?.remove(), 450);
    gameLoop();
    toast('WASD/Arrows move • E interact • M missions');
  }
  function loadAuto() {
    const raw = localStorage.getItem(`neonblock-save-${state.saveSlot}`);
    if (raw) { try { applySave(JSON.parse(raw)); } catch (err) { setError(err); } }
  }

  boot();
})();
