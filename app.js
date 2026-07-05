(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loadingScreen = document.getElementById('loading-screen');
  const rewardPopup = document.getElementById('reward-popup');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimap = minimapCanvas.getContext('2d');

  const ui = {
    cash: document.getElementById('hud-cash'),
    xp: document.getElementById('hud-xp'),
    level: document.getElementById('hud-level'),
    wanted: document.getElementById('hud-wanted'),
    online: document.getElementById('hud-online'),
    vehicle: document.getElementById('hud-vehicle'),
    vehicleHp: document.getElementById('hud-vehicle-hp'),
    vehicleGas: document.getElementById('hud-vehicle-gas'),
    mission: document.getElementById('hud-mission'),
    fps: document.getElementById('debug-fps'),
    pos: document.getElementById('debug-pos'),
    chunks: document.getElementById('debug-chunks'),
    npcs: document.getElementById('debug-npcs'),
    activeVehicle: document.getElementById('debug-active-vehicle'),
    saveSlot: document.getElementById('debug-save-slot'),
    onlineDebug: document.getElementById('debug-online'),
    lastError: document.getElementById('debug-last-error')
  };

  const STATE_KEY = 'neonblock-city-save-v8';
  const CHUNK_SIZE = 160;
  const STREAM_RADIUS = 2;
  const MAX_NPCS = 34;
  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();

  const state = {
    cash: 50,
    xp: 0,
    level: 1,
    wanted: 0,
    slot: 'slot1',
    online: false,
    missionIndex: 0,
    activeVehicle: null,
    owned: {},
    player: { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0, onGround: false, yaw: 0 },
    keys: Object.create(null),
    joy: { active: false, x: 0, y: 0 },
    lastError: 'none'
  };

  const missions = [
    { name: 'Block Dash', target: new THREE.Vector3(95, 2, -65), reward: 120, xp: 45, text: 'Reach the blue delivery zone.' },
    { name: 'Neon Pickup', target: new THREE.Vector3(-130, 2, 90), reward: 190, xp: 70, text: 'Collect neon parts across town.' },
    { name: 'Buy A Garage', target: new THREE.Vector3(40, 2, 150), reward: 260, xp: 90, text: 'Reach the garage and buy property.' },
    { name: 'City Sprint', target: new THREE.Vector3(210, 2, 30), reward: 330, xp: 130, text: 'Cross the new district fast.' }
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 120, 520);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const hemi = new THREE.HemisphereLight(0x8feeff, 0x090915, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(80, 160, 80);
  scene.add(sun);

  const groundGeo = new THREE.PlaneGeometry(1200, 1200, 12, 12);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x10162c, roughness: 0.85, metalness: 0.05 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const player = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 2), new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x063d44 }));
  torso.position.y = 4.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 3.2), new THREE.MeshStandardMaterial({ color: 0xffd39a }));
  head.position.y = 8.8;
  player.add(torso, head);
  scene.add(player);

  const waypoint = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 1, 24),
    new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x0a6b77, transparent: true, opacity: 0.75 })
  );
  waypoint.position.copy(missions[0].target);
  scene.add(waypoint);

  const chunks = new Map();
  const pickups = [];
  const vehicles = [];
  const npcs = [];
  const properties = [];

  function seeded(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function chunkKey(cx, cz) { return `${cx},${cz}`; }

  function makeChunk(cx, cz) {
    const group = new THREE.Group();
    group.userData.cx = cx;
    group.userData.cz = cz;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let i = 0; i < 9; i++) {
      const seed = cx * 997 + cz * 1297 + i * 37;
      const x = baseX + (seeded(seed) - 0.5) * CHUNK_SIZE * 0.82;
      const z = baseZ + (seeded(seed + 3) - 0.5) * CHUNK_SIZE * 0.82;
      const h = 16 + seeded(seed + 9) * 48;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(16 + seeded(seed + 7) * 18, h, 16 + seeded(seed + 11) * 18),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + seeded(seed + 13) * 0.18, 0.7, 0.36), roughness: 0.7, metalness: 0.15 })
      );
      b.position.set(x, h / 2, z);
      group.add(b);
    }

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x0b0f1f, roughness: 0.9 });
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 0.08, 12), roadMat);
    road1.position.set(baseX, 0.04, baseZ);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.09, CHUNK_SIZE), roadMat);
    road2.position.set(baseX, 0.05, baseZ);
    group.add(road1, road2);

    if (seeded(cx * 31 + cz * 17) > 0.56) {
      const pickup = new THREE.Mesh(new THREE.OctahedronGeometry(3), new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x176a31 }));
      pickup.position.set(baseX + (seeded(cx + 100) - 0.5) * 100, 4, baseZ + (seeded(cz + 200) - 0.5) * 100);
      pickup.userData.value = 20 + Math.floor(seeded(cx * 9 + cz * 13) * 45);
      group.add(pickup);
      pickups.push(pickup);
    }

    if (seeded(cx * 19 - cz * 23) > 0.72) {
      const vehicle = makeVehicle(baseX + 30, baseZ - 24);
      group.add(vehicle.mesh);
      vehicles.push(vehicle);
    }

    if (seeded(cx * 11 + cz * 41) > 0.68) {
      const property = makeProperty(baseX - 34, baseZ + 36, `Lot ${cx}:${cz}`);
      group.add(property.mesh);
      properties.push(property);
    }

    scene.add(group);
    chunks.set(chunkKey(cx, cz), group);
  }

  function makeVehicle(x, z) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 16), new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x330915 }));
    body.position.y = 2.1;
    mesh.add(body);
    mesh.position.set(x, 0, z);
    return { mesh, hp: 100, gas: 100, speed: 0, name: 'Neon Kart' };
  }

  function makeProperty(x, z, name) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 18), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x3b2a00 }));
    mesh.position.set(x, 1.5, z);
    return { mesh, name, price: 250, owned: false };
  }

  function streamWorld() {
    const pcx = Math.round(state.player.x / CHUNK_SIZE);
    const pcz = Math.round(state.player.z / CHUNK_SIZE);
    for (let x = pcx - STREAM_RADIUS; x <= pcx + STREAM_RADIUS; x++) {
      for (let z = pcz - STREAM_RADIUS; z <= pcz + STREAM_RADIUS; z++) {
        if (!chunks.has(chunkKey(x, z))) makeChunk(x, z);
      }
    }
    for (const [key, group] of chunks) {
      const dx = Math.abs(group.userData.cx - pcx);
      const dz = Math.abs(group.userData.cz - pcz);
      if (dx > STREAM_RADIUS + 1 || dz > STREAM_RADIUS + 1) {
        scene.remove(group);
        chunks.delete(key);
      }
    }
  }

  function spawnNpcs() {
    while (npcs.length < MAX_NPCS) {
      const npc = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3), new THREE.MeshStandardMaterial({ color: 0xb98cff }));
      npc.position.set(state.player.x + (Math.random() - 0.5) * 230, 3, state.player.z + (Math.random() - 0.5) * 230);
      npc.userData.walk = Math.random() * Math.PI * 2;
      scene.add(npc);
      npcs.push(npc);
    }
  }

  function save(slot = state.slot) {
    const data = {
      cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, missionIndex: state.missionIndex,
      owned: state.owned, player: state.player
    };
    localStorage.setItem(`${STATE_KEY}:${slot}`, JSON.stringify(data));
    localStorage.setItem(STATE_KEY, JSON.stringify(data));
    showReward('Game saved');
    if (window.NeonBlockCloud && window.NeonBlockCloud.save) window.NeonBlockCloud.save(data).catch(setError);
  }

  function load(slot = state.slot) {
    const raw = localStorage.getItem(`${STATE_KEY}:${slot}`) || localStorage.getItem(STATE_KEY);
    if (!raw) return showReward('No save found');
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data);
      state.keys = Object.create(null);
      state.joy = { active: false, x: 0, y: 0 };
      state.slot = slot;
      showReward('Game loaded');
    } catch (e) { setError(e); }
  }

  function setError(e) {
    state.lastError = e && e.message ? e.message : String(e);
    if (ui.lastError) ui.lastError.textContent = state.lastError;
  }

  function showReward(text) {
    rewardPopup.textContent = text;
    rewardPopup.classList.remove('hidden');
    clearTimeout(showReward.timer);
    showReward.timer = setTimeout(() => rewardPopup.classList.add('hidden'), 1500);
  }

  function interact() {
    if (state.activeVehicle) {
      state.activeVehicle = null;
      return showReward('Exited vehicle');
    }
    for (const v of vehicles) {
      if (v.mesh.position.distanceTo(player.position) < 16) {
        state.activeVehicle = v;
        return showReward('Entered Neon Kart');
      }
    }
    for (const p of properties) {
      if (p.mesh.position.distanceTo(player.position) < 18) {
        if (state.owned[p.name]) return showReward(`${p.name} already owned`);
        if (state.cash < p.price) return showReward(`Need $${p.price}`);
        state.cash -= p.price;
        state.owned[p.name] = true;
        return showReward(`Bought ${p.name}`);
      }
    }
    showReward(missions[state.missionIndex].text);
  }

  function completeMission() {
    const m = missions[state.missionIndex];
    state.cash += m.reward;
    state.xp += m.xp;
    state.level = 1 + Math.floor(state.xp / 150);
    state.missionIndex = (state.missionIndex + 1) % missions.length;
    waypoint.position.copy(missions[state.missionIndex].target);
    showReward(`Mission complete +$${m.reward}`);
    save(state.slot);
  }

  function updateInput(dt) {
    let mx = 0, mz = 0;
    if (state.keys.KeyW || state.keys.ArrowUp) mz -= 1;
    if (state.keys.KeyS || state.keys.ArrowDown) mz += 1;
    if (state.keys.KeyA || state.keys.ArrowLeft) mx -= 1;
    if (state.keys.KeyD || state.keys.ArrowRight) mx += 1;
    mx += state.joy.x;
    mz += state.joy.y;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;
    const sprint = state.keys.ShiftLeft || state.keys.ShiftRight || state.keys.MobileSprint;
    const speed = state.activeVehicle ? 46 : sprint ? 26 : 16;
    const yaw = Math.atan2(mx, mz);
    if (Math.abs(mx) + Math.abs(mz) > 0.05) state.player.yaw = yaw;
    state.player.vx = mx * speed;
    state.player.vz = mz * speed;
    if ((state.keys.Space || state.keys.MobileJump) && state.player.onGround && !state.activeVehicle) {
      state.player.vy = 22;
      state.player.onGround = false;
    }
    state.player.vy -= 58 * dt;
    state.player.x += state.player.vx * dt;
    state.player.y += state.player.vy * dt;
    state.player.z += state.player.vz * dt;
    if (state.player.y <= 2) {
      state.player.y = 2;
      state.player.vy = 0;
      state.player.onGround = true;
    }
  }

  function updateGame(dt) {
    updateInput(dt);
    player.position.set(state.player.x, state.player.y, state.player.z);
    player.rotation.y = state.player.yaw;

    if (state.activeVehicle) {
      state.activeVehicle.mesh.position.copy(player.position).add(tmp.set(0, -2, 0));
      state.activeVehicle.mesh.rotation.y = state.player.yaw;
      state.activeVehicle.gas = Math.max(0, state.activeVehicle.gas - dt * 0.7);
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.rotation.y += dt * 2;
      if (p.parent && p.position.distanceTo(player.position) < 9) {
        state.cash += p.userData.value;
        state.xp += 8;
        p.parent.remove(p);
        pickups.splice(i, 1);
        showReward(`+$${p.userData.value} pickup`);
      }
    }

    for (const npc of npcs) {
      npc.userData.walk += dt * 0.8;
      npc.position.x += Math.sin(npc.userData.walk) * dt * 4;
      npc.position.z += Math.cos(npc.userData.walk) * dt * 4;
      if (npc.position.distanceTo(player.position) > 320) npc.position.copy(player.position).add(tmp.set((Math.random() - .5) * 180, 1, (Math.random() - .5) * 180));
    }

    if (player.position.distanceTo(missions[state.missionIndex].target) < 12) completeMission();
    streamWorld();
    spawnNpcs();
  }

  function updateCamera() {
    const back = new THREE.Vector3(Math.sin(state.player.yaw) * -34, 24, Math.cos(state.player.yaw) * -34);
    camera.position.lerp(player.position.clone().add(back), 0.12);
    camera.lookAt(player.position.x, player.position.y + 6, player.position.z);
  }

  function drawMinimap() {
    minimap.clearRect(0, 0, 160, 160);
    minimap.fillStyle = '#050814cc'; minimap.fillRect(0, 0, 160, 160);
    minimap.strokeStyle = '#17f3ff55'; minimap.strokeRect(1, 1, 158, 158);
    const scale = 0.28;
    minimap.fillStyle = '#17f3ff'; minimap.fillRect(78, 78, 4, 4);
    const m = missions[state.missionIndex].target;
    minimap.fillStyle = '#5ef38c'; minimap.beginPath(); minimap.arc(80 + (m.x - state.player.x) * scale, 80 + (m.z - state.player.z) * scale, 4, 0, Math.PI * 2); minimap.fill();
    minimap.fillStyle = '#ff3366';
    for (const v of vehicles.slice(0, 10)) minimap.fillRect(80 + (v.mesh.position.x - state.player.x) * scale, 80 + (v.mesh.position.z - state.player.z) * scale, 3, 3);
  }

  let fpsFrames = 0, fpsTime = 0, autosave = 0;
  function updateHud(dt) {
    fpsFrames++; fpsTime += dt; autosave += dt;
    if (fpsTime > 0.5) { ui.fps.textContent = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
    ui.cash.textContent = `$${Math.floor(state.cash)}`;
    ui.xp.textContent = Math.floor(state.xp);
    ui.level.textContent = state.level;
    ui.wanted.textContent = state.wanted;
    ui.online.textContent = state.online ? 'cloud' : 'offline';
    ui.onlineDebug.textContent = ui.online.textContent;
    ui.vehicle.textContent = state.activeVehicle ? state.activeVehicle.name : 'On foot';
    ui.vehicleHp.textContent = state.activeVehicle ? Math.round(state.activeVehicle.hp) : 100;
    ui.vehicleGas.textContent = state.activeVehicle ? Math.round(state.activeVehicle.gas) : 100;
    ui.mission.textContent = missions[state.missionIndex].name;
    ui.pos.textContent = `${state.player.x.toFixed(0)},${state.player.y.toFixed(0)},${state.player.z.toFixed(0)}`;
    ui.chunks.textContent = chunks.size;
    ui.npcs.textContent = npcs.length;
    ui.activeVehicle.textContent = state.activeVehicle ? state.activeVehicle.name : 'None';
    ui.saveSlot.textContent = state.slot;
    if (autosave > 20) { autosave = 0; save(state.slot); }
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    updateGame(dt);
    updateCamera();
    updateHud(dt);
    drawMinimap();
    waypoint.rotation.y += dt;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function bindControls() {
    window.addEventListener('keydown', e => {
      state.keys[e.code] = true;
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyR') unstuck();
      if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    });
    window.addEventListener('keyup', e => { state.keys[e.code] = false; });
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const joyBox = document.getElementById('joystick-container');
    const stick = document.getElementById('joystick-stick');
    joyBox.addEventListener('pointerdown', e => { state.joy.active = true; joyBox.setPointerCapture(e.pointerId); moveJoy(e); });
    joyBox.addEventListener('pointermove', moveJoy);
    joyBox.addEventListener('pointerup', endJoy);
    joyBox.addEventListener('pointercancel', endJoy);
    function moveJoy(e) {
      if (!state.joy.active) return;
      const r = joyBox.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.min(46, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      state.joy.x = Math.cos(a) * d / 46;
      state.joy.y = Math.sin(a) * d / 46;
      stick.style.transform = `translate(${state.joy.x * 46}px, ${state.joy.y * 46}px)`;
    }
    function endJoy() { state.joy.active = false; state.joy.x = 0; state.joy.y = 0; stick.style.transform = 'translate(0,0)'; }

    holdButton('btn-mobile-jump', 'MobileJump');
    holdButton('btn-mobile-sprint', 'MobileSprint');
    document.getElementById('btn-mobile-interact').addEventListener('click', interact);
    document.getElementById('btn-mobile-unstuck').addEventListener('click', unstuck);
    document.getElementById('btn-mobile-pause').addEventListener('click', togglePause);
    document.getElementById('btn-resume').addEventListener('click', togglePause);
    document.getElementById('btn-save').addEventListener('click', () => document.getElementById('save-panel').classList.toggle('hidden'));
    document.getElementById('btn-load').addEventListener('click', () => load(state.slot));
    document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('settings-panel').classList.toggle('hidden'));
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settings-panel').classList.add('hidden'));
    document.getElementById('btn-close-save').addEventListener('click', () => document.getElementById('save-panel').classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; save(state.slot); }));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => { state.slot = b.dataset.slot; load(state.slot); }));
    document.getElementById('btn-export').addEventListener('click', () => { document.getElementById('export-json').value = localStorage.getItem(`${STATE_KEY}:${state.slot}`) || ''; });
    document.getElementById('btn-import').addEventListener('click', () => { try { const data = JSON.parse(document.getElementById('export-json').value); localStorage.setItem(`${STATE_KEY}:${state.slot}`, JSON.stringify(data)); load(state.slot); } catch (e) { setError(e); } });
  }

  function holdButton(id, key) {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', () => { state.keys[key] = true; });
    b.addEventListener('pointerup', () => { state.keys[key] = false; });
    b.addEventListener('pointercancel', () => { state.keys[key] = false; });
  }

  function togglePause() { document.getElementById('pause-overlay').classList.toggle('hidden'); }
  function unstuck() { state.player.y = 12; state.player.vy = 0; showReward('Unstuck'); }

  window.addEventListener('error', e => setError(e.error || e.message));
  bindControls();
  load('slot1');
  streamWorld();
  spawnNpcs();
  setTimeout(() => loadingScreen.classList.add('hidden'), 500);
  loop();
})();
