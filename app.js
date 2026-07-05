(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), debugOnline: $('debug-online'), error: $('debug-last-error')
  };

  const WORLD = { chunk: 160, view: 2, buildingGap: 32, maxNpcs: 28, maxPickups: 34 };
  const keys = new Set();
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const state = {
    paused: false, cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', quality: 'auto',
    onGround: true, jumpVel: 0, activeVehicle: null, owned: new Set(), completed: new Set(),
    mission: null, messageTimer: 0, lastError: 'none', joystick: { x: 0, y: 0, active: false }, sprintMobile: false
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 90, 520);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);

  scene.add(new THREE.HemisphereLight(0x9bdcff, 0x101020, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(80, 140, 40);
  scene.add(sun);

  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x141827, roughness: 0.88 }),
    lane: new THREE.MeshBasicMaterial({ color: 0x17f3ff }),
    grass: new THREE.MeshStandardMaterial({ color: 0x09201c, roughness: 1 }),
    player: new THREE.MeshStandardMaterial({ color: 0x38f6ff, emissive: 0x072c36, roughness: 0.45 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xff4fd8, emissive: 0x2b0524 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.5 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x0a3218 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x123a20 }),
    marker: new THREE.MeshBasicMaterial({ color: 0xff3366 })
  };

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 13, 5), materials.player);
  body.position.y = 8;
  const head = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), materials.player);
  head.position.y = 18;
  player.add(body, head);
  player.position.set(0, 0, 0);
  player.userData.speed = 42;
  scene.add(player);

  const chunks = new Map();
  const npcs = [];
  const vehicles = [];
  const pickups = [];
  const propertyMarkers = [];
  const missionMarker = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1, 24), materials.marker);
  missionMarker.visible = false;
  scene.add(missionMarker);

  const missions = [
    { id: 'courier-1', name: 'Neon Courier', text: 'Reach the pink beacon and deliver the package.', reward: 90, xp: 55, target: new THREE.Vector3(130, 0, -120) },
    { id: 'taxi-1', name: 'Block Taxi', text: 'Drive to the north pickup zone.', reward: 140, xp: 80, target: new THREE.Vector3(-190, 0, -220), needsVehicle: true },
    { id: 'collector-1', name: 'Data Chips', text: 'Collect glowing chips around the city.', reward: 70, xp: 70, collect: 5 }
  ];

  function setError(e) { state.lastError = String(e && e.message ? e.message : e).slice(0, 90); if (hud.error) hud.error.textContent = state.lastError; }
  function showReward(text) { const el = $('reward-popup'); el.textContent = text; el.classList.remove('hidden'); state.messageTimer = 2.8; }
  function rand(seed) { let x = Math.sin(seed * 999.123) * 10000; return x - Math.floor(x); }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function createBuilding(x, z, seed) {
    const h = 18 + Math.floor(rand(seed) * 64);
    const geo = new THREE.BoxGeometry(16 + rand(seed + 1) * 18, h, 16 + rand(seed + 2) * 18);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + rand(seed + 3) * 0.18, 0.65, 0.22 + rand(seed + 4) * 0.16), emissive: 0x030916, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    return mesh;
  }

  function makeChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData.cx = cx; group.userData.cz = cz;
    const baseX = cx * WORLD.chunk, baseZ = cz * WORLD.chunk;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.chunk, WORLD.chunk), materials.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(baseX + WORLD.chunk / 2, -0.05, baseZ + WORLD.chunk / 2);
    group.add(ground);

    const roadW = 20;
    const roadX = new THREE.Mesh(new THREE.BoxGeometry(roadW, 0.15, WORLD.chunk), materials.road);
    roadX.position.set(baseX + WORLD.chunk / 2, 0, baseZ + WORLD.chunk / 2);
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(WORLD.chunk, 0.16, roadW), materials.road);
    roadZ.position.copy(roadX.position);
    group.add(roadX, roadZ);

    for (let i = 0; i < 2; i++) {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, WORLD.chunk * 0.82), materials.lane);
      lane.position.set(baseX + WORLD.chunk / 2 + (i ? 5 : -5), 0.12, baseZ + WORLD.chunk / 2);
      group.add(lane);
    }

    let seed = (cx + 17) * 91 + (cz - 8) * 37;
    for (let gx = 24; gx < WORLD.chunk; gx += WORLD.buildingGap) {
      for (let gz = 24; gz < WORLD.chunk; gz += WORLD.buildingGap) {
        const nearRoad = Math.abs(gx - WORLD.chunk / 2) < 28 || Math.abs(gz - WORLD.chunk / 2) < 28;
        if (!nearRoad && rand(seed + gx + gz) > 0.26) group.add(createBuilding(baseX + gx, baseZ + gz, seed + gx * 3 + gz));
      }
    }

    if (rand(seed + 3) > 0.55) spawnVehicle(baseX + WORLD.chunk / 2 + 28, baseZ + WORLD.chunk / 2 - 18, group);
    if (rand(seed + 4) > 0.45) spawnPickup(baseX + 24 + rand(seed + 5) * 100, baseZ + 24 + rand(seed + 6) * 100, group);
    if (rand(seed + 7) > 0.62) spawnProperty(baseX + 24 + rand(seed + 8) * 105, baseZ + 24 + rand(seed + 9) * 105, group);
    scene.add(group);
    chunks.set(chunkKey(cx, cz), group);
  }

  function spawnVehicle(x, z, parent) {
    if (vehicles.length > 20) return;
    const car = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 24), materials.vehicle);
    base.position.y = 3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), materials.vehicle);
    top.position.set(0, 8, -2);
    car.add(base, top);
    car.position.set(x, 0, z);
    car.userData = { hp: 100, gas: 100, speed: 0, name: 'Neon Kart' };
    parent.add(car); vehicles.push(car);
  }

  function spawnPickup(x, z, parent) {
    if (pickups.length > WORLD.maxPickups) return;
    const chip = new THREE.Mesh(new THREE.OctahedronGeometry(4), materials.pickup);
    chip.position.set(x, 5, z);
    chip.userData.value = 15;
    parent.add(chip); pickups.push(chip);
  }

  function spawnProperty(x, z, parent) {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2, 6), materials.owned);
    marker.position.set(x, 1, z);
    marker.userData = { id: `p-${Math.round(x)}-${Math.round(z)}`, price: 250, owned: false };
    parent.add(marker); propertyMarkers.push(marker);
  }

  function updateChunks() {
    const pcx = Math.floor(player.position.x / WORLD.chunk), pcz = Math.floor(player.position.z / WORLD.chunk);
    for (let x = pcx - WORLD.view; x <= pcx + WORLD.view; x++) for (let z = pcz - WORLD.view; z <= pcz + WORLD.view; z++) if (!chunks.has(chunkKey(x, z))) makeChunk(x, z);
    for (const [key, group] of chunks) {
      if (Math.abs(group.userData.cx - pcx) > WORLD.view + 1 || Math.abs(group.userData.cz - pcz) > WORLD.view + 1) {
        scene.remove(group); chunks.delete(key);
      }
    }
  }

  function spawnNpcs() {
    while (npcs.length < WORLD.maxNpcs) {
      const npc = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), materials.npc);
      npc.position.set(player.position.x + (Math.random() - 0.5) * 260, 6, player.position.z + (Math.random() - 0.5) * 260);
      npc.userData = { angle: Math.random() * Math.PI * 2, timer: Math.random() * 3 };
      scene.add(npc); npcs.push(npc);
    }
  }

  function startMission(i = 0) {
    const available = missions.filter(m => !state.completed.has(m.id));
    state.mission = available[i % available.length] || missions[0];
    if (state.mission.target) {
      missionMarker.visible = true;
      missionMarker.position.copy(state.mission.target).add(new THREE.Vector3(0, 1, 0));
    }
    showReward(`Mission started: ${state.mission.name}`);
  }

  function completeMission() {
    if (!state.mission) return;
    state.cash += state.mission.reward; state.xp += state.mission.xp; state.completed.add(state.mission.id);
    showReward(`+${state.mission.reward} cash, +${state.mission.xp} XP`);
    state.mission = null; missionMarker.visible = false;
  }

  function enterNearestVehicle() {
    if (state.activeVehicle) { state.activeVehicle.visible = true; state.activeVehicle.position.copy(player.position); state.activeVehicle = null; return; }
    let best = null, dist = 999;
    for (const v of vehicles) { const d = v.getWorldPosition(tmp).distanceTo(player.position); if (d < dist) { best = v; dist = d; } }
    if (best && dist < 22) { state.activeVehicle = best; best.visible = false; player.position.copy(best.getWorldPosition(tmp)); showReward('Entered Neon Kart'); }
  }

  function interact() {
    for (const p of propertyMarkers) {
      const pos = p.getWorldPosition(tmp);
      if (pos.distanceTo(player.position) < 18) {
        const id = p.userData.id;
        if (state.owned.has(id)) return showReward('You already own this block');
        if (state.cash >= p.userData.price) { state.cash -= p.userData.price; state.owned.add(id); p.scale.setScalar(1.3); return showReward('Block owned: passive income unlocked'); }
        return showReward(`Need ${p.userData.price} cash to buy this block`);
      }
    }
    if (!state.mission) return startMission(Math.floor(Math.random() * missions.length));
    enterNearestVehicle();
  }

  function save(slot = state.slot) {
    state.slot = slot;
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, position: player.position.toArray(), owned: [...state.owned], completed: [...state.completed] };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    if (window.NeonBlockCloud?.save) window.NeonBlockCloud.save(slot, data).then(() => updateOnline('cloud saved')).catch(setError);
    showReward('Game saved'); return data;
  }

  function load(slot = state.slot) {
    state.slot = slot;
    const raw = localStorage.getItem(`neonblock:${slot}`);
    if (!raw) return showReward('No local save yet');
    applySave(JSON.parse(raw)); showReward('Game loaded');
  }

  function applySave(data) {
    state.cash = data.cash ?? state.cash; state.xp = data.xp ?? 0; state.level = data.level ?? 1; state.wanted = data.wanted ?? 0;
    state.owned = new Set(data.owned || []); state.completed = new Set(data.completed || []);
    if (data.position) player.position.fromArray(data.position);
  }

  function updateOnline(text) { if (hud.online) hud.online.textContent = text; if (hud.debugOnline) hud.debugOnline.textContent = text; }

  function setupControls() {
    addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === 'Escape') togglePause(); if (e.key.toLowerCase() === 'e') interact(); if (e.key.toLowerCase() === 'f') enterNearestVehicle(); });
    addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    $('btn-mobile-pause').onclick = togglePause; $('btn-mobile-interact').onclick = interact; $('btn-mobile-unstuck').onclick = () => { player.position.y = 0; state.jumpVel = 0; showReward('Unstuck'); };
    $('btn-mobile-jump').onclick = jump;
    $('btn-mobile-sprint').addEventListener('pointerdown', () => state.sprintMobile = true); $('btn-mobile-sprint').addEventListener('pointerup', () => state.sprintMobile = false);
    const joy = $('joystick-container'), stick = $('joystick-stick');
    const moveJoy = (e) => { const r = joy.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; const len = Math.min(46, Math.hypot(x, y)); const a = Math.atan2(y, x); state.joystick.x = Math.cos(a) * len / 46; state.joystick.y = Math.sin(a) * len / 46; stick.style.transform = `translate(${state.joystick.x * 36}px,${state.joystick.y * 36}px)`; };
    joy.addEventListener('pointerdown', e => { state.joystick.active = true; joy.setPointerCapture(e.pointerId); moveJoy(e); });
    joy.addEventListener('pointermove', e => { if (state.joystick.active) moveJoy(e); });
    joy.addEventListener('pointerup', () => { state.joystick.active = false; state.joystick.x = 0; state.joystick.y = 0; stick.style.transform = ''; });
    $('btn-resume').onclick = togglePause; $('btn-settings').onclick = () => $('settings-panel').classList.toggle('hidden'); $('btn-save').onclick = () => $('save-panel').classList.toggle('hidden');
    $('btn-load').onclick = () => load(state.slot); $('btn-close-settings').onclick = () => $('settings-panel').classList.add('hidden'); $('btn-close-save').onclick = () => $('save-panel').classList.add('hidden');
    document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => save(b.dataset.slot)); document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => load(b.dataset.slot));
    $('btn-export').onclick = () => { $('export-json').value = JSON.stringify(save(state.slot)); };
    $('btn-import').onclick = () => { try { applySave(JSON.parse($('export-json').value)); save(state.slot); } catch (e) { setError(e); showReward('Import failed'); } };
    $('graphics-quality').onchange = (e) => { state.quality = e.target.value; renderer.setPixelRatio(state.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.5)); };
  }

  function jump() { if (state.onGround) { state.jumpVel = 52; state.onGround = false; } }
  function togglePause() { state.paused = !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }

  function updatePlayer(dt) {
    if (keys.has(' ') || keys.has('arrowup') && keys.has('shift')) jump();
    let x = 0, z = 0;
    if (keys.has('w') || keys.has('arrowup')) z -= 1; if (keys.has('s') || keys.has('arrowdown')) z += 1; if (keys.has('a') || keys.has('arrowleft')) x -= 1; if (keys.has('d') || keys.has('arrowright')) x += 1;
    if (state.joystick.active) { x += state.joystick.x; z += state.joystick.y; }
    const len = Math.hypot(x, z) || 1;
    const sprint = keys.has('shift') || state.sprintMobile;
    const speed = (state.activeVehicle ? 92 : 42) * (sprint ? 1.55 : 1);
    player.position.x += (x / len) * speed * dt; player.position.z += (z / len) * speed * dt;
    if (x || z) player.rotation.y = Math.atan2(x, z);
    state.jumpVel -= 120 * dt; player.position.y += state.jumpVel * dt;
    if (player.position.y <= 0) { player.position.y = 0; state.jumpVel = 0; state.onGround = true; }
    if (state.activeVehicle) { state.activeVehicle.userData.gas = Math.max(0, state.activeVehicle.userData.gas - Math.hypot(x, z) * dt * 2.5); }
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; if (!p.parent) { pickups.splice(i, 1); continue; }
      p.rotation.y += dt * 2; p.position.y = 5 + Math.sin(performance.now() * 0.004 + i) * 1.2;
      if (p.getWorldPosition(tmp).distanceTo(player.position) < 12) { state.cash += p.userData.value; state.xp += 10; p.parent.remove(p); pickups.splice(i, 1); if (state.mission?.id === 'collector-1') state.mission.collected = (state.mission.collected || 0) + 1; showReward('+15 cash chip'); }
    }
  }

  function updateNpcs(dt) {
    for (const n of npcs) { n.userData.timer -= dt; if (n.userData.timer <= 0) { n.userData.angle += (Math.random() - 0.5) * 1.8; n.userData.timer = 1 + Math.random() * 3; } n.position.x += Math.sin(n.userData.angle) * dt * 12; n.position.z += Math.cos(n.userData.angle) * dt * 12; }
  }

  function updateMission() {
    if (!state.mission) return;
    if (state.mission.needsVehicle && !state.activeVehicle) return;
    if (state.mission.collect && (state.mission.collected || 0) >= state.mission.collect) return completeMission();
    if (state.mission.target && player.position.distanceTo(state.mission.target) < 18) completeMission();
  }

  function updateCamera(dt) {
    const behind = new THREE.Vector3(Math.sin(player.rotation.y) * -52, 42, Math.cos(player.rotation.y) * -52);
    const target = player.position.clone().add(behind);
    camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    camera.lookAt(player.position.x, player.position.y + 10, player.position.z);
  }

  function updateHud(dt) {
    state.level = Math.max(1, Math.floor(state.xp / 120) + 1);
    const v = state.activeVehicle?.userData;
    hud.cash.textContent = Math.floor(state.cash); hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.vehicle.textContent = state.activeVehicle ? v.name : 'On foot'; hud.hp.textContent = v ? Math.floor(v.hp) : 100; hud.gas.textContent = v ? Math.floor(v.gas) : 100;
    hud.mission.textContent = state.mission ? `${state.mission.name}${state.mission.collect ? ` ${state.mission.collected || 0}/${state.mission.collect}` : ''}` : 'None';
    hud.pos.textContent = `${player.position.x.toFixed(0)},${player.position.y.toFixed(0)},${player.position.z.toFixed(0)}`; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.length;
    hud.activeVehicle.textContent = state.activeVehicle ? 'Neon Kart' : 'None'; hud.slot.textContent = state.slot; hud.error.textContent = state.lastError;
    if (state.messageTimer > 0) { state.messageTimer -= dt; if (state.messageTimer <= 0) $('reward-popup').classList.add('hidden'); }
  }

  let frames = 0, fpsTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) {
      updatePlayer(dt); updateChunks(); spawnNpcs(); updateNpcs(dt); updatePickups(dt); updateMission(); updateCamera(dt);
      propertyMarkers.forEach(p => { if (state.owned.has(p.userData.id)) p.scale.setScalar(1.25); });
    }
    updateHud(dt); renderer.render(scene, camera);
    frames++; fpsTime += dt; if (fpsTime > 0.5) { hud.fps.textContent = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
  }

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  function boot() {
    try {
      setupControls(); updateChunks(); spawnNpcs(); startMission(0); updateOnline(window.NeonBlockCloud ? 'cloud optional' : 'offline/local');
      loading?.classList.add('hidden'); animate();
    } catch (e) { setError(e); console.error(e); }
  }
  boot();
})();
