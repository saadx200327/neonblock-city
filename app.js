(() => {
  'use strict';

  const SAVE_PREFIX = 'neonblock-city:';
  const VERSION = 'loop16-playable-mobile';
  const CHUNK = 96;
  const RADIUS = matchMedia('(max-width: 760px), (pointer: coarse)').matches ? 1 : 2;
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const $ = (id) => document.getElementById(id);

  const ui = {
    loading: $('loading-screen'), cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'), reward: $('reward-popup'),
    pause: $('pause-overlay'), settings: $('settings-panel'), savePanel: $('save-panel'), missionBoard: $('mission-board'), missionList: $('mission-list'),
    mini: $('minimap-canvas'), debug: $('debug-overlay'), fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'),
    activeVehicle: $('debug-active-vehicle'), saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error'), exportJson: $('export-json'), stick: $('joystick-stick')
  };

  if (!window.THREE) {
    ui.loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load.</div>';
    return;
  }

  const state = {
    cash: 150, xp: 0, level: 1, wanted: 0, paused: false, slot: 'slot1', online: false, lastError: 'none',
    ownedLots: [], collectedPickups: [], completedMissions: [], mission: 'starter-delivery', missionProgress: 0, lastSave: 0
  };
  const player = { pos: new THREE.Vector3(0, 1.2, 0), vel: new THREE.Vector3(), yaw: 0, grounded: true, vehicle: null };
  const input = { keyboardF: 0, keyboardR: 0, joyF: 0, joyR: 0, lookX: 0, jump: false, sprint: false, interact: false };
  const keys = new Set();
  const chunks = new Map();
  const vehicles = new Map();
  const lots = new Map();
  const pickups = new Map();
  const npcs = new Map();

  const missions = [
    { id: 'starter-delivery', name: 'Block Delivery', type: 'pickup', goal: 3, reward: 180, xp: 70, desc: 'Collect 3 neon bolts.' },
    { id: 'taxi-loop', name: 'Taxi Loop', type: 'drive', goal: 3, reward: 260, xp: 90, desc: 'Drive fast for 3 route points.' },
    { id: 'land-owner', name: 'First Lot', type: 'own', goal: 1, reward: 120, xp: 90, desc: 'Buy one glowing city lot.' }
  ];

  const canvas = $('game-canvas');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a18);
  scene.fog = new THREE.Fog(0x070a18, 70, mobile ? 260 : 430);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  renderer.shadowMap.enabled = !mobile;
  scene.add(new THREE.HemisphereLight(0xa6d8ff, 0x101020, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(30, 50, 20);
  sun.castShadow = !mobile;
  scene.add(sun);

  const mat = {
    ground: new THREE.MeshStandardMaterial({ color: 0x07111f, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 }),
    walk: new THREE.MeshStandardMaterial({ color: 0x26324c, roughness: 0.75 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x073640 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x0c6427 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x332100 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x2c1065, transparent: true, opacity: 0.6 })
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.55, 0.8), mat.player);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.85), mat.player);
  head.position.y = 1.85;
  playerMesh.add(body, head);
  scene.add(playerMesh);

  function seeded(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), h ^= h >>> 16) >>> 0) / 4294967295;
  }
  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = !mobile; return mesh;
  }
  function key(cx, cz) { return `${cx},${cz}`; }
  function currentChunk() { return [Math.floor(player.pos.x / CHUNK), Math.floor(player.pos.z / CHUNK)]; }

  function streamWorld() {
    const [pcx, pcz] = currentChunk();
    const need = new Set();
    for (let x = pcx - RADIUS; x <= pcx + RADIUS; x++) for (let z = pcz - RADIUS; z <= pcz + RADIUS; z++) {
      const k = key(x, z); need.add(k); if (!chunks.has(k)) makeChunk(x, z, k);
    }
    for (const [k, group] of chunks) if (!need.has(k)) {
      scene.remove(group); chunks.delete(k);
      group.userData.ids?.forEach((id) => { vehicles.delete(id); lots.delete(id); pickups.delete(id); npcs.delete(id); });
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }

  function makeChunk(cx, cz, k) {
    const rand = seeded(k), group = new THREE.Group(), ids = [];
    group.userData.ids = ids;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    group.add(box(CHUNK, 0.08, 14, mat.road, ox + CHUNK / 2, 0.02, oz + CHUNK / 2));
    group.add(box(14, 0.08, CHUNK, mat.road, ox + CHUNK / 2, 0.03, oz + CHUNK / 2));
    group.add(box(CHUNK, 0.07, 4, mat.walk, ox + CHUNK / 2, 0.05, oz + 8));
    group.add(box(4, 0.07, CHUNK, mat.walk, ox + 8, 0.05, oz + CHUNK / 2));
    for (let i = 0; i < (mobile ? 5 : 9); i++) {
      const h = 6 + rand() * 26, x = ox + 16 + rand() * 64, z = oz + 16 + rand() * 64;
      if (Math.abs(x - (ox + CHUNK / 2)) < 13 || Math.abs(z - (oz + CHUNK / 2)) < 13) continue;
      const c = new THREE.Color().setHSL(0.55 + rand() * 0.18, 0.65, 0.32);
      group.add(box(8 + rand() * 12, h, 8 + rand() * 12, new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.2) }), x, h / 2, z));
    }
    if ((cx + cz) % 2 === 0) addPickup(group, ids, `${k}:pickup`, ox + 24 + rand() * 48, oz + 24 + rand() * 48);
    if ((cx - cz) % 3 === 0) addLot(group, ids, `${k}:lot`, ox + 70, oz + 25, 100 + Math.abs(cx * 35 + cz * 45));
    if ((cx + cz) % 4 === 0) addVehicle(group, ids, `${k}:car`, ox + 50, oz + 50);
    if ((cx * 7 + cz) % 5 === 0) addNpc(group, ids, `${k}:npc`, ox + 36, oz + 64);
    chunks.set(k, group); scene.add(group);
  }
  function addPickup(group, ids, id, x, z) {
    if (state.collectedPickups.includes(id)) return;
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), mat.pickup); mesh.position.set(x, 1.5, z);
    pickups.set(id, { id, mesh, value: 25 }); ids.push(id); group.add(mesh);
  }
  function addVehicle(group, ids, id, x, z) {
    const mesh = new THREE.Group();
    mesh.add(box(4.3, 1.1, 6, new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x062f36 }), 0, 0.8, 0));
    mesh.add(box(3, 0.7, 2.4, new THREE.MeshStandardMaterial({ color: 0x050814 }), 0, 1.5, -0.35));
    mesh.position.set(x, 0, z); group.add(mesh);
    vehicles.set(id, { id, mesh, hp: 100, gas: 100, speed: 0 }); ids.push(id);
  }
  function addLot(group, ids, id, x, z, price) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.15, 12), mat.lot); mesh.position.set(x, 0.1, z); group.add(mesh);
    lots.set(id, { id, mesh, price }); ids.push(id);
  }
  function addNpc(group, ids, id, x, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), mat.npc); mesh.position.set(x, 0.9, z); group.add(mesh);
    npcs.set(id, { id, mesh, tip: 'Tip: press E / Interact near cars or glowing lots.' }); ids.push(id);
  }

  function getMove() {
    const kf = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const kr = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    input.keyboardF = kf; input.keyboardR = kr;
    const f = Math.abs(input.joyF) > 0.05 ? input.joyF : kf;
    const r = Math.abs(input.joyR) > 0.05 ? input.joyR : kr;
    return { f, r, sprint: input.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight') };
  }

  function tick(dt) {
    if (state.paused) return;
    if (input.interact) { input.interact = false; interact(); }
    const move = getMove();
    player.yaw -= input.lookX * 0.004; input.lookX *= 0.45;
    if (player.vehicle) moveVehicle(dt, move); else movePlayer(dt, move);
    collectPickups(); streamWorld(); updateCamera(dt); updateHud(); drawMap();
    if (performance.now() - state.lastSave > 12000) saveGame(false);
  }
  function movePlayer(dt, move) {
    const speed = move.sprint ? 10 : 6;
    const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const v = forward.multiplyScalar(move.f).add(right.multiplyScalar(move.r)); if (v.lengthSq() > 1) v.normalize();
    player.vel.x = v.x * speed; player.vel.z = v.z * speed;
    if (input.jump && player.grounded) { player.vel.y = 8.5; player.grounded = false; } input.jump = false;
    player.vel.y -= 24 * dt; player.pos.addScaledVector(player.vel, dt);
    if (player.pos.y < 1.2) { player.pos.y = 1.2; player.vel.y = 0; player.grounded = true; }
    playerMesh.visible = true; playerMesh.position.copy(player.pos); playerMesh.rotation.y = player.yaw;
  }
  function moveVehicle(dt, move) {
    const car = player.vehicle;
    car.speed += move.f * 22 * dt; car.speed *= 0.965; car.speed = THREE.MathUtils.clamp(car.speed, -12, 28);
    if (Math.abs(car.speed) > 0.25) car.mesh.rotation.y -= move.r * dt * Math.sign(car.speed) * 1.8;
    car.gas = Math.max(0, car.gas - Math.abs(car.speed) * dt * 0.045); if (car.gas <= 0) car.speed = 0;
    car.mesh.position.addScaledVector(new THREE.Vector3(Math.sin(car.mesh.rotation.y), 0, Math.cos(car.mesh.rotation.y)), car.speed * dt);
    player.pos.set(car.mesh.position.x, 1.2, car.mesh.position.z); player.yaw = car.mesh.rotation.y; playerMesh.visible = false;
    if (Math.abs(car.speed) > 12) progress('drive', dt * 0.35);
  }
  function collectPickups() {
    for (const [id, p] of [...pickups]) {
      p.mesh.rotation.y += 0.05;
      if (player.pos.distanceTo(p.mesh.position) < 3) { state.cash += p.value; state.xp += 10; state.collectedPickups.push(id); pickups.delete(id); p.mesh.visible = false; popup('Neon bolt +$' + p.value); progress('pickup'); }
    }
  }
  function interact() {
    const origin = player.vehicle ? player.vehicle.mesh.position : player.pos;
    let best = null, dist = 8;
    for (const v of vehicles.values()) { const d = origin.distanceTo(v.mesh.position); if (d < dist) { best = ['vehicle', v]; dist = d; } }
    for (const l of lots.values()) { const d = origin.distanceTo(l.mesh.position); if (d < dist) { best = ['lot', l]; dist = d; } }
    for (const n of npcs.values()) { const d = origin.distanceTo(n.mesh.position); if (d < dist) { best = ['npc', n]; dist = d; } }
    if (player.vehicle && (!best || best[0] === 'vehicle')) { player.vehicle = null; popup('Exited vehicle'); return; }
    if (!best) return popup('Nothing nearby');
    const [type, item] = best;
    if (type === 'vehicle') { player.vehicle = item; popup('Entered Neon Cruiser'); }
    if (type === 'npc') popup(item.tip);
    if (type === 'lot') {
      if (state.ownedLots.includes(item.id)) popup('Already owned');
      else if (state.cash >= item.price) { state.cash -= item.price; state.ownedLots.push(item.id); popup('Bought lot for $' + item.price); progress('own'); }
      else popup('Need $' + item.price);
    }
    saveGame(false);
  }

  function activeMission() { return missions.find(m => m.id === state.mission); }
  function progress(type, amount = 1) {
    const m = activeMission(); if (!m || m.type !== type || state.completedMissions.includes(m.id)) return;
    state.missionProgress = Math.min(m.goal, state.missionProgress + amount);
    if (state.missionProgress >= m.goal) {
      state.completedMissions.push(m.id); state.cash += m.reward; state.xp += m.xp; state.level = 1 + Math.floor(state.xp / 120);
      popup(`Mission complete: ${m.name} +$${m.reward}`);
      const next = missions.find(x => !state.completedMissions.includes(x.id)); state.mission = next?.id || null; state.missionProgress = 0;
    }
  }
  function chooseMission(id) { state.mission = id; state.missionProgress = 0; popup('Mission started: ' + activeMission()?.name); openPause(false); }

  function updateCamera(dt) {
    const t = player.vehicle ? player.vehicle.mesh.position : player.pos;
    const back = new THREE.Vector3(Math.sin(player.yaw + Math.PI), 0, Math.cos(player.yaw + Math.PI)).multiplyScalar(player.vehicle ? 16 : 10);
    const desired = t.clone().add(back).add(new THREE.Vector3(0, player.vehicle ? 9 : 6, 0));
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt)); camera.lookAt(t.x, t.y + 2, t.z);
  }
  function updateHud() {
    ui.cash.textContent = '$' + Math.floor(state.cash); ui.xp.textContent = Math.floor(state.xp); ui.level.textContent = state.level; ui.wanted.textContent = state.wanted;
    ui.online.textContent = state.online ? 'cloud-ready' : 'offline'; ui.debugOnline.textContent = ui.online.textContent;
    ui.vehicle.textContent = player.vehicle ? 'Neon Cruiser' : 'On foot'; ui.hp.textContent = player.vehicle ? Math.round(player.vehicle.hp) : 100; ui.gas.textContent = player.vehicle ? Math.round(player.vehicle.gas) : 100;
    const m = activeMission(); ui.mission.textContent = m ? `${m.name} ${Math.floor(state.missionProgress)}/${m.goal}` : 'Free roam';
    ui.chunks.textContent = chunks.size; ui.npcs.textContent = npcs.size; ui.activeVehicle.textContent = player.vehicle?.id || 'None'; ui.saveSlot.textContent = state.slot; ui.lastError.textContent = state.lastError;
    ui.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`;
  }
  function drawMap() {
    const ctx = ui.mini?.getContext('2d'); if (!ctx) return; const px = player.pos.x, pz = player.pos.z;
    ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#050814cc'; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = '#17f3ff66'; ctx.strokeRect(2, 2, 156, 156);
    const dot = (x, z, color, r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(80 + (x - px) / 4, 80 + (z - pz) / 4, r, 0, Math.PI * 2); ctx.fill(); };
    for (const v of vehicles.values()) dot(v.mesh.position.x, v.mesh.position.z, '#17f3ff');
    for (const l of lots.values()) dot(l.mesh.position.x, l.mesh.position.z, state.ownedLots.includes(l.id) ? '#5ef38c' : '#7c3aed');
    for (const p of pickups.values()) dot(p.mesh.position.x, p.mesh.position.z, '#5ef38c', 2);
    dot(px, pz, '#fff', 4);
  }

  function popup(text) { ui.reward.textContent = text; ui.reward.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => ui.reward.classList.add('hidden'), 2200); }
  function payload() { return { version: VERSION, state, player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw } }; }
  async function saveGame(show = true) {
    state.lastSave = performance.now(); const data = payload(); localStorage.setItem(SAVE_PREFIX + state.slot, JSON.stringify(data));
    if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(state.slot, data); state.online = true; } catch (e) { state.online = false; state.lastError = 'cloud optional: ' + e.message; } }
    if (show) popup('Game saved');
  }
  async function loadGame(slot = state.slot) {
    let raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (!raw && window.NeonBlockCloud?.load) { try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); } catch (e) { state.lastError = e.message; } }
    if (!raw) return;
    try { const data = JSON.parse(raw); Object.assign(state, data.state || {}); state.slot = slot; if (data.player) { player.pos.set(data.player.x || 0, data.player.y || 1.2, data.player.z || 0); player.yaw = data.player.yaw || 0; } }
    catch (e) { state.lastError = e.message; popup('Save load failed'); }
  }
  function openPause(open = true) { state.paused = open; ui.pause.classList.toggle('hidden', !open); }

  function bindHold(id, down, up = () => {}) { const b = $(id); if (!b) return; b.addEventListener('pointerdown', e => { e.preventDefault(); down(); }); b.addEventListener('pointerup', e => { e.preventDefault(); up(); }); b.addEventListener('pointercancel', up); }
  bindHold('btn-mobile-jump', () => input.jump = true); bindHold('btn-mobile-sprint', () => input.sprint = true, () => input.sprint = false); bindHold('btn-mobile-interact', () => input.interact = true); bindHold('btn-mobile-pause', () => openPause(true)); bindHold('btn-mobile-unstuck', () => { player.pos.y = 2; player.vel.set(0,0,0); popup('Unstuck'); });
  bindHold('btn-resume', () => openPause(false)); bindHold('btn-settings', () => ui.settings.classList.toggle('hidden')); bindHold('btn-close-settings', () => ui.settings.classList.add('hidden')); bindHold('btn-save', () => ui.savePanel.classList.toggle('hidden')); bindHold('btn-load', () => loadGame(state.slot)); bindHold('btn-close-save', () => ui.savePanel.classList.add('hidden')); bindHold('btn-close-missions', () => ui.missionBoard.classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; saveGame(true); }));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot)));
  $('btn-export')?.addEventListener('click', () => { ui.exportJson.value = JSON.stringify(payload(), null, 2); });
  $('btn-import')?.addEventListener('click', () => { try { localStorage.setItem(SAVE_PREFIX + state.slot, ui.exportJson.value); loadGame(state.slot); } catch { popup('Invalid save JSON'); } });
  $('graphics-quality')?.addEventListener('change', e => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, e.target.value === 'low' ? 1 : mobile ? 1.25 : 1.75)));

  ui.missionList.innerHTML = missions.map(m => `<li><button data-mission="${m.id}">${m.name}</button><p>${m.desc}</p></li>`).join('');
  ui.missionList.querySelectorAll('button').forEach(b => b.addEventListener('click', () => chooseMission(b.dataset.mission)));

  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Escape') openPause(!state.paused); if (e.code === 'Space') input.jump = true; if (e.code === 'KeyE') input.interact = true; if (e.code === 'KeyM') { openPause(true); ui.missionBoard.classList.toggle('hidden'); } if (e.code === 'F3') ui.debug.classList.toggle('debug-visible'); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('mousemove', (e) => { if (!state.paused && e.buttons === 1) input.lookX += e.movementX; });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(false); });

  let joyId = null, origin = null;
  $('joystick-container')?.addEventListener('pointerdown', e => { joyId = e.pointerId; origin = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(joyId); });
  $('joystick-container')?.addEventListener('pointermove', e => { if (e.pointerId !== joyId || !origin) return; const dx = e.clientX - origin.x, dy = e.clientY - origin.y, max = 42, len = Math.min(max, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); input.joyR = Math.cos(a) * len / max; input.joyF = -Math.sin(a) * len / max; ui.stick.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`; });
  $('joystick-container')?.addEventListener('pointerup', () => { joyId = null; origin = null; input.joyF = 0; input.joyR = 0; ui.stick.style.transform = 'translate(0,0)'; });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch' && e.buttons) input.lookX += e.movementX || 0; });

  let last = performance.now(), frames = 0, fpsAt = last;
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++; if (now - fpsAt > 500) { ui.fps.textContent = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; } tick(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }

  loadGame(state.slot).finally(() => { streamWorld(); updateHud(); ui.loading.classList.add('hidden'); requestAnimationFrame(loop); });
})();
