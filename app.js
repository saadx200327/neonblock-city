(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const THREE = window.THREE;
  const canvas = $('game-canvas');
  const loadingScreen = $('loading-screen');
  if (!THREE || !canvas) return;

  const mobile = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const saveKey = 'neonblock-city-save-v4';
  const legacySaveKey = 'neonblock-city-save-v3';
  const tmpVec = new THREE.Vector3();
  const tmpVec2 = new THREE.Vector3();

  const defaultState = () => ({
    cash: 250,
    xp: 0,
    level: 1,
    wanted: 0,
    mission: 'Collect 5 crates',
    crates: 0,
    ownedLots: {},
    pickups: {},
    activeSlot: 'slot1',
    cloudMode: 'offline',
    lastError: 'none'
  });

  const state = defaultState();
  const input = { keys: new Set(), joyX: 0, joyY: 0, sprint: false, jump: false, lookX: 0, lookY: 0, pointer: false };
  const player = { pos: new THREE.Vector3(0, 2.2, 0), vel: new THREE.Vector3(), yaw: 0, pitch: -0.2, grounded: false };
  const world = { size: 96, radius: mobile ? 1 : 2, chunks: new Map(), things: [], vehicles: [], activeCar: null, quality: 'auto' };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 90, mobile ? 300 : 460);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.2 : 2));
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
  avatar.add(box(1.8, 2.7, 1.1, mats.player, 0, 1.35, 0));
  avatar.add(box(1.2, 1.2, 1.2, mats.skin, 0, 3.05, 0));
  avatar.add(box(0.65, 0.12, 0.05, new THREE.MeshStandardMaterial({ color: 0x050814 }), 0, 3.08, -0.63));
  scene.add(avatar);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.2, 8, 32), mats.neon[0]);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const mini = $('minimap-canvas')?.getContext('2d');

  function safeText(id, value) { const el = $(id); if (el) el.textContent = String(value); }
  function rnd(seed) { const n = Math.sin(seed * 999.1) * 10000; return n - Math.floor(n); }
  function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
  function key(cx, cz) { return `${cx},${cz}`; }
  function addThing(obj, type, data = {}) { obj.userData = { type, ...data }; world.things.push(obj); return obj; }

  function savePayload() {
    return {
      version: 4,
      savedAt: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(state)),
      player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch }
    };
  }

  function applyPayload(d) {
    if (!d || typeof d !== 'object') return false;
    Object.assign(state, defaultState(), d.state || {});
    state.ownedLots = state.ownedLots || {};
    state.pickups = state.pickups || {};
    if (d.player) {
      player.pos.set(Number(d.player.x) || 0, Math.max(2.2, Number(d.player.y) || 2.2), Number(d.player.z) || 0);
      player.yaw = Number(d.player.yaw) || 0;
      player.pitch = THREE.MathUtils.clamp(Number(d.player.pitch) || -0.2, -0.8, 0.25);
      player.vel.set(0, 0, 0);
    }
    return true;
  }

  function save(slot = state.activeSlot || 'slot1') {
    state.activeSlot = slot;
    const payload = savePayload();
    localStorage.setItem(saveKey, JSON.stringify(payload));
    localStorage.setItem(`${saveKey}:${slot}`, JSON.stringify(payload));
    if (window.NeonCloudSave?.save) {
      window.NeonCloudSave.save(slot, payload)
        .then(r => { state.cloudMode = r?.mode || 'cloud'; safeText('debug-online', state.cloudMode); })
        .catch(err => { state.cloudMode = 'local'; state.lastError = err?.message || 'cloud save failed'; });
    }
    return payload;
  }

  async function load(slot = state.activeSlot || 'slot1', preferCloud = false) {
    state.activeSlot = slot;
    try {
      let raw = null;
      if (preferCloud && window.NeonCloudSave?.load) {
        const cloud = await window.NeonCloudSave.load(slot);
        if (cloud) raw = JSON.stringify(cloud);
      }
      raw = raw || localStorage.getItem(`${saveKey}:${slot}`) || localStorage.getItem(saveKey) || localStorage.getItem(legacySaveKey);
      if (!raw) return false;
      const ok = applyPayload(JSON.parse(raw));
      if (ok) {
        stream(true);
        popup(`Loaded ${slot}`);
      }
      return ok;
    } catch (err) {
      state.lastError = err?.message || 'load failed';
      popup('Could not load save');
      return false;
    }
  }

  function popup(text) {
    const p = $('reward-popup');
    if (!p) return;
    p.textContent = text;
    p.classList.remove('hidden');
    clearTimeout(popup.t);
    popup.t = setTimeout(() => p.classList.add('hidden'), 2200);
  }

  function level() {
    while (state.xp >= state.level * 120) {
      state.xp -= state.level * 120;
      state.level++;
      popup('Level up! Level ' + state.level);
    }
  }

  function chunk(cx, cz) {
    const k = key(cx, cz);
    const g = new THREE.Group();
    const bx = cx * world.size;
    const bz = cz * world.size;
    g.userData.chunkKey = k;

    g.add(box(world.size, 0.4, world.size, mats.ground, bx, -0.2, bz));
    g.add(box(18, 0.08, world.size, mats.road, bx, 0.02, bz));
    g.add(box(world.size, 0.08, 18, mats.road, bx, 0.025, bz));
    g.add(box(2, 0.12, world.size, mats.neon[0], bx - 12, 0.1, bz));
    g.add(box(2, 0.12, world.size, mats.neon[1], bx + 12, 0.1, bz));
    g.add(box(world.size, 0.12, 2, mats.neon[2], bx, 0.1, bz - 12));
    g.add(box(world.size, 0.12, 2, mats.neon[3], bx, 0.1, bz + 12));

    for (let i = 0; i < 8; i++) {
      const s = (cx + 20) * 71 + (cz + 50) * 37 + i * 13;
      const side = i % 4;
      const x = bx + (side < 2 ? (side ? 30 : -30) : (rnd(s) - 0.5) * 66);
      const z = bz + (side >= 2 ? (side === 2 ? 30 : -30) : (rnd(s + 2) - 0.5) * 66);
      const h = 8 + rnd(s + 3) * (mobile ? 24 : 46);
      g.add(box(9 + rnd(s + 4) * 10, h, 9 + rnd(s + 5) * 10, mats.building[i % mats.building.length], x, h / 2, z));
      if (world.quality !== 'low' && (!mobile || i % 2 === 0)) g.add(box(7, 0.45, 0.4, mats.neon[i % 4], x, Math.min(h - 1, 9 + rnd(s) * 10), z - 6));
    }

    for (let i = 0; i < (mobile ? 3 : 5); i++) {
      const id = `crate:${k}:${i}`;
      if (state.pickups[id]) continue;
      const s = (cx + 12) * 91 + (cz + 9) * 43 + i;
      const p = addThing(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mats.neon[i % 4]), 'crate', { id });
      p.position.set(bx + (rnd(s) - 0.5) * 70, 1.3, bz + (rnd(s + 1) - 0.5) * 70);
      g.add(p);
    }

    if ((Math.abs(cx) + Math.abs(cz)) % 2 === 0) {
      const id = `lot:${k}`;
      const lot = addThing(box(12, 0.25, 12, state.ownedLots[id] ? mats.neon[2] : mats.neon[0], bx + 32, 0.15, bz + 32), 'lot', { id, price: 450 + 75 * (Math.abs(cx) + Math.abs(cz)) });
      g.add(lot);
    }

    if (!mobile || (Math.abs(cx) + Math.abs(cz)) % 3 === 0) {
      const npc = addThing(box(1.5, 2.5, 1.5, mats.neon[3], bx - 25, 1.25, bz + 18), 'npc', { tip: 'Tip: crates give XP, lots stay owned, cars earn waypoint bonuses.' });
      g.add(npc);
    }

    if ((cx === 0 && cz === 0) || rnd(cx * 13 + cz * 31) > 0.72) {
      const car = new THREE.Group();
      car.add(box(4.8, 1.2, 7, mats.neon[Math.abs(cx + cz) % 4], 0, 1, 0));
      car.add(box(3.2, 1, 3.3, mats.building[1], 0, 2, -0.5));
      car.position.set(bx + 9, 0, bz + 24);
      addThing(car, 'car', { speed: 0, yaw: 0, gas: 100, hp: 100 });
      world.vehicles.push(car);
      g.add(car);
    }

    scene.add(g);
    world.chunks.set(k, { g, cx, cz });
  }

  function disposeObject(o) {
    if (o.geometry) o.geometry.dispose?.();
  }

  function stream(force = false) {
    const cx = Math.floor((player.pos.x + world.size / 2) / world.size);
    const cz = Math.floor((player.pos.z + world.size / 2) / world.size);
    for (let x = cx - world.radius; x <= cx + world.radius; x++) {
      for (let z = cz - world.radius; z <= cz + world.radius; z++) {
        if (!world.chunks.has(key(x, z))) chunk(x, z);
      }
    }
    for (const [k, c] of [...world.chunks]) {
      if (force || Math.abs(c.cx - cx) > world.radius || Math.abs(c.cz - cz) > world.radius) {
        c.g.traverse(o => {
          if (o.userData?.type) world.things = world.things.filter(t => t !== o);
          disposeObject(o);
        });
        world.vehicles = world.vehicles.filter(v => v.parent !== c.g);
        if (world.activeCar?.parent === c.g) world.activeCar = null;
        scene.remove(c.g);
        world.chunks.delete(k);
      }
    }
  }

  function nearest(max = 7) {
    const origin = world.activeCar ? world.activeCar.position : player.pos;
    let best = null;
    let dist = max;
    for (const t of world.things) {
      if (!t.parent) continue;
      t.getWorldPosition(tmpVec);
      const d = tmpVec.distanceTo(origin);
      if (d < dist) { best = t; dist = d; }
    }
    return best;
  }

  function interact() {
    const t = nearest();
    if (!t) return popup('Move closer to interact.');
    if (t.userData.type === 'npc') return popup(t.userData.tip || 'Welcome to NeonBlock City.');
    if (t.userData.type === 'car') {
      if (world.activeCar === t) {
        world.activeCar = null;
        player.pos.copy(t.position).add(new THREE.Vector3(3, 2.2, 0));
        avatar.visible = true;
        popup('Exited car');
      } else {
        world.activeCar = t;
        avatar.visible = false;
        popup('Entered car');
      }
      return;
    }
    if (t.userData.type === 'crate') {
      state.pickups[t.userData.id] = true;
      state.cash += 35;
      state.xp += 15;
      state.crates++;
      level();
      t.parent.remove(t);
      world.things = world.things.filter(x => x !== t);
      popup('Crate collected +$35 +15XP');
      if (state.crates >= 5 && state.mission) {
        state.cash += 300;
        state.xp += 80;
        state.mission = null;
        level();
        popup('Mission complete +$300 +80XP');
      }
      save();
      return;
    }
    if (t.userData.type === 'lot') {
      if (state.ownedLots[t.userData.id]) return popup('You already own this lot.');
      if (state.cash < t.userData.price) return popup('Need $' + t.userData.price);
      state.cash -= t.userData.price;
      state.ownedLots[t.userData.id] = true;
      t.material = mats.neon[2];
      popup('Lot purchased and saved.');
      save();
    }
  }

  function controls(dt) {
    let x = 0;
    let z = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) z--;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) z++;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x--;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x++;
    x += input.joyX;
    z += input.joyY;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }

    if (world.activeCar) {
      const c = world.activeCar;
      const u = c.userData;
      const throttle = u.gas > 0 ? (z < 0 ? 34 : z > 0 ? -20 : 0) : 0;
      u.speed = THREE.MathUtils.clamp((u.speed || 0) + throttle * dt, -18, 45);
      u.speed *= Math.pow(0.96, dt * 60);
      u.yaw += x * dt * (u.speed >= 0 ? -1.9 : 1.9);
      c.rotation.y = u.yaw;
      tmpVec.set(Math.sin(u.yaw), 0, Math.cos(u.yaw));
      c.position.addScaledVector(tmpVec, u.speed * dt);
      player.pos.copy(c.position).add(tmpVec2.set(0, 2.2, 0));
      if (Math.abs(u.speed) > 3) u.gas = Math.max(0, u.gas - dt);
      return;
    }

    const f = tmpVec.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).clone();
    const r = tmpVec2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw)).clone();
    const wish = new THREE.Vector3().addScaledVector(r, x).addScaledVector(f, -z);
    if (wish.lengthSq() > 0.01) wish.normalize();
    const sp = 16 * ((input.sprint || input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')) ? 1.55 : 1);
    player.vel.x = THREE.MathUtils.lerp(player.vel.x, wish.x * sp, 1 - Math.pow(0.001, dt));
    player.vel.z = THREE.MathUtils.lerp(player.vel.z, wish.z * sp, 1 - Math.pow(0.001, dt));
    if ((input.jump || input.keys.has('Space')) && player.grounded) {
      player.vel.y = 13;
      player.grounded = false;
    }
    input.jump = false;
  }

  function physics(dt) {
    player.vel.y -= 32 * dt;
    player.pos.addScaledVector(player.vel, dt);
    if (player.pos.y < 2.2) {
      player.pos.y = 2.2;
      player.vel.y = 0;
      player.grounded = true;
    }
    avatar.position.copy(player.pos).add(tmpVec.set(0, -2.2, 0));
    avatar.rotation.y = player.yaw;
  }

  function cam(dt) {
    player.yaw -= input.lookX * 0.002;
    player.pitch = THREE.MathUtils.clamp(player.pitch - input.lookY * 0.002, -0.8, 0.25);
    input.lookX *= Math.pow(0.05, dt);
    input.lookY *= Math.pow(0.05, dt);
    const target = (world.activeCar ? world.activeCar.position : player.pos).clone().add(tmpVec.set(0, 2, 0));
    const dist = world.activeCar ? 22 : 14;
    const desired = target.clone().add(tmpVec2.set(Math.sin(player.yaw), Math.sin(player.pitch), Math.cos(player.yaw)).multiplyScalar(dist)).add(tmpVec.set(0, 8, 0));
    camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    camera.lookAt(target);
  }

  function hud(fps = 60) {
    safeText('hud-cash', '$' + state.cash);
    safeText('hud-xp', state.xp);
    safeText('hud-level', state.level);
    safeText('hud-wanted', state.wanted);
    safeText('hud-online', window.NeonCloudSave ? state.cloudMode : 'offline');
    safeText('hud-vehicle', world.activeCar ? 'Neon Car' : 'On foot');
    safeText('hud-vehicle-hp', world.activeCar ? Math.floor(world.activeCar.userData.hp) : 100);
    safeText('hud-vehicle-gas', world.activeCar ? Math.floor(world.activeCar.userData.gas) : 100);
    safeText('hud-mission', state.mission ? `${state.mission} ${state.crates}/5` : 'Drive through waypoint rings');
    safeText('debug-fps', fps);
    safeText('debug-pos', `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`);
    safeText('debug-chunks', world.chunks.size);
    safeText('debug-npcs', world.things.filter(t => t.userData.type === 'npc').length);
    safeText('debug-active-vehicle', world.activeCar ? 'car' : 'none');
    safeText('debug-save-slot', state.activeSlot);
    safeText('debug-online', window.NeonCloudSave ? state.cloudMode : 'offline');
    safeText('debug-last-error', state.lastError);
  }

  function map() {
    if (!mini) return;
    const w = mini.canvas.width;
    const h = mini.canvas.height;
    mini.clearRect(0, 0, w, h);
    mini.fillStyle = '#071024';
    mini.fillRect(0, 0, w, h);
    const plot = (p, c, s) => {
      const x = w / 2 + (p.x - player.pos.x) / 1.4;
      const y = h / 2 + (p.z - player.pos.z) / 1.4;
      if (x < 0 || x > w || y < 0 || y > h) return;
      mini.fillStyle = c;
      mini.fillRect(x - s / 2, y - s / 2, s, s);
    };
    world.things.forEach(t => {
      const p = t.getWorldPosition(new THREE.Vector3());
      if (t.userData.type === 'crate') plot(p, '#7cff6b', 3);
      if (t.userData.type === 'lot') plot(p, state.ownedLots[t.userData.id] ? '#7cff6b' : '#17f3ff', 5);
      if (t.userData.type === 'car') plot(p, '#ffcc33', 4);
      if (t.userData.type === 'npc') plot(p, '#ff3dd8', 3);
    });
    plot(player.pos, '#fff', 6);
  }

  function showMissionBoard() {
    const list = $('mission-list');
    const board = $('mission-board');
    if (!list || !board) return;
    list.innerHTML = '';
    const missions = [
      state.mission ? `${state.mission}: ${state.crates}/5 crates` : 'Mission complete: unlock drive waypoint bonus',
      `Own ${Object.keys(state.ownedLots).length} neon lots`,
      'Enter a car and drive through glowing rings for bonus cash'
    ];
    missions.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      list.appendChild(li);
    });
    board.classList.remove('hidden');
  }

  function unstuck() {
    if (world.activeCar) {
      world.activeCar.position.set(0, 0, 0);
      world.activeCar.userData.speed = 0;
      world.activeCar.userData.gas = Math.max(world.activeCar.userData.gas, 30);
    }
    player.pos.set(0, 2.2, 0);
    player.vel.set(0, 0, 0);
    stream(true);
    popup('Returned to spawn');
  }

  function setQuality(value) {
    world.quality = value || 'auto';
    if (world.quality === 'low') {
      world.radius = 1;
      renderer.setPixelRatio(1);
    } else if (world.quality === 'high' && !mobile) {
      world.radius = 2;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    }
    stream(true);
  }

  function wire() {
    addEventListener('keydown', e => {
      input.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyM') showMissionBoard();
      if (e.code === 'Escape') $('pause-overlay')?.classList.toggle('hidden');
      if (e.code === 'F3') $('debug-overlay')?.classList.toggle('visible');
    }, { passive: false });
    addEventListener('keyup', e => input.keys.delete(e.code));

    canvas.addEventListener('pointerdown', e => {
      input.pointer = true;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => { input.pointer = false; });
    canvas.addEventListener('pointercancel', () => { input.pointer = false; });
    canvas.addEventListener('pointermove', e => {
      if (!input.pointer || (mobile && e.clientX <= innerWidth * 0.35)) return;
      input.lookX += e.movementX || 0;
      input.lookY += e.movementY || 0;
    });

    const joy = $('joystick-container');
    const stick = $('joystick-stick');
    let joyId = null;
    const setJoy = e => {
      if (!joy || !stick) return;
      const r = joy.getBoundingClientRect();
      const max = r.width * 0.35 || 1;
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      input.joyX = dx / max;
      input.joyY = dy / max;
      stick.style.transform = `translate(${dx}px,${dy}px)`;
    };
    joy?.addEventListener('pointerdown', e => { e.preventDefault(); joyId = e.pointerId; joy.setPointerCapture(e.pointerId); setJoy(e); });
    joy?.addEventListener('pointermove', e => { if (e.pointerId === joyId) setJoy(e); });
    ['pointerup', 'pointercancel'].forEach(n => joy?.addEventListener(n, () => { joyId = null; input.joyX = 0; input.joyY = 0; if (stick) stick.style.transform = ''; }));

    $('btn-mobile-jump')?.addEventListener('pointerdown', e => { e.preventDefault(); input.jump = true; });
    $('btn-mobile-sprint')?.addEventListener('pointerdown', e => { e.preventDefault(); input.sprint = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => $('btn-mobile-sprint')?.addEventListener(n, () => { input.sprint = false; }));
    $('btn-mobile-interact')?.addEventListener('click', interact);
    $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    $('btn-mobile-pause')?.addEventListener('click', () => $('pause-overlay')?.classList.toggle('hidden'));

    $('btn-resume')?.addEventListener('click', () => $('pause-overlay')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => { save(); popup('Saved'); });
    $('btn-load')?.addEventListener('click', () => { load(); });
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', () => $('mission-board')?.classList.add('hidden'));
    $('graphics-quality')?.addEventListener('change', e => setQuality(e.target.value));

    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { save(b.dataset.slot || 'slot1'); popup('Saved ' + (b.dataset.slot || 'slot1')); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => load(b.dataset.slot || 'slot1')));
    $('btn-export')?.addEventListener('click', () => { const out = $('export-json'); if (out) out.value = JSON.stringify(savePayload(), null, 2); });
    $('btn-import')?.addEventListener('click', () => {
      try {
        const payload = JSON.parse($('export-json')?.value || '{}');
        if (!applyPayload(payload)) throw new Error('Bad save');
        localStorage.setItem(saveKey, JSON.stringify(payload));
        save(state.activeSlot);
        popup('Imported');
      } catch (err) {
        state.lastError = err?.message || 'invalid JSON';
        popup('Invalid JSON');
      }
    });
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    addEventListener('pagehide', () => save());
    addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  }

  function updateWorld(dt) {
    stream();
    const playerOrigin = world.activeCar ? world.activeCar.position : player.pos;
    for (const t of world.things) {
      if (!t.parent) continue;
      if (t.userData.type === 'crate') {
        t.rotation.y += dt * 1.7;
        if (!world.activeCar && t.position.distanceTo(player.pos) < 2.4) interact();
      }
      if (t.userData.type === 'npc') t.rotation.y += dt * 0.7;
    }
    if (state.mission === null && world.activeCar) {
      ring.visible = true;
      ring.position.set(ring.position.x || 80, 1.5, ring.position.z || -45);
      ring.rotation.z += dt;
      if (world.activeCar.position.distanceTo(ring.position) < 7) {
        state.cash += 100;
        state.xp += 25;
        level();
        popup('Waypoint bonus +$100');
        ring.position.x *= -1;
        ring.position.z *= -1;
        save();
      }
    } else {
      ring.visible = false;
    }
    if (playerOrigin.y < -20 || Math.abs(playerOrigin.x) > 5000 || Math.abs(playerOrigin.z) > 5000) unstuck();
  }

  async function init() {
    await load(state.activeSlot, false);
    wire();
    stream();
    hud();
    loadingScreen?.classList.add('hidden');
    popup('Move with WASD/joystick. E/Interact collects, drives, and buys.');
    requestAnimationFrame(loop);
  }

  let last = performance.now();
  let frames = 0;
  let fps = 60;
  let fpsAt = last;
  let saveAt = last;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++;
    if (now - fpsAt > 1000) {
      fps = frames;
      frames = 0;
      fpsAt = now;
      if (mobile && world.quality === 'auto' && fps < 35) {
        world.radius = 1;
        renderer.setPixelRatio(1);
      }
      hud(fps);
    }
    controls(dt);
    physics(dt);
    cam(dt);
    updateWorld(dt);
    map();
    renderer.render(scene, camera);
    if (now - saveAt > 25000) {
      saveAt = now;
      save();
    }
    requestAnimationFrame(loop);
  }

  init();
})();
