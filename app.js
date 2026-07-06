/* NeonBlock City - static Roblox-inspired open-world prototype */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const THREE_REF = window.THREE;
  const storageKey = 'neonblock-city-save-v2';
  const chunkSize = 90;
  const streamRadius = 2;
  const worldLimit = 900;
  const clock = new THREE_REF.Clock();

  if (!THREE_REF || !canvas) {
    document.body.innerHTML = '<main style="padding:2rem;color:white;background:#050814;min-height:100vh">NeonBlock City could not start. Three.js or the game canvas is missing.</main>';
    return;
  }

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const renderer = new THREE_REF.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !isTouch;
  renderer.outputColorSpace = THREE_REF.SRGBColorSpace;

  const scene = new THREE_REF.Scene();
  scene.background = new THREE_REF.Color(0x050814);
  scene.fog = new THREE_REF.Fog(0x050814, 100, 460);

  const camera = new THREE_REF.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 1200);
  const hemi = new THREE_REF.HemisphereLight(0x9ff7ff, 0x111122, 1.8);
  scene.add(hemi);
  const sun = new THREE_REF.DirectionalLight(0xffffff, 1.4);
  sun.position.set(80, 120, 60);
  sun.castShadow = !isTouch;
  scene.add(sun);

  const ground = new THREE_REF.Mesh(
    new THREE_REF.PlaneGeometry(worldLimit * 2, worldLimit * 2),
    new THREE_REF.MeshStandardMaterial({ color: 0x071124, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const mats = {
    road: new THREE_REF.MeshStandardMaterial({ color: 0x10172e, roughness: 0.8 }),
    lane: new THREE_REF.MeshBasicMaterial({ color: 0x17f3ff }),
    player: new THREE_REF.MeshStandardMaterial({ color: 0x3af5ff, roughness: 0.45, metalness: 0.2 }),
    npc: new THREE_REF.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.6 }),
    pickup: new THREE_REF.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x114422, roughness: 0.3 }),
    lot: new THREE_REF.MeshStandardMaterial({ color: 0x5b4dff, transparent: true, opacity: 0.72 }),
    owned: new THREE_REF.MeshStandardMaterial({ color: 0x29ff9a, transparent: true, opacity: 0.8 }),
    vehicle: new THREE_REF.MeshStandardMaterial({ color: 0xff3366, roughness: 0.35, metalness: 0.25 }),
    building: new THREE_REF.MeshStandardMaterial({ color: 0x1b2453, roughness: 0.72, metalness: 0.1 })
  };

  const state = {
    cash: 50,
    xp: 0,
    level: 1,
    wanted: 0,
    online: 'offline',
    slot: 'slot1',
    activeMission: null,
    missionProgress: {},
    ownedLots: {},
    picked: {},
    debug: false,
    lastError: 'none',
    quality: localStorage.getItem('neonblock-quality') || 'auto'
  };

  const player = {
    mesh: new THREE_REF.Group(),
    pos: new THREE_REF.Vector3(0, 1.05, 0),
    vel: new THREE_REF.Vector3(),
    yaw: 0,
    grounded: true,
    sprint: false,
    inVehicle: null,
    hp: 100,
    gas: 100
  };

  const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.4, 2.1, 1.4), mats.player);
  body.position.y = 1.05;
  body.castShadow = true;
  player.mesh.add(body);
  scene.add(player.mesh);

  const controls = { forward: false, back: false, left: false, right: false, jump: false, interact: false, unstuck: false, pause: false, lookX: 0, joyX: 0, joyY: 0 };
  const chunks = new Map();
  const interactables = [];
  const vehicles = [];
  const npcs = [];
  const pickups = [];
  const missions = [
    { id: 'delivery', name: 'Neon Delivery', goal: 4, reward: 140, xp: 80, hint: 'Collect green data cubes around downtown.' },
    { id: 'realestate', name: 'Block Investor', goal: 2, reward: 260, xp: 120, hint: 'Buy two purple ownership lots.' },
    { id: 'driver', name: 'Street Driver', goal: 1, reward: 100, xp: 60, hint: 'Enter a vehicle and drive across the city.' }
  ];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hash(x, z) { let n = x * 374761393 + z * 668265263; n = (n ^ (n >> 13)) * 1274126177; return (n ^ (n >> 16)) >>> 0; }
  function seeded(x, z, salt) { return (hash(x + salt * 11, z - salt * 17) % 10000) / 10000; }
  function chunkId(cx, cz) { return cx + ',' + cz; }
  function worldToChunk(v) { return Math.floor(v / chunkSize); }

  function makeBox(w, h, d, mat, x, y, z) {
    const m = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = !isTouch;
    m.receiveShadow = true;
    return m;
  }

  function addRoads(group, cx, cz) {
    const baseX = cx * chunkSize;
    const baseZ = cz * chunkSize;
    const roadA = makeBox(chunkSize, 0.04, 14, mats.road, baseX, 0.03, baseZ);
    const roadB = makeBox(14, 0.04, chunkSize, mats.road, baseX, 0.035, baseZ);
    group.add(roadA, roadB);
    for (let i = -36; i <= 36; i += 18) {
      group.add(makeBox(8, 0.05, 0.18, mats.lane, baseX + i, 0.08, baseZ));
      group.add(makeBox(0.18, 0.05, 8, mats.lane, baseX, 0.08, baseZ + i));
    }
  }

  function addChunk(cx, cz) {
    const id = chunkId(cx, cz);
    if (chunks.has(id)) return;
    const group = new THREE_REF.Group();
    group.userData.id = id;
    addRoads(group, cx, cz);
    const baseX = cx * chunkSize;
    const baseZ = cz * chunkSize;

    for (let i = 0; i < 8; i++) {
      const side = seeded(cx, cz, i) > 0.5 ? 1 : -1;
      const vertical = seeded(cx, cz, i + 20) > 0.5;
      const h = 8 + Math.floor(seeded(cx, cz, i + 40) * 34);
      const x = baseX + (vertical ? side * (24 + seeded(cx, cz, i + 2) * 24) : -36 + seeded(cx, cz, i + 3) * 72);
      const z = baseZ + (vertical ? -36 + seeded(cx, cz, i + 4) * 72 : side * (24 + seeded(cx, cz, i + 5) * 24));
      const b = makeBox(10 + seeded(cx, cz, i + 8) * 12, h, 10 + seeded(cx, cz, i + 9) * 12, mats.building, x, h / 2, z);
      group.add(b);
    }

    if (seeded(cx, cz, 100) > 0.45) addPickup(group, id, baseX + 18, baseZ - 18);
    if (seeded(cx, cz, 101) > 0.55) addLot(group, id, baseX - 26, baseZ + 26);
    if (seeded(cx, cz, 102) > 0.62) addVehicle(group, id, baseX + 8, baseZ + 24);
    if (seeded(cx, cz, 103) > 0.52) addNpc(group, id, baseX - 10, baseZ - 25);

    scene.add(group);
    chunks.set(id, group);
  }

  function removeChunk(id) {
    const group = chunks.get(id);
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    scene.remove(group);
    chunks.delete(id);
    for (let list of [interactables, vehicles, npcs, pickups]) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].chunkId === id) list.splice(i, 1);
    }
  }

  function streamWorld() {
    const pcx = worldToChunk(player.pos.x);
    const pcz = worldToChunk(player.pos.z);
    const needed = new Set();
    for (let x = pcx - streamRadius; x <= pcx + streamRadius; x++) {
      for (let z = pcz - streamRadius; z <= pcz + streamRadius; z++) {
        needed.add(chunkId(x, z));
        addChunk(x, z);
      }
    }
    for (const id of Array.from(chunks.keys())) if (!needed.has(id)) removeChunk(id);
  }

  function addPickup(group, chunkIdValue, x, z) {
    const key = 'p:' + chunkIdValue;
    if (state.picked[key]) return;
    const mesh = new THREE_REF.Mesh(new THREE_REF.OctahedronGeometry(1.5), mats.pickup);
    mesh.position.set(x, 2.2, z);
    group.add(mesh);
    const item = { type: 'pickup', key, chunkId: chunkIdValue, mesh, radius: 4 };
    interactables.push(item); pickups.push(item);
  }

  function addLot(group, chunkIdValue, x, z) {
    const key = 'l:' + chunkIdValue;
    const mesh = makeBox(14, 0.2, 14, state.ownedLots[key] ? mats.owned : mats.lot, x, 0.16, z);
    group.add(mesh);
    interactables.push({ type: 'lot', key, chunkId: chunkIdValue, mesh, radius: 7, price: 120 });
  }

  function addVehicle(group, chunkIdValue, x, z) {
    const mesh = new THREE_REF.Group();
    const car = makeBox(4.6, 1.2, 7, mats.vehicle, 0, 0.75, 0);
    const cabin = makeBox(3.2, 1.15, 3, mats.player, 0, 1.75, -0.4);
    mesh.add(car, cabin);
    mesh.position.set(x, 0, z);
    group.add(mesh);
    const v = { type: 'vehicle', chunkId: chunkIdValue, mesh, radius: 6, speed: 0, hp: 100, gas: 100, yaw: 0 };
    interactables.push(v); vehicles.push(v);
  }

  function addNpc(group, chunkIdValue, x, z) {
    const mesh = makeBox(1.3, 2, 1.3, mats.npc, x, 1, z);
    group.add(mesh);
    const tips = ['Tip: Press E near cars to drive.', 'Tip: Buy lots to complete ownership missions.', 'Tip: Use F3 for debug, Esc to pause.', 'Tip: Saves are local unless Firebase is configured.'];
    const n = { type: 'npc', chunkId: chunkIdValue, mesh, radius: 4, tip: tips[Math.floor(seeded(x, z, 7) * tips.length)] };
    interactables.push(n); npcs.push(n);
  }

  function updateMovement(dt) {
    const moveX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0) + controls.joyX;
    const moveY = (controls.forward ? 1 : 0) - (controls.back ? 1 : 0) + -controls.joyY;
    player.yaw -= controls.lookX * dt * 2.3;
    controls.lookX = 0;

    const forward = new THREE_REF.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const right = new THREE_REF.Vector3(forward.z, 0, -forward.x);
    const dir = new THREE_REF.Vector3().addScaledVector(forward, moveY).addScaledVector(right, moveX);
    if (dir.lengthSq() > 1) dir.normalize();

    if (player.inVehicle) {
      const v = player.inVehicle;
      v.yaw = player.yaw;
      v.speed += moveY * dt * 34;
      v.speed *= Math.pow(0.05, dt);
      v.speed = clamp(v.speed, -18, player.sprint ? 50 : 32);
      if (Math.abs(v.speed) > 1) v.gas = clamp(v.gas - dt * Math.abs(v.speed) * 0.035, 0, 100);
      if (v.gas <= 0) v.speed *= 0.96;
      v.mesh.position.addScaledVector(forward, v.speed * dt);
      v.mesh.rotation.y = v.yaw;
      player.pos.copy(v.mesh.position).add(new THREE_REF.Vector3(0, 1.2, 0));
      player.gas = v.gas; player.hp = v.hp;
      player.mesh.visible = false;
    } else {
      const speed = player.sprint ? 18 : 10;
      player.vel.x = dir.x * speed;
      player.vel.z = dir.z * speed;
      if (controls.jump && player.grounded) { player.vel.y = 10.5; player.grounded = false; }
      player.vel.y -= 28 * dt;
      player.pos.addScaledVector(player.vel, dt);
      if (player.pos.y < 1.05) { player.pos.y = 1.05; player.vel.y = 0; player.grounded = true; }
      player.pos.x = clamp(player.pos.x, -worldLimit, worldLimit);
      player.pos.z = clamp(player.pos.z, -worldLimit, worldLimit);
      player.mesh.position.copy(player.pos).setY(0);
      player.mesh.rotation.y = player.yaw;
      player.mesh.visible = true;
    }
    controls.jump = false;
    if (controls.unstuck) { player.pos.set(0, 1.05, 0); if (player.inVehicle) player.inVehicle = null; controls.unstuck = false; toast('Unstuck: returned downtown'); }
  }

  function interact() {
    const pos = player.inVehicle ? player.inVehicle.mesh.position : player.pos;
    let best = null, bestD = 999;
    for (const item of interactables) {
      const d = item.mesh.position.distanceTo(pos);
      if (d < item.radius && d < bestD) { best = item; bestD = d; }
    }
    if (!best) { toast('Nothing nearby to interact with'); return; }
    if (best.type === 'pickup') {
      state.picked[best.key] = true;
      state.cash += 25; state.xp += 15;
      best.mesh.visible = false;
      progressMission('delivery', 1);
      toast('+$25 data cube collected');
    } else if (best.type === 'lot') {
      if (state.ownedLots[best.key]) { toast('You already own this lot'); return; }
      if (state.cash < best.price) { toast('Need $' + best.price + ' to buy this lot'); return; }
      state.cash -= best.price;
      state.ownedLots[best.key] = true;
      best.mesh.material = mats.owned;
      progressMission('realestate', 1);
      toast('Lot purchased');
    } else if (best.type === 'vehicle') {
      if (player.inVehicle === best) {
        player.inVehicle = null; player.pos.copy(best.mesh.position).add(new THREE_REF.Vector3(4, 1.05, 0)); toast('Exited vehicle');
      } else {
        player.inVehicle = best; best.gas = best.gas || 100; progressMission('driver', 1); toast('Entered vehicle');
      }
    } else if (best.type === 'npc') {
      toast(best.tip);
    }
    saveThrottled();
  }

  function progressMission(id, amount) {
    const m = missions.find((x) => x.id === id);
    if (!m) return;
    state.missionProgress[id] = clamp((state.missionProgress[id] || 0) + amount, 0, m.goal);
    if (state.missionProgress[id] >= m.goal && !state.missionProgress[id + ':done']) {
      state.missionProgress[id + ':done'] = true;
      state.cash += m.reward; state.xp += m.xp;
      toast('Mission complete: ' + m.name + ' +$' + m.reward);
    }
  }

  function updateCamera(dt) {
    const target = player.inVehicle ? player.inVehicle.mesh.position : player.pos;
    const dist = player.inVehicle ? 22 : 16;
    const height = player.inVehicle ? 12 : 9;
    const camTarget = new THREE_REF.Vector3(
      target.x - Math.sin(player.yaw) * dist,
      target.y + height,
      target.z - Math.cos(player.yaw) * dist
    );
    camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
    camera.lookAt(target.x, target.y + 2.2, target.z);
  }

  function updateHud() {
    state.level = 1 + Math.floor(state.xp / 100);
    const set = (id, val) => { const e = $(id); if (e) e.textContent = val; };
    set('hud-cash', '$' + Math.floor(state.cash)); set('hud-xp', Math.floor(state.xp)); set('hud-level', state.level);
    set('hud-wanted', state.wanted); set('hud-online', state.online);
    set('hud-vehicle', player.inVehicle ? 'Cruiser' : 'On foot'); set('hud-vehicle-hp', Math.floor(player.hp)); set('hud-vehicle-gas', Math.floor(player.gas));
    const active = missions.find((m) => !state.missionProgress[m.id + ':done']);
    if (active) set('hud-mission', active.name + ' ' + (state.missionProgress[active.id] || 0) + '/' + active.goal); else set('hud-mission', 'All complete');
    set('debug-pos', [player.pos.x, player.pos.y, player.pos.z].map((n) => n.toFixed(1)).join(','));
    set('debug-chunks', chunks.size); set('debug-npcs', npcs.length); set('debug-active-vehicle', player.inVehicle ? 'yes' : 'none'); set('debug-save-slot', state.slot); set('debug-online', state.online); set('debug-last-error', state.lastError);
    const dbg = $('debug-overlay'); if (dbg) dbg.style.display = state.debug ? 'block' : 'none';
  }

  function updateMinimap() {
    const mini = $('minimap-canvas'); if (!mini) return;
    const ctx = mini.getContext('2d'); const w = mini.width; const h = mini.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#071124'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#17f3ff55'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 28, 0); ctx.lineTo(w / 2 + i * 28, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, h / 2 + i * 28); ctx.lineTo(w, h / 2 + i * 28); ctx.stroke(); }
    function dot(x, z, color, r) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(w / 2 + (x - player.pos.x) / 4, h / 2 + (z - player.pos.z) / 4, r, 0, Math.PI * 2); ctx.fill(); }
    pickups.forEach((p) => !state.picked[p.key] && dot(p.mesh.position.x, p.mesh.position.z, '#5ef38c', 2));
    vehicles.forEach((v) => dot(v.mesh.position.x, v.mesh.position.z, '#ff3366', 2));
    Object.keys(state.ownedLots).forEach((key) => { const parts = key.slice(2).split(',').map(Number); dot(parts[0] * chunkSize - 26, parts[1] * chunkSize + 26, '#29ff9a', 3); });
    dot(player.pos.x, player.pos.z, '#ffffff', 4);
  }

  let lastSave = 0;
  function saveGame(slot) {
    state.slot = slot || state.slot || 'slot1';
    const payload = { version: 2, savedAt: new Date().toISOString(), state, player: { pos: player.pos.toArray(), yaw: player.yaw, hp: player.hp, gas: player.gas } };
    localStorage.setItem(storageKey + ':' + state.slot, JSON.stringify(payload));
    localStorage.setItem(storageKey + ':last', state.slot);
    if (window.NeonBlockCloud && window.NeonBlockCloud.save) window.NeonBlockCloud.save(payload).then(() => { state.online = 'cloud saved'; }).catch((e) => { state.online = 'offline'; state.lastError = e.message || 'cloud save failed'; });
    lastSave = performance.now();
  }
  function saveThrottled() { if (performance.now() - lastSave > 4500) saveGame(); }
  function loadGame(slot) {
    const name = slot || localStorage.getItem(storageKey + ':last') || state.slot;
    const raw = localStorage.getItem(storageKey + ':' + name); if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data.state || {}); state.slot = name;
      if (data.player && data.player.pos) player.pos.fromArray(data.player.pos);
      player.yaw = data.player?.yaw || 0; player.hp = data.player?.hp || 100; player.gas = data.player?.gas || 100;
      streamWorld(); toast('Loaded ' + name); return true;
    } catch (e) { state.lastError = e.message; return false; }
  }

  function toast(msg) {
    const box = $('reward-popup'); if (!box) return;
    box.textContent = msg; box.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => box.classList.add('hidden'), 2100);
  }

  function togglePause(force) { const p = $('pause-overlay'); if (!p) return; p.classList.toggle('hidden', force === undefined ? !p.classList.contains('hidden') : !force); }
  function showPanel(id) { ['settings-panel', 'mission-board', 'save-panel'].forEach((x) => $(x)?.classList.add('hidden')); $(id)?.classList.remove('hidden'); }
  function fillMissions() {
    const list = $('mission-list'); if (!list) return; list.innerHTML = '';
    missions.forEach((m) => { const li = document.createElement('li'); li.textContent = `${m.name}: ${state.missionProgress[m.id] || 0}/${m.goal} - ${m.hint}`; list.appendChild(li); });
  }

  function bindControls() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') controls.forward = true;
      if (k === 's' || k === 'arrowdown') controls.back = true;
      if (k === 'a' || k === 'arrowleft') controls.left = true;
      if (k === 'd' || k === 'arrowright') controls.right = true;
      if (k === ' ') controls.jump = true;
      if (k === 'shift') player.sprint = true;
      if (k === 'e') interact();
      if (k === 'r') controls.unstuck = true;
      if (k === 'escape') togglePause();
      if (k === 'f3') { state.debug = !state.debug; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') controls.forward = false;
      if (k === 's' || k === 'arrowdown') controls.back = false;
      if (k === 'a' || k === 'arrowleft') controls.left = false;
      if (k === 'd' || k === 'arrowright') controls.right = false;
      if (k === 'shift') player.sprint = false;
    });
    let dragging = false, lastX = 0;
    canvas.addEventListener('pointerdown', (e) => { if (e.target === canvas) { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); } });
    canvas.addEventListener('pointermove', (e) => { if (dragging) { controls.lookX += (e.clientX - lastX) * 0.008; lastX = e.clientX; } });
    canvas.addEventListener('pointerup', () => { dragging = false; });

    const joy = $('joystick-container'), stick = $('joystick-stick');
    let joyId = null;
    function joyMove(e) {
      if (joyId !== e.pointerId) return; const rect = joy.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2); const dy = e.clientY - (rect.top + rect.height / 2); const max = rect.width * 0.34;
      controls.joyX = clamp(dx / max, -1, 1); controls.joyY = clamp(dy / max, -1, 1);
      stick.style.transform = `translate(${controls.joyX * max}px, ${controls.joyY * max}px)`;
    }
    joy?.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
    joy?.addEventListener('pointermove', joyMove);
    joy?.addEventListener('pointerup', () => { joyId = null; controls.joyX = controls.joyY = 0; stick.style.transform = ''; });

    $('btn-mobile-jump')?.addEventListener('click', () => controls.jump = true);
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => player.sprint = true);
    $('btn-mobile-sprint')?.addEventListener('pointerup', () => player.sprint = false);
    $('btn-mobile-interact')?.addEventListener('click', interact);
    $('btn-mobile-unstuck')?.addEventListener('click', () => controls.unstuck = true);
    $('btn-mobile-pause')?.addEventListener('click', () => togglePause(true));
    $('btn-resume')?.addEventListener('click', () => togglePause(false));
    $('btn-settings')?.addEventListener('click', () => showPanel('settings-panel'));
    $('btn-save')?.addEventListener('click', () => showPanel('save-panel'));
    $('btn-load')?.addEventListener('click', () => { showPanel('save-panel'); loadGame(); });
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', () => $('mission-board')?.classList.add('hidden'));
    $('graphics-quality')?.addEventListener('change', (e) => { state.quality = e.target.value; localStorage.setItem('neonblock-quality', state.quality); applyQuality(); });
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { saveGame(b.dataset.slot); toast('Saved ' + b.dataset.slot); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { saveGame(); $('export-json').value = localStorage.getItem(storageKey + ':' + state.slot) || ''; });
    $('btn-import')?.addEventListener('click', () => { try { const data = JSON.parse($('export-json').value); localStorage.setItem(storageKey + ':' + state.slot, JSON.stringify(data)); loadGame(state.slot); } catch (e) { toast('Import failed'); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  }

  function applyQuality() {
    const low = state.quality === 'low' || (state.quality === 'auto' && isTouch);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.1 : 2));
    renderer.shadowMap.enabled = !low;
    scene.fog.far = low ? 330 : 460;
  }

  let fpsAcc = 0, fpsFrames = 0, fpsTime = 0, streamTimer = 0, miniTimer = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    updateMovement(dt); updateCamera(dt);
    streamTimer += dt; miniTimer += dt;
    if (streamTimer > 0.35) { streamWorld(); streamTimer = 0; }
    if (miniTimer > 0.18) { updateMinimap(); updateHud(); miniTimer = 0; }
    for (const p of pickups) p.mesh.rotation.y += dt * 2.3;
    renderer.render(scene, camera);
    fpsAcc += dt; fpsFrames++; fpsTime += dt;
    if (fpsTime > 1) { $('debug-fps') && ($('debug-fps').textContent = Math.round(fpsFrames / fpsAcc)); fpsAcc = 0; fpsFrames = 0; fpsTime = 0; }
    saveThrottled();
  }

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  window.addEventListener('error', (e) => { state.lastError = e.message || 'runtime error'; updateHud(); });

  bindControls(); applyQuality(); streamWorld(); fillMissions(); loadGame(); updateHud(); updateMinimap();
  $('loading-screen')?.classList.add('hidden');
  toast('WASD/joystick to move, E/interact to play');
  loop();
})();
