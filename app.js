(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const ui = id => document.getElementById(id);
  const hud = {
    cash: ui('hud-cash'), xp: ui('hud-xp'), level: ui('hud-level'), wanted: ui('hud-wanted'), online: ui('hud-online'),
    vehicle: ui('hud-vehicle'), hp: ui('hud-vehicle-hp'), gas: ui('hud-vehicle-gas'), mission: ui('hud-mission'),
    fps: ui('debug-fps'), pos: ui('debug-pos'), chunks: ui('debug-chunks'), npcs: ui('debug-npcs'), activeVehicle: ui('debug-active-vehicle'),
    saveSlot: ui('debug-save-slot'), onlineDebug: ui('debug-online'), err: ui('debug-last-error'), reward: ui('reward-popup'), arrow: ui('waypoint-arrow')
  };
  const pauseOverlay = ui('pause-overlay');
  const settingsPanel = ui('settings-panel');
  const missionBoard = ui('mission-board');
  const savePanel = ui('save-panel');
  const missionList = ui('mission-list');
  const exportBox = ui('export-json');
  const minimapCanvas = ui('minimap-canvas');
  const mini = minimapCanvas.getContext('2d');

  if (!window.THREE) {
    loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load. Check internet/CDN access.</div>';
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 80, 300);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);

  scene.add(new THREE.HemisphereLight(0x8fdfff, 0x101026, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(30, 80, 20);
  scene.add(sun);

  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x12172d, roughness: 0.85 }),
    road: new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 0.9 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x242a46, roughness: 0.78 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x063344, roughness: 0.45 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc55, roughness: 0.55 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x164d24, roughness: 0.35 }),
    mission: new THREE.MeshStandardMaterial({ color: 0xff44cc, emissive: 0x441133, roughness: 0.35 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x5ef38c, transparent: true, opacity: 0.45 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x17f3ff, transparent: true, opacity: 0.18 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.35 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 })
  };

  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, saveSlot: 'slot1', paused: false, lastError: 'none', online: false,
    quality: localStorage.getItem('neonblock:quality') || 'auto', chunks: new Map(), npcs: [], pickups: [], vehicles: [], lots: [], missionMarkers: [], activeMission: null,
    keys: {}, joystick: { active: false, x: 0, y: 0 }, mobileSprint: false, mobileInteract: false, nearby: null, lastSave: 0
  };

  const player = {
    mesh: makeBlockDude(mats.player), pos: new THREE.Vector3(0, 2, 0), vel: new THREE.Vector3(), yaw: 0, onGround: false, inVehicle: null, hp: 100
  };
  scene.add(player.mesh);

  const missions = [
    { id: 'starter-cash', title: 'Collect 5 neon chips', type: 'collect', target: 5, rewardCash: 220, rewardXp: 75, progress: 0 },
    { id: 'courier-run', title: 'Drive to the pink beacon', type: 'drive', target: new THREE.Vector3(120, 0, -90), rewardCash: 420, rewardXp: 120, progress: 0 },
    { id: 'property-start', title: 'Buy one city lot', type: 'buy', target: 1, rewardCash: 300, rewardXp: 110, progress: 0 }
  ];

  const chunkSize = 72;
  const streamRadius = 2;
  const gravity = -32;
  const clock = new THREE.Clock();
  let frames = 0, fpsTime = 0, fps = 0;

  function makeBlockDude(mat) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.5, 0.65), mat);
    body.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mat);
    head.position.y = 2.35;
    const armGeo = new THREE.BoxGeometry(0.35, 1.1, 0.35);
    const legGeo = new THREE.BoxGeometry(0.42, 1.1, 0.42);
    const leftArm = new THREE.Mesh(armGeo, mat); leftArm.position.set(-0.82, 1.15, 0);
    const rightArm = new THREE.Mesh(armGeo, mat); rightArm.position.set(0.82, 1.15, 0);
    const leftLeg = new THREE.Mesh(legGeo, mat); leftLeg.position.set(-0.32, 0.25, 0);
    const rightLeg = new THREE.Mesh(legGeo, mat); rightLeg.position.set(0.32, 0.25, 0);
    group.add(body, head, leftArm, rightArm, leftLeg, rightLeg);
    return group;
  }

  function makeCar(x, z, color = 0xff3366) {
    const group = new THREE.Group();
    const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.12 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 2.25), carMat); base.position.y = 0.85;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 1.75), carMat); cab.position.set(-0.25, 1.55, 0);
    group.add(base, cab);
    [[-1.55,-0.95],[1.55,-0.95],[-1.55,0.95],[1.55,0.95]].forEach(([tx,tz]) => {
      const tire = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.55,0.35), mats.tire); tire.position.set(tx,0.4,tz); group.add(tire);
    });
    group.position.set(x, 0, z);
    group.userData = { kind: 'vehicle', hp: 100, gas: 100, speed: 0, owned: false };
    scene.add(group);
    state.vehicles.push(group);
    return group;
  }

  function hash(x, z) {
    let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    return (n % 10000) / 10000;
  }

  function createChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (state.chunks.has(key)) return;
    const group = new THREE.Group();
    group.userData.key = key;
    const baseX = cx * chunkSize, baseZ = cz * chunkSize;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(chunkSize, chunkSize), mats.ground);
    ground.rotation.x = -Math.PI / 2; ground.position.set(baseX, -0.02, baseZ); group.add(ground);
    const roadW = 14;
    if (cx === 0 || Math.abs(cx) % 2 === 0) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadW, 0.05, chunkSize), mats.road); road.position.set(baseX, 0.01, baseZ); group.add(road);
    }
    if (cz === 0 || Math.abs(cz) % 2 === 0) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(chunkSize, 0.06, roadW), mats.road); road.position.set(baseX, 0.015, baseZ); group.add(road);
    }
    for (let i = 0; i < 5; i++) {
      const r = hash(cx * 17 + i, cz * 23 - i);
      const x = baseX - 28 + r * 56;
      const z = baseZ - 28 + hash(cx - i, cz + i) * 56;
      if (Math.abs(x % (chunkSize * 2)) < 10 || Math.abs(z % (chunkSize * 2)) < 10) continue;
      const h = 6 + Math.floor(hash(cx + i * 4, cz - i * 7) * 22);
      const bmat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.57 + r * 0.12, 0.45, 0.25 + r * 0.25), roughness: 0.7 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(8 + r * 8, h, 8 + hash(cx+i,cz+i) * 8), bmat);
      b.position.set(x, h / 2, z); group.add(b);
    }
    if (hash(cx, cz) > 0.74) {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), mats.pickup);
      p.position.set(baseX + 18 - hash(cx+2,cz) * 36, 1.8, baseZ + 18 - hash(cx,cz+2) * 36);
      p.userData = { kind: 'pickup', value: 40 + Math.round(hash(cx+9,cz) * 90), chunk: key };
      group.add(p); state.pickups.push(p);
    }
    if (hash(cx, cz + 4) > 0.84) makeCar(baseX + 18, baseZ - 18, hash(cx,cz) > 0.5 ? 0x17f3ff : 0xff3366);
    if (hash(cx - 3, cz) > 0.82) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(13,0.18,13), mats.lot);
      lot.position.set(baseX - 20, 0.12, baseZ + 20); lot.userData = { kind:'lot', price: 500 + Math.round(hash(cx,cz)*700), owned:false, chunk:key };
      group.add(lot); state.lots.push(lot);
    }
    if (hash(cx+8, cz+8) > 0.70) {
      const npc = makeBlockDude(mats.npc); npc.position.set(baseX + 25 * (hash(cx,cz)-0.5), 0, baseZ + 25 * (hash(cz,cx)-0.5));
      npc.userData = { kind:'npc', phase: hash(cx,cz) * 10, home: npc.position.clone(), chunk:key };
      group.add(npc); state.npcs.push(npc);
    }
    scene.add(group); state.chunks.set(key, group);
  }

  function streamWorld() {
    const pcx = Math.round(player.pos.x / chunkSize), pcz = Math.round(player.pos.z / chunkSize);
    for (let x = pcx - streamRadius; x <= pcx + streamRadius; x++) for (let z = pcz - streamRadius; z <= pcz + streamRadius; z++) createChunk(x, z);
    for (const [key, group] of [...state.chunks.entries()]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > streamRadius + 1 || Math.abs(cz - pcz) > streamRadius + 1) {
        scene.remove(group);
        state.chunks.delete(key);
        state.pickups = state.pickups.filter(o => o.userData.chunk !== key);
        state.npcs = state.npcs.filter(o => o.userData.chunk !== key);
        state.lots = state.lots.filter(o => o.userData.chunk !== key);
      }
    }
  }

  function inputAxis() {
    let x = 0, z = 0;
    if (state.keys.KeyA || state.keys.ArrowLeft) x -= 1;
    if (state.keys.KeyD || state.keys.ArrowRight) x += 1;
    if (state.keys.KeyW || state.keys.ArrowUp) z -= 1;
    if (state.keys.KeyS || state.keys.ArrowDown) z += 1;
    x += state.joystick.x; z += state.joystick.y;
    const v = new THREE.Vector2(x, z);
    if (v.length() > 1) v.normalize();
    return v;
  }

  function updatePlayer(dt) {
    const axis = inputAxis();
    const sprint = state.keys.ShiftLeft || state.keys.ShiftRight || state.mobileSprint;
    if (player.inVehicle) {
      const car = player.inVehicle;
      car.userData.speed += (-axis.y * (sprint ? 42 : 28) - car.userData.speed) * Math.min(1, dt * 2.2);
      car.rotation.y -= axis.x * dt * (1.8 + Math.abs(car.userData.speed) / 18);
      const forward = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
      car.position.addScaledVector(forward, car.userData.speed * dt);
      car.userData.gas = Math.max(0, car.userData.gas - Math.abs(car.userData.speed) * dt * 0.018);
      if (car.userData.gas <= 0) car.userData.speed *= 0.96;
      player.pos.copy(car.position).add(new THREE.Vector3(0, 1.2, 0));
      player.mesh.visible = false;
    } else {
      const speed = sprint ? 15 : 9;
      const targetVX = axis.x * speed;
      const targetVZ = axis.y * speed;
      player.vel.x += (targetVX - player.vel.x) * Math.min(1, dt * 12);
      player.vel.z += (targetVZ - player.vel.z) * Math.min(1, dt * 12);
      if ((state.keys.Space || state.keys.KeyQ) && player.onGround) { player.vel.y = 13; player.onGround = false; }
      player.vel.y += gravity * dt;
      player.pos.addScaledVector(player.vel, dt);
      if (player.pos.y < 0) { player.pos.y = 0; player.vel.y = 0; player.onGround = true; }
      if (Math.abs(axis.x) + Math.abs(axis.y) > 0.05) player.yaw = Math.atan2(axis.x, axis.y);
      player.mesh.visible = true;
      player.mesh.position.copy(player.pos); player.mesh.rotation.y = player.yaw;
    }
  }

  function interact() {
    const near = findNearestInteractable();
    if (!near) return popup('Nothing nearby');
    if (near.userData.kind === 'vehicle') {
      if (player.inVehicle === near) { player.inVehicle = null; player.pos.copy(near.position).add(new THREE.Vector3(3, 0, 0)); popup('Exited vehicle'); }
      else { player.inVehicle = near; near.userData.owned = true; popup('Entered vehicle'); }
    } else if (near.userData.kind === 'lot') {
      if (near.userData.owned) return popup('You already own this lot');
      if (state.cash < near.userData.price) return popup(`Need $${near.userData.price}`);
      state.cash -= near.userData.price; near.userData.owned = true; near.material = mats.owned; progressMission('buy', 1); popup('Lot purchased');
    } else if (near.userData.kind === 'mission') {
      openMissionBoard();
    }
  }

  function findNearestInteractable() {
    let best = null, bestD = 8;
    for (const o of [...state.vehicles, ...state.lots, ...state.missionMarkers]) {
      const d = o.position.distanceTo(player.pos);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  function updatePickups(dt) {
    for (const p of [...state.pickups]) {
      p.rotation.y += dt * 2.4; p.position.y = 1.8 + Math.sin(performance.now()/260 + p.position.x) * 0.25;
      if (p.position.distanceTo(player.pos) < 3) {
        state.cash += p.userData.value; state.xp += 12; progressMission('collect', 1); popup(`+$${p.userData.value} neon chips`);
        p.parent?.remove(p); state.pickups = state.pickups.filter(x => x !== p);
      }
    }
  }

  function updateNpcs(t) {
    for (const n of state.npcs) {
      const phase = n.userData.phase + t * 0.001;
      n.position.x = n.userData.home.x + Math.sin(phase) * 4;
      n.position.z = n.userData.home.z + Math.cos(phase * 0.7) * 4;
      n.rotation.y = phase;
    }
  }

  function createMissionMarker() {
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 18, 18, 1, true), mats.mission);
    beacon.position.set(20, 9, -20); beacon.userData = { kind:'mission' };
    scene.add(beacon); state.missionMarkers.push(beacon);
  }

  function openMissionBoard() {
    missionList.innerHTML = '';
    missions.forEach(m => {
      const li = document.createElement('li');
      const active = state.activeMission?.id === m.id;
      li.innerHTML = `<strong>${m.title}</strong><br><small>$${m.rewardCash} / ${m.rewardXp} XP</small>`;
      const btn = document.createElement('button'); btn.textContent = active ? 'Active' : 'Start';
      btn.onclick = () => { state.activeMission = JSON.parse(JSON.stringify(m)); if (m.type === 'drive') state.activeMission.target = { x:120, y:0, z:-90 }; closeMenus(); popup('Mission started'); };
      li.appendChild(btn); missionList.appendChild(li);
    });
    pauseOverlay.classList.remove('hidden'); missionBoard.classList.remove('hidden');
  }

  function progressMission(type, amount) {
    const m = state.activeMission;
    if (!m || m.type !== type) return;
    m.progress += amount;
    if (m.progress >= m.target) finishMission();
  }

  function finishMission() {
    const m = state.activeMission;
    state.cash += m.rewardCash; state.xp += m.rewardXp; popup(`Mission complete: +$${m.rewardCash}`);
    state.activeMission = null;
  }

  function updateMission() {
    const m = state.activeMission;
    if (!m) return;
    if (m.type === 'drive') {
      const target = new THREE.Vector3(m.target.x, 0, m.target.z);
      if (player.pos.distanceTo(target) < 10) finishMission();
    }
  }

  function levelCheck() {
    const next = state.level * 125;
    if (state.xp >= next) { state.xp -= next; state.level++; state.cash += 100; popup(`Level ${state.level}! +$100`); }
  }

  function updateCamera(dt) {
    const target = player.inVehicle ? player.inVehicle.position : player.pos;
    const back = player.inVehicle ? 15 : 10;
    const height = player.inVehicle ? 8 : 6;
    const yaw = player.inVehicle ? player.inVehicle.rotation.y : player.yaw;
    const desired = new THREE.Vector3(target.x - Math.sin(yaw) * back, target.y + height, target.z - Math.cos(yaw) * back);
    camera.position.lerp(desired, Math.min(1, dt * 6));
    camera.lookAt(target.x, target.y + 1.8, target.z);
  }

  function updateHud() {
    hud.cash.textContent = `$${Math.round(state.cash)}`; hud.xp.textContent = Math.round(state.xp); hud.level.textContent = state.level;
    hud.wanted.textContent = state.wanted; hud.online.textContent = state.online ? 'cloud-ready' : 'offline'; hud.onlineDebug.textContent = hud.online.textContent;
    const car = player.inVehicle; hud.vehicle.textContent = car ? 'Neon Cruiser' : 'On foot'; hud.hp.textContent = car ? Math.round(car.userData.hp) : player.hp;
    hud.gas.textContent = car ? Math.round(car.userData.gas) : '-'; hud.activeVehicle.textContent = car ? 'Neon Cruiser' : 'None';
    hud.mission.textContent = state.activeMission ? `${state.activeMission.title} ${state.activeMission.progress || 0}/${state.activeMission.target?.x ? 'go' : state.activeMission.target}` : 'None';
    hud.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length;
    hud.saveSlot.textContent = state.saveSlot; hud.err.textContent = state.lastError; hud.fps.textContent = fps;
    hud.arrow.textContent = state.nearby ? 'Interact nearby' : '^';
    drawMinimap();
  }

  function drawMinimap() {
    mini.clearRect(0,0,160,160); mini.fillStyle = '#050814'; mini.fillRect(0,0,160,160); mini.strokeStyle = '#17f3ff55'; mini.strokeRect(1,1,158,158);
    const scale = 1.2; const cx = 80, cy = 80;
    mini.fillStyle = '#17f3ff'; mini.beginPath(); mini.arc(cx,cy,4,0,Math.PI*2); mini.fill();
    mini.fillStyle = '#5ef38c'; for (const p of state.pickups) dot(p.position, 2);
    mini.fillStyle = '#ff3366'; for (const v of state.vehicles) dot(v.position, 3);
    if (state.activeMission?.type === 'drive') { mini.fillStyle = '#ff44cc'; dot(new THREE.Vector3(state.activeMission.target.x,0,state.activeMission.target.z),4); }
    function dot(pos, r) { const x = cx + (pos.x-player.pos.x)/scale, y = cy + (pos.z-player.pos.z)/scale; if (x>0&&x<160&&y>0&&y<160) { mini.beginPath(); mini.arc(x,y,r,0,Math.PI*2); mini.fill(); } }
  }

  function popup(text) {
    hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => hud.reward.classList.add('hidden'), 1700);
  }

  function save(slot = state.saveSlot) {
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, pos: player.pos.toArray(), activeMission: state.activeMission, time: Date.now() };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    window.NeonBlockCloud?.save?.(slot, data).then(() => { state.online = true; }).catch(e => { state.lastError = e.message || 'cloud save skipped'; });
    popup('Game saved');
  }

  function load(slot = state.saveSlot) {
    const raw = localStorage.getItem(`neonblock:${slot}`); if (!raw) return popup('No save in this slot');
    const data = JSON.parse(raw); state.cash = data.cash ?? 250; state.xp = data.xp ?? 0; state.level = data.level ?? 1; state.wanted = data.wanted ?? 0;
    player.pos.fromArray(data.pos || [0,2,0]); state.activeMission = data.activeMission || null; popup('Game loaded');
  }

  function closeMenus() { pauseOverlay.classList.add('hidden'); settingsPanel.classList.add('hidden'); missionBoard.classList.add('hidden'); savePanel.classList.add('hidden'); state.paused = false; }
  function togglePause() { state.paused = !state.paused; pauseOverlay.classList.toggle('hidden', !state.paused); }
  function unstuck() { player.inVehicle = null; player.pos.y = 4; player.vel.set(0,0,0); popup('Unstuck'); }

  addEventListener('keydown', e => { state.keys[e.code] = true; if (e.code === 'Escape') togglePause(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyR') unstuck(); });
  addEventListener('keyup', e => { state.keys[e.code] = false; });
  addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  ui('btn-resume').onclick = closeMenus; ui('btn-settings').onclick = () => settingsPanel.classList.toggle('hidden'); ui('btn-close-settings').onclick = () => settingsPanel.classList.add('hidden');
  ui('graphics-quality').value = state.quality; ui('graphics-quality').onchange = e => { state.quality = e.target.value; localStorage.setItem('neonblock:quality', state.quality); renderer.setPixelRatio(state.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.5)); };
  ui('btn-save').onclick = () => { savePanel.classList.toggle('hidden'); }; ui('btn-load').onclick = () => load(); ui('btn-close-save').onclick = () => savePanel.classList.add('hidden'); ui('btn-close-missions').onclick = () => missionBoard.classList.add('hidden');
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { state.saveSlot = b.dataset.slot; save(state.saveSlot); });
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => { state.saveSlot = b.dataset.slot; load(state.saveSlot); });
  ui('btn-export').onclick = () => { exportBox.value = localStorage.getItem(`neonblock:${state.saveSlot}`) || ''; exportBox.select(); };
  ui('btn-import').onclick = () => { try { JSON.parse(exportBox.value); localStorage.setItem(`neonblock:${state.saveSlot}`, exportBox.value); load(state.saveSlot); } catch { popup('Invalid JSON'); } };

  const joy = ui('joystick-container'), stick = ui('joystick-stick');
  joy.addEventListener('pointerdown', e => { state.joystick.active = true; joy.setPointerCapture(e.pointerId); moveJoy(e); });
  joy.addEventListener('pointermove', moveJoy); joy.addEventListener('pointerup', resetJoy); joy.addEventListener('pointercancel', resetJoy);
  function moveJoy(e) { if (!state.joystick.active) return; const r = joy.getBoundingClientRect(); const dx = e.clientX - (r.left+r.width/2); const dy = e.clientY - (r.top+r.height/2); const max = 42; const len = Math.hypot(dx,dy) || 1; const cl = Math.min(max,len); state.joystick.x = dx/ max; state.joystick.y = dy/ max; if (Math.hypot(state.joystick.x,state.joystick.y)>1){ const l=Math.hypot(state.joystick.x,state.joystick.y); state.joystick.x/=l; state.joystick.y/=l;} stick.style.transform = `translate(${dx/len*cl}px,${dy/len*cl}px)`; }
  function resetJoy() { state.joystick.active = false; state.joystick.x = 0; state.joystick.y = 0; stick.style.transform = 'translate(0,0)'; }
  ui('btn-mobile-jump').onclick = () => { state.keys.Space = true; setTimeout(()=>state.keys.Space=false,120); };
  ui('btn-mobile-sprint').onclick = () => { state.mobileSprint = !state.mobileSprint; ui('btn-mobile-sprint').classList.toggle('active', state.mobileSprint); };
  ui('btn-mobile-interact').onclick = interact; ui('btn-mobile-unstuck').onclick = unstuck; ui('btn-mobile-pause').onclick = togglePause;

  function tick(t) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.033, clock.getDelta());
    if (!state.paused) {
      streamWorld(); updatePlayer(dt); updatePickups(dt); updateNpcs(t); updateMission(); levelCheck(); updateCamera(dt); state.nearby = findNearestInteractable();
      if (Date.now() - state.lastSave > 30000) { state.lastSave = Date.now(); save(state.saveSlot); }
    }
    frames++; fpsTime += dt; if (fpsTime >= 0.5) { fps = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
    updateHud(); renderer.render(scene, camera);
  }

  createMissionMarker(); streamWorld(); makeCar(8, 10, 0x17f3ff); load('slot1'); closeMenus(); loading?.classList.add('hidden'); popup('WASD/Arrows move, E interact, Space jump, Shift sprint');
  requestAnimationFrame(tick);
})();
