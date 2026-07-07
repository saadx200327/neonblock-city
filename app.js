(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), lastError: $('debug-last-error')
  };
  const minimapCanvas = $('minimap-canvas');
  const minimap = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const reward = $('reward-popup');
  const pauseOverlay = $('pause-overlay');
  const missionBoard = $('mission-board');
  const missionList = $('mission-list');
  const savePanel = $('save-panel');
  const exportJson = $('export-json');
  const joystickContainer = $('joystick-container');
  const joystickStick = $('joystick-stick');

  const safeText = (node, value) => { if (node) node.textContent = String(value); };
  const setError = (value) => safeText(hud.lastError, value || 'none');

  if (!window.THREE || !canvas) {
    setError('Three.js or canvas missing');
    if (loading) loading.querySelector('.loading-sub').textContent = 'Missing Three.js runtime.';
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07091a);
  scene.fog = new THREE.Fog(0x07091a, 70, 280);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(63, window.innerWidth / window.innerHeight, 0.1, 650);
  const clock = new THREE.Clock();

  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false, sprint: false, inVehicle: null,
    ownedLots: new Set(), completed: new Set(), activeMission: null, messageTimer: 0, cloudOnline: false,
    graphics: localStorage.getItem('neonblock_graphics') || 'auto'
  };

  const input = { up: false, down: false, left: false, right: false, jump: false, interact: false, unstuck: false, pause: false, joyX: 0, joyY: 0 };

  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x161a2d, roughness: 0.85 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x0f2b24, roughness: 0.9 }),
    neonA: new THREE.MeshStandardMaterial({ color: 0x19d7ff, emissive: 0x083a48, roughness: 0.35 }),
    neonB: new THREE.MeshStandardMaterial({ color: 0xff3dac, emissive: 0x4a0b2b, roughness: 0.4 }),
    neonC: new THREE.MeshStandardMaterial({ color: 0xffd452, emissive: 0x3f2c03, roughness: 0.4 }),
    player: new THREE.MeshStandardMaterial({ color: 0x40f6ff, emissive: 0x082e33 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x050509, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x7ff2ff, emissive: 0x15333a, transparent: true, opacity: 0.75 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x7d4bff, emissive: 0x15094b }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x0b3318 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x242941, roughness: 0.85 })
  };

  const hemi = new THREE.HemisphereLight(0x9bdcff, 0x080812, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.65);
  sun.position.set(40, 80, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  function box(w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const player = new THREE.Group();
  const body = box(1.2, 1.9, 0.7, materials.player); body.position.y = 1.35;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.82), new THREE.MeshStandardMaterial({ color: 0xffd39a })); head.position.y = 2.75; head.castShadow = true;
  player.add(body, head);
  player.position.set(0, 0, 0);
  scene.add(player);

  const physics = { yVel: 0, grounded: true, speed: 0, dir: new THREE.Vector3(0, 0, 1) };
  const chunks = new Map();
  const interactables = [];
  const vehicles = [];
  const npcs = [];
  const pickups = [];
  const chunkSize = 42;
  const renderRadius = 2;

  const missions = [
    { id: 'welcome', title: 'Welcome Run', text: 'Collect 3 neon crates.', reward: 150, xp: 40, goal: 3, progress: 0, type: 'crate' },
    { id: 'driver', title: 'Street Driver', text: 'Enter a vehicle and drive 220 meters.', reward: 260, xp: 75, goal: 220, progress: 0, type: 'drive' },
    { id: 'owner', title: 'First Property', text: 'Buy one city lot.', reward: 320, xp: 95, goal: 1, progress: 0, type: 'buy' }
  ];

  function showReward(text) {
    if (!reward) return;
    reward.textContent = text;
    reward.classList.remove('hidden');
    clearTimeout(showReward.timer);
    showReward.timer = setTimeout(() => reward.classList.add('hidden'), 2200);
  }

  function seeded(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function makeVehicle(x, z, hue) {
    const car = new THREE.Group();
    car.userData = { type: 'vehicle', hp: 100, gas: 100, name: hue === 0 ? 'Neon Coupe' : 'Block Van', speed: 0, distance: 0 };
    car.add(box(2.6, 0.75, 4.2, hue === 0 ? materials.neonA : materials.neonB));
    const cab = box(1.8, 0.75, 1.8, materials.glass); cab.position.set(0, 0.72, -0.25); car.add(cab);
    for (const sx of [-1.15, 1.15]) for (const sz of [-1.45, 1.45]) { const tire = box(0.35, 0.55, 0.72, materials.tire); tire.position.set(sx, -0.35, sz); car.add(tire); }
    car.position.set(x, 0.55, z);
    scene.add(car);
    vehicles.push(car); interactables.push(car);
    return car;
  }

  function makeNpc(x, z, text) {
    const npc = new THREE.Group();
    npc.userData = { type: 'npc', tip: text };
    const b = box(0.9, 1.6, 0.7, materials.neonC); b.position.y = 1.15;
    const h = box(0.7, 0.7, 0.7, materials.glass); h.position.y = 2.25;
    npc.add(b, h); npc.position.set(x, 0, z); scene.add(npc); npcs.push(npc); interactables.push(npc);
  }

  function makePickup(x, z) {
    const p = box(0.9, 0.9, 0.9, materials.crate);
    p.position.set(x, 0.65, z);
    p.userData = { type: 'crate', taken: false };
    scene.add(p); pickups.push(p); interactables.push(p);
  }

  function makeLot(x, z, price) {
    const lot = box(7, 0.18, 7, materials.lot);
    lot.position.set(x, 0.1, z);
    lot.userData = { type: 'lot', id: `lot_${Math.round(x)}_${Math.round(z)}`, price };
    scene.add(lot); interactables.push(lot);
  }

  function makeRoad(x, z, rot) {
    const r = box(chunkSize, 0.08, 7, materials.road);
    r.position.set(x, 0.04, z); r.rotation.y = rot; scene.add(r); return r;
  }

  function makeChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return;
    const group = new THREE.Group();
    const ox = cx * chunkSize, oz = cz * chunkSize;
    group.userData.key = key;
    scene.add(group);
    chunks.set(key, group);

    const roadA = makeRoad(ox, oz, 0); const roadB = makeRoad(ox, oz, Math.PI / 2); group.add(roadA, roadB);
    for (let i = 0; i < 5; i++) {
      const r = seeded(cx * 31 + i, cz * 17 - i);
      const px = ox + (r - 0.5) * 34;
      const pz = oz + (seeded(cx - i, cz + i) - 0.5) * 34;
      if (Math.abs(px - ox) < 5 || Math.abs(pz - oz) < 5) continue;
      const h = 5 + Math.floor(seeded(cx + i * 9, cz - i * 4) * 16);
      const building = box(5 + r * 5, h, 5 + seeded(cx - i, cz + i) * 5, [materials.neonA, materials.neonB, materials.neonC][i % 3]);
      building.position.set(px, h / 2, pz); group.add(building);
    }
    if (seeded(cx, cz) > 0.72) makePickup(ox + 12, oz - 10);
    if (seeded(cx + 4, cz + 2) > 0.78) makeVehicle(ox - 9, oz + 12, Math.round(seeded(cx, cz + 3)));
    if (seeded(cx - 5, cz) > 0.82) makeNpc(ox + 8, oz + 8, 'Tip: crates pay cash, lots build ownership, vehicles finish driving missions.');
    if (seeded(cx + 9, cz + 9) > 0.76) makeLot(ox - 13, oz - 13, 180 + Math.floor(seeded(cx, cz) * 220));
  }

  function streamWorld() {
    const cx = Math.round(player.position.x / chunkSize);
    const cz = Math.round(player.position.z / chunkSize);
    for (let x = cx - renderRadius; x <= cx + renderRadius; x++) for (let z = cz - renderRadius; z <= cz + renderRadius; z++) makeChunk(x, z);
    for (const [key, group] of chunks) {
      const [gx, gz] = key.split(',').map(Number);
      const far = Math.abs(gx - cx) > renderRadius + 1 || Math.abs(gz - cz) > renderRadius + 1;
      group.visible = !far;
    }
  }

  function nearestInteractable(maxDist = 4.5) {
    let best = null, bestD = maxDist;
    for (const obj of interactables) {
      if (!obj || obj.userData.taken) continue;
      const d = obj.position.distanceTo(player.position);
      if (d < bestD) { best = obj; bestD = d; }
    }
    return best;
  }

  function missionById(id) { return missions.find((m) => m.id === id); }
  function setMission(id) {
    state.activeMission = id;
    const m = missionById(id);
    showReward(m ? `Mission started: ${m.title}` : 'Mission cleared');
  }
  function addMissionProgress(type, amount) {
    const m = missionById(state.activeMission);
    if (!m || m.type !== type || state.completed.has(m.id)) return;
    m.progress = Math.min(m.goal, m.progress + amount);
    if (m.progress >= m.goal) {
      state.cash += m.reward; state.xp += m.xp; state.completed.add(m.id); state.activeMission = null;
      showReward(`Mission complete +$${m.reward} +${m.xp} XP`);
      updateLevel(); saveGame(state.slot, true);
    }
  }
  function updateLevel() { state.level = Math.max(1, Math.floor(state.xp / 120) + 1); }

  function interact() {
    const target = nearestInteractable();
    if (!target) { showReward('Nothing nearby. Find crates, cars, NPCs, or lots.'); return; }
    const type = target.userData.type;
    if (type === 'crate') {
      target.userData.taken = true; target.visible = false; state.cash += 35; state.xp += 10; addMissionProgress('crate', 1); updateLevel(); showReward('Crate collected +$35 +10 XP');
    } else if (type === 'vehicle') {
      state.inVehicle = state.inVehicle === target ? null : target;
      showReward(state.inVehicle ? `Entered ${target.userData.name}` : 'Exited vehicle');
    } else if (type === 'npc') {
      showReward(target.userData.tip || 'Welcome to NeonBlock City.');
      openMissionBoard();
    } else if (type === 'lot') {
      const id = target.userData.id;
      if (state.ownedLots.has(id)) { showReward('You already own this lot.'); return; }
      if (state.cash < target.userData.price) { showReward(`Need $${target.userData.price} to buy this lot.`); return; }
      state.cash -= target.userData.price; state.ownedLots.add(id); target.material = materials.owned; addMissionProgress('buy', 1); showReward(`Lot bought for $${target.userData.price}`);
    }
    saveGame(state.slot, true);
  }

  function movePlayer(dt) {
    const joyMoving = Math.abs(input.joyX) + Math.abs(input.joyY) > 0.05;
    const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.joyX;
    const mz = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.joyY;
    const len = Math.hypot(mx, mz);
    const speedBase = state.inVehicle ? 16 : (state.sprint ? 9 : 5.2);
    if (len > 0.02) {
      physics.dir.set(mx / len, 0, mz / len);
      const move = physics.dir.clone().multiplyScalar(speedBase * dt);
      if (state.inVehicle) {
        const before = state.inVehicle.position.clone();
        state.inVehicle.position.add(move);
        state.inVehicle.rotation.y = Math.atan2(physics.dir.x, physics.dir.z);
        state.inVehicle.userData.gas = Math.max(0, state.inVehicle.userData.gas - dt * 1.1);
        const dist = before.distanceTo(state.inVehicle.position);
        state.inVehicle.userData.distance += dist;
        player.position.copy(state.inVehicle.position).add(new THREE.Vector3(0, 0, -1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.inVehicle.rotation.y));
        addMissionProgress('drive', dist);
      } else {
        player.position.add(move);
        player.rotation.y = Math.atan2(physics.dir.x, physics.dir.z);
      }
    } else if (joyMoving) {
      physics.speed = speedBase;
    }
    if (input.jump && physics.grounded && !state.inVehicle) { physics.yVel = 8.6; physics.grounded = false; }
    if (!physics.grounded) {
      physics.yVel -= 22 * dt; player.position.y += physics.yVel * dt;
      if (player.position.y <= 0) { player.position.y = 0; physics.yVel = 0; physics.grounded = true; }
    }
    if (input.unstuck || player.position.y < -10) { player.position.set(0, 0, 0); if (state.inVehicle) state.inVehicle.position.set(2, 0.55, 2); showReward('Unstuck: returned to spawn'); input.unstuck = false; }
  }

  function updateCamera(dt) {
    const target = state.inVehicle || player;
    const desired = target.position.clone().add(new THREE.Vector3(0, state.inVehicle ? 8 : 6, state.inVehicle ? 12 : 10));
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(target.position.x, target.position.y + 1.5, target.position.z);
  }

  function updateHud(dt) {
    safeText(hud.cash, `$${Math.floor(state.cash)}`); safeText(hud.xp, Math.floor(state.xp)); safeText(hud.level, state.level); safeText(hud.wanted, state.wanted);
    safeText(hud.vehicle, state.inVehicle ? state.inVehicle.userData.name : 'On foot');
    safeText(hud.hp, state.inVehicle ? Math.round(state.inVehicle.userData.hp) : 100);
    safeText(hud.gas, state.inVehicle ? Math.round(state.inVehicle.userData.gas) : 100);
    const m = missionById(state.activeMission); safeText(hud.mission, m ? `${m.title} ${Math.floor(m.progress)}/${m.goal}` : 'None');
    safeText(hud.pos, `${player.position.x.toFixed(1)},${player.position.y.toFixed(1)},${player.position.z.toFixed(1)}`);
    safeText(hud.chunks, chunks.size); safeText(hud.npcs, npcs.length); safeText(hud.activeVehicle, state.inVehicle ? state.inVehicle.userData.name : 'None');
    safeText(hud.slot, state.slot); safeText(hud.online, state.cloudOnline ? 'cloud ready' : 'offline'); safeText(hud.onlineDebug, state.cloudOnline ? 'cloud ready' : 'offline');
    updateHud.acc = (updateHud.acc || 0) + dt; updateHud.frames = (updateHud.frames || 0) + 1;
    if (updateHud.acc >= 0.5) { safeText(hud.fps, Math.round(updateHud.frames / updateHud.acc)); updateHud.acc = 0; updateHud.frames = 0; }
  }

  function updateMinimap() {
    if (!minimap) return;
    minimap.clearRect(0, 0, 160, 160);
    minimap.fillStyle = '#07091a'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff55'; minimap.strokeRect(1, 1, 158, 158);
    const scale = 1.6;
    function dot(x, z, color, size) {
      const dx = 80 + (x - player.position.x) * scale; const dz = 80 + (z - player.position.z) * scale;
      if (dx < 0 || dz < 0 || dx > 160 || dz > 160) return;
      minimap.fillStyle = color; minimap.fillRect(dx - size / 2, dz - size / 2, size, size);
    }
    for (const v of vehicles) dot(v.position.x, v.position.z, '#ff3dac', 4);
    for (const p of pickups) if (!p.userData.taken) dot(p.position.x, p.position.z, '#7d4bff', 4);
    dot(player.position.x, player.position.z, '#5ef38c', 6);
  }

  function buildMissionBoard() {
    if (!missionList) return;
    missionList.innerHTML = '';
    for (const m of missions) {
      const li = document.createElement('li');
      const done = state.completed.has(m.id);
      li.innerHTML = `<strong>${m.title}</strong><br><span>${m.text}</span><br><em>$${m.reward} / ${m.xp} XP ${done ? 'DONE' : ''}</em>`;
      const btn = document.createElement('button'); btn.textContent = done ? 'Completed' : 'Start'; btn.disabled = done;
      btn.addEventListener('click', () => { setMission(m.id); closeMenus(); });
      li.appendChild(btn); missionList.appendChild(li);
    }
  }
  function openMissionBoard() { buildMissionBoard(); if (missionBoard) missionBoard.classList.remove('hidden'); if (pauseOverlay) pauseOverlay.classList.remove('hidden'); state.paused = true; }
  function closeMenus() { for (const node of [pauseOverlay, missionBoard, savePanel, $('settings-panel')]) if (node) node.classList.add('hidden'); state.paused = false; }
  function togglePause() { state.paused = !state.paused; if (pauseOverlay) pauseOverlay.classList.toggle('hidden', !state.paused); }

  function savePayload() {
    return { v: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, slot: state.slot, pos: player.position.toArray(), ownedLots: [...state.ownedLots], completed: [...state.completed], activeMission: state.activeMission, missions: missions.map(({ id, progress }) => ({ id, progress })) };
  }
  async function saveGame(slot = state.slot, silent = false) {
    state.slot = slot;
    const payload = savePayload();
    localStorage.setItem(`neonblock_save_${slot}`, JSON.stringify(payload));
    if (window.NeonBlockCloudSave && typeof window.NeonBlockCloudSave.save === 'function') {
      try { await window.NeonBlockCloudSave.save(slot, payload); state.cloudOnline = true; } catch (e) { state.cloudOnline = false; setError(`cloud save skipped: ${e.message}`); }
    }
    if (!silent) showReward(`Saved ${slot}`);
  }
  async function loadGame(slot = state.slot) {
    state.slot = slot;
    let raw = localStorage.getItem(`neonblock_save_${slot}`);
    if (!raw && window.NeonBlockCloudSave && typeof window.NeonBlockCloudSave.load === 'function') {
      try { const cloud = await window.NeonBlockCloudSave.load(slot); if (cloud) raw = JSON.stringify(cloud); state.cloudOnline = true; } catch (e) { state.cloudOnline = false; setError(`cloud load skipped: ${e.message}`); }
    }
    if (!raw) { showReward(`No save in ${slot}`); return; }
    applySave(JSON.parse(raw)); showReward(`Loaded ${slot}`);
  }
  function applySave(data) {
    state.cash = Number(data.cash || 0); state.xp = Number(data.xp || 0); state.level = Number(data.level || 1); state.wanted = Number(data.wanted || 0);
    state.ownedLots = new Set(data.ownedLots || []); state.completed = new Set(data.completed || []); state.activeMission = data.activeMission || null;
    if (Array.isArray(data.pos)) player.position.fromArray(data.pos);
    if (Array.isArray(data.missions)) for (const saved of data.missions) { const m = missionById(saved.id); if (m) m.progress = saved.progress || 0; }
  }

  function bindButton(id, down, up = down) {
    const node = $(id); if (!node) return;
    node.addEventListener('pointerdown', (e) => { e.preventDefault(); down(true); });
    node.addEventListener('pointerup', (e) => { e.preventDefault(); up(false); });
    node.addEventListener('pointercancel', () => up(false));
    node.addEventListener('click', (e) => e.preventDefault());
  }

  const keys = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    if (keys[e.code]) input[keys[e.code]] = true;
    if (e.code === 'Space') input.jump = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sprint = true;
    if (e.code === 'KeyE') input.interact = true;
    if (e.code === 'KeyM') openMissionBoard();
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyR') input.unstuck = true;
  });
  window.addEventListener('keyup', (e) => {
    if (keys[e.code]) input[keys[e.code]] = false;
    if (e.code === 'Space') input.jump = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sprint = false;
  });

  bindButton('btn-mobile-jump', (v) => { input.jump = v; });
  bindButton('btn-mobile-sprint', (v) => { state.sprint = v; });
  bindButton('btn-mobile-interact', () => interact());
  bindButton('btn-mobile-unstuck', () => { input.unstuck = true; });
  bindButton('btn-mobile-pause', () => togglePause());

  if (joystickContainer && joystickStick) {
    let joyId = null;
    const resetJoy = () => { input.joyX = 0; input.joyY = 0; joystickStick.style.transform = 'translate(0px,0px)'; joyId = null; };
    joystickContainer.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joystickContainer.setPointerCapture(joyId); });
    joystickContainer.addEventListener('pointermove', (e) => {
      if (joyId !== e.pointerId) return;
      const rect = joystickContainer.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2); const dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.min(44, Math.hypot(dx, dy)); const ang = Math.atan2(dy, dx);
      input.joyX = Math.cos(ang) * (len / 44); input.joyY = Math.sin(ang) * (len / 44);
      joystickStick.style.transform = `translate(${Math.cos(ang) * len}px,${Math.sin(ang) * len}px)`;
    });
    joystickContainer.addEventListener('pointerup', resetJoy); joystickContainer.addEventListener('pointercancel', resetJoy);
  }

  $('btn-resume')?.addEventListener('click', closeMenus);
  $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
  $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
  $('btn-save')?.addEventListener('click', () => { savePanel?.classList.remove('hidden'); });
  $('btn-load')?.addEventListener('click', () => { savePanel?.classList.remove('hidden'); });
  $('btn-close-save')?.addEventListener('click', () => savePanel?.classList.add('hidden'));
  $('btn-close-missions')?.addEventListener('click', closeMenus);
  document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => saveGame(b.dataset.slot)));
  document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot)));
  $('btn-export')?.addEventListener('click', () => { if (exportJson) exportJson.value = JSON.stringify(savePayload(), null, 2); });
  $('btn-import')?.addEventListener('click', () => { try { applySave(JSON.parse(exportJson.value)); saveGame(state.slot); } catch (e) { setError(e.message); showReward('Invalid save JSON'); } });
  $('graphics-quality')?.addEventListener('change', (e) => { state.graphics = e.target.value; localStorage.setItem('neonblock_graphics', state.graphics); renderer.setPixelRatio(state.graphics === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, state.graphics === 'high' ? 2 : 1.6)); });

  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight, false); });

  for (let x = -renderRadius; x <= renderRadius; x++) for (let z = -renderRadius; z <= renderRadius; z++) makeChunk(x, z);
  makeNpc(5, 8, 'Start at the mission board. Press E/interact near crates, cars, lots, and NPCs.');
  makeVehicle(-5, 5, 0);
  setMission('welcome');
  loadGame('slot1').catch((e) => setError(e.message));
  if (loading) setTimeout(() => loading.classList.add('hidden'), 450);

  setInterval(() => saveGame(state.slot, true), 20000);

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) {
      if (input.interact) { interact(); input.interact = false; }
      movePlayer(dt); streamWorld(); updateCamera(dt); updateHud(dt); updateMinimap();
      for (const p of pickups) p.rotation.y += dt * 1.6;
      renderer.render(scene, camera);
    }
  }
  frame();
})();
