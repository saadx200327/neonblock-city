/* NeonBlock City - static Three.js game loop */
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

  if (!window.THREE || !canvas) {
    document.body.innerHTML = '<main style="padding:24px;color:white;background:#070b18;min-height:100vh;font-family:system-ui"><h1>NeonBlock City</h1><p>Three.js failed to load. Check your connection, then refresh.</p></main>';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.FogExp2(0x050814, 0.007);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;

  const hemi = new THREE.HemisphereLight(0xbdefff, 0x111426, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0x8fd8ff, 1.4);
  sun.position.set(55, 90, 35);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x14182a, roughness: 0.8 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x0c4b40, roughness: 0.9 }),
    neon: new THREE.MeshStandardMaterial({ color: 0x19f3ff, emissive: 0x0a7f88, emissiveIntensity: 0.55 }),
    player: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.65 }),
    npc: new THREE.MeshStandardMaterial({ color: 0x9b5cff, roughness: 0.65 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x15dd88, roughness: 0.75 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xff7a18, roughness: 0.7 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x68e1ff, emissive: 0x09364a, transparent: true, opacity: 0.72 })
  };

  const world = new THREE.Group();
  scene.add(world);

  const CHUNK = 70;
  const STREAM_RADIUS = 2;
  const chunks = new Map();
  const interactables = [];
  const vehicles = [];
  const npcs = [];
  const ownedLots = new Set();
  const keys = new Set();
  const minimap = $('minimap-canvas')?.getContext('2d');

  const state = {
    cash: 125, xp: 0, level: 1, wanted: 0, slot: 'slot1', activeVehicle: null, missionIndex: 0,
    player: { x: 0, y: 1, z: 0, yaw: 0, vy: 0, grounded: true },
    online: false, lastSave: 0
  };

  const missions = [
    { name: 'Collect 4 Neon Crates', kind: 'crate', target: 4, progress: 0, reward: 225, xp: 80 },
    { name: 'Buy Your First Lot', kind: 'lot', target: 1, progress: 0, reward: 140, xp: 100 },
    { name: 'Drive 600m', kind: 'drive', target: 600, progress: 0, reward: 300, xp: 120 }
  ];

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.1, 0.9), mats.player);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0xfff1c6 }));
  body.position.y = 1.05; head.position.y = 2.65;
  player.add(body, head);
  scene.add(player);

  function seeded(n) { return Math.abs(Math.sin(n * 999.123) * 43758.5453) % 1; }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function addBox(group, mat, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function makeChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (chunks.has(key)) return;
    const g = new THREE.Group();
    g.userData = { cx, cz };
    const ox = cx * CHUNK, oz = cz * CHUNK;
    addBox(g, mats.grass, ox, -0.06, oz, CHUNK, 0.1, CHUNK);
    addBox(g, mats.road, ox, 0, oz, CHUNK, 0.08, 8);
    addBox(g, mats.road, ox, 0.01, oz, 8, 0.08, CHUNK);

    for (let i = 0; i < 8; i++) {
      const r = seeded(cx * 31 + cz * 71 + i);
      const bx = ox - 28 + ((i * 17 + r * 11) % 56);
      const bz = oz - 28 + ((i * 29 + r * 19) % 56);
      if (Math.abs(bx - ox) < 9 || Math.abs(bz - oz) < 9) continue;
      const h = 6 + Math.floor(r * 24);
      const b = addBox(g, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.56 + r * 0.12, 0.45, 0.22 + r * 0.18) }), bx, h / 2, bz, 8 + r * 8, h, 8 + r * 8);
      addBox(g, mats.neon, bx, h + 0.08, bz, b.geometry.parameters.width * 0.78, 0.18, b.geometry.parameters.depth * 0.78);
    }

    if (seeded(cx * 17 + cz * 5) > 0.42) {
      const crate = addBox(g, mats.crate, ox + 18, 0.8, oz - 16, 2, 1.6, 2);
      crate.userData = { type: 'crate', picked: false };
      interactables.push(crate);
    }
    if (seeded(cx * 43 - cz * 9) > 0.55) {
      const lot = addBox(g, mats.lot, ox - 20, 0.08, oz + 20, 13, 0.16, 13);
      lot.userData = { type: 'lot', id: key, price: 250 + Math.abs(cx + cz) * 60 };
      interactables.push(lot);
    }
    if (vehicles.length < 18 && seeded(cx * 99 + cz * 12) > 0.5) spawnVehicle(ox + 9, oz + 11, g);
    if (npcs.length < 26 && seeded(cx * 21 - cz * 27) > 0.48) spawnNpc(ox - 12, oz - 12, g);

    chunks.set(key, g);
    world.add(g);
  }

  function unloadFarChunks(pcx, pcz) {
    for (const [key, g] of chunks) {
      const { cx, cz } = g.userData;
      if (Math.abs(cx - pcx) > STREAM_RADIUS + 1 || Math.abs(cz - pcz) > STREAM_RADIUS + 1) {
        world.remove(g);
        g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        chunks.delete(key);
      }
    }
  }

  function streamWorld() {
    const pcx = Math.floor(state.player.x / CHUNK);
    const pcz = Math.floor(state.player.z / CHUNK);
    for (let x = pcx - STREAM_RADIUS; x <= pcx + STREAM_RADIUS; x++) for (let z = pcz - STREAM_RADIUS; z <= pcz + STREAM_RADIUS; z++) makeChunk(x, z);
    unloadFarChunks(pcx, pcz);
  }

  function spawnVehicle(x, z, parent) {
    const car = new THREE.Group();
    addBox(car, mats.vehicle, 0, 0.65, 0, 3.1, 1.1, 5.2);
    addBox(car, mats.glass, 0, 1.45, -0.45, 2.2, 0.9, 2.2);
    car.position.set(x, 0, z);
    car.userData = { type: 'vehicle', hp: 100, gas: 100, speed: 0, owned: false };
    vehicles.push(car);
    parent.add(car);
  }

  function spawnNpc(x, z, parent) {
    const npc = addBox(parent, mats.npc, x, 1, z, 1.2, 2, 1.2);
    npc.userData = { type: 'npc', baseX: x, baseZ: z, t: Math.random() * 9 };
    npcs.push(npc);
  }

  function activeMission() { return missions[state.missionIndex] || null; }
  function addProgress(kind, amount = 1) {
    const m = activeMission();
    if (!m || m.kind !== kind) return;
    m.progress = Math.min(m.target, m.progress + amount);
    if (m.progress >= m.target) {
      state.cash += m.reward; state.xp += m.xp; popup(`Mission complete: ${m.name} +$${m.reward}`);
      state.missionIndex = Math.min(state.missionIndex + 1, missions.length - 1);
    }
  }

  function popup(text) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = text; el.classList.remove('hidden');
    clearTimeout(popup.timer); popup.timer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  function interact() {
    const px = state.player.x, pz = state.player.z;
    let best = null, bestD = 6;
    [...interactables, ...vehicles, ...npcs].forEach((o) => {
      if (!o.parent || o.userData.picked) return;
      const d = Math.hypot(o.position.x - px, o.position.z - pz);
      if (d < bestD) { bestD = d; best = o; }
    });
    if (!best) return popup('Nothing close enough. Walk near crates, lots, cars, or NPCs.');
    const t = best.userData.type;
    if (t === 'crate') { best.userData.picked = true; best.visible = false; state.cash += 45; state.xp += 15; addProgress('crate'); popup('Neon crate collected +$45'); }
    if (t === 'lot') {
      if (ownedLots.has(best.userData.id)) return popup('You already own this lot.');
      if (state.cash < best.userData.price) return popup(`Lot costs $${best.userData.price}`);
      state.cash -= best.userData.price; ownedLots.add(best.userData.id); best.material = mats.neon; addProgress('lot'); popup('Lot purchased. Ownership saved.');
    }
    if (t === 'vehicle') { state.activeVehicle = state.activeVehicle === best ? null : best; popup(state.activeVehicle ? 'Entered vehicle' : 'Exited vehicle'); }
    if (t === 'npc') popup('NPC: Crates glow orange. Buy lots to build your city empire.');
  }

  function save(slot = state.slot) {
    const data = { v: 2, state: { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, missionIndex: state.missionIndex, player: state.player }, ownedLots: [...ownedLots], missions };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    window.NeonBlockCloud?.save?.(slot, data).catch(() => {});
    state.lastSave = performance.now(); popup('Saved locally');
    return data;
  }

  function load(slot = state.slot) {
    const raw = localStorage.getItem(`neonblock:${slot}`);
    if (!raw) return popup('No local save found');
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data.state || {}); ownedLots.clear(); (data.ownedLots || []).forEach((x) => ownedLots.add(x));
      if (Array.isArray(data.missions)) data.missions.forEach((m, i) => Object.assign(missions[i] || {}, m));
      popup('Loaded save');
    } catch (e) { hud.error.textContent = e.message; }
  }

  function exportSave() { const box = $('export-json'); if (box) box.value = JSON.stringify(save(), null, 2); }
  function importSave() { const box = $('export-json'); if (!box?.value) return; localStorage.setItem(`neonblock:${state.slot}`, box.value); load(); }

  const joystick = { active: false, x: 0, y: 0 };
  function bindControls() {
    addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyR') unstuck(); });
    addEventListener('keyup', (e) => keys.delete(e.code));
    $('btn-mobile-interact')?.addEventListener('click', interact);
    $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    $('btn-mobile-pause')?.addEventListener('click', togglePause);
    $('btn-resume')?.addEventListener('click', togglePause);
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => load());
    $('btn-export')?.addEventListener('click', exportSave);
    $('btn-import')?.addEventListener('click', importSave);
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; save(state.slot); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; load(state.slot); }));
    const base = $('joystick-container'), stick = $('joystick-stick');
    const reset = () => { joystick.active = false; joystick.x = joystick.y = 0; if (stick) { stick.style.left = 'calc(50% - 24px)'; stick.style.top = 'calc(50% - 24px)'; } };
    base?.addEventListener('pointerdown', (e) => { joystick.active = true; base.setPointerCapture(e.pointerId); moveJoy(e); });
    base?.addEventListener('pointermove', moveJoy);
    base?.addEventListener('pointerup', reset);
    function moveJoy(e) {
      if (!joystick.active || !base || !stick) return;
      const r = base.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const len = Math.max(1, Math.hypot(dx, dy));
      const mag = Math.min(42, len);
      joystick.x = (dx / len) * (mag / 42); joystick.y = (dy / len) * (mag / 42);
      stick.style.left = `${r.width / 2 - 24 + joystick.x * 42}px`; stick.style.top = `${r.height / 2 - 24 + joystick.y * 42}px`;
    }
  }

  function unstuck() { state.player.x = Math.round(state.player.x / CHUNK) * CHUNK; state.player.y = 2; state.player.z = Math.round(state.player.z / CHUNK) * CHUNK; state.player.vy = 0; popup('Unstuck'); }
  function togglePause() { $('pause-overlay')?.classList.toggle('hidden'); }

  function move(dt) {
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - joystick.y;
    const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - joystick.x;
    if (state.activeVehicle) {
      const car = state.activeVehicle;
      car.userData.speed = THREE.MathUtils.clamp(car.userData.speed + forward * dt * 18, -12, 28);
      car.userData.speed *= 0.985;
      car.rotation.y += turn * dt * 2.2 * Math.sign(car.userData.speed || 1);
      const dist = Math.abs(car.userData.speed * dt);
      car.position.x -= Math.sin(car.rotation.y) * car.userData.speed * dt;
      car.position.z -= Math.cos(car.rotation.y) * car.userData.speed * dt;
      car.userData.gas = Math.max(0, car.userData.gas - dist * 0.025);
      state.player.x = car.position.x; state.player.z = car.position.z; state.player.y = 1; state.player.yaw = car.rotation.y; addProgress('drive', dist);
    } else {
      state.player.yaw += turn * dt * 3.5;
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || $('btn-mobile-sprint')?.matches(':active');
      const speed = sprint ? 14 : 8;
      state.player.x -= Math.sin(state.player.yaw) * forward * speed * dt;
      state.player.z -= Math.cos(state.player.yaw) * forward * speed * dt;
      if ((keys.has('Space') || $('btn-mobile-jump')?.matches(':active')) && state.player.grounded) { state.player.vy = 8; state.player.grounded = false; }
      state.player.vy -= 22 * dt; state.player.y += state.player.vy * dt;
      if (state.player.y <= 1) { state.player.y = 1; state.player.vy = 0; state.player.grounded = true; }
    }
    player.position.set(state.player.x, state.player.y - 1, state.player.z);
    player.rotation.y = state.player.yaw;
  }

  function updateNpc(dt) {
    for (const npc of npcs) if (npc.parent) { npc.userData.t += dt; npc.position.x = npc.userData.baseX + Math.sin(npc.userData.t) * 2.5; npc.position.z = npc.userData.baseZ + Math.cos(npc.userData.t * 0.8) * 2.5; }
  }

  function updateCamera() {
    const back = new THREE.Vector3(Math.sin(state.player.yaw) * 10, 7, Math.cos(state.player.yaw) * 10);
    camera.position.lerp(new THREE.Vector3(state.player.x + back.x, state.player.y + back.y, state.player.z + back.z), 0.14);
    camera.lookAt(state.player.x, state.player.y + 1.2, state.player.z);
  }

  function updateHud(dt) {
    state.level = Math.max(1, Math.floor(state.xp / 160) + 1);
    const m = activeMission();
    hud.cash.textContent = `$${Math.floor(state.cash)}`; hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.online.textContent = state.online ? 'cloud ready' : 'offline'; hud.debugOnline.textContent = hud.online.textContent;
    hud.vehicle.textContent = state.activeVehicle ? 'Neon Cruiser' : 'On foot'; hud.hp.textContent = Math.round(state.activeVehicle?.userData.hp ?? 100); hud.gas.textContent = Math.round(state.activeVehicle?.userData.gas ?? 100);
    hud.mission.textContent = m ? `${m.name} ${Math.floor(m.progress)}/${m.target}` : 'Free roam';
    hud.pos.textContent = `${state.player.x.toFixed(0)},${state.player.y.toFixed(0)},${state.player.z.toFixed(0)}`; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.filter(n => n.parent).length;
    hud.activeVehicle.textContent = state.activeVehicle ? 'Neon Cruiser' : 'None'; hud.slot.textContent = state.slot;
    if (performance.now() - state.lastSave > 30000) save(state.slot);
  }

  function drawMinimap() {
    if (!minimap) return;
    minimap.clearRect(0, 0, 160, 160); minimap.fillStyle = '#071024'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff66'; minimap.beginPath(); minimap.moveTo(80, 0); minimap.lineTo(80, 160); minimap.moveTo(0, 80); minimap.lineTo(160, 80); minimap.stroke();
    minimap.fillStyle = '#ffd166'; minimap.beginPath(); minimap.arc(80, 80, 5, 0, Math.PI * 2); minimap.fill();
  }

  let last = performance.now(), fpsTimer = 0, frames = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++; fpsTimer += dt;
    if (fpsTimer > 0.5) { hud.fps.textContent = Math.round(frames / fpsTimer); fpsTimer = 0; frames = 0; }
    move(dt); streamWorld(); updateNpc(dt); updateCamera(); updateHud(dt); drawMinimap(); renderer.render(scene, camera); requestAnimationFrame(loop);
  }

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  window.addEventListener('error', (e) => { if (hud.error) hud.error.textContent = e.message || 'error'; });

  bindControls(); streamWorld(); load(state.slot); setTimeout(() => loading?.classList.add('hidden'), 450); requestAnimationFrame(loop);
})();
