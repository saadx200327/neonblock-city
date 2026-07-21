(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), error: $('debug-last-error'), arrow: $('waypoint-arrow')
  };

  function reportError(message) {
    console.warn('[NeonBlock City]', message);
    if (hud.error) hud.error.textContent = String(message || 'none');
  }

  if (!window.THREE) {
    reportError('Three.js failed to load. Check network/CDN access.');
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 70, 260);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);

  const graphics = {
    quality: localStorage.getItem('neonblock:graphics') || 'auto',
    streamRadius: 2,
    unloadRadius: 3,
    buildings: 4,
    pixelRatioCap: 1.6,
    shadows: true
  };

  function applyGraphicsQuality(value = graphics.quality, rebuild = false) {
    graphics.quality = value || 'auto';
    localStorage.setItem('neonblock:graphics', graphics.quality);
    const isSmallScreen = Math.min(innerWidth, innerHeight) < 720;
    const effective = graphics.quality === 'auto' ? (isSmallScreen ? 'low' : 'medium') : graphics.quality;
    const presets = {
      low: { streamRadius: 1, unloadRadius: 2, buildings: 2, pixelRatioCap: 1, shadows: false },
      medium: { streamRadius: 2, unloadRadius: 3, buildings: 4, pixelRatioCap: 1.4, shadows: true },
      high: { streamRadius: 3, unloadRadius: 4, buildings: 5, pixelRatioCap: 1.75, shadows: true }
    };
    Object.assign(graphics, presets[effective] || presets.medium);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, graphics.pixelRatioCap));
    renderer.shadowMap.enabled = graphics.shadows;
    if (rebuild) rebuildVisibleWorld();
  }

  applyGraphicsQuality(graphics.quality, false);

  scene.add(new THREE.HemisphereLight(0x8fbfff, 0x111122, 1.65));
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(35, 70, 25);
  sun.castShadow = true;
  scene.add(sun);

  const mat = {
    ground: new THREE.MeshStandardMaterial({ color: 0x11172b, roughness: 0.9 }),
    road: new THREE.MeshStandardMaterial({ color: 0x080a14, roughness: 0.86 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x06343a, roughness: 0.45 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x332200 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xff4d88, emissive: 0x320014 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff355f, roughness: 0.4 }),
    taxi: new THREE.MeshStandardMaterial({ color: 0xffd338, roughness: 0.45 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x9c6cff, transparent: true, opacity: 0.46 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, transparent: true, opacity: 0.62 })
  };

  const world = new THREE.Group();
  scene.add(world);

  const player = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), mat.player),
    vel: new THREE.Vector3(), cash: 350, xp: 0, level: 1, wanted: 0, slot: 'slot1',
    ownedLots: {}, completed: {}, activeVehicle: null
  };
  player.mesh.position.set(0, 1, 0);
  player.mesh.castShadow = true;
  scene.add(player.mesh);

  const input = { forward: 0, turn: 0, sprint: false, jump: false, interact: false };
  const mobileInput = { forward: 0, turn: 0, sprint: false };
  const keys = new Set();
  const chunks = new Map();
  const vehicles = [];
  const crates = [];
  const npcs = [];
  const lots = [];
  const collectedCrateIds = new Set();
  const missions = [
    { id: 'courier', title: 'Courier Sprint', reward: 120, xp: 45, target: new THREE.Vector3(55, 0, -50), text: 'Reach the glowing delivery zone.' },
    { id: 'collector', title: 'Crate Collector', reward: 180, xp: 60, target: null, text: 'Collect 3 unique neon crates.' },
    { id: 'owner', title: 'First Property', reward: 260, xp: 90, target: new THREE.Vector3(-48, 0, 42), text: 'Buy any purple lot.' },
    { id: 'driver', title: 'Vehicle Delivery', reward: 220, xp: 80, target: new THREE.Vector3(-70, 0, 65), text: 'Drive any vehicle to the delivery marker.' }
  ];
  let activeMission = missions[0];
  let collectedCrates = 0;
  let yaw = Math.PI * 0.25;
  let paused = false;
  let last = performance.now();
  let fps = 60;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let lastAutosave = 0;
  let pendingActiveVehicle = null;
  const minimap = $('minimap-canvas')?.getContext('2d');

  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = graphics.shadows;
    mesh.receiveShadow = true;
    return mesh;
  }

  function seeded(cx, cz, n) {
    const value = Math.sin(cx * 129.898 + cz * 78.233 + n * 31.719) * 43758.5453;
    return value - Math.floor(value);
  }

  function spawnChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return;
    const group = new THREE.Group();
    group.userData.spawned = { vehicles: [], crates: [], npcs: [], lots: [] };
    const size = 48;
    const ox = cx * size;
    const oz = cz * size;
    group.add(box(size, 0.2, size, mat.ground, ox, -0.1, oz));
    group.add(box(size, 0.05, 7, mat.road, ox, 0.02, oz));
    group.add(box(7, 0.06, size, mat.road, ox, 0.03, oz));

    for (let i = 0; i < graphics.buildings; i++) {
      const h = 5 + Math.floor(seeded(cx, cz, i + 20) * 18);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.55 + seeded(cx, cz, i) * 0.18, 0.75, 0.25),
        emissive: new THREE.Color().setHSL(0.56 + seeded(cx, cz, i + 9) * 0.2, 0.95, 0.07)
      });
      group.add(box(7, h, 7, material, ox - 18 + i * 12, h / 2, oz + (seeded(cx, cz, i + 2) > 0.5 ? 15 : -15)));
    }

    if (seeded(cx, cz, 80) > 0.67) {
      const crateId = `crate-${cx}-${cz}`;
      if (!collectedCrateIds.has(crateId)) {
        const crate = box(1.6, 1.6, 1.6, mat.crate, ox + seeded(cx, cz, 81) * 28 - 14, 0.8, oz + seeded(cx, cz, 82) * 28 - 14);
        crate.userData = { type: 'crate', id: crateId };
        crates.push(crate);
        group.userData.spawned.crates.push(crate);
        group.add(crate);
      }
    }
    if (seeded(cx, cz, 90) > 0.72) {
      const vehicleId = `vehicle-${cx}-${cz}`;
      const isTaxi = seeded(cx, cz, 91) > 0.5;
      const car = box(2.4, 1.1, 4, isTaxi ? mat.taxi : mat.car, ox + 12, 0.65, oz);
      car.userData = { type: 'vehicle', id: vehicleId, name: isTaxi ? 'Taxi' : 'Neon Car', hp: 100, gas: 100 };
      if (pendingActiveVehicle?.id === vehicleId) {
        car.userData.hp = pendingActiveVehicle.hp ?? car.userData.hp;
        car.userData.gas = pendingActiveVehicle.gas ?? car.userData.gas;
        car.position.fromArray(pendingActiveVehicle.pos || car.position.toArray());
        player.activeVehicle = car;
        pendingActiveVehicle = null;
      }
      vehicles.push(car);
      group.userData.spawned.vehicles.push(car);
      group.add(car);
    }
    if (seeded(cx, cz, 100) > 0.72) {
      const lot = box(9, 0.16, 9, mat.lot, ox + seeded(cx, cz, 101) * 26 - 13, 0.08, oz + seeded(cx, cz, 102) * 26 - 13);
      lot.userData = { type: 'lot', id: `lot-${cx}-${cz}`, price: 500 + Math.floor(seeded(cx, cz, 103) * 700) };
      if (player.ownedLots[lot.userData.id]) lot.material = mat.owned;
      lots.push(lot);
      group.userData.spawned.lots.push(lot);
      group.add(lot);
    }
    if (seeded(cx, cz, 110) > 0.78 && graphics.quality !== 'low') {
      const npc = box(0.9, 1.8, 0.9, mat.npc, ox - 10, 0.9, oz + 10);
      npc.userData.phase = seeded(cx, cz, 111) * Math.PI * 2;
      npcs.push(npc);
      group.userData.spawned.npcs.push(npc);
      group.add(npc);
    }

    world.add(group);
    chunks.set(key, group);
  }

  function removeFrom(list, item) {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
  }

  function disposeGroup(group) {
    for (const bucket of Object.keys(group.userData.spawned || {})) {
      const list = bucket === 'vehicles' ? vehicles : bucket === 'crates' ? crates : bucket === 'npcs' ? npcs : lots;
      group.userData.spawned[bucket].forEach((item) => removeFrom(list, item));
    }
    group.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose?.();
      if (obj.material && !Object.values(mat).includes(obj.material)) obj.material.dispose?.();
    });
  }

  function rebuildVisibleWorld() {
    for (const group of chunks.values()) {
      world.remove(group);
      disposeGroup(group);
    }
    chunks.clear();
    vehicles.length = 0;
    crates.length = 0;
    npcs.length = 0;
    lots.length = 0;
    streamWorld();
  }

  function streamWorld() {
    const cx = Math.round(player.mesh.position.x / 48);
    const cz = Math.round(player.mesh.position.z / 48);
    for (let x = cx - graphics.streamRadius; x <= cx + graphics.streamRadius; x++) {
      for (let z = cz - graphics.streamRadius; z <= cz + graphics.streamRadius; z++) spawnChunk(x, z);
    }
    for (const [key, group] of chunks) {
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > graphics.unloadRadius || Math.abs(gz - cz) > graphics.unloadRadius) {
        if (player.activeVehicle && group.userData.spawned?.vehicles?.includes(player.activeVehicle)) continue;
        world.remove(group);
        disposeGroup(group);
        chunks.delete(key);
      }
    }
  }

  function readKeys() {
    const keyboardForward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const keyboardTurn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    input.forward = keyboardForward || mobileInput.forward;
    input.turn = keyboardTurn || mobileInput.turn;
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobileInput.sprint;
    input.jump = keys.has('Space') || input.jump;
    input.interact = keys.has('KeyE') || input.interact;
  }

  function move(dt) {
    const vehicleGas = player.activeVehicle?.userData.gas ?? 100;
    const canDrive = !player.activeVehicle || vehicleGas > 0;
    const speed = (player.activeVehicle ? 17 : 7.5) * (input.sprint ? 1.45 : 1);
    yaw -= input.turn * dt * 2.6;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (canDrive && Math.abs(input.forward) > 0.01) {
      player.vel.x += dir.x * input.forward * speed * dt * 7;
      player.vel.z += dir.z * input.forward * speed * dt * 7;
    }
    const drag = Math.pow(player.activeVehicle ? 0.86 : 0.72, dt * 60);
    player.vel.x *= drag;
    player.vel.z *= drag;
    player.vel.y -= 22 * dt;
    if (player.mesh.position.y <= 1.01) {
      player.mesh.position.y = 1;
      player.vel.y = Math.max(0, player.vel.y);
      if (input.jump && !player.activeVehicle) player.vel.y = 8;
    }
    player.mesh.position.addScaledVector(player.vel, dt);
    player.mesh.rotation.y = yaw;
    if (player.activeVehicle) {
      player.activeVehicle.position.copy(player.mesh.position);
      player.activeVehicle.position.y = 0.65;
      player.activeVehicle.rotation.y = yaw;
      player.activeVehicle.userData.gas = Math.max(0, player.activeVehicle.userData.gas - Math.abs(input.forward) * dt * 1.5);
      if (player.activeVehicle.userData.gas <= 0) popup('Vehicle out of gas');
    }
    input.jump = false;
  }

  function nearest(list, maxDist, filter = () => true) {
    let best = null;
    let bestDist = maxDist * maxDist;
    for (const item of list) {
      if (!item.parent || !filter(item)) continue;
      const dist = item.position.distanceToSquared(player.mesh.position);
      if (dist < bestDist) { bestDist = dist; best = item; }
    }
    return best;
  }

  function interact() {
    if (player.activeVehicle) {
      player.activeVehicle.position.copy(player.mesh.position).add(new THREE.Vector3(3, -0.35, 0));
      player.activeVehicle = null;
      return popup('Exited vehicle');
    }
    const car = nearest(vehicles, 5);
    if (car) { player.activeVehicle = car; return popup(`Entered ${car.userData.name}`); }
    const crate = nearest(crates, 4);
    if (crate) {
      collectedCrateIds.add(crate.userData.id);
      crate.parent.remove(crate);
      removeFrom(crates, crate);
      collectedCrates = collectedCrateIds.size;
      player.cash += 45;
      player.xp += 20;
      return popup('Crate collected: +$45');
    }
    const lot = nearest(lots, 5, (l) => !player.ownedLots[l.userData.id]);
    if (lot) {
      if (player.cash < lot.userData.price) return popup(`Need $${lot.userData.price}`);
      player.cash -= lot.userData.price;
      player.ownedLots[lot.userData.id] = true;
      lot.material = mat.owned;
      return popup(`Property bought: -$${lot.userData.price}`);
    }
    const npc = nearest(npcs, 4);
    if (npc) {
      activeMission = missions[(missions.indexOf(activeMission) + 1) % missions.length];
      return popup(`Tracked: ${activeMission.title}`);
    }
    popup('Nothing nearby');
  }

  function completeMission(mission) {
    player.completed[mission.id] = true;
    player.cash += mission.reward;
    player.xp += mission.xp;
    popup(`${mission.title} complete: +$${mission.reward}`);
    activeMission = missions.find((m) => !player.completed[m.id]) || missions[0];
  }

  function updateMissions() {
    if (activeMission.id === 'courier' && !player.completed.courier && player.mesh.position.distanceTo(activeMission.target) < 7) completeMission(activeMission);
    if (activeMission.id === 'collector' && !player.completed.collector && collectedCrates >= 3) completeMission(activeMission);
    if (activeMission.id === 'owner' && !player.completed.owner && Object.keys(player.ownedLots).length) completeMission(activeMission);
    if (activeMission.id === 'driver' && !player.completed.driver && player.activeVehicle && player.mesh.position.distanceTo(activeMission.target) < 8) completeMission(activeMission);
    const next = 100 + player.level * 80;
    if (player.xp >= next) { player.xp -= next; player.level++; popup(`Level ${player.level}`); }
  }

  function cameraFollow() {
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-12);
    camera.position.copy(player.mesh.position).add(back).add(new THREE.Vector3(0, player.activeVehicle ? 7 : 6, 0));
    camera.lookAt(player.mesh.position.x, player.mesh.position.y + 1.2, player.mesh.position.z);
  }

  function updateHud() {
    hud.cash.textContent = `$${Math.floor(player.cash)}`;
    hud.xp.textContent = Math.floor(player.xp);
    hud.level.textContent = player.level;
    hud.wanted.textContent = player.wanted;
    hud.online.textContent = window.NeonBlockCloud?.enabled ? 'cloud ready' : 'local';
    hud.vehicle.textContent = player.activeVehicle ? player.activeVehicle.userData.name : 'On foot';
    hud.hp.textContent = player.activeVehicle ? Math.floor(player.activeVehicle.userData.hp) : 100;
    hud.gas.textContent = player.activeVehicle ? Math.floor(player.activeVehicle.userData.gas) : 100;
    hud.mission.textContent = activeMission.title;
    hud.fps.textContent = fps;
    hud.pos.textContent = `${player.mesh.position.x.toFixed(1)},${player.mesh.position.y.toFixed(1)},${player.mesh.position.z.toFixed(1)}`;
    hud.chunks.textContent = chunks.size;
    hud.npcs.textContent = npcs.length;
    hud.activeVehicle.textContent = player.activeVehicle ? player.activeVehicle.userData.name : 'None';
    hud.slot.textContent = player.slot;
    hud.onlineDebug.textContent = window.NeonBlockCloud?.enabled ? 'cloud ready' : 'local';
    if (activeMission.target) {
      const toTarget = activeMission.target.clone().sub(player.mesh.position);
      hud.arrow.style.transform = `rotate(${Math.atan2(toTarget.x, toTarget.z) - yaw}rad)`;
      hud.arrow.textContent = '▲';
    } else {
      hud.arrow.textContent = '★';
    }
    drawMinimap();
  }

  function drawMinimap() {
    if (!minimap) return;
    minimap.clearRect(0, 0, 160, 160);
    minimap.fillStyle = '#050814';
    minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff55';
    for (let i = 0; i < 160; i += 24) {
      minimap.beginPath(); minimap.moveTo(i, 0); minimap.lineTo(i, 160); minimap.stroke();
      minimap.beginPath(); minimap.moveTo(0, i); minimap.lineTo(160, i); minimap.stroke();
    }
    minimap.fillStyle = '#17f3ff';
    minimap.fillRect(77, 77, 6, 6);
    if (player.activeVehicle) {
      minimap.fillStyle = '#ffd338';
      minimap.fillRect(68, 77, 5, 5);
    }
    if (activeMission.target) {
      minimap.fillStyle = '#5ef38c';
      const tx = Math.max(4, Math.min(152, 77 + (activeMission.target.x - player.mesh.position.x) * 0.5));
      const tz = Math.max(4, Math.min(152, 77 + (activeMission.target.z - player.mesh.position.z) * 0.5));
      minimap.fillRect(tx, tz, 6, 6);
    }
  }

  function popup(text) {
    const el = $('reward-popup');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timeout);
    popup.timeout = setTimeout(() => el.classList.add('hidden'), 1600);
  }

  function snapshotVehicle() {
    if (!player.activeVehicle) return null;
    return {
      id: player.activeVehicle.userData.id,
      name: player.activeVehicle.userData.name,
      hp: player.activeVehicle.userData.hp,
      gas: player.activeVehicle.userData.gas,
      pos: player.activeVehicle.position.toArray()
    };
  }

  function saveState(slot = player.slot) {
    player.slot = slot;
    const data = {
      version: 4,
      at: Date.now(),
      pos: player.mesh.position.toArray(),
      yaw,
      cash: player.cash,
      xp: player.xp,
      level: player.level,
      wanted: player.wanted,
      ownedLots: player.ownedLots,
      completed: player.completed,
      activeMissionId: activeMission.id,
      activeVehicle: snapshotVehicle(),
      collectedCrates,
      collectedCrateIds: Array.from(collectedCrateIds),
      graphicsQuality: graphics.quality
    };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    window.NeonBlockCloud?.save?.(slot, data).catch((e) => reportError(`cloud save failed: ${e.message}`));
    return data;
  }

  function loadState(slot = player.slot, data = null) {
    player.slot = slot;
    const raw = data || localStorage.getItem(`neonblock:${slot}`);
    if (!raw) return;
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    player.mesh.position.fromArray(saved.pos || [0, 1, 0]);
    yaw = saved.yaw || yaw;
    player.cash = saved.cash ?? player.cash;
    player.xp = saved.xp ?? player.xp;
    player.level = saved.level ?? player.level;
    player.wanted = saved.wanted ?? 0;
    player.ownedLots = saved.ownedLots || {};
    player.completed = saved.completed || {};
    collectedCrateIds.clear();
    (saved.collectedCrateIds || []).forEach((id) => collectedCrateIds.add(id));
    collectedCrates = Math.max(saved.collectedCrates || 0, collectedCrateIds.size);
    activeMission = missions.find((m) => m.id === saved.activeMissionId) || missions.find((m) => !player.completed[m.id]) || missions[0];
    pendingActiveVehicle = saved.activeVehicle || null;
    player.activeVehicle = null;
    if (saved.graphicsQuality) applyGraphicsQuality(saved.graphicsQuality, false);
    lots.forEach((lot) => { if (player.ownedLots[lot.userData.id]) lot.material = mat.owned; });
    rebuildVisibleWorld();
  }

  function wireMenus() {
    const overlay = $('pause-overlay');
    const settings = $('settings-panel');
    const saves = $('save-panel');
    const missionBoard = $('mission-board');
    const missionList = $('mission-list');
    const graphicsSelect = $('graphics-quality');
    const renderMissionList = () => {
      missionList.innerHTML = missions.map((m) => `<li><button data-mission="${m.id}">${m.title}${player.completed[m.id] ? ' ✓' : ''}</button><p>${m.text}</p></li>`).join('');
    };
    const setPause = (value) => {
      paused = value;
      overlay.classList.toggle('hidden', !value);
      renderMissionList();
    };
    if (graphicsSelect) {
      graphicsSelect.value = graphics.quality;
      graphicsSelect.onchange = () => { applyGraphicsQuality(graphicsSelect.value, true); popup(`Graphics: ${graphicsSelect.value}`); };
    }
    $('btn-resume').onclick = () => setPause(false);
    $('btn-mobile-pause').onclick = () => setPause(true);
    $('btn-settings').onclick = () => settings.classList.toggle('hidden');
    $('btn-close-settings').onclick = () => settings.classList.add('hidden');
    $('btn-save').onclick = () => saves.classList.toggle('hidden');
    $('btn-load').onclick = () => saves.classList.toggle('hidden');
    $('btn-missions')?.addEventListener('click', () => { renderMissionList(); missionBoard?.classList.toggle('hidden'); });
    $('btn-close-missions')?.addEventListener('click', () => missionBoard?.classList.add('hidden'));
    $('btn-close-save').onclick = () => saves.classList.add('hidden');
    $('btn-export').onclick = () => { $('export-json').value = JSON.stringify(saveState(), null, 2); popup('Save exported'); };
    $('btn-import').onclick = () => { try { loadState(player.slot, JSON.parse($('export-json').value)); popup('Save imported'); } catch (e) { reportError(e.message); popup('Import failed'); } };
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.onclick = () => { saveState(b.dataset.slot); popup(`Saved ${b.dataset.slot}`); });
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.onclick = () => { loadState(b.dataset.slot); popup(`Loaded ${b.dataset.slot}`); });
    document.addEventListener('keydown', (e) => { if (e.code === 'Escape' || e.code === 'KeyP') setPause(!paused); if (e.code === 'KeyM') { setPause(true); missionBoard?.classList.remove('hidden'); } });
    missionList.onclick = (e) => { const id = e.target?.dataset?.mission; if (id) { activeMission = missions.find((m) => m.id === id); popup(`Tracked ${activeMission.title}`); renderMissionList(); } };
    if (missionBoard) missionBoard.classList.add('hidden');
  }

  function wireControls() {
    addEventListener('keydown', (e) => { keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyE') input.interact = true; if (e.code === 'KeyU') { player.mesh.position.y = 4; player.vel.set(0, 0, 0); } });
    addEventListener('keyup', (e) => keys.delete(e.code));
    $('btn-mobile-jump').addEventListener('pointerdown', () => input.jump = true);
    $('btn-mobile-sprint').addEventListener('pointerdown', () => mobileInput.sprint = true);
    $('btn-mobile-sprint').addEventListener('pointerup', () => mobileInput.sprint = false);
    $('btn-mobile-sprint').addEventListener('pointercancel', () => mobileInput.sprint = false);
    $('btn-mobile-interact').addEventListener('pointerdown', () => input.interact = true);
    $('btn-mobile-unstuck').addEventListener('pointerdown', () => { player.mesh.position.y = 4; player.vel.set(0, 0, 0); });
    const joy = $('joystick-container');
    const stick = $('joystick-stick');
    let pointer = null;
    joy.addEventListener('pointerdown', (e) => { pointer = e.pointerId; joy.setPointerCapture(pointer); moveJoy(e); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) moveJoy(e); });
    joy.addEventListener('pointerup', resetJoy);
    joy.addEventListener('pointercancel', resetJoy);
    function moveJoy(e) {
      const rect = joy.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const len = Math.min(44, Math.hypot(x, y));
      const angle = Math.atan2(y, x);
      const sx = Math.cos(angle) * len;
      const sy = Math.sin(angle) * len;
      stick.style.transform = `translate(${sx}px, ${sy}px)`;
      mobileInput.forward = Math.max(-1, Math.min(1, -sy / 44));
      mobileInput.turn = Math.max(-1, Math.min(1, sx / 44));
    }
    function resetJoy() { pointer = null; mobileInput.forward = 0; mobileInput.turn = 0; stick.style.transform = 'translate(0,0)'; }
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); applyGraphicsQuality(graphics.quality, false); });
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsFrames++;
    fpsElapsed += dt;
    if (fpsElapsed > 0.5) { fps = Math.round(fpsFrames / fpsElapsed); fpsFrames = 0; fpsElapsed = 0; }
    if (!paused) {
      readKeys();
      if (input.interact) { interact(); input.interact = false; }
      move(dt);
      streamWorld();
      npcs.forEach((npc) => { if (npc.parent) { npc.position.x += Math.sin(now * 0.001 + npc.userData.phase) * 0.012; npc.position.z += Math.cos(now * 0.001 + npc.userData.phase) * 0.012; } });
      updateMissions();
      cameraFollow();
      if (now - lastAutosave > 15000) { lastAutosave = now; saveState(player.slot); }
    }
    updateHud();
    renderer.render(scene, camera);
  }

  window.NeonBlockGame = {
    saveState,
    loadState,
    applyGraphicsQuality,
    getSnapshot: () => ({ player, chunks: chunks.size, vehicles: vehicles.length, crates: crates.length, lots: lots.length, graphics: { ...graphics } })
  };

  wireControls();
  wireMenus();
  streamWorld();
  try { loadState(player.slot); } catch (e) { reportError(e.message); }
  loading?.classList.add('hidden');
  popup('WASD/Arrows move • E interact • M missions • P pause');
  requestAnimationFrame(tick);
})();