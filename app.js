(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    loading: $('loading-screen'), cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'), minimap: $('minimap-canvas'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error'), reward: $('reward-popup'),
    pause: $('pause-overlay'), settings: $('settings-panel'), missions: $('mission-board'), missionList: $('mission-list'), savePanel: $('save-panel'), exportJson: $('export-json'),
    stick: $('joystick-stick'), joy: $('joystick-container')
  };

  const canvas = $('game-canvas');
  if (!window.THREE || !canvas) {
    if (ui.loading) ui.loading.innerHTML = '<div class="loading-title">NeonBlock City</div><div class="loading-sub">Three.js failed to load. Check your connection and refresh.</div>';
    return;
  }

  const CONFIG = { chunkSize: 60, viewDistance: 2, npcLimit: 30, saveKey: 'neonblock_city_', worldSeed: 7257 };
  const state = {
    cash: 125, xp: 0, level: 1, wanted: 0, activeSlot: 'slot1', paused: false, online: false, lastError: 'none',
    ownedLots: {}, completed: {}, mission: null, nearHint: '', t: 0
  };
  const keys = new Set();
  const chunks = new Map();
  const npcs = [];
  const vehicles = [];
  const lots = [];
  const crates = [];
  const interactables = [];
  const missions = [
    { id: 'courier', title: 'Neon Courier', goal: 'Reach the pink delivery beam', reward: 180, xp: 60, target: new THREE.Vector3(120, 0, -90) },
    { id: 'cratehunt', title: 'Crate Hunt', goal: 'Collect 3 glowing crates', reward: 240, xp: 90, crates: 3 },
    { id: 'towrun', title: 'Tow Run', goal: 'Drive any vehicle through the blue gate', reward: 300, xp: 110, target: new THREE.Vector3(-140, 0, 130), needsVehicle: true }
  ];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x050814, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050814, 70, 260);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 600);
  const hemi = new THREE.HemisphereLight(0x9adfff, 0x090915, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(50, 80, 20); scene.add(sun);

  const player = {
    mesh: makeBlockDude(0x17f3ff), pos: new THREE.Vector3(0, 2, 0), vel: new THREE.Vector3(), yaw: 0,
    onGround: false, inVehicle: null, sprint: false, collectedCrates: 0
  };
  scene.add(player.mesh);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x11172d, roughness: 0.95 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const neonMats = [0x17f3ff, 0xff3bd4, 0xffd166, 0x5ef38c, 0x8f7cff].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 }));
  const buildingMats = [0x283059, 0x202744, 0x30396d, 0x141a3b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));

  const missionBeam = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 50, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3bd4, transparent: true, opacity: 0.28 }));
  missionBeam.visible = false; scene.add(missionBeam);

  function rand(x, z) { const s = Math.sin(x * 127.1 + z * 311.7 + CONFIG.worldSeed) * 43758.5453123; return s - Math.floor(s); }
  function makeBox(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = false; m.receiveShadow = true; return m; }
  function makeBlockDude(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const head = makeBox(1.1, 1.1, 1.1, mat); head.position.y = 2.2;
    const body = makeBox(1.25, 1.6, 0.75, mat); body.position.y = 0.9;
    const l = makeBox(0.35, 1.1, 0.35, mat); l.position.set(-0.35, -0.45, 0);
    const r = l.clone(); r.position.x = 0.35;
    g.add(head, body, l, r); return g;
  }
  function makeVehicle(x, z, color = 0xff3366) {
    const group = new THREE.Group();
    const body = makeBox(4.5, 1, 7, new THREE.MeshStandardMaterial({ color, roughness: 0.45 })); body.position.y = 1;
    const cabin = makeBox(3.2, 1.2, 3, new THREE.MeshStandardMaterial({ color: 0x141a3b, metalness: 0.1 })); cabin.position.set(0, 1.9, -0.6);
    group.add(body, cabin); group.position.set(x, 0, z); group.userData = { type: 'vehicle', hp: 100, gas: 100, speed: 0, name: 'Neon Kart' };
    scene.add(group); vehicles.push(group); interactables.push(group); return group;
  }
  function streamWorld() {
    const pcx = Math.floor(player.pos.x / CONFIG.chunkSize), pcz = Math.floor(player.pos.z / CONFIG.chunkSize);
    const needed = new Set();
    for (let x = pcx - CONFIG.viewDistance; x <= pcx + CONFIG.viewDistance; x++) for (let z = pcz - CONFIG.viewDistance; z <= pcz + CONFIG.viewDistance; z++) { needed.add(`${x},${z}`); if (!chunks.has(`${x},${z}`)) buildChunk(x, z); }
    for (const [key, group] of chunks) if (!needed.has(key)) { scene.remove(group); chunks.delete(key); }
  }
  function buildChunk(cx, cz) {
    const group = new THREE.Group();
    group.name = `chunk-${cx},${cz}`;
    const ox = cx * CONFIG.chunkSize, oz = cz * CONFIG.chunkSize;
    const ground = makeBox(CONFIG.chunkSize, 0.2, CONFIG.chunkSize, groundMat); ground.position.set(ox + 30, -0.1, oz + 30); group.add(ground);
    if (cx === 0 || cz === 0) { const road = makeBox(cx === 0 ? 14 : CONFIG.chunkSize, 0.05, cz === 0 ? 14 : CONFIG.chunkSize, roadMat); road.position.set(ox + 30, 0.02, oz + 30); group.add(road); }
    for (let i = 0; i < 7; i++) {
      const rx = ox + 8 + rand(cx * 11 + i, cz) * 44, rz = oz + 8 + rand(cx, cz * 13 + i) * 44;
      if (Math.abs(rx) < 12 || Math.abs(rz) < 12) continue;
      const h = 5 + rand(cx + i, cz - i) * 24;
      const b = makeBox(6 + rand(i, cx) * 8, h, 6 + rand(cz, i) * 8, buildingMats[i % buildingMats.length]);
      b.position.set(rx, h / 2, rz); group.add(b);
      const sign = makeBox(4, 0.35, 0.15, neonMats[i % neonMats.length]); sign.position.set(rx, Math.min(h + 0.35, h * 0.75), rz + 3.3); group.add(sign);
    }
    if (rand(cx, cz) > 0.78) {
      const lot = makeBox(11, 0.12, 11, new THREE.MeshStandardMaterial({ color: 0x22331f, emissive: 0x5ef38c, emissiveIntensity: 0.12 }));
      lot.position.set(ox + 30, 0.07, oz + 30); lot.userData = { type: 'lot', id: `${cx},${cz}`, price: 500 + Math.abs(cx + cz) * 75 };
      group.add(lot); lots.push(lot); interactables.push(lot);
    }
    if (vehicles.length < 12 && rand(cx + 9, cz + 2) > 0.83) makeVehicle(ox + 20, oz + 25, [0xff3366, 0x17f3ff, 0xffd166][vehicles.length % 3]);
    if (crates.length < 20 && rand(cx + 22, cz - 9) > 0.72) {
      const crate = makeBox(2, 2, 2, neonMats[crates.length % neonMats.length]); crate.position.set(ox + 45, 1.2, oz + 18); crate.userData = { type: 'crate', collected: false }; group.add(crate); crates.push(crate); interactables.push(crate);
    }
    if (npcs.length < CONFIG.npcLimit && rand(cx - 2, cz + 4) > 0.65) { const npc = makeBlockDude(0xffd166); npc.position.set(ox + 12, 1.5, oz + 45); npc.userData = { home: npc.position.clone(), phase: rand(cx, cz) * 9 }; group.add(npc); npcs.push(npc); }
    scene.add(group); chunks.set(`${cx},${cz}`, group);
  }

  function startMission(id) { state.mission = JSON.parse(JSON.stringify(missions.find(m => m.id === id))); if (!state.mission) return; player.collectedCrates = 0; showReward(`Mission started: ${state.mission.title}`); }
  function completeMission() { if (!state.mission) return; state.cash += state.mission.reward; state.xp += state.mission.xp; state.completed[state.mission.id] = true; showReward(`+ $${state.mission.reward} / +${state.mission.xp} XP`); state.mission = null; levelCheck(); saveGame(); }
  function levelCheck() { state.level = 1 + Math.floor(state.xp / 200); }
  function showReward(text) { ui.reward.textContent = text; ui.reward.classList.remove('hidden'); clearTimeout(showReward.timer); showReward.timer = setTimeout(() => ui.reward.classList.add('hidden'), 1700); }

  function inputVector() {
    let x = 0, z = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (joystick.active) { x += joystick.x; z += joystick.y; }
    const v = new THREE.Vector3(x, 0, z); if (v.lengthSq() > 1) v.normalize(); return v;
  }
  function updatePlayer(dt) {
    const move = inputVector(); const speed = (keys.has('ShiftLeft') || player.sprint) ? 18 : 10;
    if (player.inVehicle) {
      const car = player.inVehicle; car.userData.speed = THREE.MathUtils.clamp(car.userData.speed + (-move.z * 24 - car.userData.speed * 2) * dt, -14, 32);
      car.rotation.y += -move.x * dt * 2.2 * Math.max(0.25, Math.abs(car.userData.speed) / 10);
      car.position.x -= Math.sin(car.rotation.y) * car.userData.speed * dt; car.position.z -= Math.cos(car.rotation.y) * car.userData.speed * dt;
      car.userData.gas = Math.max(0, car.userData.gas - Math.abs(car.userData.speed) * dt * 0.04);
      player.pos.copy(car.position).add(new THREE.Vector3(0, 2, 0)); player.mesh.visible = false;
    } else {
      player.mesh.visible = true; player.vel.x = move.x * speed; player.vel.z = move.z * speed; player.vel.y -= 34 * dt;
      if ((keys.has('Space') || jumpTap) && player.onGround) { player.vel.y = 13; player.onGround = false; } jumpTap = false;
      player.pos.addScaledVector(player.vel, dt); if (player.pos.y < 1.3) { player.pos.y = 1.3; player.vel.y = 0; player.onGround = true; }
      if (move.lengthSq() > 0.01) player.yaw = Math.atan2(move.x, move.z);
    }
    player.mesh.position.copy(player.pos); player.mesh.rotation.y = player.yaw;
    camera.position.lerp(player.pos.clone().add(new THREE.Vector3(0, player.inVehicle ? 12 : 8, player.inVehicle ? 20 : 14)), 0.08);
    camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  }
  function interact() {
    let best = null, dist = 7;
    for (const obj of interactables) { if (obj.userData.collected) continue; const d = obj.position.distanceTo(player.pos); if (d < dist) { dist = d; best = obj; } }
    if (!best) { openMissionBoard(); return; }
    if (best.userData.type === 'vehicle') { player.inVehicle = player.inVehicle ? null : best; showReward(player.inVehicle ? 'Entered vehicle' : 'Exited vehicle'); }
    if (best.userData.type === 'crate') { best.userData.collected = true; best.visible = false; state.cash += 25; state.xp += 10; player.collectedCrates++; showReward('Crate collected +$25'); if (state.mission?.id === 'cratehunt' && player.collectedCrates >= state.mission.crates) completeMission(); }
    if (best.userData.type === 'lot') { const id = best.userData.id; if (state.ownedLots[id]) return showReward('You already own this lot'); if (state.cash >= best.userData.price) { state.cash -= best.userData.price; state.ownedLots[id] = true; best.material.color.set(0x5ef38c); showReward(`Lot bought: $${best.userData.price}`); saveGame(); } else showReward(`Need $${best.userData.price}`); }
  }
  function unstuck() { player.inVehicle = null; player.pos.set(0, 3, 0); player.vel.set(0, 0, 0); showReward('Unstuck to spawn'); }
  function updateMission() {
    const m = state.mission; missionBeam.visible = false;
    if (!m) return;
    if (m.target) { missionBeam.visible = true; missionBeam.position.set(m.target.x, 25, m.target.z); if (player.pos.distanceTo(new THREE.Vector3(m.target.x, player.pos.y, m.target.z)) < 8 && (!m.needsVehicle || player.inVehicle)) completeMission(); }
  }
  function updateNpcs(dt) { for (const npc of npcs) { const p = npc.userData.phase + state.t * 0.7; npc.position.x += Math.sin(p) * dt * 1.2; npc.position.z += Math.cos(p * 0.7) * dt * 1.2; npc.rotation.y = p; } }
  function updateHud(dt) {
    ui.cash.textContent = `$${Math.floor(state.cash)}`; ui.xp.textContent = Math.floor(state.xp); ui.level.textContent = state.level; ui.wanted.textContent = state.wanted;
    ui.online.textContent = state.online ? 'cloud ready' : 'offline'; ui.debugOnline.textContent = ui.online.textContent; ui.vehicle.textContent = player.inVehicle ? player.inVehicle.userData.name : 'On foot';
    ui.hp.textContent = player.inVehicle ? Math.floor(player.inVehicle.userData.hp) : 100; ui.gas.textContent = player.inVehicle ? Math.floor(player.inVehicle.userData.gas) : 100;
    ui.mission.textContent = state.mission ? state.mission.title : 'Press E for board'; ui.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`;
    ui.chunks.textContent = chunks.size; ui.npcs.textContent = npcs.length; ui.activeVehicle.textContent = player.inVehicle ? 'Driving' : 'None'; ui.saveSlot.textContent = state.activeSlot; ui.lastError.textContent = state.lastError;
    drawMinimap();
  }
  function drawMinimap() { const c = ui.minimap, ctx = c.getContext('2d'); ctx.clearRect(0,0,160,160); ctx.fillStyle = '#070b18'; ctx.fillRect(0,0,160,160); ctx.strokeStyle = '#17f3ff55'; ctx.beginPath(); ctx.moveTo(80,0); ctx.lineTo(80,160); ctx.moveTo(0,80); ctx.lineTo(160,80); ctx.stroke(); ctx.fillStyle = '#ff3bd4'; for (const v of vehicles) { const x=80+(v.position.x-player.pos.x)*0.25,y=80+(v.position.z-player.pos.z)*0.25; if(x>0&&x<160&&y>0&&y<160)ctx.fillRect(x-2,y-2,4,4); } ctx.fillStyle = '#5ef38c'; ctx.beginPath(); ctx.arc(80,80,5,0,Math.PI*2); ctx.fill(); }

  function savePayload() { return { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, ownedLots: state.ownedLots, completed: state.completed, pos: player.pos.toArray(), activeSlot: state.activeSlot }; }
  async function saveGame(slot = state.activeSlot) { state.activeSlot = slot; const payload = savePayload(); localStorage.setItem(CONFIG.saveKey + slot, JSON.stringify(payload)); try { if (window.NeonBlockCloud?.save) { await window.NeonBlockCloud.save(slot, payload); state.online = true; } } catch(e) { state.lastError = e.message; } showReward('Game saved'); }
  async function loadGame(slot = state.activeSlot) { state.activeSlot = slot; let raw = localStorage.getItem(CONFIG.saveKey + slot); try { if (window.NeonBlockCloud?.load) { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); state.online = true; } } catch(e) { state.lastError = e.message; } if (!raw) return showReward('No save found'); const data = JSON.parse(raw); Object.assign(state, { cash:data.cash??125, xp:data.xp??0, level:data.level??1, wanted:data.wanted??0, ownedLots:data.ownedLots??{}, completed:data.completed??{} }); if (data.pos) player.pos.fromArray(data.pos); showReward('Game loaded'); }

  function openMissionBoard() { ui.pause.classList.remove('hidden'); ui.missions.classList.remove('hidden'); ui.settings.classList.add('hidden'); ui.savePanel.classList.add('hidden'); ui.missionList.innerHTML = ''; for (const m of missions) { const li = document.createElement('li'); li.innerHTML = `<strong>${m.title}</strong><br><small>${m.goal}</small><button data-mission="${m.id}">Start</button>`; ui.missionList.appendChild(li); } ui.missionList.querySelectorAll('button').forEach(b => b.onclick = () => { startMission(b.dataset.mission); ui.pause.classList.add('hidden'); ui.missions.classList.add('hidden'); }); }
  function togglePause() { ui.pause.classList.toggle('hidden'); ui.missions.classList.add('hidden'); ui.settings.classList.add('hidden'); ui.savePanel.classList.add('hidden'); }

  let jumpTap = false;
  addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyR') unstuck(); if (e.code === 'Space') jumpTap = true; });
  addEventListener('keyup', e => keys.delete(e.code));
  $('btn-resume').onclick = togglePause; $('btn-settings').onclick = () => ui.settings.classList.toggle('hidden'); $('btn-close-settings').onclick = () => ui.settings.classList.add('hidden');
  $('btn-save').onclick = () => { ui.savePanel.classList.toggle('hidden'); }; $('btn-load').onclick = () => loadGame(); $('btn-close-save').onclick = () => ui.savePanel.classList.add('hidden');
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => saveGame(b.dataset.slot)); document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => loadGame(b.dataset.slot));
  $('btn-export').onclick = () => { ui.exportJson.value = JSON.stringify(savePayload(), null, 2); }; $('btn-import').onclick = () => { try { const d = JSON.parse(ui.exportJson.value); localStorage.setItem(CONFIG.saveKey + state.activeSlot, JSON.stringify(d)); loadGame(); } catch(e) { state.lastError = e.message; showReward('Bad JSON'); } };
  $('btn-mobile-jump').onclick = () => jumpTap = true; $('btn-mobile-sprint').onpointerdown = () => player.sprint = true; $('btn-mobile-sprint').onpointerup = () => player.sprint = false; $('btn-mobile-interact').onclick = interact; $('btn-mobile-unstuck').onclick = unstuck; $('btn-mobile-pause').onclick = togglePause;

  const joystick = { active:false, x:0, y:0, id:null };
  ui.joy.addEventListener('pointerdown', e => { joystick.active = true; joystick.id = e.pointerId; ui.joy.setPointerCapture(e.pointerId); moveJoy(e); });
  ui.joy.addEventListener('pointermove', e => { if (joystick.active && e.pointerId === joystick.id) moveJoy(e); });
  ui.joy.addEventListener('pointerup', resetJoy); ui.joy.addEventListener('pointercancel', resetJoy);
  function moveJoy(e) { const r = ui.joy.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2; const dx = THREE.MathUtils.clamp(e.clientX - cx, -42, 42), dy = THREE.MathUtils.clamp(e.clientY - cy, -42, 42); joystick.x = dx/42; joystick.y = dy/42; ui.stick.style.transform = `translate(${dx}px,${dy}px)`; }
  function resetJoy() { joystick.active = false; joystick.x = joystick.y = 0; ui.stick.style.transform = 'translate(0,0)'; }

  addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  let last = performance.now(), frames = 0, fpsTime = 0;
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; state.t += dt; frames++; fpsTime += dt; if (fpsTime > 0.5) { ui.fps.textContent = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
    streamWorld(); updatePlayer(dt); updateNpcs(dt); updateMission(); updateHud(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }
  streamWorld(); makeVehicle(8, 8, 0x17f3ff); loadGame('slot1').catch(()=>{}); setInterval(() => saveGame(state.activeSlot), 30000); if (ui.loading) setTimeout(() => ui.loading.classList.add('hidden'), 500); requestAnimationFrame(loop);
})();
