(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const minimap = $('minimap-canvas');
  const mini = minimap ? minimap.getContext('2d') : null;

  const ui = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    reward: $('reward-popup'), pause: $('pause-overlay'), settings: $('settings-panel'), missions: $('mission-board'), savePanel: $('save-panel'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), error: $('debug-last-error'),
    joyWrap: $('joystick-container'), joyStick: $('joystick-stick'), exportBox: $('export-json'), quality: $('graphics-quality'), arrow: $('waypoint-arrow')
  };

  if (!window.THREE) {
    showFatal('Three.js failed to load. Check network/CDN access.');
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a16);
  scene.fog = new THREE.FogExp2(0x070a16, 0.012);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = false;

  const hemi = new THREE.HemisphereLight(0xaec8ff, 0x151022, 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0x74f7ff, 1.2);
  sun.position.set(80, 120, 70);
  scene.add(sun);

  const groundMat = new THREE.MeshLambertMaterial({ color: 0x12172d });
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x1b1f35 });
  const playerMat = new THREE.MeshLambertMaterial({ color: 0x19f2ff });
  const ownedMat = new THREE.MeshLambertMaterial({ color: 0x35ff83 });
  const lotMat = new THREE.MeshLambertMaterial({ color: 0xffc857 });
  const pickupMat = new THREE.MeshLambertMaterial({ color: 0xff4fd8 });

  const player = {
    mesh: new THREE.Group(), pos: new THREE.Vector3(0, 1, 0), velY: 0, yaw: 0, onGround: true,
    speed: 16, sprint: false, inVehicle: null, health: 100
  };
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.8), playerMat);
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.65, 0.8), new THREE.MeshLambertMaterial({ color: 0xf7d19d }));
  head.position.y = 2.15;
  player.mesh.add(body, head);
  scene.add(player.mesh);

  const state = {
    cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', ownedLots: {}, collected: {}, missionId: 'delivery', missionCount: 0,
    lastSave: 0, online: 'local', debug: false, quality: 'auto'
  };

  const input = { keys: {}, joyX: 0, joyY: 0, jump: false, interact: false, pointerDown: false, lastX: 0 };
  const chunks = new Map();
  const vehicles = [];
  const pickups = [];
  const lots = [];
  const npcs = [];

  const missions = {
    delivery: { label: 'Courier Run', target: new THREE.Vector3(70, 0, -55), need: 1, pay: 130, xp: 45, text: 'Reach the cyan waypoint.' },
    collect: { label: 'Collect Sparks', target: null, need: 5, pay: 180, xp: 65, text: 'Collect 5 pink sparks.' },
    driver: { label: 'Test Drive', target: new THREE.Vector3(-95, 0, 80), need: 1, pay: 220, xp: 90, text: 'Drive to the west garage.' }
  };

  function addTexturedBox(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  function seeded(n) {
    const s = Math.sin(n * 999.91) * 10000;
    return s - Math.floor(s);
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (chunks.has(key)) return;
    const group = new THREE.Group();
    group.userData.key = key;
    const baseX = cx * 80, baseZ = cz * 80;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 0.12, 80), groundMat);
    ground.position.set(baseX, -0.08, baseZ);
    group.add(ground);
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(80, 0.04, 10), roadMat);
    road1.position.set(baseX, 0.01, baseZ);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 80), roadMat);
    road2.position.set(baseX, 0.02, baseZ);
    group.add(road1, road2);

    for (let i = 0; i < 5; i++) {
      const r = seeded(cx * 31 + cz * 71 + i);
      const bx = baseX - 30 + seeded(r * 53) * 60;
      const bz = baseZ - 30 + seeded(r * 97) * 60;
      if (Math.abs(bx - baseX) < 8 || Math.abs(bz - baseZ) < 8) continue;
      const h = 5 + Math.floor(seeded(r * 31) * 26);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.52 + seeded(r) * 0.2, 0.75, 0.35) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(8 + seeded(r * 4) * 12, h, 8 + seeded(r * 7) * 12), mat);
      b.position.set(bx, h / 2, bz);
      group.add(b);
    }
    scene.add(group);
    chunks.set(key, group);
  }

  function streamWorld() {
    const cx = Math.round(player.pos.x / 80), cz = Math.round(player.pos.z / 80);
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) ensureChunk(x, z);
    for (const [key, group] of chunks) {
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > 3 || Math.abs(gz - cz) > 3) {
        scene.remove(group);
        group.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && ![groundMat, roadMat].includes(m.material)) m.material.dispose(); });
        chunks.delete(key);
      }
    }
  }

  function spawnStaticContent() {
    [[18, 0, 22], [-42, 0, -18], [86, 0, 45], [-92, 0, 76]].forEach((p, i) => {
      const mesh = addTexturedBox(4, 1.5, 7, new THREE.MeshLambertMaterial({ color: i % 2 ? 0xff4466 : 0x4be2ff }), p[0], 0.8, p[2]);
      vehicles.push({ mesh, hp: 100, gas: 100, name: i % 2 ? 'Volt Van' : 'Neon Coupe', speed: i % 2 ? 30 : 42 });
    });
    [[30, 30, 80], [-70, 55, 130], [100, -95, 240], [-120, -65, 180]].forEach(([x, z, cost], i) => {
      const mesh = addTexturedBox(12, 0.25, 12, lotMat, x, 0.12, z);
      lots.push({ id: `lot-${i}`, mesh, cost, x, z });
    });
    for (let i = 0; i < 32; i++) {
      const x = -180 + seeded(i + 4) * 360;
      const z = -180 + seeded(i + 31) * 360;
      const mesh = addTexturedBox(1.2, 1.2, 1.2, pickupMat, x, 1.2, z);
      mesh.rotation.y = i;
      pickups.push({ id: `spark-${i}`, mesh, value: 20 });
      if (state.collected[`spark-${i}`]) mesh.visible = false;
    }
    for (let i = 0; i < 18; i++) {
      const mesh = addTexturedBox(0.9, 1.7, 0.9, new THREE.MeshLambertMaterial({ color: 0xffffff * seeded(i + 17) }), -150 + seeded(i) * 300, 0.85, -150 + seeded(i + 9) * 300);
      npcs.push({ mesh, seed: i });
    }
  }

  function setMission(id) {
    state.missionId = id;
    state.missionCount = 0;
    popup(`Mission: ${missions[id].label}`);
    updateMissionBoard();
  }

  function completeMission() {
    const m = missions[state.missionId];
    state.cash += m.pay;
    state.xp += m.xp;
    state.level = 1 + Math.floor(state.xp / 160);
    state.missionId = state.missionId === 'delivery' ? 'collect' : state.missionId === 'collect' ? 'driver' : 'delivery';
    state.missionCount = 0;
    popup(`Completed +$${m.pay} +${m.xp}XP`);
    saveGame(false);
  }

  function interact() {
    if (player.inVehicle) {
      player.inVehicle.mesh.visible = true;
      player.inVehicle.mesh.position.copy(player.pos).add(new THREE.Vector3(3, 0, 0));
      player.inVehicle = null;
      popup('Exited vehicle');
      return;
    }
    let nearest = null, dist = 999;
    for (const v of vehicles) {
      const d = v.mesh.position.distanceTo(player.pos);
      if (d < dist) { dist = d; nearest = v; }
    }
    if (nearest && dist < 7) {
      player.inVehicle = nearest;
      nearest.mesh.visible = false;
      popup(`Entered ${nearest.name}`);
      return;
    }
    for (const lot of lots) {
      if (lot.mesh.position.distanceTo(player.pos) < 9) {
        if (state.ownedLots[lot.id]) return popup('You own this lot');
        if (state.cash < lot.cost) return popup(`Need $${lot.cost}`);
        state.cash -= lot.cost;
        state.ownedLots[lot.id] = true;
        lot.mesh.material = ownedMat;
        popup(`Lot purchased -$${lot.cost}`);
        saveGame(false);
        return;
      }
    }
    updateMissionBoard(true);
    toggle(ui.pause, false);
    toggle(ui.missions, true);
  }

  function update(dt) {
    const forward = (input.keys.KeyW || input.keys.ArrowUp ? 1 : 0) - (input.keys.KeyS || input.keys.ArrowDown ? 1 : 0) - input.joyY;
    const strafe = (input.keys.KeyD || input.keys.ArrowRight ? 1 : 0) - (input.keys.KeyA || input.keys.ArrowLeft ? 1 : 0) + input.joyX;
    if (input.keys.KeyQ) player.yaw += dt * 2.3;
    if (input.keys.KeyE) player.yaw -= dt * 2.3;
    if (input.keys.ShiftLeft || input.keys.ShiftRight) player.sprint = true;

    const mag = Math.hypot(forward, strafe);
    const speed = player.inVehicle ? player.inVehicle.speed : (player.sprint ? 25 : player.speed);
    if (mag > 0.05) {
      const angle = player.yaw + Math.atan2(strafe, forward);
      player.pos.x += Math.sin(angle) * speed * dt * Math.min(mag, 1);
      player.pos.z += Math.cos(angle) * speed * dt * Math.min(mag, 1);
      if (player.inVehicle) player.inVehicle.gas = Math.max(0, player.inVehicle.gas - dt * 1.8);
    }
    if (input.jump && player.onGround && !player.inVehicle) { player.velY = 9; player.onGround = false; }
    input.jump = false;
    if (!player.onGround) {
      player.velY -= 24 * dt;
      player.pos.y += player.velY * dt;
      if (player.pos.y <= 1) { player.pos.y = 1; player.velY = 0; player.onGround = true; }
    }
    if (input.interact) { input.interact = false; interact(); }
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.yaw;
    if (player.inVehicle) player.mesh.position.y = player.pos.y + 1.2;

    for (const p of pickups) {
      if (!p.mesh.visible) continue;
      p.mesh.rotation.y += dt * 2;
      if (p.mesh.position.distanceTo(player.pos) < 3.2) {
        p.mesh.visible = false;
        state.collected[p.id] = true;
        state.cash += p.value;
        state.xp += 8;
        if (state.missionId === 'collect') state.missionCount++;
        popup(`Spark +$${p.value}`);
      }
    }
    for (const n of npcs) n.mesh.rotation.y += Math.sin(performance.now() * 0.001 + n.seed) * dt;
    const mission = missions[state.missionId];
    if (mission.target && player.pos.distanceTo(mission.target) < 8) completeMission();
    if (state.missionId === 'collect' && state.missionCount >= mission.need) completeMission();
    if (state.missionId === 'driver' && !player.inVehicle && player.pos.distanceTo(mission.target) < 14) popup('Enter a vehicle first');
    streamWorld();
    updateCamera(dt);
    updateUi();
    autosave();
  }

  function updateCamera() {
    const distance = player.inVehicle ? 14 : 10;
    const height = player.inVehicle ? 8 : 6;
    const target = player.pos.clone().add(new THREE.Vector3(0, 2.2, 0));
    const desired = target.clone().add(new THREE.Vector3(-Math.sin(player.yaw) * distance, height, -Math.cos(player.yaw) * distance));
    camera.position.lerp(desired, 0.16);
    camera.lookAt(target);
  }

  function updateUi() {
    if (ui.cash) ui.cash.textContent = `$${state.cash}`;
    if (ui.xp) ui.xp.textContent = state.xp;
    if (ui.level) ui.level.textContent = state.level;
    if (ui.wanted) ui.wanted.textContent = state.wanted;
    if (ui.online) ui.online.textContent = state.online;
    if (ui.vehicle) ui.vehicle.textContent = player.inVehicle ? player.inVehicle.name : 'On foot';
    if (ui.hp) ui.hp.textContent = player.inVehicle ? Math.round(player.inVehicle.hp) : player.health;
    if (ui.gas) ui.gas.textContent = player.inVehicle ? Math.round(player.inVehicle.gas) : '—';
    const m = missions[state.missionId];
    if (ui.mission) ui.mission.textContent = `${m.label}: ${state.missionId === 'collect' ? state.missionCount + '/' + m.need : m.text}`;
    if (ui.pos) ui.pos.textContent = `${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)}`;
    if (ui.chunks) ui.chunks.textContent = chunks.size;
    if (ui.npcs) ui.npcs.textContent = npcs.length;
    if (ui.activeVehicle) ui.activeVehicle.textContent = player.inVehicle ? player.inVehicle.name : 'None';
    if (ui.saveSlot) ui.saveSlot.textContent = state.slot;
    if (ui.debugOnline) ui.debugOnline.textContent = state.online;
    drawMinimap();
    updateArrow();
  }

  function drawMinimap() {
    if (!mini) return;
    mini.clearRect(0, 0, 160, 160);
    mini.fillStyle = '#050814'; mini.fillRect(0, 0, 160, 160);
    mini.strokeStyle = '#223'; mini.strokeRect(1, 1, 158, 158);
    const scale = 0.45, cx = 80, cz = 80;
    lots.forEach((lot) => { mini.fillStyle = state.ownedLots[lot.id] ? '#5ef38c' : '#ffc857'; mini.fillRect(cx + (lot.x - player.pos.x) * scale - 2, cz + (lot.z - player.pos.z) * scale - 2, 4, 4); });
    vehicles.forEach((v) => { if (!v.mesh.visible) return; mini.fillStyle = '#4be2ff'; mini.fillRect(cx + (v.mesh.position.x - player.pos.x) * scale - 2, cz + (v.mesh.position.z - player.pos.z) * scale - 2, 4, 4); });
    const target = missions[state.missionId].target;
    if (target) { mini.fillStyle = '#17f3ff'; mini.beginPath(); mini.arc(cx + (target.x - player.pos.x) * scale, cz + (target.z - player.pos.z) * scale, 4, 0, Math.PI * 2); mini.fill(); }
    mini.fillStyle = '#fff'; mini.beginPath(); mini.arc(cx, cz, 4, 0, Math.PI * 2); mini.fill();
  }

  function updateArrow() {
    if (!ui.arrow) return;
    const target = missions[state.missionId].target;
    if (!target) { ui.arrow.textContent = '◆'; return; }
    const angle = Math.atan2(target.x - player.pos.x, target.z - player.pos.z) - player.yaw;
    ui.arrow.style.transform = `rotate(${angle}rad)`;
  }

  function savePayload() {
    return { version: 2, state, player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw }, savedAt: new Date().toISOString() };
  }

  async function saveGame(show = true) {
    const payload = savePayload();
    localStorage.setItem(`neonblock:${state.slot}`, JSON.stringify(payload));
    if (window.NeonBlockCloud?.save) {
      try { await window.NeonBlockCloud.save(state.slot, payload); state.online = 'cloud saved'; }
      catch (e) { state.online = 'local'; if (ui.error) ui.error.textContent = e.message || 'cloud save failed'; }
    }
    state.lastSave = performance.now();
    if (show) popup('Game saved');
  }

  function loadGame(slot = state.slot) {
    const raw = localStorage.getItem(`neonblock:${slot}`);
    if (!raw) return popup('No save in this slot');
    applySave(JSON.parse(raw));
    popup('Game loaded');
  }

  function applySave(data) {
    if (!data || !data.state) return;
    Object.assign(state, data.state);
    if (data.player) player.pos.set(data.player.x || 0, data.player.y || 1, data.player.z || 0), player.yaw = data.player.yaw || 0;
    lots.forEach((lot) => { if (state.ownedLots[lot.id]) lot.mesh.material = ownedMat; });
    pickups.forEach((p) => { p.mesh.visible = !state.collected[p.id]; });
  }

  function autosave() { if (performance.now() - state.lastSave > 30000) saveGame(false); }
  function popup(text) { if (!ui.reward) return; ui.reward.textContent = text; ui.reward.classList.remove('hidden'); clearTimeout(popup.t); popup.t = setTimeout(() => ui.reward.classList.add('hidden'), 1700); }
  function toggle(el, force) { if (el) el.classList.toggle('hidden', force === undefined ? undefined : !force); }

  function updateMissionBoard(open = false) {
    const list = $('mission-list');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(missions).forEach(([id, m]) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = `${m.label} — $${m.pay} / ${m.xp}XP`;
      btn.onclick = () => { setMission(id); toggle(ui.missions, false); toggle(ui.pause, false); };
      li.appendChild(btn); list.appendChild(li);
    });
    if (open) toggle(ui.missions, true);
  }

  function bindInput() {
    addEventListener('keydown', (e) => {
      input.keys[e.code] = true;
      if (e.code === 'Space') input.jump = true;
      if (e.code === 'KeyF') input.interact = true;
      if (e.code === 'Escape') toggle(ui.pause, ui.pause?.classList.contains('hidden'));
      if (e.code === 'F3') { state.debug = !state.debug; $('debug-overlay')?.classList.toggle('hidden', !state.debug); }
    });
    addEventListener('keyup', (e) => { input.keys[e.code] = false; if (e.code.startsWith('Shift')) player.sprint = false; });
    canvas.addEventListener('pointerdown', (e) => { input.pointerDown = true; input.lastX = e.clientX; });
    addEventListener('pointerup', () => { input.pointerDown = false; resetJoy(); });
    addEventListener('pointermove', (e) => { if (input.pointerDown && !e.target.closest?.('#joystick-container')) { player.yaw -= (e.clientX - input.lastX) * 0.006; input.lastX = e.clientX; } });

    const joy = ui.joyWrap;
    if (joy) {
      joy.addEventListener('pointerdown', joyMove);
      joy.addEventListener('pointermove', joyMove);
      joy.addEventListener('pointerup', resetJoy);
      joy.addEventListener('pointercancel', resetJoy);
    }
    const hold = (id, down, up = down) => { const b = $(id); if (!b) return; b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(true); }); b.addEventListener('pointerup', () => up(false)); b.addEventListener('pointercancel', () => up(false)); };
    hold('btn-mobile-jump', () => input.jump = true, () => {});
    hold('btn-mobile-sprint', (v) => player.sprint = v);
    hold('btn-mobile-interact', () => input.interact = true, () => {});
    hold('btn-mobile-unstuck', () => { player.pos.y = 4; player.velY = 0; popup('Unstuck'); }, () => {});
    $('btn-mobile-pause')?.addEventListener('click', () => toggle(ui.pause, true));
    $('btn-resume')?.addEventListener('click', () => toggle(ui.pause, false));
    $('btn-settings')?.addEventListener('click', () => toggle(ui.settings, true));
    $('btn-close-settings')?.addEventListener('click', () => toggle(ui.settings, false));
    $('btn-close-missions')?.addEventListener('click', () => toggle(ui.missions, false));
    $('btn-save')?.addEventListener('click', () => toggle(ui.savePanel, true));
    $('btn-load')?.addEventListener('click', () => loadGame());
    $('btn-close-save')?.addEventListener('click', () => toggle(ui.savePanel, false));
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; saveGame(); }));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => { state.slot = b.dataset.slot; loadGame(state.slot); }));
    $('btn-export')?.addEventListener('click', () => { ui.exportBox.value = JSON.stringify(savePayload(), null, 2); });
    $('btn-import')?.addEventListener('click', () => { try { applySave(JSON.parse(ui.exportBox.value)); saveGame(); } catch { popup('Invalid JSON'); } });
    ui.quality?.addEventListener('change', () => setQuality(ui.quality.value));
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(false); });
  }

  function joyMove(e) {
    e.preventDefault();
    const r = ui.joyWrap.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width * 0.35, len = Math.min(max, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    input.joyX = Math.cos(a) * len / max;
    input.joyY = Math.sin(a) * len / max;
    ui.joyStick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`;
  }
  function resetJoy() { input.joyX = 0; input.joyY = 0; if (ui.joyStick) ui.joyStick.style.transform = 'translate(0,0)'; }

  function setQuality(q) {
    state.quality = q;
    const pr = q === 'low' ? 1 : q === 'high' ? Math.min(devicePixelRatio || 1, 2) : Math.min(devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(pr);
  }

  let last = performance.now(), frames = 0, fpsAt = last;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now; frames++;
    update(dt);
    renderer.render(scene, camera);
    if (now - fpsAt > 500) { if (ui.fps) ui.fps.textContent = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
  }

  function showFatal(message) {
    if (loading) loading.innerHTML = `<div class="loading-title">NeonBlock City</div><div class="loading-sub">${message}</div>`;
  }

  function boot() {
    resize(); addEventListener('resize', resize);
    $('debug-overlay')?.classList.add('hidden');
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) ensureChunk(x, z);
    spawnStaticContent(); bindInput(); updateMissionBoard();
    try { const raw = localStorage.getItem(`neonblock:${state.slot}`); if (raw) applySave(JSON.parse(raw)); } catch {}
    if (loading) loading.style.display = 'none';
    requestAnimationFrame(loop);
  }

  boot();
})();
