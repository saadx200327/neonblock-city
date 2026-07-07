(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const debug = {
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), vehicle: $('debug-active-vehicle'), slot: $('debug-save-slot'), online: $('debug-online'), error: $('debug-last-error')
  };
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'), vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission')
  };
  const popup = $('reward-popup');
  const minimapCanvas = $('minimap-canvas');
  const minimap = minimapCanvas?.getContext('2d');

  if (!window.THREE || !canvas) {
    document.body.innerHTML = '<div class="fatal">NeonBlock City needs Three.js and a canvas to start.</div>';
    return;
  }

  const THREE = window.THREE;
  const SAVE_KEY = 'neonblock-city-save-v2';
  const SLOT_PREFIX = 'neonblock-city-';
  const CHUNK = 90;
  const STREAM_RADIUS = 2;
  const keys = new Set();
  const state = {
    cash: 150, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false, online: false,
    ownedLots: [], completed: [], missionId: 'welcome', activeVehicle: null, lastSave: 0, quality: localStorage.getItem('nbc-quality') || 'auto'
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060916);
  scene.fog = new THREE.Fog(0x060916, 90, 420);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.4));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = state.quality !== 'low';

  const hemi = new THREE.HemisphereLight(0x7df9ff, 0x111122, 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(80, 130, 50);
  sun.castShadow = true;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 320; sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x101522, roughness: 0.8 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x123021, roughness: 0.9 }),
    player: new THREE.MeshStandardMaterial({ color: 0x19f7ff, emissive: 0x063b42 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xff3cff, emissive: 0x370038 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0x332000 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x1aff8c, emissive: 0x06351d, transparent: true, opacity: 0.58 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xfff6a5, emissive: 0x272100 }),
    car: new THREE.MeshStandardMaterial({ color: 0x334dff, emissive: 0x050a35 }),
    taxi: new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0x332900 })
  };

  const world = new THREE.Group();
  scene.add(world);
  const chunks = new Map();
  const interactables = [];
  const vehicles = [];
  const npcs = [];

  const player = {
    pos: new THREE.Vector3(0, 1.2, 0), vel: new THREE.Vector3(), yaw: 0, grounded: false,
    mesh: new THREE.Group(), speed: 20, sprint: false, joystick: { x: 0, y: 0 }
  };
  player.mesh.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 1.0), mats.player));
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mats.accent); head.position.y = 1.65; player.mesh.add(head);
  scene.add(player.mesh);

  const missions = [
    { id: 'welcome', title: 'Welcome Run', detail: 'Collect 3 neon crates.', target: 3, type: 'crate', reward: 250, xp: 90 },
    { id: 'driver', title: 'First Drive', detail: 'Enter a vehicle and drive 250m.', target: 250, type: 'drive', reward: 450, xp: 140 },
    { id: 'owner', title: 'Block Owner', detail: 'Buy your first green lot.', target: 1, type: 'buy', reward: 600, xp: 210 }
  ];
  let progress = { crate: 0, drive: 0, buy: 0 };

  function safe(fn, label) { try { return fn(); } catch (e) { console.error(label, e); if (debug.error) debug.error.textContent = label + ': ' + e.message; } }
  function rand(seed) { const x = Math.sin(seed * 999.13) * 43758.5453; return x - Math.floor(x); }
  function chunkKey(cx, cz) { return cx + ',' + cz; }
  function showPopup(text) { if (!popup) return; popup.textContent = text; popup.classList.remove('hidden'); clearTimeout(showPopup.t); showPopup.t = setTimeout(() => popup.classList.add('hidden'), 1800); }

  function makeBuilding(x, z, w, h, d, colorSeed) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + rand(colorSeed) * 0.2, 0.75, 0.25), roughness: 0.55, metalness: 0.08, emissive: 0x050818 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.35, 0.08), mats.accent);
    sign.position.set(0, h * 0.42, d / 2 + 0.05); mesh.add(sign);
    return mesh;
  }

  function makeVehicle(x, z, taxi = false) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.2, 2.6), taxi ? mats.taxi : mats.car);
    body.position.y = 0.85; body.castShadow = true; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.0), mats.player);
    cab.position.set(-0.4, 1.65, 0); g.add(cab);
    [[-1.6, -1.15], [1.6, -1.15], [-1.6, 1.15], [1.6, 1.15]].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.35), mats.road); wheel.position.set(wx, 0.35, wz); g.add(wheel);
    });
    g.position.set(x, 0, z); g.userData = { kind: 'vehicle', hp: 100, gas: 100, speed: 0, taxi };
    world.add(g); vehicles.push(g); interactables.push(g); return g;
  }

  function makeCrate(x, z) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats.crate);
    c.position.set(x, 0.85, z); c.castShadow = true; c.userData = { kind: 'crate', collected: false };
    world.add(c); interactables.push(c); return c;
  }

  function makeLot(x, z, price) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(12, 0.18, 12), mats.lot);
    l.position.set(x, 0.12, z); l.userData = { kind: 'lot', price, id: 'lot-' + Math.round(x) + '-' + Math.round(z) };
    world.add(l); interactables.push(l); return l;
  }

  function makeNpc(x, z, tip) {
    const n = new THREE.Group();
    n.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.0), mats.npc));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 24), mats.accent); halo.position.y = 1.35; n.add(halo);
    n.position.set(x, 1, z); n.userData = { kind: 'npc', tip }; world.add(n); npcs.push(n); interactables.push(n); return n;
  }

  function generateChunk(cx, cz) {
    const key = chunkKey(cx, cz); if (chunks.has(key)) return;
    const group = new THREE.Group(); group.userData.key = key;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), mats.grass);
    ground.rotation.x = -Math.PI / 2; ground.position.set(baseX, 0, baseZ); ground.receiveShadow = true; group.add(ground);
    for (let i = -1; i <= 1; i++) {
      const roadA = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.04, 7), mats.road); roadA.position.set(baseX, 0.03, baseZ + i * 30); group.add(roadA);
      const roadB = new THREE.Mesh(new THREE.BoxGeometry(7, 0.04, CHUNK), mats.road); roadB.position.set(baseX + i * 30, 0.04, baseZ); group.add(roadB);
    }
    for (let i = 0; i < 5; i++) {
      const sx = baseX - 32 + rand(cx * 21 + cz * 7 + i) * 64;
      const sz = baseZ - 32 + rand(cx * 12 - cz * 19 + i) * 64;
      if (Math.abs((sx % 30)) < 6 || Math.abs((sz % 30)) < 6) continue;
      group.add(makeBuilding(sx, sz, 7 + rand(i + cx) * 10, 8 + rand(i + cz) * 34, 7 + rand(i - cz) * 10, i + cx * 17 + cz * 9));
    }
    world.add(group); chunks.set(key, group);
    if (rand(cx * 3.17 + cz * 5.31) > 0.65) makeCrate(baseX + rand(cx + 1) * 50 - 25, baseZ + rand(cz + 2) * 50 - 25);
    if (rand(cx * 8.17 - cz * 2.5) > 0.75) makeVehicle(baseX + rand(cx + 4) * 44 - 22, baseZ + rand(cz + 9) * 44 - 22, rand(cx - cz) > 0.5);
    if (rand(cx * 1.93 + cz * 4.01) > 0.82) makeLot(baseX + 26, baseZ - 24, 500 + Math.abs(cx + cz) * 120);
    if (rand(cx * 11.7 + cz * 6.5) > 0.88) makeNpc(baseX - 18, baseZ + 19, 'Tip: collect crates, buy lots, and use E or Interact near vehicles.');
  }

  function streamWorld() {
    const cx = Math.round(player.pos.x / CHUNK), cz = Math.round(player.pos.z / CHUNK);
    for (let x = cx - STREAM_RADIUS; x <= cx + STREAM_RADIUS; x++) for (let z = cz - STREAM_RADIUS; z <= cz + STREAM_RADIUS; z++) generateChunk(x, z);
    for (const [key, group] of chunks) {
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > STREAM_RADIUS + 1 || Math.abs(gz - cz) > STREAM_RADIUS + 1) { world.remove(group); chunks.delete(key); }
    }
  }

  function currentMission() { return missions.find(m => m.id === state.missionId) || missions.find(m => !state.completed.includes(m.id)) || null; }
  function setNextMission() { state.missionId = (missions.find(m => !state.completed.includes(m.id)) || {}).id || null; }
  function addProgress(type, amount) {
    progress[type] = (progress[type] || 0) + amount;
    const m = currentMission();
    if (m && m.type === type && progress[type] >= m.target && !state.completed.includes(m.id)) {
      state.completed.push(m.id); state.cash += m.reward; state.xp += m.xp; showPopup('Mission complete: +' + m.reward + ' cash'); setNextMission(); saveGame();
    }
  }

  function enterNearestVehicle() {
    if (state.activeVehicle) { state.activeVehicle = null; showPopup('Exited vehicle'); return; }
    let best = null, dist = 7;
    vehicles.forEach(v => { const d = v.position.distanceTo(player.pos); if (d < dist) { dist = d; best = v; } });
    if (best) { state.activeVehicle = best; showPopup('Entered vehicle'); } else showPopup('No vehicle nearby');
  }

  function interact() {
    let best = null, dist = 8;
    interactables.forEach(o => { if (!o.parent && o.type !== 'Group') return; const d = (o.position || new THREE.Vector3()).distanceTo(player.pos); if (d < dist) { dist = d; best = o; } });
    if (!best) { showPopup('Nothing nearby'); return; }
    const kind = best.userData.kind;
    if (kind === 'vehicle') return enterNearestVehicle();
    if (kind === 'crate' && !best.userData.collected) { best.userData.collected = true; best.visible = false; state.cash += 75; state.xp += 20; addProgress('crate', 1); showPopup('+75 cash crate'); }
    if (kind === 'lot') {
      const id = best.userData.id;
      if (state.ownedLots.includes(id)) return showPopup('Already owned');
      if (state.cash < best.userData.price) return showPopup('Need $' + best.userData.price);
      state.cash -= best.userData.price; state.ownedLots.push(id); best.material.opacity = 0.9; addProgress('buy', 1); showPopup('Lot purchased');
    }
    if (kind === 'npc') showPopup(best.userData.tip || 'Welcome to NeonBlock City');
  }

  function updatePlayer(dt) {
    const input = new THREE.Vector2((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0));
    input.x += player.joystick.x; input.y += -player.joystick.y;
    if (input.lengthSq() > 1) input.normalize();
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || player.sprint;
    if (state.activeVehicle) {
      const v = state.activeVehicle; const ud = v.userData;
      ud.speed += input.y * 30 * dt; ud.speed *= 0.985; ud.speed = THREE.MathUtils.clamp(ud.speed, -16, sprint ? 42 : 28);
      v.rotation.y -= input.x * dt * (Math.abs(ud.speed) * 0.045 + 1.3);
      v.position.x -= Math.sin(v.rotation.y) * ud.speed * dt;
      v.position.z -= Math.cos(v.rotation.y) * ud.speed * dt;
      ud.gas = Math.max(0, ud.gas - Math.abs(ud.speed) * dt * 0.015);
      player.pos.copy(v.position).add(new THREE.Vector3(0, 1.2, 0));
      player.mesh.visible = false; addProgress('drive', Math.abs(ud.speed) * dt);
    } else {
      player.mesh.visible = true; const speed = sprint ? 34 : 20;
      const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      player.vel.x = (right.x * input.x + forward.x * input.y) * speed;
      player.vel.z = (right.z * input.x + forward.z * input.y) * speed;
      player.vel.y -= 36 * dt;
      if ((keys.has('Space') || keys.has('KeyJ')) && player.grounded) { player.vel.y = 15; player.grounded = false; }
      player.pos.addScaledVector(player.vel, dt);
      if (player.pos.y < 1.2) { player.pos.y = 1.2; player.vel.y = 0; player.grounded = true; }
      if (input.lengthSq() > 0.02) player.mesh.rotation.y = Math.atan2(player.vel.x, player.vel.z);
    }
    player.mesh.position.copy(player.pos);
    camera.position.lerp(new THREE.Vector3(player.pos.x - Math.sin(player.yaw) * 16, player.pos.y + 12, player.pos.z - Math.cos(player.yaw) * 16), 0.12);
    camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
  }

  function updateHud() {
    state.level = 1 + Math.floor(state.xp / 250);
    if (hud.cash) hud.cash.textContent = '$' + Math.floor(state.cash);
    if (hud.xp) hud.xp.textContent = Math.floor(state.xp);
    if (hud.level) hud.level.textContent = state.level;
    if (hud.wanted) hud.wanted.textContent = state.wanted;
    if (hud.online) hud.online.textContent = state.online ? 'cloud-ready' : 'offline';
    const v = state.activeVehicle?.userData;
    if (hud.vehicle) hud.vehicle.textContent = state.activeVehicle ? (v.taxi ? 'Taxi' : 'Neon car') : 'On foot';
    if (hud.hp) hud.hp.textContent = v ? Math.floor(v.hp) : 100;
    if (hud.gas) hud.gas.textContent = v ? Math.floor(v.gas) : 100;
    const m = currentMission(); if (hud.mission) hud.mission.textContent = m ? `${m.title} ${Math.floor(progress[m.type] || 0)}/${m.target}` : 'Free roam';
    if (debug.fps) debug.fps.textContent = fps.toFixed(0);
    if (debug.pos) debug.pos.textContent = player.pos.x.toFixed(0) + ',' + player.pos.y.toFixed(0) + ',' + player.pos.z.toFixed(0);
    if (debug.chunks) debug.chunks.textContent = chunks.size;
    if (debug.npcs) debug.npcs.textContent = npcs.length;
    if (debug.vehicle) debug.vehicle.textContent = state.activeVehicle ? 'yes' : 'none';
    if (debug.slot) debug.slot.textContent = state.slot;
    if (debug.online) debug.online.textContent = state.online ? 'cloud-ready' : 'offline';
  }

  function drawMinimap() {
    if (!minimap) return; minimap.clearRect(0,0,160,160); minimap.fillStyle = '#06101f'; minimap.fillRect(0,0,160,160); minimap.strokeStyle = '#17f3ff55';
    for (let i=20;i<160;i+=30){ minimap.beginPath(); minimap.moveTo(i,0); minimap.lineTo(i,160); minimap.stroke(); minimap.beginPath(); minimap.moveTo(0,i); minimap.lineTo(160,i); minimap.stroke(); }
    const plot = (x,z,color,size=3)=>{ minimap.fillStyle=color; minimap.fillRect(80+(x-player.pos.x)*0.45-size/2,80+(z-player.pos.z)*0.45-size/2,size,size); };
    vehicles.forEach(v=>plot(v.position.x,v.position.z,'#ffd43b',4)); interactables.filter(o=>o.userData.kind==='crate'&&!o.userData.collected).forEach(o=>plot(o.position.x,o.position.z,'#ffb000',3)); plot(player.pos.x,player.pos.z,'#19f7ff',6);
  }

  function snapshot() { return { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, ownedLots: state.ownedLots, completed: state.completed, missionId: state.missionId, progress, player: { x: player.pos.x, y: player.pos.y, z: player.pos.z }, savedAt: new Date().toISOString(), version: 2 }; }
  function applySave(data) { if (!data) return; Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? state.xp, wanted: data.wanted ?? 0, ownedLots: data.ownedLots || [], completed: data.completed || [], missionId: data.missionId || 'welcome' }); progress = data.progress || progress; if (data.player) player.pos.set(data.player.x || 0, data.player.y || 1.2, data.player.z || 0); }
  async function saveGame(slot = state.slot) { const data = snapshot(); localStorage.setItem(SLOT_PREFIX + slot, JSON.stringify(data)); localStorage.setItem(SAVE_KEY, JSON.stringify(data)); if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(slot, data); state.online = true; } catch { state.online = false; } } showPopup('Saved ' + slot); }
  async function loadGame(slot = state.slot) { let data = null; if (window.NeonBlockCloud?.load) { try { data = await window.NeonBlockCloud.load(slot); state.online = !!data; } catch { state.online = false; } } data = data || JSON.parse(localStorage.getItem(SLOT_PREFIX + slot) || localStorage.getItem(SAVE_KEY) || 'null'); applySave(data); showPopup(data ? 'Loaded ' + slot : 'No save found'); }

  function bindUi() {
    addEventListener('keydown', e => { keys.add(e.code); if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyF') enterNearestVehicle(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyR') unstuck(); });
    addEventListener('keyup', e => keys.delete(e.code));
    let dragging = false, lastX = 0;
    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (dragging) { player.yaw -= (e.clientX - lastX) * 0.006; lastX = e.clientX; } });
    canvas.addEventListener('pointerup', () => dragging = false);
    $('btn-resume')?.addEventListener('click', togglePause); $('btn-mobile-pause')?.addEventListener('click', togglePause); $('btn-mobile-interact')?.addEventListener('click', interact); $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    $('btn-mobile-jump')?.addEventListener('pointerdown', () => keys.add('Space')); $('btn-mobile-jump')?.addEventListener('pointerup', () => keys.delete('Space'));
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => player.sprint = true); $('btn-mobile-sprint')?.addEventListener('pointerup', () => player.sprint = false);
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden')); $('btn-load')?.addEventListener('click', () => loadGame()); $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; saveGame(state.slot); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; loadGame(state.slot); }));
    $('btn-export')?.addEventListener('click', () => $('export-json').value = JSON.stringify(snapshot(), null, 2));
    $('btn-import')?.addEventListener('click', () => safe(() => { applySave(JSON.parse($('export-json').value)); saveGame(); }, 'import'));
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('graphics-quality')?.addEventListener('change', e => { state.quality = e.target.value; localStorage.setItem('nbc-quality', state.quality); showPopup('Graphics saved'); });
    bindJoystick();
  }
  function togglePause() { state.paused = !state.paused; $('pause-overlay')?.classList.toggle('hidden', !state.paused); }
  function unstuck() { player.pos.y = 5; player.vel.set(0,0,0); if (state.activeVehicle) state.activeVehicle.position.copy(player.pos); showPopup('Unstuck'); }

  function bindJoystick() {
    const box = $('joystick-container'), stick = $('joystick-stick'); if (!box || !stick) return;
    let active = false, rect;
    const move = e => { if (!active) return; const p = e.touches ? e.touches[0] : e; const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2; let dx = p.clientX - cx, dy = p.clientY - cy; const len = Math.hypot(dx,dy), max = 44; if (len > max) { dx *= max/len; dy *= max/len; } player.joystick.x = dx/max; player.joystick.y = dy/max; stick.style.transform = `translate(${dx}px,${dy}px)`; };
    box.addEventListener('pointerdown', e => { active = true; rect = box.getBoundingClientRect(); box.setPointerCapture?.(e.pointerId); move(e); });
    box.addEventListener('pointermove', move); box.addEventListener('pointerup', () => { active=false; player.joystick.x=0; player.joystick.y=0; stick.style.transform='translate(0,0)'; });
  }

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  let last = performance.now(), fps = 60, acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; fps = fps * 0.92 + (1 / Math.max(dt, 0.001)) * 0.08;
    if (!state.paused) { updatePlayer(dt); streamWorld(); acc += dt; if (acc > 0.25) { updateHud(); drawMinimap(); acc = 0; } renderer.render(scene, camera); }
    if (now - state.lastSave > 30000) { state.lastSave = now; localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); }
  }

  safe(() => { bindUi(); applySave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); streamWorld(); updateHud(); if (loading) loading.style.display = 'none'; requestAnimationFrame(loop); showPopup('NeonBlock City ready'); }, 'startup');
})();
