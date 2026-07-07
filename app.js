(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const hud = {
    cash: document.getElementById('hud-cash'), xp: document.getElementById('hud-xp'), level: document.getElementById('hud-level'), wanted: document.getElementById('hud-wanted'), online: document.getElementById('hud-online'),
    vehicle: document.getElementById('hud-vehicle'), vehicleHp: document.getElementById('hud-vehicle-hp'), vehicleGas: document.getElementById('hud-vehicle-gas'), mission: document.getElementById('hud-mission'),
    fps: document.getElementById('debug-fps'), pos: document.getElementById('debug-pos'), chunks: document.getElementById('debug-chunks'), npcs: document.getElementById('debug-npcs'), activeVehicle: document.getElementById('debug-active-vehicle'), saveSlot: document.getElementById('debug-save-slot'), debugOnline: document.getElementById('debug-online'), lastError: document.getElementById('debug-last-error'),
    reward: document.getElementById('reward-popup'), loading: document.getElementById('loading-screen'), minimap: document.getElementById('minimap-canvas'), arrow: document.getElementById('waypoint-arrow')
  };
  const pauseOverlay = document.getElementById('pause-overlay');
  const savePanel = document.getElementById('save-panel');
  const settingsPanel = document.getElementById('settings-panel');
  const missionBoard = document.getElementById('mission-board');
  const exportJson = document.getElementById('export-json');
  const graphicsSelect = document.getElementById('graphics-quality');

  const CONFIG = { chunkSize: 90, renderRadius: 2, npcLimit: 36, saveKey: 'neonblock-city-v16', slot: 'slot1' };
  const state = {
    cash: 250, xp: 0, level: 1, wanted: 0, paused: false, lastError: 'none', graphics: localStorage.getItem('neonblock-graphics') || 'auto',
    player: { x: 0, y: 1.1, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, onGround: true, inVehicle: null },
    ownedLots: {}, collectedCrates: {}, activeMission: null, completedMissions: {}, cloudReady: false, cloudUser: null
  };
  const input = { keys: new Set(), joyX: 0, joyY: 0, jump: false, sprint: false, interact: false, pointerLocked: false };
  const world = { chunks: new Map(), vehicles: [], crates: [], lots: [], npcs: [], missionZones: [] };
  const missions = [
    { id: 'delivery-1', title: 'Starter Delivery', desc: 'Grab the blue crate and deliver it to the tower plaza.', reward: 180, xp: 70, target: { x: 95, z: -40 }, type: 'delivery' },
    { id: 'taxi-1', title: 'Neon Taxi Run', desc: 'Enter a vehicle and drive to the stadium marker.', reward: 260, xp: 100, target: { x: -140, z: 120 }, type: 'vehicle' },
    { id: 'owner-1', title: 'First Property', desc: 'Buy any glowing lot to start your city empire.', reward: 320, xp: 130, target: { x: 60, z: 70 }, type: 'ownership' }
  ];

  let renderer, scene, camera, clock, playerMesh, cameraRig, sun, groundMat, buildingMats, frame = 0, lastFpsTime = performance.now(), fpsFrames = 0;

  function boot() {
    if (!window.THREE) return fatal('Three.js failed to load. Check network or cached PWA files.');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = !matchMedia('(max-width: 700px)').matches;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a18);
    scene.fog = new THREE.Fog(0x070a18, 110, 470);
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
    clock = new THREE.Clock();
    cameraRig = new THREE.Object3D();
    scene.add(cameraRig); cameraRig.add(camera);
    camera.position.set(0, 9, 14); camera.lookAt(0, 2, 0);

    const hemi = new THREE.HemisphereLight(0x8aefff, 0x160820, 1.7); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(80, 120, 60); sun.castShadow = true; scene.add(sun);
    groundMat = new THREE.MeshStandardMaterial({ color: 0x11172e, roughness: 0.75, metalness: 0.05 });
    buildingMats = [0x161d3f, 0x202757, 0x101733, 0x281747].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: 0x061622, emissiveIntensity: 0.25, roughness: 0.6 }));

    playerMesh = makePlayer(); scene.add(playerMesh);
    loadGame(CONFIG.slot, false);
    wireControls(); wireMenus(); refreshMissionBoard(); updateOnlineState();
    window.addEventListener('resize', resize);
    setInterval(() => saveGame(CONFIG.slot, true), 15000);
    setInterval(updateOnlineState, 10000);
    hud.loading?.classList.add('hidden');
    loop();
  }

  function makePlayer() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x20e7ff, emissive: 0x082433 }));
    body.position.y = 1.1; group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), new THREE.MeshStandardMaterial({ color: 0xffd082 }));
    head.position.y = 2.2; group.add(head);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x272dff, emissive: 0x070739 });
    [-0.27, 0.27].forEach(x => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.38), legMat); leg.position.set(x, 0.35, 0); group.add(leg); });
    return group;
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function seeded(cx, cz, n = 0) { const x = Math.sin(cx * 127.1 + cz * 311.7 + n * 74.7) * 43758.5453; return x - Math.floor(x); }
  function ensureChunks() {
    const pcx = Math.floor(state.player.x / CONFIG.chunkSize), pcz = Math.floor(state.player.z / CONFIG.chunkSize);
    const needed = new Set();
    for (let dx = -CONFIG.renderRadius; dx <= CONFIG.renderRadius; dx++) for (let dz = -CONFIG.renderRadius; dz <= CONFIG.renderRadius; dz++) {
      const cx = pcx + dx, cz = pcz + dz, key = chunkKey(cx, cz); needed.add(key); if (!world.chunks.has(key)) createChunk(cx, cz);
    }
    for (const [key, chunk] of world.chunks) if (!needed.has(key)) { scene.remove(chunk.group); disposeGroup(chunk.group); world.chunks.delete(key); }
  }

  function createChunk(cx, cz) {
    const group = new THREE.Group();
    const size = CONFIG.chunkSize, ox = cx * size, oz = cz * size;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), groundMat); ground.position.set(ox + size / 2, -0.1, oz + size / 2); group.add(ground);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x080b16, roughness: 0.85 });
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(size, 0.04, 8), roadMat); road1.position.set(ox + size / 2, 0.02, oz + size / 2); group.add(road1);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.04, size), roadMat); road2.position.set(ox + size / 2, 0.03, oz + size / 2); group.add(road2);
    const neonMat = new THREE.MeshBasicMaterial({ color: seeded(cx, cz) > .5 ? 0x17f3ff : 0xff33d1 });
    for (let i = 0; i < 8; i++) {
      const bx = ox + 10 + seeded(cx, cz, i) * (size - 20), bz = oz + 10 + seeded(cx, cz, i + 20) * (size - 20);
      if (Math.abs((bx - ox) - size / 2) < 8 || Math.abs((bz - oz) - size / 2) < 8) continue;
      const h = 8 + seeded(cx, cz, i + 40) * 32;
      const b = new THREE.Mesh(new THREE.BoxGeometry(8 + seeded(cx, cz, i + 1) * 10, h, 8 + seeded(cx, cz, i + 2) * 10), buildingMats[i % buildingMats.length]);
      b.position.set(bx, h / 2, bz); b.userData.collidable = true; group.add(b);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(5, .4, .25), neonMat); sign.position.set(bx, Math.min(h - 1, 12), bz + 4.4); group.add(sign);
    }
    if (seeded(cx, cz, 99) > .65) addVehicle(ox + size / 2 + 16, oz + size / 2 - 10, group);
    if (seeded(cx, cz, 199) > .72) addCrate(ox + 12 + seeded(cx, cz, 4) * 62, oz + 12 + seeded(cx, cz, 5) * 62, group);
    if (seeded(cx, cz, 299) > .62) addLot(ox + size / 2 - 28, oz + size / 2 + 22, group, `lot-${cx}-${cz}`);
    if (world.npcs.length < CONFIG.npcLimit && seeded(cx, cz, 399) > .35) addNpc(ox + 15 + seeded(cx, cz, 7) * 60, oz + 15 + seeded(cx, cz, 8) * 60, group);
    scene.add(group); world.chunks.set(chunkKey(cx, cz), { group, cx, cz });
  }

  function addVehicle(x, z, parent) {
    const car = new THREE.Group(); car.position.set(x, .55, z); car.userData = { id: `car-${Math.round(x)}-${Math.round(z)}`, hp: 100, gas: 100, speed: 0, type: 'Neon Kart' };
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, .8, 5.1), new THREE.MeshStandardMaterial({ color: 0xff2bd6, emissive: 0x33001f })); body.position.y = .6; car.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, .8, 2.2), new THREE.MeshStandardMaterial({ color: 0x19f7ff, emissive: 0x052a30 })); cab.position.set(0, 1.2, -.4); car.add(cab);
    parent.add(car); world.vehicles.push(car);
  }
  function addCrate(x, z, parent) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x0d5b70 })); c.position.set(x, 1, z); c.userData = { id: `crate-${Math.round(x)}-${Math.round(z)}`, reward: 40 + Math.floor(Math.random() * 60) }; parent.add(c); world.crates.push(c); }
  function addLot(x, z, parent, id) { const l = new THREE.Mesh(new THREE.BoxGeometry(12, .18, 12), new THREE.MeshStandardMaterial({ color: 0x35ff77, emissive: 0x0b471d, transparent: true, opacity: .62 })); l.position.set(x, .12, z); l.userData = { id, price: 450 }; parent.add(l); world.lots.push(l); }
  function addNpc(x, z, parent) { const n = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xfff176, emissive: 0x302b00 })); n.position.set(x, 1, z); n.userData = { t: Math.random() * 10, homeX: x, homeZ: z }; parent.add(n); world.npcs.push(n); }

  function loop() {
    requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), .05); if (!state.paused) { update(dt); renderer.render(scene, camera); }
    fpsFrames++; const now = performance.now(); if (now - lastFpsTime > 500) { hud.fps.textContent = String(Math.round(fpsFrames * 1000 / (now - lastFpsTime))); fpsFrames = 0; lastFpsTime = now; }
  }
  function update(dt) {
    frame++; ensureChunks(); updatePlayer(dt); updateNpcs(dt); checkInteractables(); updateMission(); updateHud(); updateMinimap();
  }
  function updatePlayer(dt) {
    const p = state.player; const forward = (input.keys.has('KeyW') || input.keys.has('ArrowUp') ? 1 : 0) - (input.keys.has('KeyS') || input.keys.has('ArrowDown') ? 1 : 0) - input.joyY;
    const strafe = (input.keys.has('KeyD') || input.keys.has('ArrowRight') ? 1 : 0) - (input.keys.has('KeyA') || input.keys.has('ArrowLeft') ? 1 : 0) + input.joyX;
    const sprint = input.keys.has('ShiftLeft') || input.sprint; const activeCar = p.inVehicle ? world.vehicles.find(v => v.userData.id === p.inVehicle) : null;
    if (activeCar) {
      const accel = forward * 34 * dt; activeCar.userData.speed = THREE.MathUtils.clamp(activeCar.userData.speed + accel, -16, sprint ? 44 : 30);
      activeCar.rotation.y -= strafe * dt * (activeCar.userData.speed >= 0 ? 1.8 : -1.8); activeCar.userData.speed *= .985;
      if (Math.abs(activeCar.userData.speed) > .1 && activeCar.userData.gas > 0) activeCar.userData.gas = Math.max(0, activeCar.userData.gas - dt * Math.abs(activeCar.userData.speed) * .04);
      if (activeCar.userData.gas <= 0) activeCar.userData.speed *= .88;
      activeCar.position.x -= Math.sin(activeCar.rotation.y) * activeCar.userData.speed * dt; activeCar.position.z -= Math.cos(activeCar.rotation.y) * activeCar.userData.speed * dt;
      p.x = activeCar.position.x; p.z = activeCar.position.z; p.rot = activeCar.rotation.y; playerMesh.visible = false;
    } else {
      const angle = Math.atan2(strafe, forward || .0001); const mag = Math.min(1, Math.hypot(strafe, forward)); const speed = (sprint ? 15 : 8) * mag;
      if (mag > .05) { p.rot = angle; p.vx = Math.sin(angle) * speed; p.vz = Math.cos(angle) * speed; } else { p.vx *= .82; p.vz *= .82; }
      if ((input.jump || input.keys.has('Space')) && p.onGround) { p.vy = 9.5; p.onGround = false; }
      p.vy -= 26 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y <= 1.1) { p.y = 1.1; p.vy = 0; p.onGround = true; }
      playerMesh.visible = true; playerMesh.position.set(p.x, p.y - 1.1, p.z); playerMesh.rotation.y = p.rot;
    }
    input.jump = false; const camDistance = activeCar ? 22 : 13; const camHeight = activeCar ? 12 : 7;
    cameraRig.position.lerp(new THREE.Vector3(p.x, p.y + 1.3, p.z), .12); camera.position.lerp(new THREE.Vector3(Math.sin(p.rot) * camDistance, camHeight, Math.cos(p.rot) * camDistance), .08); camera.lookAt(cameraRig.position.x, cameraRig.position.y + 1, cameraRig.position.z);
  }
  function updateNpcs(dt) { world.npcs = world.npcs.filter(n => n.parent); for (const n of world.npcs) { n.userData.t += dt; n.position.x = n.userData.homeX + Math.sin(n.userData.t) * 3; n.position.z = n.userData.homeZ + Math.cos(n.userData.t * .7) * 3; } }
  function checkInteractables() { if (!input.interact) return; input.interact = false; const p = state.player; if (p.inVehicle) { const car = world.vehicles.find(v => v.userData.id === p.inVehicle); if (car) { p.x = car.position.x + 3; p.z = car.position.z + 3; } p.inVehicle = null; popup('Exited vehicle'); return; }
    let nearest = null, dist = 999; for (const v of world.vehicles) { const d = distance2(p.x, p.z, v.position.x, v.position.z); if (d < dist) { dist = d; nearest = v; } } if (nearest && dist < 24) { p.inVehicle = nearest.userData.id; popup('Entered Neon Kart'); return; }
    for (const c of world.crates) { if (!c.parent || state.collectedCrates[c.userData.id]) continue; if (distance2(p.x, p.z, c.position.x, c.position.z) < 18) { state.collectedCrates[c.userData.id] = true; state.cash += c.userData.reward; addXp(20); c.parent.remove(c); popup(`Crate +$${c.userData.reward}`); return; } }
    for (const l of world.lots) { if (!l.parent || state.ownedLots[l.userData.id]) continue; if (distance2(p.x, p.z, l.position.x, l.position.z) < 30) { if (state.cash >= l.userData.price) { state.cash -= l.userData.price; state.ownedLots[l.userData.id] = true; l.material.color.set(0xffd447); addXp(80); popup('Lot purchased'); } else popup(`Need $${l.userData.price}`); return; } }
  }
  function updateMission() { if (!state.activeMission) state.activeMission = missions.find(m => !state.completedMissions[m.id])?.id || null; const m = missions.find(x => x.id === state.activeMission); if (!m) return; const p = state.player; let done = false;
    if (m.type === 'delivery') done = Object.keys(state.collectedCrates).length > 0 && distance2(p.x, p.z, m.target.x, m.target.z) < 160;
    if (m.type === 'vehicle') done = !!p.inVehicle && distance2(p.x, p.z, m.target.x, m.target.z) < 260;
    if (m.type === 'ownership') done = Object.keys(state.ownedLots).length > 0;
    if (done) { state.completedMissions[m.id] = true; state.cash += m.reward; addXp(m.xp); popup(`${m.title} complete +$${m.reward}`); state.activeMission = missions.find(x => !state.completedMissions[x.id])?.id || null; saveGame(CONFIG.slot, true); }
  }
  function addXp(n) { state.xp += n; const next = state.level * 180; if (state.xp >= next) { state.xp -= next; state.level++; state.cash += 100; popup(`Level ${state.level}! Bonus $100`); } }
  function updateHud() { const m = missions.find(x => x.id === state.activeMission); const car = state.player.inVehicle ? world.vehicles.find(v => v.userData.id === state.player.inVehicle) : null; hud.cash.textContent = `$${state.cash}`; hud.xp.textContent = state.xp; hud.level.textContent = state.level; hud.wanted.textContent = state.wanted; hud.mission.textContent = m ? m.title : 'Free roam'; hud.vehicle.textContent = car ? car.userData.type : 'On foot'; hud.vehicleHp.textContent = car ? Math.round(car.userData.hp) : '100'; hud.vehicleGas.textContent = car ? Math.round(car.userData.gas) : '100'; hud.pos.textContent = `${Math.round(state.player.x)},${Math.round(state.player.y)},${Math.round(state.player.z)}`; hud.chunks.textContent = world.chunks.size; hud.npcs.textContent = world.npcs.filter(n => n.parent).length; hud.activeVehicle.textContent = car ? car.userData.id : 'None'; hud.saveSlot.textContent = CONFIG.slot; hud.online.textContent = navigator.onLine ? 'online' : 'offline'; hud.debugOnline.textContent = state.cloudReady ? 'cloud adapter ready' : (navigator.onLine ? 'online/local' : 'offline/local'); hud.lastError.textContent = state.lastError; const angle = m ? Math.atan2(m.target.x - state.player.x, m.target.z - state.player.z) - state.player.rot : 0; hud.arrow.style.transform = `rotate(${angle}rad)`; }
  function updateMinimap() { const ctx = hud.minimap?.getContext('2d'); if (!ctx || frame % 3) return; ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#071025'; ctx.fillRect(0,0,160,160); ctx.strokeStyle = '#17f3ff55'; for(let i=0;i<160;i+=20){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,160);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(160,i);ctx.stroke();} ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(80,80,5,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#ff33d1'; for (const v of world.vehicles.slice(-24)) { const x=80+(v.position.x-state.player.x)*.25, y=80+(v.position.z-state.player.z)*.25; if(x>0&&x<160&&y>0&&y<160) ctx.fillRect(x-2,y-2,4,4); } const m=missions.find(x=>x.id===state.activeMission); if(m){ctx.fillStyle='#fff176'; const x=80+(m.target.x-state.player.x)*.25,y=80+(m.target.z-state.player.z)*.25; ctx.fillRect(Math.max(0,Math.min(156,x)),Math.max(0,Math.min(156,y)),4,4);} }
  function wireControls() { addEventListener('keydown', e => { input.keys.add(e.code); if (e.code === 'KeyE') input.interact = true; if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); if (e.code === 'KeyM') showMissionBoard(); if (e.code === 'KeyR') unstuck(); }); addEventListener('keyup', e => input.keys.delete(e.code));
    const bind = (id, down, up = () => {}) => { const el = document.getElementById(id); if (!el) return; ['pointerdown','touchstart'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); down(); }, { passive:false })); ['pointerup','pointercancel','touchend'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); up(); }, { passive:false })); };
    bind('btn-mobile-jump', () => input.jump = true); bind('btn-mobile-sprint', () => input.sprint = true, () => input.sprint = false); bind('btn-mobile-interact', () => input.interact = true); bind('btn-mobile-unstuck', unstuck); bind('btn-mobile-pause', togglePause);
    const joy = document.getElementById('joystick-container'), stick = document.getElementById('joystick-stick'); let joyId = null; if (joy) joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(joyId); moveJoy(e); }); if (joy) joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); }); if (joy) joy.addEventListener('pointerup', resetJoy); if (joy) joy.addEventListener('pointercancel', resetJoy);
    function moveJoy(e) { const r = joy.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), max = 44, mag = Math.min(max, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); input.joyX = Math.cos(a) * mag / max; input.joyY = Math.sin(a) * mag / max; stick.style.transform = `translate(${Math.cos(a)*mag}px,${Math.sin(a)*mag}px)`; }
    function resetJoy(){ joyId=null; input.joyX=0; input.joyY=0; if(stick) stick.style.transform='translate(0,0)'; }
  }
  function wireMenus() { document.getElementById('btn-resume')?.addEventListener('click', togglePause); document.getElementById('btn-settings')?.addEventListener('click', () => settingsPanel.classList.toggle('hidden')); document.getElementById('btn-save')?.addEventListener('click', () => savePanel.classList.remove('hidden')); document.getElementById('btn-load')?.addEventListener('click', () => { loadGame(CONFIG.slot); togglePause(false); }); document.getElementById('btn-close-settings')?.addEventListener('click', () => settingsPanel.classList.add('hidden')); document.getElementById('btn-close-save')?.addEventListener('click', () => savePanel.classList.add('hidden')); document.getElementById('btn-close-missions')?.addEventListener('click', () => missionBoard.classList.add('hidden')); graphicsSelect.value = state.graphics; graphicsSelect?.addEventListener('change', () => { state.graphics = graphicsSelect.value; localStorage.setItem('neonblock-graphics', state.graphics); applyGraphics(); }); document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => saveGame(b.dataset.slot))); document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadGame(b.dataset.slot))); document.getElementById('btn-export')?.addEventListener('click', () => exportJson.value = JSON.stringify(snapshot(), null, 2)); document.getElementById('btn-import')?.addEventListener('click', () => { try { hydrate(JSON.parse(exportJson.value)); popup('Imported save'); } catch(e) { state.lastError = 'Import failed'; popup('Bad save JSON'); } }); }
  function showMissionBoard(){ refreshMissionBoard(); missionBoard.classList.remove('hidden'); pauseOverlay.classList.remove('hidden'); state.paused = true; }
  function refreshMissionBoard(){ const ul=document.getElementById('mission-list'); if(!ul) return; ul.innerHTML=''; for(const m of missions){ const li=document.createElement('li'); li.innerHTML=`<strong>${m.title}</strong><br><small>${m.desc}</small>`; li.onclick=()=>{state.activeMission=m.id; missionBoard.classList.add('hidden'); togglePause(false);}; ul.appendChild(li);} }
  function saveGame(slot=CONFIG.slot, silent=false){ const data=snapshot(); localStorage.setItem(`${CONFIG.saveKey}:${slot}`, JSON.stringify(data)); window.NeonBlockCloud?.save?.(slot, data).catch(e=>{ state.lastError='Cloud save skipped'; }); if(!silent) popup('Game saved'); }
  function loadGame(slot=CONFIG.slot, announce=true){ const raw=localStorage.getItem(`${CONFIG.saveKey}:${slot}`); if(!raw) { if(announce) popup('No save in slot'); return; } try { hydrate(JSON.parse(raw)); if(announce) popup('Game loaded'); } catch(e){ state.lastError='Load failed'; } }
  function snapshot(){ return { v:16, cash:state.cash, xp:state.xp, level:state.level, wanted:state.wanted, player:{x:state.player.x,y:state.player.y,z:state.player.z,rot:state.player.rot}, ownedLots:state.ownedLots, collectedCrates:state.collectedCrates, activeMission:state.activeMission, completedMissions:state.completedMissions }; }
  function hydrate(d){ state.cash=d.cash??state.cash; state.xp=d.xp??0; state.level=d.level??1; state.wanted=d.wanted??0; Object.assign(state.player, d.player || {}); state.player.inVehicle=null; state.ownedLots=d.ownedLots||{}; state.collectedCrates=d.collectedCrates||{}; state.activeMission=d.activeMission||null; state.completedMissions=d.completedMissions||{}; }
  function applyGraphics(){ const low = state.graphics === 'low' || (state.graphics === 'auto' && matchMedia('(max-width: 700px)').matches); CONFIG.renderRadius = low ? 1 : 2; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.1 : 1.7)); renderer.shadowMap.enabled = !low; }
  function updateOnlineState(){ state.cloudReady = !!window.NeonBlockCloud; }
  function togglePause(force){ state.paused = typeof force === 'boolean' ? force : !state.paused; pauseOverlay.classList.toggle('hidden', !state.paused); }
  function unstuck(){ state.player.x = Math.round(state.player.x / CONFIG.chunkSize) * CONFIG.chunkSize + 10; state.player.z = Math.round(state.player.z / CONFIG.chunkSize) * CONFIG.chunkSize + 10; state.player.y = 3; state.player.vy = 0; state.player.inVehicle = null; popup('Unstuck'); }
  function resize(){ camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  function distance2(ax,az,bx,bz){ const dx=ax-bx,dz=az-bz; return dx*dx+dz*dz; }
  function popup(msg){ hud.reward.textContent = msg; hud.reward.classList.remove('hidden'); clearTimeout(popup.t); popup.t=setTimeout(()=>hud.reward.classList.add('hidden'),1800); }
  function disposeGroup(g){ g.traverse(o => { if(o.geometry) o.geometry.dispose?.(); }); world.vehicles = world.vehicles.filter(v => v.parent); world.crates = world.crates.filter(c => c.parent); world.lots = world.lots.filter(l => l.parent); world.npcs = world.npcs.filter(n => n.parent); }
  function fatal(msg){ state.lastError = msg; if(hud.loading) hud.loading.innerHTML = `<div class="loading-title">NeonBlock City</div><div class="loading-sub">${msg}</div>`; console.error(msg); }
  document.addEventListener('DOMContentLoaded', boot);
})();
