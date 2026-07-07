(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: document.getElementById('hud-cash'), xp: document.getElementById('hud-xp'), level: document.getElementById('hud-level'), wanted: document.getElementById('hud-wanted'),
    online: document.getElementById('hud-online'), vehicle: document.getElementById('hud-vehicle'), hp: document.getElementById('hud-vehicle-hp'), gas: document.getElementById('hud-vehicle-gas'), mission: document.getElementById('hud-mission'),
    fps: document.getElementById('debug-fps'), pos: document.getElementById('debug-pos'), chunks: document.getElementById('debug-chunks'), npcs: document.getElementById('debug-npcs'), activeVehicle: document.getElementById('debug-active-vehicle'), slot: document.getElementById('debug-save-slot'), debugOnline: document.getElementById('debug-online'), lastError: document.getElementById('debug-last-error')
  };
  const popup = document.getElementById('reward-popup');
  const mini = document.getElementById('minimap-canvas');
  const miniCtx = mini && mini.getContext('2d');

  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, slot: 'slot1', inVehicle: null, mission: null, delivered: 0, ownedLots: [],
    player: { x: 0, y: 1.1, z: 0, vx: 0, vz: 0, vy: 0, heading: 0, onGround: true },
    settings: { graphics: 'auto' }, paused: false, lastSave: 0, cloud: false, error: 'none'
  };

  const keys = new Set();
  const chunks = new Map();
  const vehicles = [];
  const crates = [];
  const npcs = [];
  const lots = [];
  const interactables = [];
  const CHUNK = 42;
  const STREAM_RADIUS = 2;
  const tmp = new THREE.Vector3();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060816);
  scene.fog = new THREE.Fog(0x060816, 58, 210);

  const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 700);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);

  const hemi = new THREE.HemisphereLight(0x66eaff, 0x050414, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, 45, 20);
  scene.add(sun);

  const playerMat = new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.42, metalness: 0.15 });
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.35, 0.55), playerMat);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.62), new THREE.MeshStandardMaterial({ color: 0xffd166 }));
  head.position.y = 2.0;
  player.add(body, head);
  scene.add(player);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x10162d, roughness: 0.9 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x171b27, roughness: 0.85 });
  const ownedMat = new THREE.MeshStandardMaterial({ color: 0x18ff9933, transparent: true, opacity: 0.35 });

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  }

  function seeded(cx, cz, n = 0) {
    let x = Math.sin(cx * 127.1 + cz * 311.7 + n * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function createChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData = { cx, cz };
    const ox = cx * CHUNK, oz = cz * CHUNK;
    group.add(box(CHUNK, 0.18, CHUNK, groundMat, ox, -0.09, oz));
    group.add(box(CHUNK, 0.04, 5.2, roadMat, ox, 0.03, oz));
    group.add(box(5.2, 0.04, CHUNK, roadMat, ox, 0.04, oz));

    for (let i = 0; i < 7; i++) {
      const rx = ox - 17 + seeded(cx, cz, i) * 34;
      const rz = oz - 17 + seeded(cx, cz, i + 20) * 34;
      if (Math.abs(rx - ox) < 5 || Math.abs(rz - oz) < 5) continue;
      const h = 4 + Math.floor(seeded(cx, cz, i + 40) * 18);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.56 + seeded(cx, cz, i + 70) * 0.18, 0.7, 0.28), roughness: 0.45, metalness: 0.05 });
      const b = box(4 + seeded(cx, cz, i + 2) * 4, h, 4 + seeded(cx, cz, i + 3) * 4, mat, rx, h / 2, rz);
      group.add(b);
    }

    if (seeded(cx, cz, 88) > 0.45) addCrate(ox + 11 - seeded(cx, cz, 90) * 22, oz + 11 - seeded(cx, cz, 91) * 22, group);
    if (seeded(cx, cz, 99) > 0.55) addLot(ox + 13, oz - 13, group);
    scene.add(group);
    chunks.set(chunkKey(cx, cz), group);
  }

  function streamWorld() {
    const pcx = Math.round(state.player.x / CHUNK);
    const pcz = Math.round(state.player.z / CHUNK);
    for (let x = pcx - STREAM_RADIUS; x <= pcx + STREAM_RADIUS; x++) for (let z = pcz - STREAM_RADIUS; z <= pcz + STREAM_RADIUS; z++) if (!chunks.has(chunkKey(x, z))) createChunk(x, z);
    for (const [key, group] of chunks) {
      const { cx, cz } = group.userData;
      if (Math.abs(cx - pcx) > STREAM_RADIUS + 1 || Math.abs(cz - pcz) > STREAM_RADIUS + 1) {
        scene.remove(group); chunks.delete(key);
      }
    }
  }

  function addCrate(x, z, parent = scene) {
    const c = box(1.3, 1.3, 1.3, new THREE.MeshStandardMaterial({ color: 0xffc857, emissive: 0x332100 }), x, 0.7, z);
    c.userData = { type: 'crate', taken: false };
    crates.push(c); interactables.push(c); parent.add(c);
  }

  function addLot(x, z, parent = scene) {
    const l = box(7, 0.08, 7, ownedMat, x, 0.07, z);
    l.userData = { type: 'lot', id: `lot-${Math.round(x)}-${Math.round(z)}`, price: 400 };
    lots.push(l); interactables.push(l); parent.add(l);
  }

  function makeVehicle(name, x, z, color, speed) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
    g.add(box(2.4, 0.75, 4.2, mat, 0, 0.7, 0));
    g.add(box(1.55, 0.65, 1.7, new THREE.MeshStandardMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.45 }), 0, 1.25, -0.3));
    g.position.set(x, 0, z); g.userData = { type: 'vehicle', name, speed, hp: 100, gas: 100, vx: 0, vz: 0, heading: 0 };
    vehicles.push(g); interactables.push(g); scene.add(g); return g;
  }

  function makeNpc(x, z) {
    const n = box(0.7, 1.6, 0.7, new THREE.MeshStandardMaterial({ color: 0xb967ff }), x, 0.8, z);
    n.userData = { type: 'npc', t: Math.random() * 9, homeX: x, homeZ: z };
    npcs.push(n); interactables.push(n); scene.add(n);
  }

  makeVehicle('Neon Kart', 8, 11, 0xff3366, 19);
  makeVehicle('Block Runner', -16, 8, 0x5ef38c, 24);
  makeVehicle('Taxi Byte', 26, -12, 0xffd166, 21);
  for (let i = 0; i < 12; i++) makeNpc(Math.cos(i) * (16 + i), Math.sin(i * 1.7) * (14 + i));
  addCrate(5, -8); addCrate(-13, -10); addLot(-10, 15);

  const missions = [
    { id: 'delivery', name: 'Neon Delivery', text: 'Grab 3 crates around the city.', target: 3, reward: 375, xp: 80 },
    { id: 'driver', name: 'Test Drive', text: 'Enter a vehicle and drive 250 studs.', target: 250, reward: 300, xp: 70 },
    { id: 'owner', name: 'First Lot', text: 'Buy one glowing property lot.', target: 1, reward: 250, xp: 65 }
  ];
  state.mission = missions[0];
  state.missionProgress = 0;

  function savePayload() {
    return { v: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player, ownedLots: state.ownedLots, mission: state.mission?.id, missionProgress: state.missionProgress, delivered: state.delivered, settings: state.settings };
  }
  function applySave(data) {
    if (!data || typeof data !== 'object') return toast('Invalid save file');
    Object.assign(state, { cash: +data.cash || 0, xp: +data.xp || 0, level: +data.level || 1, wanted: +data.wanted || 0, delivered: +data.delivered || 0, ownedLots: Array.isArray(data.ownedLots) ? data.ownedLots : [], missionProgress: +data.missionProgress || 0 });
    Object.assign(state.player, data.player || {});
    state.settings = Object.assign(state.settings, data.settings || {});
    state.mission = missions.find(m => m.id === data.mission) || missions[0];
    updateHud(); toast('Loaded save');
  }
  async function save(slot = state.slot) {
    state.slot = slot; localStorage.setItem(`neonblock:${slot}`, JSON.stringify(savePayload())); state.lastSave = performance.now();
    if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(slot, savePayload()); state.cloud = true; } catch (e) { setError(e); } }
    toast(`Saved ${slot}`);
  }
  async function load(slot = state.slot) {
    state.slot = slot;
    let raw = localStorage.getItem(`neonblock:${slot}`);
    if (!raw && window.NeonBlockCloud?.load) { try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) return applySave(cloud); } catch (e) { setError(e); } }
    if (raw) applySave(JSON.parse(raw)); else toast('No local save yet');
  }
  window.NeonBlockGame = { save, load, exportSave: () => JSON.stringify(savePayload(), null, 2), importSave: txt => applySave(JSON.parse(txt)) };

  function setError(e) { state.error = e?.message || String(e || 'unknown'); console.warn(e); }
  function toast(text) { popup.textContent = text; popup.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => popup.classList.add('hidden'), 1600); }
  function addXp(xp) { state.xp += xp; while (state.xp >= state.level * 120) { state.xp -= state.level * 120; state.level++; toast(`Level ${state.level}!`); } }
  function completeMission() {
    const m = state.mission; if (!m) return;
    state.cash += m.reward; addXp(m.xp); toast(`${m.name} complete +$${m.reward}`);
    const idx = missions.indexOf(m); state.mission = missions[(idx + 1) % missions.length]; state.missionProgress = 0;
  }

  function interact() {
    let best = null, bd = 4.0;
    const px = state.player.x, pz = state.player.z;
    for (const it of interactables) {
      const dx = it.position.x - px, dz = it.position.z - pz, d = Math.hypot(dx, dz);
      if (d < bd) { best = it; bd = d; }
    }
    if (!best) return toast('Move closer');
    const u = best.userData;
    if (u.type === 'vehicle') {
      if (state.inVehicle === best) { state.inVehicle = null; player.visible = true; toast('Exited vehicle'); }
      else { state.inVehicle = best; player.visible = false; toast(`Entered ${u.name}`); }
    } else if (u.type === 'crate' && !u.taken) {
      u.taken = true; best.visible = false; state.cash += 45; state.delivered++; addXp(12); toast('Crate collected +$45');
      if (state.mission?.id === 'delivery') { state.missionProgress++; if (state.missionProgress >= state.mission.target) completeMission(); }
    } else if (u.type === 'lot') {
      if (state.ownedLots.includes(u.id)) return toast('Already owned');
      if (state.cash < u.price) return toast(`Need $${u.price}`);
      state.cash -= u.price; state.ownedLots.push(u.id); best.material.opacity = 0.72; toast('Lot purchased');
      if (state.mission?.id === 'owner') { state.missionProgress = 1; completeMission(); }
    } else if (u.type === 'npc') toast('Citizen: collect crates, buy lots, test vehicles.');
  }

  function inputVector() {
    let x = 0, z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    x += joystick.x; z += joystick.y;
    const len = Math.hypot(x, z) || 1; return { x: x / len, z: z / len, active: Math.hypot(x, z) > 0.05 };
  }

  const joystick = { active: false, id: null, x: 0, y: 0 };
  const joy = document.getElementById('joystick-container');
  const stick = document.getElementById('joystick-stick');
  if (joy) {
    joy.addEventListener('pointerdown', e => { joystick.active = true; joystick.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
    joy.addEventListener('pointermove', e => { if (joystick.active && e.pointerId === joystick.id) moveJoy(e); });
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  }
  function moveJoy(e) { const r = joy.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.min(48, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); joystick.x = Math.cos(a) * d / 48; joystick.y = Math.sin(a) * d / 48; stick.style.transform = `translate(${joystick.x * 48}px,${joystick.y * 48}px)`; }
  function endJoy() { joystick.active = false; joystick.x = 0; joystick.y = 0; stick.style.transform = 'translate(0,0)'; }

  addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyU') unstuck(); if (e.code === 'Space') jump(); });
  addEventListener('keyup', e => keys.delete(e.code));
  document.getElementById('btn-mobile-interact')?.addEventListener('click', interact);
  document.getElementById('btn-mobile-unstuck')?.addEventListener('click', unstuck);
  document.getElementById('btn-mobile-pause')?.addEventListener('click', togglePause);
  document.getElementById('btn-mobile-jump')?.addEventListener('click', jump);
  document.getElementById('btn-mobile-sprint')?.addEventListener('pointerdown', () => keys.add('ShiftLeft'));
  document.getElementById('btn-mobile-sprint')?.addEventListener('pointerup', () => keys.delete('ShiftLeft'));

  function jump() { if (!state.inVehicle && state.player.onGround) { state.player.vy = 8; state.player.onGround = false; } }
  function unstuck() { state.player.x = 0; state.player.z = 0; state.player.vy = 0; if (state.inVehicle) state.inVehicle.position.set(3, 0, 3); toast('Unstuck'); }
  function togglePause() { state.paused = !state.paused; document.getElementById('pause-overlay')?.classList.toggle('hidden', !state.paused); }
  document.getElementById('btn-resume')?.addEventListener('click', togglePause);
  document.getElementById('btn-save')?.addEventListener('click', () => document.getElementById('save-panel')?.classList.toggle('hidden'));
  document.getElementById('btn-load')?.addEventListener('click', () => load(state.slot));
  document.getElementById('btn-settings')?.addEventListener('click', () => document.getElementById('settings-panel')?.classList.toggle('hidden'));
  document.getElementById('btn-close-settings')?.addEventListener('click', () => document.getElementById('settings-panel')?.classList.add('hidden'));
  document.getElementById('btn-close-save')?.addEventListener('click', () => document.getElementById('save-panel')?.classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => save(b.dataset.slot)));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => load(b.dataset.slot)));
  document.getElementById('btn-export')?.addEventListener('click', () => document.getElementById('export-json').value = JSON.stringify(savePayload(), null, 2));
  document.getElementById('btn-import')?.addEventListener('click', () => { try { applySave(JSON.parse(document.getElementById('export-json').value)); } catch (e) { setError(e); toast('Bad JSON'); } });
  document.getElementById('graphics-quality')?.addEventListener('change', e => { state.settings.graphics = e.target.value; renderer.setPixelRatio(e.target.value === 'low' ? 1 : Math.min(devicePixelRatio || 1, e.target.value === 'high' ? 2 : 1.5)); });

  function update(dt) {
    if (state.paused) return;
    const iv = inputVector();
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (state.inVehicle) {
      const v = state.inVehicle.userData;
      const speed = v.speed * (sprint ? 1.3 : 1);
      if (iv.active && v.gas > 0) { v.vx += iv.x * speed * dt; v.vz += iv.z * speed * dt; v.heading = Math.atan2(v.vx, v.vz); v.gas = Math.max(0, v.gas - dt * 1.8); }
      v.vx *= 0.94; v.vz *= 0.94;
      state.inVehicle.position.x += v.vx * dt; state.inVehicle.position.z += v.vz * dt; state.inVehicle.rotation.y = v.heading;
      state.player.x = state.inVehicle.position.x; state.player.z = state.inVehicle.position.z;
      if (state.mission?.id === 'driver') { state.missionProgress += Math.hypot(v.vx * dt, v.vz * dt); if (state.missionProgress >= state.mission.target) completeMission(); }
    } else {
      const speed = sprint ? 14 : 9;
      state.player.vx = iv.x * speed; state.player.vz = iv.z * speed;
      state.player.x += state.player.vx * dt; state.player.z += state.player.vz * dt;
      state.player.vy -= 22 * dt; state.player.y += state.player.vy * dt;
      if (state.player.y <= 1.1) { state.player.y = 1.1; state.player.vy = 0; state.player.onGround = true; }
      if (iv.active) state.player.heading = Math.atan2(iv.x, iv.z);
      player.visible = true; player.position.set(state.player.x, state.player.y - 1.1, state.player.z); player.rotation.y = state.player.heading;
    }
    for (const n of npcs) { const u = n.userData; u.t += dt; n.position.x = u.homeX + Math.sin(u.t) * 2.5; n.position.z = u.homeZ + Math.cos(u.t * 0.7) * 2.5; }
    streamWorld(); updateCamera(dt); updateHud(); drawMini();
    if (performance.now() - state.lastSave > 30000) save(state.slot);
  }

  function updateCamera() {
    const target = state.inVehicle ? state.inVehicle.position : player.position;
    camera.position.lerp(tmp.set(target.x - Math.sin(state.player.heading) * 12, 9, target.z - Math.cos(state.player.heading) * 12), 0.09);
    camera.lookAt(target.x, 1.4, target.z);
  }
  function updateHud() {
    hud.cash.textContent = `$${Math.floor(state.cash)}`; hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.online.textContent = state.cloud ? 'cloud optional' : 'local'; hud.debugOnline.textContent = state.cloud ? 'cloud' : 'localStorage'; hud.lastError.textContent = state.error;
    const v = state.inVehicle?.userData; hud.vehicle.textContent = v?.name || 'On foot'; hud.hp.textContent = Math.floor(v?.hp ?? 100); hud.gas.textContent = Math.floor(v?.gas ?? 100);
    hud.mission.textContent = state.mission ? `${state.mission.name}: ${Math.floor(state.missionProgress)}/${state.mission.target}` : 'None';
    hud.pos.textContent = `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.length; hud.activeVehicle.textContent = v?.name || 'None'; hud.slot.textContent = state.slot;
  }
  function drawMini() {
    if (!miniCtx) return; miniCtx.clearRect(0, 0, 160, 160); miniCtx.fillStyle = '#071023'; miniCtx.fillRect(0, 0, 160, 160); miniCtx.strokeStyle = '#17f3ff55'; miniCtx.strokeRect(2, 2, 156, 156);
    const sx = x => 80 + (x - state.player.x) * 1.2, sz = z => 80 + (z - state.player.z) * 1.2;
    miniCtx.fillStyle = '#ffcf5a'; crates.filter(c => c.visible).forEach(c => miniCtx.fillRect(sx(c.position.x), sz(c.position.z), 3, 3));
    miniCtx.fillStyle = '#5ef38c'; vehicles.forEach(v => miniCtx.fillRect(sx(v.position.x), sz(v.position.z), 4, 4));
    miniCtx.fillStyle = '#17f3ff'; miniCtx.beginPath(); miniCtx.arc(80, 80, 4, 0, Math.PI * 2); miniCtx.fill();
  }

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  let last = performance.now(), frames = 0, fpsT = last;
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); renderer.render(scene, camera); frames++; if (now - fpsT > 500) { hud.fps.textContent = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; } requestAnimationFrame(loop); }

  streamWorld(); load('slot1').catch(setError); updateHud(); loading?.classList.add('hidden'); requestAnimationFrame(loop);
})();
