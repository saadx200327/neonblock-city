(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const txt = (id, value) => { const el = $(id); if (el) el.textContent = String(value); };
  if (!window.THREE) {
    const loading = $('loading-screen');
    if (loading) loading.textContent = 'NeonBlock City could not load Three.js.';
    return;
  }

  const THREE = window.THREE;
  const canvas = $('game-canvas');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, 360);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));

  const mat = (color, glow = false) => new THREE.MeshStandardMaterial({ color, emissive: glow ? color : 0, emissiveIntensity: glow ? 0.55 : 0, roughness: 0.7 });
  const mats = {
    player: mat(0x17f3ff, true), road: mat(0x11182d), grass: mat(0x0b302e), building: mat(0x151a33),
    crate: mat(0xffcc00, true), car: mat(0xff3366), lot: mat(0x8b5cf6, true), owned: mat(0x5ef38c, true), npc: mat(0xffcc66), waypoint: mat(0x5ef38c, true)
  };
  scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x151020, 1.7));
  const sun = new THREE.DirectionalLight(0xaaf4ff, 2);
  sun.position.set(80, 120, 60);
  scene.add(sun);

  const state = { cash: 125, xp: 0, level: 1, wanted: 0, mission: 0, crates: 0, slot: 'slot1', paused: false, ownedLots: new Set(), vehicle: null, player: { x: 0, y: 1, z: 0, vy: 0, heading: 0, grounded: true } };
  const keys = new Set();
  const input = { f: 0, r: 0, jump: false, action: false };
  const chunks = new Map();
  const cars = [];
  const crates = [];
  const lots = [];
  const npcs = [];
  const missions = [
    { name: 'Neon Courier', x: 95, z: -80, info: 'Reach the green waypoint.', cash: 80, xp: 35 },
    { name: 'Crate Dash', x: -70, z: 70, info: 'Collect 3 crates.', cash: 120, xp: 55 },
    { name: 'First Block', x: 55, z: 55, info: 'Buy any purple lot.', cash: 150, xp: 75 }
  ];

  const player = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2, 1.25), mats.player);
  player.position.set(0, 1, 0);
  scene.add(player);
  const waypoint = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.25, 24), mats.waypoint);
  scene.add(waypoint);

  load(false);
  buildMissionBoard();
  wireInput();
  wireMenus();
  updateWorld();
  const loading = $('loading-screen');
  if (loading) loading.classList.add('hidden');
  requestAnimationFrame(loop);

  let last = performance.now();
  let fpsT = 0;
  let fpsN = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    if (!state.paused) {
      step(dt, now);
      updateWorld();
      checkMission();
      if (now - (state.savedAt || 0) > 15000) save(true);
    }
    drawMap();
    hud();
    renderer.render(scene, camera);
    fpsT += dt; fpsN += 1;
    if (fpsT > 0.5) { txt('debug-fps', Math.round(fpsN / fpsT)); fpsT = 0; fpsN = 0; }
  }

  function step(dt, now) {
    const p = state.player;
    p.heading -= input.r * (state.vehicle ? 2.1 : 3.4) * dt;
    if (state.vehicle) {
      const v = state.vehicle;
      v.userData.gas = Math.max(0, v.userData.gas - Math.abs(input.f) * dt * 2.6);
      const speed = (v.userData.kind === 'hover' ? 32 : 24) * (v.userData.gas > 0 ? 1 : 0.25);
      v.position.x += Math.sin(p.heading) * input.f * speed * dt;
      v.position.z += Math.cos(p.heading) * input.f * speed * dt;
      v.rotation.y = p.heading;
      p.x = v.position.x; p.z = v.position.z; p.y = 1;
      player.visible = false;
      follow(v.position, p.heading, 8, 13);
    } else {
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = sprint ? 14 : 8;
      p.x += (Math.sin(p.heading) * input.f + Math.cos(p.heading) * input.r * 0.3) * speed * dt;
      p.z += (Math.cos(p.heading) * input.f - Math.sin(p.heading) * input.r * 0.3) * speed * dt;
      p.vy -= 28 * dt;
      if (input.jump && p.grounded) { p.vy = 11; p.grounded = false; }
      p.y += p.vy * dt;
      if (p.y < 1) { p.y = 1; p.vy = 0; p.grounded = true; }
      player.visible = true;
      player.position.set(p.x, p.y, p.z);
      player.rotation.y = p.heading;
      follow(player.position, p.heading, 6, 9);
    }
    input.jump = false;
    if (input.action) { input.action = false; interact(); }
    waypoint.rotation.y += dt * 1.8;
    waypoint.position.y = 0.25 + Math.sin(now / 260) * 0.18;
  }

  function follow(pos, heading, dist, height) {
    camera.position.lerp(new THREE.Vector3(pos.x - Math.sin(heading) * dist, height, pos.z - Math.cos(heading) * dist), 0.12);
    camera.lookAt(pos.x, pos.y + 2, pos.z);
  }

  function updateWorld() {
    const cx = Math.floor(state.player.x / 80);
    const cz = Math.floor(state.player.z / 80);
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
      const key = x + ',' + z;
      if (!chunks.has(key)) chunks.set(key, chunk(x, z));
    }
    for (const [key, group] of chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - cx) > 3 || Math.abs(z - cz) > 3) { scene.remove(group); chunks.delete(key); }
    }
  }

  function chunk(cx, cz) {
    const group = new THREE.Group();
    const ox = cx * 80, oz = cz * 80;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 0.15, 80), (cx + cz) % 2 ? mats.grass : mats.road);
    ground.position.set(ox + 40, -0.08, oz + 40);
    group.add(ground);
    for (let i = 0; i < 7; i++) {
      const x = ox + 8 + rnd(cx, cz, i) * 64;
      const z = oz + 8 + rnd(cz, cx, i + 9) * 64;
      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
      const h = 8 + Math.floor(rnd(cx + 3, cz - 2, i) * 34);
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), mats.building);
      b.position.set(x, h / 2, z);
      group.add(b);
    }
    if (rnd(cx, cz, 22) > 0.55) addCrate(group, ox + 12 + rnd(cx, cz, 24) * 55, oz + 12 + rnd(cx, cz, 25) * 55);
    if (rnd(cx, cz, 33) > 0.62) addCar(group, ox + 18 + rnd(cx, cz, 34) * 45, oz + 18 + rnd(cx, cz, 35) * 45, rnd(cx, cz, 36) > 0.7 ? 'hover' : 'car');
    if (rnd(cx, cz, 44) > 0.72) addNpc(group, ox + 12 + rnd(cx, cz, 45) * 55, oz + 12 + rnd(cx, cz, 46) * 55);
    if (rnd(cx, cz, 55) > 0.68) addLot(group, ox + 18 + rnd(cx, cz, 56) * 42, oz + 18 + rnd(cx, cz, 57) * 42, cx + ':' + cz);
    scene.add(group);
    return group;
  }

  function addCrate(group, x, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats.crate); m.position.set(x, 1, z); m.userData.taken = false; group.add(m); crates.push(m); }
  function addCar(group, x, z, kind) { const m = new THREE.Mesh(new THREE.BoxGeometry(kind === 'hover' ? 4.2 : 3.5, 1.4, 6), kind === 'hover' ? mats.owned : mats.car); m.position.set(x, 0.8, z); m.userData = { kind, hp: 100, gas: 100 }; group.add(m); cars.push(m); }
  function addNpc(group, x, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.2), mats.npc); m.position.set(x, 1, z); group.add(m); npcs.push(m); }
  function addLot(group, x, z, id) { const m = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 10), state.ownedLots.has(id) ? mats.owned : mats.lot); m.position.set(x, 0.15, z); m.userData = { id, price: 250 }; group.add(m); lots.push(m); }

  function interact() {
    const pos = new THREE.Vector3(state.player.x, 1, state.player.z);
    if (state.vehicle) { state.vehicle = null; say('Exited vehicle.'); return; }
    const car = near(cars, pos, 6, (m) => m.parent);
    if (car) { state.vehicle = car; say('Entered vehicle.'); return; }
    const crate = near(crates, pos, 4, (m) => m.parent && !m.userData.taken);
    if (crate) { crate.userData.taken = true; crate.visible = false; state.cash += 25; state.xp += 10; state.crates += 1; say('Crate collected: +$25 +10 XP'); return; }
    const lot = near(lots, pos, 7, (m) => m.parent);
    if (lot) {
      if (state.ownedLots.has(lot.userData.id)) { say('You already own this lot.'); return; }
      if (state.cash < lot.userData.price) { say('Need $' + lot.userData.price + ' to buy.'); return; }
      state.cash -= lot.userData.price; state.ownedLots.add(lot.userData.id); lot.material = mats.owned; say('Lot purchased.'); return;
    }
    if (near(npcs, pos, 5, (m) => m.parent)) { say('NPC tip: press M for missions, E to interact, R to unstuck.'); return; }
    say('Nothing nearby.');
  }

  function checkMission() {
    const m = missions[state.mission];
    waypoint.position.x = m.x; waypoint.position.z = m.z;
    let done = false;
    if (state.mission === 0) done = Math.hypot(state.player.x - m.x, state.player.z - m.z) < 10;
    if (state.mission === 1) done = state.crates >= 3;
    if (state.mission === 2) done = state.ownedLots.size > 0;
    if (!done) return;
    state.cash += m.cash; state.xp += m.xp; state.crates = 0; state.mission = (state.mission + 1) % missions.length;
    say(m.name + ' complete: +$' + m.cash + ' +' + m.xp + ' XP');
    save(true);
  }

  function hud() {
    while (state.xp >= state.level * 100) { state.xp -= state.level * 100; state.level += 1; say('Level ' + state.level + '!'); }
    txt('hud-cash', '$' + state.cash); txt('hud-xp', state.xp); txt('hud-level', state.level); txt('hud-wanted', state.wanted);
    txt('hud-online', window.NeonBlockCloudSave && window.NeonBlockCloudSave.ready ? 'cloud optional' : 'offline');
    txt('hud-vehicle', state.vehicle ? state.vehicle.userData.kind : 'On foot'); txt('hud-vehicle-hp', state.vehicle ? Math.round(state.vehicle.userData.hp) : 100); txt('hud-vehicle-gas', state.vehicle ? Math.round(state.vehicle.userData.gas) : 100);
    txt('hud-mission', missions[state.mission].name); txt('debug-pos', Math.round(state.player.x) + ',' + Math.round(state.player.y) + ',' + Math.round(state.player.z));
    txt('debug-chunks', chunks.size); txt('debug-npcs', npcs.filter((n) => n.parent).length); txt('debug-active-vehicle', state.vehicle ? state.vehicle.userData.kind : 'None'); txt('debug-save-slot', state.slot);
  }

  function drawMap() {
    const mini = $('minimap-canvas'); if (!mini) return;
    const ctx = mini.getContext('2d');
    ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#050814cc'; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = '#17f3ff66'; ctx.strokeRect(1, 1, 158, 158);
    plot(missions[state.mission].x, missions[state.mission].z, '#5ef38c', 5);
    cars.forEach((m) => m.parent && plot(m.position.x, m.position.z, '#ff3366', 3));
    crates.forEach((m) => m.parent && !m.userData.taken && plot(m.position.x, m.position.z, '#ffcc00', 3));
    ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(80, 80, 5, 0, Math.PI * 2); ctx.fill();
    function plot(x, z, color, r) { const px = 80 + (x - state.player.x) * 0.45, pz = 80 + (z - state.player.z) * 0.45; if (px < 0 || px > 160 || pz < 0 || pz > 160) return; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.fill(); }
  }

  function save(silent) {
    state.savedAt = performance.now();
    const data = { version: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, mission: state.mission, crates: state.crates, player: state.player, ownedLots: [...state.ownedLots], savedAt: new Date().toISOString() };
    localStorage.setItem('neonblock-city-save:' + state.slot, JSON.stringify(data));
    localStorage.setItem('neonblock-city-save', JSON.stringify(data));
    if (window.NeonBlockCloudSave && window.NeonBlockCloudSave.save) window.NeonBlockCloudSave.save(state.slot, data).catch((e) => txt('debug-last-error', e.message));
    if (!silent) say('Game saved.');
    return data;
  }

  function load(announce) {
    try {
      const raw = localStorage.getItem('neonblock-city-save:' + state.slot) || localStorage.getItem('neonblock-city-save');
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.cash = Number(data.cash) || 125; state.xp = Number(data.xp) || 0; state.level = Number(data.level) || 1; state.wanted = Number(data.wanted) || 0;
      state.mission = Number(data.mission) || 0; state.crates = Number(data.crates) || 0; Object.assign(state.player, data.player || {}); state.ownedLots = new Set(data.ownedLots || []);
      if (announce) say('Game loaded.');
      return true;
    } catch (e) { txt('debug-last-error', e.message); return false; }
  }

  function buildMissionBoard() {
    if (!missionList) return;
    missionList.textContent = '';
    missions.forEach((m, index) => { const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = m.name + ' - ' + m.info; b.addEventListener('click', () => { state.mission = index; state.crates = 0; missionBoard.classList.add('hidden'); say('Mission selected.'); }); li.appendChild(b); missionList.appendChild(li); });
  }

  function wireMenus() {
    bind('btn-resume', () => pause(false)); bind('btn-mobile-pause', () => pause(!state.paused)); bind('btn-settings', () => settingsPanel && settingsPanel.classList.toggle('hidden')); bind('btn-close-settings', () => settingsPanel && settingsPanel.classList.add('hidden'));
    bind('btn-save', () => savePanel && savePanel.classList.toggle('hidden')); bind('btn-load', () => savePanel && savePanel.classList.toggle('hidden')); bind('btn-close-save', () => savePanel && savePanel.classList.add('hidden')); bind('btn-close-missions', () => missionBoard && missionBoard.classList.add('hidden'));
    bind('btn-export', () => { if (exportJson) exportJson.value = JSON.stringify(save(true), null, 2); say('Save exported.'); });
    bind('btn-import', () => { if (!exportJson || !exportJson.value) return; localStorage.setItem('neonblock-city-save:' + state.slot, exportJson.value); load(true); });
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; save(false); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; load(true); }));
    const quality = $('graphics-quality'); if (quality) quality.addEventListener('change', () => { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.value === 'low' ? 1 : 1.6)); say('Graphics: ' + quality.value); });
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  }

  function wireInput() {
    addEventListener('keydown', (e) => { keys.add(e.code); syncKeys(); if (e.code === 'Space') input.jump = true; if (e.code === 'KeyE') input.action = true; if (e.code === 'KeyM' && missionBoard) missionBoard.classList.toggle('hidden'); if (e.code === 'Backquote' && debugOverlay) debugOverlay.classList.toggle('show'); if (e.code === 'Escape') pause(!state.paused); if (e.code === 'KeyR') unstuck(); });
    addEventListener('keyup', (e) => { keys.delete(e.code); syncKeys(); });
    bind('btn-mobile-jump', () => { input.jump = true; }, 'pointerdown'); bind('btn-mobile-interact', () => { input.action = true; }, 'pointerdown'); bind('btn-mobile-unstuck', unstuck, 'pointerdown');
    setupJoystick();
  }

  function setupJoystick() {
    const area = $('joystick-container'), stick = $('joystick-stick'); if (!area || !stick) return;
    const reset = () => { input.f = 0; input.r = 0; stick.style.transform = 'translate(0,0)'; };
    const move = (e) => { const rect = area.getBoundingClientRect(); const dx = e.clientX - rect.left - rect.width / 2; const dy = e.clientY - rect.top - rect.height / 2; const len = Math.hypot(dx, dy) || 1; const max = 42; const x = dx / len * Math.min(max, len); const y = dy / len * Math.min(max, len); stick.style.transform = 'translate(' + x + 'px,' + y + 'px)'; input.r = Math.max(-1, Math.min(1, x / max)); input.f = Math.max(-1, Math.min(1, -y / max)); };
    area.addEventListener('pointerdown', (e) => { area.setPointerCapture(e.pointerId); move(e); }); area.addEventListener('pointermove', move); area.addEventListener('pointerup', reset); area.addEventListener('pointercancel', reset);
  }

  function syncKeys() { input.f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0; input.r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0; }
  function pause(v) { state.paused = v; if (pauseOverlay) pauseOverlay.classList.toggle('hidden', !v); }
  function unstuck() { state.vehicle = null; state.player.y = 3; state.player.vy = 0; say('Unstuck.'); }
  function near(list, pos, radius, ok) { let best = null, dist = radius * radius; list.forEach((m) => { if (!ok(m)) return; const d = m.position.distanceToSquared(pos); if (d < dist) { best = m; dist = d; } }); return best; }
  function rnd(a, b, c) { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); }
  function say(message) { if (!reward) return; reward.textContent = message; reward.classList.remove('hidden'); clearTimeout(say.t); say.t = setTimeout(() => reward.classList.add('hidden'), 2200); }
  function bind(id, fn, type = 'click') { const el = $(id); if (el) el.addEventListener(type, fn); }
})();
