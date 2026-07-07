(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const overlay = $('pause-overlay');
  const loading = $('loading-screen');
  const mini = $('minimap-canvas');
  const miniCtx = mini ? mini.getContext('2d') : null;
  const hasThree = typeof THREE !== 'undefined';
  const cloud = window.NeonBlockCloudSave || null;

  const WORLD = { chunk: 90, radius: 2, road: 12, lot: 24 };
  const SAVE_KEY = 'neonblock-city-save-v3';
  const state = {
    paused: false,
    cash: 175,
    xp: 0,
    level: 1,
    wanted: 0,
    health: 100,
    gas: 100,
    slot: 'slot1',
    quality: localStorage.getItem('neonblock-quality') || 'auto',
    online: 'offline',
    lastError: 'none',
    mission: null,
    ownedLots: new Set(),
    inVehicle: false,
    activeVehicle: null,
    input: { x: 0, z: 0, sprint: false, jump: false, interact: false },
    player: { x: 0, y: 1.7, z: 0, vy: 0, heading: 0 },
    chunks: new Map(),
    pickups: [],
    npcs: [],
    vehicles: [],
    lots: [],
    particles: [],
    missions: [
      { id: 'crate-run', name: 'Crate Run', goal: 'Collect 5 neon crates', target: 5, progress: 0, reward: 275, xp: 75 },
      { id: 'taxi-loop', name: 'Taxi Loop', goal: 'Drive through 4 taxi beacons', target: 4, progress: 0, reward: 360, xp: 90 },
      { id: 'lot-owner', name: 'Starter Owner', goal: 'Buy 1 city lot', target: 1, progress: 0, reward: 200, xp: 60 }
    ]
  };

  let scene, camera, renderer, playerMesh, carMesh, clock;
  let lastAutoSave = 0;
  const keys = new Set();

  function safeText(id, value) { const el = $(id); if (el) el.textContent = String(value); }
  function toast(text) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), 1800);
  }
  function setError(err) {
    state.lastError = err && err.message ? err.message.slice(0, 80) : String(err || 'unknown');
    safeText('debug-last-error', state.lastError);
    console.warn('[NeonBlock]', err);
  }

  function initThree() {
    if (!hasThree) throw new Error('Three.js failed to load');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060817);
    scene.fog = new THREE.Fog(0x060817, 80, 310);
    camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 900);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, state.quality === 'high' ? 1.75 : 1.25));
    renderer.shadowMap.enabled = state.quality !== 'low';

    const hemi = new THREE.HemisphereLight(0x6ff8ff, 0x080914, 1.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(40, 80, 25);
    sun.castShadow = true;
    scene.add(sun);

    const grid = new THREE.GridHelper(900, 90, 0x2244ff, 0x132048);
    grid.position.y = 0.02;
    scene.add(grid);

    playerMesh = makeBox(0x22e6ff, 1.4, 2.6, 1.4);
    playerMesh.position.set(0, 1.3, 0);
    scene.add(playerMesh);
    carMesh = makeVehicleMesh();
    carMesh.visible = false;
    scene.add(carMesh);
    clock = new THREE.Clock();
  }

  function makeBox(color, w, h, d) {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.45 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  function makeVehicleMesh() {
    const group = new THREE.Group();
    const body = makeBox(0xff2bd6, 3.8, 1.1, 6);
    body.position.y = 1;
    const cab = makeBox(0x23f7ff, 2.4, 1.0, 2.4);
    cab.position.set(0, 1.8, -0.5);
    group.add(body, cab);
    return group;
  }

  function seeded(n) { return Math.abs(Math.sin(n * 999.13) * 10000) % 1; }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function ensureWorld() {
    const pcx = Math.floor(state.player.x / WORLD.chunk);
    const pcz = Math.floor(state.player.z / WORLD.chunk);
    for (let x = pcx - WORLD.radius; x <= pcx + WORLD.radius; x++) {
      for (let z = pcz - WORLD.radius; z <= pcz + WORLD.radius; z++) {
        const key = chunkKey(x, z);
        if (!state.chunks.has(key)) createChunk(x, z, key);
      }
    }
    for (const [key, group] of state.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - pcx) > WORLD.radius + 1 || Math.abs(z - pcz) > WORLD.radius + 1) {
        scene.remove(group);
        state.chunks.delete(key);
      }
    }
  }

  function createChunk(cx, cz, key) {
    const g = new THREE.Group();
    g.position.set(cx * WORLD.chunk, 0, cz * WORLD.chunk);
    const ground = makeBox(0x101733, WORLD.chunk, 0.18, WORLD.chunk);
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    g.add(ground);
    const roadX = makeBox(0x111111, WORLD.chunk, 0.05, WORLD.road);
    const roadZ = makeBox(0x111111, WORLD.road, 0.055, WORLD.chunk);
    roadX.position.y = 0.03;
    roadZ.position.y = 0.04;
    g.add(roadX, roadZ);

    for (let i = 0; i < 7; i++) {
      const r = seeded(cx * 37 + cz * 71 + i);
      const px = (r - 0.5) * 72;
      const pz = (seeded(cx * 17 + cz * 41 + i * 3) - 0.5) * 72;
      if (Math.abs(px) < 12 || Math.abs(pz) < 12) continue;
      const h = 8 + Math.floor(seeded(cx * 91 + cz * 13 + i) * 28);
      const b = makeBox(i % 2 ? 0x7c4dff : 0x18e2ff, 10, h, 10);
      b.position.set(px, h / 2, pz);
      g.add(b);
    }

    const wx = cx * WORLD.chunk, wz = cz * WORLD.chunk;
    if ((Math.abs(cx) + Math.abs(cz)) % 2 === 0) addPickup(wx + 18, wz - 18);
    if ((cx + cz) % 3 === 0) addLot(wx - 24, wz + 24, 350 + (Math.abs(cx) + Math.abs(cz)) * 45);
    if ((cx * 2 + cz) % 4 === 0) addVehicle(wx + 12, wz + 12);
    if ((cx - cz) % 5 === 0) addNpc(wx - 16, wz - 12);
    scene.add(g);
    state.chunks.set(key, g);
  }

  function addPickup(x, z) {
    if (state.pickups.some(p => Math.abs(p.x - x) < 1 && Math.abs(p.z - z) < 1)) return;
    const mesh = makeBox(0x5ef38c, 1.5, 1.5, 1.5);
    mesh.position.set(x, 1, z);
    scene.add(mesh);
    state.pickups.push({ x, z, mesh, taken: false });
  }
  function addLot(x, z, price) {
    const id = `${Math.round(x)}:${Math.round(z)}`;
    if (state.lots.some(l => l.id === id)) return;
    const mesh = makeBox(state.ownedLots.has(id) ? 0x5ef38c : 0xffcc33, 8, 0.35, 8);
    mesh.position.set(x, 0.2, z);
    scene.add(mesh);
    state.lots.push({ id, x, z, price, mesh });
  }
  function addVehicle(x, z) {
    if (state.vehicles.some(v => Math.abs(v.x - x) < 1 && Math.abs(v.z - z) < 1)) return;
    const mesh = makeVehicleMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    state.vehicles.push({ id: `car-${x}-${z}`, x, z, gas: 100, hp: 100, mesh });
  }
  function addNpc(x, z) {
    if (state.npcs.some(n => Math.abs(n.x - x) < 1 && Math.abs(n.z - z) < 1)) return;
    const mesh = makeBox(0xffffff, 1.2, 2.2, 1.2);
    mesh.position.set(x, 1.1, z);
    scene.add(mesh);
    state.npcs.push({ x, z, mesh, tip: 'Tap Interact near boards, cars, crates, or lots.' });
  }

  function updateInput() {
    let x = 0, z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (Math.abs(state.input.x) > 0.04 || Math.abs(state.input.z) > 0.04) { x = state.input.x; z = state.input.z; }
    const len = Math.hypot(x, z) || 1;
    state.input.dx = x / len;
    state.input.dz = z / len;
    state.input.moving = Math.hypot(x, z) > 0.05;
    state.input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || state.input.sprint;
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!clock || state.paused) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    updateInput();
    updatePlayer(dt);
    ensureWorld();
    updateInteractions(dt);
    updateCamera(dt);
    updateHud(dt);
    renderer.render(scene, camera);
    if (performance.now() - lastAutoSave > 15000) { saveLocal(state.slot); lastAutoSave = performance.now(); }
  }

  function updatePlayer(dt) {
    const speed = state.inVehicle ? 24 : (state.input.sprint ? 12 : 7);
    if (state.input.moving) {
      state.player.x += state.input.dx * speed * dt;
      state.player.z += state.input.dz * speed * dt;
      state.player.heading = Math.atan2(state.input.dx, state.input.dz);
      if (state.inVehicle) state.gas = Math.max(0, state.gas - dt * 0.9);
    }
    if ((keys.has('Space') || state.input.jump) && state.player.y <= 1.71 && !state.inVehicle) state.player.vy = 9;
    state.player.vy -= 24 * dt;
    state.player.y = Math.max(1.7, state.player.y + state.player.vy * dt);
    if (state.player.y <= 1.7) state.player.vy = 0;
    const mesh = state.inVehicle ? carMesh : playerMesh;
    playerMesh.visible = !state.inVehicle;
    carMesh.visible = state.inVehicle;
    mesh.position.set(state.player.x, state.inVehicle ? 0 : state.player.y - 0.4, state.player.z);
    mesh.rotation.y = state.player.heading;
  }

  function near(obj, dist = 5) { return Math.hypot(state.player.x - obj.x, state.player.z - obj.z) <= dist; }
  function updateInteractions(dt) {
    for (const p of state.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      if (near(p, 3)) {
        p.taken = true; p.mesh.visible = false; state.cash += 45; gainXp(12); advanceMission('crate-run', 1); toast('Crate +$45');
      }
    }
    if (state.input.interact || keys.has('KeyE')) {
      state.input.interact = false;
      const car = state.vehicles.find(v => near(v, 6));
      if (car || state.inVehicle) {
        state.inVehicle = !state.inVehicle;
        state.activeVehicle = state.inVehicle ? (car ? car.id : 'vehicle') : null;
        toast(state.inVehicle ? 'Vehicle entered' : 'Vehicle exited');
        return;
      }
      const lot = state.lots.find(l => near(l, 6) && !state.ownedLots.has(l.id));
      if (lot) {
        if (state.cash >= lot.price) { state.cash -= lot.price; state.ownedLots.add(lot.id); lot.mesh.material.color.setHex(0x5ef38c); gainXp(60); advanceMission('lot-owner', 1); toast('Lot owned'); }
        else toast(`Need $${lot.price}`);
        return;
      }
      const npc = state.npcs.find(n => near(n, 5));
      if (npc) { openMissions(); toast(npc.tip); }
    }
    if (state.inVehicle && state.input.moving) advanceMission('taxi-loop', dt > 0 ? dt / 3 : 0);
  }

  function gainXp(xp) { state.xp += xp; state.level = 1 + Math.floor(state.xp / 150); }
  function advanceMission(id, amount) {
    const m = state.missions.find(v => v.id === id);
    if (!m || m.done) return;
    m.progress = Math.min(m.target, m.progress + amount);
    if (m.progress >= m.target) { m.done = true; state.cash += m.reward; gainXp(m.xp); toast(`${m.name} complete +$${m.reward}`); }
    state.mission = m.done ? null : m.id;
  }

  function updateCamera() {
    const back = new THREE.Vector3(Math.sin(state.player.heading) * -18, 14, Math.cos(state.player.heading) * -18);
    const target = new THREE.Vector3(state.player.x, state.player.y + 2, state.player.z);
    camera.position.lerp(target.clone().add(back), 0.08);
    camera.lookAt(target);
  }

  let fpsLast = performance.now(), fpsFrames = 0, fps = 0;
  function updateHud() {
    fpsFrames++;
    if (performance.now() - fpsLast > 1000) { fps = fpsFrames; fpsFrames = 0; fpsLast = performance.now(); }
    safeText('hud-cash', `$${Math.floor(state.cash)}`);
    safeText('hud-xp', Math.floor(state.xp));
    safeText('hud-level', state.level);
    safeText('hud-wanted', state.wanted);
    safeText('hud-online', state.online);
    safeText('hud-vehicle', state.inVehicle ? 'Neon Cruiser' : 'On foot');
    safeText('hud-vehicle-hp', state.health);
    safeText('hud-vehicle-gas', Math.floor(state.gas));
    const active = state.missions.find(m => !m.done && m.progress > 0) || state.missions.find(m => !m.done);
    safeText('hud-mission', active ? `${active.name} ${Math.floor(active.progress)}/${active.target}` : 'Free roam');
    safeText('debug-fps', fps);
    safeText('debug-pos', `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`);
    safeText('debug-chunks', state.chunks.size);
    safeText('debug-npcs', state.npcs.length);
    safeText('debug-active-vehicle', state.activeVehicle || 'None');
    safeText('debug-save-slot', state.slot);
    safeText('debug-online', state.online);
    drawMinimap();
  }
  function drawMinimap() {
    if (!miniCtx) return;
    miniCtx.clearRect(0, 0, 160, 160);
    miniCtx.fillStyle = '#071020'; miniCtx.fillRect(0, 0, 160, 160);
    miniCtx.strokeStyle = '#1ff3ff55'; miniCtx.strokeRect(2, 2, 156, 156);
    const draw = (x, z, color, s = 3) => { miniCtx.fillStyle = color; miniCtx.fillRect(80 + (x - state.player.x) / 2 - s / 2, 80 + (z - state.player.z) / 2 - s / 2, s, s); };
    state.pickups.filter(p => !p.taken).slice(-40).forEach(p => draw(p.x, p.z, '#5ef38c'));
    state.vehicles.slice(-30).forEach(v => draw(v.x, v.z, '#ff2bd6', 4));
    state.lots.slice(-30).forEach(l => draw(l.x, l.z, state.ownedLots.has(l.id) ? '#5ef38c' : '#ffcc33', 4));
    draw(state.player.x, state.player.z, '#ffffff', 6);
  }

  function openMissions() {
    const board = $('mission-board'), list = $('mission-list');
    if (!board || !list) return;
    list.innerHTML = state.missions.map(m => `<li><button data-mission="${m.id}">${m.done ? 'Done' : 'Start'} - ${m.name}: ${m.goal}</button></li>`).join('');
    board.classList.remove('hidden'); overlay.classList.remove('hidden'); state.paused = true;
  }
  function closeMenus() { overlay.classList.add('hidden'); ['settings-panel','mission-board','save-panel'].forEach(id => $(id)?.classList.add('hidden')); state.paused = false; }
  function openSavePanel() { $('save-panel')?.classList.remove('hidden'); overlay.classList.remove('hidden'); state.paused = true; }

  function serialize() { return { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, gas: state.gas, player: state.player, ownedLots: [...state.ownedLots], missions: state.missions, savedAt: new Date().toISOString(), version: 3 }; }
  function applySave(data) {
    if (!data || !data.player) return false;
    Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, gas: data.gas ?? 100 });
    Object.assign(state.player, data.player);
    state.ownedLots = new Set(data.ownedLots || []);
    if (Array.isArray(data.missions)) state.missions = data.missions;
    return true;
  }
  async function saveLocal(slot = 'slot1') {
    state.slot = slot;
    const payload = serialize();
    localStorage.setItem(`${SAVE_KEY}:${slot}`, JSON.stringify(payload));
    if (cloud?.save) {
      try { await cloud.save(slot, payload); state.online = 'cloud saved'; }
      catch (e) { state.online = 'local only'; setError(e); }
    }
  }
  async function loadLocal(slot = 'slot1') {
    state.slot = slot;
    let payload = null;
    if (cloud?.load) { try { payload = await cloud.load(slot); state.online = payload ? 'cloud loaded' : 'local only'; } catch (e) { setError(e); } }
    payload = payload || JSON.parse(localStorage.getItem(`${SAVE_KEY}:${slot}`) || localStorage.getItem(SAVE_KEY) || 'null');
    if (applySave(payload)) toast('Save loaded');
  }

  function bindControls() {
    addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyM') openMissions(); if (e.code === 'KeyR') unstuck(); });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    $('btn-resume')?.addEventListener('click', closeMenus);
    $('btn-mobile-pause')?.addEventListener('click', togglePause);
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', openSavePanel);
    $('btn-load')?.addEventListener('click', openSavePanel);
    $('btn-close-save')?.addEventListener('click', closeMenus);
    $('btn-close-missions')?.addEventListener('click', closeMenus);
    $('btn-export')?.addEventListener('click', () => { const t = $('export-json'); if (t) t.value = JSON.stringify(serialize(), null, 2); });
    $('btn-import')?.addEventListener('click', () => { try { if (applySave(JSON.parse($('export-json').value))) toast('Imported'); } catch (e) { setError(e); toast('Import failed'); } });
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => saveLocal(b.dataset.slot).then(() => toast('Saved'))));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadLocal(b.dataset.slot)));
    $('graphics-quality')?.addEventListener('change', e => { state.quality = e.target.value; localStorage.setItem('neonblock-quality', state.quality); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, state.quality === 'high' ? 1.75 : 1.0)); });
    bindButton('btn-mobile-jump', v => state.input.jump = v);
    bindButton('btn-mobile-sprint', v => state.input.sprint = v);
    bindButton('btn-mobile-interact', v => { if (v) state.input.interact = true; });
    $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    bindJoystick();
  }
  function bindButton(id, fn) { const b = $(id); if (!b) return; ['pointerdown','touchstart'].forEach(ev => b.addEventListener(ev, e => { e.preventDefault(); fn(true); })); ['pointerup','pointercancel','touchend'].forEach(ev => b.addEventListener(ev, e => { e.preventDefault(); fn(false); })); }
  function bindJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick'); if (!box || !stick) return;
    const reset = () => { state.input.x = 0; state.input.z = 0; stick.style.transform = 'translate(0,0)'; };
    box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); move(e); });
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', reset); box.addEventListener('pointercancel', reset);
    function move(e) { const r = box.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2); const len = Math.min(45, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); state.input.x = Math.cos(a) * len / 45; state.input.z = Math.sin(a) * len / 45; stick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`; }
  }
  function togglePause() { state.paused = !state.paused; overlay.classList.toggle('hidden', !state.paused); }
  function unstuck() { state.player.y = 3; state.player.vy = 0; toast('Unstuck'); }

  async function boot() {
    try {
      initThree(); bindControls(); ensureWorld(); await loadLocal('slot1');
      loading?.classList.add('hidden');
      tick();
    } catch (e) {
      setError(e);
      if (loading) loading.innerHTML = `<div class="loading-title">NeonBlock City</div><div class="loading-sub">Startup error: ${state.lastError}</div>`;
    }
  }
  boot();
})();
