(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const reward = $('reward-popup');
  const mini = $('minimap-canvas').getContext('2d');

  if (!window.THREE) {
    loading.querySelector('.loading-sub').textContent = 'Three.js failed to load.';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071022);
  scene.fog = new THREE.Fog(0x071022, 120, 380);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 800);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  scene.add(new THREE.HemisphereLight(0x9be7ff, 0x12152d, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(60, 120, 70);
  scene.add(sun);

  const mat = {
    ground: new THREE.MeshLambertMaterial({ color: 0x102618 }),
    road: new THREE.MeshLambertMaterial({ color: 0x11172a }),
    player: new THREE.MeshLambertMaterial({ color: 0x20f3ff }),
    skin: new THREE.MeshLambertMaterial({ color: 0xf1cf9f }),
    car: new THREE.MeshLambertMaterial({ color: 0xff3d81 }),
    coin: new THREE.MeshLambertMaterial({ color: 0xffe45c, emissive: 0x443300 }),
    npc: new THREE.MeshLambertMaterial({ color: 0xa86dff }),
    lot: new THREE.MeshLambertMaterial({ color: 0x39435f, transparent: true, opacity: 0.65 }),
    owned: new THREE.MeshLambertMaterial({ color: 0x54ff8b, transparent: true, opacity: 0.7 }),
    marker: new THREE.MeshLambertMaterial({ color: 0x5eff8b, emissive: 0x0a5a24 })
  };

  const state = {
    cash: 150, xp: 0, level: 1, pos: new THREE.Vector3(0, 1, 0), velY: 0, grounded: true, yaw: 0,
    keys: new Set(), chunks: new Map(), pickups: new Map(), cars: new Map(), npcs: new Map(), lots: new Map(), owned: new Set(), collected: new Set(), talked: new Set(),
    car: null, joy: { x: 0, y: 0, on: false, id: null }, slot: 'slot1', lastSave: 0, paused: false,
    mission: { target: new THREE.Vector3(95, 0, 72), done: false }
  };

  const tmp = new THREE.Vector3();
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.8), mat.player);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat.skin);
  head.position.y = 2.32;
  player.add(body, head);
  scene.add(player);

  const missionMarker = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 5), mat.marker);
  missionMarker.position.set(state.mission.target.x, 5, state.mission.target.z);
  scene.add(missionMarker);

  const rnd = (n) => Math.abs(Math.sin(n * 91.7 + 13.4) * 9999) % 1;
  const key = (x, z) => `${x},${z}`;
  const popup = (text) => {
    reward.textContent = text;
    reward.classList.remove('hidden');
    clearTimeout(popup.t);
    popup.t = setTimeout(() => reward.classList.add('hidden'), 1600);
  };

  function building(group, x, z, seed) {
    const h = 10 + rnd(seed) * 44;
    const color = new THREE.Color().setHSL(0.54 + rnd(seed + 2) * 0.22, 0.65, 0.32).getHex();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(7 + rnd(seed + 4) * 7, h, 7 + rnd(seed + 6) * 6), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.05 }));
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
  }

  function makeCar(id, x, z) {
    const car = new THREE.Group();
    car.userData = { id, gas: 100, hp: 100 };
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 5), mat.car);
    base.position.y = 0.75;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.1), new THREE.MeshLambertMaterial({ color: 0x202842 }));
    cab.position.y = 1.45;
    car.add(base, cab);
    car.position.set(x, 0, z);
    return car;
  }

  function makeNpc(id, x, z) {
    const npc = new THREE.Group();
    npc.userData = { id, baseX: x, baseZ: z, t: rnd(x + z) * 10 };
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.6), mat.npc);
    b.position.y = 0.95;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat.skin);
    h.position.y = 1.85;
    npc.add(b, h);
    npc.position.set(x, 0, z);
    return npc;
  }

  function createChunk(cx, cz) {
    const size = 64, gx = cx * size, gz = cz * size, id = key(cx, cz);
    const group = new THREE.Group();
    group.userData = { cars: [], pickups: [], npcs: [], lots: [] };
    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 0.12, size), mat.ground);
    ground.position.set(gx + 32, -0.06, gz + 32);
    const rx = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, 7), mat.road);
    rx.position.set(gx + 32, 0.02, gz + 32);
    const rz = new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, size), mat.road);
    rz.position.set(gx + 32, 0.03, gz + 32);
    group.add(ground, rx, rz);

    const lowPower = innerWidth < 720;
    for (let i = 0; i < (lowPower ? 3 : 5); i++) {
      const x = gx + 9 + rnd(cx * 43 + cz * 7 + i) * 46;
      const z = gz + 9 + rnd(cx * 13 + cz * 47 + i) * 46;
      if (Math.abs(x - gx - 32) > 8 && Math.abs(z - gz - 32) > 8) building(group, x, z, cx * 100 + cz * 17 + i);
    }

    const pid = `p-${id}`;
    if (!state.collected.has(pid) && rnd(cx * 19 + cz * 41) > 0.38) {
      const coin = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), mat.coin);
      coin.position.set(gx + 16 + rnd(cx) * 30, 1.3, gz + 16 + rnd(cz) * 30);
      coin.userData.id = pid;
      state.pickups.set(pid, coin);
      group.userData.pickups.push(pid);
      group.add(coin);
    }

    const lid = `lot-${id}`;
    if (rnd(cx * 37 + cz * 11) > 0.72) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 14), state.owned.has(lid) ? mat.owned : mat.lot);
      lot.position.set(gx + 43, 0.12, gz + 18);
      lot.userData = { id: lid, price: 250 };
      state.lots.set(lid, lot);
      group.userData.lots.push(lid);
      group.add(lot);
    }

    if (rnd(cx * 5 + cz * 23) > 0.75) {
      const car = makeCar(`car-${id}`, gx + 32, gz + 32);
      state.cars.set(car.userData.id, car);
      group.userData.cars.push(car.userData.id);
      group.add(car);
    }

    if (rnd(cx * 7 + cz * 17) > 0.64) {
      const npc = makeNpc(`npc-${id}`, gx + 18 + rnd(cx + 7) * 28, gz + 18 + rnd(cz + 9) * 28);
      state.npcs.set(npc.userData.id, npc);
      group.userData.npcs.push(npc.userData.id);
      group.add(npc);
    }

    scene.add(group);
    state.chunks.set(id, group);
  }

  function stream() {
    const size = 64, cx = Math.floor(state.pos.x / size), cz = Math.floor(state.pos.z / size), needed = new Set();
    const radius = innerWidth < 720 ? 1 : 2;
    for (let z = cz - radius; z <= cz + radius; z++) for (let x = cx - radius; x <= cx + radius; x++) {
      const id = key(x, z);
      needed.add(id);
      if (!state.chunks.has(id)) createChunk(x, z);
    }
    for (const [id, group] of [...state.chunks]) if (!needed.has(id)) {
      scene.remove(group);
      for (const cid of group.userData.cars || []) if (state.car?.userData.id !== cid) state.cars.delete(cid);
      for (const pid of group.userData.pickups || []) state.pickups.delete(pid);
      for (const nid of group.userData.npcs || []) state.npcs.delete(nid);
      for (const lid of group.userData.lots || []) state.lots.delete(lid);
      group.traverse((o) => o.geometry && o.geometry.dispose());
      state.chunks.delete(id);
    }
  }

  function input() {
    let x = state.joy.x, z = state.joy.y;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) z -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) z += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, z);
    return len > 0.1 ? { x: x / len, z: z / len, moving: true } : { x: 0, z: 0, moving: false };
  }

  function jump() {
    if (state.grounded && !state.car) { state.velY = 8.5; state.grounded = false; }
  }

  function interact() {
    if (state.car) { state.car = null; popup('Exited vehicle'); save(false); return; }
    let best = null, bd = 7;
    for (const car of state.cars.values()) {
      const d = car.getWorldPosition(tmp).distanceTo(state.pos);
      if (d < bd) { best = car; bd = d; }
    }
    if (best) { state.car = best; popup('Entered vehicle'); return; }
    for (const npc of state.npcs.values()) {
      if (npc.getWorldPosition(tmp).distanceTo(state.pos) < 6) {
        if (!state.talked.has(npc.userData.id)) { state.talked.add(npc.userData.id); state.cash += 40; state.xp += 20; save(false); return popup('NPC tip +$40'); }
        return popup('NPC: pickups, cars, lots!');
      }
    }
    for (const lot of state.lots.values()) {
      if (lot.getWorldPosition(tmp).distanceTo(state.pos) < 8) {
        if (state.owned.has(lot.userData.id)) return popup('Already owned');
        if (state.cash < lot.userData.price) return popup('Need $250');
        state.cash -= lot.userData.price; state.owned.add(lot.userData.id); lot.material = mat.owned; save(false); return popup('Lot purchased');
      }
    }
    popup('Nothing nearby');
  }

  function save(loud = true) {
    const payload = { cash: state.cash, xp: state.xp, pos: state.pos.toArray(), owned: [...state.owned], collected: [...state.collected], talked: [...state.talked], missionDone: state.mission.done };
    localStorage.setItem(`neonblock:${state.slot}`, JSON.stringify(payload));
    state.lastSave = performance.now();
    if (window.NeonBlockCloud?.save) window.NeonBlockCloud.save(state.slot, payload).catch(() => {});
    if (loud) popup('Saved');
  }

  function load(loud = false) {
    try {
      const raw = localStorage.getItem(`neonblock:${state.slot}`);
      if (!raw) return;
      const d = JSON.parse(raw);
      state.cash = d.cash ?? state.cash; state.xp = d.xp ?? state.xp; state.pos.fromArray(d.pos || [0, 1, 0]);
      state.owned = new Set(d.owned || []); state.collected = new Set(d.collected || []); state.talked = new Set(d.talked || []); state.mission.done = !!d.missionDone;
      missionMarker.visible = !state.mission.done;
      if (loud) popup('Loaded');
    } catch (e) { $('debug-last-error').textContent = e.message; }
  }

  function updateHud() {
    state.level = Math.floor(state.xp / 150) + 1;
    $('hud-cash').textContent = `$${Math.floor(state.cash)}`; $('hud-xp').textContent = Math.floor(state.xp); $('hud-level').textContent = state.level;
    $('hud-wanted').textContent = 0; $('hud-online').textContent = navigator.onLine ? 'online' : 'offline'; $('debug-online').textContent = $('hud-online').textContent;
    $('hud-vehicle').textContent = state.car ? 'Neon cruiser' : 'On foot'; $('hud-vehicle-hp').textContent = state.car ? Math.floor(state.car.userData.hp) : 100; $('hud-vehicle-gas').textContent = state.car ? Math.floor(state.car.userData.gas) : 100;
    $('hud-mission').textContent = state.mission.done ? 'Complete' : 'Courier: reach green marker';
    $('debug-pos').textContent = `${state.pos.x.toFixed(0)},${state.pos.y.toFixed(0)},${state.pos.z.toFixed(0)}`; $('debug-chunks').textContent = state.chunks.size; $('debug-npcs').textContent = state.npcs.size; $('debug-active-vehicle').textContent = state.car?.userData.id || 'None'; $('debug-save-slot').textContent = state.slot;
  }

  function drawMap() {
    mini.fillStyle = '#081021'; mini.fillRect(0, 0, 160, 160);
    mini.strokeStyle = '#17f3ff55'; mini.beginPath(); mini.moveTo(80, 0); mini.lineTo(80, 160); mini.moveTo(0, 80); mini.lineTo(160, 80); mini.stroke();
    const plot = (x, z, c, s) => { mini.fillStyle = c; mini.fillRect(80 + (x - state.pos.x) * 0.25 - s / 2, 80 + (z - state.pos.z) * 0.25 - s / 2, s, s); };
    if (!state.mission.done) plot(state.mission.target.x, state.mission.target.z, '#5eff8b', 6);
    for (const car of state.cars.values()) plot(car.position.x, car.position.z, '#ff3d81', 4);
    for (const npc of state.npcs.values()) plot(npc.position.x, npc.position.z, '#a86dff', 3);
    for (const lot of state.lots.values()) if (state.owned.has(lot.userData.id)) plot(lot.position.x, lot.position.z, '#54ff8b', 5);
    plot(state.pos.x, state.pos.z, '#20f3ff', 5);
  }

  function tick(dt) {
    if (state.paused) return;
    stream(); missionMarker.rotation.y += dt * 2;
    const i = input();
    if (i.moving) {
      const speed = state.car ? 23 : ((state.keys.has('ShiftLeft') || state.keys.has('ShiftRight')) ? 11 : 7);
      const f = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      const r = new THREE.Vector3(f.z, 0, -f.x);
      const move = new THREE.Vector3().addScaledVector(r, i.x).addScaledVector(f, -i.z).normalize();
      state.pos.addScaledVector(move, speed * dt);
      state.yaw = Math.atan2(move.x, move.z);
      state.xp += dt * (state.car ? 1.2 : 0.45);
    }
    if (!state.car) { state.velY -= 22 * dt; state.pos.y += state.velY * dt; if (state.pos.y <= 1) { state.pos.y = 1; state.velY = 0; state.grounded = true; } } else { state.pos.y = 1; state.velY = 0; state.grounded = true; }
    player.position.copy(state.pos); player.rotation.y = state.yaw;
    if (state.car) { state.car.position.set(state.pos.x, 0, state.pos.z); state.car.rotation.y = state.yaw; state.car.userData.gas = Math.max(0, state.car.userData.gas - dt * (i.moving ? 2 : 0.1)); if (state.car.userData.gas <= 0) { state.car = null; popup('Out of gas'); } }
    for (const npc of state.npcs.values()) { npc.userData.t += dt; npc.position.x = npc.userData.baseX + Math.sin(npc.userData.t) * 2.5; npc.rotation.y += dt * 0.7; }
    for (const [id, coin] of [...state.pickups]) { coin.rotation.y += dt * 3; if (coin.getWorldPosition(tmp).distanceTo(state.pos) < 3) { state.cash += 25; state.xp += 15; state.collected.add(id); state.pickups.delete(id); coin.parent?.remove(coin); popup('+$25 pickup'); save(false); } }
    if (!state.mission.done && state.pos.distanceTo(state.mission.target) < 8) { state.mission.done = true; missionMarker.visible = false; state.cash += 300; state.xp += 120; popup('Mission complete +$300'); save(false); }
    camera.position.lerp(new THREE.Vector3(state.pos.x - Math.sin(state.yaw) * 13, state.pos.y + 7, state.pos.z - Math.cos(state.yaw) * 13), 0.13);
    camera.lookAt(state.pos.x, state.pos.y + 2.2, state.pos.z);
    updateHud(); drawMap();
    const arrow = $('waypoint-arrow');
    arrow.textContent = state.mission.done ? '✓' : '^';
    if (!state.mission.done) arrow.style.transform = `rotate(${Math.atan2(state.mission.target.x - state.pos.x, state.mission.target.z - state.pos.z) - state.yaw}rad)`;
    if (performance.now() - state.lastSave > 20000) save(false);
  }

  function setPaused(on) { state.paused = on; $('pause-overlay').classList.toggle('hidden', !on); }

  function setup() {
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    addEventListener('keydown', (e) => { state.keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Space') { e.preventDefault(); jump(); } if (e.code === 'Escape') setPaused(!state.paused); if (e.code === 'F3') $('debug-overlay').classList.toggle('hidden'); });
    addEventListener('keyup', (e) => state.keys.delete(e.code));
    addEventListener('pagehide', () => save(false)); addEventListener('visibilitychange', () => document.hidden && save(false));
    $('btn-resume').onclick = () => setPaused(false); $('btn-mobile-pause').onclick = () => setPaused(!state.paused);
    $('btn-mobile-interact').onclick = interact; $('btn-mobile-jump').onclick = jump; $('btn-mobile-unstuck').onclick = () => { state.pos.set(0, 1, 0); state.car = null; popup('Unstuck'); save(false); };
    $('btn-save').onclick = () => { $('save-panel').classList.remove('hidden'); save(); }; $('btn-load').onclick = () => { $('save-panel').classList.remove('hidden'); load(true); };
    $('btn-close-save').onclick = () => $('save-panel').classList.add('hidden'); $('btn-settings').onclick = () => $('settings-panel').classList.remove('hidden'); $('btn-close-settings').onclick = () => $('settings-panel').classList.add('hidden');
    $('btn-missions').onclick = () => { $('mission-board').classList.remove('hidden'); $('mission-list').innerHTML = `<li>${state.mission.done ? '✓' : '•'} Courier: reach green marker for $300.</li><li>• Pickups pay $25 and XP.</li><li>• Purple NPCs give one-time tips.</li><li>• Buy lots for $250.</li>`; };
    $('btn-close-missions').onclick = () => $('mission-board').classList.add('hidden');
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.onclick = () => { state.slot = b.dataset.slot; save(); });
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.onclick = () => { state.slot = b.dataset.slot; load(true); });
    $('btn-export').onclick = () => $('export-json').value = localStorage.getItem(`neonblock:${state.slot}`) || '';
    $('btn-import').onclick = () => { try { JSON.parse($('export-json').value); localStorage.setItem(`neonblock:${state.slot}`, $('export-json').value); load(true); } catch { popup('Invalid JSON'); } };
    $('graphics-quality').onchange = (e) => renderer.setPixelRatio(e.target.value === 'low' ? 1 : Math.min(devicePixelRatio || 1, e.target.value === 'high' ? 2 : 1.5));
    setupJoystick();
  }

  function setupJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick');
    const move = (e) => { if (!state.joy.on || e.pointerId !== state.joy.id) return; const r = box.getBoundingClientRect(); const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; const max = 42, len = Math.min(max, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); state.joy.x = Math.cos(a) * len / max; state.joy.y = Math.sin(a) * len / max; stick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`; e.preventDefault(); };
    const end = (e) => { if (e?.pointerId && e.pointerId !== state.joy.id) return; state.joy.on = false; state.joy.id = null; state.joy.x = 0; state.joy.y = 0; stick.style.transform = 'translate(0,0)'; };
    box.addEventListener('pointerdown', (e) => { state.joy.on = true; state.joy.id = e.pointerId; box.setPointerCapture(e.pointerId); move(e); });
    box.addEventListener('pointermove', move); box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    let look = false, px = 0; canvas.addEventListener('pointerdown', (e) => { if (e.clientX > innerWidth * 0.35) { look = true; px = e.clientX; } }); canvas.addEventListener('pointermove', (e) => { if (look) { state.yaw -= (e.clientX - px) * 0.006; px = e.clientX; } }); canvas.addEventListener('pointerup', () => look = false); canvas.addEventListener('pointercancel', () => look = false);
    $('btn-mobile-sprint').onpointerdown = () => state.keys.add('ShiftLeft'); $('btn-mobile-sprint').onpointerup = () => state.keys.delete('ShiftLeft'); $('btn-mobile-sprint').onpointercancel = () => state.keys.delete('ShiftLeft');
  }

  let last = performance.now(), frames = 0, mark = last;
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; tick(dt); renderer.render(scene, camera); if (++frames && now - mark > 1000) { $('debug-fps').textContent = frames; frames = 0; mark = now; } requestAnimationFrame(loop); }

  setup(); load(false); stream(); updateHud(); loading.classList.add('hidden'); requestAnimationFrame(loop);
})();
