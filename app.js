/* NeonBlock City - static playable core */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), lastError: $('debug-last-error')
  };

  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false,
    quality: localStorage.getItem('nbc_quality') || 'auto',
    player: { x: 0, y: 1.05, z: 0, vy: 0, yaw: 0, speed: 0, onGround: true },
    vehicle: null, owned: new Set(JSON.parse(localStorage.getItem('nbc_owned') || '[]')),
    mission: null, completed: 0, lastSave: 0
  };

  const keys = new Set();
  const chunks = new Map();
  const pickups = [];
  const npcs = [];
  const vehicles = [];
  const properties = [];
  const CHUNK = 90;
  const STREAM_RADIUS = 2;
  const clock = new THREE.Clock();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, 420);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0x79d7ff, 0x111328, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.25);
  sun.position.set(40, 80, 30); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x10162d, roughness: 0.85 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x0d382f, roughness: 1 }),
    neon: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x0bb9d1, emissiveIntensity: 1.1 }),
    pink: new THREE.MeshStandardMaterial({ color: 0xff3df2, emissive: 0x991188, emissiveIntensity: 0.75 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x8a5b00, emissiveIntensity: 0.35 }),
    player: new THREE.MeshStandardMaterial({ color: 0x38ff9f, roughness: 0.55 }),
    car: new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.5 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xf72585, roughness: 0.7 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x185c34, emissiveIntensity: 0.35 })
  };

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.7), mats.player); body.castShadow = true; body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), mats.gold); head.castShadow = true; head.position.y = 1.85;
  player.add(body, head); scene.add(player);

  function box(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.castShadow = h > 1; mesh.receiveShadow = true; return mesh;
  }

  function seeded(cx, cz, i) { const n = Math.sin(cx * 92821 + cz * 68917 + i * 1237) * 43758.5453; return n - Math.floor(n); }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function makeChunk(cx, cz) {
    const group = new THREE.Group(); group.userData.cx = cx; group.userData.cz = cz;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    group.add(box(CHUNK, 0.08, CHUNK, mats.grass, ox, -0.04, oz));
    group.add(box(8, 0.1, CHUNK, mats.road, ox, 0.02, oz));
    group.add(box(CHUNK, 0.1, 8, mats.road, ox, 0.03, oz));

    for (let i = 0; i < 10; i++) {
      const sx = (seeded(cx, cz, i) - 0.5) * (CHUNK - 14) + ox;
      const sz = (seeded(cx, cz, i + 40) - 0.5) * (CHUNK - 14) + oz;
      if (Math.abs(sx - ox) < 8 || Math.abs(sz - oz) < 8) continue;
      const h = 7 + Math.floor(seeded(cx, cz, i + 9) * 28);
      const mat = seeded(cx, cz, i + 19) > 0.6 ? mats.pink : mats.neon;
      const b = box(8 + seeded(cx, cz, i + 3) * 8, h, 8 + seeded(cx, cz, i + 4) * 8, mat, sx, h / 2, sz);
      group.add(b);
      if (seeded(cx, cz, i + 88) > 0.78) {
        const id = `tower-${cx}-${cz}-${i}`;
        properties.push({ id, x: sx, z: sz, price: 500 + h * 20, name: `Neon Tower ${properties.length + 1}` });
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = ox + (seeded(cx, cz, i + 120) - 0.5) * 65;
      const z = oz + (seeded(cx, cz, i + 121) - 0.5) * 65;
      const p = box(1.2, 1.2, 1.2, mats.gold, x, 0.8, z); p.userData.pickup = true; group.add(p); pickups.push(p);
    }
    if (seeded(cx, cz, 555) > 0.55) spawnVehicle(ox + 18, oz - 14, group);
    if (seeded(cx, cz, 777) > 0.45) spawnNpc(ox - 20, oz + 16, group);
    scene.add(group); chunks.set(chunkKey(cx, cz), group);
  }

  function spawnVehicle(x, z, group) {
    const car = new THREE.Group();
    car.add(box(3.4, 0.8, 5.2, mats.car, 0, 0.45, 0));
    car.add(box(2.4, 0.8, 2.2, mats.neon, 0, 1.2, -0.3));
    car.position.set(x, 0.08, z); car.userData = { hp: 100, gas: 100, speed: 0, yaw: 0 };
    group.add(car); vehicles.push(car);
  }

  function spawnNpc(x, z, group) {
    const npc = box(1, 1.7, 1, mats.npc, x, 0.85, z); npc.userData.t = Math.random() * 9; group.add(npc); npcs.push(npc);
  }

  function streamWorld() {
    const pcx = Math.round(state.player.x / CHUNK), pcz = Math.round(state.player.z / CHUNK);
    for (let cx = pcx - STREAM_RADIUS; cx <= pcx + STREAM_RADIUS; cx++) for (let cz = pcz - STREAM_RADIUS; cz <= pcz + STREAM_RADIUS; cz++) {
      if (!chunks.has(chunkKey(cx, cz))) makeChunk(cx, cz);
    }
    for (const [key, group] of chunks) {
      if (Math.abs(group.userData.cx - pcx) > STREAM_RADIUS + 1 || Math.abs(group.userData.cz - pcz) > STREAM_RADIUS + 1) {
        scene.remove(group); chunks.delete(key);
      }
    }
  }

  const missions = [
    { id: 'courier', name: 'Neon Courier', text: 'Reach the glowing delivery block', reward: 175, xp: 80 },
    { id: 'collect', name: 'Cash Grab', text: 'Collect 3 gold cubes', reward: 225, xp: 110 },
    { id: 'driver', name: 'Test Drive', text: 'Enter a vehicle and drive 200m', reward: 300, xp: 140 }
  ];

  function startMission(index = (state.completed % missions.length)) {
    const m = { ...missions[index], progress: 0, target: { x: state.player.x + 55, z: state.player.z + 30 }, startedAt: Date.now() };
    state.mission = m; pop(`Mission: ${m.name}`); updateHud();
  }
  function completeMission() {
    if (!state.mission) return;
    state.cash += state.mission.reward; state.xp += state.mission.xp; state.completed++;
    state.level = 1 + Math.floor(state.xp / 250); pop(`+$${state.mission.reward} ${state.mission.name} complete`);
    state.mission = null; setTimeout(() => startMission(), 900); saveGame(state.slot, false);
  }

  function pop(msg) { const el = $('reward-popup'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(pop.t); pop.t = setTimeout(() => el.classList.add('hidden'), 1800); }
  function dist2(a, x, z) { return Math.hypot(a.x - x, a.z - z); }

  const input = { joyX: 0, joyY: 0, sprint: false, interactQueued: false, jumpQueued: false };
  addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') input.interactQueued = true; if (e.code === 'Space') input.jumpQueued = true; if (e.code === 'Escape') togglePause(); });
  addEventListener('keyup', e => keys.delete(e.code));

  function bindButton(id, down, up) { const b = $(id); if (!b) return; ['pointerdown','touchstart'].forEach(ev => b.addEventListener(ev, e => { e.preventDefault(); down(); })); ['pointerup','pointercancel','touchend'].forEach(ev => b.addEventListener(ev, e => { e.preventDefault(); (up || (()=>{}))(); })); }
  bindButton('btn-mobile-jump', () => input.jumpQueued = true);
  bindButton('btn-mobile-sprint', () => input.sprint = true, () => input.sprint = false);
  bindButton('btn-mobile-interact', () => input.interactQueued = true);
  bindButton('btn-mobile-unstuck', () => { state.player.x += 3; state.player.y = 2; state.player.z += 3; pop('Unstuck'); });
  bindButton('btn-mobile-pause', togglePause);

  const joy = $('joystick-container'), stick = $('joystick-stick');
  let joyId = null;
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(joyId); moveJoy(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
  joy.addEventListener('pointerup', resetJoy); joy.addEventListener('pointercancel', resetJoy);
  function moveJoy(e) { const r = joy.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2); const len = Math.min(48, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); input.joyX = Math.cos(a) * len / 48; input.joyY = Math.sin(a) * len / 48; stick.style.transform = `translate(${Math.cos(a)*len}px,${Math.sin(a)*len}px)`; }
  function resetJoy() { joyId = null; input.joyX = input.joyY = 0; stick.style.transform = 'translate(0,0)'; }

  function interact() {
    const px = state.player.x, pz = state.player.z;
    if (state.vehicle) { exitVehicle(); return; }
    let nearest = null, nd = 999;
    for (const v of vehicles) { const d = v.position.distanceTo(new THREE.Vector3(px, 0, pz)); if (d < nd) { nd = d; nearest = v; } }
    if (nearest && nd < 7) { enterVehicle(nearest); return; }
    for (const prop of properties) {
      if (dist2(prop, px, pz) < 8) {
        if (state.owned.has(prop.id)) return pop(`${prop.name} already owned`);
        if (state.cash >= prop.price) { state.cash -= prop.price; state.owned.add(prop.id); localStorage.setItem('nbc_owned', JSON.stringify([...state.owned])); pop(`Bought ${prop.name}`); saveGame(state.slot, false); }
        else pop(`Need $${prop.price} to buy ${prop.name}`);
        return;
      }
    }
    if (!state.mission) startMission(); else pop(state.mission.text);
  }
  function enterVehicle(v) { state.vehicle = v; pop('Vehicle entered'); }
  function exitVehicle() { state.player.x = state.vehicle.position.x + 4; state.player.z = state.vehicle.position.z; state.vehicle = null; pop('Vehicle exited'); }

  function updatePlayer(dt) {
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - input.joyY;
    const turn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + input.joyX;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.sprint;
    if (state.vehicle) {
      const v = state.vehicle.userData; v.yaw -= turn * dt * 2.1; v.speed += forward * dt * (sprint ? 34 : 22); v.speed *= Math.pow(0.82, dt * 8); v.speed = Math.max(-18, Math.min(sprint ? 42 : 30, v.speed));
      v.gas = Math.max(0, v.gas - Math.abs(v.speed) * dt * 0.015); if (v.gas <= 0) v.speed = 0;
      state.vehicle.rotation.y = v.yaw; state.vehicle.position.x -= Math.sin(v.yaw) * v.speed * dt; state.vehicle.position.z -= Math.cos(v.yaw) * v.speed * dt;
      state.player.x = state.vehicle.position.x; state.player.z = state.vehicle.position.z; state.player.y = 1.05; player.visible = false;
      if (state.mission?.id === 'driver') { state.mission.progress += Math.abs(v.speed) * dt; if (state.mission.progress >= 200) completeMission(); }
    } else {
      state.player.y += state.player.vy * dt; state.player.vy -= 26 * dt;
      if (state.player.y <= 1.05) { state.player.y = 1.05; state.player.vy = 0; state.player.onGround = true; }
      if (input.jumpQueued && state.player.onGround) { state.player.vy = 9; state.player.onGround = false; }
      state.player.yaw -= turn * dt * 2.8;
      const move = forward * (sprint ? 15 : 9) * dt;
      state.player.x -= Math.sin(state.player.yaw) * move; state.player.z -= Math.cos(state.player.yaw) * move;
      player.visible = true; player.position.set(state.player.x, state.player.y - 1.05, state.player.z); player.rotation.y = state.player.yaw;
    }
    if (input.interactQueued) interact(); input.interactQueued = false; input.jumpQueued = false;
  }

  function updateGame(dt) {
    streamWorld(); updatePlayer(dt);
    for (const p of pickups) if (p.parent && p.position.distanceTo(new THREE.Vector3(state.player.x, p.position.y, state.player.z)) < 2.6) { p.parent.remove(p); state.cash += 35; state.xp += 12; pop('+$35 pickup'); }
    for (const n of npcs) { n.userData.t += dt; n.position.x += Math.sin(n.userData.t) * dt * 1.5; n.position.z += Math.cos(n.userData.t * 0.7) * dt * 1.5; }
    if (state.mission) {
      if (state.mission.id === 'courier' && dist2(state.mission.target, state.player.x, state.player.z) < 6) completeMission();
      if (state.mission.id === 'collect' && state.cash >= 250 + 35 * 3) completeMission();
    }
    updateCamera(dt); updateHud(); drawMinimap();
    if (Date.now() - state.lastSave > 30000) saveGame(state.slot, false);
  }

  function updateCamera(dt) {
    const target = state.vehicle ? state.vehicle.position : player.position;
    const yaw = state.vehicle ? state.vehicle.userData.yaw : state.player.yaw;
    const desired = new THREE.Vector3(target.x + Math.sin(yaw) * 11, target.y + 8, target.z + Math.cos(yaw) * 11);
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt)); camera.lookAt(target.x, target.y + 2, target.z);
  }

  const mm = $('minimap-canvas'), mctx = mm.getContext('2d');
  function drawMinimap() {
    mctx.clearRect(0,0,160,160); mctx.fillStyle = '#071027'; mctx.fillRect(0,0,160,160); mctx.strokeStyle = '#17f3ff55';
    for (let i = 20; i < 160; i += 30) { mctx.beginPath(); mctx.moveTo(i,0); mctx.lineTo(i,160); mctx.moveTo(0,i); mctx.lineTo(160,i); mctx.stroke(); }
    mctx.fillStyle = '#5ef38c'; mctx.fillRect(77,77,6,6);
    if (state.mission?.target) { const dx = (state.mission.target.x - state.player.x) / 3, dz = (state.mission.target.z - state.player.z) / 3; mctx.fillStyle = '#ffd166'; mctx.fillRect(80 + Math.max(-75, Math.min(75, dx)), 80 + Math.max(-75, Math.min(75, dz)), 5, 5); }
  }

  function updateHud() {
    hud.cash.textContent = Math.floor(state.cash); hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.online.textContent = window.NeonBlockCloud?.enabled ? 'cloud-ready' : 'local'; hud.onlineDebug.textContent = hud.online.textContent;
    hud.vehicle.textContent = state.vehicle ? 'Neon Cruiser' : 'On foot'; hud.hp.textContent = state.vehicle ? Math.floor(state.vehicle.userData.hp) : 100; hud.gas.textContent = state.vehicle ? Math.floor(state.vehicle.userData.gas) : 100;
    hud.mission.textContent = state.mission ? state.mission.name : 'Press E / Interact'; hud.pos.textContent = `${state.player.x.toFixed(0)},${state.player.y.toFixed(0)},${state.player.z.toFixed(0)}`;
    hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.filter(n => n.parent).length; hud.activeVehicle.textContent = state.vehicle ? 'Neon Cruiser' : 'None'; hud.slot.textContent = state.slot;
  }

  function savePayload() { return { v: 1, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player, owned: [...state.owned], completed: state.completed, quality: state.quality, savedAt: new Date().toISOString() }; }
  async function saveGame(slot = 'slot1', noisy = true) { state.lastSave = Date.now(); const payload = savePayload(); localStorage.setItem(`nbc_${slot}`, JSON.stringify(payload)); if (window.NeonBlockCloud?.save) window.NeonBlockCloud.save(slot, payload).catch(e => hud.lastError.textContent = e.message); if (noisy) pop(`Saved ${slot}`); }
  async function loadGame(slot = 'slot1') { const raw = localStorage.getItem(`nbc_${slot}`); if (!raw) return pop('No local save found'); try { const data = JSON.parse(raw); Object.assign(state.player, data.player || {}); state.cash = data.cash ?? state.cash; state.xp = data.xp ?? state.xp; state.level = data.level ?? state.level; state.wanted = data.wanted ?? 0; state.completed = data.completed ?? 0; state.owned = new Set(data.owned || []); state.slot = slot; pop(`Loaded ${slot}`); } catch(e) { hud.lastError.textContent = e.message; pop('Load failed'); } }

  function togglePause() { state.paused = !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }
  $('btn-resume')?.addEventListener('click', togglePause); $('btn-mobile-pause')?.addEventListener('click', () => {});
  $('btn-settings')?.addEventListener('click', () => $('settings-panel').classList.toggle('hidden'));
  $('btn-close-settings')?.addEventListener('click', () => $('settings-panel').classList.add('hidden'));
  $('graphics-quality')?.addEventListener('change', e => { state.quality = e.target.value; localStorage.setItem('nbc_quality', state.quality); renderer.setPixelRatio(state.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.5)); });
  $('btn-save')?.addEventListener('click', () => $('save-panel').classList.toggle('hidden'));
  $('btn-load')?.addEventListener('click', () => loadGame(state.slot)); $('btn-close-save')?.addEventListener('click', () => $('save-panel').classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; saveGame(state.slot); }));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot)));
  $('btn-export')?.addEventListener('click', () => $('export-json').value = JSON.stringify(savePayload(), null, 2));
  $('btn-import')?.addEventListener('click', () => { try { localStorage.setItem(`nbc_${state.slot}`, $('export-json').value); loadGame(state.slot); } catch(e) { hud.lastError.textContent = e.message; } });

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  let frames = 0, fpst = performance.now();
  function loop() { requestAnimationFrame(loop); const dt = Math.min(0.05, clock.getDelta()); if (!state.paused) updateGame(dt); renderer.render(scene, camera); frames++; if (performance.now() - fpst > 1000) { hud.fps.textContent = frames; frames = 0; fpst = performance.now(); } }

  try { streamWorld(); startMission(0); $('loading-screen')?.classList.add('hidden'); loop(); } catch (e) { hud.lastError.textContent = e.message; console.error(e); }
})();
