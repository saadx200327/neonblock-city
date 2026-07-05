(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: text('hud-cash'), xp: text('hud-xp'), level: text('hud-level'), wanted: text('hud-wanted'), online: text('hud-online'),
    vehicle: text('hud-vehicle'), hp: text('hud-vehicle-hp'), gas: text('hud-vehicle-gas'), mission: text('hud-mission'),
    fps: text('debug-fps'), pos: text('debug-pos'), chunks: text('debug-chunks'), npcs: text('debug-npcs'), activeVehicle: text('debug-active-vehicle'),
    saveSlot: text('debug-save-slot'), debugOnline: text('debug-online'), lastError: text('debug-last-error')
  };
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimap = minimapCanvas?.getContext('2d');
  const rewardPopup = document.getElementById('reward-popup');
  const pauseOverlay = document.getElementById('pause-overlay');
  const settingsPanel = document.getElementById('settings-panel');
  const missionBoard = document.getElementById('mission-board');
  const missionList = document.getElementById('mission-list');
  const savePanel = document.getElementById('save-panel');
  const exportJson = document.getElementById('export-json');
  const waypointArrow = document.getElementById('waypoint-arrow');

  const WORLD = { chunkSize: 180, renderRadius: 2, roadWidth: 24, maxVehicles: 10, maxPickups: 18 };
  const state = {
    player: { x: 0, y: 2.2, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: false, sprint: false },
    cameraYaw: Math.PI / 4, cash: 125, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false, lastSave: 0,
    activeVehicle: null, keys: new Set(), joystick: { x: 0, y: 0, active: false }, missions: [], activeMission: null, owned: new Set(), online: false,
    chunks: new Map(), vehicles: [], pickups: [], npcs: [], props: [], frame: 0, quality: 'auto', lastError: 'none'
  };

  if (!window.THREE) {
    showError('Three.js failed to load. Check internet/CDN or vendor a local three.min.js.');
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 120, 620);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = false;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);

  const hemi = new THREE.HemisphereLight(0x72eaff, 0x160726, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(80, 160, 40);
  scene.add(sun);

  const mats = {
    player: mat(0x39f7ff), road: mat(0x11172c), roadLine: mat(0xfff466), grass: mat(0x0a3d31), buildingA: mat(0x254bff), buildingB: mat(0x8e32ff), buildingC: mat(0xff2faa), glass: mat(0x6cf4ff), vehicle: mat(0xffbf3f), vehicle2: mat(0x45ff86), pickup: mat(0xfff466), npc: mat(0xff6d6d), owned: mat(0x42ffb5), mission: mat(0xffffff)
  };

  const player = new THREE.Group();
  player.add(box(1.4, 2.4, 1.0, mats.player, 0, 1.2, 0));
  player.add(box(1.0, 0.55, 0.7, mat(0x101734), 0, 2.75, 0));
  scene.add(player);

  const missionMarker = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 4), mats.mission);
  missionMarker.rotation.x = Math.PI;
  missionMarker.visible = false;
  scene.add(missionMarker);

  const clock = new THREE.Clock();
  const fps = { t: performance.now(), frames: 0, value: 0 };
  const missions = [
    { id: 'delivery', title: 'Neon Delivery', detail: 'Grab a glowing crate and bring it to the waypoint.', reward: 180, xp: 80, target: { x: 130, z: -80 }, type: 'delivery' },
    { id: 'drive', title: 'Block Taxi Sprint', detail: 'Enter a vehicle and reach the east marker.', reward: 260, xp: 120, target: { x: 320, z: 40 }, type: 'drive' },
    { id: 'property', title: 'First Owner', detail: 'Buy any glowing property tile.', reward: 140, xp: 90, target: { x: -120, z: 150 }, type: 'property' }
  ];
  state.missions = missions;
  state.activeMission = missions[0];

  wireInput();
  wireMenus();
  resize();
  window.addEventListener('resize', resize);
  hydrateFromSave();
  setOnlineStatus(Boolean(window.NeonBlockCloud?.enabled));
  generateAroundPlayer(true);
  loading?.classList.add('hidden');
  requestAnimationFrame(loop);

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.frame++;
    const input = getInput();
    updateMovement(dt, input);
    updateVehicles(dt);
    updateCamera(dt);
    generateAroundPlayer(false);
    updatePickups();
    updateMissions();
    updateNPCs(dt);
    drawMinimap();
    updateHud();
    if (performance.now() - state.lastSave > 15000) saveGame(state.slot, false);
  }

  function updateMovement(dt, input) {
    const p = state.player;
    const inVehicle = state.activeVehicle;
    const speed = inVehicle ? (input.sprint ? 70 : 45) : (input.sprint ? 19 : 11);
    const yaw = state.cameraYaw;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x));
    if (move.lengthSq() > 1) move.normalize();

    if (inVehicle) {
      inVehicle.speed += input.y * speed * dt;
      inVehicle.speed *= 0.965;
      inVehicle.speed = clamp(inVehicle.speed, -22, input.sprint ? 56 : 38);
      inVehicle.yaw -= input.x * dt * (inVehicle.speed >= 0 ? 1 : -1) * 1.9;
      inVehicle.x += Math.sin(inVehicle.yaw) * inVehicle.speed * dt;
      inVehicle.z += Math.cos(inVehicle.yaw) * inVehicle.speed * dt;
      inVehicle.gas = Math.max(0, inVehicle.gas - Math.abs(inVehicle.speed) * dt * 0.025);
      if (inVehicle.gas <= 0) inVehicle.speed *= 0.92;
      p.x = inVehicle.x; p.y = 2.4; p.z = inVehicle.z; p.yaw = inVehicle.yaw;
      inVehicle.mesh.position.set(inVehicle.x, 1.1, inVehicle.z);
      inVehicle.mesh.rotation.y = inVehicle.yaw;
    } else {
      p.vx = lerp(p.vx, move.x * speed, 0.18);
      p.vz = lerp(p.vz, move.z * speed, 0.18);
      p.vy -= 44 * dt;
      if (input.jump && p.onGround) { p.vy = 15; p.onGround = false; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 2.2) { p.y = 2.2; p.vy = 0; p.onGround = true; }
      if (Math.abs(p.vx) + Math.abs(p.vz) > 0.05) p.yaw = Math.atan2(p.vx, p.vz);
    }

    if (state.keys.has('KeyQ')) state.cameraYaw += dt * 2.1;
    if (state.keys.has('KeyE')) state.cameraYaw -= dt * 2.1;
    player.position.set(p.x, p.y - 1.2, p.z);
    player.rotation.y = p.yaw;
    player.visible = !state.activeVehicle;
  }

  function updateVehicles(dt) {
    for (const v of state.vehicles) {
      if (v === state.activeVehicle) continue;
      v.mesh.rotation.y += Math.sin((performance.now() / 900) + v.x) * dt * 0.04;
      const d = dist2(state.player.x, state.player.z, v.x, v.z);
      v.mesh.visible = d < 260 * 260;
    }
  }

  function updateCamera(dt) {
    const p = state.player;
    const back = state.activeVehicle ? 28 : 18;
    const up = state.activeVehicle ? 15 : 12;
    const target = new THREE.Vector3(p.x - Math.sin(state.cameraYaw) * back, p.y + up, p.z - Math.cos(state.cameraYaw) * back);
    camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    camera.lookAt(p.x, p.y + 2.1, p.z);
  }

  function generateAroundPlayer(force) {
    const cx = Math.floor(state.player.x / WORLD.chunkSize);
    const cz = Math.floor(state.player.z / WORLD.chunkSize);
    for (let x = cx - WORLD.renderRadius; x <= cx + WORLD.renderRadius; x++) {
      for (let z = cz - WORLD.renderRadius; z <= cz + WORLD.renderRadius; z++) {
        const key = `${x},${z}`;
        if (!state.chunks.has(key)) state.chunks.set(key, createChunk(x, z));
      }
    }
    for (const [key, group] of state.chunks) {
      const [x, z] = key.split(',').map(Number);
      const keep = Math.abs(x - cx) <= WORLD.renderRadius + 1 && Math.abs(z - cz) <= WORLD.renderRadius + 1;
      if (!keep) { scene.remove(group); disposeObject(group); state.chunks.delete(key); }
    }
    if (force || state.frame % 45 === 0) pruneActors();
  }

  function createChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData.chunk = `${cx},${cz}`;
    const sx = cx * WORLD.chunkSize;
    const sz = cz * WORLD.chunkSize;
    group.add(box(WORLD.chunkSize, 0.3, WORLD.chunkSize, mats.grass, sx + WORLD.chunkSize / 2, -0.18, sz + WORLD.chunkSize / 2));
    group.add(box(WORLD.chunkSize, 0.35, WORLD.roadWidth, mats.road, sx + WORLD.chunkSize / 2, 0.02, sz + WORLD.chunkSize / 2));
    group.add(box(WORLD.roadWidth, 0.36, WORLD.chunkSize, mats.road, sx + WORLD.chunkSize / 2, 0.03, sz + WORLD.chunkSize / 2));
    group.add(box(WORLD.chunkSize, 0.38, 1, mats.roadLine, sx + WORLD.chunkSize / 2, 0.24, sz + WORLD.chunkSize / 2));
    group.add(box(1, 0.38, WORLD.chunkSize, mats.roadLine, sx + WORLD.chunkSize / 2, 0.25, sz + WORLD.chunkSize / 2));

    const rng = seeded(cx * 99991 + cz * 31337);
    for (let i = 0; i < 9; i++) {
      const lx = 25 + rng() * 130;
      const lz = 25 + rng() * 130;
      if (Math.abs(lx - WORLD.chunkSize / 2) < 30 || Math.abs(lz - WORLD.chunkSize / 2) < 30) continue;
      const h = 10 + Math.floor(rng() * 70);
      const w = 12 + rng() * 18;
      const d = 12 + rng() * 18;
      const material = [mats.buildingA, mats.buildingB, mats.buildingC][Math.floor(rng() * 3)];
      const b = box(w, h, d, material, sx + lx, h / 2, sz + lz);
      b.userData.propertyId = `p:${cx}:${cz}:${i}`;
      group.add(b);
      if (rng() > 0.45) group.add(box(w * 0.72, 0.6, d * 0.1, mats.glass, sx + lx, h * 0.64, sz + lz + d / 2 + 0.06));
      state.props.push(b);
    }

    if (state.vehicles.length < WORLD.maxVehicles && rng() > 0.3) spawnVehicle(sx + 82 + rng() * 30, sz + 72 + rng() * 36, rng() * Math.PI * 2);
    if (state.pickups.length < WORLD.maxPickups && rng() > 0.1) spawnPickup(sx + 25 + rng() * 130, sz + 25 + rng() * 130, rng() > 0.5 ? 'cash' : 'xp');
    if (state.npcs.length < 20 && rng() > 0.35) spawnNPC(sx + 30 + rng() * 120, sz + 30 + rng() * 120);
    scene.add(group);
    return group;
  }

  function spawnVehicle(x, z, yaw) {
    const mesh = new THREE.Group();
    mesh.add(box(4.8, 1.1, 8, Math.random() > 0.5 ? mats.vehicle : mats.vehicle2, 0, 0.9, 0));
    mesh.add(box(3.5, 1.1, 3.2, mats.glass, 0, 1.8, -0.7));
    mesh.add(box(1.1, 1.1, 1.1, mat(0x050814), -2.5, 0.45, -2.7));
    mesh.add(box(1.1, 1.1, 1.1, mat(0x050814), 2.5, 0.45, -2.7));
    mesh.add(box(1.1, 1.1, 1.1, mat(0x050814), -2.5, 0.45, 2.7));
    mesh.add(box(1.1, 1.1, 1.1, mat(0x050814), 2.5, 0.45, 2.7));
    mesh.position.set(x, 1.1, z); mesh.rotation.y = yaw; scene.add(mesh);
    const v = { x, z, yaw, speed: 0, gas: 100, hp: 100, mesh };
    state.vehicles.push(v);
  }

  function spawnPickup(x, z, type) {
    const mesh = new THREE.Mesh(type === 'cash' ? new THREE.OctahedronGeometry(2.1) : new THREE.TorusGeometry(2, 0.5, 8, 18), mats.pickup);
    mesh.position.set(x, 3, z); scene.add(mesh);
    state.pickups.push({ x, z, type, mesh });
  }

  function spawnNPC(x, z) {
    const mesh = new THREE.Group();
    mesh.add(box(1.1, 2.1, 0.9, mats.npc, 0, 1.05, 0));
    mesh.position.set(x, 0, z); scene.add(mesh);
    state.npcs.push({ x, z, seed: Math.random() * 1000, mesh });
  }

  function updatePickups() {
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const p = state.pickups[i];
      p.mesh.rotation.y += 0.04;
      p.mesh.position.y = 3 + Math.sin(performance.now() / 280 + i) * 0.35;
      if (dist2(state.player.x, state.player.z, p.x, p.z) < 7 * 7) {
        if (p.type === 'cash') { state.cash += 35; popup('+$35 neon cash'); }
        else { addXP(30); popup('+30 XP'); }
        scene.remove(p.mesh); disposeObject(p.mesh); state.pickups.splice(i, 1);
      }
    }
  }

  function updateNPCs(dt) {
    for (const n of state.npcs) {
      const t = performance.now() / 1000 + n.seed;
      n.x += Math.sin(t * 0.7) * dt * 1.4;
      n.z += Math.cos(t * 0.6) * dt * 1.4;
      n.mesh.position.set(n.x, 0, n.z);
      n.mesh.rotation.y = Math.sin(t) * 0.8;
      n.mesh.visible = dist2(state.player.x, state.player.z, n.x, n.z) < 240 * 240;
    }
  }

  function updateMissions() {
    const m = state.activeMission;
    if (!m) return;
    missionMarker.visible = true;
    missionMarker.position.set(m.target.x, 13 + Math.sin(performance.now() / 300) * 1.5, m.target.z);
    missionMarker.rotation.y += 0.025;
    const dx = m.target.x - state.player.x;
    const dz = m.target.z - state.player.z;
    const angle = Math.atan2(dx, dz) - state.cameraYaw;
    if (waypointArrow) waypointArrow.style.transform = `rotate(${angle}rad)`;
    if (dx * dx + dz * dz < 12 * 12) {
      if (m.type === 'drive' && !state.activeVehicle) return;
      if (m.type === 'property' && state.owned.size < 1) return;
      completeMission(m);
    }
  }

  function completeMission(m) {
    state.cash += m.reward;
    addXP(m.xp);
    popup(`Mission complete: ${m.title} +$${m.reward}`);
    const next = missions[(missions.indexOf(m) + 1) % missions.length];
    state.activeMission = { ...next, target: { x: next.target.x + Math.round(state.player.x / 300) * 120, z: next.target.z + Math.round(state.player.z / 300) * 120 } };
    saveGame(state.slot, false);
  }

  function interact() {
    if (state.activeVehicle) {
      const v = state.activeVehicle;
      state.player.x = v.x + Math.sin(v.yaw + Math.PI / 2) * 6;
      state.player.z = v.z + Math.cos(v.yaw + Math.PI / 2) * 6;
      state.activeVehicle = null;
      popup('Exited vehicle');
      return;
    }
    let nearest = null, best = Infinity;
    for (const v of state.vehicles) {
      const d = dist2(state.player.x, state.player.z, v.x, v.z);
      if (d < best) { best = d; nearest = v; }
    }
    if (nearest && best < 12 * 12) {
      state.activeVehicle = nearest;
      popup('Vehicle entered');
      return;
    }
    let prop = null, pd = Infinity;
    for (const p of state.props) {
      if (!p.userData.propertyId) continue;
      const d = dist2(state.player.x, state.player.z, p.position.x, p.position.z);
      if (d < pd) { pd = d; prop = p; }
    }
    if (prop && pd < 18 * 18) {
      const id = prop.userData.propertyId;
      if (state.owned.has(id)) { popup('You already own this block'); return; }
      const cost = 100;
      if (state.cash < cost) { popup('Need $100 to buy this block'); return; }
      state.cash -= cost; state.owned.add(id); prop.material = mats.owned; addXP(45); popup('Property owned +45 XP'); return;
    }
    popup('Nothing nearby. Find a car, pickup, or building.');
  }

  function pruneActors() {
    const maxD = 520 * 520;
    for (let i = state.vehicles.length - 1; i >= 0; i--) {
      const v = state.vehicles[i];
      if (v === state.activeVehicle) continue;
      if (dist2(state.player.x, state.player.z, v.x, v.z) > maxD) { scene.remove(v.mesh); disposeObject(v.mesh); state.vehicles.splice(i, 1); }
    }
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const p = state.pickups[i];
      if (dist2(state.player.x, state.player.z, p.x, p.z) > maxD) { scene.remove(p.mesh); disposeObject(p.mesh); state.pickups.splice(i, 1); }
    }
    for (let i = state.npcs.length - 1; i >= 0; i--) {
      const n = state.npcs[i];
      if (dist2(state.player.x, state.player.z, n.x, n.z) > maxD) { scene.remove(n.mesh); disposeObject(n.mesh); state.npcs.splice(i, 1); }
    }
  }

  function getInput() {
    let x = 0, y = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) y += 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) y -= 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
    x += state.joystick.x; y += -state.joystick.y;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), sprint: state.player.sprint || state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'), jump: state.keys.has('Space') };
  }

  function wireInput() {
    window.addEventListener('keydown', (e) => {
      state.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyF') interact();
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyR') unstuck();
    });
    window.addEventListener('keyup', (e) => state.keys.delete(e.code));
    let drag = false, lastX = 0;
    canvas.addEventListener('pointerdown', (e) => { drag = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!drag || e.pointerType === 'touch') return; state.cameraYaw -= (e.clientX - lastX) * 0.006; lastX = e.clientX; });
    canvas.addEventListener('pointerup', () => { drag = false; });

    const jc = document.getElementById('joystick-container');
    const stick = document.getElementById('joystick-stick');
    if (jc && stick) {
      const reset = () => { state.joystick = { x: 0, y: 0, active: false }; stick.style.transform = 'translate(0,0)'; };
      jc.addEventListener('pointerdown', (e) => { state.joystick.active = true; jc.setPointerCapture?.(e.pointerId); moveJoy(e); });
      jc.addEventListener('pointermove', moveJoy);
      jc.addEventListener('pointerup', reset); jc.addEventListener('pointercancel', reset);
      function moveJoy(e) {
        if (!state.joystick.active) return;
        const r = jc.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const len = Math.max(1, Math.hypot(dx, dy));
        const max = r.width * 0.33;
        const nx = clamp(dx / max, -1, 1);
        const ny = clamp(dy / max, -1, 1);
        state.joystick.x = nx; state.joystick.y = ny;
        stick.style.transform = `translate(${dx / len * Math.min(max, len)}px,${dy / len * Math.min(max, len)}px)`;
      }
    }
    btn('btn-mobile-jump', () => { if (state.player.onGround) state.keys.add('Space'); setTimeout(() => state.keys.delete('Space'), 120); });
    holdButton('btn-mobile-sprint', (v) => state.player.sprint = v);
    btn('btn-mobile-interact', interact);
    btn('btn-mobile-unstuck', unstuck);
    btn('btn-mobile-pause', togglePause);
  }

  function wireMenus() {
    btn('btn-resume', togglePause);
    btn('btn-settings', () => settingsPanel?.classList.toggle('hidden'));
    btn('btn-close-settings', () => settingsPanel?.classList.add('hidden'));
    btn('btn-save', () => savePanel?.classList.remove('hidden'));
    btn('btn-load', () => savePanel?.classList.remove('hidden'));
    btn('btn-close-save', () => savePanel?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => saveGame(b.dataset.slot, true)));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    btn('btn-export', () => { if (exportJson) exportJson.value = JSON.stringify(packSave(), null, 2); });
    btn('btn-import', () => { try { applySave(JSON.parse(exportJson.value)); popup('Imported save'); } catch (e) { fail(e); popup('Bad import JSON'); } });
    const graphics = document.getElementById('graphics-quality');
    graphics?.addEventListener('change', () => setQuality(graphics.value));
    buildMissionBoard();
  }

  function buildMissionBoard() {
    if (!missionList) return;
    missionList.innerHTML = '';
    for (const m of missions) {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button"><strong>${m.title}</strong><br><small>${m.detail}</small></button>`;
      li.querySelector('button').addEventListener('click', () => { state.activeMission = { ...m }; missionBoard?.classList.add('hidden'); state.paused = false; pauseOverlay?.classList.add('hidden'); popup(`Mission set: ${m.title}`); });
      missionList.appendChild(li);
    }
  }

  function togglePause() { state.paused = !state.paused; pauseOverlay?.classList.toggle('hidden', !state.paused); }
  function unstuck() { state.player.y = 8; state.player.vy = 0; if (state.activeVehicle) { state.activeVehicle.x += 5; state.activeVehicle.z += 5; } popup('Unstuck'); }
  function addXP(v) { state.xp += v; while (state.xp >= state.level * 160) { state.xp -= state.level * 160; state.level++; state.cash += 75; popup(`Level ${state.level}! +$75`); } }

  function saveGame(slot = 'slot1', loud = false) {
    state.slot = slot; state.lastSave = performance.now();
    const data = packSave(); localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    window.NeonBlockCloud?.save?.(slot, data).then(() => setOnlineStatus(true)).catch(fail);
    if (loud) popup(`Saved ${slot}`);
  }
  function loadGame(slot = 'slot1') { const raw = localStorage.getItem(`neonblock:${slot}`); if (!raw) { popup('No local save found'); return; } applySave(JSON.parse(raw)); state.slot = slot; popup(`Loaded ${slot}`); }
  function hydrateFromSave() { try { const raw = localStorage.getItem('neonblock:slot1'); if (raw) applySave(JSON.parse(raw)); } catch (e) { fail(e); } }
  function packSave() { return { version: 1, player: { x: state.player.x, y: state.player.y, z: state.player.z, yaw: state.player.yaw }, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, owned: [...state.owned], activeMission: state.activeMission?.id || 'delivery' }; }
  function applySave(data) { if (!data) return; Object.assign(state.player, data.player || {}); state.cash = data.cash ?? state.cash; state.xp = data.xp ?? state.xp; state.level = data.level ?? state.level; state.wanted = data.wanted ?? state.wanted; state.owned = new Set(data.owned || []); const m = missions.find(x => x.id === data.activeMission); if (m) state.activeMission = { ...m }; }

  function drawMinimap() {
    if (!minimap) return;
    const w = minimapCanvas.width, h = minimapCanvas.height;
    minimap.clearRect(0, 0, w, h); minimap.fillStyle = '#061024'; minimap.fillRect(0, 0, w, h);
    minimap.strokeStyle = '#17f3ff55'; minimap.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { minimap.beginPath(); minimap.moveTo(w / 2 + i * 28, 0); minimap.lineTo(w / 2 + i * 28, h); minimap.stroke(); minimap.beginPath(); minimap.moveTo(0, h / 2 + i * 28); minimap.lineTo(w, h / 2 + i * 28); minimap.stroke(); }
    dot(w / 2, h / 2, '#39f7ff', 5);
    for (const v of state.vehicles) mapDot(v.x, v.z, '#ffbf3f', 3);
    for (const p of state.pickups) mapDot(p.x, p.z, '#fff466', 2);
    if (state.activeMission) mapDot(state.activeMission.target.x, state.activeMission.target.z, '#ffffff', 5);
    function mapDot(x, z, color, r) { const mx = w / 2 + (x - state.player.x) * 0.18; const my = h / 2 + (z - state.player.z) * 0.18; if (mx > -8 && mx < w + 8 && my > -8 && my < h + 8) dot(mx, my, color, r); }
    function dot(x, y, color, r) { minimap.fillStyle = color; minimap.beginPath(); minimap.arc(x, y, r, 0, Math.PI * 2); minimap.fill(); }
  }

  function updateHud() {
    fps.frames++; const now = performance.now(); if (now - fps.t > 500) { fps.value = Math.round(fps.frames * 1000 / (now - fps.t)); fps.frames = 0; fps.t = now; }
    set(hud.cash, `$${state.cash}`); set(hud.xp, `${state.xp}`); set(hud.level, state.level); set(hud.wanted, state.wanted);
    set(hud.vehicle, state.activeVehicle ? 'Driving' : 'On foot'); set(hud.hp, Math.round(state.activeVehicle?.hp ?? 100)); set(hud.gas, Math.round(state.activeVehicle?.gas ?? 100));
    set(hud.mission, state.activeMission?.title || 'None'); set(hud.fps, fps.value); set(hud.pos, `${Math.round(state.player.x)},${Math.round(state.player.y)},${Math.round(state.player.z)}`);
    set(hud.chunks, state.chunks.size); set(hud.npcs, state.npcs.length); set(hud.activeVehicle, state.activeVehicle ? 'Active' : 'None'); set(hud.saveSlot, state.slot); set(hud.lastError, state.lastError);
  }
  function setOnlineStatus(v) { state.online = v; set(hud.online, v ? 'cloud-ready' : 'offline'); set(hud.debugOnline, v ? 'cloud-ready' : 'offline'); }
  function setQuality(q) { state.quality = q; WORLD.renderRadius = q === 'low' ? 1 : q === 'high' ? 3 : 2; renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.65)); popup(`Graphics: ${q}`); }

  function render() { renderer.render(scene, camera); }
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function box(w, h, d, material, x = 0, y = 0, z = 0) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); return mesh; }
  function mat(color) { return new THREE.MeshLambertMaterial({ color }); }
  function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function text(id) { return document.getElementById(id); }
  function set(el, value) { if (el) el.textContent = value; }
  function btn(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
  function holdButton(id, fn) { const el = document.getElementById(id); if (!el) return; el.addEventListener('pointerdown', () => fn(true)); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => fn(false))); }
  function popup(message) { if (!rewardPopup) return; rewardPopup.textContent = message; rewardPopup.classList.remove('hidden'); clearTimeout(popup._t); popup._t = setTimeout(() => rewardPopup.classList.add('hidden'), 2200); }
  function fail(e) { state.lastError = e?.message || String(e); console.warn(e); }
  function showError(message) { fail(new Error(message)); if (loading) loading.innerHTML = `<div class="loading-title">NeonBlock City</div><div class="loading-sub">${message}</div>`; }
  function disposeObject(obj) { obj.traverse?.((o) => { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.()); else o.material?.dispose?.(); }); }
})();
