'use strict';

(function () {
  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  if (!THREE || !canvas) {
    document.body.innerHTML = '<main class="fatal-error"><h1>NeonBlock City</h1><p>Three.js failed to load. Reload after checking your connection.</p></main>';
    return;
  }

  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), error: $('debug-last-error')
  };
  const loading = $('loading-screen'), pauseOverlay = $('pause-overlay'), settingsPanel = $('settings-panel'), savePanel = $('save-panel');
  const exportBox = $('export-json'), popup = $('reward-popup'), missionList = $('mission-list'), minimap = $('minimap-canvas').getContext('2d');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x061026);
  scene.fog = new THREE.Fog(0x061026, 80, 300);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 700);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  scene.add(new THREE.HemisphereLight(0x9bd4ff, 0x0b0820, 1.6));
  const sun = new THREE.DirectionalLight(0xb8e3ff, 1.1); sun.position.set(55, 90, 35); scene.add(sun);

  const makeMat = (color, emissive = 0) => {
    const mat = new THREE.MeshStandardMaterial({ color });
    if (emissive) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = emissive; }
    return mat;
  };
  const mat = {
    road: makeMat(0x11182f), grass: makeMat(0x08251e), sidewalk: makeMat(0x1b2243), buildA: makeMat(0x18236a), buildB: makeMat(0x38166a),
    cyan: makeMat(0x00f5ff, 1.05), pink: makeMat(0xff2bd6, 1), cash: makeMat(0x59ff97, 0.7), player: makeMat(0xffe66d), npc: makeMat(0xff59a8), owned: makeMat(0xffd166)
  };
  const box = (w, h, d, m, x, y, z, parent = scene) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

  const state = {
    cash: 180, xp: 0, level: 1, wanted: 0, saveSlot: 'slot1', paused: false, activeVehicle: null,
    player: { x: 0, y: 1.05, z: 0, vx: 0, vz: 0, heading: 0, onGround: true },
    chunks: new Map(), pickups: [], vehicles: [], lots: [], npcs: [], ownedLots: {}, completed: {}, missionIndex: 0, lastError: 'none'
  };
  const missions = [
    { id: 'rookie-run', name: 'Rookie Run', text: 'Collect 5 neon credits', type: 'collect', need: 5, reward: 175, xp: 70, progress: 0 },
    { id: 'first-ride', name: 'First Ride', text: 'Enter any hover car', type: 'vehicle', need: 1, reward: 220, xp: 90, progress: 0 },
    { id: 'landlord', name: 'Block Owner', text: 'Buy one city lot', type: 'own', need: 1, reward: 350, xp: 140, progress: 0 }
  ];
  const keys = new Set();
  const mobile = { x: 0, z: 0, active: false, sprint: false, jump: false };
  const input = { x: 0, z: 0, sprint: false, jump: false };
  const playerMesh = box(1.2, 2.1, 1.2, mat.player, 0, 1.05, 0);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  const seeded = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const csize = 52, radius = 2, ckey = (x, z) => `${x},${z}`;
  function makeChunk(cx, cz) {
    const g = new THREE.Group(); const ox = cx * csize, oz = cz * csize;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(csize, csize), mat.grass); ground.rotation.x = -Math.PI / 2; ground.position.set(ox, 0, oz); g.add(ground);
    box(csize, .05, 8, mat.road, ox, .03, oz, g); box(8, .05, csize, mat.road, ox, .04, oz, g);
    for (let i = 0; i < 6; i++) {
      const r = seeded(cx + i, cz - i), bx = ox - 20 + (i % 3) * 20 + r * 5, bz = oz - 20 + Math.floor(i / 3) * 40 + seeded(cx - i, cz + i) * 5;
      if (Math.abs(bx - ox) < 7 || Math.abs(bz - oz) < 7) continue;
      const h = 7 + Math.floor(r * 18); box(9, h, 9, r > .5 ? mat.buildA : mat.buildB, bx, h / 2, bz, g);
      box(9.4, .55, .3, r > .5 ? mat.cyan : mat.pink, bx, Math.min(h - 1, 7), bz + 4.7, g);
    }
    scene.add(g); return g;
  }
  function streamWorld() {
    const pcx = Math.round(state.player.x / csize), pcz = Math.round(state.player.z / csize), keep = new Set();
    for (let cx = pcx - radius; cx <= pcx + radius; cx++) for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      const key = ckey(cx, cz); keep.add(key); if (!state.chunks.has(key)) state.chunks.set(key, makeChunk(cx, cz));
    }
    for (const [key, group] of state.chunks) if (!keep.has(key)) { scene.remove(group); group.traverse(o => o.geometry?.dispose?.()); state.chunks.delete(key); }
  }
  function spawnWorld() {
    for (let i = 0; i < 40; i++) { const coin = box(1, .28, 1, mat.cash, (seeded(i, 6) - .5) * 280, .55, (seeded(9, i) - .5) * 280); coin.userData = { value: 25 + Math.floor(seeded(i, i) * 45), taken: false }; state.pickups.push(coin); }
    for (let i = 0; i < 8; i++) { const car = box(2.4, 1, 4, mat.cyan, -45 + i * 13, .55, 16 + (i % 2) * 10); car.userData = { id: `car-${i}`, hp: 100, gas: 100, speed: 16 + i * .8 }; state.vehicles.push(car); }
    for (let i = 0; i < 9; i++) { const lot = box(9, .14, 9, mat.sidewalk, 28 + (i % 3) * 22, .08, -42 + Math.floor(i / 3) * 22); lot.userData = { id: `lot-${i}`, price: 220 + i * 80, owned: false }; state.lots.push(lot); }
    for (let i = 0; i < 16; i++) { const npc = box(1, 1.8, 1, mat.npc, (seeded(i, 2) - .5) * 180, .9, (seeded(2, i) - .5) * 180); npc.userData = { baseX: npc.position.x, baseZ: npc.position.z, phase: i, speed: .5 + seeded(i, i) * .8 }; state.npcs.push(npc); }
  }

  function toast(text) { popup.textContent = text; popup.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => popup.classList.add('hidden'), 1500); }
  function advanceMission(n) {
    const m = missions[state.missionIndex]; if (!m || state.completed[m.id]) return;
    m.progress = Math.min(m.need, m.progress + n);
    if (m.progress >= m.need) { state.completed[m.id] = true; state.cash += m.reward; state.xp += m.xp; state.missionIndex = Math.min(missions.length - 1, state.missionIndex + 1); while (state.xp >= state.level * 120) { state.xp -= state.level * 120; state.level++; } toast(`Mission complete: ${m.name} +$${m.reward}`); saveGame(); }
  }
  function readInput() {
    let x = 0, z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x--; if (keys.has('KeyD') || keys.has('ArrowRight')) x++;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z--; if (keys.has('KeyS') || keys.has('ArrowDown')) z++;
    if (mobile.active) { x += mobile.x; z += mobile.z; }
    const l = Math.hypot(x, z); input.x = l > 1 ? x / l : x; input.z = l > 1 ? z / l : z;
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobile.sprint; input.jump = keys.has('Space') || mobile.jump;
  }
  function interact() {
    const p = playerMesh.position;
    if (state.activeVehicle) { state.activeVehicle = null; toast('Exited vehicle'); return; }
    let nearest = null, dist = 999; for (const v of state.vehicles) { const d = v.position.distanceTo(p); if (d < dist) { dist = d; nearest = v; } }
    if (nearest && dist < 5) { state.activeVehicle = nearest; if (missions[state.missionIndex]?.type === 'vehicle') advanceMission(1); toast('Entered hover car'); return; }
    for (const lot of state.lots) if (lot.position.distanceTo(p) < 6) {
      if (lot.userData.owned) return toast('Already owned'); if (state.cash < lot.userData.price) return toast(`Need $${lot.userData.price}`);
      state.cash -= lot.userData.price; lot.userData.owned = true; lot.material = mat.owned; state.ownedLots[lot.userData.id] = true; if (missions[state.missionIndex]?.type === 'own') advanceMission(1); toast(`Bought ${lot.userData.id}`); saveGame(); return;
    }
    toast('Move near a car or lot');
  }
  function unstuck() { Object.assign(state.player, { x: 0, y: 1.05, z: 0 }); state.activeVehicle = null; toast('Unstuck'); }
  function setPaused(v) { state.paused = v; pauseOverlay.classList.toggle('hidden', !v); }

  function tick(dt) {
    readInput(); const p = state.player; const speed = state.activeVehicle ? state.activeVehicle.userData.speed : input.sprint ? 10 : 6;
    p.x += input.x * speed * dt; p.z += input.z * speed * dt;
    if (input.jump && p.onGround && !state.activeVehicle) { p.y = 2.8; p.onGround = false; }
    if (!p.onGround) { p.y -= 10 * dt; if (p.y <= 1.05) { p.y = 1.05; p.onGround = true; } }
    if (Math.abs(input.x) + Math.abs(input.z) > .01) p.heading = Math.atan2(input.x, input.z);
    playerMesh.position.set(p.x, p.y, p.z); playerMesh.rotation.y = p.heading; shadow.position.set(p.x, .03, p.z);
    if (state.activeVehicle) { const v = state.activeVehicle; v.position.set(p.x, .55, p.z); v.rotation.y = p.heading; v.userData.gas = Math.max(0, v.userData.gas - dt * 1.8); if (v.userData.gas <= 0) { state.activeVehicle = null; toast('Out of gas'); } }
    for (const c of state.pickups) if (!c.userData.taken && c.position.distanceTo(playerMesh.position) < 2.4) { c.userData.taken = true; c.visible = false; state.cash += c.userData.value; if (missions[state.missionIndex]?.type === 'collect') advanceMission(1); else toast(`+$${c.userData.value}`); }
    for (const n of state.npcs) { n.userData.phase += dt * n.userData.speed; n.position.x = n.userData.baseX + Math.sin(n.userData.phase) * 5; n.position.z = n.userData.baseZ + Math.cos(n.userData.phase * .8) * 5; }
    streamWorld(); updateCamera(); updateHud(); drawMap();
  }
  function updateCamera() { const d = state.activeVehicle ? 16 : 11, h = state.activeVehicle ? 9 : 7; camera.position.lerp(new THREE.Vector3(state.player.x - Math.sin(state.player.heading) * d, h, state.player.z - Math.cos(state.player.heading) * d), .12); camera.lookAt(state.player.x, state.player.y + 1.2, state.player.z); }
  function updateHud() {
    const m = missions[state.missionIndex], online = window.NeonCloudSave?.enabled ? 'cloud optional' : 'offline';
    hud.cash.textContent = `$${Math.floor(state.cash)}`; hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted; hud.online.textContent = online; hud.debugOnline.textContent = online;
    hud.vehicle.textContent = state.activeVehicle ? state.activeVehicle.userData.id : 'On foot'; hud.hp.textContent = state.activeVehicle ? Math.ceil(state.activeVehicle.userData.hp) : 100; hud.gas.textContent = state.activeVehicle ? Math.ceil(state.activeVehicle.userData.gas) : 100;
    hud.mission.textContent = m ? `${m.name}: ${m.progress}/${m.need}` : 'All done'; hud.pos.textContent = `${state.player.x.toFixed(1)},${state.player.y.toFixed(1)},${state.player.z.toFixed(1)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = hud.vehicle.textContent; hud.saveSlot.textContent = state.saveSlot; hud.error.textContent = state.lastError;
  }
  function drawMap() {
    minimap.clearRect(0, 0, 160, 160); minimap.fillStyle = '#050814'; minimap.fillRect(0, 0, 160, 160); minimap.strokeStyle = '#17f3ff55'; minimap.strokeRect(1, 1, 158, 158); minimap.fillStyle = '#17f3ff'; minimap.fillRect(78, 78, 4, 4);
    const scale = .55; minimap.fillStyle = '#59ff97'; state.pickups.forEach(c => { if (!c.userData.taken) { const x = 80 + (c.position.x - state.player.x) * scale, y = 80 + (c.position.z - state.player.z) * scale; if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x, y, 2, 2); } });
    minimap.fillStyle = '#2df8ff'; state.vehicles.forEach(v => { const x = 80 + (v.position.x - state.player.x) * scale, y = 80 + (v.position.z - state.player.z) * scale; if (x > 0 && x < 160 && y > 0 && y < 160) minimap.fillRect(x, y, 3, 3); });
  }
  const payload = () => ({ version: 3, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player, ownedLots: state.ownedLots, completed: state.completed, missionIndex: state.missionIndex, missionProgress: missions.map(m => m.progress), pickups: state.pickups.map(c => c.userData.taken), vehicles: state.vehicles.map(v => ({ id: v.userData.id, hp: v.userData.hp, gas: v.userData.gas })) });
  async function saveGame(slot = state.saveSlot) { state.saveSlot = slot; const data = payload(); localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data)); try { await window.NeonCloudSave?.save?.(slot, data); } catch (e) { state.lastError = `cloud save: ${e.message}`; } }
  async function loadGame(slot = state.saveSlot) { state.saveSlot = slot; let data = null; try { data = await window.NeonCloudSave?.load?.(slot); } catch (e) { state.lastError = `cloud load: ${e.message}`; } if (!data) data = JSON.parse(localStorage.getItem(`neonblock:${slot}`) || 'null'); if (!data) return;
    Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? 0, level: data.level ?? 1, wanted: data.wanted ?? 0, ownedLots: data.ownedLots || {}, completed: data.completed || {}, missionIndex: data.missionIndex || 0 }); Object.assign(state.player, data.player || {}); data.missionProgress?.forEach((p, i) => { if (missions[i]) missions[i].progress = p; }); state.pickups.forEach((c, i) => { c.userData.taken = !!data.pickups?.[i]; c.visible = !c.userData.taken; }); state.lots.forEach(l => { l.userData.owned = !!state.ownedLots[l.userData.id]; l.material = l.userData.owned ? mat.owned : mat.sidewalk; }); }

  addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') interact(); if (e.code === 'Escape') setPaused(!state.paused); if (e.code === 'KeyU') unstuck(); });
  addEventListener('keyup', e => keys.delete(e.code)); addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  $('btn-resume').onclick = () => setPaused(false); $('btn-settings').onclick = () => settingsPanel.classList.toggle('hidden'); $('btn-save').onclick = () => savePanel.classList.toggle('hidden'); $('btn-load').onclick = () => loadGame().then(() => toast('Loaded')); $('btn-close-settings').onclick = () => settingsPanel.classList.add('hidden'); $('btn-close-save').onclick = () => savePanel.classList.add('hidden'); $('btn-close-missions').onclick = () => $('mission-board').classList.add('hidden');
  $('graphics-quality').onchange = e => renderer.setPixelRatio(e.target.value === 'high' ? Math.min(devicePixelRatio, 2) : e.target.value === 'low' ? 1 : Math.min(devicePixelRatio, 1.6));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => saveGame(b.dataset.slot).then(() => toast(`Saved ${b.dataset.slot}`))); document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => loadGame(b.dataset.slot).then(() => toast(`Loaded ${b.dataset.slot}`)));
  $('btn-export').onclick = () => { exportBox.value = JSON.stringify(payload(), null, 2); }; $('btn-import').onclick = () => { try { localStorage.setItem(`neonblock:${state.saveSlot}`, exportBox.value); loadGame().then(() => toast('Imported')); } catch (e) { state.lastError = e.message; toast('Bad JSON'); } };
  $('btn-mobile-jump').onpointerdown = () => { mobile.jump = true; }; $('btn-mobile-jump').onpointerup = () => { mobile.jump = false; }; $('btn-mobile-sprint').onpointerdown = () => { mobile.sprint = true; }; $('btn-mobile-sprint').onpointerup = () => { mobile.sprint = false; }; $('btn-mobile-interact').onclick = interact; $('btn-mobile-unstuck').onclick = unstuck; $('btn-mobile-pause').onclick = () => setPaused(!state.paused);
  const joy = $('joystick-container'), stick = $('joystick-stick'); let joyId = null, center = { x: 0, y: 0 };
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; mobile.active = true; joy.setPointerCapture(joyId); const r = joy.getBoundingClientRect(); center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  joy.addEventListener('pointermove', e => { if (e.pointerId !== joyId) return; const dx = e.clientX - center.x, dy = e.clientY - center.y, len = Math.min(44, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); mobile.x = Math.cos(a) * (len / 44); mobile.z = Math.sin(a) * (len / 44); stick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`; });
  const endJoy = () => { joyId = null; mobile.active = false; mobile.x = 0; mobile.z = 0; stick.style.transform = 'translate(0,0)'; }; joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  missionList.innerHTML = missions.map(m => `<li><strong>${m.name}</strong><br>${m.text}<br>Reward $${m.reward} / ${m.xp} XP</li>`).join('');

  let last = performance.now(), frames = 0, fpst = 0; function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; if (!state.paused) tick(dt); renderer.render(scene, camera); frames++; fpst += dt; if (fpst > .5) { hud.fps.textContent = Math.round(frames / fpst); frames = 0; fpst = 0; } requestAnimationFrame(loop); }
  spawnWorld(); streamWorld(); loadGame('slot1').catch(() => {}); setTimeout(() => loading?.classList.add('hidden'), 350); requestAnimationFrame(loop); setInterval(() => saveGame(state.saveSlot), 30000);
})();
