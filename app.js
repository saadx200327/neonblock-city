(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const hud = {
    cash: document.getElementById('hud-cash'), xp: document.getElementById('hud-xp'), level: document.getElementById('hud-level'), wanted: document.getElementById('hud-wanted'),
    online: document.getElementById('hud-online'), vehicle: document.getElementById('hud-vehicle'), hp: document.getElementById('hud-vehicle-hp'), gas: document.getElementById('hud-vehicle-gas'),
    mission: document.getElementById('hud-mission'), fps: document.getElementById('debug-fps'), pos: document.getElementById('debug-pos'), chunks: document.getElementById('debug-chunks'),
    npcs: document.getElementById('debug-npcs'), activeVehicle: document.getElementById('debug-active-vehicle'), saveSlot: document.getElementById('debug-save-slot'),
    onlineDebug: document.getElementById('debug-online'), lastError: document.getElementById('debug-last-error'), loading: document.getElementById('loading-screen'), reward: document.getElementById('reward-popup'),
    minimap: document.getElementById('minimap-canvas'), waypoint: document.getElementById('waypoint-arrow')
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 70, 230);

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 700);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene.add(new THREE.HemisphereLight(0xaadfff, 0x16142a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: 1 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x3f4769, roughness: 0.85 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.45, emissive: 0x063d44 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.5 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x2a0010 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x5ef38c, transparent: true, opacity: 0.32 }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xb967ff, roughness: 0.35, emissive: 0x180033 })
  };

  const state = {
    cash: 125, xp: 0, level: 1, wanted: 0, saveSlot: 'slot1', lastError: 'none', paused: false,
    player: { x: 0, z: 0, y: 1.2, vy: 0, speed: 26, sprint: false, inVehicle: null },
    ownedLots: [], collected: {}, completedMissions: [], activeMission: null,
    vehicles: [], npcs: [], lots: [], crates: [], chunks: new Map(), online: false,
    graphics: localStorage.getItem('nbc_graphics') || 'auto'
  };

  const missions = [
    { id: 'crate-run', title: 'Collect 5 neon crates', type: 'collect', target: 5, rewardCash: 240, rewardXp: 85, progress: 0 },
    { id: 'district-drive', title: 'Drive 350m across Neon Ave', type: 'drive', target: 350, rewardCash: 310, rewardXp: 100, progress: 0 },
    { id: 'first-lot', title: 'Buy your first city lot', type: 'own', target: 1, rewardCash: 180, rewardXp: 120, progress: 0 }
  ];

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.7), mats.player);
  body.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), mats.player);
  head.position.y = 2.55;
  player.add(body, head);
  scene.add(player);

  const keys = new Set();
  const pointer = { active: false, x: 0, y: 0, lookX: 0, yaw: 0, pitch: -0.42 };
  const joystick = { active: false, id: null, dx: 0, dy: 0 };
  let last = performance.now(), fpsTimer = 0, frames = 0, autosaveTimer = 0;

  function randHash(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }
  function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
  function showReward(text) {
    hud.reward.textContent = text;
    hud.reward.classList.remove('hidden');
    clearTimeout(showReward.t);
    showReward.t = setTimeout(() => hud.reward.classList.add('hidden'), 1800);
  }
  function addCashXp(cash, xp) {
    state.cash += cash; state.xp += xp;
    while (state.xp >= state.level * 160) { state.xp -= state.level * 160; state.level++; showReward(`Level ${state.level}!`); }
  }

  function makeBuilding(x, z, h, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(7, h, 7), new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: color & 0x101010 }));
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    return mesh;
  }
  function makeChunk(cx, cz) {
    const key = chunkKey(cx, cz); if (state.chunks.has(key)) return;
    const group = new THREE.Group();
    group.userData.key = key;
    const baseX = cx * 48, baseZ = cz * 48;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(48, 0.3, 48), mats.grass);
    ground.position.set(baseX, -0.16, baseZ); group.add(ground);
    const roadA = new THREE.Mesh(new THREE.BoxGeometry(48, 0.05, 10), mats.road); roadA.position.set(baseX, 0.02, baseZ); group.add(roadA);
    const roadB = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 48), mats.road); roadB.position.set(baseX, 0.04, baseZ); group.add(roadB);
    const walk1 = new THREE.Mesh(new THREE.BoxGeometry(48, 0.08, 2), mats.sidewalk); walk1.position.set(baseX, 0.09, baseZ + 6.2); group.add(walk1);
    const walk2 = walk1.clone(); walk2.position.z = baseZ - 6.2; group.add(walk2);

    for (let i = 0; i < 3; i++) {
      const sx = baseX + (randHash(cx + i, cz) - 0.5) * 34;
      const sz = baseZ + (randHash(cx, cz + i) - 0.5) * 34;
      if (Math.abs(sx - baseX) < 9 || Math.abs(sz - baseZ) < 9) continue;
      group.add(makeBuilding(sx, sz, 8 + randHash(cx + i, cz - i) * 30, [0x1d4ed8, 0x7c3aed, 0x0891b2, 0xbe123c][i % 4]));
    }

    if (randHash(cx, cz) > 0.62) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mats.crate);
      crate.position.set(baseX + 13, 0.8, baseZ - 15); crate.userData.id = `crate-${key}`;
      if (!state.collected[crate.userData.id]) { group.add(crate); state.crates.push(crate); }
    }
    if (randHash(cx + 5, cz - 3) > 0.7) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 9), mats.lot);
      lot.position.set(baseX - 15, 0.12, baseZ + 15); lot.userData.id = `lot-${key}`; lot.userData.price = 300 + Math.round(randHash(cx, cz) * 500);
      group.add(lot); state.lots.push(lot);
    }
    if (randHash(cx - 2, cz + 8) > 0.72) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 5.2), mats.vehicle);
      car.position.set(baseX + 16, 0.8, baseZ + 2); car.userData = { id: `car-${key}`, hp: 100, gas: 100, angle: 0 };
      group.add(car); state.vehicles.push(car);
    }
    if (randHash(cx + 12, cz + 2) > 0.78) {
      const npc = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), mats.npc);
      npc.position.set(baseX - 7, 1, baseZ - 10); npc.userData.tip = 'Tip: crates pay cash, lots unlock ownership XP, cars are faster on roads.';
      group.add(npc); state.npcs.push(npc);
    }
    scene.add(group); state.chunks.set(key, group);
  }
  function streamWorld() {
    const pcx = Math.round(state.player.x / 48), pcz = Math.round(state.player.z / 48), radius = state.graphics === 'low' ? 2 : 3;
    for (let x = pcx - radius; x <= pcx + radius; x++) for (let z = pcz - radius; z <= pcz + radius; z++) makeChunk(x, z);
    for (const [key, group] of state.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > radius + 1 || Math.abs(cz - pcz) > radius + 1) { scene.remove(group); state.chunks.delete(key); }
    }
    state.crates = state.crates.filter(o => o.parent);
    state.lots = state.lots.filter(o => o.parent);
    state.vehicles = state.vehicles.filter(o => o.parent);
    state.npcs = state.npcs.filter(o => o.parent);
  }

  function startMission(id) {
    const source = missions.find(m => m.id === id) || missions.find(m => !state.completedMissions.includes(m.id));
    if (!source) return showReward('All missions complete');
    state.activeMission = { ...source, progress: 0 };
    showReward(`Mission: ${source.title}`);
  }
  function updateMission(kind, amount = 1) {
    const m = state.activeMission; if (!m || m.type !== kind) return;
    m.progress = Math.min(m.target, m.progress + amount);
    if (m.progress >= m.target) {
      addCashXp(m.rewardCash, m.rewardXp); state.completedMissions.push(m.id); showReward(`Mission complete +$${m.rewardCash}`); state.activeMission = null; startMission();
    }
  }

  function interact() {
    const p = state.player;
    if (p.inVehicle) { p.inVehicle = null; showReward('Exited vehicle'); return; }
    let nearest = null, nd = Infinity;
    [...state.vehicles, ...state.crates, ...state.lots, ...state.npcs].forEach(o => { const d = dist2(p, o.position); if (d < nd) { nd = d; nearest = o; } });
    if (!nearest || nd > 42) return showReward('Move closer to interact');
    if (state.vehicles.includes(nearest)) { p.inVehicle = nearest; showReward('Entered hover car'); return; }
    if (state.crates.includes(nearest)) { state.collected[nearest.userData.id] = true; nearest.parent.remove(nearest); addCashXp(45, 18); updateMission('collect'); showReward('Crate collected +$45'); return; }
    if (state.lots.includes(nearest)) {
      const id = nearest.userData.id, price = nearest.userData.price;
      if (state.ownedLots.includes(id)) return showReward('You already own this lot');
      if (state.cash < price) return showReward(`Need $${price} to buy this lot`);
      state.cash -= price; state.ownedLots.push(id); nearest.material.opacity = 0.65; updateMission('own'); showReward(`Lot bought for $${price}`); return;
    }
    if (state.npcs.includes(nearest)) showReward(nearest.userData.tip);
  }

  function controlsVector() {
    let x = 0, z = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    x += joystick.dx; z += joystick.dy;
    const len = Math.hypot(x, z) || 1; return { x: x / len, z: z / len, active: Math.hypot(x, z) > 0.05 };
  }

  function tick(dt) {
    if (state.paused) return;
    const p = state.player, cv = controlsVector();
    const speed = p.inVehicle ? 54 : (p.sprint || keys.has('ShiftLeft') ? 38 : p.speed);
    const yaw = pointer.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    if (cv.active) {
      const mx = (rx * cv.x - fx * cv.z) * speed * dt;
      const mz = (rz * cv.x - fz * cv.z) * speed * dt;
      p.x += mx; p.z += mz;
      if (p.inVehicle) { p.inVehicle.userData.gas = Math.max(0, p.inVehicle.userData.gas - dt * 3); updateMission('drive', Math.hypot(mx, mz)); }
    }
    p.vy -= 38 * dt; p.y += p.vy * dt; if (p.y < 1.2) { p.y = 1.2; p.vy = 0; }
    if (p.inVehicle) { p.inVehicle.position.set(p.x, 0.8, p.z); p.inVehicle.rotation.y = yaw; }
    player.position.set(p.x, p.y - 1.2, p.z); player.rotation.y = yaw;
    camera.position.set(p.x - Math.sin(yaw) * 12, 8 + Math.sin(pointer.pitch) * 4, p.z - Math.cos(yaw) * 12);
    camera.lookAt(p.x, p.y + 1.4, p.z);
    streamWorld();
  }

  function save(slot = state.saveSlot) {
    state.saveSlot = slot;
    const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: { x: state.player.x, z: state.player.z, y: state.player.y }, ownedLots: state.ownedLots, collected: state.collected, completedMissions: state.completedMissions, activeMission: state.activeMission };
    localStorage.setItem(`neonblock-save-${slot}`, JSON.stringify(data));
    if (window.NeonBlockCloud?.save) window.NeonBlockCloud.save(slot, data).then(() => { state.online = true; }).catch(e => { state.lastError = e.message; });
    return data;
  }
  function load(slot = state.saveSlot, data = null) {
    try {
      const raw = data || JSON.parse(localStorage.getItem(`neonblock-save-${slot}`) || 'null'); if (!raw) return false;
      Object.assign(state, { cash: raw.cash ?? state.cash, xp: raw.xp ?? state.xp, level: raw.level ?? state.level, wanted: raw.wanted ?? 0, ownedLots: raw.ownedLots || [], collected: raw.collected || {}, completedMissions: raw.completedMissions || [], activeMission: raw.activeMission || null });
      state.player.x = raw.player?.x ?? 0; state.player.z = raw.player?.z ?? 0; state.player.y = raw.player?.y ?? 1.2; state.saveSlot = slot; streamWorld(); showReward('Save loaded'); return true;
    } catch (e) { state.lastError = e.message; showReward('Load failed'); return false; }
  }

  function updateHud(dt) {
    hud.cash.textContent = `$${state.cash}`; hud.xp.textContent = Math.round(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.online.textContent = state.online ? 'cloud ready' : 'offline'; hud.onlineDebug.textContent = hud.online.textContent;
    hud.vehicle.textContent = state.player.inVehicle ? 'Hover car' : 'On foot'; hud.hp.textContent = state.player.inVehicle?.userData.hp ?? 100; hud.gas.textContent = Math.round(state.player.inVehicle?.userData.gas ?? 100);
    hud.mission.textContent = state.activeMission ? `${state.activeMission.title} ${Math.floor(state.activeMission.progress)}/${state.activeMission.target}` : 'None';
    hud.pos.textContent = `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length;
    hud.activeVehicle.textContent = state.player.inVehicle ? state.player.inVehicle.userData.id : 'None'; hud.saveSlot.textContent = state.saveSlot; hud.lastError.textContent = state.lastError;
    frames++; fpsTimer += dt; if (fpsTimer > 0.5) { hud.fps.textContent = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0; }
    drawMinimap();
  }
  function drawMinimap() {
    const ctx = hud.minimap.getContext('2d'), s = hud.minimap.width, p = state.player; ctx.clearRect(0, 0, s, s); ctx.fillStyle = '#050814cc'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#17f3ff55'; for (let i = 0; i < s; i += 24) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke(); }
    ctx.fillStyle = '#ff3366'; state.crates.slice(0, 30).forEach(c => { ctx.fillRect(s/2 + (c.position.x-p.x)*0.5, s/2 + (c.position.z-p.z)*0.5, 3, 3); });
    ctx.fillStyle = '#5ef38c'; state.lots.slice(0, 30).forEach(l => { ctx.fillRect(s/2 + (l.position.x-p.x)*0.5, s/2 + (l.position.z-p.z)*0.5, 4, 4); });
    ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(s/2, s/2, 5, 0, Math.PI*2); ctx.fill();
  }

  function loop(now) {
    const dt = Math.min(0.04, (now - last) / 1000); last = now; tick(dt); updateHud(dt); renderer.render(scene, camera); autosaveTimer += dt; if (autosaveTimer > 18) { autosaveTimer = 0; save(); } requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
  window.addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'Space' && state.player.y <= 1.21) state.player.vy = 13; if (e.code === 'KeyE') interact(); if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); if (e.code === 'KeyM') openMissions(); });
  window.addEventListener('keyup', e => keys.delete(e.code));
  canvas.addEventListener('pointerdown', e => { pointer.active = true; pointer.x = e.clientX; pointer.y = e.clientY; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!pointer.active) return; pointer.yaw -= (e.clientX - pointer.x) * 0.004; pointer.pitch = Math.max(-0.9, Math.min(-0.15, pointer.pitch - (e.clientY - pointer.y) * 0.002)); pointer.x = e.clientX; pointer.y = e.clientY; });
  canvas.addEventListener('pointerup', () => { pointer.active = false; });

  const pauseOverlay = document.getElementById('pause-overlay');
  const settings = document.getElementById('settings-panel');
  const savePanel = document.getElementById('save-panel');
  const missionBoard = document.getElementById('mission-board');
  function togglePause(force) { state.paused = force ?? !state.paused; pauseOverlay.classList.toggle('hidden', !state.paused); }
  function openMissions() { state.paused = true; pauseOverlay.classList.remove('hidden'); missionBoard.classList.remove('hidden'); document.getElementById('mission-list').innerHTML = missions.map(m => `<li><button data-mission="${m.id}">${m.title} - $${m.rewardCash}</button></li>`).join(''); }
  document.getElementById('btn-resume').onclick = () => togglePause(false);
  document.getElementById('btn-settings').onclick = () => settings.classList.toggle('hidden');
  document.getElementById('btn-close-settings').onclick = () => settings.classList.add('hidden');
  document.getElementById('graphics-quality').value = state.graphics;
  document.getElementById('graphics-quality').onchange = e => { state.graphics = e.target.value; localStorage.setItem('nbc_graphics', state.graphics); };
  document.getElementById('btn-save').onclick = () => savePanel.classList.toggle('hidden');
  document.getElementById('btn-load').onclick = () => { load(); };
  document.getElementById('btn-close-save').onclick = () => savePanel.classList.add('hidden');
  document.getElementById('btn-close-missions').onclick = () => missionBoard.classList.add('hidden');
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => { save(b.dataset.slot); showReward(`Saved ${b.dataset.slot}`); });
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => load(b.dataset.slot));
  document.getElementById('btn-export').onclick = () => { document.getElementById('export-json').value = JSON.stringify(save(), null, 2); };
  document.getElementById('btn-import').onclick = () => { try { load(state.saveSlot, JSON.parse(document.getElementById('export-json').value)); } catch (e) { state.lastError = e.message; } };
  document.getElementById('mission-list').addEventListener('click', e => { if (e.target.dataset.mission) { startMission(e.target.dataset.mission); missionBoard.classList.add('hidden'); togglePause(false); } });

  function bindBtn(id, down, up = () => {}) { const el = document.getElementById(id); el.addEventListener('pointerdown', e => { e.preventDefault(); down(); }); el.addEventListener('pointerup', e => { e.preventDefault(); up(); }); el.addEventListener('pointercancel', up); }
  bindBtn('btn-mobile-jump', () => { if (state.player.y <= 1.21) state.player.vy = 13; });
  bindBtn('btn-mobile-sprint', () => { state.player.sprint = true; }, () => { state.player.sprint = false; });
  bindBtn('btn-mobile-interact', interact);
  bindBtn('btn-mobile-unstuck', () => { state.player.x = Math.round(state.player.x / 48) * 48; state.player.z = Math.round(state.player.z / 48) * 48; state.player.y = 1.2; showReward('Unstuck'); });
  bindBtn('btn-mobile-pause', () => togglePause());
  const joy = document.getElementById('joystick-container'), stick = document.getElementById('joystick-stick');
  joy.addEventListener('pointerdown', e => { joystick.active = true; joystick.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
  joy.addEventListener('pointermove', e => { if (joystick.active && e.pointerId === joystick.id) moveJoy(e); });
  ['pointerup','pointercancel'].forEach(ev => joy.addEventListener(ev, () => { joystick.active = false; joystick.dx = joystick.dy = 0; stick.style.transform = 'translate(0,0)'; }));
  function moveJoy(e) { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / 48, dy = (e.clientY - cy) / 48; const l = Math.max(1, Math.hypot(dx, dy)); dx /= l; dy /= l; joystick.dx = dx; joystick.dy = dy; stick.style.transform = `translate(${dx * 32}px,${dy * 32}px)`; }

  if (window.NeonBlockCloud?.init) window.NeonBlockCloud.init().then(v => { state.online = !!v; }).catch(e => { state.lastError = e.message; });
  streamWorld(); load('slot1'); startMission(); hud.loading?.classList.add('hidden'); requestAnimationFrame(loop);
})();
