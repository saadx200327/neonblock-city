(() => {
  'use strict';

  const SAVE_PREFIX = 'neonblock-city:';
  const CHUNK_SIZE = 72;
  const STREAM_RADIUS = 2;
  const MAX_NPCS = 24;
  const keys = new Set();
  const mobile = { x: 0, y: 0, sprint: false, jump: false, interact: false };
  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, slot: 'slot1',
    pos: { x: 0, y: 2, z: 0 }, velY: 0, onGround: false,
    mission: null, owned: {}, vehicle: null, lastSave: 0, lastError: 'none', online: 'offline'
  };

  const canvas = document.getElementById('game-canvas');
  const hud = id => document.getElementById(id);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, 280);

  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 600);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);

  const hemi = new THREE.HemisphereLight(0x8ff7ff, 0x121526, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(80, 130, 60);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x111525, roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x0b1024, roughness: 0.8 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x06343a }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffc857, emissive: 0x332100 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x13451f }),
    owned: new THREE.MeshStandardMaterial({ color: 0x944dff, emissive: 0x201040 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x360712 })
  };

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.7), mats.player);
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.75), mats.player);
  head.position.y = 2.05;
  player.add(body, head);
  scene.add(player);

  const chunks = new Map();
  const npcs = [];
  const pickups = [];
  const vehicles = [];
  const lots = [];
  const minimap = document.getElementById('minimap-canvas')?.getContext('2d');

  function seeded(cx, cz, n = 1) {
    let x = Math.sin(cx * 928371 + cz * 19283 + n * 8191) * 10000;
    return x - Math.floor(x);
  }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function addBox(group, x, y, z, sx, sy, sz, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function makeChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData.cx = cx; group.userData.cz = cz;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    addBox(group, ox, -0.05, oz, CHUNK_SIZE, 0.1, CHUNK_SIZE, mats.ground);
    addBox(group, ox, 0.01, oz, CHUNK_SIZE, 0.05, 9, mats.road);
    addBox(group, ox, 0.02, oz, 9, 0.05, CHUNK_SIZE, mats.road);
    for (let i = 0; i < 12; i++) {
      const x = ox + (seeded(cx, cz, i) - 0.5) * CHUNK_SIZE * 0.82;
      const z = oz + (seeded(cx, cz, i + 30) - 0.5) * CHUNK_SIZE * 0.82;
      if (Math.abs(x - ox) < 8 || Math.abs(z - oz) < 8) continue;
      const h = 6 + seeded(cx, cz, i + 80) * 26;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + seeded(cx, cz, i + 7) * 0.2, 0.7, 0.22), emissive: 0x05091a });
      addBox(group, x, h / 2, z, 8 + seeded(cx, cz, i + 1) * 8, h, 8 + seeded(cx, cz, i + 2) * 8, mat);
    }
    if (seeded(cx, cz, 99) > 0.62) spawnPickup(ox + 18, oz - 16);
    if (seeded(cx, cz, 111) > 0.70) spawnVehicle(ox - 20, oz + 16);
    if (seeded(cx, cz, 222) > 0.68) spawnLot(ox + 22, oz + 22, cx, cz);
    scene.add(group);
    chunks.set(chunkKey(cx, cz), group);
  }
  function streamWorld() {
    const pcx = Math.round(player.position.x / CHUNK_SIZE);
    const pcz = Math.round(player.position.z / CHUNK_SIZE);
    for (let x = pcx - STREAM_RADIUS; x <= pcx + STREAM_RADIUS; x++) {
      for (let z = pcz - STREAM_RADIUS; z <= pcz + STREAM_RADIUS; z++) if (!chunks.has(chunkKey(x, z))) makeChunk(x, z);
    }
    for (const [key, group] of chunks) {
      if (Math.abs(group.userData.cx - pcx) > STREAM_RADIUS + 1 || Math.abs(group.userData.cz - pcz) > STREAM_RADIUS + 1) {
        scene.remove(group); chunks.delete(key);
      }
    }
    while (npcs.length < MAX_NPCS) spawnNpc(player.position.x + (Math.random() - 0.5) * 130, player.position.z + (Math.random() - 0.5) * 130);
  }
  function spawnNpc(x, z) {
    const npc = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.7), mats.npc);
    npc.position.set(x, 0.8, z); npc.userData.dir = Math.random() * Math.PI * 2; npc.userData.t = 0;
    npcs.push(npc); scene.add(npc);
  }
  function spawnPickup(x, z) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats.pickup);
    p.position.set(x, 1, z); p.userData.value = 45;
    pickups.push(p); scene.add(p);
  }
  function spawnVehicle(x, z) {
    const v = new THREE.Group();
    addBox(v, 0, 0.55, 0, 3.2, 0.8, 5, mats.vehicle);
    addBox(v, 0, 1.2, -0.4, 2.2, 0.7, 2.3, mats.vehicle);
    v.position.set(x, 0, z); v.userData = { hp: 100, gas: 100, name: 'Neon Cruiser' };
    vehicles.push(v); scene.add(v);
  }
  function spawnLot(x, z, cx, cz) {
    const id = `lot-${cx}-${cz}`;
    const lot = addBox(scene, x, 0.08, z, 10, 0.15, 10, state.owned[id] ? mats.owned : mats.pickup);
    lot.userData = { id, price: 300 };
    lots.push(lot);
  }

  const missions = [
    { id: 'courier', name: 'Courier Run', target: new THREE.Vector3(90, 0, 70), reward: 220, xp: 80 },
    { id: 'collector', name: 'Collect Neon Cubes', target: null, reward: 160, xp: 60 },
    { id: 'driver', name: 'Test Drive', target: new THREE.Vector3(-120, 0, -90), reward: 260, xp: 100 }
  ];
  function startMission(id) {
    const m = missions.find(x => x.id === id) || missions[0];
    state.mission = { ...m, progress: 0 };
    popup(`Mission started: ${m.name}`);
  }
  function completeMission() {
    if (!state.mission) return;
    state.cash += state.mission.reward; state.xp += state.mission.xp;
    popup(`Complete +$${state.mission.reward} +${state.mission.xp}XP`);
    state.mission = null; levelCheck(); saveGame(state.slot, true);
  }
  function levelCheck() { state.level = 1 + Math.floor(state.xp / 250); }

  function move(dt) {
    const speedBase = state.vehicle ? 18 : 8;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobile.sprint;
    const speed = speedBase * (sprint ? 1.55 : 1);
    const inputX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + mobile.x;
    const inputZ = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + mobile.y;
    const len = Math.hypot(inputX, inputZ) || 1;
    const dx = inputX / len, dz = inputZ / len;
    const target = state.vehicle || player;
    target.position.x += dx * speed * dt;
    target.position.z += dz * speed * dt;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) target.rotation.y = Math.atan2(dx, dz);
    if (state.vehicle) {
      state.vehicle.userData.gas = Math.max(0, state.vehicle.userData.gas - (Math.abs(dx) + Math.abs(dz)) * dt * 1.4);
      player.position.copy(state.vehicle.position).add(new THREE.Vector3(0, 0.2, 0));
    } else {
      state.velY -= 28 * dt;
      if ((keys.has('Space') || mobile.jump) && state.onGround) { state.velY = 10.5; state.onGround = false; }
      player.position.y += state.velY * dt;
      if (player.position.y <= 0) { player.position.y = 0; state.velY = 0; state.onGround = true; }
    }
  }
  function interact() {
    let best = null, bd = 7;
    for (const v of vehicles) { const d = v.position.distanceTo(player.position); if (d < bd) { best = v; bd = d; } }
    if (best && !state.vehicle) { state.vehicle = best; popup('Entered Neon Cruiser'); return; }
    if (state.vehicle) { state.vehicle = null; popup('Exited vehicle'); return; }
    for (const lot of lots) {
      if (lot.position.distanceTo(player.position) < 7) {
        const id = lot.userData.id;
        if (state.owned[id]) return popup('You already own this block');
        if (state.cash < lot.userData.price) return popup(`Need $${lot.userData.price} to buy`);
        state.cash -= lot.userData.price; state.owned[id] = true; lot.material = mats.owned; popup('Block owned!'); saveGame(state.slot, true); return;
      }
    }
    if (!state.mission) startMission(missions[Math.floor(Math.random() * missions.length)].id);
  }
  function collectAndMission() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; p.rotation.y += 0.04;
      if (p.position.distanceTo(player.position) < 2.4) {
        state.cash += p.userData.value; state.xp += 20; scene.remove(p); pickups.splice(i, 1); popup(`+$${p.userData.value}`); levelCheck();
        if (state.mission?.id === 'collector') completeMission();
      }
    }
    if (state.mission?.target && player.position.distanceTo(state.mission.target) < 8) completeMission();
  }
  function updateNpcs(dt) {
    for (const n of npcs) {
      n.userData.t -= dt;
      if (n.userData.t <= 0) { n.userData.dir += (Math.random() - 0.5) * 1.4; n.userData.t = 1 + Math.random() * 3; }
      n.position.x += Math.sin(n.userData.dir) * dt * 2.3;
      n.position.z += Math.cos(n.userData.dir) * dt * 2.3;
      n.rotation.y = n.userData.dir;
    }
  }
  function cameraFollow() {
    const target = player.position.clone();
    const back = new THREE.Vector3(Math.sin(player.rotation.y) * -13, 10, Math.cos(player.rotation.y) * -13);
    camera.position.lerp(target.clone().add(back), 0.08);
    camera.lookAt(target.x, target.y + 1.8, target.z);
  }
  function popup(text) {
    const el = hud('reward-popup'); if (!el) return;
    el.textContent = text; el.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => el.classList.add('hidden'), 1800);
  }
  function savePayload() { return { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, pos: player.position, owned: state.owned }; }
  async function saveGame(slot = 'slot1', silent = false) {
    state.slot = slot; const data = savePayload(); localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
    if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(slot, data); state.online = 'cloud-ready'; } catch (e) { state.lastError = e.message; state.online = 'offline'; } }
    if (!silent) popup(`Saved ${slot}`);
  }
  async function loadGame(slot = 'slot1') {
    state.slot = slot; let raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (!raw && window.NeonBlockCloud?.load) { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); }
    if (!raw) return popup('No save found');
    const data = JSON.parse(raw); Object.assign(state, { cash: data.cash ?? 250, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, owned: data.owned ?? {} });
    player.position.set(data.pos?.x ?? 0, data.pos?.y ?? 0, data.pos?.z ?? 0); popup(`Loaded ${slot}`);
  }
  function updateHud(fps) {
    hud('hud-cash').textContent = `$${Math.floor(state.cash)}`; hud('hud-xp').textContent = state.xp; hud('hud-level').textContent = state.level;
    hud('hud-wanted').textContent = state.wanted; hud('hud-online').textContent = state.online;
    hud('hud-vehicle').textContent = state.vehicle ? state.vehicle.userData.name : 'On foot';
    hud('hud-vehicle-hp').textContent = state.vehicle ? Math.round(state.vehicle.userData.hp) : '100';
    hud('hud-vehicle-gas').textContent = state.vehicle ? Math.round(state.vehicle.userData.gas) : '100';
    hud('hud-mission').textContent = state.mission ? state.mission.name : 'None';
    hud('debug-fps').textContent = fps; hud('debug-pos').textContent = `${player.position.x.toFixed(1)},${player.position.y.toFixed(1)},${player.position.z.toFixed(1)}`;
    hud('debug-chunks').textContent = chunks.size; hud('debug-npcs').textContent = npcs.length; hud('debug-active-vehicle').textContent = state.vehicle ? 'yes' : 'none';
    hud('debug-save-slot').textContent = state.slot; hud('debug-online').textContent = state.online; hud('debug-last-error').textContent = state.lastError;
  }
  function drawMinimap() {
    if (!minimap) return; minimap.clearRect(0, 0, 160, 160); minimap.fillStyle = '#050814cc'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff66'; minimap.strokeRect(1, 1, 158, 158); minimap.fillStyle = '#17f3ff'; minimap.fillRect(78, 78, 4, 4);
    minimap.fillStyle = '#5ef38c'; pickups.slice(0, 16).forEach(p => minimap.fillRect(80 + (p.position.x - player.position.x) / 3, 80 + (p.position.z - player.position.z) / 3, 3, 3));
    if (state.mission?.target) { minimap.fillStyle = '#ff3366'; minimap.fillRect(80 + (state.mission.target.x - player.position.x) / 3, 80 + (state.mission.target.z - player.position.z) / 3, 5, 5); }
  }
  function setupUi() {
    addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyU') unstuck(); });
    addEventListener('keyup', e => keys.delete(e.code));
    hud('btn-mobile-interact').onclick = interact; hud('btn-mobile-unstuck').onclick = unstuck; hud('btn-mobile-pause').onclick = togglePause;
    hud('btn-mobile-jump').ontouchstart = () => mobile.jump = true; hud('btn-mobile-jump').ontouchend = () => mobile.jump = false;
    hud('btn-mobile-sprint').ontouchstart = () => mobile.sprint = true; hud('btn-mobile-sprint').ontouchend = () => mobile.sprint = false;
    hud('btn-resume').onclick = togglePause; hud('btn-save').onclick = () => hud('save-panel').classList.toggle('hidden'); hud('btn-load').onclick = () => loadGame(state.slot);
    document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => saveGame(b.dataset.slot));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => loadGame(b.dataset.slot));
    hud('btn-export').onclick = () => hud('export-json').value = JSON.stringify(savePayload());
    hud('btn-import').onclick = () => { const d = JSON.parse(hud('export-json').value); localStorage.setItem(SAVE_PREFIX + state.slot, JSON.stringify(d)); loadGame(state.slot); };
    hud('btn-settings').onclick = () => hud('settings-panel').classList.toggle('hidden'); hud('btn-close-settings').onclick = () => hud('settings-panel').classList.add('hidden'); hud('btn-close-save').onclick = () => hud('save-panel').classList.add('hidden');
    const joy = hud('joystick-container'), stick = hud('joystick-stick');
    const reset = () => { mobile.x = mobile.y = 0; stick.style.transform = 'translate(0,0)'; };
    joy.addEventListener('pointermove', e => { const r = joy.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, m = Math.min(42, Math.hypot(x, y)), a = Math.atan2(y, x); mobile.x = Math.cos(a) * m / 42; mobile.y = Math.sin(a) * m / 42; stick.style.transform = `translate(${mobile.x * 42}px,${mobile.y * 42}px)`; });
    joy.addEventListener('pointerup', reset); joy.addEventListener('pointercancel', reset); joy.addEventListener('pointerleave', reset);
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  }
  function togglePause() { hud('pause-overlay').classList.toggle('hidden'); }
  function unstuck() { player.position.y = 2; state.velY = 0; if (state.vehicle) state.vehicle.position.copy(player.position); popup('Unstuck'); }

  let last = performance.now(), frames = 0, fps = 0, acc = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt; frames++;
    if (acc > 0.5) { fps = Math.round(frames / acc); frames = 0; acc = 0; }
    try { move(dt); streamWorld(); updateNpcs(dt); collectAndMission(); cameraFollow(); drawMinimap(); updateHud(fps); renderer.render(scene, camera); } catch (e) { state.lastError = e.message; }
    if (now - state.lastSave > 15000) { state.lastSave = now; saveGame(state.slot, true); }
    requestAnimationFrame(loop);
  }

  setupUi(); streamWorld(); loadGame('slot1').catch(() => {}); hud('loading-screen')?.remove(); requestAnimationFrame(loop);
})();
