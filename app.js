(() => {
  'use strict';

  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const miniCanvas = $('minimap-canvas');
  const mini = miniCanvas ? miniCanvas.getContext('2d') : null;
  const smallScreen = matchMedia('(max-width: 760px)').matches;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const key = (x, z) => `${x},${z}`;
  const saveKey = (slot) => `neonblock-city:${slot}`;
  const flatDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  if (!THREE || !canvas) {
    if (loading) loading.textContent = 'Unable to start NeonBlock City. Three.js did not load.';
    return;
  }

  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), error: $('debug-last-error')
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, smallScreen ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !smallScreen;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, smallScreen ? 210 : 320);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 700);
  const clock = new THREE.Clock();
  let fpsFrames = 0;
  let fpsTimer = 0;

  scene.add(new THREE.HemisphereLight(0x9ed9ff, 0x1a1035, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(90, 120, 50);
  sun.castShadow = renderer.shadowMap.enabled;
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.75 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x10251d, roughness: 0.9 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.4, emissive: 0x06363c }),
    glass: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.2, emissive: 0x092026 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.5, emissive: 0x3a2500 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x5ef38c, roughness: 0.45, emissive: 0x12361d }),
    lot: new THREE.MeshStandardMaterial({ color: 0x7d5cff, roughness: 0.35, emissive: 0x120833 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x00ff99, roughness: 0.35, emissive: 0x06351f }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.35, emissive: 0x330313 })
  };

  const world = new THREE.Group();
  scene.add(world);
  const player = {
    pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(), yaw: 0, grounded: true,
    cash: 150, xp: 0, level: 1, wanted: 0, slot: 'slot1', activeVehicle: null,
    ownedLots: new Set(), picked: new Set(), missionId: 'welcome'
  };
  const input = { keys: new Set(), joy: { x: 0, y: 0 }, jump: false, interact: false, look: false, lastX: 0 };
  const missions = [
    { id: 'welcome', title: 'Welcome Run', text: 'Collect 3 green data crates.', target: 3, rewardCash: 120, rewardXp: 80 },
    { id: 'driver', title: 'Street Driver', text: 'Enter a vehicle and drive 200m.', target: 200, rewardCash: 180, rewardXp: 110 },
    { id: 'owner', title: 'First Lot', text: 'Buy any glowing purple lot.', target: 1, rewardCash: 250, rewardXp: 140 }
  ];
  let missionProgress = { welcome: 0, driver: 0, owner: 0 };

  const avatar = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.7), mats.player);
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), mats.glass);
  head.position.y = 2.35;
  avatar.add(torso, head);
  avatar.position.copy(player.pos);
  scene.add(avatar);

  const chunks = new Map();
  const pickups = new Map();
  const vehicles = [];
  const lots = [];
  const npcs = [];
  const CHUNK = 72;
  const RADIUS = smallScreen ? 2 : 3;

  function reward(text) {
    const popup = $('reward-popup');
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('hidden');
    clearTimeout(reward.t);
    reward.t = setTimeout(() => popup.classList.add('hidden'), 1700);
  }

  function mission() {
    return missions.find((m) => m.id === player.missionId) || missions[0];
  }

  function makeBuilding(seed, x, z, group) {
    const h = 10 + (seed % 42);
    const w = 8 + (seed % 12);
    const d = 8 + ((seed >> 3) % 12);
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((seed * 31) % 360) / 360, 0.55, 0.32), roughness: 0.55, emissive: 0x050814 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    b.position.set(x, h / 2, z);
    b.castShadow = renderer.shadowMap.enabled;
    b.receiveShadow = true;
    group.add(b);
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.35, 0.08), mats.glass);
      strip.position.set(x, 2.5 + i * 5, z + d / 2 + 0.05);
      group.add(strip);
    }
  }

  function addChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData = { cx, cz };
    const bx = cx * CHUNK;
    const bz = cz * CHUNK;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.2, CHUNK), mats.grass);
    ground.position.set(bx, -0.1, bz);
    group.add(ground);
    const roadEW = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.06, 12), mats.road);
    const roadNS = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, CHUNK), mats.road);
    roadEW.position.set(bx, 0.02, bz);
    roadNS.position.set(bx, 0.03, bz);
    group.add(roadEW, roadNS);

    for (let i = 0; i < (smallScreen ? 4 : 6); i++) {
      const seed = Math.abs((cx * 73856093) ^ (cz * 19349663) ^ (i * 83492791));
      const ox = (seed % 50) - 25;
      const oz = (((seed / 97) | 0) % 50) - 25;
      if (Math.abs(ox) > 10 && Math.abs(oz) > 10) makeBuilding(seed, bx + ox, bz + oz, group);
    }

    if ((Math.abs(cx) + Math.abs(cz)) % 2 === 0) {
      const id = `crate:${cx}:${cz}`;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mats.crate);
      crate.position.set(bx + 18, 0.9, bz - 18);
      crate.userData.id = id;
      if (!player.picked.has(id)) {
        pickups.set(id, crate);
        group.add(crate);
      }
    }

    if ((cx + cz) % 3 === 0) {
      const id = `lot:${cx}:${cz}`;
      const lot = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 12), player.ownedLots.has(id) ? mats.owned : mats.lot);
      lot.position.set(bx - 22, 0.15, bz + 22);
      lot.userData = { id, price: 300 + (Math.abs(cx) + Math.abs(cz)) * 100 };
      lots.push(lot);
      group.add(lot);
    }

    if ((cx === 0 && cz === 0) || ((cx * 5 + cz) % 4 === 0)) {
      const car = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 7), mats.car);
      base.position.y = 0.8;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), mats.glass);
      cab.position.set(0, 1.55, -0.4);
      car.add(base, cab);
      car.position.set(bx + 26, 0, bz + 2);
      car.userData = { hp: 100, gas: 100, speed: 0, yaw: 0, occupied: false };
      vehicles.push(car);
      group.add(car);
    }

    const npc = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 1.1), mats.npc);
    npc.position.set(bx - 10, 1.1, bz - 10);
    npc.userData.tip = 'Tip: collect crates, buy lots, and press Interact near cars.';
    npcs.push(npc);
    group.add(npc);

    world.add(group);
    chunks.set(key(cx, cz), group);
  }

  function streamWorld() {
    const pcx = Math.round(player.pos.x / CHUNK);
    const pcz = Math.round(player.pos.z / CHUNK);
    for (let x = pcx - RADIUS; x <= pcx + RADIUS; x++) {
      for (let z = pcz - RADIUS; z <= pcz + RADIUS; z++) if (!chunks.has(key(x, z))) addChunk(x, z);
    }
    for (const [id, group] of chunks) {
      if (Math.abs(group.userData.cx - pcx) <= RADIUS + 1 && Math.abs(group.userData.cz - pcz) <= RADIUS + 1) continue;
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && !Object.values(mats).includes(obj.material)) obj.material.dispose();
      });
      world.remove(group);
      chunks.delete(id);
    }
  }

  function combinedMove() {
    const k = input.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    return { x: clamp(kx + input.joy.x, -1, 1), y: clamp(ky + input.joy.y, -1, 1) };
  }

  function interact() {
    const car = vehicles.find((v) => v.parent && flatDistance(v.position, player.pos) < 6);
    if (car) {
      if (player.activeVehicle === car) {
        car.userData.occupied = false;
        player.activeVehicle = null;
        reward('Exited vehicle');
      } else {
        player.activeVehicle = car;
        car.userData.occupied = true;
        reward('Entered vehicle');
        if (player.missionId === 'driver') missionProgress.driver += 5;
      }
      return;
    }
    const lot = lots.find((l) => l.parent && flatDistance(l.position, player.pos) < 8);
    if (lot) {
      const id = lot.userData.id;
      if (player.ownedLots.has(id)) reward('You already own this lot');
      else if (player.cash >= lot.userData.price) {
        player.cash -= lot.userData.price;
        player.ownedLots.add(id);
        lot.material = mats.owned;
        missionProgress.owner += 1;
        reward(`Bought lot for $${lot.userData.price}`);
      } else reward(`Need $${lot.userData.price}`);
      return;
    }
    const npc = npcs.find((n) => n.parent && flatDistance(n.position, player.pos) < 5);
    if (npc) reward(npc.userData.tip);
  }

  function updatePlayer(dt) {
    if (input.interact) { input.interact = false; interact(); }
    const move = combinedMove();
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || $('btn-mobile-sprint')?.classList.contains('active');

    if (player.activeVehicle) {
      const car = player.activeVehicle;
      const u = car.userData;
      u.speed = clamp((u.speed + move.y * 30 * dt) * 0.965, -16, 34);
      if (u.gas <= 0) u.speed = 0;
      u.yaw -= move.x * dt * (u.speed >= 0 ? 1.8 : -1.8);
      if (Math.abs(u.speed) > 1) u.gas = Math.max(0, u.gas - dt * 1.2);
      car.rotation.y = u.yaw;
      car.position.x += Math.sin(u.yaw) * u.speed * dt;
      car.position.z += Math.cos(u.yaw) * u.speed * dt;
      player.pos.set(car.position.x, 1, car.position.z);
      player.yaw = u.yaw;
      avatar.visible = false;
      missionProgress.driver += Math.abs(u.speed * dt);
      return;
    }

    avatar.visible = true;
    const len = Math.hypot(move.x, move.y) || 1;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const speed = 16 * (sprint ? 1.55 : 1);
    player.vel.x = ((move.x / len) * cos + (move.y / len) * sin) * speed;
    player.vel.z = ((move.y / len) * cos - (move.x / len) * sin) * speed;
    if (input.jump && player.grounded) {
      player.vel.y = 13;
      player.grounded = false;
    }
    input.jump = false;
    player.vel.y -= 32 * dt;
    player.pos.addScaledVector(player.vel, dt);
    if (player.pos.y < 1) {
      player.pos.y = 1;
      player.vel.y = 0;
      player.grounded = true;
    }
    avatar.position.copy(player.pos);
    avatar.rotation.y = player.yaw;
  }

  function updatePickups() {
    for (const [id, crate] of pickups) {
      if (!crate.parent) continue;
      crate.rotation.y += 0.035;
      if (flatDistance(crate.position, player.pos) < 3) {
        crate.parent.remove(crate);
        pickups.delete(id);
        player.picked.add(id);
        player.cash += 25;
        player.xp += 20;
        missionProgress.welcome += 1;
        reward('Collected data crate +$25');
      }
    }
  }

  function completeMission(id) {
    const m = missions.find((item) => item.id === id);
    if (!m) return;
    player.cash += m.rewardCash;
    player.xp += m.rewardXp;
    player.level = 1 + Math.floor(player.xp / 200);
    reward(`Mission complete: ${m.title} +$${m.rewardCash}`);
    const index = missions.findIndex((item) => item.id === id);
    player.missionId = missions[(index + 1) % missions.length].id;
    missionProgress[player.missionId] ||= 0;
    saveGame(true);
  }

  function updateCamera(dt) {
    const target = player.activeVehicle ? player.activeVehicle.position : player.pos;
    const desired = new THREE.Vector3(target.x - Math.sin(player.yaw) * 13, target.y + 9, target.z - Math.cos(player.yaw) * 13);
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(target.x, target.y + 2, target.z);
  }

  function drawMinimap() {
    if (!mini) return;
    mini.clearRect(0, 0, 160, 160);
    mini.fillStyle = '#050814';
    mini.fillRect(0, 0, 160, 160);
    mini.strokeStyle = '#17f3ff55';
    mini.strokeRect(1, 1, 158, 158);
    const plot = (obj, color, size = 4) => {
      const x = 80 + (obj.position.x - player.pos.x) / 1.3;
      const y = 80 + (obj.position.z - player.pos.z) / 1.3;
      if (x < 0 || y < 0 || x > 160 || y > 160) return;
      mini.fillStyle = color;
      mini.fillRect(x - size / 2, y - size / 2, size, size);
    };
    lots.forEach((l) => l.parent && plot(l, player.ownedLots.has(l.userData.id) ? '#00ff99' : '#7d5cff', 5));
    vehicles.forEach((v) => v.parent && plot(v, '#ff3366', 5));
    mini.fillStyle = '#17f3ff';
    mini.beginPath();
    mini.arc(80, 80, 5, 0, Math.PI * 2);
    mini.fill();
  }

  function updateHud(dt) {
    fpsFrames += 1;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      if (hud.fps) hud.fps.textContent = Math.round(fpsFrames / fpsTimer);
      fpsFrames = 0;
      fpsTimer = 0;
    }
    const m = mission();
    if (hud.cash) hud.cash.textContent = Math.floor(player.cash);
    if (hud.xp) hud.xp.textContent = Math.floor(player.xp);
    if (hud.level) hud.level.textContent = player.level;
    if (hud.wanted) hud.wanted.textContent = player.wanted;
    if (hud.online) hud.online.textContent = window.NeonBlockCloud?.enabled ? 'cloud ready' : 'offline';
    if (hud.vehicle) hud.vehicle.textContent = player.activeVehicle ? 'Neon cruiser' : 'On foot';
    if (hud.hp) hud.hp.textContent = player.activeVehicle ? Math.floor(player.activeVehicle.userData.hp) : 100;
    if (hud.gas) hud.gas.textContent = player.activeVehicle ? Math.floor(player.activeVehicle.userData.gas) : 100;
    if (hud.mission) hud.mission.textContent = `${m.title}: ${Math.floor(missionProgress[m.id] || 0)}/${m.target}`;
    if (hud.chunks) hud.chunks.textContent = chunks.size;
    if (hud.npcs) hud.npcs.textContent = npcs.filter((n) => n.parent).length;
    if (hud.pos) hud.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`;
    if (hud.activeVehicle) hud.activeVehicle.textContent = player.activeVehicle ? 'Yes' : 'None';
    if (hud.slot) hud.slot.textContent = player.slot;
  }

  function savePayload() {
    return { version: 3, savedAt: new Date().toISOString(), pos: player.pos.toArray(), cash: player.cash, xp: player.xp, level: player.level, wanted: player.wanted, missionId: player.missionId, missionProgress, ownedLots: [...player.ownedLots], picked: [...player.picked] };
  }

  async function saveGame(silent = false) {
    const payload = savePayload();
    localStorage.setItem(saveKey(player.slot), JSON.stringify(payload));
    if (window.NeonBlockCloud?.enabled && window.NeonBlockCloud?.save) {
      try { await window.NeonBlockCloud.save(player.slot, payload); }
      catch (err) { if (hud.error) hud.error.textContent = err.message || 'cloud save failed'; }
    }
    if (!silent) reward('Game saved');
  }

  async function loadGame(slot = player.slot) {
    let raw = localStorage.getItem(saveKey(slot));
    if (!raw && window.NeonBlockCloud?.enabled && window.NeonBlockCloud?.load) {
      try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); } catch (err) {}
    }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      player.slot = slot;
      player.pos.fromArray(data.pos || [0, 1, 0]);
      player.cash = Number(data.cash || 150);
      player.xp = Number(data.xp || 0);
      player.level = Number(data.level || 1);
      player.wanted = Number(data.wanted || 0);
      player.missionId = data.missionId || 'welcome';
      missionProgress = { welcome: 0, driver: 0, owner: 0, ...(data.missionProgress || {}) };
      player.ownedLots = new Set(data.ownedLots || []);
      player.picked = new Set(data.picked || []);
      avatar.position.copy(player.pos);
      reward('Loaded save');
      return true;
    } catch (err) {
      if (hud.error) hud.error.textContent = 'bad save';
      return false;
    }
  }

  function buildMenus() {
    $('btn-mobile-pause')?.addEventListener('click', () => $('pause-overlay')?.classList.remove('hidden'));
    $('btn-resume')?.addEventListener('click', () => $('pause-overlay')?.classList.add('hidden'));
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => loadGame(player.slot));
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { player.slot = b.dataset.slot || 'slot1'; saveGame(false); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot || 'slot1')));
    $('btn-export')?.addEventListener('click', () => { if ($('export-json')) $('export-json').value = JSON.stringify(savePayload(), null, 2); });
    $('btn-import')?.addEventListener('click', () => { try { localStorage.setItem(saveKey(player.slot), $('export-json').value); loadGame(player.slot); } catch (err) { reward('Import failed'); } });
    const list = $('mission-list');
    if (list) {
      list.innerHTML = '';
      missions.forEach((m) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${m.title}</strong><br><small>${m.text}</small>`;
        li.addEventListener('click', () => { player.missionId = m.id; $('mission-board')?.classList.add('hidden'); });
        list.appendChild(li);
      });
    }
  }

  function setupControls() {
    addEventListener('keydown', (event) => {
      input.keys.add(event.code);
      if (event.code === 'Space') input.jump = true;
      if (event.code === 'KeyE') input.interact = true;
      if (event.code === 'Escape') $('pause-overlay')?.classList.toggle('hidden');
      if (event.code === 'KeyM') $('mission-board')?.classList.toggle('hidden');
      if (event.code === 'F3') $('debug-overlay')?.classList.toggle('show');
    });
    addEventListener('keyup', (event) => input.keys.delete(event.code));
    canvas.addEventListener('pointerdown', (event) => { input.look = true; input.lastX = event.clientX; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => { if (!input.look) return; player.yaw -= (event.clientX - input.lastX) * 0.006; input.lastX = event.clientX; });
    canvas.addEventListener('pointerup', () => { input.look = false; });

    const joy = $('joystick-container');
    const stick = $('joystick-stick');
    let joyPointer = null;
    joy?.addEventListener('pointerdown', (event) => { joyPointer = event.pointerId; joy.setPointerCapture(joyPointer); });
    joy?.addEventListener('pointermove', (event) => {
      if (event.pointerId !== joyPointer) return;
      const rect = joy.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left - rect.width / 2, -42, 42);
      const y = clamp(event.clientY - rect.top - rect.height / 2, -42, 42);
      input.joy.x = x / 42;
      input.joy.y = -y / 42;
      if (stick) stick.style.transform = `translate(${x}px,${y}px)`;
    });
    const releaseJoy = () => { joyPointer = null; input.joy.x = 0; input.joy.y = 0; if (stick) stick.style.transform = ''; };
    joy?.addEventListener('pointerup', releaseJoy);
    joy?.addEventListener('pointercancel', releaseJoy);
    $('btn-mobile-jump')?.addEventListener('pointerdown', () => { input.jump = true; });
    $('btn-mobile-interact')?.addEventListener('pointerdown', () => { input.interact = true; });
    $('btn-mobile-unstuck')?.addEventListener('click', () => { player.pos.y = 6; player.vel.set(0, 0, 0); reward('Unstuck'); });
    $('btn-mobile-sprint')?.addEventListener('click', (event) => event.currentTarget.classList.toggle('active'));
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    updatePlayer(dt);
    updatePickups();
    const m = mission();
    if ((missionProgress[m.id] || 0) >= m.target) completeMission(m.id);
    streamWorld();
    updateCamera(dt);
    drawMinimap();
    updateHud(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });
  setInterval(() => saveGame(true), 30000);

  buildMenus();
  setupControls();
  streamWorld();
  loadGame('slot1').finally(() => {
    if (loading) loading.classList.add('hidden');
    loop();
  });
})();
