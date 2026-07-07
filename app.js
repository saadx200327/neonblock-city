(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), onlineDebug: $('debug-online'), lastError: $('debug-last-error'), reward: $('reward-popup'), arrow: $('waypoint-arrow')
  };

  const SAVE_PREFIX = 'neonblock-city:';
  const CHUNK_SIZE = 90;
  const STREAM_RADIUS = 2;
  const MAX_NPCS = 34;
  const clock = { last: performance.now(), acc: 0, frames: 0, fps: 0 };
  const keys = new Set();
  const touch = { x: 0, y: 0, active: false, sprint: false, interact: false, jump: false };
  let lastError = 'none';

  const state = {
    cash: 125,
    xp: 0,
    level: 1,
    wanted: 0,
    slot: 'slot1',
    player: { x: 0, y: 1.2, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: true, sprint: 0 },
    cameraYaw: Math.PI * 0.25,
    activeVehicle: null,
    vehicles: [],
    lots: {},
    crates: {},
    missionIndex: 0,
    missionProgress: 0,
    settings: { graphics: localStorage.getItem(SAVE_PREFIX + 'graphics') || 'auto' },
    lastSave: 0
  };

  const missions = [
    { id: 'crate-run', name: 'Collect 3 neon crates', kind: 'crate', goal: 3, reward: 180, xp: 75 },
    { id: 'drive-school', name: 'Drive 650m without wrecking', kind: 'drive', goal: 650, reward: 260, xp: 120 },
    { id: 'lot-owner', name: 'Buy your first block lot', kind: 'lot', goal: 1, reward: 330, xp: 160 },
    { id: 'district-hop', name: 'Reach the blue district beacon', kind: 'beacon', goal: 1, reward: 420, xp: 210, target: { x: 250, z: -230 } }
  ];

  if (!window.THREE) {
    showFatal('Three.js did not load. Check the CDN connection or bundle three locally.');
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a18);
  scene.fog = new THREE.Fog(0x070a18, 90, 470);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  const hemi = new THREE.HemisphereLight(0x7dd9ff, 0x15111f, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0x7be9ff, 1.6);
  sun.position.set(70, 130, 40);
  sun.castShadow = true;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  scene.add(sun);

  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x11162c, roughness: 0.92 }),
    road: new THREE.MeshStandardMaterial({ color: 0x151823, roughness: 0.82 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x083d44, roughness: 0.4 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.55 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x174f28, roughness: 0.35 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x4d7dff, emissive: 0x1b35aa, transparent: true, opacity: 0.55 }),
    lot: new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x473508, roughness: 0.55 }),
    ownedLot: new THREE.MeshStandardMaterial({ color: 0xb46cff, emissive: 0x35115f, roughness: 0.45 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xff7af5, emissive: 0x3b1038, roughness: 0.45 })
  };

  const world = new THREE.Group();
  const dynamic = new THREE.Group();
  const npcGroup = new THREE.Group();
  scene.add(world, dynamic, npcGroup);

  const player = makePlayer();
  scene.add(player.group);

  const chunks = new Map();
  const npcs = [];
  const interactables = [];
  const scratchVec = new THREE.Vector3();
  const minimap = $('minimap-canvas')?.getContext('2d');

  setupControls();
  setupMenus();
  loadGame(state.slot, true);
  seedVehicles();
  streamWorld(true);
  updateHud();
  setTimeout(() => loading?.classList.add('hidden'), 250);
  requestAnimationFrame(loop);

  function makePlayer() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.7), mats.player);
    body.position.y = 1.3;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), new THREE.MeshStandardMaterial({ color: 0xffd49a, roughness: 0.5 }));
    head.position.y = 2.55;
    head.castShadow = true;
    group.add(body, head);
    return { group, body, head };
  }

  function seedVehicles() {
    if (state.vehicles.length === 0) {
      state.vehicles = [
        { id: 'volt-bike', x: 18, z: 10, yaw: 0.2, hp: 100, gas: 100, owned: true, speed: 26 },
        { id: 'block-runner', x: -45, z: 24, yaw: 1.1, hp: 100, gas: 92, owned: false, speed: 33 },
        { id: 'cargo-cube', x: 82, z: -70, yaw: -0.7, hp: 120, gas: 80, owned: false, speed: 22 }
      ];
    }
    for (const v of state.vehicles) if (!v.mesh) v.mesh = makeVehicle(v);
  }

  function makeVehicle(v) {
    const group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: v.owned ? 0x19f3ff : 0xff7a33, emissive: v.owned ? 0x07363b : 0x331006, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 5), paint);
    body.position.y = 0.85;
    body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.2), new THREE.MeshStandardMaterial({ color: 0x10152e, metalness: 0.15, roughness: 0.28 }));
    cabin.position.set(0, 1.65, -0.55);
    cabin.castShadow = true;
    for (const sx of [-1.5, 1.5]) for (const sz of [-1.8, 1.8]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 14), mats.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(sx, 0.42, sz);
      group.add(tire);
    }
    group.add(body, cabin);
    group.position.set(v.x, 0, v.z);
    group.rotation.y = v.yaw;
    group.userData.vehicle = v;
    dynamic.add(group);
    return group;
  }

  function streamWorld(force = false) {
    const px = Math.floor(state.player.x / CHUNK_SIZE);
    const pz = Math.floor(state.player.z / CHUNK_SIZE);
    const needed = new Set();
    for (let x = px - STREAM_RADIUS; x <= px + STREAM_RADIUS; x++) {
      for (let z = pz - STREAM_RADIUS; z <= pz + STREAM_RADIUS; z++) {
        const key = `${x},${z}`;
        needed.add(key);
        if (!chunks.has(key)) chunks.set(key, createChunk(x, z));
      }
    }
    for (const [key, chunk] of chunks) {
      if (!needed.has(key)) {
        world.remove(chunk.group);
        chunk.group.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
        chunks.delete(key);
      }
    }
    if (force) updateMissionBoard();
  }

  function createChunk(cx, cz) {
    const group = new THREE.Group();
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 0.3, CHUNK_SIZE), mats.ground);
    ground.position.set(ox + CHUNK_SIZE / 2, -0.16, oz + CHUNK_SIZE / 2);
    ground.receiveShadow = true;
    group.add(ground);

    const roadW = 10;
    const roadX = new THREE.Mesh(new THREE.BoxGeometry(roadW, 0.05, CHUNK_SIZE), mats.road);
    roadX.position.set(ox + CHUNK_SIZE / 2, 0.02, oz + CHUNK_SIZE / 2);
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 0.05, roadW), mats.road);
    roadZ.position.set(ox + CHUNK_SIZE / 2, 0.03, oz + CHUNK_SIZE / 2);
    group.add(roadX, roadZ);

    const count = 5 + Math.abs(hash(cx, cz)) % 5;
    for (let i = 0; i < count; i++) {
      const h = 8 + (Math.abs(hash(cx, cz, i)) % 32);
      const w = 7 + (Math.abs(hash(i, cx)) % 12);
      const d = 7 + (Math.abs(hash(i, cz)) % 12);
      const bx = ox + 14 + ((i * 19 + Math.abs(hash(cx, i)) % 17) % 65);
      const bz = oz + 14 + ((i * 23 + Math.abs(hash(cz, i)) % 19) % 65);
      if (Math.abs((bx % CHUNK_SIZE) - CHUNK_SIZE / 2) < 9 || Math.abs((bz % CHUNK_SIZE) - CHUNK_SIZE / 2) < 9) continue;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((Math.abs(hash(cx, cz, i)) % 360) / 360), 0.6, 0.35), emissive: 0x080818, roughness: 0.62 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(bx, h / 2, bz);
      b.castShadow = h < 28;
      b.receiveShadow = true;
      group.add(b);
    }

    const crateId = `crate:${cx}:${cz}`;
    if (!state.crates[crateId] && Math.abs(hash(cx, cz, 77)) % 3 === 0) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats.crate);
      crate.position.set(ox + 18 + Math.abs(hash(cx, 5)) % 54, 1.1, oz + 18 + Math.abs(hash(cz, 8)) % 54);
      crate.userData = { type: 'crate', id: crateId };
      group.add(crate);
      interactables.push(crate);
    }

    const lotId = `lot:${cx}:${cz}`;
    if (Math.abs(hash(cx, cz, 12)) % 4 === 0) {
      const owned = !!state.lots[lotId];
      const lot = new THREE.Mesh(new THREE.BoxGeometry(10, 0.35, 10), owned ? mats.ownedLot : mats.lot);
      lot.position.set(ox + 70, 0.22, oz + 18);
      lot.userData = { type: 'lot', id: lotId, price: 250 + (Math.abs(hash(cx, cz)) % 5) * 100 };
      group.add(lot);
      interactables.push(lot);
      if (owned) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 0.45), mats.ownedLot);
        sign.position.set(lot.position.x, 2.7, lot.position.z);
        group.add(sign);
      }
    }

    if (npcs.length < MAX_NPCS && Math.abs(hash(cx, cz, 99)) % 2 === 0) {
      const npc = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), mats.npc);
      npc.position.set(ox + 30 + Math.abs(hash(cx, 2)) % 42, 0.9, oz + 28 + Math.abs(hash(cz, 3)) % 44);
      npc.userData = { type: 'npc', baseX: npc.position.x, baseZ: npc.position.z, t: Math.random() * 9 };
      group.add(npc);
      npcs.push(npc);
      interactables.push(npc);
    }

    if (cx === 2 && cz === -3) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 55, 24, 1, true), mats.beacon);
      beacon.position.set(250, 27, -230);
      beacon.userData = { type: 'beacon' };
      group.add(beacon);
      interactables.push(beacon);
    }

    world.add(group);
    return { group, cx, cz };
  }

  function setupControls() {
    addEventListener('keydown', (e) => {
      keys.add(e.code);
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyR') unstuck();
      if (e.code === 'KeyM') openMissionBoard();
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    let dragX = 0;
    canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (e.buttons) { state.cameraYaw -= (e.clientX - dragX) * 0.006; dragX = e.clientX; } });
    const joy = $('joystick-container');
    const stick = $('joystick-stick');
    joy?.addEventListener('pointerdown', joystickMove);
    joy?.addEventListener('pointermove', joystickMove);
    joy?.addEventListener('pointerup', joystickEnd);
    joy?.addEventListener('pointercancel', joystickEnd);
    function joystickMove(e) {
      const r = joy.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const max = 42;
      touch.x = Math.max(-1, Math.min(1, dx / max));
      touch.y = Math.max(-1, Math.min(1, dy / max));
      touch.active = true;
      stick.style.transform = `translate(${Math.min(max, len) * dx / len}px, ${Math.min(max, len) * dy / len}px)`;
      e.preventDefault();
    }
    function joystickEnd() {
      touch.x = 0; touch.y = 0; touch.active = false;
      if (stick) stick.style.transform = 'translate(0,0)';
    }
    bindHold('btn-mobile-sprint', (v) => touch.sprint = v);
    bindTap('btn-mobile-jump', () => touch.jump = true);
    bindTap('btn-mobile-interact', () => interact());
    bindTap('btn-mobile-unstuck', () => unstuck());
    bindTap('btn-mobile-pause', () => togglePause());
  }

  function bindHold(id, fn) {
    const el = $(id); if (!el) return;
    ['pointerdown','touchstart'].forEach(ev => el.addEventListener(ev, (e) => { fn(true); e.preventDefault(); }));
    ['pointerup','pointercancel','touchend'].forEach(ev => el.addEventListener(ev, () => fn(false)));
  }
  function bindTap(id, fn) { $(id)?.addEventListener('click', (e) => { e.preventDefault(); fn(); }); }

  function setupMenus() {
    bindTap('btn-resume', () => togglePause(false));
    bindTap('btn-settings', () => $('settings-panel')?.classList.remove('hidden'));
    bindTap('btn-close-settings', () => $('settings-panel')?.classList.add('hidden'));
    bindTap('btn-save', () => openSavePanel());
    bindTap('btn-load', () => openSavePanel());
    bindTap('btn-close-save', () => $('save-panel')?.classList.add('hidden'));
    bindTap('btn-close-missions', () => $('mission-board')?.classList.add('hidden'));
    bindTap('btn-export', () => { $('export-json').value = JSON.stringify(exportState(), null, 2); });
    bindTap('btn-import', () => { try { importState(JSON.parse($('export-json').value)); popup('Imported save JSON'); } catch (e) { setError(e); } });
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => saveGame(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    const q = $('graphics-quality');
    if (q) {
      q.value = state.settings.graphics;
      q.addEventListener('change', () => { state.settings.graphics = q.value; localStorage.setItem(SAVE_PREFIX + 'graphics', q.value); applyGraphics(); });
    }
    updateMissionBoard();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - clock.last) / 1000 || 0.016);
    clock.last = now;
    clock.acc += dt; clock.frames++;
    if (clock.acc >= 0.5) { clock.fps = Math.round(clock.frames / clock.acc); clock.acc = 0; clock.frames = 0; }
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const paused = !$('pause-overlay')?.classList.contains('hidden');
    if (paused) return;
    updateMovement(dt);
    updateNpcs(dt);
    streamWorld();
    updateMission(dt);
    updateCamera(dt);
    updateHud();
    updateMinimap();
    if (performance.now() - state.lastSave > 15000) saveGame(state.slot, true);
  }

  function updateMovement(dt) {
    const p = state.player;
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (touch.active ? touch.y : 0);
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (touch.active ? touch.x : 0);
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint;
    if (state.activeVehicle) return updateVehicle(dt, forward, strafe, sprint);
    const len = Math.hypot(forward, strafe);
    const speed = sprint ? 16 : 9;
    if (len > 0.04) {
      const ang = Math.atan2(strafe, forward) + state.cameraYaw;
      p.vx = Math.sin(ang) * speed * Math.min(1, len);
      p.vz = Math.cos(ang) * speed * Math.min(1, len);
      p.yaw = ang;
    } else { p.vx *= 0.82; p.vz *= 0.82; }
    if ((keys.has('Space') || touch.jump) && p.onGround) { p.vy = 10; p.onGround = false; }
    touch.jump = false;
    p.vy -= 26 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 1.2) { p.y = 1.2; p.vy = 0; p.onGround = true; }
    player.group.position.set(p.x, p.y - 1.2, p.z);
    player.group.rotation.y = p.yaw;
  }

  function updateVehicle(dt, forward, strafe, sprint) {
    const v = state.activeVehicle;
    if (!v || v.gas <= 0 || v.hp <= 0) return;
    v.yaw -= strafe * dt * 2.3;
    const speed = (sprint ? v.speed * 1.25 : v.speed) * forward;
    v.x += Math.sin(v.yaw) * speed * dt;
    v.z += Math.cos(v.yaw) * speed * dt;
    v.gas = Math.max(0, v.gas - Math.abs(speed) * dt * 0.035);
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.yaw;
    state.player.x = v.x + Math.sin(v.yaw) * -1.5;
    state.player.z = v.z + Math.cos(v.yaw) * -1.5;
    state.player.y = 1.2;
    player.group.position.set(state.player.x, 0, state.player.z);
    player.group.rotation.y = v.yaw;
    if (Math.abs(speed) > 1) state.missionProgress += missions[state.missionIndex]?.kind === 'drive' ? Math.abs(speed) * dt : 0;
  }

  function updateCamera(dt) {
    const target = state.activeVehicle ? state.activeVehicle.mesh.position : player.group.position;
    const dist = state.activeVehicle ? 20 : 13;
    const height = state.activeVehicle ? 10 : 7;
    const desired = scratchVec.set(target.x - Math.sin(state.cameraYaw) * dist, target.y + height, target.z - Math.cos(state.cameraYaw) * dist);
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(target.x, target.y + 2.2, target.z);
  }

  function updateNpcs(dt) {
    for (const npc of npcs) {
      npc.userData.t += dt;
      npc.position.x = npc.userData.baseX + Math.sin(npc.userData.t) * 2.5;
      npc.rotation.y += dt * 0.8;
    }
  }

  function updateMission() {
    const m = missions[state.missionIndex];
    if (!m) return;
    if (m.kind === 'beacon') {
      const d = Math.hypot(state.player.x - m.target.x, state.player.z - m.target.z);
      if (d < 12) state.missionProgress = 1;
      hud.arrow.style.transform = `rotate(${Math.atan2(m.target.x - state.player.x, m.target.z - state.player.z) - state.cameraYaw}rad)`;
    } else hud.arrow.style.transform = 'rotate(0rad)';
    if (state.missionProgress >= m.goal) completeMission(m);
  }

  function completeMission(m) {
    state.cash += m.reward;
    state.xp += m.xp;
    state.level = 1 + Math.floor(state.xp / 250);
    popup(`Mission complete: ${m.name} +$${m.reward}`);
    state.missionIndex = (state.missionIndex + 1) % missions.length;
    state.missionProgress = 0;
    updateMissionBoard();
  }

  function interact() {
    const p = state.player;
    let nearest = null, best = 8;
    for (const v of state.vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < best) { best = d; nearest = { type: 'vehicle', v }; }
    }
    for (const obj of interactables) {
      if (!obj.parent) continue;
      const d = Math.hypot(obj.position.x - p.x, obj.position.z - p.z);
      if (d < best) { best = d; nearest = { type: obj.userData.type, obj }; }
    }
    if (state.activeVehicle) { state.activeVehicle = null; popup('Exited vehicle'); return; }
    if (!nearest) { popup('Nothing nearby. Walk to a crate, vehicle, NPC, or lot.'); return; }
    if (nearest.type === 'vehicle') { state.activeVehicle = nearest.v; popup(`Entered ${nearest.v.id}`); return; }
    if (nearest.type === 'crate') {
      state.crates[nearest.obj.userData.id] = true;
      nearest.obj.parent.remove(nearest.obj);
      state.cash += 45; state.xp += 20;
      if (missions[state.missionIndex]?.kind === 'crate') state.missionProgress += 1;
      popup('Neon crate collected +$45');
    }
    if (nearest.type === 'lot') {
      const id = nearest.obj.userData.id;
      const price = nearest.obj.userData.price;
      if (state.lots[id]) return popup('You already own this block lot');
      if (state.cash < price) return popup(`Need $${price} to buy this lot`);
      state.cash -= price;
      state.lots[id] = { boughtAt: Date.now(), price };
      nearest.obj.material = mats.ownedLot;
      if (missions[state.missionIndex]?.kind === 'lot') state.missionProgress = 1;
      popup(`Lot purchased for $${price}`);
    }
    if (nearest.type === 'npc') popup('NPC: Press M for missions. Crates, cars, and lots pay fast.');
  }

  function updateHud() {
    hud.cash.textContent = `$${Math.round(state.cash)}`;
    hud.xp.textContent = Math.round(state.xp);
    hud.level.textContent = state.level;
    hud.wanted.textContent = state.wanted;
    hud.online.textContent = window.NeonBlockCloud?.isConfigured ? 'cloud optional' : 'offline';
    const v = state.activeVehicle;
    hud.vehicle.textContent = v ? v.id : 'On foot';
    hud.hp.textContent = v ? Math.round(v.hp) : 100;
    hud.gas.textContent = v ? Math.round(v.gas) : 100;
    const m = missions[state.missionIndex];
    hud.mission.textContent = m ? `${m.name} ${Math.floor(state.missionProgress)}/${m.goal}` : 'Free roam';
    hud.fps.textContent = clock.fps;
    hud.pos.textContent = `${state.player.x.toFixed(0)},${state.player.y.toFixed(0)},${state.player.z.toFixed(0)}`;
    hud.chunks.textContent = chunks.size;
    hud.npcs.textContent = npcs.length;
    hud.activeVehicle.textContent = v ? v.id : 'None';
    hud.saveSlot.textContent = state.slot;
    hud.onlineDebug.textContent = hud.online.textContent;
    hud.lastError.textContent = lastError;
  }

  function updateMinimap() {
    if (!minimap) return;
    minimap.clearRect(0, 0, 160, 160);
    minimap.fillStyle = '#070a18'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff55';
    for (let i = -2; i <= 2; i++) { minimap.beginPath(); minimap.moveTo(80 + i * 22, 0); minimap.lineTo(80 + i * 22, 160); minimap.stroke(); minimap.beginPath(); minimap.moveTo(0, 80 + i * 22); minimap.lineTo(160, 80 + i * 22); minimap.stroke(); }
    minimap.fillStyle = '#5ef38c';
    minimap.beginPath(); minimap.arc(80, 80, 5, 0, Math.PI * 2); minimap.fill();
    minimap.fillStyle = '#ffcc33';
    for (const v of state.vehicles) {
      const x = 80 + (v.x - state.player.x) * 0.35;
      const y = 80 + (v.z - state.player.z) * 0.35;
      if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  function saveGame(slot = state.slot, silent = false) {
    state.slot = slot;
    state.lastSave = performance.now();
    localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(exportState()));
    if (window.NeonBlockCloud?.save) window.NeonBlockCloud.save(slot, exportState()).catch(setError);
    if (!silent) popup(`Saved ${slot}`);
  }

  function loadGame(slot = state.slot, silent = false) {
    state.slot = slot;
    const raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (raw) importState(JSON.parse(raw));
    if (!silent) popup(`Loaded ${slot}`);
  }

  function exportState() {
    return {
      version: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, slot: state.slot,
      player: state.player, vehicles: state.vehicles.map(({ mesh, ...v }) => v), lots: state.lots, crates: state.crates,
      missionIndex: state.missionIndex, missionProgress: state.missionProgress, settings: state.settings
    };
  }

  function importState(data) {
    Object.assign(state, {
      cash: data.cash ?? state.cash, xp: data.xp ?? state.xp, level: data.level ?? state.level, wanted: data.wanted ?? 0,
      slot: data.slot ?? state.slot, lots: data.lots ?? {}, crates: data.crates ?? {}, missionIndex: data.missionIndex ?? 0,
      missionProgress: data.missionProgress ?? 0, settings: { ...state.settings, ...(data.settings || {}) }
    });
    Object.assign(state.player, data.player || {});
    if (Array.isArray(data.vehicles)) {
      for (const old of state.vehicles) if (old.mesh) dynamic.remove(old.mesh);
      state.vehicles = data.vehicles;
      seedVehicles();
    }
    player.group.position.set(state.player.x, state.player.y - 1.2, state.player.z);
    updateHud();
  }

  function updateMissionBoard() {
    const list = $('mission-list'); if (!list) return;
    list.innerHTML = missions.map((m, i) => `<li><strong>${i === state.missionIndex ? '▶ ' : ''}${m.name}</strong><br><span>$${m.reward} / ${m.xp} XP</span></li>`).join('');
  }
  function openMissionBoard() { $('pause-overlay')?.classList.remove('hidden'); $('mission-board')?.classList.remove('hidden'); updateMissionBoard(); }
  function openSavePanel() { $('save-panel')?.classList.remove('hidden'); }
  function togglePause(force) { const el = $('pause-overlay'); if (!el) return; el.classList.toggle('hidden', force === undefined ? undefined : !force); }
  function unstuck() { state.player.x = 0; state.player.y = 1.2; state.player.z = 0; state.player.vx = state.player.vy = state.player.vz = 0; state.activeVehicle = null; popup('Unstuck: returned to spawn'); }
  function popup(text) { hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => hud.reward.classList.add('hidden'), 2200); }
  function setError(e) { lastError = (e && e.message) ? e.message : String(e); console.warn(e); }
  function showFatal(msg) { if (loading) { loading.querySelector('.loading-sub').textContent = msg; } else alert(msg); }
  function applyGraphics() { const low = state.settings.graphics === 'low' || (state.settings.graphics === 'auto' && navigator.hardwareConcurrency <= 4); renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio || 1, 1.7)); renderer.shadowMap.enabled = !low; }
  function hash(...nums) { let h = 2166136261; for (const n of nums) { h ^= (n + 4096) | 0; h = Math.imul(h, 16777619); } return h | 0; }
})();
