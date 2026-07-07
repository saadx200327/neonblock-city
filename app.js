(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), debugOnline: $('debug-online'), error: $('debug-last-error'), reward: $('reward-popup')
  };
  const minimapCanvas = $('minimap-canvas');
  const minimap = minimapCanvas ? minimapCanvas.getContext('2d') : null;

  const THREE_NS = window.THREE;
  if (!THREE_NS || !canvas) {
    if (loading) loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load. Check connection and refresh.</div>';
    return;
  }

  const CFG = {
    chunkSize: 90,
    streamRadius: 2,
    despawnRadius: 3,
    playerRadius: 1.4,
    walkSpeed: 24,
    sprintSpeed: 37,
    carSpeed: 70,
    friction: 0.88,
    saveKey: 'neonblock-city-save-v3',
    slotPrefix: 'neonblock-city-slot-',
    version: 3
  };

  const state = {
    paused: false,
    last: performance.now(),
    fpsFrames: 0,
    fpsLast: performance.now(),
    cash: 100,
    xp: 0,
    level: 1,
    wanted: 0,
    slot: 'slot1',
    quality: localStorage.getItem('neonblock-quality') || 'auto',
    keys: new Set(),
    touch: { x: 0, y: 0, sprint: false, jump: false, interact: false },
    player: { x: 0, z: 0, y: 1.5, vx: 0, vz: 0, vy: 0, heading: 0, grounded: true },
    cameraAngle: Math.PI * 0.25,
    activeVehicle: null,
    chunks: new Map(),
    vehicles: [],
    pickups: [],
    npcs: [],
    lots: [],
    ownedLots: new Set(),
    completedPickups: new Set(),
    mission: null,
    toastTimer: 0,
    cloud: 'offline'
  };

  const missions = [
    { id: 'crate-run', name: 'Crate Run', text: 'Collect 5 neon crates', goal: 5, cash: 450, xp: 80, progress: 0 },
    { id: 'lot-owner', name: 'First Property', text: 'Buy any city lot', goal: 1, cash: 650, xp: 120, progress: 0 },
    { id: 'road-test', name: 'Road Test', text: 'Enter a vehicle and drive 600m', goal: 600, cash: 500, xp: 100, progress: 0 }
  ];

  const scene = new THREE_NS.Scene();
  scene.background = new THREE_NS.Color(0x050814);
  scene.fog = new THREE_NS.Fog(0x050814, 90, 350);

  const camera = new THREE_NS.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE_NS.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE_NS.PCFSoftShadowMap;

  scene.add(new THREE_NS.HemisphereLight(0x86f7ff, 0x090b18, 1.35));
  const sun = new THREE_NS.DirectionalLight(0xffffff, 1.25);
  sun.position.set(45, 80, 35); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);

  const mats = {
    ground: new THREE_NS.MeshStandardMaterial({ color: 0x12182f, roughness: 0.92 }),
    road: new THREE_NS.MeshStandardMaterial({ color: 0x11131a, roughness: 0.8 }),
    player: new THREE_NS.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x073a44, roughness: 0.45 }),
    glass: new THREE_NS.MeshStandardMaterial({ color: 0x3524ff, emissive: 0x0c0870, roughness: 0.4 }),
    crate: new THREE_NS.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x0f4d22, roughness: 0.35 }),
    lot: new THREE_NS.MeshStandardMaterial({ color: 0xffd166, emissive: 0x403000, roughness: 0.55 }),
    npc: new THREE_NS.MeshStandardMaterial({ color: 0xff66c4, emissive: 0x4d1138, roughness: 0.45 }),
    car: new THREE_NS.MeshStandardMaterial({ color: 0xff3366, emissive: 0x3d0715, roughness: 0.35 })
  };

  const playerMesh = makeAvatar(mats.player);
  scene.add(playerMesh);

  function makeAvatar(mat) {
    const g = new THREE_NS.Group();
    const body = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(2.2, 3, 1.5), mat); body.position.y = 2.2; body.castShadow = true; g.add(body);
    const head = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(1.45, 1.25, 1.45), mat); head.position.y = 4.45; head.castShadow = true; g.add(head);
    return g;
  }

  function hash(n) { const x = Math.sin(n * 999.17) * 43758.5453; return x - Math.floor(x); }
  function key(cx, cz) { return `${cx},${cz}`; }
  function dist2(a, b) { const dx = a.x - b.x; const dz = a.z - b.z; return dx * dx + dz * dz; }
  function chunkOf(v) { return Math.floor(v / CFG.chunkSize); }

  function makeBuilding(x, z, seed) {
    const h = 10 + Math.floor(hash(seed) * 45);
    const w = 8 + Math.floor(hash(seed + 1) * 16);
    const d = 8 + Math.floor(hash(seed + 2) * 16);
    const mat = new THREE_NS.MeshStandardMaterial({ color: new THREE_NS.Color().setHSL(0.58 + hash(seed + 3) * 0.16, 0.75, 0.28), emissive: 0x050824, roughness: 0.58 });
    const m = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function spawnChunk(cx, cz) {
    const id = key(cx, cz); if (state.chunks.has(id)) return;
    const root = new THREE_NS.Group(); root.name = `chunk-${id}`;
    const baseX = cx * CFG.chunkSize, baseZ = cz * CFG.chunkSize;
    const ground = new THREE_NS.Mesh(new THREE_NS.PlaneGeometry(CFG.chunkSize, CFG.chunkSize), mats.ground);
    ground.rotation.x = -Math.PI / 2; ground.position.set(baseX + CFG.chunkSize / 2, 0, baseZ + CFG.chunkSize / 2); ground.receiveShadow = true; root.add(ground);

    const roadW = 14;
    const road1 = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(CFG.chunkSize, 0.06, roadW), mats.road);
    road1.position.set(baseX + CFG.chunkSize / 2, 0.04, baseZ + CFG.chunkSize / 2); root.add(road1);
    const road2 = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(roadW, 0.06, CFG.chunkSize), mats.road);
    road2.position.set(baseX + CFG.chunkSize / 2, 0.05, baseZ + CFG.chunkSize / 2); root.add(road2);

    const seedBase = (cx + 1000) * 92821 + (cz + 1000) * 68917;
    for (let i = 0; i < 9; i++) {
      const ox = 12 + hash(seedBase + i * 7) * (CFG.chunkSize - 24);
      const oz = 12 + hash(seedBase + i * 11) * (CFG.chunkSize - 24);
      if (Math.abs(ox - CFG.chunkSize / 2) < 13 || Math.abs(oz - CFG.chunkSize / 2) < 13) continue;
      root.add(makeBuilding(baseX + ox, baseZ + oz, seedBase + i));
    }

    if (hash(seedBase + 88) > 0.45) addPickup(baseX + 20 + hash(seedBase + 9) * 50, baseZ + 20 + hash(seedBase + 10) * 50, id, seedBase);
    if (hash(seedBase + 90) > 0.62) addVehicle(baseX + 35 + hash(seedBase + 4) * 25, baseZ + 35 + hash(seedBase + 5) * 25, id);
    if (hash(seedBase + 91) > 0.55) addLot(baseX + 16 + hash(seedBase + 6) * 58, baseZ + 16 + hash(seedBase + 8) * 58, id, `lot-${id}`);
    if (hash(seedBase + 92) > 0.5) addNpc(baseX + 14 + hash(seedBase + 2) * 60, baseZ + 14 + hash(seedBase + 3) * 60, id);

    scene.add(root); state.chunks.set(id, root);
  }

  function unloadFarChunks() {
    const pcx = chunkOf(state.player.x), pcz = chunkOf(state.player.z);
    for (const [id, root] of [...state.chunks]) {
      const [cx, cz] = id.split(',').map(Number);
      if (Math.abs(cx - pcx) > CFG.despawnRadius || Math.abs(cz - pcz) > CFG.despawnRadius) {
        scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); state.chunks.delete(id);
      }
    }
    const keep = (o) => state.chunks.has(o.chunk);
    state.pickups = state.pickups.filter((o) => keep(o) || !scene.remove(o.mesh));
    state.vehicles = state.vehicles.filter((o) => keep(o) || o === state.activeVehicle || !scene.remove(o.mesh));
    state.lots = state.lots.filter((o) => keep(o) || !scene.remove(o.mesh));
    state.npcs = state.npcs.filter((o) => keep(o) || !scene.remove(o.mesh));
  }

  function updateStreaming() {
    const pcx = chunkOf(state.player.x), pcz = chunkOf(state.player.z);
    for (let x = pcx - CFG.streamRadius; x <= pcx + CFG.streamRadius; x++) for (let z = pcz - CFG.streamRadius; z <= pcz + CFG.streamRadius; z++) spawnChunk(x, z);
    unloadFarChunks();
  }

  function addPickup(x, z, chunk, seed) {
    const id = `crate-${chunk}-${Math.floor(seed)}`; if (state.completedPickups.has(id)) return;
    const mesh = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(2.2, 2.2, 2.2), mats.crate); mesh.position.set(x, 1.4, z); mesh.castShadow = true; scene.add(mesh);
    state.pickups.push({ id, x, z, chunk, mesh });
  }
  function addVehicle(x, z, chunk) {
    const mesh = new THREE_NS.Group();
    const body = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(5.5, 1.6, 8), mats.car); body.position.y = 1.4; body.castShadow = true; mesh.add(body);
    const top = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(4, 1.2, 3.8), mats.glass); top.position.y = 2.7; top.castShadow = true; mesh.add(top);
    mesh.position.set(x, 0, z); scene.add(mesh);
    state.vehicles.push({ x, z, vx: 0, vz: 0, hp: 100, gas: 100, chunk, mesh, entered: false, driven: 0 });
  }
  function addLot(x, z, chunk, id) {
    const mesh = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(12, 0.35, 12), mats.lot); mesh.position.set(x, 0.2, z); scene.add(mesh);
    state.lots.push({ id, x, z, price: 300 + Math.abs(chunkOf(x) + chunkOf(z)) * 75, chunk, mesh });
  }
  function addNpc(x, z, chunk) {
    const mesh = makeAvatar(mats.npc); mesh.position.set(x, 0, z); scene.add(mesh);
    state.npcs.push({ x, z, chunk, mesh, tip: 'Tip: collect crates, buy lots, and use E / Interact near cars.' });
  }

  function inputVector() {
    let x = 0, z = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) z -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) z += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    x += state.touch.x; z += state.touch.y;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, active: Math.hypot(x, z) > 0.08 };
  }

  function tick(dt) {
    if (state.paused) return;
    const iv = inputVector();
    const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.touch.sprint;
    if (state.activeVehicle) updateVehicle(dt, iv, sprint); else updatePlayer(dt, iv, sprint);
    if (state.keys.has('Space') || state.touch.jump) jump();
    if (state.keys.has('KeyE') || state.touch.interact) { interact(); state.touch.interact = false; }
    updateStreaming(); updateCollectibles(); updateCamera(dt); updateMission(dt); renderMinimap(); updateHud();
  }

  function updatePlayer(dt, iv, sprint) {
    const speed = sprint ? CFG.sprintSpeed : CFG.walkSpeed;
    state.player.vx = state.player.vx * CFG.friction + iv.x * speed * dt * 4;
    state.player.vz = state.player.vz * CFG.friction + iv.z * speed * dt * 4;
    state.player.x += state.player.vx * dt; state.player.z += state.player.vz * dt;
    state.player.vy -= 45 * dt; state.player.y += state.player.vy * dt;
    if (state.player.y <= 1.5) { state.player.y = 1.5; state.player.vy = 0; state.player.grounded = true; }
    if (iv.active) state.player.heading = Math.atan2(iv.x, iv.z);
    playerMesh.position.set(state.player.x, state.player.y - 1.5, state.player.z); playerMesh.rotation.y = state.player.heading;
  }

  function updateVehicle(dt, iv, sprint) {
    const car = state.activeVehicle; const speed = (sprint ? CFG.carSpeed * 1.2 : CFG.carSpeed) * Math.max(0.2, car.gas / 100);
    car.vx = car.vx * 0.94 + iv.x * speed * dt * 3; car.vz = car.vz * 0.94 + iv.z * speed * dt * 3;
    car.x += car.vx * dt; car.z += car.vz * dt; car.gas = Math.max(0, car.gas - (Math.abs(car.vx) + Math.abs(car.vz)) * dt * 0.018);
    car.driven += Math.hypot(car.vx * dt, car.vz * dt);
    if (Math.hypot(car.vx, car.vz) > 0.1) car.mesh.rotation.y = Math.atan2(car.vx, car.vz);
    car.mesh.position.set(car.x, 0, car.z); state.player.x = car.x; state.player.z = car.z + 2; playerMesh.position.set(car.x, -50, car.z);
  }

  function jump() { if (!state.activeVehicle && state.player.grounded) { state.player.vy = 18; state.player.grounded = false; } state.touch.jump = false; }

  function interact() {
    const p = state.player;
    if (state.activeVehicle) { playerMesh.position.set(p.x, 0, p.z + 5); state.activeVehicle = null; toast('Exited vehicle'); return; }
    let nearVehicle = state.vehicles.find((v) => dist2(p, v) < 80);
    if (nearVehicle) { state.activeVehicle = nearVehicle; nearVehicle.entered = true; toast('Vehicle entered'); return; }
    let nearLot = state.lots.find((l) => dist2(p, l) < 100 && !state.ownedLots.has(l.id));
    if (nearLot) {
      if (state.cash >= nearLot.price) { state.cash -= nearLot.price; state.ownedLots.add(nearLot.id); nearLot.mesh.material = mats.crate; addMissionProgress('lot-owner', 1); toast(`Lot owned -$${nearLot.price}`); saveGame(); }
      else toast(`Need $${nearLot.price} to buy this lot`);
      return;
    }
    let nearNpc = state.npcs.find((n) => dist2(p, n) < 90);
    if (nearNpc) toast(nearNpc.tip);
  }

  function updateCollectibles() {
    for (const item of [...state.pickups]) if (dist2(state.player, item) < 45) {
      state.completedPickups.add(item.id); scene.remove(item.mesh); state.pickups.splice(state.pickups.indexOf(item), 1);
      state.cash += 75; state.xp += 15; addMissionProgress('crate-run', 1); toast('Neon crate +$75 +15XP'); saveGame();
    }
    const nextLevel = state.level * 100;
    if (state.xp >= nextLevel) { state.xp -= nextLevel; state.level += 1; state.cash += state.level * 50; toast(`Level ${state.level}! Bonus cash`); }
  }

  function addMissionProgress(id, amount) { if (state.mission && state.mission.id === id) state.mission.progress = Math.min(state.mission.goal, state.mission.progress + amount); }
  function updateMission() {
    if (state.activeVehicle && state.mission && state.mission.id === 'road-test') state.mission.progress = Math.min(state.mission.goal, state.activeVehicle.driven);
    if (state.mission && state.mission.progress >= state.mission.goal) {
      state.cash += state.mission.cash; state.xp += state.mission.xp; toast(`Mission complete: ${state.mission.name}`); state.mission = null; saveGame();
    }
  }

  function updateCamera(dt) {
    const target = new THREE_NS.Vector3(state.player.x, 0, state.player.z);
    const dist = state.activeVehicle ? 42 : 32;
    const desired = new THREE_NS.Vector3(target.x - Math.sin(state.cameraAngle) * dist, 24, target.z + Math.cos(state.cameraAngle) * dist);
    camera.position.lerp(desired, Math.min(1, dt * 5)); camera.lookAt(target.x, 4, target.z);
  }

  function updateHud() {
    const car = state.activeVehicle;
    if (hud.cash) hud.cash.textContent = `$${state.cash}`; if (hud.xp) hud.xp.textContent = Math.floor(state.xp); if (hud.level) hud.level.textContent = state.level;
    if (hud.wanted) hud.wanted.textContent = state.wanted; if (hud.online) hud.online.textContent = state.cloud; if (hud.debugOnline) hud.debugOnline.textContent = state.cloud;
    if (hud.vehicle) hud.vehicle.textContent = car ? 'Neon Runner' : 'On foot'; if (hud.hp) hud.hp.textContent = car ? Math.floor(car.hp) : 100; if (hud.gas) hud.gas.textContent = car ? Math.floor(car.gas) : 100;
    if (hud.mission) hud.mission.textContent = state.mission ? `${state.mission.name} ${Math.floor(state.mission.progress)}/${state.mission.goal}` : 'None';
    if (hud.pos) hud.pos.textContent = `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`; if (hud.chunks) hud.chunks.textContent = state.chunks.size;
    if (hud.npcs) hud.npcs.textContent = state.npcs.length; if (hud.activeVehicle) hud.activeVehicle.textContent = car ? 'Neon Runner' : 'None'; if (hud.slot) hud.slot.textContent = state.slot;
  }

  function renderMinimap() {
    if (!minimap) return; minimap.clearRect(0, 0, 160, 160); minimap.fillStyle = '#07101f'; minimap.fillRect(0, 0, 160, 160);
    const scale = 0.6, cx = 80, cz = 80; minimap.fillStyle = '#17f3ff'; minimap.beginPath(); minimap.arc(cx, cz, 5, 0, Math.PI * 2); minimap.fill();
    minimap.fillStyle = '#5ef38c'; for (const p of state.pickups) dot(p); minimap.fillStyle = '#ff3366'; for (const v of state.vehicles) dot(v); minimap.fillStyle = '#ffd166'; for (const l of state.lots) dot(l);
    function dot(o) { const x = cx + (o.x - state.player.x) * scale, y = cz + (o.z - state.player.z) * scale; if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x - 2, y - 2, 4, 4); }
  }

  function toast(text) {
    if (!hud.reward) return; hud.reward.textContent = text; hud.reward.classList.remove('hidden'); state.toastTimer = 2.4;
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
    try { tick(dt); renderer.render(scene, camera); } catch (e) { if (hud.error) hud.error.textContent = e.message; console.error(e); }
    if (state.toastTimer > 0) { state.toastTimer -= dt; if (state.toastTimer <= 0 && hud.reward) hud.reward.classList.add('hidden'); }
    state.fpsFrames++; if (now - state.fpsLast > 700) { if (hud.fps) hud.fps.textContent = Math.round(state.fpsFrames * 1000 / (now - state.fpsLast)); state.fpsFrames = 0; state.fpsLast = now; }
    requestAnimationFrame(loop);
  }

  function payload() { return { version: CFG.version, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player, ownedLots: [...state.ownedLots], completedPickups: [...state.completedPickups], mission: state.mission, slot: state.slot, quality: state.quality }; }
  function applySave(data) {
    if (!data) return; state.cash = data.cash ?? state.cash; state.xp = data.xp ?? state.xp; state.level = data.level ?? state.level; state.wanted = data.wanted ?? 0;
    Object.assign(state.player, data.player || {}); state.ownedLots = new Set(data.ownedLots || []); state.completedPickups = new Set(data.completedPickups || []); state.mission = data.mission || null; state.slot = data.slot || state.slot; state.quality = data.quality || state.quality; updateStreaming(); toast('Save loaded');
  }
  async function saveGame(slot = state.slot) {
    state.slot = slot; const data = payload(); localStorage.setItem(CFG.saveKey, JSON.stringify(data)); localStorage.setItem(CFG.slotPrefix + slot, JSON.stringify(data));
    if (window.NeonBlockCloud?.save) try { await window.NeonBlockCloud.save(slot, data); state.cloud = 'cloud saved'; } catch { state.cloud = 'local only'; }
  }
  async function loadGame(slot = state.slot) {
    state.slot = slot; let raw = localStorage.getItem(CFG.slotPrefix + slot) || localStorage.getItem(CFG.saveKey);
    if (window.NeonBlockCloud?.load) try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); state.cloud = cloud ? 'cloud loaded' : 'local only'; } catch { state.cloud = 'local only'; }
    if (raw) applySave(JSON.parse(raw));
  }

  function wireMenus() {
    const pause = $('pause-overlay'), settings = $('settings-panel'), savePanel = $('save-panel'), board = $('mission-board'), list = $('mission-list');
    const setPaused = (v) => { state.paused = v; if (pause) pause.classList.toggle('hidden', !v); };
    $('btn-mobile-pause')?.addEventListener('click', () => setPaused(!state.paused)); $('btn-resume')?.addEventListener('click', () => setPaused(false));
    $('btn-settings')?.addEventListener('click', () => settings?.classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click', () => settings?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => savePanel?.classList.toggle('hidden')); $('btn-load')?.addEventListener('click', () => loadGame()); $('btn-close-save')?.addEventListener('click', () => savePanel?.classList.add('hidden'));
    $('graphics-quality')?.addEventListener('change', (e) => { state.quality = e.target.value; localStorage.setItem('neonblock-quality', state.quality); renderer.setPixelRatio(state.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.5)); });
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => saveGame(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { const t = $('export-json'); if (t) t.value = JSON.stringify(payload(), null, 2); });
    $('btn-import')?.addEventListener('click', () => { const t = $('export-json'); if (t?.value) { applySave(JSON.parse(t.value)); saveGame(); } });
    $('btn-close-missions')?.addEventListener('click', () => board?.classList.add('hidden'));
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape') setPaused(!state.paused); if (e.code === 'KeyM') openMissions(); state.keys.add(e.code); });
    window.addEventListener('keyup', (e) => state.keys.delete(e.code));
    function openMissions() { if (!board || !list) return; list.innerHTML = ''; missions.forEach((m) => { const li = document.createElement('li'); li.innerHTML = `<button>${m.name}</button><small>${m.text}</small>`; li.querySelector('button').onclick = () => { state.mission = { ...m, progress: 0 }; board.classList.add('hidden'); toast(`Mission started: ${m.name}`); }; list.appendChild(li); }); board.classList.remove('hidden'); setPaused(true); }
    window.NeonBlockCity = { saveGame, loadGame, openMissions, state };
  }

  function wireTouch() {
    const area = $('joystick-container'), stick = $('joystick-stick'); if (!area || !stick) return;
    let active = false, rect = null;
    const move = (clientX, clientY) => { rect = rect || area.getBoundingClientRect(); const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; let dx = clientX - cx, dy = clientY - cy; const max = rect.width * 0.35; const len = Math.hypot(dx, dy); if (len > max) { dx = dx / len * max; dy = dy / len * max; } state.touch.x = dx / max; state.touch.y = dy / max; stick.style.transform = `translate(${dx}px,${dy}px)`; };
    area.addEventListener('pointerdown', (e) => { active = true; rect = area.getBoundingClientRect(); area.setPointerCapture(e.pointerId); move(e.clientX, e.clientY); });
    area.addEventListener('pointermove', (e) => { if (active) move(e.clientX, e.clientY); });
    area.addEventListener('pointerup', () => { active = false; rect = null; state.touch.x = 0; state.touch.y = 0; stick.style.transform = 'translate(0,0)'; });
    $('btn-mobile-jump')?.addEventListener('click', () => { state.touch.jump = true; });
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => { state.touch.sprint = true; }); $('btn-mobile-sprint')?.addEventListener('pointerup', () => { state.touch.sprint = false; });
    $('btn-mobile-interact')?.addEventListener('click', () => { state.touch.interact = true; });
    $('btn-mobile-unstuck')?.addEventListener('click', () => { state.player.y = 3; state.player.vx = state.player.vz = state.player.vy = 0; toast('Unstuck'); });
  }

  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize);

  wireMenus(); wireTouch(); updateStreaming(); loadGame().finally(() => { if (loading) loading.classList.add('hidden'); toast('NeonBlock City ready'); requestAnimationFrame(loop); });
  setInterval(() => saveGame(), 30000);
})();
