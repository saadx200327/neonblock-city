(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  if (!window.THREE) { set('debug-last-error', 'Three.js failed to load'); return; }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 90, 360);
  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 800);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  scene.add(new THREE.HemisphereLight(0x66eeff, 0x151022, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(60, 120, 30);
  scene.add(keyLight);

  const mat = {
    ground: new THREE.MeshStandardMaterial({ color: 0x0b2b2c, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0x11172a, roughness: 0.9 }),
    player: new THREE.MeshStandardMaterial({ color: 0x25e7ff, emissive: 0x062b36 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x2eff91, emissive: 0x06351c }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3d6d, emissive: 0x28030a }),
    lot: new THREE.MeshStandardMaterial({ color: 0xff4bd2, emissive: 0x2b0522 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x80ff6a, emissive: 0x0d2a08 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc4d, emissive: 0x211100 })
  };

  const state = {
    money: 120, xp: 0, level: 1, heat: 0, slot: 'slot1', pos: new THREE.Vector3(0, 1, 0),
    velY: 0, yaw: 0, grounded: true, keys: {}, joy: { x: 0, y: 0, on: false },
    chunks: new Map(), crates: [], cars: [], lots: [], npcs: [], car: null, mission: null, lastSave: 0, draw: 2
  };
  const missions = [
    { id: 'courier', name: 'Neon Courier', type: 'crate', goal: 5, pay: 300, xp: 110, text: 'Collect 5 glowing crates.' },
    { id: 'driver', name: 'City Driver', type: 'drive', goal: 4, pay: 450, xp: 150, text: 'Drive long enough to fill 4 route ticks.' },
    { id: 'owner', name: 'First Lot', type: 'lot', goal: 1, pay: 200, xp: 90, text: 'Buy one neon lot.' }
  ];

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.7, 0.75), mat.player); body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mat.player); head.position.y = 2.25;
  player.add(body, head); scene.add(player);

  const cube = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); scene.add(o); return o; };
  const rng = (n) => { const x = Math.sin(n * 734.123) * 10000; return x - Math.floor(x); };
  const toast = (msg) => { const el = $('reward-popup'); if (!el) return; el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2200); };

  function addCar(x, z, chunk) {
    const g = new THREE.Group(); g.position.set(x, 0.55, z); g.userData = { chunk, fuel: 100, hp: 100 };
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3, 1, 5), mat.car));
    scene.add(g); state.cars.push(g);
  }
  function addCrate(x, z, chunk) { const o = cube(1.2, 1.2, 1.2, mat.crate, x, 0.8, z); o.userData = { chunk }; state.crates.push(o); }
  function addLot(x, z, chunk) { const o = cube(9, 0.15, 9, mat.lot, x, 0.1, z); o.userData = { chunk, price: 250, owned: false }; state.lots.push(o); }
  function addNpc(x, z, chunk) { const o = cube(1, 1.7, 1, mat.npc, x, 0.9, z); o.userData = { chunk }; state.npcs.push(o); }

  function loadChunk(cx, cz) {
    const key = cx + ',' + cz; if (state.chunks.has(key)) return;
    const group = new THREE.Group(); scene.add(group); state.chunks.set(key, group);
    const ox = cx * 50, oz = cz * 50;
    for (let i = -1; i <= 1; i++) { group.add(cube(8, 0.05, 50, mat.road, ox + i * 18, 0.03, oz)); group.add(cube(50, 0.05, 8, mat.road, ox, 0.04, oz + i * 18)); }
    for (let i = 0; i < 4; i++) {
      const a = rng(cx * 11 + cz * 17 + i), b = rng(cx * 19 - cz * 7 + i), h = 5 + Math.floor(12 * rng(i + cx));
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + a * 0.18, 0.7, 0.2 + b * 0.15), emissive: new THREE.Color().setHSL(0.55 + a * 0.18, 0.8, 0.05) });
      group.add(cube(7 + a * 8, h, 7 + b * 8, m, ox - 18 + a * 36, h / 2, oz - 18 + b * 36));
    }
    const r = rng(cx * 31 + cz * 23);
    if (Math.abs(cx) + Math.abs(cz) < 8) { if (r < .32) addCrate(ox + r * 34 - 17, oz + 13 - r * 18, key); if (r > .54) addCar(ox - 14 + r * 28, oz + 16 - r * 20, key); if (r > .72) addLot(ox + 10 - r * 18, oz - 16 + r * 16, key); if (r > .18 && r < .5) addNpc(ox + 12 - r * 20, oz - 10 + r * 25, key); }
  }
  function stream() {
    const cx = Math.round(state.pos.x / 50), cz = Math.round(state.pos.z / 50);
    for (let x = cx - state.draw; x <= cx + state.draw; x++) for (let z = cz - state.draw; z <= cz + state.draw; z++) loadChunk(x, z);
    for (const [key, group] of state.chunks) { const [x, z] = key.split(',').map(Number); if (Math.abs(x - cx) > state.draw || Math.abs(z - cz) > state.draw) { scene.remove(group); state.chunks.delete(key); for (const list of [state.crates, state.cars, state.lots, state.npcs]) for (let i = list.length - 1; i >= 0; i--) if (list[i].userData.chunk === key) { scene.remove(list[i]); list.splice(i, 1); } } }
  }
  const near = (list, d) => list.reduce((best, o) => { const gap = o.position.distanceTo(state.pos); return gap < best.d ? { o, d: gap } : best; }, { o: null, d }).o;
  function progress(type) { if (!state.mission || state.mission.type !== type) return; state.mission.progress++; if (state.mission.progress >= state.mission.goal) { state.money += state.mission.pay; state.xp += state.mission.xp; while (state.xp >= state.level * 200) { state.xp -= state.level * 200; state.level++; } toast('Mission complete +$' + state.mission.pay); state.mission = null; save(); } }
  function interact() {
    const crate = near(state.crates, 3); if (crate) { scene.remove(crate); state.crates.splice(state.crates.indexOf(crate), 1); state.money += 25; state.xp += 12; progress('crate'); toast('Crate +$25'); return; }
    if (state.car) { state.car = null; toast('Exited car'); return; }
    const car = near(state.cars, 5); if (car) { state.car = car; toast('Entered car'); return; }
    const lot = near(state.lots, 5); if (lot && !lot.userData.owned) { if (state.money >= lot.userData.price) { state.money -= lot.userData.price; lot.userData.owned = true; lot.material = mat.owned; progress('lot'); toast('Lot owned'); save(); } else toast('Need $' + lot.userData.price); return; }
    if (near(state.npcs, 4)) toast('Tip: E/Interact collects, drives, buys. M opens missions.');
  }
  function save(slot = state.slot) { const data = { v: 3, money: state.money, xp: state.xp, level: state.level, heat: state.heat, pos: state.pos.toArray(), mission: state.mission, ts: Date.now() }; localStorage.setItem('neonblock:' + slot, JSON.stringify(data)); state.lastSave = performance.now(); if (window.NeonBlockCloudSave) window.NeonBlockCloudSave.save(slot, data).catch(e => set('debug-last-error', e.message)); return data; }
  function load(slot = state.slot) { try { const raw = localStorage.getItem('neonblock:' + slot); if (!raw) return; const d = JSON.parse(raw); state.money = d.money ?? d.cash ?? 120; state.xp = d.xp || 0; state.level = d.level || 1; state.heat = d.heat ?? d.wanted ?? 0; state.pos.fromArray(d.pos || [0, 1, 0]); state.mission = d.mission || null; } catch (e) { set('debug-last-error', e.message); } }

  function buildMenu() {
    const list = $('mission-list'); if (list) { list.innerHTML = ''; missions.forEach(m => { const li = document.createElement('li'), b = document.createElement('button'); b.textContent = m.name + ' — ' + m.text; b.onclick = () => { state.mission = { ...m, progress: 0 }; $('pause-overlay').classList.add('hidden'); toast('Mission: ' + m.name); }; li.appendChild(b); list.appendChild(li); }); }
    $('btn-resume').onclick = () => $('pause-overlay').classList.add('hidden'); $('btn-settings').onclick = () => $('settings-panel').classList.toggle('hidden'); $('btn-close-settings').onclick = () => $('settings-panel').classList.add('hidden'); $('btn-save').onclick = () => $('save-panel').classList.toggle('hidden'); $('btn-load').onclick = () => load(); $('btn-close-save').onclick = () => $('save-panel').classList.add('hidden'); $('btn-export').onclick = () => $('export-json').value = JSON.stringify(save(), null, 2); $('btn-import').onclick = () => { try { localStorage.setItem('neonblock:' + state.slot, $('export-json').value); load(); } catch (e) { set('debug-last-error', e.message); } };
    $('graphics-quality').onchange = e => { state.draw = e.target.value === 'low' ? 1 : e.target.value === 'high' ? 3 : 2; };
    $('btn-mobile-interact').onclick = interact; $('btn-mobile-pause').onclick = () => $('pause-overlay').classList.toggle('hidden'); $('btn-mobile-unstuck').onclick = () => state.pos.set(0, 1, 0); $('btn-mobile-jump').onclick = jump;
  }
  function jump() { if (state.grounded) { state.velY = 9; state.grounded = false; } }
  addEventListener('keydown', e => { state.keys[e.key.toLowerCase()] = true; if (e.key === ' ' ) jump(); if (e.key.toLowerCase() === 'e') interact(); if (e.key.toLowerCase() === 'p' || e.key === 'Escape') $('pause-overlay').classList.toggle('hidden'); if (e.key.toLowerCase() === 'm') { $('pause-overlay').classList.remove('hidden'); $('mission-board').classList.toggle('hidden'); } });
  addEventListener('keyup', e => state.keys[e.key.toLowerCase()] = false);
  const joy = $('joystick-container'), stick = $('joystick-stick');
  function joyMove(e) { if (!state.joy.on) return; const t = e.touches ? e.touches[0] : e, r = joy.getBoundingClientRect(); let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } state.joy.x = x; state.joy.y = y; stick.style.transform = `translate(${x * 34}px,${y * 34}px)`; e.preventDefault(); }
  joy.addEventListener('pointerdown', e => { state.joy.on = true; joyMove(e); }); addEventListener('pointermove', joyMove); addEventListener('pointerup', () => { state.joy.on = false; state.joy.x = state.joy.y = 0; stick.style.transform = 'translate(0,0)'; }); joy.addEventListener('touchstart', e => { state.joy.on = true; joyMove(e); }, { passive: false }); joy.addEventListener('touchmove', joyMove, { passive: false }); joy.addEventListener('touchend', () => { state.joy.on = false; state.joy.x = state.joy.y = 0; stick.style.transform = 'translate(0,0)'; });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  function update(dt) {
    const forward = (state.keys.w || state.keys.arrowup ? 1 : 0) - (state.keys.s || state.keys.arrowdown ? 1 : 0) - state.joy.y;
    const side = (state.keys.d || state.keys.arrowright ? 1 : 0) - (state.keys.a || state.keys.arrowleft ? 1 : 0) + state.joy.x;
    const fast = state.keys.shift || $('btn-mobile-sprint').matches(':active');
    if (state.car) { state.car.rotation.y -= side * dt * 2.4; const dir = new THREE.Vector3(Math.sin(state.car.rotation.y), 0, Math.cos(state.car.rotation.y)); state.car.position.addScaledVector(dir, forward * dt * (fast ? 34 : 22)); state.pos.copy(state.car.position).add(new THREE.Vector3(0, 1.1, 0)); state.car.userData.fuel = Math.max(0, state.car.userData.fuel - Math.abs(forward) * dt * 2); if (Math.abs(forward) > .15 && Math.random() < dt * .08) progress('drive'); }
    else { const move = new THREE.Vector3(side, 0, forward); if (move.lengthSq() > 1) move.normalize(); state.pos.x += move.x * dt * (fast ? 12 : 8); state.pos.z += move.z * dt * (fast ? 12 : 8); if (move.lengthSq() > .01) state.yaw = Math.atan2(move.x, move.z); state.velY -= 24 * dt; state.pos.y += state.velY * dt; if (state.pos.y < 1) { state.pos.y = 1; state.velY = 0; state.grounded = true; } player.position.copy(state.pos); player.rotation.y = state.yaw; }
    camera.position.lerp(state.pos.clone().add(new THREE.Vector3(Math.sin(state.yaw) * -10, 7, Math.cos(state.yaw) * -10)), 0.12); camera.lookAt(state.pos.x, state.pos.y + 1.2, state.pos.z); stream();
  }
  function mini() { const c = $('minimap-canvas'), ctx = c.getContext('2d'); ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#061021'; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = '#17f3ff55'; for (let i = 0; i < 160; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 160); ctx.moveTo(0, i); ctx.lineTo(160, i); ctx.stroke(); } ctx.fillStyle = '#25e7ff'; ctx.fillRect(77, 77, 6, 6); ctx.fillStyle = '#29ff90'; state.crates.slice(0, 24).forEach(o => ctx.fillRect(80 + (o.position.x - state.pos.x) / 2, 80 + (o.position.z - state.pos.z) / 2, 3, 3)); }
  let last = performance.now(), frames = 0, fpt = 0;
  function loop(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; if ($('pause-overlay').classList.contains('hidden')) update(dt); renderer.render(scene, camera); mini(); frames++; fpt += dt; if (fpt > .5) { set('debug-fps', Math.round(frames / fpt)); frames = 0; fpt = 0; } set('hud-cash', '$' + state.money); set('hud-xp', state.xp); set('hud-level', state.level); set('hud-wanted', state.heat); set('hud-online', window.NeonBlockCloudSave ? 'cloud optional' : 'offline'); set('debug-online', window.NeonBlockCloudSave ? 'adapter ready' : 'offline'); set('hud-vehicle', state.car ? 'Neon Kart' : 'On foot'); set('hud-vehicle-hp', state.car ? Math.round(state.car.userData.hp) : 100); set('hud-vehicle-gas', state.car ? Math.round(state.car.userData.fuel) : 100); set('hud-mission', state.mission ? `${state.mission.name} ${state.mission.progress}/${state.mission.goal}` : 'None'); set('debug-pos', state.pos.toArray().map(n => n.toFixed(0)).join(',')); set('debug-chunks', state.chunks.size); set('debug-npcs', state.npcs.length); set('debug-active-vehicle', state.car ? 'yes' : 'none'); if (t - state.lastSave > 15000) save(); requestAnimationFrame(loop); }
  buildMenu(); stream(); load(); $('loading-screen').classList.add('hidden'); toast('WASD/Arrows move • E interact • M missions • P pause'); requestAnimationFrame(loop);
})();
