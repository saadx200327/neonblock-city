'use strict';

(function () {
  const THREE_REF = window.THREE;
  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: document.getElementById('hud-cash'), xp: document.getElementById('hud-xp'), level: document.getElementById('hud-level'),
    wanted: document.getElementById('hud-wanted'), online: document.getElementById('hud-online'), vehicle: document.getElementById('hud-vehicle'),
    hp: document.getElementById('hud-vehicle-hp'), gas: document.getElementById('hud-vehicle-gas'), mission: document.getElementById('hud-mission'),
    fps: document.getElementById('debug-fps'), pos: document.getElementById('debug-pos'), chunks: document.getElementById('debug-chunks'),
    npcs: document.getElementById('debug-npcs'), activeVehicle: document.getElementById('debug-active-vehicle'), saveSlot: document.getElementById('debug-save-slot'),
    debugOnline: document.getElementById('debug-online'), error: document.getElementById('debug-last-error')
  };
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimap = minimapCanvas.getContext('2d');
  const popup = document.getElementById('reward-popup');
  const pauseOverlay = document.getElementById('pause-overlay');
  const settingsPanel = document.getElementById('settings-panel');
  const savePanel = document.getElementById('save-panel');
  const exportBox = document.getElementById('export-json');
  const missionBoard = document.getElementById('mission-board');
  const missionList = document.getElementById('mission-list');
  const joystickContainer = document.getElementById('joystick-container');
  const joystickStick = document.getElementById('joystick-stick');

  if (!THREE_REF || !canvas) {
    document.body.innerHTML = '<main class="fatal-error"><h1>NeonBlock City</h1><p>Three.js failed to load. Check your connection and reload.</p></main>';
    return;
  }

  const scene = new THREE_REF.Scene();
  scene.background = new THREE_REF.Color(0x061026);
  scene.fog = new THREE_REF.Fog(0x061026, 80, 290);

  const camera = new THREE_REF.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);
  const renderer = new THREE_REF.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const hemi = new THREE_REF.HemisphereLight(0x8ecbff, 0x13091f, 1.65);
  scene.add(hemi);
  const sun = new THREE_REF.DirectionalLight(0xaedcff, 1.15);
  sun.position.set(60, 90, 40);
  scene.add(sun);

  const colors = {
    road: 0x11182f, grass: 0x08251e, sidewalk: 0x1b2243, buildingA: 0x18236a,
    buildingB: 0x38166a, neonA: 0x00f5ff, neonB: 0xff2bd6, cash: 0x59ff97, player: 0xffe66d,
    npc: 0xff59a8, vehicle: 0x2df8ff, owned: 0xffd166
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, new THREE_REF.MeshStandardMaterial({ color: v })]));
  materials.neonA.emissive = new THREE_REF.Color(colors.neonA); materials.neonA.emissiveIntensity = 1.1;
  materials.neonB.emissive = new THREE_REF.Color(colors.neonB); materials.neonB.emissiveIntensity = 1.0;
  materials.cash.emissive = new THREE_REF.Color(colors.cash); materials.cash.emissiveIntensity = 0.7;

  const state = {
    cash: 180, xp: 0, level: 1, wanted: 0, saveSlot: 'slot1', paused: false,
    player: { x: 0, y: 1.05, z: 0, vx: 0, vz: 0, heading: 0, onGround: true },
    activeVehicle: null, ownedLots: {}, completed: {}, missionIndex: 0, lastError: 'none',
    chunks: new Map(), pickups: [], npcs: [], vehicles: [], lots: [], t: 0, quality: 'auto'
  };

  const missions = [
    { id: 'rookie-run', name: 'Rookie Run', text: 'Collect 5 neon credits', type: 'collect', need: 5, reward: 175, xp: 70, progress: 0 },
    { id: 'first-ride', name: 'First Ride', text: 'Enter any hover car', type: 'vehicle', need: 1, reward: 220, xp: 90, progress: 0 },
    { id: 'landlord', name: 'Block Owner', text: 'Buy one city lot', type: 'own', need: 1, reward: 350, xp: 140, progress: 0 }
  ];

  const keys = new Set();
  const input = { x: 0, z: 0, jump: false, sprint: false, interact: false };
  const chunkSize = 52;
  const streamRadius = 2;

  function meshBox(w, h, d, mat, x, y, z) {
    const mesh = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  const playerMesh = meshBox(1.2, 2.1, 1.2, materials.player, 0, 1.05, 0);
  const shadow = new THREE_REF.Mesh(new THREE_REF.CircleGeometry(1.15, 18), new THREE_REF.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  function seeded(cx, cz) { const n = Math.sin(cx * 127.1 + cz * 311.7) * 43758.5453; return n - Math.floor(n); }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function makeChunk(cx, cz) {
    const group = new THREE_REF.Group();
    group.userData = { cx, cz };
    const ox = cx * chunkSize, oz = cz * chunkSize;
    const ground = new THREE_REF.Mesh(new THREE_REF.PlaneGeometry(chunkSize, chunkSize), materials.grass);
    ground.rotation.x = -Math.PI / 2; ground.position.set(ox, 0, oz); group.add(ground);
    const roadX = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(chunkSize, 0.05, 8), materials.road); roadX.position.set(ox, 0.03, oz); group.add(roadX);
    const roadZ = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(8, 0.05, chunkSize), materials.road); roadZ.position.set(ox, 0.04, oz); group.add(roadZ);
    for (let i = 0; i < 6; i++) {
      const r = seeded(cx + i, cz - i);
      const bx = ox - 20 + (i % 3) * 20 + r * 5;
      const bz = oz - 20 + Math.floor(i / 3) * 40 + seeded(cx - i, cz + i) * 5;
      if (Math.abs(bx - ox) < 7 || Math.abs(bz - oz) < 7) continue;
      const h = 7 + Math.floor(r * 18);
      const mat = r > 0.5 ? materials.buildingA : materials.buildingB;
      const b = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(9, h, 9), mat);
      b.position.set(bx, h / 2, bz); group.add(b);
      const sign = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(9.4, 0.55, 0.3), r > 0.5 ? materials.neonA : materials.neonB);
      sign.position.set(bx, Math.min(h - 1, 7), bz + 4.7); group.add(sign);
    }
    scene.add(group);
    return group;
  }

  function ensureWorld() {
    const pcx = Math.round(state.player.x / chunkSize), pcz = Math.round(state.player.z / chunkSize);
    const wanted = new Set();
    for (let cx = pcx - streamRadius; cx <= pcx + streamRadius; cx++) for (let cz = pcz - streamRadius; cz <= pcz + streamRadius; cz++) {
      const key = chunkKey(cx, cz); wanted.add(key);
      if (!state.chunks.has(key)) state.chunks.set(key, makeChunk(cx, cz));
    }
    for (const [key, group] of state.chunks) if (!wanted.has(key)) { scene.remove(group); disposeObject(group); state.chunks.delete(key); }
  }

  function disposeObject(obj) { obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

  function spawnStaticWorld() {
    for (let i = 0; i < 38; i++) {
      const x = (seeded(i, 6) - 0.5) * 270, z = (seeded(9, i) - 0.5) * 270;
      const coin = meshBox(1, 0.28, 1, materials.cash, x, 0.55, z);
      coin.userData = { value: 25 + Math.floor(seeded(i, i) * 45), taken: false };
      state.pickups.push(coin);
    }
    for (let i = 0; i < 8; i++) {
      const v = meshBox(2.4, 1, 4, materials.vehicle, -45 + i * 13, 0.55, 16 + (i % 2) * 10);
      v.userData = { id: `car-${i}`, hp: 100, gas: 100, speed: 16 + i * 0.8, owned: false };
      state.vehicles.push(v);
    }
    for (let i = 0; i < 9; i++) {
      const lot = meshBox(9, 0.14, 9, materials.sidewalk, 28 + (i % 3) * 22, 0.08, -42 + Math.floor(i / 3) * 22);
      lot.userData = { id: `lot-${i}`, price: 220 + i * 80, owned: false };
      state.lots.push(lot);
    }
    for (let i = 0; i < 16; i++) {
      const npc = meshBox(1, 1.8, 1, materials.npc, (seeded(i, 2) - 0.5) * 180, 0.9, (seeded(2, i) - 0.5) * 180);
      npc.userData = { baseX: npc.position.x, baseZ: npc.position.z, speed: 0.5 + seeded(i, i) * 0.8, phase: i };
      state.npcs.push(npc);
    }
  }

  function updateInput() {
    input.x = 0; input.z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) input.x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) input.x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) input.z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) input.z += 1;
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.sprint;
  }

  function tryInteract() {
    const p = playerMesh.position;
    if (state.activeVehicle) { state.activeVehicle = null; toast('Exited vehicle'); return; }
    let nearest = null, dist = 999;
    for (const v of state.vehicles) {
      const d = v.position.distanceTo(p); if (d < dist) { dist = d; nearest = v; }
    }
    if (nearest && dist < 5) {
      state.activeVehicle = nearest;
      const mission = missions[state.missionIndex];
      if (mission && mission.type === 'vehicle') advanceMission(1);
      toast('Entered hover car'); return;
    }
    for (const lot of state.lots) {
      if (lot.position.distanceTo(p) < 6) {
        if (lot.userData.owned) return toast('You already own this lot');
        if (state.cash < lot.userData.price) return toast(`Need $${lot.userData.price}`);
        state.cash -= lot.userData.price; lot.userData.owned = true; state.ownedLots[lot.userData.id] = true; lot.material = materials.owned;
        advanceMission(1); toast(`Bought ${lot.userData.id}`); saveGame(); return;
      }
    }
    toast('Move near a car or lot');
  }

  function advanceMission(amount) {
    const m = missions[state.missionIndex];
    if (!m || state.completed[m.id]) return;
    m.progress = Math.min(m.need, m.progress + amount);
    if (m.progress >= m.need) {
      state.completed[m.id] = true; state.cash += m.reward; state.xp += m.xp; state.missionIndex = Math.min(missions.length - 1, state.missionIndex + 1);
      while (state.xp >= state.level * 120) { state.xp -= state.level * 120; state.level += 1; }
      toast(`Mission complete: ${m.name} +$${m.reward}`); saveGame();
    }
  }

  function updateGame(dt) {
    updateInput();
    const p = state.player;
    const speed = state.activeVehicle ? state.activeVehicle.userData.speed : (input.sprint ? 10 : 6);
    const len = Math.hypot(input.x, input.z) || 1;
    p.vx = (input.x / len) * speed; p.vz = (input.z / len) * speed;
    if (!input.x && !input.z) { p.vx *= 0; p.vz *= 0; }
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (input.jump && p.onGround && !state.activeVehicle) { p.y = 2.8; p.onGround = false; }
    if (!p.onGround) { p.y -= 10 * dt; if (p.y <= 1.05) { p.y = 1.05; p.onGround = true; } }
    playerMesh.position.set(p.x, p.y, p.z); shadow.position.set(p.x, 0.03, p.z);
    if (Math.abs(p.vx) + Math.abs(p.vz) > 0.01) p.heading = Math.atan2(p.vx, p.vz);
    playerMesh.rotation.y = p.heading;
    if (state.activeVehicle) {
      state.activeVehicle.position.set(p.x, 0.55, p.z); state.activeVehicle.rotation.y = p.heading;
      state.activeVehicle.userData.gas = Math.max(0, state.activeVehicle.userData.gas - dt * 1.8);
      if (state.activeVehicle.userData.gas <= 0) { state.activeVehicle = null; toast('Out of gas'); }
    }
    for (const coin of state.pickups) if (!coin.userData.taken && coin.position.distanceTo(playerMesh.position) < 2.4) {
      coin.userData.taken = true; coin.visible = false; state.cash += coin.userData.value; advanceMission(1); toast(`+$${coin.userData.value}`);
    }
    state.npcs.forEach((npc) => {
      npc.userData.phase += dt * npc.userData.speed;
      npc.position.x = npc.userData.baseX + Math.sin(npc.userData.phase) * 5;
      npc.position.z = npc.userData.baseZ + Math.cos(npc.userData.phase * 0.8) * 5;
    });
    ensureWorld();
    updateCamera(dt); updateHud(); drawMinimap();
  }

  function updateCamera() {
    const followDistance = state.activeVehicle ? 16 : 11;
    const height = state.activeVehicle ? 9 : 7;
    const targetX = state.player.x - Math.sin(state.player.heading) * followDistance;
    const targetZ = state.player.z - Math.cos(state.player.heading) * followDistance;
    camera.position.lerp(new THREE_REF.Vector3(targetX, height, targetZ), 0.12);
    camera.lookAt(state.player.x, state.player.y + 1.2, state.player.z);
  }

  function updateHud() {
    const m = missions[state.missionIndex];
    hud.cash.textContent = `$${Math.floor(state.cash)}`; hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level;
    hud.wanted.textContent = state.wanted; hud.online.textContent = window.NeonCloudSave?.enabled ? 'cloud optional' : 'offline'; hud.debugOnline.textContent = hud.online.textContent;
    hud.vehicle.textContent = state.activeVehicle ? state.activeVehicle.userData.id : 'On foot';
    hud.hp.textContent = state.activeVehicle ? Math.ceil(state.activeVehicle.userData.hp) : 100;
    hud.gas.textContent = state.activeVehicle ? Math.ceil(state.activeVehicle.userData.gas) : 100;
    hud.mission.textContent = m ? `${m.name}: ${m.progress}/${m.need}` : 'All done';
    hud.pos.textContent = `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`;
    hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = hud.vehicle.textContent;
    hud.saveSlot.textContent = state.saveSlot; hud.error.textContent = state.lastError;
  }

  function drawMinimap() {
    minimap.clearRect(0, 0, 160, 160); minimap.fillStyle = '#050814'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff55'; minimap.strokeRect(1, 1, 158, 158);
    minimap.fillStyle = '#17f3ff'; minimap.fillRect(78, 78, 4, 4);
    const scale = 0.55;
    minimap.fillStyle = '#59ff97';
    state.pickups.forEach(c => { if (!c.userData.taken) { const x = 80 + (c.position.x - state.player.x) * scale; const y = 80 + (c.position.z - state.player.z) * scale; if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x, y, 2, 2); } });
    minimap.fillStyle = '#2df8ff';
    state.vehicles.forEach(v => { const x = 80 + (v.position.x - state.player.x) * scale; const y = 80 + (v.position.z - state.player.z) * scale; if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x, y, 3, 3); });
  }

  function savePayload() {
    return { version: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player,
      ownedLots: state.ownedLots, completed: state.completed, missionIndex: state.missionIndex,
      pickups: state.pickups.map(c => c.userData.taken), vehicles: state.vehicles.map(v => ({ id: v.userData.id, hp: v.userData.hp, gas: v.userData.gas })) };
  }
  async function saveGame(slot = state.saveSlot) {
    state.saveSlot = slot; const payload = savePayload(); localStorage.setItem(`neonblock:${slot}`, JSON.stringify(payload));
    try { await window.NeonCloudSave?.save?.(slot, payload); } catch (e) { state.lastError = `cloud save: ${e.message}`; }
    toast(`Saved ${slot}`);
  }
  async function loadGame(slot = state.saveSlot) {
    state.saveSlot = slot; let data = null;
    try { data = await window.NeonCloudSave?.load?.(slot); } catch (e) { state.lastError = `cloud load: ${e.message}`; }
    if (!data) data = JSON.parse(localStorage.getItem(`neonblock:${slot}`) || 'null');
    if (!data) return toast('No save found');
    Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, ownedLots: data.ownedLots || {}, completed: data.completed || {}, missionIndex: data.missionIndex || 0 });
    Object.assign(state.player, data.player || {});
    state.pickups.forEach((c, i) => { c.userData.taken = !!data.pickups?.[i]; c.visible = !c.userData.taken; });
    state.lots.forEach(l => { l.userData.owned = !!state.ownedLots[l.userData.id]; l.material = l.userData.owned ? materials.owned : materials.sidewalk; });
    toast(`Loaded ${slot}`);
  }

  function toast(text) { popup.textContent = text; popup.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => popup.classList.add('hidden'), 1500); }
  function setPaused(v) { state.paused = v; pauseOverlay.classList.toggle('hidden', !v); }
  function unstuck() { state.player.x = 0; state.player.z = 0; state.player.y = 1.05; state.activeVehicle = null; toast('Unstuck'); }

  window.addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyE') tryInteract(); if (e.code === 'Escape') setPaused(!state.paused); if (e.code === 'KeyU') unstuck(); if (e.code === 'Space') input.jump = true; });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Space') input.jump = false; });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  document.getElementById('btn-resume').onclick = () => setPaused(false);
  document.getElementById('btn-settings').onclick = () => settingsPanel.classList.toggle('hidden');
  document.getElementById('btn-save').onclick = () => savePanel.classList.toggle('hidden');
  document.getElementById('btn-load').onclick = () => loadGame();
  document.getElementById('btn-close-settings').onclick = () => settingsPanel.classList.add('hidden');
  document.getElementById('btn-close-save').onclick = () => savePanel.classList.add('hidden');
  document.getElementById('btn-close-missions').onclick = () => missionBoard.classList.add('hidden');
  document.getElementById('graphics-quality').onchange = (e) => { state.quality = e.target.value; renderer.setPixelRatio(state.quality === 'high' ? Math.min(devicePixelRatio, 2) : state.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.6)); };
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => saveGame(b.dataset.slot));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => loadGame(b.dataset.slot));
  document.getElementById('btn-export').onclick = () => { exportBox.value = JSON.stringify(savePayload(), null, 2); };
  document.getElementById('btn-import').onclick = () => { try { localStorage.setItem(`neonblock:${state.saveSlot}`, exportBox.value); loadGame(); } catch (e) { state.lastError = e.message; toast('Bad JSON'); } };
  document.getElementById('btn-mobile-jump').ontouchstart = () => { input.jump = true; }; document.getElementById('btn-mobile-jump').ontouchend = () => { input.jump = false; };
  document.getElementById('btn-mobile-sprint').ontouchstart = () => { input.sprint = true; }; document.getElementById('btn-mobile-sprint').ontouchend = () => { input.sprint = false; };
  document.getElementById('btn-mobile-interact').onclick = tryInteract; document.getElementById('btn-mobile-unstuck').onclick = unstuck; document.getElementById('btn-mobile-pause').onclick = () => setPaused(!state.paused);

  let joyId = null, joyCenter = { x: 0, y: 0 };
  joystickContainer.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joystickContainer.setPointerCapture(joyId); const r = joystickContainer.getBoundingClientRect(); joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  joystickContainer.addEventListener('pointermove', (e) => { if (e.pointerId !== joyId) return; const dx = e.clientX - joyCenter.x, dy = e.clientY - joyCenter.y; const len = Math.min(44, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); input.x = Math.cos(a) * (len / 44); input.z = Math.sin(a) * (len / 44); joystickStick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`; });
  joystickContainer.addEventListener('pointerup', () => { joyId = null; input.x = 0; input.z = 0; joystickStick.style.transform = 'translate(0,0)'; });

  missionList.innerHTML = missions.map(m => `<li><strong>${m.name}</strong><br>${m.text}<br>Reward $${m.reward} / ${m.xp} XP</li>`).join('');

  let last = performance.now(), frames = 0, fpsT = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!state.paused) updateGame(dt);
    renderer.render(scene, camera);
    frames++; fpsT += dt; if (fpsT > 0.5) { hud.fps.textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    requestAnimationFrame(loop);
  }

  spawnStaticWorld(); ensureWorld(); loadGame('slot1').catch(() => {});
  setTimeout(() => loading?.classList.add('hidden'), 350);
  requestAnimationFrame(loop);
  setInterval(() => saveGame(state.saveSlot), 30000);
})();
