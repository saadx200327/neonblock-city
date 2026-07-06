(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), vehicleHp: $('hud-vehicle-hp'), vehicleGas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  if (!window.THREE) {
    const loading = $('loading-screen');
    if (loading) loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load. Check your connection.</div>';
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b18);
  scene.fog = new THREE.Fog(0x070b18, 55, 220);

  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 550);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, /Mobi|Android/i.test(navigator.userAgent) ? 1.35 : 1.75));
  renderer.setSize(innerWidth, innerHeight);

  const sun = new THREE.DirectionalLight(0x83f7ff, 2.4); sun.position.set(35, 75, 25); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9cefff, 0x151022, 1.8));

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x141827, roughness: 0.92 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x173c30, roughness: 0.96 }),
    player: new THREE.MeshStandardMaterial({ color: 0x1df5ff, emissive: 0x093840 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xff4fc3, emissive: 0x33001d }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x66ff99, emissive: 0x164422 }),
    lot: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x2f2400 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x71ff7a, emissive: 0x102f11 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.5, metalness: 0.25 }),
    building: [0x2b2d70, 0x1e536f, 0x532a77, 0x294057].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.74, metalness: 0.08 }))
  };

  const state = {
    player: { x: 0, z: 0, y: 1, vy: 0, rot: 0, cash: 125, xp: 0, level: 1, wanted: 0, speed: 15 },
    keys: new Set(), joystick: { x: 0, y: 0, active: false }, cameraYaw: 0, activeVehicle: null,
    chunks: new Map(), chunkSize: 72, streamRadius: /Mobi|Android/i.test(navigator.userAgent) ? 1 : 2,
    npcs: [], vehicles: [], pickups: new Map(), lots: new Map(), ownedLots: new Set(), collectedPickups: new Set(),
    saveSlot: 'slot1', lastSave: 0, lastFrame: performance.now(), fpsFrames: 0, fpsClock: performance.now(), debug: false,
    missionIndex: 0, cloud: null, lastError: 'none'
  };

  const missions = [
    { id: 'cash-run', title: 'Cash Run', text: 'Collect 5 neon cash cubes', goal: 5, rewardCash: 250, rewardXp: 70, progress: 0, type: 'pickup' },
    { id: 'property-start', title: 'First Lot', text: 'Buy any yellow lot', goal: 1, rewardCash: 150, rewardXp: 100, progress: 0, type: 'lot' },
    { id: 'driver', title: 'Street Driver', text: 'Enter a vehicle and drive 300 meters', goal: 300, rewardCash: 300, rewardXp: 120, progress: 0, type: 'drive' }
  ];

  const playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.8, 0.75), mats.player); body.position.y = 1.25; playerMesh.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mats.player); head.position.y = 2.55; playerMesh.add(head);
  scene.add(playerMesh);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mats.grass); ground.rotation.x = -Math.PI / 2; scene.add(ground);

  function seeded(seed) { let n = Math.sin(seed) * 10000; return n - Math.floor(n); }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function worldToChunk(v) { return Math.floor((v + state.chunkSize / 2) / state.chunkSize); }
  function safeSet(el, value) { if (el) el.textContent = value; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }

  function makeBox(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = false; mesh.receiveShadow = false;
    return mesh;
  }

  function createChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (state.chunks.has(key)) return;
    const group = new THREE.Group();
    const baseX = cx * state.chunkSize, baseZ = cz * state.chunkSize;
    const roadA = makeBox(state.chunkSize, 0.08, 9, mats.road, baseX, 0.03, baseZ);
    const roadB = makeBox(9, 0.08, state.chunkSize, mats.road, baseX, 0.04, baseZ);
    group.add(roadA, roadB);

    for (let i = 0; i < 7; i++) {
      const s = cx * 101 + cz * 211 + i * 17;
      const x = baseX + (seeded(s) - 0.5) * 58;
      const z = baseZ + (seeded(s + 4) - 0.5) * 58;
      if (Math.abs(x - baseX) < 8 || Math.abs(z - baseZ) < 8) continue;
      const h = 7 + Math.floor(seeded(s + 8) * 20);
      const b = makeBox(8 + seeded(s + 1) * 8, h, 8 + seeded(s + 2) * 8, mats.building[i % mats.building.length], x, h / 2, z);
      group.add(b);
    }

    if ((Math.abs(cx) + Math.abs(cz)) % 2 === 0) {
      const id = `lot-${key}`;
      const lot = makeBox(10, 0.25, 10, state.ownedLots.has(id) ? mats.owned : mats.lot, baseX + 22, 0.16, baseZ - 22);
      lot.userData = { id, price: 300 + (Math.abs(cx) + Math.abs(cz)) * 75, type: 'lot' };
      state.lots.set(id, lot); group.add(lot);
    }

    if (!state.collectedPickups.has(`pickup-${key}`)) {
      const pickup = makeBox(2, 2, 2, mats.pickup, baseX - 20, 1.1, baseZ + 18);
      pickup.userData = { id: `pickup-${key}`, type: 'pickup' };
      state.pickups.set(pickup.userData.id, pickup); group.add(pickup);
    }

    if ((cx + cz) % 3 === 0) {
      const npc = makeBox(1.2, 2.1, 1.2, mats.npc, baseX + 12, 1.1, baseZ + 12);
      npc.userData = { type: 'npc', tip: 'Tip: buy yellow lots, collect green cubes, drive red cars.' };
      state.npcs.push(npc); group.add(npc);
    }

    if ((cx - cz) % 4 === 0) {
      const car = new THREE.Group();
      car.add(makeBox(4.5, 1, 7, mats.vehicle, 0, 0.7, 0));
      car.add(makeBox(3.2, 1, 3.2, mats.vehicle, 0, 1.55, -0.6));
      car.position.set(baseX - 13, 0, baseZ - 13);
      car.userData = { type: 'vehicle', hp: 100, gas: 100, id: `car-${key}` };
      state.vehicles.push(car); group.add(car);
    }

    scene.add(group); state.chunks.set(key, group);
  }

  function unloadChunk(key, group) {
    group.traverse(obj => {
      if (obj.userData?.type === 'npc') state.npcs = state.npcs.filter(n => n !== obj);
      if (obj.userData?.type === 'vehicle') state.vehicles = state.vehicles.filter(v => v !== obj);
      if (obj.userData?.type === 'pickup') state.pickups.delete(obj.userData.id);
      if (obj.userData?.type === 'lot') state.lots.delete(obj.userData.id);
      if (obj.geometry) obj.geometry.dispose();
    });
    scene.remove(group); state.chunks.delete(key);
  }

  function streamWorld() {
    const pcx = worldToChunk(state.player.x), pcz = worldToChunk(state.player.z);
    for (let cx = pcx - state.streamRadius; cx <= pcx + state.streamRadius; cx++) for (let cz = pcz - state.streamRadius; cz <= pcz + state.streamRadius; cz++) createChunk(cx, cz);
    for (const [key, group] of [...state.chunks]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > state.streamRadius + 1 || Math.abs(cz - pcz) > state.streamRadius + 1) unloadChunk(key, group);
    }
  }

  function currentMission() { return missions[state.missionIndex] || null; }
  function completeMission(m) {
    state.player.cash += m.rewardCash; state.player.xp += m.rewardXp; state.missionIndex++;
    showReward(`Mission complete: ${m.title} +$${m.rewardCash} +${m.rewardXp}XP`); levelCheck(); saveNow();
  }
  function advanceMission(type, amount) {
    const m = currentMission(); if (!m || m.type !== type) return;
    m.progress = clamp(m.progress + amount, 0, m.goal);
    if (m.progress >= m.goal) completeMission(m);
  }
  function levelCheck() { state.player.level = 1 + Math.floor(state.player.xp / 150); }

  function showReward(text) {
    const el = $('reward-popup'); if (!el) return;
    el.textContent = text; el.classList.remove('hidden'); clearTimeout(showReward.timer);
    showReward.timer = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  function interact() {
    const pos = { x: state.player.x, z: state.player.z };
    if (state.activeVehicle) { state.activeVehicle = null; showReward('Exited vehicle'); return; }
    for (const car of state.vehicles) if (dist2(pos, car.position) < 7) { state.activeVehicle = car; showReward('Entered vehicle'); return; }
    for (const pickup of state.pickups.values()) if (dist2(pos, pickup.position) < 5) {
      state.player.cash += 40; state.player.xp += 12; state.collectedPickups.add(pickup.userData.id); pickup.parent?.remove(pickup); state.pickups.delete(pickup.userData.id);
      advanceMission('pickup', 1); levelCheck(); showReward('Collected neon cash +$40'); return;
    }
    for (const lot of state.lots.values()) if (dist2(pos, lot.position) < 7) {
      const { id, price } = lot.userData;
      if (state.ownedLots.has(id)) return showReward('You already own this lot');
      if (state.player.cash < price) return showReward(`Need $${price} to buy this lot`);
      state.player.cash -= price; state.ownedLots.add(id); lot.material = mats.owned; advanceMission('lot', 1); showReward(`Lot purchased for $${price}`); saveNow(); return;
    }
    for (const npc of state.npcs) if (dist2(pos, npc.position) < 6) return showReward(npc.userData.tip);
    showReward('Nothing nearby to interact with');
  }

  function move(dt) {
    let x = 0, z = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) z -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) z += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    x += state.joystick.x; z += state.joystick.y;
    const len = Math.hypot(x, z) || 1; x /= len; z /= len;
    const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || $('btn-mobile-sprint')?.dataset.down === '1';
    const speed = (state.activeVehicle ? 34 : state.player.speed) * (sprint ? 1.45 : 1);
    const sin = Math.sin(state.cameraYaw), cos = Math.cos(state.cameraYaw);
    const dx = (x * cos - z * sin) * speed * dt, dz = (z * cos + x * sin) * speed * dt;
    state.player.x += dx; state.player.z += dz;
    if (Math.abs(dx) + Math.abs(dz) > 0.001) state.player.rot = Math.atan2(dx, dz);
    if (state.activeVehicle) {
      state.activeVehicle.position.set(state.player.x, 0, state.player.z);
      state.activeVehicle.rotation.y = state.player.rot;
      state.activeVehicle.userData.gas = clamp(state.activeVehicle.userData.gas - (Math.abs(dx) + Math.abs(dz)) * 0.018, 0, 100);
      advanceMission('drive', Math.hypot(dx, dz));
    }
    state.player.vy -= 28 * dt; state.player.y += state.player.vy * dt;
    if (state.player.y < 1) { state.player.y = 1; state.player.vy = 0; }
    playerMesh.position.set(state.player.x, state.player.y - 1, state.player.z);
    playerMesh.rotation.y = state.player.rot;
  }

  function jump() { if (state.player.y <= 1.03) state.player.vy = state.activeVehicle ? 7 : 10; }
  function unstuck() { state.player.y = 4; state.player.vy = 0; if (state.activeVehicle) state.activeVehicle.position.y = 0; showReward('Unstuck'); }

  function updateCamera() {
    const target = new THREE.Vector3(state.player.x, state.player.y + 1.3, state.player.z);
    const dist = state.activeVehicle ? 18 : 13;
    camera.position.lerp(new THREE.Vector3(target.x + Math.sin(state.cameraYaw) * dist, target.y + 8, target.z + Math.cos(state.cameraYaw) * dist), 0.14);
    camera.lookAt(target);
  }

  function updateHud() {
    const m = currentMission();
    safeSet(hud.cash, `$${Math.floor(state.player.cash)}`); safeSet(hud.xp, Math.floor(state.player.xp)); safeSet(hud.level, state.player.level); safeSet(hud.wanted, state.player.wanted);
    safeSet(hud.online, state.cloud ? 'cloud ready' : 'local'); safeSet(hud.debugOnline, state.cloud ? 'cloud ready' : 'local');
    safeSet(hud.vehicle, state.activeVehicle ? 'Neon car' : 'On foot'); safeSet(hud.vehicleHp, Math.floor(state.activeVehicle?.userData.hp ?? 100)); safeSet(hud.vehicleGas, Math.floor(state.activeVehicle?.userData.gas ?? 100));
    safeSet(hud.mission, m ? `${m.title} ${Math.floor(m.progress)}/${m.goal}` : 'Free roam');
    safeSet(hud.pos, `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`); safeSet(hud.chunks, state.chunks.size); safeSet(hud.npcs, state.npcs.length);
    safeSet(hud.activeVehicle, state.activeVehicle ? state.activeVehicle.userData.id : 'None'); safeSet(hud.saveSlot, state.saveSlot); safeSet(hud.lastError, state.lastError);
    const dbg = $('debug-overlay'); if (dbg) dbg.style.display = state.debug ? 'block' : 'none';
  }

  function drawMinimap() {
    const c = $('minimap-canvas'); if (!c) return; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = '#071024cc'; ctx.fillRect(0, 0, c.width, c.height);
    const scale = 2.2, cx = c.width / 2, cz = c.height / 2;
    ctx.strokeStyle = '#17f3ff55'; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, c.height); ctx.moveTo(0, cz); ctx.lineTo(c.width, cz); ctx.stroke();
    ctx.fillStyle = '#66ff99'; for (const p of state.pickups.values()) dot(p.position, 3);
    ctx.fillStyle = '#ffd166'; for (const l of state.lots.values()) dot(l.position, 4);
    ctx.fillStyle = '#ff3366'; for (const v of state.vehicles) dot(v.position, 4);
    ctx.fillStyle = '#1df5ff'; ctx.beginPath(); ctx.arc(cx, cz, 5, 0, Math.PI * 2); ctx.fill();
    function dot(p, r) { const x = cx + (p.x - state.player.x) / scale, y = cz + (p.z - state.player.z) / scale; if (x > 0 && x < c.width && y > 0 && y < c.height) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); } }
  }

  function saveData() {
    return { v: 2, player: state.player, missionIndex: state.missionIndex, missions: missions.map(m => ({ id: m.id, progress: m.progress })), ownedLots: [...state.ownedLots], collectedPickups: [...state.collectedPickups] };
  }
  function loadData(data) {
    if (!data) return;
    Object.assign(state.player, data.player || {}); state.missionIndex = data.missionIndex || 0;
    (data.missions || []).forEach(saved => { const m = missions.find(x => x.id === saved.id); if (m) m.progress = saved.progress || 0; });
    state.ownedLots = new Set(data.ownedLots || []); state.collectedPickups = new Set(data.collectedPickups || []);
    for (const [key, group] of [...state.chunks]) unloadChunk(key, group); streamWorld(); levelCheck(); showReward('Save loaded');
  }
  function saveNow() {
    const data = saveData(); localStorage.setItem(`neonblock:${state.saveSlot}`, JSON.stringify(data)); state.lastSave = performance.now();
    if (state.cloud?.save) state.cloud.save(state.saveSlot, data).catch(e => { state.lastError = e.message || 'cloud save failed'; });
  }
  async function loadNow() {
    let data = null;
    if (state.cloud?.load) { try { data = await state.cloud.load(state.saveSlot); } catch (e) { state.lastError = e.message || 'cloud load failed'; } }
    data ||= JSON.parse(localStorage.getItem(`neonblock:${state.saveSlot}`) || 'null'); loadData(data);
  }

  function wireUi() {
    addEventListener('keydown', e => { state.keys.add(e.code); if (e.code === 'Space') jump(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyF') unstuck(); if (e.code === 'Escape') togglePause(); if (e.code === 'F3') state.debug = !state.debug; });
    addEventListener('keyup', e => state.keys.delete(e.code));
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    canvas.addEventListener('pointermove', e => { if (e.buttons === 1 && !state.joystick.active) state.cameraYaw -= e.movementX * 0.005; });
    $('btn-mobile-jump')?.addEventListener('pointerdown', jump); $('btn-mobile-interact')?.addEventListener('pointerdown', interact); $('btn-mobile-unstuck')?.addEventListener('pointerdown', unstuck); $('btn-mobile-pause')?.addEventListener('pointerdown', togglePause);
    const sprint = $('btn-mobile-sprint'); sprint?.addEventListener('pointerdown', () => sprint.dataset.down = '1'); sprint?.addEventListener('pointerup', () => sprint.dataset.down = '0'); sprint?.addEventListener('pointercancel', () => sprint.dataset.down = '0');
    $('btn-resume')?.addEventListener('click', togglePause); $('btn-save')?.addEventListener('click', () => { $('save-panel')?.classList.toggle('hidden'); saveNow(); }); $('btn-load')?.addEventListener('click', loadNow);
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden')); $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.saveSlot = b.dataset.slot; saveNow(); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { state.saveSlot = b.dataset.slot; loadNow(); }));
    $('btn-export')?.addEventListener('click', () => $('export-json').value = JSON.stringify(saveData(), null, 2));
    $('btn-import')?.addEventListener('click', () => { try { loadData(JSON.parse($('export-json').value)); saveNow(); } catch { showReward('Import JSON is invalid'); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    setupJoystick(); populateMissions();
  }
  function togglePause() { $('pause-overlay')?.classList.toggle('hidden'); }
  function populateMissions() { const list = $('mission-list'); if (!list) return; list.innerHTML = missions.map(m => `<li><b>${m.title}</b><br>${m.text}</li>`).join(''); }

  function setupJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick'); if (!box || !stick) return;
    const reset = () => { state.joystick = { x: 0, y: 0, active: false }; stick.style.transform = 'translate(0,0)'; };
    box.addEventListener('pointerdown', e => { state.joystick.active = true; box.setPointerCapture(e.pointerId); update(e); });
    box.addEventListener('pointermove', update); box.addEventListener('pointerup', reset); box.addEventListener('pointercancel', reset);
    function update(e) { if (!state.joystick.active) return; const r = box.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.min(44, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); state.joystick.x = Math.cos(a) * (m / 44); state.joystick.y = Math.sin(a) * (m / 44); stick.style.transform = `translate(${Math.cos(a) * m}px,${Math.sin(a) * m}px)`; }
  }

  function tick(now) {
    const dt = Math.min(0.045, (now - state.lastFrame) / 1000); state.lastFrame = now;
    move(dt); streamWorld(); updateCamera(); updateHud(); drawMinimap(); renderer.render(scene, camera);
    if (now - state.lastSave > 25000) saveNow();
    state.fpsFrames++; if (now - state.fpsClock > 1000) { safeSet(hud.fps, state.fpsFrames); state.fpsFrames = 0; state.fpsClock = now; }
    requestAnimationFrame(tick);
  }

  async function init() {
    state.cloud = window.NeonBlockCloud || null; wireUi(); streamWorld(); await loadNow();
    $('loading-screen')?.classList.add('hidden'); requestAnimationFrame(tick);
  }
  init().catch(e => { state.lastError = e.message || 'init failed'; console.error(e); });
})();
