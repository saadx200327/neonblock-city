(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const ctx2d = $('minimap-canvas')?.getContext('2d');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'), fps: $('debug-fps'),
    pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), debugOnline: $('debug-online'), error: $('debug-last-error'), reward: $('reward-popup')
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
  const saveKey = (slot) => `neonblock-city:${slot}`;

  const state = {
    cash: 100, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false,
    player: { x: 0, z: 0, heading: 0 }, keys: {}, joy: { x: 0, y: 0 },
    mission: { id: 'packets', name: 'Neon Courier', progress: 0, target: 3 },
    car: null, cars: [], pickups: [], npcs: [], owned: {}, chunks: new Set(), lastSave: 0
  };

  if (!window.THREE) { hud.error.textContent = 'Three.js did not load'; return; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, 280);
  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 700);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  scene.add(new THREE.HemisphereLight(0x9fdfff, 0x111122, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(40, 90, 30); scene.add(sun);

  const mat = {
    road: new THREE.MeshStandardMaterial({ color: 0x121827 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x06341e }),
    avatar: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x052c33 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: .45 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x9b5cff, emissive: 0x251145 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc66 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x0c2c18 })
  };
  const avatar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), mat.avatar);
  avatar.position.y = 1.1; scene.add(avatar);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(2.6, .13, 8, 28), mat.pickup);
  marker.rotation.x = Math.PI / 2; scene.add(marker);

  function toast(text) { hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => hud.reward.classList.add('hidden'), 1700); }
  function rand(x, z, s = 1) { const n = Math.sin(x * 127.1 + z * 311.7 + s * 19.19) * 43758.5453; return n - Math.floor(n); }
  function box(w, h, d, material, x, y, z, group = scene) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); group.add(m); return m; }
  function spawn(type, x, z) {
    const mesh = type === 'car' ? box(3.2, 1.1, 5, mat.car, x, .75, z) : type === 'npc' ? box(1, 2, 1, mat.npc, x, 1, z) : new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat.pickup);
    if (type === 'pickup') { mesh.position.set(x, 1.2, z); scene.add(mesh); }
    const item = { type, x, z, mesh, gas: 100, hp: 100, taken: false };
    if (type === 'car') state.cars.push(item); else if (type === 'npc') state.npcs.push(item); else state.pickups.push(item);
  }
  function buildChunk(cx, cz) {
    const key = `${cx},${cz}`; if (state.chunks.has(key)) return; state.chunks.add(key);
    const g = new THREE.Group(); scene.add(g); const ox = cx * 48, oz = cz * 48;
    box(48, .08, 48, mat.grass, ox, -.04, oz, g); box(48, .1, 6, mat.road, ox, .02, oz, g); box(6, .1, 48, mat.road, ox, .03, oz, g);
    for (let i = 0; i < 5; i++) {
      const bx = ox + (Math.floor(rand(cx, cz, i) * 4) - 1.5) * 11, bz = oz + (Math.floor(rand(cz, cx, i) * 4) - 1.5) * 11;
      if (Math.abs(bx - ox) < 6 || Math.abs(bz - oz) < 6) continue;
      const h = 5 + Math.floor(rand(cx + i, cz - i) * 22);
      box(7, h, 7, state.owned[key] ? mat.owned : new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(.54 + rand(cx, cz, i) * .18, .7, .38) }), bx, h / 2, bz, g);
    }
    if (rand(cx, cz, 10) > .7) spawn('pickup', ox + 15, oz - 14);
    if (rand(cx, cz, 20) > .83) spawn('car', ox - 15, oz + 14);
    if (rand(cx, cz, 30) > .78) spawn('npc', ox + 18, oz + 18);
  }
  function stream() {
    const cx = Math.round(state.player.x / 48), cz = Math.round(state.player.z / 48);
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) buildChunk(x, z);
  }
  function missionDone() { state.cash += 220; state.xp += 75; state.level = 1 + Math.floor(state.xp / 150); toast('Mission complete +$220'); state.mission = { id: 'property', name: 'Buy A Block', progress: 0, target: 1 }; }
  function interact() {
    if (state.car) { state.car = null; toast('Exited car'); return; }
    const car = state.cars.find(c => near(state.player, c.mesh.position, 5) && c.gas > 0); if (car) { state.car = car; toast('Entered car'); return; }
    const npc = state.npcs.find(n => near(state.player, n.mesh.position, 5)); if (npc) { toast('NPC: collect packets, drive cars, buy blocks.'); return; }
    const key = `${Math.round(state.player.x / 48)},${Math.round(state.player.z / 48)}`;
    if (!state.owned[key] && state.cash >= 250) { state.cash -= 250; state.owned[key] = true; toast('Owned this city block'); if (state.mission.id === 'property') missionDone(); }
    else toast(state.owned[key] ? 'Already owned' : 'Need $250 for ownership');
  }
  function save(slot = state.slot) { const data = { cash: state.cash, xp: state.xp, level: state.level, player: state.player, owned: state.owned, mission: state.mission }; localStorage.setItem(saveKey(slot), JSON.stringify(data)); state.slot = slot; state.lastSave = performance.now(); toast('Saved'); }
  function load(slot = state.slot) { try { const raw = localStorage.getItem(saveKey(slot)); if (!raw) return toast('No save found'); const data = JSON.parse(raw); Object.assign(state, { cash: data.cash || 100, xp: data.xp || 0, level: data.level || 1, owned: data.owned || {}, mission: data.mission || state.mission }); Object.assign(state.player, data.player || {}); toast('Loaded'); } catch (e) { hud.error.textContent = e.message; } }

  addEventListener('keydown', e => { state.keys[e.code] = true; if (e.code === 'Escape') togglePause(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyR') { state.player.x = 0; state.player.z = 0; toast('Unstuck'); } });
  addEventListener('keyup', e => state.keys[e.code] = false);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  function togglePause(force) { state.paused = typeof force === 'boolean' ? force : !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }
  $('btn-resume').onclick = () => togglePause(false); $('btn-save').onclick = () => save(); $('btn-load').onclick = () => load(); $('btn-mobile-pause').onclick = () => togglePause(); $('btn-mobile-interact').onclick = interact; $('btn-mobile-unstuck').onclick = () => { state.player.x = 0; state.player.z = 0; };
  $('btn-mobile-sprint').onpointerdown = () => state.keys.ShiftLeft = true; $('btn-mobile-sprint').onpointerup = () => state.keys.ShiftLeft = false;
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => save(b.dataset.slot)); document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => load(b.dataset.slot));
  $('btn-export').onclick = () => { save(); $('export-json').value = localStorage.getItem(saveKey(state.slot)); };
  $('btn-import').onclick = () => { localStorage.setItem(saveKey(state.slot), $('export-json').value); load(); };
  const joyBox = $('joystick-container'), stick = $('joystick-stick');
  function joy(e, end) { if (end) { state.joy.x = state.joy.y = 0; stick.style.transform = 'translate(0,0)'; return; } const r = joyBox.getBoundingClientRect(), dx = clamp(e.clientX - r.left - r.width / 2, -42, 42), dy = clamp(e.clientY - r.top - r.height / 2, -42, 42); state.joy.x = dx / 42; state.joy.y = dy / 42; stick.style.transform = `translate(${dx}px,${dy}px)`; }
  joyBox.onpointerdown = e => { joyBox.setPointerCapture(e.pointerId); joy(e); }; joyBox.onpointermove = e => joy(e); joyBox.onpointerup = e => joy(e, true); joyBox.onpointercancel = e => joy(e, true);

  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) buildChunk(x, z);
  $('loading-screen').classList.add('hidden'); hud.online.textContent = 'local'; hud.debugOnline.textContent = 'local';
  let last = performance.now(), frames = 0, fpsAt = last;
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; frames++;
    if (!state.paused) {
      let x = (state.keys.KeyD || state.keys.ArrowRight ? 1 : 0) - (state.keys.KeyA || state.keys.ArrowLeft ? 1 : 0);
      let z = (state.keys.KeyS || state.keys.ArrowDown ? 1 : 0) - (state.keys.KeyW || state.keys.ArrowUp ? 1 : 0);
      if (Math.abs(state.joy.x) + Math.abs(state.joy.y) > .05) { x = state.joy.x; z = state.joy.y; }
      const mag = Math.hypot(x, z) || 1, speed = (state.car ? 29 : 13) * (state.keys.ShiftLeft ? 1.45 : 1);
      state.player.x += x / mag * speed * dt; state.player.z += z / mag * speed * dt; if (x || z) state.player.heading = Math.atan2(x, z);
      if (state.car) { state.car.mesh.position.set(state.player.x, .75, state.player.z); state.car.mesh.rotation.y = state.player.heading; state.car.gas = clamp(state.car.gas - dt * 1.5, 0, 100); if (!state.car.gas) state.car = null; }
      avatar.position.set(state.player.x, 1.1, state.player.z); avatar.rotation.y = state.player.heading;
      for (const p of state.pickups) if (!p.taken && near(state.player, p.mesh.position, 3)) { p.taken = true; p.mesh.visible = false; state.cash += 25; state.xp += 15; state.mission.progress++; toast('Pickup +$25'); if (state.mission.id === 'packets' && state.mission.progress >= state.mission.target) missionDone(); }
      stream(); camera.position.lerp(new THREE.Vector3(state.player.x - Math.sin(state.player.heading) * 16, 13, state.player.z - Math.cos(state.player.heading) * 16), .12); camera.lookAt(state.player.x, 2.3, state.player.z);
      if (performance.now() - state.lastSave > 30000) save();
    }
    hud.cash.textContent = `$${state.cash | 0}`; hud.xp.textContent = state.xp | 0; hud.level.textContent = state.level; hud.wanted.textContent = state.wanted; hud.vehicle.textContent = state.car ? 'Neon car' : 'On foot'; hud.hp.textContent = state.car ? state.car.hp | 0 : 100; hud.gas.textContent = state.car ? state.car.gas | 0 : 100; hud.mission.textContent = `${state.mission.name} ${state.mission.progress}/${state.mission.target}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = state.car ? 'Neon car' : 'None'; hud.pos.textContent = `${state.player.x | 0},0,${state.player.z | 0}`; hud.slot.textContent = state.slot;
    if (ctx2d) { ctx2d.clearRect(0, 0, 160, 160); ctx2d.fillStyle = '#050814'; ctx2d.fillRect(0, 0, 160, 160); ctx2d.fillStyle = '#17f3ff'; ctx2d.fillRect(77, 77, 6, 6); ctx2d.fillStyle = '#9b5cff'; state.pickups.filter(p => !p.taken).slice(0, 25).forEach(p => ctx2d.fillRect(80 + (p.mesh.position.x - state.player.x) / 1.4, 80 + (p.mesh.position.z - state.player.z) / 1.4, 3, 3)); }
    if (now - fpsAt > 500) { hud.fps.textContent = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    renderer.render(scene, camera); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
