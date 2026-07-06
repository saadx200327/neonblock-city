(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const $ = (id) => document.getElementById(id);
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), vehicleHp: $('hud-vehicle-hp'), vehicleGas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  if (!window.THREE) {
    if (loading) loading.querySelector('.loading-sub').textContent = 'Three.js failed to load. Check network/CDN.';
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b18);
  scene.fog = new THREE.Fog(0x070b18, 42, 210);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 650);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.HemisphereLight(0x8bdcff, 0x182044, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(45, 70, 25);
  scene.add(sun);

  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x171b29, roughness: 0.8 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x0e2a28, roughness: 0.9 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x30364c, roughness: 0.7 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.35, emissive: 0x083b44 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffce47, roughness: 0.45 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x195b2b, roughness: 0.25 }),
    lot: new THREE.MeshStandardMaterial({ color: 0xff41b4, emissive: 0x2c0920, transparent: true, opacity: 0.7 }),
    ownedLot: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x12351c, transparent: true, opacity: 0.85 }),
    mission: new THREE.MeshStandardMaterial({ color: 0x9147ff, emissive: 0x25104a }),
    tire: new THREE.MeshStandardMaterial({ color: 0x090a10, roughness: 0.8 })
  };

  const state = {
    cash: 75, xp: 0, level: 1, wanted: 0, hp: 100, slot: 'slot1', online: false, debug: false,
    ownedLots: {}, collected: {}, completedMissions: {}, currentMission: null,
    lastSave: 0, lastCloud: 0, lastError: 'none'
  };

  const world = { chunkSize: 54, radius: 2, chunks: new Map(), npcs: [], vehicles: [], pickups: [], lots: [], missions: [] };
  const keys = new Set();
  const mobile = { x: 0, y: 0, sprint: false, look: false, lastX: 0, lastY: 0 };
  const input = { yaw: 0, pitch: -0.55, jumpQueued: false, interactQueued: false };

  const player = {
    pos: new THREE.Vector3(0, 1.1, 0), vel: new THREE.Vector3(), speed: 10, onGround: false, inVehicle: null,
    mesh: makeCharacter(materials.player)
  };
  scene.add(player.mesh);

  const missionDefs = [
    { id: 'courier', name: 'Neon Courier', target: new THREE.Vector3(64, 0, -42), reward: 180, xp: 80, text: 'Reach the purple marker across town.' },
    { id: 'pickup5', name: 'Collect 5 Energy Cubes', target: null, reward: 240, xp: 110, text: 'Collect five green cubes.' },
    { id: 'garage', name: 'Buy A Starter Lot', target: new THREE.Vector3(-62, 0, 58), reward: 300, xp: 130, text: 'Earn cash, then buy one pink lot.' }
  ];

  function makeCharacter(mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.6), mat);
    body.position.y = 1;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.78), mat);
    head.position.y = 2.15;
    g.add(body, head);
    return g;
  }

  function makeVehicle(x, z, color = 0x18a2ff) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, emissive: color === 0xff3366 ? 0x300010 : 0x061d30 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.7, 6), mat);
    base.position.y = 0.75;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.95, 2.7), mat);
    cab.position.set(0, 1.35, -0.55);
    for (const sx of [-1.7, 1.7]) for (const sz of [-2.1, 2.1]) {
      const tire = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.7, 1), materials.tire);
      tire.position.set(sx, 0.45, sz);
      g.add(tire);
    }
    g.add(base, cab);
    g.position.set(x, 0, z);
    g.userData = { hp: 100, gas: 100, speed: 0, heading: 0, owned: false };
    scene.add(g);
    return g;
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function seeded(cx, cz, n) { const s = Math.sin(cx * 127.1 + cz * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); }

  function createChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (world.chunks.has(key)) return;
    const group = new THREE.Group();
    const s = world.chunkSize;
    const ox = cx * s, oz = cz * s;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(s, 0.18, s), materials.grass);
    ground.position.set(ox, -0.1, oz);
    group.add(ground);
    const roadA = new THREE.Mesh(new THREE.BoxGeometry(s, 0.04, 10), materials.road);
    roadA.position.set(ox, 0.02, oz);
    const roadB = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, s), materials.road);
    roadB.position.set(ox, 0.03, oz);
    group.add(roadA, roadB);

    for (let i = 0; i < 6; i++) {
      const x = ox - 21 + seeded(cx, cz, i) * 42;
      const z = oz - 21 + seeded(cx, cz, i + 20) * 42;
      if (Math.abs(x - ox) < 8 || Math.abs(z - oz) < 8) continue;
      const h = 5 + seeded(cx, cz, i + 40) * 25;
      const b = new THREE.Mesh(new THREE.BoxGeometry(6 + seeded(cx, cz, i + 80) * 8, h, 6 + seeded(cx, cz, i + 100) * 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.56 + seeded(cx, cz, i + 7) * 0.18, 0.55, 0.26), roughness: 0.55, emissive: 0x020711 }));
      b.position.set(x, h / 2, z);
      group.add(b);
    }

    if ((cx + cz) % 2 === 0) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), materials.pickup);
      p.position.set(ox + 16, 0.9, oz - 18);
      p.userData = { id: `p-${key}`, value: 35 };
      if (!state.collected[p.userData.id]) { group.add(p); world.pickups.push(p); }
    }

    if ((Math.abs(cx) + Math.abs(cz)) % 3 === 1) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 8), state.ownedLots[`lot-${key}`] ? materials.ownedLot : materials.lot);
      lot.position.set(ox - 17, 0.2, oz + 17);
      lot.userData = { id: `lot-${key}`, price: 300 + 50 * (Math.abs(cx) + Math.abs(cz)) };
      group.add(lot); world.lots.push(lot);
    }

    if (seeded(cx, cz, 200) > 0.7 && world.vehicles.length < 24) world.vehicles.push(makeVehicle(ox + 9, oz + 12, seeded(cx, cz, 201) > 0.5 ? 0xff3366 : 0x17f3ff));
    if (seeded(cx, cz, 250) > 0.62 && world.npcs.length < 48) {
      const npc = makeCharacter(materials.npc);
      npc.position.set(ox - 12, 0, oz - 10);
      npc.userData = { homeX: npc.position.x, homeZ: npc.position.z, phase: seeded(cx, cz, 251) * 6.28 };
      scene.add(npc); world.npcs.push(npc);
    }

    scene.add(group);
    world.chunks.set(key, group);
  }

  function streamWorld() {
    const cx = Math.round(player.pos.x / world.chunkSize);
    const cz = Math.round(player.pos.z / world.chunkSize);
    for (let x = cx - world.radius; x <= cx + world.radius; x++) for (let z = cz - world.radius; z <= cz + world.radius; z++) createChunk(x, z);
    for (const [key, group] of world.chunks) {
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > world.radius + 1 || Math.abs(gz - cz) > world.radius + 1) {
        scene.remove(group); world.chunks.delete(key);
      }
    }
  }

  function nearest(list, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const obj of list) {
      if (!obj.parent && !scene.children.includes(obj)) continue;
      const d = obj.position.distanceToSquared(player.pos);
      if (d < bestD) { best = obj; bestD = d; }
    }
    return best;
  }

  function interact() {
    if (player.inVehicle) { exitVehicle(); return; }
    const car = nearest(world.vehicles, 5.5);
    if (car) { enterVehicle(car); return; }
    const lot = nearest(world.lots, 5);
    if (lot && !state.ownedLots[lot.userData.id]) {
      if (state.cash >= lot.userData.price) {
        state.cash -= lot.userData.price; state.ownedLots[lot.userData.id] = true; lot.material = materials.ownedLot; reward(`Bought lot -$${lot.userData.price}`); completeMission('garage');
      } else reward(`Need $${lot.userData.price} to buy this lot`);
      return;
    }
    if (!state.currentMission) startNextMission();
  }

  function enterVehicle(car) {
    player.inVehicle = car; player.mesh.visible = false; car.userData.owned = true; reward('Vehicle entered');
  }
  function exitVehicle() {
    const car = player.inVehicle; if (!car) return;
    const side = new THREE.Vector3(Math.sin(car.userData.heading + Math.PI / 2) * 3.5, 0, Math.cos(car.userData.heading + Math.PI / 2) * 3.5);
    player.pos.copy(car.position).add(side); player.pos.y = 1.1; player.mesh.visible = true; player.inVehicle = null;
  }

  function startNextMission() {
    const m = missionDefs.find((x) => !state.completedMissions[x.id]);
    if (!m) { reward('All missions complete. Free roam!'); return; }
    state.currentMission = { id: m.id, progress: 0 }; reward(`Mission: ${m.name}`);
  }
  function completeMission(id) {
    if (!state.currentMission || state.currentMission.id !== id || state.completedMissions[id]) return;
    const def = missionDefs.find((m) => m.id === id); if (!def) return;
    state.completedMissions[id] = true; state.currentMission = null; state.cash += def.reward; state.xp += def.xp; reward(`Mission complete +$${def.reward} +${def.xp}XP`);
  }

  function reward(text) {
    const box = $('reward-popup'); if (!box) return;
    box.textContent = text; box.classList.remove('hidden'); clearTimeout(reward.t); reward.t = setTimeout(() => box.classList.add('hidden'), 2200);
  }

  function updateMovement(dt) {
    let moveX = 0, moveZ = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) moveZ -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) moveZ += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;
    moveX += mobile.x; moveZ += mobile.y;

    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobile.sprint;
    if (player.inVehicle) {
      const car = player.inVehicle;
      if (moveZ !== 0 && car.userData.gas > 0) car.userData.speed += -moveZ * 18 * dt;
      car.userData.speed *= 0.985;
      car.userData.speed = Math.max(-12, Math.min(34, car.userData.speed));
      if (Math.abs(car.userData.speed) > 0.2 && car.userData.gas > 0) car.userData.gas = Math.max(0, car.userData.gas - Math.abs(car.userData.speed) * dt * 0.025);
      car.userData.heading -= moveX * dt * (car.userData.speed >= 0 ? 1 : -1) * 1.9;
      car.rotation.y = car.userData.heading;
      car.position.x += Math.sin(car.userData.heading) * car.userData.speed * dt;
      car.position.z += Math.cos(car.userData.heading) * car.userData.speed * dt;
      player.pos.copy(car.position).setY(1.1);
      return;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.05) {
      moveX /= len; moveZ /= len;
      const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
      const wx = moveX * cos - moveZ * sin;
      const wz = moveX * sin + moveZ * cos;
      const speed = player.speed * (sprint ? 1.55 : 1);
      player.vel.x = wx * speed; player.vel.z = wz * speed;
      player.mesh.rotation.y = Math.atan2(wx, wz);
    } else { player.vel.x *= 0.82; player.vel.z *= 0.82; }
    player.vel.y -= 28 * dt;
    if (input.jumpQueued && player.onGround) { player.vel.y = 10; player.onGround = false; }
    input.jumpQueued = false;
    player.pos.addScaledVector(player.vel, dt);
    if (player.pos.y < 1.1) { player.pos.y = 1.1; player.vel.y = 0; player.onGround = true; }
    player.mesh.position.copy(player.pos).setY(0);
  }

  function updatePickups() {
    for (const p of world.pickups) {
      if (state.collected[p.userData.id]) continue;
      p.rotation.y += 0.03; p.position.y = 0.9 + Math.sin(performance.now() * 0.004 + p.position.x) * 0.18;
      if (p.position.distanceTo(player.pos) < 2.2) {
        state.collected[p.userData.id] = true; state.cash += p.userData.value; state.xp += 20; p.parent?.remove(p); reward(`Energy cube +$${p.userData.value}`);
        if (state.currentMission?.id === 'pickup5') { state.currentMission.progress = (state.currentMission.progress || 0) + 1; if (state.currentMission.progress >= 5) completeMission('pickup5'); }
      }
    }
  }

  function updateNPCs(t) {
    for (const npc of world.npcs) {
      const u = npc.userData;
      npc.position.x = u.homeX + Math.sin(t * 0.001 + u.phase) * 4;
      npc.position.z = u.homeZ + Math.cos(t * 0.0013 + u.phase) * 4;
      npc.rotation.y += 0.01;
    }
  }

  function updateMission() {
    const active = state.currentMission && missionDefs.find((m) => m.id === state.currentMission.id);
    if (active?.target && player.pos.distanceTo(active.target) < 7) completeMission(active.id);
    if (state.xp >= state.level * 160) { state.xp -= state.level * 160; state.level++; state.cash += 100; reward(`Level ${state.level}! +$100`); }
  }

  function updateCamera(dt) {
    const target = player.inVehicle ? player.inVehicle.position : player.pos;
    const dist = player.inVehicle ? 18 : 12;
    const height = player.inVehicle ? 8 : 6;
    const desired = new THREE.Vector3(target.x + Math.sin(input.yaw) * dist, target.y + height, target.z + Math.cos(input.yaw) * dist);
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(target.x, target.y + 2, target.z);
  }

  function updateHUD(t) {
    const active = state.currentMission && missionDefs.find((m) => m.id === state.currentMission.id);
    if (hud.cash) hud.cash.textContent = `$${Math.floor(state.cash)}`;
    if (hud.xp) hud.xp.textContent = Math.floor(state.xp);
    if (hud.level) hud.level.textContent = state.level;
    if (hud.wanted) hud.wanted.textContent = state.wanted;
    if (hud.online) hud.online.textContent = state.online ? 'cloud ready' : 'local';
    if (hud.vehicle) hud.vehicle.textContent = player.inVehicle ? 'Neon car' : 'On foot';
    if (hud.vehicleHp) hud.vehicleHp.textContent = player.inVehicle ? Math.round(player.inVehicle.userData.hp) : '100';
    if (hud.vehicleGas) hud.vehicleGas.textContent = player.inVehicle ? Math.round(player.inVehicle.userData.gas) : '100';
    if (hud.mission) hud.mission.textContent = active ? `${active.name}${state.currentMission.progress ? ` ${state.currentMission.progress}/5` : ''}` : 'Press E / Interact';
    if (hud.fps) hud.fps.textContent = Math.round(fps);
    if (hud.pos) hud.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`;
    if (hud.chunks) hud.chunks.textContent = world.chunks.size;
    if (hud.npcs) hud.npcs.textContent = world.npcs.length;
    if (hud.activeVehicle) hud.activeVehicle.textContent = player.inVehicle ? 'active' : 'none';
    if (hud.saveSlot) hud.saveSlot.textContent = state.slot;
    if (hud.debugOnline) hud.debugOnline.textContent = state.online ? 'yes' : 'no';
    if (hud.lastError) hud.lastError.textContent = state.lastError;
  }

  function drawMinimap() {
    const c = $('minimap-canvas'); if (!c) return;
    const ctx = c.getContext('2d'), w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#07101fdd'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#17f3ff55'; ctx.strokeRect(1, 1, w - 2, h - 2);
    const scale = 0.8;
    function dot(x, z, color, r = 3) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(w / 2 + (x - player.pos.x) * scale, h / 2 + (z - player.pos.z) * scale, r, 0, Math.PI * 2); ctx.fill(); }
    for (const v of world.vehicles.slice(0, 24)) dot(v.position.x, v.position.z, '#18a2ff', 2);
    for (const l of world.lots) if (state.ownedLots[l.userData.id]) dot(l.position.x, l.position.z, '#5ef38c', 3);
    const active = state.currentMission && missionDefs.find((m) => m.id === state.currentMission.id);
    if (active?.target) dot(active.target.x, active.target.z, '#9147ff', 5);
    dot(player.pos.x, player.pos.z, '#ffffff', 4);
  }

  function saveGame(slot = state.slot) {
    state.slot = slot;
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, pos: player.pos.toArray(), ownedLots: state.ownedLots, collected: state.collected, completedMissions: state.completedMissions, currentMission: state.currentMission };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    state.lastSave = performance.now();
    if (window.NeonBlockCloud?.save) window.NeonBlockCloud.save(slot, data).then(() => { state.online = true; }).catch((e) => { state.lastError = e.message || 'cloud save failed'; });
    return data;
  }

  function loadGame(slot = state.slot) {
    state.slot = slot;
    const raw = localStorage.getItem(`neonblock:${slot}`); if (!raw) { reward('No local save yet'); return; }
    try {
      const data = JSON.parse(raw);
      Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, ownedLots: data.ownedLots || {}, collected: data.collected || {}, completedMissions: data.completedMissions || {}, currentMission: data.currentMission || null });
      if (Array.isArray(data.pos)) player.pos.fromArray(data.pos);
      reward(`Loaded ${slot}`);
    } catch (e) { state.lastError = e.message; reward('Save file broken'); }
  }

  function setupUI() {
    const pause = $('pause-overlay'), settings = $('settings-panel'), saves = $('save-panel');
    const showPause = (yes) => pause?.classList.toggle('hidden', !yes);
    $('btn-resume')?.addEventListener('click', () => showPause(false));
    $('btn-mobile-pause')?.addEventListener('click', () => showPause(true));
    $('btn-settings')?.addEventListener('click', () => settings?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => settings?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => saves?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => saves?.classList.toggle('hidden'));
    $('btn-close-save')?.addEventListener('click', () => saves?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { saveGame(b.dataset.slot); reward(`Saved ${b.dataset.slot}`); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { $('export-json').value = JSON.stringify(saveGame(), null, 2); });
    $('btn-import')?.addEventListener('click', () => { try { const data = JSON.parse($('export-json').value); localStorage.setItem(`neonblock:${state.slot}`, JSON.stringify(data)); loadGame(state.slot); } catch (e) { reward('Invalid JSON'); } });
    $('graphics-quality')?.addEventListener('change', (e) => { const v = e.target.value; renderer.setPixelRatio(v === 'high' ? Math.min(devicePixelRatio || 1, 2) : v === 'low' ? 0.85 : Math.min(devicePixelRatio || 1, 1.5)); });
  }

  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') input.jumpQueued = true; if (e.code === 'KeyE') input.interactQueued = true; if (e.code === 'Escape') $('pause-overlay')?.classList.toggle('hidden'); if (e.code === 'F3') { state.debug = !state.debug; $('debug-overlay')?.classList.toggle('is-visible', state.debug); } });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('pointermove', (e) => { if (e.buttons === 1 && e.target === canvas) { input.yaw -= e.movementX * 0.004; input.pitch = Math.max(-1.1, Math.min(-0.25, input.pitch - e.movementY * 0.002)); } });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

  function setupMobile() {
    const box = $('joystick-container'), stick = $('joystick-stick');
    if (box && stick) {
      const reset = () => { mobile.x = 0; mobile.y = 0; stick.style.transform = 'translate(0,0)'; };
      box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); moveJoy(e); });
      box.addEventListener('pointermove', moveJoy); box.addEventListener('pointerup', reset); box.addEventListener('pointercancel', reset);
      function moveJoy(e) { const r = box.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const len = Math.min(46, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); mobile.x = Math.cos(a) * len / 46; mobile.y = Math.sin(a) * len / 46; stick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`; }
    }
    $('btn-mobile-jump')?.addEventListener('pointerdown', () => input.jumpQueued = true);
    $('btn-mobile-interact')?.addEventListener('pointerdown', () => input.interactQueued = true);
    $('btn-mobile-unstuck')?.addEventListener('pointerdown', () => { player.pos.y = 3; player.pos.x += 3; reward('Unstuck'); });
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => mobile.sprint = true);
    $('btn-mobile-sprint')?.addEventListener('pointerup', () => mobile.sprint = false);
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.clientX > innerWidth * 0.35) { mobile.look = true; mobile.lastX = e.clientX; mobile.lastY = e.clientY; } });
    canvas.addEventListener('pointermove', (e) => { if (!mobile.look) return; input.yaw -= (e.clientX - mobile.lastX) * 0.006; mobile.lastX = e.clientX; mobile.lastY = e.clientY; });
    canvas.addEventListener('pointerup', () => mobile.look = false);
  }

  let last = performance.now(), fps = 60, acc = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; fps += ((1 / Math.max(dt, 0.001)) - fps) * 0.04; acc += dt;
    if (input.interactQueued) { input.interactQueued = false; interact(); }
    updateMovement(dt); streamWorld(); updatePickups(); updateNPCs(now); updateMission(); updateCamera(dt);
    if (acc > 0.12) { updateHUD(now); drawMinimap(); acc = 0; }
    if (now - state.lastSave > 30000) saveGame();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  setupUI(); setupMobile(); streamWorld(); loadGame('slot1'); startNextMission();
  if (loading) setTimeout(() => loading.classList.add('hidden'), 350);
  requestAnimationFrame(loop);
})();
