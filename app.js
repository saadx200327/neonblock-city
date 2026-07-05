(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error'),
    reward: $('reward-popup')
  };

  const CONFIG = { chunkSize: 90, streamRadius: 2, npcLimit: 36, pickupLimit: 28, vehicleLimit: 12 };
  const state = {
    cash: 75, xp: 0, level: 1, wanted: 0, paused: false, slot: 'slot1', online: false,
    keys: new Set(), joy: { x: 0, y: 0 }, sprint: false, last: performance.now(), fpsT: 0, frames: 0,
    player: { pos: new THREE.Vector3(0, 2, 0), vel: new THREE.Vector3(), yaw: 0, onGround: false, inVehicle: null },
    mission: null, missionsDone: {}, owned: {}, chunks: new Map(), npcs: [], pickups: [], vehicles: [], buildings: [], errors: []
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a18);
  scene.fog = new THREE.Fog(0x070a18, 80, 360);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);

  const hemi = new THREE.HemisphereLight(0xb7ecff, 0x17112b, 1.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(80, 130, 50); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: 0x111731 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  const mats = {
    player: new THREE.MeshLambertMaterial({ color: 0x19e6ff }), road: new THREE.MeshLambertMaterial({ color: 0x171b29 }), stripe: new THREE.MeshLambertMaterial({ color: 0xe8f7ff }),
    grass: new THREE.MeshLambertMaterial({ color: 0x0e402c }), glass: new THREE.MeshLambertMaterial({ color: 0x4a64ff }), pickup: new THREE.MeshLambertMaterial({ color: 0xffd54a }), npc: new THREE.MeshLambertMaterial({ color: 0xff4fd8 }), vehicle: new THREE.MeshLambertMaterial({ color: 0xff385c }), owned: new THREE.MeshLambertMaterial({ color: 0x5ef38c })
  };
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), mats.player); scene.add(playerMesh);

  const missions = [
    { id: 'courier', name: 'Courier Dash', text: 'Collect 3 neon chips', target: 3, type: 'pickup', reward: 120, xp: 40 },
    { id: 'driver', name: 'Street Driver', text: 'Enter a car and drive 450m', target: 450, type: 'drive', reward: 180, xp: 55 },
    { id: 'owner', name: 'First Property', text: 'Buy any glowing lot', target: 1, type: 'own', reward: 220, xp: 70 }
  ];
  let missionProgress = 0;

  function rng(seed) { let t = seed + 0x6D2B79F5; return () => { t += 0x6D2B79F5; let x = Math.imul(t ^ t >>> 15, t | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  function hash(cx, cz) { return ((cx * 73856093) ^ (cz * 19349663)) | 0; }
  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function makeChunk(cx, cz) {
    const key = chunkKey(cx, cz); if (state.chunks.has(key)) return;
    const group = new THREE.Group(); const r = rng(hash(cx, cz)); const baseX = cx * CONFIG.chunkSize; const baseZ = cz * CONFIG.chunkSize;
    const roadW = 16;
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.chunkSize, .08, roadW), mats.road); road1.position.set(baseX, .03, baseZ); group.add(road1);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(roadW, .09, CONFIG.chunkSize), mats.road); road2.position.set(baseX, .04, baseZ); group.add(road2);
    for (let i = 0; i < 7; i++) {
      const sx = baseX + (r() - .5) * CONFIG.chunkSize; const sz = baseZ + (r() - .5) * CONFIG.chunkSize;
      if (Math.abs(sx - baseX) < 12 || Math.abs(sz - baseZ) < 12) continue;
      const h = 8 + r() * 38; const lotId = `lot-${cx}-${cz}-${i}`;
      const b = new THREE.Mesh(new THREE.BoxGeometry(9 + r() * 10, h, 9 + r() * 10), state.owned[lotId] ? mats.owned : mats.glass);
      b.position.set(sx, h / 2, sz); b.userData = { lotId, price: 250 + Math.floor(r() * 550) }; group.add(b); state.buildings.push(b);
    }
    if (state.pickups.length < CONFIG.pickupLimit && r() > .35) {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), mats.pickup); p.position.set(baseX + (r() - .5) * 60, 2, baseZ + (r() - .5) * 60); p.userData = { value: 25 + Math.floor(r() * 35) }; scene.add(p); state.pickups.push(p);
    }
    if (state.vehicles.length < CONFIG.vehicleLimit && r() > .5) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 7), mats.vehicle); v.position.set(baseX + (r() - .5) * 40, 1.2, baseZ + (r() - .5) * 40); v.userData = { hp: 100, gas: 100, driven: 0 }; scene.add(v); state.vehicles.push(v);
    }
    if (state.npcs.length < CONFIG.npcLimit) for (let i = 0; i < 2; i++) { const n = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 1.5), mats.npc); n.position.set(baseX + (r() - .5) * 70, 1.5, baseZ + (r() - .5) * 70); n.userData = { home: n.position.clone(), phase: r() * 99 }; scene.add(n); state.npcs.push(n); }
    scene.add(group); state.chunks.set(key, group);
  }

  function streamWorld() {
    const cx = Math.floor(state.player.pos.x / CONFIG.chunkSize), cz = Math.floor(state.player.pos.z / CONFIG.chunkSize);
    for (let x = cx - CONFIG.streamRadius; x <= cx + CONFIG.streamRadius; x++) for (let z = cz - CONFIG.streamRadius; z <= cz + CONFIG.streamRadius; z++) makeChunk(x, z);
    for (const [key, group] of state.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - cx) > CONFIG.streamRadius + 1 || Math.abs(z - cz) > CONFIG.streamRadius + 1) { scene.remove(group); state.chunks.delete(key); }
    }
  }

  function popup(text) { hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => hud.reward.classList.add('hidden'), 1700); }
  function addReward(cash, xp, msg) { state.cash += cash; state.xp += xp; while (state.xp >= state.level * 100) { state.xp -= state.level * 100; state.level++; popup('LEVEL UP ' + state.level); } if (msg) popup(msg); }
  function startMission() { const next = missions.find(m => !state.missionsDone[m.id]) || missions[0]; state.mission = next; missionProgress = 0; popup(next.name + ': ' + next.text); }
  function finishMission() { if (!state.mission) return; state.missionsDone[state.mission.id] = true; addReward(state.mission.reward, state.mission.xp, 'Mission complete +$' + state.mission.reward); state.mission = null; setTimeout(startMission, 1200); }
  function missionTick(deltaDrive = 0) { if (!state.mission) return; if (state.mission.type === 'drive') missionProgress += deltaDrive; if (state.mission.type === 'own') missionProgress = Object.keys(state.owned).length; if (missionProgress >= state.mission.target) finishMission(); }

  function interact() {
    const p = state.player.pos;
    if (state.player.inVehicle) { state.player.inVehicle = null; popup('Exited vehicle'); return; }
    let bestV = state.vehicles.find(v => v.position.distanceTo(p) < 8); if (bestV) { state.player.inVehicle = bestV; popup('Entered vehicle'); return; }
    const lot = state.buildings.find(b => b.position.distanceTo(p) < 13 && b.userData.lotId && !state.owned[b.userData.lotId]);
    if (lot) { const price = lot.userData.price; if (state.cash >= price) { state.cash -= price; state.owned[lot.userData.lotId] = true; lot.material = mats.owned; popup('Bought lot $' + price); missionTick(); } else popup('Need $' + price); return; }
    if (!state.mission) startMission();
  }

  function update(dt) {
    if (state.paused) return;
    const k = state.keys; const inputX = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + state.joy.x;
    const inputZ = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) + state.joy.y;
    const len = Math.hypot(inputX, inputZ); const dir = new THREE.Vector3(len ? inputX / len : 0, 0, len ? inputZ / len : 0);
    const speed = (state.player.inVehicle ? 34 : 12) * ((k.has('ShiftLeft') || state.sprint) ? 1.55 : 1);
    const before = state.player.pos.clone(); state.player.pos.addScaledVector(dir, speed * dt);
    state.player.vel.y -= 28 * dt; state.player.pos.y += state.player.vel.y * dt; if (state.player.pos.y < 2) { state.player.pos.y = 2; state.player.vel.y = 0; state.player.onGround = true; }
    if (dir.lengthSq()) state.player.yaw = Math.atan2(dir.x, dir.z);
    const driven = before.distanceTo(state.player.pos); if (state.player.inVehicle) { const v = state.player.inVehicle; v.position.copy(state.player.pos).y = 1.2; v.rotation.y = state.player.yaw; v.userData.gas = Math.max(0, v.userData.gas - driven * .015); missionTick(driven); }
    playerMesh.position.copy(state.player.pos); playerMesh.rotation.y = state.player.yaw; playerMesh.visible = !state.player.inVehicle;
    for (const p of [...state.pickups]) if (p.position.distanceTo(state.player.pos) < 4) { scene.remove(p); state.pickups.splice(state.pickups.indexOf(p), 1); addReward(p.userData.value, 10, '+$' + p.userData.value + ' chip'); if (state.mission?.type === 'pickup' && ++missionProgress >= state.mission.target) finishMission(); }
    for (const n of state.npcs) { n.userData.phase += dt; n.position.x = n.userData.home.x + Math.sin(n.userData.phase) * 7; n.position.z = n.userData.home.z + Math.cos(n.userData.phase * .7) * 7; }
    streamWorld(); updateCamera(dt); updateHud();
  }

  function updateCamera() { const target = state.player.inVehicle ? state.player.inVehicle.position : state.player.pos; const back = new THREE.Vector3(Math.sin(state.player.yaw) * -18, 13, Math.cos(state.player.yaw) * -18); camera.position.lerp(target.clone().add(back), .12); camera.lookAt(target.x, target.y + 2, target.z); }
  function updateHud() { hud.cash.textContent = '$' + Math.floor(state.cash); hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted; hud.online.textContent = state.online ? 'cloud-ready' : 'offline'; hud.debugOnline.textContent = hud.online.textContent; hud.mission.textContent = state.mission ? `${state.mission.name} ${Math.floor(missionProgress)}/${state.mission.target}` : 'None'; hud.vehicle.textContent = state.player.inVehicle ? 'Neon car' : 'On foot'; hud.hp.textContent = state.player.inVehicle ? Math.floor(state.player.inVehicle.userData.hp) : 100; hud.gas.textContent = state.player.inVehicle ? Math.floor(state.player.inVehicle.userData.gas) : 100; hud.pos.textContent = `${state.player.pos.x.toFixed(0)},${state.player.pos.y.toFixed(0)},${state.player.pos.z.toFixed(0)}`; hud.chunks.textContent = state.chunks.size; hud.npcs.textContent = state.npcs.length; hud.activeVehicle.textContent = state.player.inVehicle ? 'Neon car' : 'None'; hud.saveSlot.textContent = state.slot; hud.lastError.textContent = state.errors.at(-1) || 'none'; }
  function loop(now) { const dt = Math.min(.05, (now - state.last) / 1000); state.last = now; update(dt); renderer.render(scene, camera); state.frames++; state.fpsT += dt; if (state.fpsT > .5) { hud.fps.textContent = Math.round(state.frames / state.fpsT); state.frames = 0; state.fpsT = 0; } requestAnimationFrame(loop); }

  function save(slot = state.slot) { const data = { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, pos: state.player.pos.toArray(), owned: state.owned, missionsDone: state.missionsDone }; localStorage.setItem('neonblock-' + slot, JSON.stringify(data)); return data; }
  function load(slot = state.slot) { const raw = localStorage.getItem('neonblock-' + slot); if (!raw) return popup('No save in ' + slot); const data = JSON.parse(raw); state.cash = data.cash ?? state.cash; state.xp = data.xp ?? 0; state.level = data.level ?? 1; state.wanted = data.wanted ?? 0; state.player.pos.fromArray(data.pos || [0, 2, 0]); state.owned = data.owned || {}; state.missionsDone = data.missionsDone || {}; popup('Loaded ' + slot); }
  setInterval(() => save(), 15000);
  window.NeonBlockSave = { save, load, state };

  addEventListener('keydown', e => { state.keys.add(e.code); if (e.code === 'Space' && state.player.onGround) { state.player.vel.y = 12; state.player.onGround = false; } if (e.code === 'KeyE') interact(); if (e.code === 'Escape') togglePause(); if (e.code === 'KeyR') { state.player.pos.set(0, 2, 0); popup('Unstuck'); } });
  addEventListener('keyup', e => state.keys.delete(e.code));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  function togglePause(force) { state.paused = force ?? !state.paused; $('pause-overlay').classList.toggle('hidden', !state.paused); }
  $('btn-resume')?.addEventListener('click', () => togglePause(false)); $('btn-mobile-pause')?.addEventListener('click', () => togglePause()); $('btn-mobile-interact')?.addEventListener('click', interact); $('btn-mobile-unstuck')?.addEventListener('click', () => state.player.pos.set(0, 2, 0));
  $('btn-save')?.addEventListener('click', () => $('save-panel').classList.remove('hidden')); $('btn-load')?.addEventListener('click', () => load()); $('btn-close-save')?.addEventListener('click', () => $('save-panel').classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; save(); popup('Saved ' + state.slot); }));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; load(); }));
  $('btn-export')?.addEventListener('click', () => $('export-json').value = JSON.stringify(save(), null, 2));
  $('btn-import')?.addEventListener('click', () => { Object.assign(state, JSON.parse($('export-json').value)); popup('Imported save'); });
  $('btn-mobile-jump')?.addEventListener('click', () => { if (state.player.onGround) { state.player.vel.y = 12; state.player.onGround = false; } });
  $('btn-mobile-sprint')?.addEventListener('pointerdown', () => state.sprint = true); $('btn-mobile-sprint')?.addEventListener('pointerup', () => state.sprint = false);

  const joy = $('joystick-container'), stick = $('joystick-stick'); let joyId = null;
  joy?.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(joyId); });
  joy?.addEventListener('pointermove', e => { if (e.pointerId !== joyId) return; const rect = joy.getBoundingClientRect(); const x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2; const m = Math.min(48, Math.hypot(x, y)); const a = Math.atan2(y, x); state.joy.x = Math.cos(a) * (m / 48); state.joy.y = Math.sin(a) * (m / 48); stick.style.transform = `translate(${state.joy.x * 36}px,${state.joy.y * 36}px)`; });
  joy?.addEventListener('pointerup', () => { joyId = null; state.joy.x = state.joy.y = 0; stick.style.transform = ''; });

  try { streamWorld(); startMission(); load(); } catch (e) { state.errors.push(e.message); console.error(e); }
  loading?.classList.add('hidden'); requestAnimationFrame(loop);
})();
