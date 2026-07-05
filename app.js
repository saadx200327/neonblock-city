/* NeonBlock City - playable static browser runtime. No external backend required. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), slot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error')
  };

  const WORLD = { chunkSize: 96, renderRadius: 2, roadWidth: 18, seed: 1337 };
  const SAVE_KEY = 'neonblock.city.save.';
  const state = {
    paused: false, currentSlot: 'slot1', quality: 'auto', lastSaveAt: 0, messageUntil: 0,
    player: { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, speed: 23, sprint: false, cash: 80, xp: 0, level: 1, wanted: 0, owned: [], mission: null, inVehicle: null },
    keys: new Set(), chunks: new Map(), vehicles: [], pickups: [], npcs: [], properties: [], missionsDone: {}, joystick: { active: false, x: 0, y: 0 },
    stats: { frames: 0, fps: 0, lastFps: performance.now() }
  };

  let scene, camera, renderer, playerMesh, clock, minimapCtx, arrowEl;
  const tmp = new THREE.Vector3();

  function rand2(a, b) {
    let n = Math.sin(a * 127.1 + b * 311.7 + WORLD.seed) * 43758.5453;
    return n - Math.floor(n);
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }
  function setText(node, text) { if (node) node.textContent = String(text); }

  function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050814);
    scene.fog = new THREE.Fog(0x050814, 90, 360);

    camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = false;

    scene.add(new THREE.HemisphereLight(0x9cf6ff, 0x17101f, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(40, 90, 25); scene.add(sun);

    const body = new THREE.BoxGeometry(3, 5, 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.55 });
    playerMesh = new THREE.Mesh(body, mat);
    playerMesh.position.set(0, 3.2, 0);
    scene.add(playerMesh);

    minimapCtx = $('minimap-canvas')?.getContext('2d');
    arrowEl = $('waypoint-arrow');
    wireControls();
    safeLoad(state.currentSlot, true);
    updateWorld(true);
    $('loading-screen')?.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  function wireControls() {
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    addEventListener('keydown', (e) => {
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyE','KeyF','KeyM','Escape','KeyR'].includes(e.code)) e.preventDefault();
      state.keys.add(e.code);
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyF') enterExitVehicle();
      if (e.code === 'KeyM') openMissionBoard();
      if (e.code === 'KeyR') unstuck();
    });
    addEventListener('keyup', (e) => state.keys.delete(e.code));

    $('btn-resume')?.addEventListener('click', () => setPause(false));
    $('btn-mobile-pause')?.addEventListener('click', () => togglePause());
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', () => $('mission-board')?.classList.add('hidden'));
    $('graphics-quality')?.addEventListener('change', (e) => applyQuality(e.target.value));
    $('btn-mobile-interact')?.addEventListener('click', () => interact());
    $('btn-mobile-unstuck')?.addEventListener('click', () => unstuck());
    $('btn-mobile-jump')?.addEventListener('click', () => jump());
    $('btn-mobile-sprint')?.addEventListener('pointerdown', () => state.player.sprint = true);
    $('btn-mobile-sprint')?.addEventListener('pointerup', () => state.player.sprint = false);
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => save(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => safeLoad(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { $('export-json').value = JSON.stringify(getSaveData(), null, 2); flash('Save exported'); });
    $('btn-import')?.addEventListener('click', () => importSave());

    const joy = $('joystick-container'), stick = $('joystick-stick');
    if (joy && stick) {
      const reset = () => { state.joystick.active = false; state.joystick.x = 0; state.joystick.y = 0; stick.style.transform = 'translate(0,0)'; };
      joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); state.joystick.active = true; moveJoy(e); });
      joy.addEventListener('pointermove', moveJoy); joy.addEventListener('pointerup', reset); joy.addEventListener('pointercancel', reset);
      function moveJoy(e) {
        if (!state.joystick.active) return;
        const r = joy.getBoundingClientRect(); const cx = r.left + r.width/2, cy = r.top + r.height/2;
        const dx = clamp(e.clientX - cx, -44, 44), dy = clamp(e.clientY - cy, -44, 44);
        state.joystick.x = dx / 44; state.joystick.y = dy / 44; stick.style.transform = `translate(${dx}px,${dy}px)`;
      }
    }
  }

  function applyQuality(value) {
    state.quality = value;
    const px = value === 'low' ? 1 : value === 'high' ? Math.min(devicePixelRatio || 1, 2) : Math.min(devicePixelRatio || 1, 1.65);
    renderer.setPixelRatio(px); flash(`Graphics: ${value}`);
  }

  function setPause(v) { state.paused = v; $('pause-overlay')?.classList.toggle('hidden', !v); }
  function togglePause() { setPause(!state.paused); }
  function flash(msg, good = true) { const p = $('reward-popup'); if (!p) return; p.textContent = msg; p.style.color = good ? 'var(--success)' : 'var(--danger)'; p.classList.remove('hidden'); state.messageUntil = performance.now() + 2300; }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) { update(dt); renderer.render(scene, camera); }
    if (performance.now() > state.messageUntil) $('reward-popup')?.classList.add('hidden');
  }

  function update(dt) {
    movePlayer(dt); updateWorld(false); updateMissions(); updateCamera(dt); updateHud(); updateMinimap(); autosave();
    state.stats.frames++;
    if (performance.now() - state.stats.lastFps > 500) { state.stats.fps = Math.round(state.stats.frames * 1000 / (performance.now() - state.stats.lastFps)); state.stats.frames = 0; state.stats.lastFps = performance.now(); }
  }

  function movePlayer(dt) {
    const p = state.player;
    let ix = 0, iz = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) iz -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) iz += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) ix -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) ix += 1;
    ix += state.joystick.x; iz += state.joystick.y;
    p.sprint = p.sprint || state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
    if (state.keys.has('Space')) jump();

    const active = p.inVehicle ? state.vehicles.find(v => v.id === p.inVehicle) : null;
    const max = active ? active.speed : p.speed * (p.sprint ? 1.55 : 1);
    const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
    const moving = Math.hypot(ix, iz) > 0.05;
    if (moving) p.yaw = Math.atan2(ix, iz);

    p.vx += ix * max * 6 * dt; p.vz += iz * max * 6 * dt;
    p.vx *= active ? 0.94 : 0.82; p.vz *= active ? 0.94 : 0.82;
    p.vy -= 36 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 2) { p.y = 2; p.vy = 0; }
    if (active) { active.x = p.x; active.z = p.z; active.gas = Math.max(0, active.gas - (moving ? dt * 0.55 : 0)); if (active.gas <= 0) { p.vx *= 0.9; p.vz *= 0.9; } }
    playerMesh.position.set(p.x, active ? 3.5 : p.y + 1.2, p.z); playerMesh.rotation.y = p.yaw;
    p.sprint = false;
  }
  function jump() { if (state.player.y <= 2.02 && !state.player.inVehicle) state.player.vy = 14; }
  function unstuck() { state.player.x = Math.round(state.player.x / 20) * 20; state.player.z = Math.round(state.player.z / 20) * 20; state.player.y = 8; state.player.vx = state.player.vz = 0; flash('Unstuck'); }

  function updateCamera(dt) {
    const p = state.player; const back = p.inVehicle ? 34 : 25; const height = p.inVehicle ? 20 : 15;
    const target = tmp.set(p.x - Math.sin(p.yaw) * back, p.y + height, p.z - Math.cos(p.yaw) * back);
    camera.position.lerp(target, 1 - Math.pow(0.001, dt)); camera.lookAt(p.x, p.y + 4, p.z);
  }

  function updateWorld(force) {
    const cx = Math.floor(state.player.x / WORLD.chunkSize), cz = Math.floor(state.player.z / WORLD.chunkSize);
    for (let x = cx - WORLD.renderRadius; x <= cx + WORLD.renderRadius; x++) for (let z = cz - WORLD.renderRadius; z <= cz + WORLD.renderRadius; z++) ensureChunk(x, z);
    for (const [key, chunk] of [...state.chunks]) {
      if (Math.abs(chunk.cx - cx) > WORLD.renderRadius + 1 || Math.abs(chunk.cz - cz) > WORLD.renderRadius + 1) { scene.remove(chunk.group); state.chunks.delete(key); }
    }
    if (force || state.vehicles.length < 8) spawnPersistentActors(cx, cz);
  }

  function ensureChunk(cx, cz) {
    const key = `${cx},${cz}`; if (state.chunks.has(key)) return;
    const group = new THREE.Group(); group.position.set(cx * WORLD.chunkSize, 0, cz * WORLD.chunkSize);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(WORLD.chunkSize, 1, WORLD.chunkSize), new THREE.MeshStandardMaterial({ color: ((cx + cz) % 2) ? 0x0b1730 : 0x0d1d3a, roughness: 0.9 }));
    ground.position.y = -0.5; group.add(ground);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.roadWidth, 0.08, WORLD.chunkSize), roadMat); road1.position.y = 0.06; group.add(road1);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.chunkSize, 0.08, WORLD.roadWidth), roadMat); road2.position.y = 0.07; group.add(road2);
    const neonMats = [0x17f3ff,0xff33cc,0x5ef38c,0xffd166,0x8c6bff].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.08, roughness: 0.5 }));
    for (let i = 0; i < 5; i++) {
      const rx = rand2(cx * 17 + i, cz * 9) * 70 - 35, rz = rand2(cx * 3, cz * 19 + i) * 70 - 35;
      if (Math.abs(rx) < 15 || Math.abs(rz) < 15) continue;
      const h = 8 + rand2(cx+i, cz-i) * 30;
      const b = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), neonMats[(i + Math.abs(cx) + Math.abs(cz)) % neonMats.length]);
      b.position.set(rx, h / 2, rz); group.add(b);
      if (i === 0 && rand2(cx, cz) > 0.55) addProperty(cx * WORLD.chunkSize + rx, cz * WORLD.chunkSize + rz, Math.round(120 + rand2(cx,cz)*260));
    }
    scene.add(group); state.chunks.set(key, { cx, cz, group });
  }

  function spawnPersistentActors(cx, cz) {
    const baseX = cx * WORLD.chunkSize, baseZ = cz * WORLD.chunkSize;
    for (let i = 0; i < 3; i++) {
      const x = baseX + rand2(cx+i, cz) * 80 - 40, z = baseZ + rand2(cx, cz+i) * 80 - 40;
      if (!nearAny(state.vehicles, x, z, 35)) addVehicle(x, z, ['Runner','Taxi','Volt Bike'][i % 3]);
      if (!nearAny(state.pickups, x+10, z-10, 30)) addPickup(x+10, z-10);
      if (!nearAny(state.npcs, x-12, z+12, 30)) addNpc(x-12, z+12);
    }
  }
  function nearAny(list, x, z, d) { return list.some(o => Math.hypot(o.x - x, o.z - z) < d); }
  function addVehicle(x,z,type) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(6,3,9), new THREE.MeshStandardMaterial({ color: type === 'Taxi' ? 0xffd166 : type === 'Volt Bike' ? 0xff33cc : 0x17f3ff })); mesh.position.set(x,1.6,z); scene.add(mesh); state.vehicles.push({ id: crypto.randomUUID?.() || String(Date.now()+Math.random()), x,z,type,mesh,speed:type==='Volt Bike'?48:type==='Taxi'?38:42,hp:100,gas:100 }); }
  function addPickup(x,z) { const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2,0), new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x5ef38c, emissiveIntensity: 0.25 })); mesh.position.set(x,2.5,z); scene.add(mesh); state.pickups.push({ x,z,mesh,value:20 }); }
  function addNpc(x,z) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.5,4,2.5), new THREE.MeshStandardMaterial({ color: 0xffffff })); mesh.position.set(x,2,z); scene.add(mesh); state.npcs.push({ x,z,mesh,t:Math.random()*6.28 }); }
  function addProperty(x,z,price) { if (nearAny(state.properties,x,z,10)) return; state.properties.push({ id:`prop:${Math.round(x)}:${Math.round(z)}`, x,z,price }); }

  function interact() {
    collectPickups();
    const prop = state.properties.find(o => dist2(state.player, o) < 12 && !state.player.owned.includes(o.id));
    if (prop) { if (state.player.cash >= prop.price) { state.player.cash -= prop.price; state.player.owned.push(prop.id); gainXp(45); flash(`Bought property for $${prop.price}`); } else flash(`Need $${prop.price}`, false); return; }
    const npc = state.npcs.find(o => dist2(state.player, o) < 10);
    if (npc) { startMission(); return; }
    const veh = state.vehicles.find(o => dist2(state.player, o) < 10);
    if (veh) { enterExitVehicle(veh); return; }
    flash('Nothing nearby', false);
  }
  function collectPickups() { for (const p of [...state.pickups]) if (dist2(state.player,p) < 6) { state.player.cash += p.value; gainXp(8); scene.remove(p.mesh); state.pickups.splice(state.pickups.indexOf(p),1); flash(`+$${p.value} pickup`); } }
  function enterExitVehicle(forceVeh) { const p = state.player; if (p.inVehicle) { p.inVehicle = null; flash('Exited vehicle'); return; } const v = forceVeh || state.vehicles.find(o => dist2(p,o) < 10); if (v) { p.inVehicle = v.id; p.x = v.x; p.z = v.z; flash(`Entered ${v.type}`); } else flash('No vehicle nearby', false); }

  const missionTemplates = [
    { id:'courier', name:'Neon Courier', reward:90, xp:45, target:{x:150,z:-90}, text:'Deliver a neon chip' },
    { id:'collect', name:'Street Sweep', reward:70, xp:35, target:{x:-120,z:130}, text:'Collect city pickups' },
    { id:'garage', name:'Garage Run', reward:120, xp:55, target:{x:210,z:180}, text:'Drive to the garage zone' }
  ];
  function startMission(id) { const m = missionTemplates.find(x => x.id === id) || missionTemplates.find(x => !state.missionsDone[x.id]) || missionTemplates[0]; state.player.mission = { ...m, startedAt: Date.now() }; flash(`Mission started: ${m.name}`); }
  function updateMissions() { const m = state.player.mission; if (!m) return; if (Math.hypot(state.player.x - m.target.x, state.player.z - m.target.z) < 14) { state.player.cash += m.reward; gainXp(m.xp); state.missionsDone[m.id] = true; state.player.mission = null; flash(`Mission complete +$${m.reward}`); } }
  function openMissionBoard() { const ul = $('mission-list'); if (ul) { ul.innerHTML=''; missionTemplates.forEach(m => { const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = `${m.name} - $${m.reward}`; b.onclick = () => { startMission(m.id); $('mission-board')?.classList.add('hidden'); }; li.appendChild(b); ul.appendChild(li); }); } $('mission-board')?.classList.remove('hidden'); setPause(true); }
  function gainXp(n) { const p = state.player; p.xp += n; const need = p.level * 120; if (p.xp >= need) { p.xp -= need; p.level++; p.cash += 50; flash(`Level ${p.level}! +$50`); } }

  function updateHud() {
    const p = state.player, v = p.inVehicle && state.vehicles.find(x => x.id === p.inVehicle), m = p.mission;
    setText(hud.cash, `$${Math.round(p.cash)}`); setText(hud.xp, Math.round(p.xp)); setText(hud.level, p.level); setText(hud.wanted, p.wanted);
    setText(hud.online, window.NeonBlockCloud?.enabled ? 'cloud-ready' : 'local'); setText(hud.debugOnline, window.NeonBlockCloud?.enabled ? 'cloud-ready' : 'local');
    setText(hud.vehicle, v ? v.type : 'On foot'); setText(hud.hp, v ? Math.round(v.hp) : 100); setText(hud.gas, v ? Math.round(v.gas) : 100);
    setText(hud.mission, m ? `${m.name}: ${Math.round(Math.hypot(p.x-m.target.x,p.z-m.target.z))}m` : 'None');
    setText(hud.fps, state.stats.fps); setText(hud.pos, `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`); setText(hud.chunks, state.chunks.size); setText(hud.npcs, state.npcs.length); setText(hud.activeVehicle, v ? v.type : 'None'); setText(hud.slot, state.currentSlot);
    if (arrowEl && m) { arrowEl.style.transform = `rotate(${Math.atan2(m.target.x-p.x, m.target.z-p.z) - p.yaw}rad)`; arrowEl.textContent = '▲'; } else if (arrowEl) arrowEl.textContent = '•';
  }
  function updateMinimap() { if (!minimapCtx) return; const c = minimapCtx, w = c.canvas.width, p = state.player; c.clearRect(0,0,w,w); c.fillStyle='#050814cc'; c.fillRect(0,0,w,w); c.strokeStyle='#17f3ff55'; c.beginPath(); c.moveTo(w/2,0); c.lineTo(w/2,w); c.moveTo(0,w/2); c.lineTo(w,w/2); c.stroke(); const draw=(x,z,color,r=3)=>{c.fillStyle=color;c.beginPath();c.arc(w/2+(x-p.x)/4,w/2+(z-p.z)/4,r,0,7);c.fill();}; state.vehicles.forEach(v=>draw(v.x,v.z,'#ffd166')); state.pickups.forEach(o=>draw(o.x,o.z,'#5ef38c',2)); if(p.mission) draw(p.mission.target.x,p.mission.target.z,'#ff33cc',5); draw(p.x,p.z,'#17f3ff',4); }

  function getSaveData() { const p = state.player; return { version: 2, savedAt: new Date().toISOString(), player: { x:p.x,y:p.y,z:p.z,cash:p.cash,xp:p.xp,level:p.level,wanted:p.wanted,owned:p.owned,mission:p.mission }, missionsDone: state.missionsDone, currentSlot: state.currentSlot, quality: state.quality }; }
  function save(slot = state.currentSlot) { state.currentSlot = slot; const data = getSaveData(); localStorage.setItem(SAVE_KEY + slot, JSON.stringify(data)); window.NeonBlockCloud?.save?.(slot, data).catch(e => setText(hud.lastError, e.message || e)); flash(`Saved ${slot}`); }
  function safeLoad(slot = state.currentSlot, silent = false) { try { const raw = localStorage.getItem(SAVE_KEY + slot); if (!raw) { if(!silent) flash('No save found', false); return; } applySave(JSON.parse(raw)); state.currentSlot = slot; if(!silent) flash(`Loaded ${slot}`); } catch(e) { setText(hud.lastError, e.message); if(!silent) flash('Load failed', false); } }
  function applySave(data) { if (!data?.player) return; Object.assign(state.player, data.player); state.player.vx = state.player.vy = state.player.vz = 0; state.player.inVehicle = null; state.missionsDone = data.missionsDone || {}; state.quality = data.quality || state.quality; }
  function importSave() { try { const data = JSON.parse($('export-json').value); applySave(data); save(state.currentSlot); flash('Imported save'); } catch(e) { flash('Bad JSON', false); setText(hud.lastError, e.message); } }
  function autosave() { if (performance.now() - state.lastSaveAt > 20000) { state.lastSaveAt = performance.now(); save(state.currentSlot); } }

  try { init(); } catch (e) { console.error(e); setText(hud.lastError, e.message || e); $('loading-screen')?.classList.add('hidden'); flash('Game boot error - check console', false); }
})();
