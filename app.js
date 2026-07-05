(() => {
  const canvas = document.getElementById('game-canvas');
  const T = window.THREE;
  if (!T || !canvas) return;

  const scene = new T.Scene();
  scene.background = new T.Color(0x070a18);
  const camera = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 700);
  const renderer = new T.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);

  scene.add(new T.HemisphereLight(0x9fdfff, 0x111122, 1.4));
  const sun = new T.DirectionalLight(0xffffff, 1);
  sun.position.set(70, 120, 40);
  scene.add(sun);

  const mats = {
    road: new T.MeshStandardMaterial({ color: 0x111827 }),
    grass: new T.MeshStandardMaterial({ color: 0x10281b }),
    player: new T.MeshStandardMaterial({ color: 0xfff066, emissive: 0x221f00 }),
    neon: new T.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x06404a }),
    car: new T.MeshStandardMaterial({ color: 0x43ff85, emissive: 0x0a331c }),
    lot: new T.MeshStandardMaterial({ color: 0xffd166, emissive: 0x2e2308 })
  };
  const cube = (w, h, d, m) => new T.Mesh(new T.BoxGeometry(w, h, d), m);
  const world = new T.Group();
  scene.add(world);

  const state = { x: 0, y: 1.4, z: 0, vy: 0, yaw: 0, cash: 250, xp: 0, level: 1, bolts: 0, mission: 0, car: null, gas: 100, slot: 'slot1', paused: false };
  const missions = [
    { name: 'Collect 5 neon bolts', type: 'bolts', goal: 5, reward: 350 },
    { name: 'Buy a city lot', type: 'owned', goal: 1, reward: 500 },
    { name: 'Drive 500 meters', type: 'drive', goal: 500, reward: 700, progress: 0 }
  ];
  const keys = new Set();
  const chunks = new Map();
  const bolts = [];
  const cars = [];
  const lots = [];
  const owned = new Set();

  const player = cube(1.4, 2.2, 1.1, mats.player);
  scene.add(player);

  function rand(a, b, c) {
    const v = Math.sin(a * 9311 + b * 719 + c * 101) * 10000;
    return v - Math.floor(v);
  }
  function key(cx, cz) { return cx + ',' + cz; }
  function spawn(cx, cz) {
    const k = key(cx, cz);
    if (chunks.has(k)) return;
    const g = new T.Group();
    const ox = cx * 96, oz = cz * 96;
    const ground = cube(96, .4, 96, mats.grass); ground.position.set(ox, -.2, oz); g.add(ground);
    const rx = cube(96, .06, 15, mats.road); rx.position.set(ox, .04, oz); g.add(rx);
    const rz = cube(15, .07, 96, mats.road); rz.position.set(ox, .05, oz); g.add(rz);
    for (let i = 0; i < 6; i++) {
      const h = 8 + rand(cx, cz, i) * 30;
      const b = cube(10 + rand(cx, cz, i + 1) * 10, h, 10 + rand(cx, cz, i + 2) * 10, new T.MeshStandardMaterial({ color: new T.Color().setHSL(.55 + rand(cx, cz, i + 3) * .25, .7, .42) }));
      b.position.set(ox - 34 + rand(cx, cz, i + 4) * 68, h / 2, oz - 34 + rand(cx, cz, i + 5) * 68);
      if (Math.abs(b.position.x - ox) > 14 && Math.abs(b.position.z - oz) > 14) g.add(b);
    }
    if (rand(cx, cz, 20) > .5) { const p = cube(2, 2, 2, mats.neon); p.position.set(ox + rand(cx, cz, 21) * 60 - 30, 1.4, oz + rand(cx, cz, 22) * 60 - 30); p.userData.value = 75; bolts.push(p); g.add(p); }
    if (rand(cx, cz, 30) > .65) { const c = cube(4, 1.5, 7, mats.car); c.position.set(ox + 22, .8, oz - 5); cars.push(c); g.add(c); }
    if (rand(cx, cz, 40) > .72) { const l = cube(10, .4, 10, mats.lot); l.position.set(ox + 30, .25, oz + 30); l.userData.id = k; l.userData.price = 700; lots.push(l); g.add(l); }
    world.add(g); chunks.set(k, g);
  }
  function stream() {
    const cx = Math.round(state.x / 96), cz = Math.round(state.z / 96);
    const keep = new Set();
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) { keep.add(key(x, z)); spawn(x, z); }
    for (const [k, g] of chunks) if (!keep.has(k)) { world.remove(g); chunks.delete(k); }
  }
  function near(list, d) {
    let out = null;
    for (const o of list) if (o.parent && player.position.distanceTo(o.position) < d) out = o;
    return out;
  }
  function popup(text) {
    const box = document.getElementById('reward-popup');
    if (!box) return;
    box.textContent = text; box.classList.remove('hidden');
    clearTimeout(popup.timer); popup.timer = setTimeout(() => box.classList.add('hidden'), 1700);
  }
  function completeCheck() {
    const m = missions[state.mission];
    if (!m) return;
    const progress = m.type === 'bolts' ? state.bolts : m.type === 'owned' ? owned.size : m.progress;
    if (progress >= m.goal) { state.cash += m.reward; state.xp += 100; state.mission++; popup('Mission complete: ' + m.name); }
  }
  function interact() {
    if (state.car) { state.car.position.set(state.x + 4, .8, state.z + 4); state.car.visible = true; state.car = null; popup('Vehicle parked'); return; }
    const car = near(cars, 7); if (car) { state.car = car; car.visible = false; popup('Vehicle entered'); return; }
    const lot = near(lots, 8); if (lot) { if (owned.has(lot.userData.id)) return popup('Already owned'); if (state.cash < lot.userData.price) return popup('Need $' + lot.userData.price); state.cash -= lot.userData.price; owned.add(lot.userData.id); completeCheck(); return popup('Lot owned'); }
    popup('Find bolts, cars, or lots');
  }
  function move(dt) {
    if (state.paused) return;
    let x = 0, z = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    x += joy.x; z += joy.y;
    const len = Math.hypot(x, z);
    if (len > .05) {
      x /= len; z /= len;
      const speed = state.car ? 42 : (keys.has('ShiftLeft') ? 34 : 24);
      state.x += x * speed * dt; state.z += z * speed * dt; state.yaw = Math.atan2(x, z);
      if (state.car) { state.gas = Math.max(0, state.gas - speed * dt * .012); if (missions[state.mission]?.type === 'drive') missions[state.mission].progress += speed * dt; completeCheck(); }
    }
    state.vy -= 24 * dt; state.y += state.vy * dt; if (state.y < 1.4) { state.y = 1.4; state.vy = 0; }
    player.position.set(state.x, state.y, state.z); player.rotation.y = state.yaw; player.scale.set(state.car ? 1.8 : 1, state.car ? .8 : 1, state.car ? 2.5 : 1);
    for (const b of bolts) if (b.parent) { b.rotation.y += dt * 2; if (player.position.distanceTo(b.position) < 4) { b.parent.remove(b); state.cash += b.userData.value; state.bolts++; popup('Neon bolt +$75'); completeCheck(); } }
    stream(); camera.position.lerp(new T.Vector3(state.x - Math.sin(state.yaw) * 20, state.y + 13, state.z - Math.cos(state.yaw) * 20), Math.min(1, dt * 7)); camera.lookAt(state.x, state.y + 2, state.z);
  }
  function saveData() { return { ...state, car: null, owned: [...owned] }; }
  function save(slot = state.slot) { state.slot = slot; localStorage.setItem('neonblock:' + slot, JSON.stringify(saveData())); popup('Saved'); }
  function load(slot = state.slot) { const raw = localStorage.getItem('neonblock:' + slot); if (!raw) return popup('No save'); const d = JSON.parse(raw); Object.assign(state, d); state.car = null; owned.clear(); (d.owned || []).forEach(v => owned.add(v)); popup('Loaded'); }
  function updateHud(fps) {
    const m = missions[state.mission];
    if (hud.cash) hud.cash.textContent = '$' + Math.round(state.cash);
    if (hud.xp) hud.xp.textContent = Math.round(state.xp);
    if (hud.level) hud.level.textContent = state.level;
    if (hud.vehicle) hud.vehicle.textContent = state.car ? 'Neon cruiser' : 'On foot';
    if (hud.gas) hud.gas.textContent = Math.round(state.gas);
    if (hud.mission) hud.mission.textContent = m ? m.name : 'All complete';
    if (hud.fps) hud.fps.textContent = fps;
    if (hud.pos) hud.pos.textContent = Math.round(state.x) + ',' + Math.round(state.y) + ',' + Math.round(state.z);
    if (hud.chunks) hud.chunks.textContent = chunks.size;
    if (hud.slot) hud.slot.textContent = state.slot;
  }
  const joy = { x: 0, y: 0 }, base = document.getElementById('joystick-container'), stick = document.getElementById('joystick-stick');
  function joyMove(e) { const r = base.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, max = 42, len = Math.min(max, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); joy.x = Math.cos(a) * len / max; joy.y = Math.sin(a) * len / max; if (stick) stick.style.transform = 'translate(' + Math.cos(a) * len + 'px,' + Math.sin(a) * len + 'px)'; }
  function joyStop() { joy.x = joy.y = 0; if (stick) stick.style.transform = 'translate(0,0)'; }
  base?.addEventListener('pointerdown', e => { base.setPointerCapture(e.pointerId); joyMove(e); }); base?.addEventListener('pointermove', joyMove); base?.addEventListener('pointerup', joyStop); base?.addEventListener('pointercancel', joyStop);
  addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'Space' && state.y <= 1.45 && !state.car) state.vy = 9; if (e.code === 'KeyE') interact(); if (e.code === 'KeyP' || e.code === 'Escape') togglePause(); if (e.code === 'KeyR') { state.x = 0; state.z = 0; popup('Unstuck'); } });
  addEventListener('keyup', e => keys.delete(e.code)); addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  function togglePause() { state.paused = !state.paused; document.getElementById('pause-overlay')?.classList.toggle('hidden', !state.paused); }
  document.getElementById('btn-mobile-jump')?.addEventListener('click', () => { if (state.y <= 1.45 && !state.car) state.vy = 9; });
  document.getElementById('btn-mobile-interact')?.addEventListener('click', interact);
  document.getElementById('btn-mobile-unstuck')?.addEventListener('click', () => { state.x = 0; state.z = 0; popup('Unstuck'); });
  document.getElementById('btn-mobile-pause')?.addEventListener('click', togglePause);
  document.getElementById('btn-resume')?.addEventListener('click', togglePause);
  document.getElementById('btn-save')?.addEventListener('click', () => save());
  document.getElementById('btn-load')?.addEventListener('click', () => load());
  document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => save(b.dataset.slot)));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => load(b.dataset.slot)));
  document.getElementById('btn-export')?.addEventListener('click', () => document.getElementById('export-json').value = JSON.stringify(saveData(), null, 2));
  document.getElementById('btn-import')?.addEventListener('click', () => { try { Object.assign(state, JSON.parse(document.getElementById('export-json').value')); popup('Imported'); } catch { popup('Import failed'); } });
  stream(); loading?.classList.add('hidden'); popup('Welcome to NeonBlock City');
  let frames = 0, acc = 0, fps = 0;
  function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), .05); move(dt); renderer.render(scene, camera); frames++; acc += dt; if (acc > .5) { fps = Math.round(frames / acc); frames = 0; acc = 0; updateHud(fps); } }
  loop();
})();
