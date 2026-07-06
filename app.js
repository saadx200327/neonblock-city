(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const THREE_NS = window.THREE;

  const hud = {
    cash: document.getElementById('hud-cash'),
    xp: document.getElementById('hud-xp'),
    level: document.getElementById('hud-level'),
    wanted: document.getElementById('hud-wanted'),
    online: document.getElementById('hud-online'),
    vehicle: document.getElementById('hud-vehicle'),
    vehicleHp: document.getElementById('hud-vehicle-hp'),
    vehicleGas: document.getElementById('hud-vehicle-gas'),
    mission: document.getElementById('hud-mission'),
    reward: document.getElementById('reward-popup'),
    pause: document.getElementById('pause-overlay'),
    settingsPanel: document.getElementById('settings-panel'),
    savePanel: document.getElementById('save-panel'),
    missionBoard: document.getElementById('mission-board'),
    missionList: document.getElementById('mission-list'),
    exportJson: document.getElementById('export-json'),
    debug: document.getElementById('debug-overlay'),
    debugFps: document.getElementById('debug-fps'),
    debugPos: document.getElementById('debug-pos'),
    debugChunks: document.getElementById('debug-chunks'),
    debugNpcs: document.getElementById('debug-npcs'),
    debugVehicle: document.getElementById('debug-active-vehicle'),
    debugSlot: document.getElementById('debug-save-slot'),
    debugOnline: document.getElementById('debug-online'),
    debugError: document.getElementById('debug-last-error')
  };

  if (!canvas || !THREE_NS) {
    if (loading) loading.textContent = 'NeonBlock City could not load Three.js.';
    return;
  }

  const isTouch = matchMedia('(pointer: coarse)').matches;
  const quality = { tier: isTouch ? 'low' : 'medium', pixelRatio: Math.min(devicePixelRatio || 1, isTouch ? 1.35 : 1.75) };
  const state = {
    cash: 150,
    xp: 0,
    level: 1,
    wanted: 0,
    health: 100,
    activeSlot: 'slot1',
    ownedLots: new Set(),
    collectedPickups: new Set(),
    completedMissions: new Set(),
    activeMission: null,
    inVehicle: null,
    paused: false,
    lastSaveAt: 0,
    cloudOnline: false,
    lastError: 'none'
  };

  const controls = {
    keys: new Set(),
    joystick: { x: 0, y: 0, active: false, id: null },
    look: { active: false, id: null, lastX: 0, lastY: 0 },
    jumpQueued: false,
    interactQueued: false,
    sprintHeld: false
  };

  const clock = new THREE_NS.Clock();
  const scene = new THREE_NS.Scene();
  scene.background = new THREE_NS.Color(0x050814);
  scene.fog = new THREE_NS.Fog(0x050814, 80, 300);

  const camera = new THREE_NS.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 850);
  const renderer = new THREE_NS.WebGLRenderer({ canvas, antialias: !isTouch, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !isTouch;

  const hemi = new THREE_NS.HemisphereLight(0x8bd8ff, 0x101020, 1.4);
  scene.add(hemi);
  const sun = new THREE_NS.DirectionalLight(0xffffff, 1.1);
  sun.position.set(45, 90, 35);
  sun.castShadow = !isTouch;
  scene.add(sun);

  const world = {
    chunkSize: 72,
    radius: isTouch ? 2 : 3,
    chunks: new Map(),
    vehicles: new Map(),
    npcs: new Map(),
    pickups: new Map(),
    lots: new Map(),
    markers: []
  };

  const player = {
    pos: new THREE_NS.Vector3(0, 1, 0),
    vel: new THREE_NS.Vector3(0, 0, 0),
    yaw: 0,
    onGround: true,
    mesh: makeAvatar(0x17f3ff, 0xffffff),
    speed: 12,
    vehicleSpeed: 35
  };
  scene.add(player.mesh);

  const groundGeo = new THREE_NS.BoxGeometry(world.chunkSize, 0.35, world.chunkSize);
  const roadGeo = new THREE_NS.BoxGeometry(world.chunkSize, 0.08, 8);
  const buildingGeo = new THREE_NS.BoxGeometry(1, 1, 1);
  const pickupGeo = new THREE_NS.OctahedronGeometry(1.15, 0);
  const lotGeo = new THREE_NS.BoxGeometry(13, 0.22, 13);
  const carGeo = new THREE_NS.BoxGeometry(4, 1.2, 7);

  const mats = {
    ground: new THREE_NS.MeshStandardMaterial({ color: 0x091128, roughness: 0.85 }),
    road: new THREE_NS.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 }),
    roadLine: new THREE_NS.MeshBasicMaterial({ color: 0x17f3ff }),
    building: new THREE_NS.MeshStandardMaterial({ color: 0x15204a, metalness: 0.15, roughness: 0.55 }),
    building2: new THREE_NS.MeshStandardMaterial({ color: 0x2a1750, metalness: 0.12, roughness: 0.55 }),
    pickup: new THREE_NS.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x155f29, roughness: 0.35 }),
    lot: new THREE_NS.MeshStandardMaterial({ color: 0xffc857, emissive: 0x332300, roughness: 0.7 }),
    ownedLot: new THREE_NS.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x00373b, roughness: 0.7 }),
    car: new THREE_NS.MeshStandardMaterial({ color: 0xff3366, roughness: 0.38, metalness: 0.2 }),
    npc: new THREE_NS.MeshStandardMaterial({ color: 0xffc857, roughness: 0.55 })
  };

  const missions = [
    { id: 'first-coins', title: 'Collect 5 Neon Cubes', type: 'collect', target: 5, cash: 300, xp: 120 },
    { id: 'first-ride', title: 'Drive 350 meters', type: 'drive', target: 350, cash: 450, xp: 150 },
    { id: 'property-run', title: 'Buy your first lot', type: 'own', target: 1, cash: 650, xp: 220 }
  ];
  let missionProgress = { collect: 0, drive: 0, own: 0 };

  function makeAvatar(bodyColor, headColor) {
    const g = new THREE_NS.Group();
    const body = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(1.6, 2.1, 0.9), new THREE_NS.MeshStandardMaterial({ color: bodyColor, roughness: 0.5 }));
    body.position.y = 1.45;
    const head = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(1.15, 1.15, 1.15), new THREE_NS.MeshStandardMaterial({ color: headColor, roughness: 0.5 }));
    head.position.y = 3.15;
    const legMat = new THREE_NS.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 });
    const l1 = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.6, 1.1, 0.65), legMat); l1.position.set(-0.42, 0.45, 0);
    const l2 = l1.clone(); l2.position.x = 0.42;
    g.add(body, head, l1, l2);
    return g;
  }

  function seeded(x, z) {
    let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function makeChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const group = new THREE_NS.Group();
    group.name = `chunk-${key}`;
    const wx = cx * world.chunkSize;
    const wz = cz * world.chunkSize;

    const ground = new THREE_NS.Mesh(groundGeo, mats.ground);
    ground.position.set(wx, -0.2, wz);
    ground.receiveShadow = true;
    group.add(ground);

    const roadX = new THREE_NS.Mesh(roadGeo, mats.road);
    roadX.position.set(wx, 0.02, wz);
    roadX.receiveShadow = true;
    group.add(roadX);
    const roadZ = roadX.clone();
    roadZ.rotation.y = Math.PI / 2;
    group.add(roadZ);

    for (let i = 0; i < 6; i++) {
      const sx = (seeded(cx + i, cz) - 0.5) * 52;
      const sz = (seeded(cx, cz + i) - 0.5) * 52;
      if (Math.abs(sx) < 9 || Math.abs(sz) < 9) continue;
      const h = 5 + Math.floor(seeded(cx * 3 + i, cz * 5) * 28);
      const b = new THREE_NS.Mesh(buildingGeo, seeded(i, cx + cz) > 0.5 ? mats.building : mats.building2);
      b.scale.set(8 + seeded(i, cx) * 8, h, 8 + seeded(cz, i) * 8);
      b.position.set(wx + sx, h / 2, wz + sz);
      b.castShadow = !isTouch;
      b.receiveShadow = true;
      group.add(b);
    }

    const pickupId = `p-${key}`;
    if (!state.collectedPickups.has(pickupId) && seeded(cx, cz) > 0.32) {
      const p = new THREE_NS.Mesh(pickupGeo, mats.pickup);
      p.position.set(wx + 18 - seeded(cx, cz) * 36, 2.2, wz + 18 - seeded(cz, cx) * 36);
      p.userData = { id: pickupId, kind: 'pickup' };
      group.add(p);
      world.pickups.set(pickupId, p);
    }

    if (seeded(cx * 9, cz * 2) > 0.72) {
      const lotId = `lot-${key}`;
      const lot = new THREE_NS.Mesh(lotGeo, state.ownedLots.has(lotId) ? mats.ownedLot : mats.lot);
      lot.position.set(wx + 25, 0.18, wz - 24);
      lot.userData = { id: lotId, price: 500 + Math.abs(cx + cz) * 80, kind: 'lot' };
      group.add(lot);
      world.lots.set(lotId, lot);
    }

    if (seeded(cx * 5, cz * 4) > 0.76) {
      const vId = `car-${key}`;
      const car = new THREE_NS.Mesh(carGeo, mats.car.clone());
      car.material.color.setHex(seeded(cx, cz) > 0.5 ? 0xff3366 : 0x17f3ff);
      car.position.set(wx - 18, 0.8, wz + 4);
      car.rotation.y = Math.PI * seeded(cx, cz);
      car.userData = { id: vId, kind: 'vehicle', hp: 100, gas: 100 };
      group.add(car);
      world.vehicles.set(vId, car);
    }

    if (seeded(cx * 8, cz * 11) > 0.7) {
      const npcId = `npc-${key}`;
      const npc = makeAvatar(0xffc857, 0xf7f9ff);
      npc.position.set(wx + 8, 0, wz - 10);
      npc.userData = { id: npcId, kind: 'npc', tip: tips[Math.floor(seeded(cx, cz) * tips.length)] };
      group.add(npc);
      world.npcs.set(npcId, npc);
    }

    scene.add(group);
    world.chunks.set(key, group);
  }

  const tips = [
    'Tip: Press E near cars to drive, then E again to exit.',
    'Tip: Own lots to grow your city empire.',
    'Tip: Collect green cubes for quick cash and XP.',
    'Tip: Use F3 to show performance debug stats.'
  ];

  function updateStreaming() {
    const pcx = Math.round(player.pos.x / world.chunkSize);
    const pcz = Math.round(player.pos.z / world.chunkSize);
    const needed = new Set();
    for (let x = pcx - world.radius; x <= pcx + world.radius; x++) {
      for (let z = pcz - world.radius; z <= pcz + world.radius; z++) {
        const key = chunkKey(x, z);
        needed.add(key);
        if (!world.chunks.has(key)) makeChunk(x, z);
      }
    }
    for (const [key, group] of world.chunks.entries()) {
      if (!needed.has(key)) {
        group.traverse((obj) => {
          if (obj.userData?.id) {
            world.vehicles.delete(obj.userData.id);
            world.npcs.delete(obj.userData.id);
            world.pickups.delete(obj.userData.id);
            world.lots.delete(obj.userData.id);
          }
        });
        scene.remove(group);
        world.chunks.delete(key);
      }
    }
  }

  function inputVector() {
    let x = controls.joystick.x;
    let z = controls.joystick.y;
    if (controls.keys.has('KeyW') || controls.keys.has('ArrowUp')) z -= 1;
    if (controls.keys.has('KeyS') || controls.keys.has('ArrowDown')) z += 1;
    if (controls.keys.has('KeyA') || controls.keys.has('ArrowLeft')) x -= 1;
    if (controls.keys.has('KeyD') || controls.keys.has('ArrowRight')) x += 1;
    const v = new THREE_NS.Vector2(x, z);
    if (v.lengthSq() > 1) v.normalize();
    return v;
  }

  function updatePlayer(dt) {
    const move = inputVector();
    const sprint = controls.keys.has('ShiftLeft') || controls.keys.has('ShiftRight') || controls.sprintHeld;
    if (state.inVehicle) {
      const car = state.inVehicle;
      const speed = (sprint ? player.vehicleSpeed * 1.35 : player.vehicleSpeed) * (car.userData.gas > 0 ? 1 : 0.35);
      car.rotation.y -= move.x * dt * 2.2;
      const forward = new THREE_NS.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
      car.position.addScaledVector(forward, -move.y * speed * dt);
      if (Math.abs(move.y) > 0.05) {
        car.userData.gas = Math.max(0, car.userData.gas - dt * 1.6);
        missionProgress.drive += Math.abs(move.y) * speed * dt;
      }
      player.pos.copy(car.position).add(new THREE_NS.Vector3(0, 1, 0));
      player.mesh.visible = false;
      player.yaw = car.rotation.y;
      return;
    }

    const camYaw = player.yaw;
    const forward = new THREE_NS.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE_NS.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const walkSpeed = player.speed * (sprint ? 1.55 : 1);
    const desired = new THREE_NS.Vector3().addScaledVector(right, move.x).addScaledVector(forward, -move.y);
    if (desired.lengthSq() > 0.0001) desired.normalize().multiplyScalar(walkSpeed);
    player.vel.x = desired.x;
    player.vel.z = desired.z;

    if (controls.jumpQueued && player.onGround) {
      player.vel.y = 9;
      player.onGround = false;
    }
    controls.jumpQueued = false;
    player.vel.y -= 24 * dt;
    player.pos.addScaledVector(player.vel, dt);
    if (player.pos.y <= 1) {
      player.pos.y = 1;
      player.vel.y = 0;
      player.onGround = true;
    }
    player.mesh.position.copy(player.pos).add(new THREE_NS.Vector3(0, -1, 0));
    player.mesh.rotation.y = player.yaw;
    player.mesh.visible = true;
  }

  function updateCamera() {
    const target = state.inVehicle ? state.inVehicle.position : player.pos;
    const distance = state.inVehicle ? 18 : 12;
    const height = state.inVehicle ? 10 : 7;
    const offset = new THREE_NS.Vector3(Math.sin(player.yaw) * distance, height, Math.cos(player.yaw) * distance);
    camera.position.lerp(target.clone().add(offset), 0.12);
    camera.lookAt(target.x, target.y + 2.5, target.z);
  }

  function interact() {
    const p = player.pos;
    const near = (map, maxDist) => {
      let best = null, bestD = maxDist * maxDist;
      for (const obj of map.values()) {
        const d = obj.position.distanceToSquared(p);
        if (d < bestD) { best = obj; bestD = d; }
      }
      return best;
    };

    if (state.inVehicle) {
      const car = state.inVehicle;
      state.inVehicle = null;
      player.pos.copy(car.position).add(new THREE_NS.Vector3(3, 1, 0));
      popup('Exited vehicle');
      return;
    }

    const vehicle = near(world.vehicles, 7);
    if (vehicle) {
      state.inVehicle = vehicle;
      popup('Vehicle entered');
      return;
    }

    const lot = near(world.lots, 8);
    if (lot) {
      const id = lot.userData.id;
      if (state.ownedLots.has(id)) return popup('You already own this lot');
      if (state.cash < lot.userData.price) return popup(`Need $${lot.userData.price} to buy this lot`, true);
      state.cash -= lot.userData.price;
      state.ownedLots.add(id);
      lot.material = mats.ownedLot;
      missionProgress.own = state.ownedLots.size;
      popup(`Lot bought for $${lot.userData.price}`);
      autosave(true);
      return;
    }

    const npc = near(world.npcs, 7);
    if (npc) {
      popup(npc.userData.tip || 'Welcome to NeonBlock City');
      return;
    }

    openMissionBoard();
  }

  function updatePickups(dt) {
    for (const [id, p] of Array.from(world.pickups.entries())) {
      p.rotation.y += dt * 2;
      p.position.y = 2.2 + Math.sin(performance.now() * 0.004 + p.position.x) * 0.3;
      if (p.position.distanceToSquared(player.pos) < 10) {
        state.collectedPickups.add(id);
        state.cash += 25;
        state.xp += 15;
        missionProgress.collect += 1;
        p.parent?.remove(p);
        world.pickups.delete(id);
        popup('+$25 Neon Cube');
      }
    }
  }

  function updateMissions() {
    if (!state.activeMission) return;
    const m = missions.find((item) => item.id === state.activeMission);
    if (!m || state.completedMissions.has(m.id)) return;
    const amount = missionProgress[m.type] || 0;
    if (amount >= m.target) {
      state.completedMissions.add(m.id);
      state.activeMission = null;
      state.cash += m.cash;
      state.xp += m.xp;
      popup(`Mission complete: ${m.title} +$${m.cash}`);
      autosave(true);
    }
  }

  function updateLevel() {
    state.level = 1 + Math.floor(state.xp / 250);
  }

  function openMissionBoard() {
    if (!hud.pause || !hud.missionBoard || !hud.missionList) return;
    state.paused = true;
    hud.pause.classList.remove('hidden');
    hud.missionBoard.classList.remove('hidden');
    hud.settingsPanel?.classList.add('hidden');
    hud.savePanel?.classList.add('hidden');
    hud.missionList.innerHTML = '';
    missions.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'mission-item';
      const done = state.completedMissions.has(m.id);
      li.innerHTML = `<strong>${m.title}</strong><small>${done ? 'Complete' : `Reward: $${m.cash} / ${m.xp} XP`}</small>`;
      const btn = document.createElement('button');
      btn.textContent = done ? 'Done' : (state.activeMission === m.id ? 'Active' : 'Start');
      btn.disabled = done;
      btn.addEventListener('click', () => { state.activeMission = m.id; closeMenus(); popup(`Mission started: ${m.title}`); });
      li.appendChild(btn);
      hud.missionList.appendChild(li);
    });
  }

  function closeMenus() {
    state.paused = false;
    hud.pause?.classList.add('hidden');
    hud.settingsPanel?.classList.add('hidden');
    hud.savePanel?.classList.add('hidden');
    hud.missionBoard?.classList.add('hidden');
  }

  function popup(text, warn = false) {
    if (!hud.reward) return;
    hud.reward.textContent = text;
    hud.reward.style.color = warn ? '#ff7899' : '#5ef38c';
    hud.reward.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => hud.reward.classList.add('hidden'), 2300);
  }

  function savePayload() {
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      cash: state.cash,
      xp: state.xp,
      level: state.level,
      wanted: state.wanted,
      position: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      yaw: player.yaw,
      ownedLots: Array.from(state.ownedLots),
      collectedPickups: Array.from(state.collectedPickups),
      completedMissions: Array.from(state.completedMissions),
      activeMission: state.activeMission,
      missionProgress
    };
  }

  function applySave(data) {
    if (!data || typeof data !== 'object') return false;
    state.cash = Number(data.cash ?? state.cash);
    state.xp = Number(data.xp ?? state.xp);
    state.level = Number(data.level ?? state.level);
    state.wanted = Number(data.wanted ?? state.wanted);
    player.yaw = Number(data.yaw ?? player.yaw);
    if (data.position) player.pos.set(Number(data.position.x || 0), Number(data.position.y || 1), Number(data.position.z || 0));
    state.ownedLots = new Set(data.ownedLots || []);
    state.collectedPickups = new Set(data.collectedPickups || []);
    state.completedMissions = new Set(data.completedMissions || []);
    state.activeMission = data.activeMission || null;
    missionProgress = Object.assign({ collect: 0, drive: 0, own: state.ownedLots.size }, data.missionProgress || {});
    for (const [id, lot] of world.lots.entries()) lot.material = state.ownedLots.has(id) ? mats.ownedLot : mats.lot;
    updateStreaming();
    popup('Save loaded');
    return true;
  }

  async function autosave(force = false) {
    const now = performance.now();
    if (!force && now - state.lastSaveAt < 12000) return;
    state.lastSaveAt = now;
    const data = savePayload();
    localStorage.setItem(`neonblock:${state.activeSlot}`, JSON.stringify(data));
    if (window.NeonBlockCloud?.save) {
      try {
        await window.NeonBlockCloud.save(state.activeSlot, data);
        state.cloudOnline = true;
      } catch (err) {
        state.cloudOnline = false;
        state.lastError = err?.message || 'cloud save failed';
      }
    }
  }

  async function loadSlot(slot = state.activeSlot) {
    state.activeSlot = slot;
    let raw = localStorage.getItem(`neonblock:${slot}`);
    if (window.NeonBlockCloud?.load) {
      try {
        const cloud = await window.NeonBlockCloud.load(slot);
        if (cloud) raw = JSON.stringify(cloud);
        state.cloudOnline = true;
      } catch (err) {
        state.cloudOnline = false;
        state.lastError = err?.message || 'cloud load failed';
      }
    }
    if (!raw) return false;
    try { return applySave(JSON.parse(raw)); }
    catch (err) { state.lastError = err.message; return false; }
  }

  function updateHud() {
    updateLevel();
    if (hud.cash) hud.cash.textContent = `$${Math.floor(state.cash)}`;
    if (hud.xp) hud.xp.textContent = Math.floor(state.xp);
    if (hud.level) hud.level.textContent = state.level;
    if (hud.wanted) hud.wanted.textContent = state.wanted;
    if (hud.online) hud.online.textContent = state.cloudOnline ? 'cloud' : 'local';
    if (hud.vehicle) hud.vehicle.textContent = state.inVehicle ? 'Neon Cruiser' : 'On foot';
    if (hud.vehicleHp) hud.vehicleHp.textContent = Math.floor(state.inVehicle?.userData.hp ?? 100);
    if (hud.vehicleGas) hud.vehicleGas.textContent = Math.floor(state.inVehicle?.userData.gas ?? 100);
    const m = missions.find((item) => item.id === state.activeMission);
    if (hud.mission) hud.mission.textContent = m ? `${m.title} ${Math.floor(missionProgress[m.type] || 0)}/${m.target}` : 'None';
    if (hud.debug && !hud.debug.classList.contains('hidden')) {
      hud.debugPos.textContent = `${player.pos.x.toFixed(1)},${player.pos.y.toFixed(1)},${player.pos.z.toFixed(1)}`;
      hud.debugChunks.textContent = world.chunks.size;
      hud.debugNpcs.textContent = world.npcs.size;
      hud.debugVehicle.textContent = state.inVehicle ? 'active' : 'none';
      hud.debugSlot.textContent = state.activeSlot;
      hud.debugOnline.textContent = state.cloudOnline ? 'cloud' : 'local';
      hud.debugError.textContent = state.lastError;
    }
  }

  let minimapCtx = document.getElementById('minimap-canvas')?.getContext('2d');
  function drawMinimap() {
    if (!minimapCtx) return;
    const ctx = minimapCtx;
    ctx.clearRect(0, 0, 160, 160);
    ctx.fillStyle = '#050814cc'; ctx.fillRect(0, 0, 160, 160);
    ctx.strokeStyle = '#17f3ff55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(80, 160); ctx.moveTo(0, 80); ctx.lineTo(160, 80); ctx.stroke();
    ctx.fillStyle = '#5ef38c';
    for (const p of world.pickups.values()) dot(ctx, p.position, 2);
    ctx.fillStyle = '#ffc857';
    for (const lot of world.lots.values()) if (!state.ownedLots.has(lot.userData.id)) dot(ctx, lot.position, 3);
    ctx.fillStyle = '#17f3ff';
    for (const lot of world.lots.values()) if (state.ownedLots.has(lot.userData.id)) dot(ctx, lot.position, 4);
    ctx.fillStyle = '#ff3366';
    for (const car of world.vehicles.values()) dot(ctx, car.position, 3);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(80, 80, 5, 0, Math.PI * 2); ctx.fill();
  }
  function dot(ctx, pos, size) {
    const s = 2.5;
    const x = 80 + (pos.x - player.pos.x) / s;
    const y = 80 + (pos.z - player.pos.z) / s;
    if (x < 0 || y < 0 || x > 160 || y > 160) return;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function setupControls() {
    addEventListener('keydown', (e) => {
      controls.keys.add(e.code);
      if (e.code === 'Space') controls.jumpQueued = true;
      if (e.code === 'KeyE') controls.interactQueued = true;
      if (e.code === 'Escape') state.paused ? closeMenus() : openPause();
      if (e.code === 'KeyM') openMissionBoard();
      if (e.code === 'F3') { e.preventDefault(); hud.debug?.classList.toggle('hidden'); }
      if (e.code === 'KeyR' && player.pos.y < -20) unstuck();
    });
    addEventListener('keyup', (e) => controls.keys.delete(e.code));
    canvas.addEventListener('pointerdown', pointerDown, { passive: false });
    canvas.addEventListener('pointermove', pointerMove, { passive: false });
    canvas.addEventListener('pointerup', pointerUp, { passive: false });
    canvas.addEventListener('pointercancel', pointerUp, { passive: false });

    document.getElementById('btn-mobile-jump')?.addEventListener('pointerdown', () => controls.jumpQueued = true);
    document.getElementById('btn-mobile-sprint')?.addEventListener('pointerdown', () => controls.sprintHeld = true);
    document.getElementById('btn-mobile-sprint')?.addEventListener('pointerup', () => controls.sprintHeld = false);
    document.getElementById('btn-mobile-interact')?.addEventListener('click', () => controls.interactQueued = true);
    document.getElementById('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    document.getElementById('btn-mobile-pause')?.addEventListener('click', openPause);

    document.getElementById('btn-resume')?.addEventListener('click', closeMenus);
    document.getElementById('btn-settings')?.addEventListener('click', () => { hud.settingsPanel?.classList.toggle('hidden'); hud.savePanel?.classList.add('hidden'); hud.missionBoard?.classList.add('hidden'); });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => hud.settingsPanel?.classList.add('hidden'));
    document.getElementById('btn-save')?.addEventListener('click', () => { hud.savePanel?.classList.toggle('hidden'); hud.settingsPanel?.classList.add('hidden'); hud.missionBoard?.classList.add('hidden'); });
    document.getElementById('btn-load')?.addEventListener('click', () => loadSlot(state.activeSlot));
    document.getElementById('btn-close-save')?.addEventListener('click', () => hud.savePanel?.classList.add('hidden'));
    document.getElementById('btn-close-missions')?.addEventListener('click', closeMenus);
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { state.activeSlot = b.dataset.slot; autosave(true); popup(`Saved ${state.activeSlot}`); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadSlot(b.dataset.slot)));
    document.getElementById('btn-export')?.addEventListener('click', () => { if (hud.exportJson) hud.exportJson.value = JSON.stringify(savePayload(), null, 2); });
    document.getElementById('btn-import')?.addEventListener('click', () => { try { applySave(JSON.parse(hud.exportJson.value)); autosave(true); } catch (e) { popup('Invalid save JSON', true); } });
    document.getElementById('graphics-quality')?.addEventListener('change', (e) => setQuality(e.target.value));
    addEventListener('pagehide', () => autosave(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(true); });
  }

  function pointerDown(e) {
    if (!isTouch) return;
    e.preventDefault();
    if (e.clientX < innerWidth * 0.45 && !controls.joystick.active) {
      controls.joystick.active = true; controls.joystick.id = e.pointerId; updateJoystick(e);
    } else if (!controls.look.active) {
      controls.look.active = true; controls.look.id = e.pointerId; controls.look.lastX = e.clientX; controls.look.lastY = e.clientY;
    }
  }
  function pointerMove(e) {
    if (controls.joystick.active && e.pointerId === controls.joystick.id) { e.preventDefault(); updateJoystick(e); }
    if (controls.look.active && e.pointerId === controls.look.id) {
      e.preventDefault();
      player.yaw -= (e.clientX - controls.look.lastX) * 0.006;
      controls.look.lastX = e.clientX; controls.look.lastY = e.clientY;
    }
  }
  function pointerUp(e) {
    if (e.pointerId === controls.joystick.id) resetJoystick();
    if (e.pointerId === controls.look.id) controls.look.active = false;
  }
  function updateJoystick(e) {
    const base = document.getElementById('joystick-container')?.getBoundingClientRect();
    const stick = document.getElementById('joystick-stick');
    if (!base || !stick) return;
    const cx = base.left + base.width / 2, cy = base.top + base.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = base.width * 0.36;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    controls.joystick.x = dx / max; controls.joystick.y = dy / max;
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function resetJoystick() {
    controls.joystick = { x: 0, y: 0, active: false, id: null };
    const stick = document.getElementById('joystick-stick');
    if (stick) stick.style.transform = 'translate(0,0)';
  }

  function openPause() { state.paused = true; hud.pause?.classList.remove('hidden'); }
  function unstuck() { player.pos.set(0, 1, 0); state.inVehicle = null; popup('Unstuck: returned to city center'); }
  function setQuality(value) {
    quality.tier = value === 'auto' ? (isTouch ? 'low' : 'medium') : value;
    world.radius = quality.tier === 'high' ? 4 : quality.tier === 'medium' ? 3 : 2;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.tier === 'high' ? 2 : quality.tier === 'medium' ? 1.5 : 1.15));
    updateStreaming();
  }

  let frames = 0, fpsTime = 0;
  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) {
      updatePlayer(dt);
      updateStreaming();
      updatePickups(dt);
      if (controls.interactQueued) { interact(); controls.interactQueued = false; }
      updateMissions();
      updateCamera();
      autosave(false);
    }
    updateHud();
    drawMinimap();
    renderer.render(scene, camera);
    frames++; fpsTime += dt;
    if (fpsTime > 0.5) { if (hud.debugFps) hud.debugFps.textContent = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  async function init() {
    hud.debug?.classList.add('hidden');
    setupControls();
    updateStreaming();
    await loadSlot('slot1');
    if (loading) loading.classList.add('hidden');
    popup('NeonBlock City loaded');
    tick();
  }

  init().catch((err) => {
    state.lastError = err.message || String(err);
    if (loading) loading.textContent = `Load error: ${state.lastError}`;
  });
})();
