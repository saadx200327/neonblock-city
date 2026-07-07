/* NeonBlock City - static playable runtime */
(function () {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const $ = (id) => document.getElementById(id);
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), err: $('debug-last-error')
  };

  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false,
    player: { x: 0, y: 1.2, z: 0, vx: 0, vz: 0, speed: 10, sprint: false, inVehicle: null },
    ownedLots: new Set(), activeMission: null, missionProgress: 0, lastSave: 0
  };

  const missions = [
    { id: 'crate-run', name: 'Crate Run', goal: 5, reward: 250, xp: 90, text: 'Collect 5 neon crates.' },
    { id: 'taxi-loop', name: 'Taxi Loop', goal: 3, reward: 420, xp: 140, text: 'Drive through 3 yellow route pads.' },
    { id: 'lot-buyer', name: 'Block Owner', goal: 1, reward: 150, xp: 120, text: 'Buy any city lot.' }
  ];

  const THREE = window.THREE;
  if (!THREE) {
    setError('Three.js failed to load');
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 45, 180);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  renderer.setSize(innerWidth, innerHeight);

  scene.add(new THREE.HemisphereLight(0xbbeeff, 0x111122, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x111525, roughness: 0.75 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x122518, roughness: 0.9 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x064a55 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xffdd55, emissive: 0x554000 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x4d2cff, transparent: true, opacity: 0.55 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, transparent: true, opacity: 0.7 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xff6bd6, emissive: 0x330022 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x330010 }),
    route: new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0x554400 })
  };

  const playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 0.55), mats.player);
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), mats.player);
  head.position.y = 1.72;
  playerMesh.add(body, head);
  scene.add(playerMesh);

  const world = { chunks: new Map(), crates: [], lots: [], npcs: [], vehicles: [], routes: [] };
  const keys = new Set();
  const pointer = { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 };

  function keyFor(cx, cz) { return cx + ',' + cz; }
  function rand(cx, cz, salt) {
    const n = Math.sin(cx * 127.1 + cz * 311.7 + salt * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function makeBlock(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function streamWorld() {
    const pcx = Math.floor(state.player.x / 40);
    const pcz = Math.floor(state.player.z / 40);
    const keep = new Set();
    for (let cx = pcx - 2; cx <= pcx + 2; cx++) {
      for (let cz = pcz - 2; cz <= pcz + 2; cz++) {
        const k = keyFor(cx, cz);
        keep.add(k);
        if (!world.chunks.has(k)) createChunk(cx, cz, k);
      }
    }
    for (const [k, chunk] of world.chunks) {
      if (!keep.has(k)) {
        chunk.objects.forEach((o) => scene.remove(o));
        world.chunks.delete(k);
      }
    }
  }

  function createChunk(cx, cz, k) {
    const objects = [];
    const ox = cx * 40, oz = cz * 40;
    const ground = makeBlock(40, 0.2, 40, mats.grass, ox + 20, -0.1, oz + 20);
    const roadA = makeBlock(40, 0.04, 7, mats.road, ox + 20, 0.03, oz + 20);
    const roadB = makeBlock(7, 0.05, 40, mats.road, ox + 20, 0.04, oz + 20);
    objects.push(ground, roadA, roadB);

    for (let i = 0; i < 5; i++) {
      const x = ox + 5 + rand(cx, cz, i) * 30;
      const z = oz + 5 + rand(cx, cz, i + 9) * 30;
      if (Math.abs((x % 40) - 20) < 5 || Math.abs((z % 40) - 20) < 5) continue;
      const h = 4 + Math.floor(rand(cx, cz, i + 3) * 14);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rand(cx, cz, i + 2), 0.7, 0.42), emissive: 0x080818 });
      objects.push(makeBlock(5 + rand(cx, cz, i + 4) * 6, h, 5 + rand(cx, cz, i + 5) * 6, mat, x, h / 2, z));
    }

    if (rand(cx, cz, 22) > 0.45) {
      const crate = makeBlock(1.2, 1.2, 1.2, mats.crate, ox + 8 + rand(cx, cz, 23) * 24, 0.7, oz + 8 + rand(cx, cz, 24) * 24);
      crate.userData.type = 'crate'; world.crates.push(crate); objects.push(crate);
    }
    if (rand(cx, cz, 30) > 0.55) {
      const lot = makeBlock(8, 0.18, 8, mats.lot, ox + 8 + rand(cx, cz, 31) * 24, 0.11, oz + 8 + rand(cx, cz, 32) * 24);
      lot.userData = { type: 'lot', id: k, price: 300 + Math.floor(rand(cx, cz, 33) * 500) };
      if (state.ownedLots.has(lot.userData.id)) lot.material = mats.owned;
      world.lots.push(lot); objects.push(lot);
    }
    if (rand(cx, cz, 40) > 0.63) {
      const npc = makeBlock(0.9, 1.8, 0.9, mats.npc, ox + 12 + rand(cx, cz, 41) * 16, 0.9, oz + 12 + rand(cx, cz, 42) * 16);
      npc.userData.type = 'npc'; world.npcs.push(npc); objects.push(npc);
    }
    if (rand(cx, cz, 50) > 0.68) {
      const car = makeBlock(2.2, 1, 3.6, mats.vehicle, ox + 20, 0.58, oz + 8 + rand(cx, cz, 51) * 24);
      car.userData = { type: 'vehicle', hp: 100, gas: 100 }; world.vehicles.push(car); objects.push(car);
    }
    if (rand(cx, cz, 60) > 0.72) {
      const route = makeBlock(4, 0.12, 4, mats.route, ox + 20, 0.1, oz + 20);
      route.userData.type = 'route'; world.routes.push(route); objects.push(route);
    }

    objects.forEach((o) => scene.add(o));
    world.chunks.set(k, { objects });
  }

  function startMission(id) {
    state.activeMission = missions.find((m) => m.id === id) || missions[0];
    state.missionProgress = 0;
    showReward('Mission started: ' + state.activeMission.name);
  }

  function completeMission() {
    const m = state.activeMission;
    if (!m) return;
    state.cash += m.reward; state.xp += m.xp; state.level = 1 + Math.floor(state.xp / 250);
    showReward('Complete: +' + m.reward + ' cash, +' + m.xp + ' XP');
    state.activeMission = null; state.missionProgress = 0;
  }

  function interact() {
    const p = new THREE.Vector3(state.player.x, 0, state.player.z);
    let nearest = null, dist = 4.5;
    [...world.vehicles, ...world.lots, ...world.npcs].forEach((o) => {
      if (!o.parent) return;
      const d = p.distanceTo(new THREE.Vector3(o.position.x, 0, o.position.z));
      if (d < dist) { nearest = o; dist = d; }
    });
    if (!nearest) { openMissionBoard(); return; }
    if (nearest.userData.type === 'vehicle') {
      state.player.inVehicle = state.player.inVehicle ? null : nearest;
      showReward(state.player.inVehicle ? 'Entered vehicle' : 'Exited vehicle');
    } else if (nearest.userData.type === 'lot') {
      if (state.ownedLots.has(nearest.userData.id)) return showReward('You already own this lot');
      if (state.cash < nearest.userData.price) return showReward('Need $' + nearest.userData.price);
      state.cash -= nearest.userData.price; state.ownedLots.add(nearest.userData.id); nearest.material = mats.owned;
      if (state.activeMission && state.activeMission.id === 'lot-buyer') completeMission();
      else showReward('Lot purchased');
    } else if (nearest.userData.type === 'npc') {
      showReward('NPC: Use WASD/joystick, E interact, V vehicle, M missions.');
    }
  }

  function update(dt) {
    if (state.paused) return;
    streamWorld();
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    mx += pointer.dx; mz += pointer.dy;
    const len = Math.hypot(mx, mz) || 1;
    const speed = (state.player.inVehicle ? 22 : state.player.speed) * (state.player.sprint ? 1.55 : 1);
    state.player.x += (mx / len) * speed * dt;
    state.player.z += (mz / len) * speed * dt;
    if (state.player.inVehicle) {
      state.player.inVehicle.position.x = state.player.x;
      state.player.inVehicle.position.z = state.player.z;
      state.player.inVehicle.userData.gas = Math.max(0, state.player.inVehicle.userData.gas - dt * 0.8);
    }
    playerMesh.position.set(state.player.x, 0, state.player.z);
    playerMesh.visible = !state.player.inVehicle;
    camera.position.lerp(new THREE.Vector3(state.player.x + 18, 18, state.player.z + 18), 0.08);
    camera.lookAt(state.player.x, 0, state.player.z);
    handlePickups();
    if (performance.now() - state.lastSave > 15000) saveGame(state.slot, true);
  }

  function handlePickups() {
    const p = new THREE.Vector3(state.player.x, 0, state.player.z);
    for (const crate of world.crates) {
      if (!crate.parent) continue;
      crate.rotation.y += 0.03;
      if (p.distanceTo(new THREE.Vector3(crate.position.x, 0, crate.position.z)) < 2) {
        scene.remove(crate); state.cash += 35; state.xp += 15;
        if (state.activeMission && state.activeMission.id === 'crate-run' && ++state.missionProgress >= state.activeMission.goal) completeMission();
      }
    }
    for (const route of world.routes) {
      if (!route.parent || !state.player.inVehicle) continue;
      if (p.distanceTo(new THREE.Vector3(route.position.x, 0, route.position.z)) < 3) {
        scene.remove(route);
        if (state.activeMission && state.activeMission.id === 'taxi-loop' && ++state.missionProgress >= state.activeMission.goal) completeMission();
      }
    }
  }

  function drawMiniMap() {
    const c = $('minimap-canvas'); if (!c) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#07101f'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#17f3ff55'; ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
    ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(80, 80, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffdd55';
    world.crates.slice(-40).forEach((o) => { if (!o.parent) return; ctx.fillRect(80 + (o.position.x - state.player.x) / 3, 80 + (o.position.z - state.player.z) / 3, 3, 3); });
  }

  function updateHud(fps) {
    hud.cash.textContent = '$' + Math.floor(state.cash); hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    const car = state.player.inVehicle;
    hud.vehicle.textContent = car ? 'Neon car' : 'On foot'; hud.hp.textContent = car ? Math.floor(car.userData.hp) : 100; hud.gas.textContent = car ? Math.floor(car.userData.gas) : 100;
    hud.mission.textContent = state.activeMission ? state.activeMission.name + ' ' + state.missionProgress + '/' + state.activeMission.goal : 'None';
    hud.fps.textContent = fps; hud.pos.textContent = Math.round(state.player.x) + ',0,' + Math.round(state.player.z); hud.chunks.textContent = world.chunks.size; hud.npcs.textContent = world.npcs.filter(n => n.parent).length;
    hud.activeVehicle.textContent = car ? 'active' : 'none'; hud.slot.textContent = state.slot;
  }

  function saveGame(slot, silent) {
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player, ownedLots: [...state.ownedLots], ts: Date.now() };
    localStorage.setItem('neonblock:' + slot, JSON.stringify(data));
    state.lastSave = performance.now();
    if (window.NeonBlockCloud && window.NeonBlockCloud.save) window.NeonBlockCloud.save(slot, data).catch(() => {});
    if (!silent) showReward('Saved ' + slot);
  }
  function loadGame(slot) {
    const raw = localStorage.getItem('neonblock:' + slot); if (!raw) return showReward('No save in ' + slot);
    const data = JSON.parse(raw); Object.assign(state, { cash: data.cash || 0, xp: data.xp || 0, level: data.level || 1, wanted: data.wanted || 0 });
    state.player.x = data.player?.x || 0; state.player.z = data.player?.z || 0; state.ownedLots = new Set(data.ownedLots || []); state.slot = slot;
    showReward('Loaded ' + slot);
  }

  function showReward(text) { const el = $('reward-popup'); el.textContent = text; el.classList.remove('hidden'); clearTimeout(showReward.t); showReward.t = setTimeout(() => el.classList.add('hidden'), 1800); }
  function setError(text) { if (hud.err) hud.err.textContent = text; console.warn(text); }
  function togglePause(force) { state.paused = typeof force === 'boolean' ? force : !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }
  function openMissionBoard() {
    togglePause(true); $('mission-board').classList.remove('hidden');
    $('mission-list').innerHTML = missions.map(m => '<li><button data-mission="' + m.id + '">' + m.name + ': ' + m.text + '</button></li>').join('');
  }

  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyE' || e.code === 'KeyV') interact(); if (e.code === 'KeyM') openMissionBoard(); if (e.code === 'ShiftLeft') state.player.sprint = true; });
  addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'ShiftLeft') state.player.sprint = false; });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  function bind(id, fn) { const el = $(id); if (el) el.addEventListener('click', fn); }
  bind('btn-resume', () => togglePause(false)); bind('btn-mobile-pause', () => togglePause()); bind('btn-mobile-interact', interact); bind('btn-mobile-unstuck', () => { state.player.x = 0; state.player.z = 0; });
  bind('btn-mobile-sprint', () => { state.player.sprint = !state.player.sprint; }); bind('btn-save', () => $('save-panel').classList.remove('hidden')); bind('btn-load', () => $('save-panel').classList.remove('hidden'));
  bind('btn-close-save', () => $('save-panel').classList.add('hidden')); bind('btn-close-missions', () => $('mission-board').classList.add('hidden')); bind('btn-settings', () => $('settings-panel').classList.remove('hidden')); bind('btn-close-settings', () => $('settings-panel').classList.add('hidden'));
  document.addEventListener('click', (e) => { const m = e.target.dataset.mission; if (m) { startMission(m); togglePause(false); } if (e.target.classList.contains('btn-save-slot')) saveGame(e.target.dataset.slot); if (e.target.classList.contains('btn-load-slot')) loadGame(e.target.dataset.slot); });
  bind('btn-export', () => { $('export-json').value = localStorage.getItem('neonblock:' + state.slot) || ''; });
  bind('btn-import', () => { try { JSON.parse($('export-json').value); localStorage.setItem('neonblock:' + state.slot, $('export-json').value); loadGame(state.slot); } catch { showReward('Invalid JSON'); } });

  const joy = $('joystick-container'), stick = $('joystick-stick');
  if (joy) {
    joy.addEventListener('pointerdown', (e) => { pointer.active = true; pointer.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
    joy.addEventListener('pointermove', moveJoy);
    joy.addEventListener('pointerup', resetJoy); joy.addEventListener('pointercancel', resetJoy);
  }
  function moveJoy(e) { if (!pointer.active || e.pointerId !== pointer.id) return; const r = joy.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; const m = Math.min(1, Math.hypot(x, y) / 45); const a = Math.atan2(y, x); pointer.dx = Math.cos(a) * m; pointer.dy = Math.sin(a) * m; stick.style.transform = 'translate(' + pointer.dx * 36 + 'px,' + pointer.dy * 36 + 'px)'; }
  function resetJoy() { pointer.active = false; pointer.dx = pointer.dy = 0; stick.style.transform = 'translate(0,0)'; }

  let last = performance.now(), frames = 0, fpsTime = last, fps = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++;
    if (now - fpsTime > 500) { fps = Math.round(frames * 1000 / (now - fpsTime)); frames = 0; fpsTime = now; }
    update(dt); drawMiniMap(); updateHud(fps); renderer.render(scene, camera); requestAnimationFrame(loop);
  }
  streamWorld(); loading?.classList.add('hidden'); startMission('crate-run'); requestAnimationFrame(loop);
})();
