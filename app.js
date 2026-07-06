(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const THREE = window.THREE;
  const canvas = $('game-canvas');
  if (!THREE || !canvas) return;

  const mobile = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const saveKey = 'neonblock-city-save-v3';
  const state = { cash: 250, xp: 0, level: 1, wanted: 0, mission: 'Collect 5 crates', crates: 0, ownedLots: {}, pickups: {} };
  const input = { keys: new Set(), joyX: 0, joyY: 0, sprint: false, jump: false, lookX: 0, lookY: 0, pointer: false };
  const player = { pos: new THREE.Vector3(0, 2.2, 0), vel: new THREE.Vector3(), yaw: 0, pitch: -0.2, grounded: false };
  const world = { size: 96, radius: mobile ? 1 : 2, chunks: new Map(), things: [], vehicles: [], activeCar: null };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 90, mobile ? 300 : 460);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 2));
  renderer.setSize(innerWidth, innerHeight);

  scene.add(new THREE.HemisphereLight(0xbdeeff, 0x101020, 1.15));
  const sun = new THREE.DirectionalLight(0x77e8ff, 1.2);
  sun.position.set(50, 90, 25);
  scene.add(sun);

  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x071024, roughness: 0.95 }),
    road: new THREE.MeshStandardMaterial({ color: 0x111a30, roughness: 0.75 }),
    building: [0x151c44, 0x20265b, 0x101733].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78 })),
    neon: [0x17f3ff, 0xff3dd8, 0x7cff6b, 0xffcc33].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 })),
    skin: new THREE.MeshStandardMaterial({ color: 0xffd0a0 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x064a55 })
  };

  const avatar = new THREE.Group();
  const body = box(1.8, 2.7, 1.1, mats.player, 0, 1.35, 0);
  const head = box(1.2, 1.2, 1.2, mats.skin, 0, 3.05, 0);
  const face = box(0.65, 0.12, 0.05, new THREE.MeshStandardMaterial({ color: 0x050814 }), 0, 3.08, -0.63);
  avatar.add(body, head, face);
  scene.add(avatar);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, .2, 8, 32), mats.neon[0]);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const mini = $('minimap-canvas')?.getContext('2d');

  function rnd(seed) { const n = Math.sin(seed * 999.1) * 10000; return n - Math.floor(n); }
  function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
  function key(cx, cz) { return `${cx},${cz}`; }

  function addThing(obj, type, data = {}) { obj.userData = { type, ...data }; world.things.push(obj); return obj; }

  function chunk(cx, cz) {
    const k = key(cx, cz), g = new THREE.Group(), bx = cx * world.size, bz = cz * world.size;
    g.add(box(world.size, .4, world.size, mats.ground, bx, -.2, bz));
    g.add(box(18, .08, world.size, mats.road, bx, .02, bz));
    g.add(box(world.size, .08, 18, mats.road, bx, .025, bz));
    g.add(box(2, .12, world.size, mats.neon[0], bx - 12, .1, bz));
    g.add(box(2, .12, world.size, mats.neon[1], bx + 12, .1, bz));
    g.add(box(world.size, .12, 2, mats.neon[2], bx, .1, bz - 12));
    g.add(box(world.size, .12, 2, mats.neon[3], bx, .1, bz + 12));

    for (let i = 0; i < 8; i++) {
      const s = (cx + 20) * 71 + (cz + 50) * 37 + i * 13;
      const side = i % 4;
      const x = bx + (side < 2 ? (side ? 30 : -30) : (rnd(s) - .5) * 66);
      const z = bz + (side >= 2 ? (side === 2 ? 30 : -30) : (rnd(s + 2) - .5) * 66);
      const h = 8 + rnd(s + 3) * (mobile ? 24 : 46);
      g.add(box(9 + rnd(s + 4) * 10, h, 9 + rnd(s + 5) * 10, mats.building[i % mats.building.length], x, h / 2, z));
      if (!mobile || i % 2 === 0) g.add(box(7, .45, .4, mats.neon[i % 4], x, Math.min(h - 1, 9 + rnd(s) * 10), z - 6));
    }

    for (let i = 0; i < (mobile ? 3 : 5); i++) {
      const id = `crate:${k}:${i}`;
      if (state.pickups[id]) continue;
      const s = (cx + 12) * 91 + (cz + 9) * 43 + i;
      const p = addThing(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mats.neon[i % 4]), 'crate', { id });
      p.position.set(bx + (rnd(s) - .5) * 70, 1.3, bz + (rnd(s + 1) - .5) * 70);
      g.add(p);
    }

    if ((Math.abs(cx) + Math.abs(cz)) % 2 === 0) {
      const id = `lot:${k}`;
      const lot = addThing(box(12, .25, 12, state.ownedLots[id] ? mats.neon[2] : mats.neon[0], bx + 32, .15, bz + 32), 'lot', { id, price: 450 + 75 * (Math.abs(cx) + Math.abs(cz)) });
      g.add(lot);
    }

    if (cx === 0 && cz === 0 || rnd(cx * 13 + cz * 31) > .72) {
      const car = new THREE.Group();
      car.add(box(4.8, 1.2, 7, mats.neon[Math.abs(cx + cz) % 4], 0, 1, 0));
      car.add(box(3.2, 1, 3.3, mats.building[1], 0, 2, -.5));
      car.position.set(bx + 9, 0, bz + 24);
      addThing(car, 'car', { speed: 0, yaw: 0, gas: 100, hp: 100 });
      world.vehicles.push(car);
      g.add(car);
    }

    scene.add(g);
    world.chunks.set(k, { g, cx, cz });
  }

  function stream() {
    const cx = Math.floor((player.pos.x + world.size / 2) / world.size);
    const cz = Math.floor((player.pos.z + world.size / 2) / world.size);
    for (let x = cx - world.radius; x <= cx + world.radius; x++) for (let z = cz - world.radius; z <= cz + world.radius; z++) if (!world.chunks.has(key(x, z))) chunk(x, z);
    for (const [k, c] of [...world.chunks]) if (Math.abs(c.cx - cx) > world.radius || Math.abs(c.cz - cz) > world.radius) { c.g.traverse(o => { if (o.userData?.type) world.things = world.things.filter(t => t !== o); }); scene.remove(c.g); world.chunks.delete(k); }
  }

  function popup(text) { const p = $('reward-popup'); if (!p) return; p.textContent = text; p.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => p.classList.add('hidden'), 2200); }
  function level() { while (state.xp >= state.level * 120) { state.xp -= state.level * 120; state.level++; popup('Level up! Level ' + state.level); } }
  function near(max = 7) { const origin = world.activeCar ? world.activeCar.position : player.pos; let b = null, d = max; for (const t of world.things) { if (!t.parent) continue; const p = t.getWorldPosition(new THREE.Vector3()); const nd = p.distanceTo(origin); if (nd < d) { b = t; d = nd; } } return b; }

  function interact() {
    const t = near();
    if (!t) return popup('Move closer to interact.');
    if (t.userData.type === 'car') {
      if (world.activeCar === t) { world.activeCar = null; player.pos.copy(t.position).add(new THREE.Vector3(3, 2.2, 0)); avatar.visible = true; popup('Exited car'); }
      else { world.activeCar = t; avatar.visible = false; popup('Entered car'); }
    }
    if (t.userData.type === 'crate') {
      state.pickups[t.userData.id] = true; state.cash += 35; state.xp += 15; state.crates++; level();
      t.parent.remove(t); world.things = world.things.filter(x => x !== t); popup('Crate collected +$35 +15XP');
      if (state.crates >= 5 && state.mission) { state.cash += 300; state.xp += 80; state.mission = null; level(); popup('Mission complete +$300 +80XP'); }
    }
    if (t.userData.type === 'lot') {
      if (state.ownedLots[t.userData.id]) return popup('You already own this lot.');
      if (state.cash < t.userData.price) return popup('Need $' + t.userData.price);
      state.cash -= t.userData.price; state.ownedLots[t.userData.id] = true; t.material = mats.neon[2]; popup('Lot purchased and saved.'); save();
    }
  }

  function controls(dt) {
    let x = 0, z = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) z--; if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) z++; if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x--; if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x++;
    x += input.joyX; z += input.joyY; const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    if (world.activeCar) { const c = world.activeCar, u = c.userData; u.speed = THREE.MathUtils.clamp((u.speed || 0) + (z < 0 ? 32 : z > 0 ? -20 : 0) * dt, -18, 45); u.speed *= Math.pow(.96, dt * 60); u.yaw += x * dt * (u.speed >= 0 ? -1.9 : 1.9); c.rotation.y = u.yaw; c.position.addScaledVector(new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw)), u.speed * dt); player.pos.copy(c.position).add(new THREE.Vector3(0, 2.2, 0)); if (Math.abs(u.speed) > 3) u.gas = Math.max(0, u.gas - dt); return; }
    const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const r = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const wish = new THREE.Vector3().addScaledVector(r, x).addScaledVector(f, -z); if (wish.lengthSq() > .01) wish.normalize();
    const sp = 16 * ((input.sprint || input.keys.has('ShiftLeft')) ? 1.55 : 1);
    player.vel.x = THREE.MathUtils.lerp(player.vel.x, wish.x * sp, 1 - Math.pow(.001, dt)); player.vel.z = THREE.MathUtils.lerp(player.vel.z, wish.z * sp, 1 - Math.pow(.001, dt));
    if ((input.jump || input.keys.has('Space')) && player.grounded) { player.vel.y = 13; player.grounded = false; } input.jump = false;
  }

  function physics(dt) { player.vel.y -= 32 * dt; player.pos.addScaledVector(player.vel, dt); if (player.pos.y < 2.2) { player.pos.y = 2.2; player.vel.y = 0; player.grounded = true; } avatar.position.copy(player.pos).add(new THREE.Vector3(0, -2.2, 0)); avatar.rotation.y = player.yaw; }
  function cam(dt) { player.yaw -= input.lookX * .002; player.pitch = THREE.MathUtils.clamp(player.pitch - input.lookY * .002, -.8, .25); input.lookX *= Math.pow(.05, dt); input.lookY *= Math.pow(.05, dt); const target = (world.activeCar ? world.activeCar.position : player.pos).clone().add(new THREE.Vector3(0, 2, 0)); const dist = world.activeCar ? 22 : 14; const desired = target.clone().add(new THREE.Vector3(Math.sin(player.yaw), Math.sin(player.pitch), Math.cos(player.yaw)).multiplyScalar(dist)).add(new THREE.Vector3(0, 8, 0)); camera.position.lerp(desired, 1 - Math.pow(.0008, dt)); camera.lookAt(target); }
  function hud() { $('hud-cash').textContent = '$' + state.cash; $('hud-xp').textContent = state.xp; $('hud-level').textContent = state.level; $('hud-wanted').textContent = state.wanted; $('hud-online').textContent = window.NeonCloudSave ? 'cloud optional' : 'offline'; $('hud-vehicle').textContent = world.activeCar ? 'Neon Car' : 'On foot'; $('hud-vehicle-hp').textContent = world.activeCar ? Math.floor(world.activeCar.userData.hp) : 100; $('hud-vehicle-gas').textContent = world.activeCar ? Math.floor(world.activeCar.userData.gas) : 100; $('hud-mission').textContent = state.mission ? `${state.mission} ${state.crates}/5` : 'Free roam'; $('debug-fps').textContent = fps; $('debug-pos').textContent = `${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)}`; $('debug-chunks').textContent = world.chunks.size; $('debug-npcs').textContent = world.things.length; $('debug-active-vehicle').textContent = world.activeCar ? 'car' : 'none'; }
  function map() { if (!mini) return; const w = mini.canvas.width, h = mini.canvas.height; mini.clearRect(0,0,w,h); mini.fillStyle = '#071024'; mini.fillRect(0,0,w,h); const plot = (p,c,s) => { const x = w/2 + (p.x-player.pos.x)/1.4, y = h/2 + (p.z-player.pos.z)/1.4; if (x<0||x>w||y<0||y>h) return; mini.fillStyle=c; mini.fillRect(x-s/2,y-s/2,s,s); }; world.things.forEach(t => { if (t.userData.type === 'crate') plot(t.position, '#7cff6b', 3); if (t.userData.type === 'lot') plot(t.position, '#17f3ff', 5); if (t.userData.type === 'car') plot(t.position, '#ffcc33', 4); }); plot(player.pos, '#fff', 6); }
  function save() { localStorage.setItem(saveKey, JSON.stringify({ state, player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw } })); }
  function load() { try { const d = JSON.parse(localStorage.getItem(saveKey) || 'null'); if (!d) return; Object.assign(state, d.state || {}); if (d.player) { player.pos.set(d.player.x || 0, Math.max(2.2, d.player.y || 2.2), d.player.z || 0); player.yaw = d.player.yaw || 0; } } catch { } }
  function unstuck() { player.pos.set(0, 2.2, 0); player.vel.set(0,0,0); if (world.activeCar) { world.activeCar.position.set(0,0,0); world.activeCar.userData.speed = 0; } popup('Returned to spawn'); }

  function wire() {
    addEventListener('keydown', e => { input.keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') $('pause-overlay').classList.toggle('hidden'); if (e.code === 'F3') $('debug-overlay').classList.toggle('visible'); });
    addEventListener('keyup', e => input.keys.delete(e.code));
    canvas.addEventListener('pointerdown', e => { input.pointer = true; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointerup', () => input.pointer = false);
    canvas.addEventListener('pointermove', e => { if (input.pointer && (!mobile || e.clientX > innerWidth * .35)) { input.lookX += e.movementX || 0; input.lookY += e.movementY || 0; } });
    const joy = $('joystick-container'), stick = $('joystick-stick'); let joyId = null;
    const setJoy = e => { const r = joy.getBoundingClientRect(), max = r.width * .35; let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2); const l = Math.hypot(dx,dy); if (l > max) { dx = dx/l*max; dy = dy/l*max; } input.joyX = dx/max; input.joyY = dy/max; stick.style.transform = `translate(${dx}px,${dy}px)`; };
    joy?.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); setJoy(e); }); joy?.addEventListener('pointermove', e => { if (e.pointerId === joyId) setJoy(e); }); ['pointerup','pointercancel'].forEach(n => joy?.addEventListener(n, () => { joyId = null; input.joyX = input.joyY = 0; stick.style.transform = ''; }));
    $('btn-mobile-jump')?.addEventListener('pointerdown', e => { e.preventDefault(); input.jump = true; }); $('btn-mobile-sprint')?.addEventListener('pointerdown', e => { e.preventDefault(); input.sprint = true; }); $('btn-mobile-sprint')?.addEventListener('pointerup', () => input.sprint = false); $('btn-mobile-interact')?.addEventListener('click', interact); $('btn-mobile-unstuck')?.addEventListener('click', unstuck); $('btn-mobile-pause')?.addEventListener('click', () => $('pause-overlay').classList.toggle('hidden'));
    $('btn-resume')?.addEventListener('click', () => $('pause-overlay').classList.add('hidden')); $('btn-save')?.addEventListener('click', () => { save(); popup('Saved'); }); $('btn-load')?.addEventListener('click', () => { load(); popup('Loaded'); }); $('btn-settings')?.addEventListener('click', () => $('settings-panel').classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click', () => $('settings-panel').classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { localStorage.setItem(saveKey + ':' + b.dataset.slot, JSON.stringify({ state, player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw } })); popup('Saved ' + b.dataset.slot); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { const raw = localStorage.getItem(saveKey + ':' + b.dataset.slot); if (raw) localStorage.setItem(saveKey, raw); load(); popup('Loaded ' + b.dataset.slot); }));
    $('btn-export')?.addEventListener('click', () => $('export-json').value = localStorage.getItem(saveKey) || '{}'); $('btn-import')?.addEventListener('click', () => { try { JSON.parse($('export-json').value); localStorage.setItem(saveKey, $('export-json').value); load(); popup('Imported'); } catch { popup('Invalid JSON'); } }); $('btn-close-save')?.addEventListener('click', () => $('save-panel').classList.add('hidden'));
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }); addEventListener('pagehide', save); addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  }

  load(); wire(); stream(); loading?.classList.add('hidden'); popup('Move with WASD/joystick. E/Interact collects, drives, and buys.');
  let last = performance.now(), frames = 0, fps = 60, fpsAt = last, saveAt = last;
  function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; frames++; if (now - fpsAt > 1000) { fps = frames; frames = 0; fpsAt = now; if (mobile && fps < 35) { world.radius = 1; renderer.setPixelRatio(1); } hud(); } controls(dt); physics(dt); cam(dt); stream(); world.things.forEach(t => { if (t.userData.type === 'crate') { t.rotation.y += dt * 1.7; if (!world.activeCar && t.position.distanceTo(player.pos) < 2.4) interact(); } }); if (state.mission === null && world.activeCar) { ring.visible = true; ring.position.set(80, 1.5, -45); ring.rotation.z += dt; if (world.activeCar.position.distanceTo(ring.position) < 7) { state.cash += 100; state.xp += 25; level(); popup('Waypoint bonus +$100'); ring.position.x *= -1; } } map(); renderer.render(scene, camera); if (now - saveAt > 25000) { saveAt = now; save(); } requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
