(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  const cfg = { chunk: 80, radius: 2, worldLimit: 900, playerSpeed: 34, sprint: 1.65, vehicleSpeed: 82 };
  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', lastError: 'none', paused: false,
    keys: new Set(), joystick: { x: 0, y: 0, active: false }, touchSprint: false,
    player: { x: 0, y: 1.2, z: 0, vx: 0, vz: 0, vy: 0, onGround: true, inVehicle: null },
    mission: null, missionsDone: {}, owned: {}, activeChunks: new Map(), pickups: [], npcs: [], vehicles: [], properties: [],
    graphics: localStorage.getItem('nbc_graphics') || 'auto'
  };

  if (!window.THREE) {
    setErr('Three.js failed to load. Check network or CDN access.');
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, 360);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;

  scene.add(new THREE.HemisphereLight(0xbce7ff, 0x101425, 1.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.25);
  sun.position.set(80, 160, 50);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshLambertMaterial({ color: 0x12172b }), grass: new THREE.MeshLambertMaterial({ color: 0x0d482e }),
    player: new THREE.MeshLambertMaterial({ color: 0x17f3ff }), npc: new THREE.MeshLambertMaterial({ color: 0xffcc55 }),
    building: [0x252b55, 0x302064, 0x17365c, 0x3d2358].map((c) => new THREE.MeshLambertMaterial({ color: c })),
    car: new THREE.MeshLambertMaterial({ color: 0xff3366 }), owned: new THREE.MeshLambertMaterial({ color: 0x5ef38c }),
    pickup: new THREE.MeshLambertMaterial({ color: 0x59ff8f }), property: new THREE.MeshLambertMaterial({ color: 0xf7d154 })
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), mats.grass);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1), mats.player);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mats.player);
  head.position.y = 3;
  playerMesh.add(body, head);
  scene.add(playerMesh);

  const missions = [
    { id: 'courier', title: 'Courier Run', text: 'Collect 3 neon cubes', need: 3, reward: 220, xp: 70 },
    { id: 'driver', title: 'Test Drive', text: 'Enter a vehicle and reach the waypoint', need: 1, reward: 260, xp: 85 },
    { id: 'owner', title: 'First Property', text: 'Buy one glowing property', need: 1, reward: 120, xp: 110 }
  ];
  const waypoint = new THREE.Mesh(new THREE.TorusGeometry(4, .25, 8, 24), new THREE.MeshBasicMaterial({ color: 0x17f3ff }));
  waypoint.rotation.x = Math.PI / 2;
  waypoint.position.set(110, .25, 80);
  scene.add(waypoint);

  function seeded(cx, cz) {
    let n = Math.imul(cx + 374761393, 668265263) ^ Math.imul(cz + 2246822519, 3266489917);
    return () => ((n = Math.imul(n ^ (n >>> 15), 1 | n)) >>> 0) / 4294967296;
  }

  function addBox(group, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function createChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (state.activeChunks.has(key)) return;
    const r = seeded(cx, cz);
    const group = new THREE.Group();
    const ox = cx * cfg.chunk, oz = cz * cfg.chunk;
    addBox(group, cfg.chunk, .08, 8, ox, .02, oz, mats.road);
    addBox(group, 8, .08, cfg.chunk, ox, .03, oz, mats.road);
    for (let i = 0; i < 7; i++) {
      const x = ox + (r() - .5) * cfg.chunk * .8;
      const z = oz + (r() - .5) * cfg.chunk * .8;
      if (Math.abs(x - ox) < 8 || Math.abs(z - oz) < 8) continue;
      const h = 8 + r() * 36;
      addBox(group, 8 + r() * 11, h, 8 + r() * 11, x, h / 2, z, mats.building[Math.floor(r() * mats.building.length)]);
    }
    scene.add(group);
    state.activeChunks.set(key, group);

    if (r() > .52) spawnPickup(ox + (r() - .5) * 52, oz + (r() - .5) * 52, key);
    if (r() > .7) spawnNPC(ox + (r() - .5) * 48, oz + (r() - .5) * 48, key);
    if (r() > .74) spawnVehicle(ox + (r() - .5) * 42, oz + (r() - .5) * 42, key);
    if (r() > .78) spawnProperty(ox + (r() - .5) * 45, oz + (r() - .5) * 45, key);
  }

  function removeFarChunks(pcx, pcz) {
    for (const [key, group] of state.activeChunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > cfg.radius || Math.abs(cz - pcz) > cfg.radius) {
        scene.remove(group); group.traverse?.((o) => o.geometry?.dispose?.()); state.activeChunks.delete(key);
      }
    }
    for (const list of [state.pickups, state.npcs, state.vehicles, state.properties]) {
      for (let i = list.length - 1; i >= 0; i--) if (!state.activeChunks.has(list[i].chunk)) { scene.remove(list[i].mesh); list.splice(i, 1); }
    }
  }

  function streamWorld() {
    const pcx = Math.round(state.player.x / cfg.chunk), pcz = Math.round(state.player.z / cfg.chunk);
    for (let x = pcx - cfg.radius; x <= pcx + cfg.radius; x++) for (let z = pcz - cfg.radius; z <= pcz + cfg.radius; z++) createChunk(x, z);
    removeFarChunks(pcx, pcz);
  }

  function spawnPickup(x, z, chunk) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), mats.pickup); mesh.position.set(x, 1.4, z); scene.add(mesh);
    state.pickups.push({ mesh, x, z, chunk, spin: Math.random() + .5 });
  }
  function spawnNPC(x, z, chunk) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1), mats.npc); mesh.position.set(x, 1.1, z); scene.add(mesh);
    state.npcs.push({ mesh, x, z, chunk, t: Math.random() * 8 });
  }
  function spawnVehicle(x, z, chunk) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 6), mats.car); mesh.position.set(x, .9, z); scene.add(mesh);
    state.vehicles.push({ mesh, x, z, chunk, hp: 100, gas: 100, angle: 0 });
  }
  function spawnProperty(x, z, chunk) {
    const id = `p_${Math.round(x)}_${Math.round(z)}`;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 7), state.owned[id] ? mats.owned : mats.property); mesh.position.set(x, 1, z); scene.add(mesh);
    state.properties.push({ mesh, x, z, chunk, id, price: 300 });
  }

  function inputVector() {
    let x = 0, z = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) z -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) z += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    x += state.joystick.x; z += state.joystick.y;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, moving: Math.hypot(x, z) > .08 };
  }

  function update(dt) {
    if (state.paused) return;
    const v = inputVector();
    const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.touchSprint;
    const veh = state.player.inVehicle;
    const speed = veh ? cfg.vehicleSpeed : cfg.playerSpeed * (sprint ? cfg.sprint : 1);
    if (v.moving) {
      state.player.x += v.x * speed * dt;
      state.player.z += v.z * speed * dt;
      const angle = Math.atan2(v.x, v.z);
      playerMesh.rotation.y = angle;
      if (veh) { veh.angle = angle; veh.gas = Math.max(0, veh.gas - dt * 3.5); veh.mesh.rotation.y = angle; }
    }
    state.player.x = THREE.MathUtils.clamp(state.player.x, -cfg.worldLimit, cfg.worldLimit);
    state.player.z = THREE.MathUtils.clamp(state.player.z, -cfg.worldLimit, cfg.worldLimit);
    if (!state.player.onGround) { state.player.vy -= 34 * dt; state.player.y += state.player.vy * dt; if (state.player.y <= 1.2) { state.player.y = 1.2; state.player.onGround = true; state.player.vy = 0; } }
    playerMesh.position.set(state.player.x, state.player.y - 1.2, state.player.z);
    if (veh) veh.mesh.position.set(state.player.x, .9, state.player.z);
    for (const p of state.pickups) { p.mesh.rotation.y += dt * p.spin; if (dist2(p, state.player) < 16) collectPickup(p); }
    for (const n of state.npcs) { n.t += dt; n.mesh.position.x = n.x + Math.sin(n.t) * 4; n.mesh.position.z = n.z + Math.cos(n.t * .7) * 4; }
    waypoint.rotation.z += dt * 1.8;
    streamWorld(); updateCamera(dt); updateMission(); updateHud();
  }

  function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
  function collectPickup(p) {
    scene.remove(p.mesh); state.pickups.splice(state.pickups.indexOf(p), 1); state.cash += 35; state.xp += 20; toast('+$35 neon cube');
    if (state.mission?.id === 'courier') state.mission.progress++;
  }
  function updateMission() {
    if (!state.mission) state.mission = missions.find(m => !state.missionsDone[m.id]) || missions[0];
    if (state.mission.id === 'driver' && state.player.inVehicle && Math.hypot(state.player.x - 110, state.player.z - 80) < 14) state.mission.progress = 1;
    if (state.mission.id === 'owner') state.mission.progress = Object.keys(state.owned).length;
    if ((state.mission.progress || 0) >= state.mission.need && !state.missionsDone[state.mission.id]) {
      state.cash += state.mission.reward; state.xp += state.mission.xp; state.missionsDone[state.mission.id] = true;
      toast(`Mission complete: ${state.mission.title} +$${state.mission.reward}`); state.mission = missions.find(m => !state.missionsDone[m.id]) || null;
    }
    state.level = 1 + Math.floor(state.xp / 150);
  }
  function interact() {
    let nearVeh = state.vehicles.find(v => dist2(v, state.player) < 36);
    if (state.player.inVehicle) { state.player.inVehicle = null; toast('Exited vehicle'); return; }
    if (nearVeh) { state.player.inVehicle = nearVeh; toast('Entered vehicle'); if (state.mission?.id === 'driver') state.mission.progress = Math.max(state.mission.progress || 0, 0); return; }
    const prop = state.properties.find(p => dist2(p, state.player) < 64);
    if (prop && !state.owned[prop.id]) {
      if (state.cash >= prop.price) { state.cash -= prop.price; state.owned[prop.id] = true; prop.mesh.material = mats.owned; toast('Property owned'); }
      else toast(`Need $${prop.price} to buy`);
    }
  }
  function jump() { if (state.player.onGround && !state.player.inVehicle) { state.player.onGround = false; state.player.vy = 13; } }
  function unstuck() { state.player.x += 8; state.player.z += 8; state.player.y = 1.2; state.player.inVehicle = null; toast('Unstuck'); }

  function updateCamera(dt) {
    const target = new THREE.Vector3(state.player.x, state.player.y + 7, state.player.z + 16);
    if (state.player.inVehicle) target.y += 3;
    camera.position.lerp(target, 1 - Math.pow(.001, dt));
    camera.lookAt(state.player.x, state.player.y + 1.5, state.player.z);
  }
  function updateHud() {
    hud.cash.textContent = `$${state.cash|0}`; hud.xp.textContent = state.xp|0; hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.online.textContent = window.NeonBlockCloud?.enabled ? 'cloud optional' : 'local'; hud.debugOnline.textContent = hud.online.textContent;
    const veh = state.player.inVehicle; hud.vehicle.textContent = veh ? 'Neon Cruiser' : 'On foot'; hud.hp.textContent = veh ? veh.hp|0 : 100; hud.gas.textContent = veh ? veh.gas|0 : 100;
    hud.mission.textContent = state.mission ? `${state.mission.title} ${(state.mission.progress||0)}/${state.mission.need}` : 'Complete';
    hud.pos.textContent = `${state.player.x.toFixed(0)},${state.player.y.toFixed(0)},${state.player.z.toFixed(0)}`; hud.chunks.textContent = state.activeChunks.size;
    hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = veh ? 'Neon Cruiser' : 'None'; hud.saveSlot.textContent = state.slot; hud.lastError.textContent = state.lastError;
  }
  function setErr(msg) { state.lastError = msg; console.warn(msg); if (hud.lastError) hud.lastError.textContent = msg; }
  function toast(msg) { const el = $('reward-popup'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 1800); }

  function save(slot = state.slot) {
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, owned: state.owned, missionsDone: state.missionsDone, player: state.player };
    localStorage.setItem(`nbc_${slot}`, JSON.stringify(data)); window.NeonBlockCloud?.save?.(slot, data).catch(e => setErr(e.message)); toast('Game saved'); return data;
  }
  function load(slot = state.slot) {
    const raw = localStorage.getItem(`nbc_${slot}`); if (!raw) return toast('No save in this slot');
    try { const d = JSON.parse(raw); Object.assign(state, { cash: d.cash||0, xp: d.xp||0, level: d.level||1, wanted: d.wanted||0, owned: d.owned||{}, missionsDone: d.missionsDone||{} }); Object.assign(state.player, d.player||{}); state.player.inVehicle = null; toast('Loaded save'); }
    catch(e) { setErr(e.message); }
  }

  addEventListener('keydown', e => { state.keys.add(e.code); if (e.code === 'Space') jump(); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyU') unstuck(); });
  addEventListener('keyup', e => state.keys.delete(e.code));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  $('btn-mobile-jump')?.addEventListener('click', jump); $('btn-mobile-interact')?.addEventListener('click', interact); $('btn-mobile-unstuck')?.addEventListener('click', unstuck); $('btn-mobile-pause')?.addEventListener('click', togglePause);
  $('btn-mobile-sprint')?.addEventListener('pointerdown', () => state.touchSprint = true); $('btn-mobile-sprint')?.addEventListener('pointerup', () => state.touchSprint = false);
  $('btn-resume')?.addEventListener('click', togglePause); $('btn-save')?.addEventListener('click', () => $('save-panel').classList.toggle('hidden')); $('btn-load')?.addEventListener('click', () => load());
  $('btn-settings')?.addEventListener('click', () => $('settings-panel').classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click', () => $('settings-panel').classList.add('hidden'));
  $('graphics-quality') && ($('graphics-quality').value = state.graphics, $('graphics-quality').onchange = e => { localStorage.setItem('nbc_graphics', e.target.value); renderer.setPixelRatio(e.target.value === 'low' ? 1 : Math.min(devicePixelRatio || 1, 1.75)); });
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { state.slot = b.dataset.slot; save(state.slot); });
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => { state.slot = b.dataset.slot; load(state.slot); });
  $('btn-export')?.addEventListener('click', () => $('export-json').value = JSON.stringify(save(), null, 2));
  $('btn-import')?.addEventListener('click', () => { try { localStorage.setItem(`nbc_${state.slot}`, $('export-json').value); load(state.slot); } catch(e){ setErr(e.message); } });
  $('btn-close-save')?.addEventListener('click', () => $('save-panel').classList.add('hidden'));

  function togglePause() { state.paused = !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }
  function setupJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick'); if (!box || !stick) return;
    const move = (e) => { const r = box.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2; const p = e.touches ? e.touches[0] : e; let dx = p.clientX - cx, dy = p.clientY - cy; const len = Math.min(48, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); dx = Math.cos(a) * len; dy = Math.sin(a) * len; stick.style.transform = `translate(${dx}px,${dy}px)`; state.joystick.x = dx/48; state.joystick.y = dy/48; };
    const end = () => { stick.style.transform = 'translate(0,0)'; state.joystick.x = 0; state.joystick.y = 0; state.joystick.active = false; };
    box.addEventListener('pointerdown', e => { state.joystick.active = true; box.setPointerCapture(e.pointerId); move(e); }); box.addEventListener('pointermove', e => state.joystick.active && move(e)); box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }

  streamWorld(); setupJoystick(); load('slot1'); setTimeout(() => $('loading-screen')?.remove(), 500);
  let last = performance.now(), frames = 0, acc = 0;
  function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; update(dt); renderer.render(scene, camera); frames++; acc += dt; if (acc > .5) { hud.fps.textContent = Math.round(frames / acc); frames = 0; acc = 0; } requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  setInterval(() => save('autosave'), 30000);
})();
