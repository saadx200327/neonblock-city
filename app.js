(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: text('hud-cash'), xp: text('hud-xp'), level: text('hud-level'), wanted: text('hud-wanted'), online: text('hud-online'),
    vehicle: text('hud-vehicle'), vehicleHp: text('hud-vehicle-hp'), gas: text('hud-vehicle-gas'), mission: text('hud-mission'),
    fps: text('debug-fps'), pos: text('debug-pos'), chunks: text('debug-chunks'), npcs: text('debug-npcs'), activeVehicle: text('debug-active-vehicle'),
    saveSlot: text('debug-save-slot'), debugOnline: text('debug-online'), lastError: text('debug-last-error')
  };
  const minimap = document.getElementById('minimap-canvas');
  const mini = minimap.getContext('2d');
  const popup = document.getElementById('reward-popup');
  const pauseOverlay = document.getElementById('pause-overlay');
  const savePanel = document.getElementById('save-panel');
  const settingsPanel = document.getElementById('settings-panel');
  const missionBoard = document.getElementById('mission-board');
  const missionList = document.getElementById('mission-list');
  const exportBox = document.getElementById('export-json');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 75, 280);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);

  const hemi = new THREE.HemisphereLight(0x88ccff, 0x071024, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(60, 90, 40); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshLambertMaterial({ color: 0x101831 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(1800, 90, 0x17f3ff, 0x182449); grid.material.opacity = 0.22; grid.material.transparent = true; scene.add(grid);

  const mats = {
    player: mat(0x18f3ff), car: mat(0xff2bd6), npc: mat(0xffd166), cash: mat(0x66ff99), lot: mat(0x815cff), road: mat(0x17203f), building: mat(0x263767), owned: mat(0x5ef38c)
  };
  const player = {
    x: 0, z: 0, y: 1, vy: 0, yaw: 0, cash: 150, xp: 0, level: 1, wanted: 0, slot: 'slot1', mission: null,
    owned: new Set(), discovered: new Set(), activeVehicle: null, lastSafe: { x: 0, z: 0 }
  };
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1), mats.player); scene.add(body);
  const keys = new Set();
  const chunks = new Map();
  const vehicles = [];
  const pickups = [];
  const npcs = [];
  const lots = [];
  const chunkSize = 72;
  const activeRadius = 2;
  let last = performance.now(), frames = 0, fpsAt = last, paused = false, joy = { x: 0, y: 0 }, sprintHeld = false;

  const missions = [
    { id: 'courier', name: 'Neon Courier', text: 'Collect 3 green cash cubes.', goal: 3, reward: 240, xp: 80, count: 0 },
    { id: 'driver', name: 'Test Drive', text: 'Enter a vehicle and drive 250m.', goal: 250, reward: 360, xp: 120, count: 0 },
    { id: 'owner', name: 'Block Owner', text: 'Buy one purple lot.', goal: 1, reward: 500, xp: 160, count: 0 }
  ];

  function text(id) { return document.getElementById(id); }
  function mat(color) { return new THREE.MeshLambertMaterial({ color }); }
  function rnd(n) { const x = Math.sin(n * 999.17) * 43758.5453; return x - Math.floor(x); }
  function setErr(e) { hud.lastError.textContent = String(e && e.message ? e.message : e).slice(0, 64); }
  function show(msg) { popup.textContent = msg; popup.classList.remove('hidden'); clearTimeout(show.t); show.t = setTimeout(() => popup.classList.add('hidden'), 1800); }

  function makeChunk(cx, cz) {
    const key = `${cx},${cz}`; if (chunks.has(key)) return;
    const group = new THREE.Group(); group.userData.key = key;
    const baseX = cx * chunkSize, baseZ = cz * chunkSize;
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(chunkSize, .08, 9), mats.road); road1.position.set(baseX, .04, baseZ); group.add(road1);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(9, .08, chunkSize), mats.road); road2.position.set(baseX, .05, baseZ); group.add(road2);
    for (let i = 0; i < 6; i++) {
      const seed = cx * 1000 + cz * 37 + i;
      const bx = baseX + (rnd(seed) - .5) * 56;
      const bz = baseZ + (rnd(seed + 4) - .5) * 56;
      if (Math.abs(bx - baseX) < 8 || Math.abs(bz - baseZ) < 8) continue;
      const h = 8 + rnd(seed + 9) * 34;
      const b = new THREE.Mesh(new THREE.BoxGeometry(7 + rnd(seed + 2) * 12, h, 7 + rnd(seed + 3) * 12), mats.building);
      b.position.set(bx, h / 2, bz); group.add(b);
    }
    if (rnd(cx * 41 + cz * 19) > .66) addPickup(baseX + 18, baseZ - 18, group);
    if (rnd(cx * 13 + cz * 71) > .72) addVehicle(baseX - 20, baseZ + 12, group);
    if (rnd(cx * 23 + cz * 53) > .58) addLot(baseX + 24, baseZ + 24, group, key);
    if (rnd(cx * 61 + cz * 29) > .45) addNpc(baseX - 24, baseZ - 24, group);
    chunks.set(key, group); scene.add(group);
  }
  function addPickup(x, z, group) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mats.cash); m.position.set(x, .9, z); m.userData.value = 50; pickups.push(m); group.add(m); }
  function addVehicle(x, z, group) { const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 5), mats.car); m.position.set(x, .75, z); m.userData = { hp: 100, gas: 100, speed: 0, driven: 0 }; vehicles.push(m); group.add(m); }
  function addLot(x, z, group, chunk) { const m = new THREE.Mesh(new THREE.BoxGeometry(10, .18, 10), mats.lot); m.position.set(x, .12, z); m.userData = { id: `lot-${chunk}`, price: 300, owned: false }; lots.push(m); group.add(m); }
  function addNpc(x, z, group) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), mats.npc); m.position.set(x, .9, z); m.userData = { phase: rnd(x + z) * 10 }; npcs.push(m); group.add(m); }

  function streamWorld() {
    const cx = Math.round(player.x / chunkSize), cz = Math.round(player.z / chunkSize);
    for (let x = cx - activeRadius; x <= cx + activeRadius; x++) for (let z = cz - activeRadius; z <= cz + activeRadius; z++) makeChunk(x, z);
    for (const [key, group] of chunks) {
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > activeRadius + 1 || Math.abs(gz - cz) > activeRadius + 1) { scene.remove(group); chunks.delete(key); }
    }
  }

  function update(dt) {
    if (paused) return;
    streamWorld();
    const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - joy.y;
    const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joy.x;
    const sprint = keys.has('shift') || sprintHeld;
    const inCar = player.activeVehicle;
    let speed = inCar ? 24 : (sprint ? 13 : 8);
    let len = Math.hypot(forward, strafe) || 1;
    const dx = (strafe / len) * speed * dt, dz = (-forward / len) * speed * dt;
    if (inCar) {
      if (inCar.userData.gas > 0) { inCar.position.x += dx * 1.6; inCar.position.z += dz * 1.6; inCar.userData.gas = Math.max(0, inCar.userData.gas - Math.hypot(dx, dz) * .035); inCar.userData.driven += Math.hypot(dx, dz) * 1.6; }
      player.x = inCar.position.x; player.z = inCar.position.z;
      progress('driver', inCar.userData.driven);
    } else { player.x += dx; player.z += dz; }
    if (Math.hypot(dx, dz) > .01) player.yaw = Math.atan2(dx, dz);
    if ((keys.has(' ') || keys.has('space')) && player.y <= 1.01) player.vy = 8;
    player.vy -= 22 * dt; player.y = Math.max(1, player.y + player.vy * dt); if (player.y === 1) player.vy = 0;
    body.position.set(player.x, player.y, player.z); body.rotation.y = player.yaw;
    if (inCar) body.visible = false; else body.visible = true;
    player.lastSafe = { x: player.x, z: player.z };
    for (const p of pickups) if (p.parent && dist(p.position.x, p.position.z) < 3) { player.cash += p.userData.value; progress('courier', 1, true); p.parent.remove(p); show('+$' + p.userData.value); }
    for (const n of npcs) { n.userData.phase += dt; n.position.x += Math.sin(n.userData.phase) * dt * .8; n.position.z += Math.cos(n.userData.phase * .7) * dt * .8; }
    updateCamera(dt); drawMini(); updateHud(); autosave();
  }
  function dist(x, z) { return Math.hypot(player.x - x, player.z - z); }
  function interact() {
    if (player.activeVehicle) { player.activeVehicle = null; show('Exited vehicle'); return; }
    const car = vehicles.find(v => v.parent && dist(v.position.x, v.position.z) < 5);
    if (car) { player.activeVehicle = car; show('Entered vehicle'); return; }
    const lot = lots.find(l => l.parent && dist(l.position.x, l.position.z) < 7);
    if (lot) {
      if (lot.userData.owned) return show('Already owned');
      if (player.cash < lot.userData.price) return show('Need $' + lot.userData.price);
      player.cash -= lot.userData.price; lot.userData.owned = true; lot.material = mats.owned; player.owned.add(lot.userData.id); progress('owner', 1); show('Lot purchased'); return;
    }
    openMissions();
  }
  function progress(id, value, absolute = false) {
    const m = player.mission; if (!m || m.id !== id) return;
    m.count = absolute ? m.count + value : Math.max(m.count, value);
    if (m.count >= m.goal) { player.cash += m.reward; player.xp += m.xp; if (player.xp >= player.level * 200) { player.xp = 0; player.level++; } show(`${m.name} complete +$${m.reward}`); player.mission = null; }
  }
  function openMissions() {
    missionList.innerHTML = '';
    missions.forEach(base => { const li = document.createElement('li'); const btn = document.createElement('button'); btn.textContent = `${base.name}: ${base.text}`; btn.onclick = () => { player.mission = { ...base, count: 0 }; missionBoard.classList.add('hidden'); paused = false; pauseOverlay.classList.add('hidden'); show('Mission started'); }; li.appendChild(btn); missionList.appendChild(li); });
    paused = true; pauseOverlay.classList.remove('hidden'); missionBoard.classList.remove('hidden');
  }
  function updateCamera(dt) { const target = new THREE.Vector3(player.x, player.y + 10, player.z + 18); camera.position.lerp(target, Math.min(1, dt * 5)); camera.lookAt(player.x, player.y + 1.4, player.z); }
  function drawMini() { mini.clearRect(0,0,160,160); mini.fillStyle='#071024'; mini.fillRect(0,0,160,160); mini.strokeStyle='#17f3ff55'; for(let i=0;i<160;i+=20){mini.beginPath();mini.moveTo(i,0);mini.lineTo(i,160);mini.moveTo(0,i);mini.lineTo(160,i);mini.stroke();} mini.fillStyle='#18f3ff'; mini.beginPath(); mini.arc(80,80,5,0,7); mini.fill(); mini.fillStyle='#ff2bd6'; vehicles.slice(-20).forEach(v=>{ if(v.parent){ mini.fillRect(80+(v.position.x-player.x)/3,80+(v.position.z-player.z)/3,3,3); }}); }
  function updateHud() { hud.cash.textContent = '$' + player.cash|0; hud.xp.textContent = player.xp|0; hud.level.textContent = player.level; hud.wanted.textContent = player.wanted; hud.online.textContent = window.NeonBlockCloud?.enabled ? 'cloud-ready' : 'local'; hud.debugOnline.textContent = hud.online.textContent; hud.vehicle.textContent = player.activeVehicle ? 'Neon Kart' : 'On foot'; hud.vehicleHp.textContent = player.activeVehicle ? player.activeVehicle.userData.hp|0 : 100; hud.gas.textContent = player.activeVehicle ? player.activeVehicle.userData.gas|0 : 100; hud.mission.textContent = player.mission ? `${player.mission.name} ${Math.floor(player.mission.count)}/${player.mission.goal}` : 'None'; hud.pos.textContent = `${player.x.toFixed(1)},${player.y.toFixed(1)},${player.z.toFixed(1)}`; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.filter(n=>n.parent).length; hud.activeVehicle.textContent = player.activeVehicle ? 'Neon Kart' : 'None'; hud.saveSlot.textContent = player.slot; }
  function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; try { update(dt); renderer.render(scene, camera); } catch(e) { setErr(e); } frames++; if(now - fpsAt > 1000){ hud.fps.textContent = frames; frames = 0; fpsAt = now; } requestAnimationFrame(loop); }

  function save(slot = player.slot) { const data = { x: player.x, z: player.z, cash: player.cash, xp: player.xp, level: player.level, wanted: player.wanted, owned: [...player.owned] }; localStorage.setItem('neonblock-' + slot, JSON.stringify(data)); window.NeonBlockCloud?.save?.(slot, data).catch(setErr); show('Saved ' + slot); }
  function load(slot = player.slot) { const raw = localStorage.getItem('neonblock-' + slot); if(!raw) return show('No save found'); const data = JSON.parse(raw); player.x=data.x||0; player.z=data.z||0; player.cash=data.cash||150; player.xp=data.xp||0; player.level=data.level||1; player.wanted=data.wanted||0; player.owned = new Set(data.owned||[]); show('Loaded ' + slot); }
  function autosave() { if (!autosave.t || performance.now() - autosave.t > 15000) { autosave.t = performance.now(); const data = { x: player.x, z: player.z, cash: player.cash, xp: player.xp, level: player.level, owned: [...player.owned] }; localStorage.setItem('neonblock-autosave', JSON.stringify(data)); } }
  function unstuck() { player.activeVehicle = null; player.x = player.lastSafe.x || 0; player.z = player.lastSafe.z || 0; player.y = 1; player.vy = 0; show('Unstuck'); }

  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if(e.key==='Escape') togglePause(); if(e.key.toLowerCase()==='e') interact(); if(e.key.toLowerCase()==='u') unstuck(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.getElementById('btn-resume').onclick = togglePause;
  document.getElementById('btn-mobile-pause').onclick = togglePause;
  document.getElementById('btn-settings').onclick = () => settingsPanel.classList.toggle('hidden');
  document.getElementById('btn-close-settings').onclick = () => settingsPanel.classList.add('hidden');
  document.getElementById('btn-save').onclick = () => savePanel.classList.toggle('hidden');
  document.getElementById('btn-load').onclick = () => load(player.slot);
  document.getElementById('btn-close-save').onclick = () => savePanel.classList.add('hidden');
  document.getElementById('btn-close-missions').onclick = () => missionBoard.classList.add('hidden');
  document.getElementById('btn-mobile-interact').onclick = interact;
  document.getElementById('btn-mobile-jump').onclick = () => { if (player.y <= 1.01) player.vy = 8; };
  document.getElementById('btn-mobile-unstuck').onclick = unstuck;
  const sprintBtn = document.getElementById('btn-mobile-sprint'); sprintBtn.onpointerdown = () => sprintHeld = true; sprintBtn.onpointerup = sprintBtn.onpointercancel = () => sprintHeld = false;
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { player.slot = b.dataset.slot; save(player.slot); });
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => { player.slot = b.dataset.slot; load(player.slot); });
  document.getElementById('btn-export').onclick = () => exportBox.value = localStorage.getItem('neonblock-' + player.slot) || '';
  document.getElementById('btn-import').onclick = () => { JSON.parse(exportBox.value); localStorage.setItem('neonblock-' + player.slot, exportBox.value); load(player.slot); };
  function togglePause(){ paused = !paused; pauseOverlay.classList.toggle('hidden', !paused); }

  const joyBox = document.getElementById('joystick-container'), stick = document.getElementById('joystick-stick');
  joyBox.addEventListener('pointermove', e => { if(!joyBox.hasPointerCapture(e.pointerId)) joyBox.setPointerCapture(e.pointerId); const r=joyBox.getBoundingClientRect(), x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2, m=Math.min(42, Math.hypot(x,y)), a=Math.atan2(y,x); joy.x=Math.cos(a)*m/42; joy.y=Math.sin(a)*m/42; stick.style.transform=`translate(${joy.x*42}px,${joy.y*42}px)`; });
  joyBox.addEventListener('pointerup', resetJoy); joyBox.addEventListener('pointercancel', resetJoy); function resetJoy(){ joy.x=0; joy.y=0; stick.style.transform='translate(0,0)'; }

  streamWorld(); loading.style.display = 'none'; requestAnimationFrame(loop);
})();
