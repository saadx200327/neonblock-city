(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const minimapCanvas = $('minimap-canvas');
  const mini = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    slot: $('debug-save-slot'), onlineDebug: $('debug-online'), error: $('debug-last-error')
  };

  if (!window.THREE || !canvas) {
    if (loading) loading.querySelector('.loading-sub').textContent = 'Three.js failed to load. Check connection.';
    return;
  }

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const dist2 = (a, b) => {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  };
  const keyFor = (x, z) => `${x},${z}`;
  const saveKey = (slot) => `neonblock-city:${slot}`;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(max-width: 760px)').matches ? 1.25 : 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !matchMedia('(max-width: 760px)').matches;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 70, 260);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 650);
  const clock = new THREE.Clock();
  const hemi = new THREE.HemisphereLight(0x88ccff, 0x1a1035, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(80, 120, 40);
  sun.castShadow = renderer.shadowMap.enabled;
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.7 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x112a20, roughness: 0.9 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x22284e, roughness: 0.8 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.45, emissive: 0x06363c }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.5, emissive: 0x3a2500 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x5ef38c, roughness: 0.4, emissive: 0x12361d }),
    lot: new THREE.MeshStandardMaterial({ color: 0x7d5cff, roughness: 0.35, emissive: 0x120833 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x00ff99, roughness: 0.35, emissive: 0x06351f }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.35, emissive: 0x330313 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.25, emissive: 0x092026 })
  };

  const world = new THREE.Group();
  scene.add(world);

  const player = {
    pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(), yaw: 0, speed: 16, sprint: false, grounded: true,
    cash: 150, xp: 0, level: 1, wanted: 0, slot: 'slot1', ownedLots: new Set(), picked: new Set(), activeVehicle: null,
    missionId: 'welcome', missionStep: 0
  };

  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.7), mats.player);
  torso.position.y = 1.1;
  body.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), mats.glass);
  head.position.y = 2.35;
  body.add(head);
  body.position.copy(player.pos);
  scene.add(body);

  const chunks = new Map();
  const pickups = new Map();
  const npcs = [];
  const vehicles = [];
  const lots = [];
  const chunkSize = 72;
  const renderRadius = matchMedia('(max-width: 760px)').matches ? 2 : 3;
  let debugOn = false;

  const missions = [
    { id: 'welcome', title: 'Welcome Run', text: 'Collect 3 green data crates.', rewardCash: 120, rewardXp: 80, target: 3 },
    { id: 'driver', title: 'Street Driver', text: 'Enter a vehicle and drive 200m.', rewardCash: 180, rewardXp: 110, target: 200 },
    { id: 'owner', title: 'First Lot', text: 'Buy any glowing purple lot.', rewardCash: 250, rewardXp: 140, target: 1 }
  ];
  let missionProgress = { welcome: 0, driver: 0, owner: 0 };

  const input = { keys: new Set(), move: { x: 0, y: 0 }, jump: false, interact: false, dragLook: false, lastX: 0 };

  function makeBuilding(seed, x, z, parent) {
    const h = 10 + ((seed * 17) % 46);
    const w = 8 + ((seed * 7) % 12);
    const d = 8 + ((seed * 11) % 12);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((seed * 37) % 360) / 360, 0.55, 0.32), roughness: 0.55, emissive: 0x060814 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    for (let i = 0; i < 4; i++) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.45, 0.08), mats.glass);
      sign.position.set(x, 2.5 + i * 5, z + d / 2 + 0.05);
      parent.add(sign);
    }
  }

  function createChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData.cx = cx;
    group.userData.cz = cz;
    const baseX = cx * chunkSize;
    const baseZ = cz * chunkSize;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(chunkSize, 0.2, chunkSize), mats.grass);
    ground.position.set(baseX, -0.1, baseZ);
    ground.receiveShadow = true;
    group.add(ground);
    const roadA = new THREE.Mesh(new THREE.BoxGeometry(chunkSize, 0.05, 12), mats.road);
    roadA.position.set(baseX, 0.02, baseZ);
    group.add(roadA);
    const roadB = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, chunkSize), mats.road);
    roadB.position.set(baseX, 0.03, baseZ);
    group.add(roadB);
    for (let i = 0; i < 5; i++) {
      const seed = Math.abs(cx * 73856093 ^ cz * 19349663 ^ i * 83492791);
      const offX = ((seed % 48) - 24);
      const offZ = (((seed / 97) | 0) % 48) - 24;
      if (Math.abs(offX) < 10 || Math.abs(offZ) < 10) continue;
      makeBuilding(seed, baseX + offX, baseZ + offZ, group);
    }
    if ((Math.abs(cx) + Math.abs(cz)) % 2 === 0) {
      const id = `crate:${cx}:${cz}`;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mats.crate);
      crate.position.set(baseX + 18, 0.9, baseZ - 18);
      crate.userData.id = id;
      if (!player.picked.has(id)) {
        group.add(crate);
        pickups.set(id, crate);
      }
    }
    if ((cx + cz) % 3 === 0) {
      const lotId = `lot:${cx}:${cz}`;
      const lot = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 12), player.ownedLots.has(lotId) ? mats.owned : mats.lot);
      lot.position.set(baseX - 22, 0.15, baseZ + 22);
      lot.userData.id = lotId;
      lot.userData.price = 300 + (Math.abs(cx) + Math.abs(cz)) * 100;
      group.add(lot);
      lots.push(lot);
    }
    if ((cx === 0 && cz === 0) || ((cx * 5 + cz) % 4 === 0)) {
      const car = new THREE.Group();
      const carBody = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 7), mats.car);
      carBody.position.y = 0.8;
      car.add(carBody);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), mats.glass);
      cab.position.set(0, 1.55, -0.4);
      car.add(cab);
      car.position.set(baseX + 26, 0, baseZ + 2);
      car.userData = { hp: 100, gas: 100, speed: 0, occupied: false, yaw: 0 };
      group.add(car);
      vehicles.push(car);
    }
    const npc = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 1.1), mats.npc);
    npc.position.set(baseX - 10, 1.1, baseZ - 10);
    npc.userData.tip = 'Tip: collect crates, buy lots, and use Interact near cars.';
    group.add(npc);
    npcs.push(npc);
    world.add(group);
    chunks.set(keyFor(cx, cz), group);
  }

  function streamWorld() {
    const pcx = Math.round(player.pos.x / chunkSize);
    const pcz = Math.round(player.pos.z / chunkSize);
    for (let cx = pcx - renderRadius; cx <= pcx + renderRadius; cx++) {
      for (let cz = pcz - renderRadius; cz <= pcz + renderRadius; cz++) {
        const k = keyFor(cx, cz);
        if (!chunks.has(k)) createChunk(cx, cz);
      }
    }
    for (const [k, group] of chunks) {
      if (Math.abs(group.userData.cx - pcx) > renderRadius + 1 || Math.abs(group.userData.cz - pcz) > renderRadius + 1) {
        group.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material && !Object.values(mats).includes(obj.material)) obj.material.dispose();
        });
        world.remove(group);
        chunks.delete(k);
      }
    }
  }

  function showReward(text) {
    const pop = $('reward-popup');
    if (!pop) return;
    pop.textContent = text;
    pop.classList.remove('hidden');
    clearTimeout(showReward.t);
    showReward.t = setTimeout(() => pop.classList.add('hidden'), 1800);
  }

  function currentMission() {
    return missions.find((m) => m.id === player.missionId) || missions[0];
  }

  function completeMission(id) {
    const m = missions.find((x) => x.id === id);
    if (!m) return;
    player.cash += m.rewardCash;
    player.xp += m.rewardXp;
    player.level = 1 + Math.floor(player.xp / 200);
    showReward(`Mission complete: ${m.title} +$${m.rewardCash}`);
    const idx = missions.findIndex((x) => x.id === id);
    player.missionId = missions[(idx + 1) % missions.length].id;
    missionProgress[player.missionId] ||= 0;
    saveGame(false);
  }

  function interact() {
    const nearCar = vehicles.filter((v) => v.parent).find((v) => dist2(v.position, player.pos) < 6);
    if (nearCar) {
      if (player.activeVehicle === nearCar) {
        player.activeVehicle.userData.occupied = false;
        player.activeVehicle = null;
        showReward('Exited vehicle');
      } else {
        player.activeVehicle = nearCar;
        nearCar.userData.occupied = true;
        showReward('Entered vehicle');
        if (player.missionId === 'driver') missionProgress.driver += 5;
      }
      return;
    }
    const nearLot = lots.find((l) => l.parent && dist2(l.position, player.pos) < 8);
    if (nearLot) {
      const id = nearLot.userData.id;
      if (player.ownedLots.has(id)) {
        showReward('You already own this lot');
      } else if (player.cash >= nearLot.userData.price) {
        player.cash -= nearLot.userData.price;
        player.ownedLots.add(id);
        nearLot.material = mats.owned;
        missionProgress.owner += 1;
        showReward(`Bought lot for $${nearLot.userData.price}`);
      } else {
        showReward(`Need $${nearLot.userData.price}`);
      }
      return;
    }
    const nearNpc = npcs.find((n) => n.parent && dist2(n.position, player.pos) < 5);
    if (nearNpc) showReward(nearNpc.userData.tip);
  }

  function collectPickups() {
    for (const [id, crate] of pickups) {
      if (!crate.parent) continue;
      crate.rotation.y += 0.03;
      if (dist2(crate.position, player.pos) < 3) {
        crate.parent.remove(crate);
        player.picked.add(id);
        pickups.delete(id);
        player.cash += 25;
        player.xp += 20;
        missionProgress.welcome += 1;
        showReward('Collected data crate +$25');
      }
    }
  }

  function updateInput() {
    const k = input.keys;
    input.move.y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    input.move.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    player.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || $('btn-mobile-sprint')?.classList.contains('active');
  }

  function updatePlayer(dt) {
    updateInput();
    if (input.interact) { input.interact = false; interact(); }
    if (player.activeVehicle) {
      const car = player.activeVehicle;
      const u = car.userData;
      u.speed += input.move.y * 30 * dt;
      u.speed *= 0.96;
      u.speed = clamp(u.speed, -16, 34);
      u.yaw -= input.move.x * dt * (u.speed >= 0 ? 1.8 : -1.8);
      if (Math.abs(u.speed) > 1) u.gas = Math.max(0, u.gas - dt * 1.2);
      if (u.gas <= 0) u.speed = 0;
      car.rotation.y = u.yaw;
      car.position.x += Math.sin(u.yaw) * u.speed * dt;
      car.position.z += Math.cos(u.yaw) * u.speed * dt;
      player.pos.set(car.position.x, 1, car.position.z);
      body.visible = false;
      missionProgress.driver += Math.abs(u.speed * dt);
    } else {
      body.visible = true;
      const spd = player.speed * (player.sprint ? 1.55 : 1);
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      const mx = input.move.x, mz = input.move.y;
      const len = Math.hypot(mx, mz) || 1;
      player.vel.x = ((mx / len) * cos + (mz / len) * sin) * spd;
      player.vel.z = ((mz / len) * cos - (mx / len) * sin) * spd;
      if (input.jump && player.grounded) { player.vel.y = 13; player.grounded = false; }
      input.jump = false;
      player.vel.y -= 32 * dt;
      player.pos.addScaledVector(player.vel, dt);
      if (player.pos.y < 1) { player.pos.y = 1; player.vel.y = 0; player.grounded = true; }
      body.position.copy(player.pos);
      body.rotation.y = player.yaw;
    }
  }

  function updateCamera(dt) {
    const target = player.activeVehicle ? player.activeVehicle.position : player.pos;
    const back = new THREE.Vector3(Math.sin(player.yaw) * -13, 8, Math.cos(player.yaw) * -13);
    const desired = new THREE.Vector3(target.x + back.x, target.y + back.y + 2, target.z + back.z);
    camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    camera.lookAt(target.x, target.y + 2, target.z);
  }

  function drawMinimap() {
    if (!mini) return;
    mini.clearRect(0, 0, 160, 160);
    mini.fillStyle = '#050814';
    mini.fillRect(0, 0, 160, 160);
    mini.strokeStyle = '#17f3ff55';
    mini.strokeRect(1, 1, 158, 158);
    const scale = 1.3;
    for (const l of lots) {
      if (!l.parent) continue;
      const x = 80 + (l.position.x - player.pos.x) / scale;
      const y = 80 + (l.position.z - player.pos.z) / scale;
      if (x > 0 && y > 0 && x < 160 && y < 160) {
        mini.fillStyle = player.ownedLots.has(l.userData.id) ? '#00ff99' : '#7d5cff';
        mini.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    mini.fillStyle = '#ff3366';
    for (const v of vehicles) {
      if (!v.parent) continue;
      mini.fillRect(80 + (v.position.x - player.pos.x) / scale - 2, 80 + (v.position.z - player.pos.z) / scale - 2, 4, 4);
    }
    mini.fillStyle = '#17f3ff';
    mini.beginPath();
    mini.arc(80, 80, 5, 0, Math.PI * 2);
    mini.fill();
  }

  function updateHud() {
    const m = currentMission();
    hud.cash && (hud.cash.textContent = Math.floor(player.cash));
    hud.xp && (hud.xp.textContent = Math.floor(player.xp));
    hud.level && (hud.level.textContent = player.level);
    hud.wanted && (hud.wanted.textContent = player.wanted);
    hud.vehicle && (hud.vehicle.textContent = player.activeVehicle ? 'Neon cruiser' : 'On foot');
    hud.hp && (hud.hp.textContent = player.activeVehicle ? Math.floor(player.activeVehicle.userData.hp) : 100);
    hud.gas && (hud.gas.textContent = player.activeVehicle ? Math.floor(player.activeVehicle.userData.gas) : 100);
    hud.mission && (hud.mission.textContent = `${m.title}: ${Math.floor(missionProgress[m.id] || 0)}/${m.target}`);
    hud.chunks && (hud.chunks.textContent = chunks.size);
    hud.npcs && (hud.npcs.textContent = npcs.filter((n) => n.parent).length);
    hud.pos && (hud.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`);
    hud.activeVehicle && (hud.activeVehicle.textContent = player.activeVehicle ? 'Yes' : 'None');
    hud.slot && (hud.slot.textContent = player.slot);
  }

  function savePayload() {
    return {
      version: 2, t: Date.now(), pos: player.pos.toArray(), cash: player.cash, xp: player.xp, level: player.level,
      wanted: player.wanted, missionId: player.missionId, missionProgress, ownedLots: [...player.ownedLots], picked: [...player.picked]
    };
  }

  async function saveGame(noToast = true) {
    const payload = savePayload();
    localStorage.setItem(saveKey(player.slot), JSON.stringify(payload));
    if (window.NeonBlockCloud?.save) {
      try { await window.NeonBlockCloud.save(player.slot, payload); hud.online && (hud.online.textContent = 'cloud'); }
      catch (e) { hud.error && (hud.error.textContent = e.message || 'cloud save failed'); }
    }
    if (!noToast) showReward('Game saved');
  }

  async function loadGame(slot = player.slot) {
    let raw = localStorage.getItem(saveKey(slot));
    if (!raw && window.NeonBlockCloud?.load) {
      try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); } catch (e) {}
    }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      player.slot = slot;
      player.pos.fromArray(data.pos || [0, 1, 0]);
      player.cash = Number(data.cash || 0); player.xp = Number(data.xp || 0); player.level = Number(data.level || 1);
      player.wanted = Number(data.wanted || 0); player.missionId = data.missionId || 'welcome';
      missionProgress = { welcome: 0, driver: 0, owner: 0, ...(data.missionProgress || {}) };
      player.ownedLots = new Set(data.ownedLots || []);
      player.picked = new Set(data.picked || []);
      body.position.copy(player.pos);
      showReward('Loaded save');
      return true;
    } catch (e) { hud.error && (hud.error.textContent = 'bad save'); return false; }
  }

  function buildMenus() {
    $('btn-mobile-pause')?.addEventListener('click', () => $('pause-overlay')?.classList.remove('hidden'));
    $('btn-resume')?.addEventListener('click', () => $('pause-overlay')?.classList.add('hidden'));
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => loadGame(player.slot));
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { player.slot = b.dataset.slot; saveGame(false); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { $('export-json').value = JSON.stringify(savePayload()); });
    $('btn-import')?.addEventListener('click', () => {
      try { localStorage.setItem(saveKey(player.slot), $('export-json').value); loadGame(player.slot); } catch (e) { showReward('Import failed'); }
    });
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
    addEventListener('keydown', (e) => {
      input.keys.add(e.code);
      if (e.code === 'Space') input.jump = true;
      if (e.code === 'KeyE') input.interact = true;
      if (e.code === 'Escape') $('pause-overlay')?.classList.toggle('hidden');
      if (e.code === 'F3') { debugOn = !debugOn; $('debug-overlay')?.classList.toggle('show', debugOn); }
      if (e.code === 'KeyM') $('mission-board')?.classList.toggle('hidden');
    });
    addEventListener('keyup', (e) => input.keys.delete(e.code));
    canvas.addEventListener('pointerdown', (e) => { input.dragLook = true; input.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (input.dragLook) { player.yaw -= (e.clientX - input.lastX) * 0.006; input.lastX = e.clientX; } });
    canvas.addEventListener('pointerup', () => { input.dragLook = false; });
    const joy = $('joystick-container'), stick = $('joystick-stick');
    let joyId = null;
    joy?.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(joyId); });
    joy?.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      const r = joy.getBoundingClientRect();
      const x = clamp(e.clientX - r.left - r.width / 2, -42, 42);
      const y = clamp(e.clientY - r.top - r.height / 2, -42, 42);
      input.move.x = x / 42; input.move.y = -y / 42;
      stick.style.transform = `translate(${x}px,${y}px)`;
    });
    joy?.addEventListener('pointerup', () => { joyId = null; input.move.x = 0; input.move.y = 0; stick.style.transform = ''; });
    $('btn-mobile-jump')?.addEventListener('pointerdown', () => input.jump = true);
    $('btn-mobile-interact')?.addEventListener('pointerdown', () => input.interact = true);
    $('btn-mobile-unstuck')?.addEventListener('click', () => { player.pos.y = 6; player.vel.set(0, 0, 0); showReward('Unstuck'); });
    $('btn-mobile-sprint')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('active'));
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    updatePlayer(dt);
    collectPickups();
    const m = currentMission();
    if ((missionProgress[m.id] || 0) >= m.target) completeMission(m.id);
    streamWorld();
    updateCamera(dt);
    drawMinimap();
    updateHud();
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
  setInterval(() => { hud.fps && (hud.fps.textContent = Math.round(1 / Math.max(clock.getDelta(), 0.016))); }, 1000);

  buildMenus();
  setupControls();
  streamWorld();
  loadGame('slot1').finally(() => {
    if (loading) loading.classList.add('hidden');
    loop();
  });
})();
