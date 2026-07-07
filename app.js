(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const $ = (id) => document.getElementById(id);
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), debugOnline: $('debug-online'), error: $('debug-last-error')
  };

  if (!window.THREE) {
    if (loading) loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load. Check internet or cache.</div>';
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 120, 420);

  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);

  const hemi = new THREE.HemisphereLight(0x9be7ff, 0x090b16, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(80, 120, 40);
  scene.add(sun);

  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x0a1028, roughness: 0.92 }),
    road: new THREE.MeshStandardMaterial({ color: 0x171a26, roughness: 0.86 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.45, emissive: 0x062b34 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3df2, roughness: 0.35, emissive: 0x2a0628 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x5ef38c, roughness: 0.4, emissive: 0x082d13 }),
    lot: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5, emissive: 0x2a1c00 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x111111 })
  };

  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false, activeVehicle: null,
    missionIndex: 0, ownedLots: {}, collectedCrates: {}, lastError: 'none', quality: localStorage.getItem('neonblock-quality') || 'auto'
  };
  const missions = [
    { name: 'Collect 3 neon crates', kind: 'crate', target: 3, progress: 0, cash: 90, xp: 60 },
    { name: 'Buy your first lot', kind: 'lot', target: 1, progress: 0, cash: 140, xp: 90 },
    { name: 'Drive through 5 districts', kind: 'drive', target: 5, progress: 0, cash: 180, xp: 110 }
  ];

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.2, 1.4), mats.player);
  body.position.y = 2.25;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), mats.player);
  head.position.y = 4.55;
  player.add(body, head);
  player.position.set(0, 0, 0);
  scene.add(player);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const keys = new Set();
  const input = { x: 0, y: 0, sprint: false, jump: false, interact: false, lastInteract: 0 };
  const chunks = new Map();
  const vehicles = [];
  const crates = [];
  const lots = [];
  const npcs = [];
  const visitedDistricts = new Set();
  const velocity = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function addRoad(x, z, horizontal) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 54 : 8, 0.08, horizontal ? 8 : 54), mats.road);
    mesh.position.set(x, 0.04, z);
    scene.add(mesh);
    return mesh;
  }

  function chunkKey(cx, cz) { return cx + ',' + cz; }
  function seeded(cx, cz, n) { return Math.abs(Math.sin(cx * 127.1 + cz * 311.7 + n * 19.19) * 43758.5453) % 1; }

  function buildChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (chunks.has(key)) return;
    const group = new THREE.Group();
    group.userData.key = key;
    const baseX = cx * 54;
    const baseZ = cz * 54;
    group.add(addRoad(baseX, baseZ, true));
    group.add(addRoad(baseX, baseZ, false));

    for (let i = 0; i < 5; i++) {
      const h = 10 + seeded(cx, cz, i) * 34;
      const w = 6 + seeded(cx, cz, i + 11) * 10;
      const d = 6 + seeded(cx, cz, i + 22) * 10;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.52 + seeded(cx, cz, i + 33) * 0.28, 0.7, 0.42), roughness: 0.55, emissive: 0x050820 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(baseX - 20 + seeded(cx, cz, i + 44) * 40, h / 2, baseZ - 20 + seeded(cx, cz, i + 55) * 40);
      group.add(b);
    }

    if (seeded(cx, cz, 71) > 0.58) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), mats.crate);
      crate.position.set(baseX - 22 + seeded(cx, cz, 72) * 44, 1.2, baseZ - 22 + seeded(cx, cz, 73) * 44);
      crate.userData.id = 'crate-' + key;
      crate.userData.kind = 'crate';
      if (!state.collectedCrates[crate.userData.id]) { group.add(crate); crates.push(crate); }
    }

    if (seeded(cx, cz, 81) > 0.7) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), mats.lot);
      lot.position.set(baseX + 16, 0.14, baseZ - 16);
      lot.userData.id = 'lot-' + key;
      lot.userData.kind = 'lot';
      lot.userData.price = 100 + Math.floor(seeded(cx, cz, 82) * 240);
      group.add(lot); lots.push(lot);
    }

    if (seeded(cx, cz, 91) > 0.68) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 7), mats.car);
      car.position.set(baseX - 16, 0.9, baseZ + 16);
      car.userData = { kind: 'vehicle', hp: 100, gas: 100, id: 'car-' + key };
      group.add(car); vehicles.push(car);
    }

    if (seeded(cx, cz, 99) > 0.74) {
      const npc = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 1.4), mats.npc);
      npc.position.set(baseX + 20, 1.5, baseZ + 20);
      npc.userData = { kind: 'npc', tip: 'Tip: crates, lots, and cars save locally.' };
      group.add(npc); npcs.push(npc);
    }

    scene.add(group);
    chunks.set(key, group);
  }

  function streamWorld() {
    const cx = Math.round(player.position.x / 54);
    const cz = Math.round(player.position.z / 54);
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) buildChunk(x, z);
    for (const [key, group] of chunks) {
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > 3 || Math.abs(gz - cz) > 3) {
        scene.remove(group); chunks.delete(key);
      }
    }
    if (state.activeVehicle) visitedDistricts.add(chunkKey(cx, cz));
  }

  function currentMission() { return missions[state.missionIndex] || null; }
  function reward(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 1800);
  }
  function advanceMission(kind) {
    const m = currentMission();
    if (!m || m.kind !== kind) return;
    m.progress = kind === 'drive' ? Math.min(m.target, visitedDistricts.size) : Math.min(m.target, m.progress + 1);
    if (m.progress >= m.target) {
      state.cash += m.cash; state.xp += m.xp; state.missionIndex += 1;
      state.level = 1 + Math.floor(state.xp / 100);
      reward('Mission complete +' + m.cash + ' cash');
      saveGame(false);
    }
  }

  function interact() {
    const now = performance.now();
    if (now - input.lastInteract < 250) return;
    input.lastInteract = now;
    if (state.activeVehicle) { state.activeVehicle = null; reward('Exited vehicle'); return; }

    const near = (arr, dist) => arr.find((obj) => obj.parent && obj.position.distanceTo(player.position) < dist);
    const crate = near(crates, 5);
    if (crate) {
      state.collectedCrates[crate.userData.id] = true;
      crate.parent.remove(crate);
      state.cash += 25; state.xp += 15;
      reward('+25 cash crate'); advanceMission('crate'); saveGame(false); return;
    }
    const lot = near(lots, 7);
    if (lot) {
      if (state.ownedLots[lot.userData.id]) { reward('Lot already owned'); return; }
      if (state.cash < lot.userData.price) { reward('Need ' + lot.userData.price + ' cash'); return; }
      state.cash -= lot.userData.price; state.ownedLots[lot.userData.id] = true; lot.material = mats.player;
      reward('Lot purchased'); advanceMission('lot'); saveGame(false); return;
    }
    const car = near(vehicles, 8);
    if (car) { state.activeVehicle = car; reward('Entered vehicle'); return; }
    const npc = near(npcs, 7);
    if (npc) reward(npc.userData.tip);
  }

  function savePayload() {
    return { v: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, missionIndex: state.missionIndex,
      ownedLots: state.ownedLots, collectedCrates: state.collectedCrates, pos: player.position.toArray(), quality: state.quality, savedAt: new Date().toISOString() };
  }
  async function saveGame(show = true, slot = state.slot) {
    const data = savePayload();
    localStorage.setItem('neonblock-' + slot, JSON.stringify(data));
    if (window.NeonBlockCloud && window.NeonBlockCloud.enabled) await window.NeonBlockCloud.save(slot, data).catch((e) => state.lastError = e.message || 'cloud save failed');
    if (show) reward('Saved ' + slot);
  }
  async function loadGame(slot = state.slot) {
    let data = null;
    if (window.NeonBlockCloud && window.NeonBlockCloud.enabled) data = await window.NeonBlockCloud.load(slot).catch(() => null);
    data = data || JSON.parse(localStorage.getItem('neonblock-' + slot) || 'null');
    if (!data) { reward('No save in ' + slot); return; }
    Object.assign(state, { cash: data.cash || 0, xp: data.xp || 0, level: data.level || 1, wanted: data.wanted || 0, missionIndex: data.missionIndex || 0, ownedLots: data.ownedLots || {}, collectedCrates: data.collectedCrates || {}, quality: data.quality || state.quality });
    player.position.fromArray(data.pos || [0, 0, 0]);
    reward('Loaded ' + slot);
  }

  addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === 'Escape') togglePause(); if (e.key.toLowerCase() === 'e') interact(); });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  function bindButton(id, fn) { const b = $(id); if (b) b.addEventListener('click', fn); }
  function togglePause(force) { state.paused = typeof force === 'boolean' ? force : !state.paused; $('pause-overlay')?.classList.toggle('hidden', !state.paused); }
  bindButton('btn-resume', () => togglePause(false)); bindButton('btn-mobile-pause', () => togglePause());
  bindButton('btn-mobile-interact', interact); bindButton('btn-mobile-unstuck', () => { player.position.y = 0; reward('Unstuck'); });
  bindButton('btn-save', () => $('save-panel')?.classList.toggle('hidden'));
  bindButton('btn-load', () => loadGame()); bindButton('btn-close-save', () => $('save-panel')?.classList.add('hidden'));
  bindButton('btn-settings', () => $('settings-panel')?.classList.toggle('hidden'));
  bindButton('btn-close-settings', () => $('settings-panel')?.classList.add('hidden'));
  bindButton('btn-export', () => { $('export-json').value = JSON.stringify(savePayload(), null, 2); });
  bindButton('btn-import', () => { try { localStorage.setItem('neonblock-' + state.slot, $('export-json').value); loadGame(); } catch (e) { state.lastError = e.message; reward('Import failed'); } });
  document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; saveGame(true, state.slot); }));
  document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; loadGame(state.slot); }));
  $('graphics-quality')?.addEventListener('change', (e) => { state.quality = e.target.value; localStorage.setItem('neonblock-quality', state.quality); renderer.setPixelRatio(state.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.5)); });

  const joy = $('joystick-container'), stick = $('joystick-stick');
  if (joy && stick) {
    const resetJoy = () => { input.x = 0; input.y = 0; stick.style.transform = 'translate(0,0)'; };
    joy.addEventListener('pointermove', (e) => {
      const r = joy.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2);
      const len = Math.max(1, Math.hypot(dx, dy)); const mag = Math.min(1, len / 44);
      input.x = (dx / len) * mag; input.y = (dy / len) * mag; stick.style.transform = `translate(${input.x * 34}px,${input.y * 34}px)`;
    });
    joy.addEventListener('pointerup', resetJoy); joy.addEventListener('pointercancel', resetJoy); joy.addEventListener('pointerleave', resetJoy);
  }
  bindButton('btn-mobile-jump', () => input.jump = true);
  const sprintBtn = $('btn-mobile-sprint'); if (sprintBtn) sprintBtn.addEventListener('pointerdown', () => input.sprint = true); if (sprintBtn) sprintBtn.addEventListener('pointerup', () => input.sprint = false);

  let last = performance.now(), frames = 0, fpsTime = last;
  function update(dt) {
    if (state.paused) return;
    const forward = (keys.has('w') || keys.has('arrowup') ? -1 : 0) + (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + input.y;
    const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0) + (keys.has('a') || keys.has('arrowleft') ? -1 : 0) + input.x;
    const speed = state.activeVehicle ? 28 : ((keys.has('shift') || input.sprint) ? 16 : 9);
    tmp.set(side, 0, forward);
    if (tmp.lengthSq() > 0.001) tmp.normalize().multiplyScalar(speed * dt);
    player.position.add(tmp);
    if (state.activeVehicle) {
      state.activeVehicle.position.copy(player.position).add(new THREE.Vector3(0, 0.9, 0));
      state.activeVehicle.userData.gas = Math.max(0, state.activeVehicle.userData.gas - dt * 1.2);
      if (state.activeVehicle.userData.gas <= 0) state.activeVehicle = null;
      advanceMission('drive');
    }
    if (keys.has('e') || input.interact) interact();
    streamWorld();
    const camOffset = state.activeVehicle ? new THREE.Vector3(0, 32, 42) : new THREE.Vector3(0, 20, 28);
    camera.position.lerp(player.position.clone().add(camOffset), 0.08);
    camera.lookAt(player.position.x, player.position.y + 2, player.position.z);
  }
  function renderHud(now) {
    const m = currentMission();
    hud.cash.textContent = '$' + state.cash; hud.xp.textContent = state.xp; hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.online.textContent = window.NeonBlockCloud && window.NeonBlockCloud.enabled ? 'cloud' : 'offline'; hud.debugOnline.textContent = hud.online.textContent;
    hud.vehicle.textContent = state.activeVehicle ? 'Neon car' : 'On foot'; hud.hp.textContent = state.activeVehicle ? Math.round(state.activeVehicle.userData.hp) : 100;
    hud.gas.textContent = state.activeVehicle ? Math.round(state.activeVehicle.userData.gas) : 100; hud.mission.textContent = m ? `${m.name} ${m.progress}/${m.target}` : 'Free roam';
    hud.pos.textContent = player.position.x.toFixed(0) + ',' + player.position.y.toFixed(0) + ',' + player.position.z.toFixed(0); hud.chunks.textContent = chunks.size;
    hud.npcs.textContent = npcs.filter((n) => n.parent).length; hud.activeVehicle.textContent = state.activeVehicle ? state.activeVehicle.userData.id : 'None'; hud.slot.textContent = state.slot; hud.error.textContent = state.lastError;
    frames++; if (now - fpsTime > 500) { hud.fps.textContent = Math.round(frames * 1000 / (now - fpsTime)); fpsTime = now; frames = 0; }
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); renderHud(now); renderer.render(scene, camera); requestAnimationFrame(loop);
  }
  streamWorld(); loadGame('slot1').catch(() => null);
  setInterval(() => saveGame(false), 30000);
  if (loading) setTimeout(() => loading.classList.add('hidden'), 300);
  requestAnimationFrame(loop);
})();
