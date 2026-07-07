(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const minimap = $('minimap-canvas');
  const mini = minimap ? minimap.getContext('2d') : null;
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), error: $('debug-last-error'), reward: $('reward-popup'), arrow: $('waypoint-arrow')
  };

  const saveKey = 'neonblock-city-save-v2';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (seed) => {
    let t = seed + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, slot: 'slot1', lastSave: 0,
    quality: localStorage.getItem('neonblock-quality') || 'auto',
    keys: new Set(), joy: { x: 0, y: 0 }, sprintHeld: false,
    player: { x: 0, z: 0, y: 0, vy: 0, yaw: 0, speed: 18, onGround: true, inVehicle: null },
    chunks: new Map(), vehicles: [], crates: [], lots: [], npcs: [], particles: [],
    mission: null,
    missions: [
      { id: 'crate-run', name: 'Crate Run', text: 'Collect 6 neon crates', target: 6, reward: 450, xp: 120 },
      { id: 'driver', name: 'Night Driver', text: 'Drive through 4 checkpoints', target: 4, reward: 700, xp: 160 },
      { id: 'owner', name: 'First Property', text: 'Buy one city lot', target: 1, reward: 300, xp: 100 }
    ],
    missionProgress: 0,
    checkpoints: [],
    ownedLots: new Set(),
    cloud: window.NeonBlockCloud || null
  };

  if (!window.THREE) {
    if (hud.error) hud.error.textContent = 'Three.js failed to load';
    if (loading) loading.querySelector('.loading-sub').textContent = 'Three.js failed to load. Check network.';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 60, 260);

  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 600);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);

  const hemi = new THREE.HemisphereLight(0x87eaff, 0x080816, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(40, 80, 30);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x12172d, roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x071c22, roughness: 0.85 }),
    player: new THREE.MeshStandardMaterial({ color: 0x19f3ff, emissive: 0x06343a }),
    crate: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x443000 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3cac, emissive: 0x330018 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xbdb2ff, emissive: 0x201449 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x102810, transparent: true, opacity: 0.45 }),
    checkpoint: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x005566, transparent: true, opacity: 0.5 })
  };

  const playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1.3), mats.player);
  body.position.y = 2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 1.15), mats.player);
  head.position.y = 4.1;
  playerMesh.add(body, head);
  scene.add(playerMesh);

  const makeTextSprite = (text) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(5,8,20,.72)'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#17f3ff'; ctx.font = '24px system-ui'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 40);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    spr.scale.set(12, 3, 1);
    return spr;
  };

  function setHud() {
    const p = state.player;
    if (hud.cash) hud.cash.textContent = '$' + Math.floor(state.cash);
    if (hud.xp) hud.xp.textContent = Math.floor(state.xp);
    if (hud.level) hud.level.textContent = state.level;
    if (hud.wanted) hud.wanted.textContent = state.wanted;
    if (hud.vehicle) hud.vehicle.textContent = p.inVehicle ? 'Neon Speeder' : 'On foot';
    if (hud.hp) hud.hp.textContent = p.inVehicle ? Math.floor(p.inVehicle.hp) : 100;
    if (hud.gas) hud.gas.textContent = p.inVehicle ? Math.floor(p.inVehicle.gas) : 100;
    if (hud.mission) hud.mission.textContent = state.mission ? `${state.mission.name} ${state.missionProgress}/${state.mission.target}` : 'None';
    if (hud.chunks) hud.chunks.textContent = state.chunks.size;
    if (hud.npcs) hud.npcs.textContent = state.npcs.length;
    if (hud.activeVehicle) hud.activeVehicle.textContent = p.inVehicle ? 'active' : 'none';
    if (hud.slot) hud.slot.textContent = state.slot;
    if (hud.pos) hud.pos.textContent = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
    if (hud.online) hud.online.textContent = state.cloud ? 'cloud optional' : 'offline';
    if (hud.onlineDebug) hud.onlineDebug.textContent = state.cloud ? 'adapter detected' : 'offline';
  }

  function reward(text) {
    if (!hud.reward) return;
    hud.reward.textContent = text;
    hud.reward.classList.remove('hidden');
    clearTimeout(reward._t);
    reward._t = setTimeout(() => hud.reward.classList.add('hidden'), 1900);
  }

  function addBuilding(group, x, z, w, h, d, seed) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.55 + rand(seed) * 0.18, 0.75, 0.3 + rand(seed + 1) * 0.18),
      emissive: new THREE.Color().setHSL(0.55 + rand(seed + 2) * 0.25, 0.8, 0.08)
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    group.add(b);
    const sign = makeTextSprite(rand(seed + 3) > .5 ? 'SHOP' : 'QUEST');
    sign.position.set(x, h + 2.5, z + d / 2 + .2);
    group.add(sign);
  }

  function spawnCrate(x, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mats.crate);
    mesh.position.set(x, 1, z);
    scene.add(mesh);
    state.crates.push({ x, z, mesh, taken: false });
  }

  function spawnVehicle(x, z) {
    const g = new THREE.Group();
    const car = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 7), mats.car);
    car.position.y = 1;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 3.4), new THREE.MeshStandardMaterial({ color: 0x141a3b, emissive: 0x070a22 }));
    cabin.position.set(0, 2, -.4);
    g.add(car, cabin);
    g.position.set(x, 0, z);
    scene.add(g);
    state.vehicles.push({ x, z, yaw: 0, speed: 0, hp: 100, gas: 100, mesh: g });
  }

  function spawnNpc(x, z, text) {
    const g = new THREE.Group();
    const n = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 1.4), mats.npc);
    n.position.y = 1.4;
    const label = makeTextSprite(text);
    label.position.y = 4.1;
    g.add(n, label);
    g.position.set(x, 0, z);
    scene.add(g);
    state.npcs.push({ x, z, text, mesh: g });
  }

  function spawnLot(x, z, price) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, .25, 10), mats.lot);
    mesh.position.set(x, .15, z);
    scene.add(mesh);
    const label = makeTextSprite(`LOT $${price}`);
    label.position.set(x, 4, z);
    scene.add(label);
    state.lots.push({ x, z, price, mesh, label, id: `${Math.round(x)}:${Math.round(z)}` });
  }

  function createChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (state.chunks.has(key)) return;
    const group = new THREE.Group();
    const size = 64;
    group.position.set(cx * size, 0, cz * size);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, .2, size), mats.grass);
    ground.position.y = -0.1;
    group.add(ground);
    const roadA = new THREE.Mesh(new THREE.BoxGeometry(size, .06, 8), mats.road);
    roadA.position.y = 0.01;
    const roadB = new THREE.Mesh(new THREE.BoxGeometry(8, .06, size), mats.road);
    roadB.position.y = 0.02;
    group.add(roadA, roadB);
    for (let i = 0; i < 5; i++) {
      const s = cx * 997 + cz * 353 + i * 19;
      const x = -25 + rand(s) * 50;
      const z = -25 + rand(s + 7) * 50;
      if (Math.abs(x) < 8 || Math.abs(z) < 8) continue;
      addBuilding(group, x, z, 8 + rand(s + 1) * 10, 8 + rand(s + 2) * 25, 8 + rand(s + 3) * 10, s);
    }
    scene.add(group);
    state.chunks.set(key, group);
    const seed = cx * 131 + cz * 911;
    if (rand(seed) > .67) spawnCrate(cx * size - 18 + rand(seed + 1) * 36, cz * size - 18 + rand(seed + 2) * 36);
    if (rand(seed + 3) > .84) spawnVehicle(cx * size - 18 + rand(seed + 4) * 36, cz * size - 18 + rand(seed + 5) * 36);
    if (rand(seed + 6) > .88) spawnLot(cx * size - 18 + rand(seed + 7) * 36, cz * size - 18 + rand(seed + 8) * 36, 900 + Math.floor(rand(seed + 9) * 800));
    if (rand(seed + 10) > .9) spawnNpc(cx * size - 18 + rand(seed + 11) * 36, cz * size - 18 + rand(seed + 12) * 36, 'Press E');
  }

  function streamWorld() {
    const cx = Math.round(state.player.x / 64), cz = Math.round(state.player.z / 64);
    const radius = state.quality === 'low' ? 1 : 2;
    for (let x = cx - radius; x <= cx + radius; x++) for (let z = cz - radius; z <= cz + radius; z++) createChunk(x, z);
    for (const [key, group] of state.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - cx) > radius + 1 || Math.abs(z - cz) > radius + 1) {
        scene.remove(group);
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        state.chunks.delete(key);
      }
    }
  }

  function nearest(list, dist = 8) {
    let best = null, bd = dist;
    for (const item of list) {
      const d = Math.hypot(item.x - state.player.x, item.z - state.player.z);
      if (d < bd) { bd = d; best = item; }
    }
    return best;
  }

  function startMission(id) {
    state.mission = state.missions.find(m => m.id === id) || state.missions[0];
    state.missionProgress = 0;
    state.checkpoints.forEach(c => scene.remove(c.mesh));
    state.checkpoints = [];
    if (state.mission.id === 'driver') {
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(5, .35, 8, 24), mats.checkpoint);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(35 + i * 45, 5, i % 2 ? 35 : -35);
        scene.add(mesh);
        state.checkpoints.push({ x: mesh.position.x, z: mesh.position.z, mesh, done: false });
      }
    }
    reward('Mission started: ' + state.mission.name);
    closeMenus();
  }

  function completeProgress(amount = 1) {
    if (!state.mission) return;
    state.missionProgress += amount;
    if (state.missionProgress >= state.mission.target) {
      state.cash += state.mission.reward;
      state.xp += state.mission.xp;
      while (state.xp >= state.level * 250) { state.xp -= state.level * 250; state.level++; }
      reward(`Mission complete +$${state.mission.reward}`);
      state.mission = null; state.missionProgress = 0;
    }
  }

  function interact() {
    const v = nearest(state.vehicles, 7);
    if (state.player.inVehicle) { state.player.inVehicle = null; reward('Exited vehicle'); return; }
    if (v) { state.player.inVehicle = v; reward('Entered Neon Speeder'); return; }
    const lot = nearest(state.lots.filter(l => !state.ownedLots.has(l.id)), 8);
    if (lot) {
      if (state.cash >= lot.price) {
        state.cash -= lot.price; state.ownedLots.add(lot.id); lot.mesh.material.opacity = .85; reward('Lot purchased');
        if (state.mission?.id === 'owner') completeProgress(1);
      } else reward('Need more cash for this lot');
      return;
    }
    const npc = nearest(state.npcs, 7);
    if (npc) { openMissionBoard(); reward('NPC opened mission board'); return; }
    openMissionBoard();
  }

  function updatePlayer(dt) {
    const p = state.player;
    const forward = (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0) - (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - state.joy.y;
    const side = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0) + state.joy.x;
    const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.sprintHeld;
    if (p.inVehicle) {
      const car = p.inVehicle;
      car.yaw -= side * dt * 2.1;
      car.speed += forward * dt * 42;
      car.speed *= 0.965;
      car.speed = clamp(car.speed, -22, sprint ? 52 : 36);
      if (Math.abs(car.speed) > 1) car.gas = Math.max(0, car.gas - dt * Math.abs(car.speed) * .035);
      if (car.gas <= 0) car.speed *= .94;
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.yaw;
      p.x = car.x; p.z = car.z - 3; p.y = 0; playerMesh.visible = false;
    } else {
      playerMesh.visible = true;
      const len = Math.hypot(forward, side);
      if (len > .05) {
        const spd = (sprint ? 30 : 18) * (state.quality === 'low' ? .95 : 1);
        p.x += (side / len) * spd * dt;
        p.z += (forward / len) * spd * dt;
        p.yaw = Math.atan2(side, forward);
      }
      if (!p.onGround) { p.vy -= 36 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; } }
      playerMesh.position.set(p.x, p.y, p.z); playerMesh.rotation.y = p.yaw;
    }
  }

  function jump() {
    const p = state.player;
    if (!p.inVehicle && p.onGround) { p.vy = 15; p.onGround = false; }
  }

  function updateCollectibles(dt) {
    for (const c of state.crates) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y = 1 + Math.sin(performance.now() / 300 + c.x) * .25;
      if (Math.hypot(c.x - state.player.x, c.z - state.player.z) < 4) {
        c.taken = true; scene.remove(c.mesh); state.cash += 55; state.xp += 12; reward('Crate +$55');
        if (state.mission?.id === 'crate-run') completeProgress(1);
      }
    }
    if (state.mission?.id === 'driver') {
      for (const cp of state.checkpoints) {
        cp.mesh.rotation.z += dt;
        if (!cp.done && state.player.inVehicle && Math.hypot(cp.x - state.player.x, cp.z - state.player.z) < 8) {
          cp.done = true; cp.mesh.visible = false; completeProgress(1); reward('Checkpoint!');
        }
      }
    }
  }

  function updateCamera(dt) {
    const p = state.player;
    const target = new THREE.Vector3(p.x, p.y + 2.5, p.z);
    const camDist = p.inVehicle ? 24 : 15;
    const camHeight = p.inVehicle ? 13 : 10;
    const yaw = p.inVehicle ? p.inVehicle.yaw : p.yaw;
    const desired = new THREE.Vector3(p.x - Math.sin(yaw) * camDist, p.y + camHeight, p.z - Math.cos(yaw) * camDist);
    camera.position.lerp(desired, 1 - Math.pow(.001, dt));
    camera.lookAt(target);
  }

  function drawMinimap() {
    if (!mini) return;
    mini.clearRect(0, 0, 160, 160);
    mini.fillStyle = '#050814'; mini.fillRect(0, 0, 160, 160);
    mini.strokeStyle = '#17f3ff55'; mini.strokeRect(1, 1, 158, 158);
    const px = state.player.x, pz = state.player.z;
    const draw = (x, z, color, r) => { mini.fillStyle = color; mini.beginPath(); mini.arc(80 + (x - px) * .45, 80 + (z - pz) * .45, r, 0, Math.PI * 2); mini.fill(); };
    state.crates.filter(c => !c.taken).slice(-80).forEach(c => draw(c.x, c.z, '#ffd166', 2));
    state.vehicles.slice(-40).forEach(v => draw(v.x, v.z, '#ff3cac', 2.5));
    state.lots.slice(-40).forEach(l => draw(l.x, l.z, state.ownedLots.has(l.id) ? '#5ef38c' : '#17f3ff', 2));
    state.checkpoints.filter(c => !c.done).forEach(c => draw(c.x, c.z, '#17f3ff', 4));
    draw(px, pz, '#ffffff', 4);
  }

  function save(slot = state.slot) {
    const data = { v: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, slot, player: state.player, ownedLots: [...state.ownedLots], quality: state.quality };
    localStorage.setItem(`${saveKey}:${slot}`, JSON.stringify(data));
    localStorage.setItem(saveKey, JSON.stringify(data));
    state.lastSave = performance.now();
    if (state.cloud?.save) state.cloud.save(slot, data).catch(e => { if (hud.error) hud.error.textContent = e.message; });
    reward('Saved ' + slot);
    return data;
  }

  function load(slot = state.slot) {
    const raw = localStorage.getItem(`${saveKey}:${slot}`) || localStorage.getItem(saveKey);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, quality: data.quality || state.quality });
      Object.assign(state.player, data.player || {}); state.player.inVehicle = null;
      state.ownedLots = new Set(data.ownedLots || []);
      reward('Loaded ' + slot);
      return true;
    } catch (e) { if (hud.error) hud.error.textContent = e.message; return false; }
  }

  function closeMenus() { ['pause-overlay', 'settings-panel', 'mission-board', 'save-panel'].forEach(id => $(id)?.classList.add('hidden')); }
  function openPause() { $('pause-overlay')?.classList.remove('hidden'); }
  function openMissionBoard() {
    const board = $('mission-board'), list = $('mission-list'), pause = $('pause-overlay');
    if (!board || !list || !pause) return;
    list.innerHTML = '';
    state.missions.forEach(m => {
      const li = document.createElement('li');
      li.innerHTML = `<button data-mission="${m.id}">${m.name}</button><p>${m.text} — $${m.reward}</p>`;
      list.appendChild(li);
    });
    pause.classList.remove('hidden'); board.classList.remove('hidden');
  }

  function setupUi() {
    $('btn-resume')?.addEventListener('click', closeMenus);
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.remove('hidden'));
    $('btn-load')?.addEventListener('click', () => { load(state.slot); closeMenus(); });
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', closeMenus);
    $('mission-list')?.addEventListener('click', e => { const id = e.target?.dataset?.mission; if (id) startMission(id); });
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; save(state.slot); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; load(state.slot); }));
    $('btn-export')?.addEventListener('click', () => { const out = $('export-json'); if (out) out.value = JSON.stringify(save(state.slot), null, 2); });
    $('btn-import')?.addEventListener('click', () => { const out = $('export-json'); if (!out?.value) return; localStorage.setItem(`${saveKey}:${state.slot}`, out.value); load(state.slot); });
    $('graphics-quality')?.addEventListener('change', e => { state.quality = e.target.value; localStorage.setItem('neonblock-quality', state.quality); reward('Graphics: ' + state.quality); });
    $('btn-mobile-jump')?.addEventListener('pointerdown', jump);
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => state.sprintHeld = true);
    $('btn-mobile-sprint')?.addEventListener('pointerup', () => state.sprintHeld = false);
    $('btn-mobile-interact')?.addEventListener('pointerdown', interact);
    $('btn-mobile-unstuck')?.addEventListener('pointerdown', () => { state.player.x = 0; state.player.z = 0; state.player.y = 0; state.player.inVehicle = null; reward('Unstuck'); });
    $('btn-mobile-pause')?.addEventListener('pointerdown', openPause);
  }

  function setupInput() {
    addEventListener('keydown', (e) => { state.keys.add(e.code); if (e.code === 'Space') jump(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyM') openMissionBoard(); if (e.code === 'Escape') openPause(); });
    addEventListener('keyup', (e) => state.keys.delete(e.code));
    const wrap = $('joystick-container'), stick = $('joystick-stick');
    let active = false;
    const move = (e) => {
      if (!active || !wrap || !stick) return;
      const r = wrap.getBoundingClientRect();
      const x = clamp(e.clientX - r.left - r.width / 2, -45, 45), y = clamp(e.clientY - r.top - r.height / 2, -45, 45);
      state.joy.x = x / 45; state.joy.y = y / 45;
      stick.style.transform = `translate(${x}px,${y}px)`;
    };
    wrap?.addEventListener('pointerdown', e => { active = true; wrap.setPointerCapture(e.pointerId); move(e); });
    wrap?.addEventListener('pointermove', move);
    wrap?.addEventListener('pointerup', () => { active = false; state.joy.x = 0; state.joy.y = 0; if (stick) stick.style.transform = 'translate(0,0)'; });
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  }

  let last = performance.now(), frames = 0, fpsTime = last;
  function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    streamWorld(); updatePlayer(dt); updateCollectibles(dt); updateCamera(dt); drawMinimap(); setHud();
    renderer.render(scene, camera);
    frames++; if (now - fpsTime > 1000) { if (hud.fps) hud.fps.textContent = frames; frames = 0; fpsTime = now; }
    if (now - state.lastSave > 30000) save(state.slot);
    requestAnimationFrame(tick);
  }

  setupUi(); setupInput(); load(state.slot);
  spawnNpc(8, 14, 'MISSIONS'); spawnVehicle(10, -12); spawnLot(-18, 16, 650);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) createChunk(x, z);
  addEventListener('resize', resize);
  if (loading) loading.classList.add('hidden');
  setHud(); requestAnimationFrame(tick);
})();
