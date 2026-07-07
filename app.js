(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { cash: 180, xp: 0, level: 1, wanted: 0, mission: null, owned: [], slot: 'slot1', lastError: 'none' };
  const keys = new Set();
  const input = { x: 0, y: 0, sprint: false, jump: false, interact: false, vy: 0, grounded: true };
  const missions = [
    { id: 'courier', name: 'Neon Courier', goal: 'Collect 4 green crates', target: 4, progress: 0, reward: 260, xp: 90 },
    { id: 'driver', name: 'Block Driver', goal: 'Drive 300 meters', target: 300, progress: 0, reward: 340, xp: 120 }
  ];
  let scene, camera, renderer, clock, player, activeVehicle = null;
  const chunks = new Map();
  const crates = [];
  const vehicles = [];
  const npcs = [];
  const lots = [];
  const CHUNK = 120;

  function safe(fn) { try { return fn(); } catch (err) { state.lastError = err.message || String(err); console.warn(err); } }
  function makeBox(color, w, h, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.05 }));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }
  function hash(n) { return Math.sin(n * 9127.13) * 10000 % 1; }
  function key(cx, cz) { return `${cx},${cz}`; }
  function popup(text) {
    const el = $('reward-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function init() {
    if (!window.THREE) {
      document.body.innerHTML = '<main class="menu-card"><h2>NeonBlock City</h2><p>Three.js could not load. Check the network connection and reload.</p></main>';
      return;
    }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050814);
    scene.fog = new THREE.Fog(0x050814, 90, 380);
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
    renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    clock = new THREE.Clock();
    scene.add(new THREE.HemisphereLight(0x99f8ff, 0x14041f, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(70, 140, 40);
    scene.add(sun);
    player = makeBox(0x17f3ff, 4, 8, 4);
    player.position.set(0, 4, 0);
    scene.add(player);
    bindControls();
    bindMenus();
    loadGame('slot1', true);
    $('loading-screen')?.remove();
    requestAnimationFrame(loop);
  }

  function buildChunk(cx, cz) {
    const group = new THREE.Group();
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const ground = makeBox(0x101832, CHUNK, 0.4, CHUNK);
    ground.position.set(ox, -0.2, oz);
    group.add(ground);
    for (let i = 0; i < 9; i++) {
      const h = 12 + Math.abs(hash(cx * 19 + cz * 31 + i)) * 52;
      const b = makeBox(i % 2 ? 0x2534a5 : 0x30185f, 10 + i % 4 * 3, h, 12 + i % 3 * 4);
      b.position.set(ox + (hash(i + cx * 7) - 0.5) * 95, h / 2, oz + (hash(i + cz * 11) - 0.5) * 95);
      group.add(b);
    }
    for (let i = 0; i < 5; i++) {
      const light = makeBox(0xff2bd6, 0.7, 8, 0.7);
      light.position.set(ox - 50 + i * 25, 4, oz + 54);
      group.add(light);
    }
    if ((cx + cz) % 2 === 0) {
      const crate = makeBox(0x5ef38c, 4, 4, 4);
      crate.userData.kind = 'crate';
      crate.position.set(ox + 28, 2, oz - 24);
      crates.push(crate);
      group.add(crate);
    }
    if ((cx - cz) % 3 === 0) {
      const car = new THREE.Group();
      car.userData.kind = 'vehicle';
      const body = makeBox(0xff3366, 9, 3, 15);
      body.position.y = 2.5;
      const cab = makeBox(0x17f3ff, 6, 3, 7);
      cab.position.set(0, 5, -1);
      car.add(body, cab);
      car.position.set(ox - 30, 0, oz + 16);
      vehicles.push(car);
      group.add(car);
    }
    if ((cx + cz) % 4 === 0) {
      const npc = makeBox(0xffcc66, 4, 7, 4);
      npc.position.set(ox + 8, 3.5, oz + 30);
      npcs.push(npc);
      group.add(npc);
    }
    if ((cx * cz) % 5 === 0) {
      const lot = makeBox(0x17f3ff, 22, 0.5, 22);
      lot.material.transparent = true;
      lot.material.opacity = 0.24;
      lot.userData = { kind: 'lot', id: `lot-${cx}-${cz}`, price: 500 + Math.abs(cx + cz) * 80 };
      lot.position.set(ox - 20, 0.3, oz - 35);
      lots.push(lot);
      group.add(lot);
    }
    chunks.set(key(cx, cz), group);
    scene.add(group);
  }

  function streamWorld() {
    const cx = Math.floor(player.position.x / CHUNK);
    const cz = Math.floor(player.position.z / CHUNK);
    for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) if (!chunks.has(key(x, z))) buildChunk(x, z);
    for (const [k, group] of [...chunks]) {
      const [x, z] = k.split(',').map(Number);
      if (Math.abs(x - cx) > 2 || Math.abs(z - cz) > 2) {
        scene.remove(group);
        chunks.delete(k);
      }
    }
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.033);
    safe(() => update(dt));
    safe(() => renderer.render(scene, camera));
    requestAnimationFrame(loop);
  }

  function update(dt) {
    streamWorld();
    let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + input.x;
    let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + input.y;
    const len = Math.hypot(x, z) || 1;
    x /= len; z /= len;
    if ((keys.has('Space') || input.jump) && input.grounded && !activeVehicle) { input.vy = 24; input.grounded = false; }
    input.jump = false;
    if (!activeVehicle) {
      input.vy -= 70 * dt;
      player.position.y += input.vy * dt;
      if (player.position.y < 4) { player.position.y = 4; input.vy = 0; input.grounded = true; }
    }
    const actor = activeVehicle || player;
    const speed = (activeVehicle ? 38 : 20) * (keys.has('ShiftLeft') || input.sprint ? 1.55 : 1);
    actor.position.x += x * speed * dt;
    actor.position.z += z * speed * dt;
    if (x || z) actor.rotation.y = Math.atan2(x, z);
    if (activeVehicle) {
      player.position.copy(activeVehicle.position).add(new THREE.Vector3(0, 6, 0));
      const mission = missions.find((m) => m.id === 'driver' && state.mission === m.id);
      if (mission) { mission.progress = Math.min(mission.target, mission.progress + Math.hypot(x, z) * speed * dt); if (mission.progress >= mission.target) completeMission(mission); }
    }
    if (keys.has('KeyE') || input.interact) { input.interact = false; keys.delete('KeyE'); interact(); }
    camera.position.lerp(actor.position.clone().add(new THREE.Vector3(0, 42, 62).applyAxisAngle(new THREE.Vector3(0, 1, 0), actor.rotation.y)), 0.08);
    camera.lookAt(actor.position.x, actor.position.y + 4, actor.position.z);
    updateHud();
    updateMinimap();
  }

  function distance(a, b) { return a.position.distanceTo(b.position); }
  function interact() {
    const actor = activeVehicle || player;
    if (activeVehicle) { activeVehicle = null; popup('Exited vehicle'); return; }
    for (const v of vehicles) if (distance(actor, v) < 18) { activeVehicle = v; popup('Vehicle entered'); return; }
    for (const c of crates) if (c.visible && distance(actor, c) < 14) {
      c.visible = false; state.cash += 60; state.xp += 25;
      const mission = missions.find((m) => m.id === 'courier' && state.mission === m.id);
      if (mission && ++mission.progress >= mission.target) completeMission(mission);
      popup('Crate collected +$60'); return;
    }
    for (const lot of lots) if (distance(actor, lot) < 16) {
      if (state.owned.includes(lot.userData.id)) { popup('You own this lot'); return; }
      if (state.cash >= lot.userData.price) { state.cash -= lot.userData.price; state.owned.push(lot.userData.id); lot.material.opacity = 0.68; popup('Lot purchased'); }
      else popup(`Need $${lot.userData.price}`);
      return;
    }
    for (const npc of npcs) if (distance(actor, npc) < 14) { popup('NPC: Open missions with M or Interact.'); return; }
    openMissions();
  }

  function completeMission(mission) {
    state.cash += mission.reward; state.xp += mission.xp; state.mission = null; mission.progress = 0;
    if (state.xp >= state.level * 100) state.level += 1;
    popup(`Mission complete +$${mission.reward}`);
  }

  function updateHud() {
    const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    set('hud-cash', `$${Math.floor(state.cash)}`); set('hud-xp', Math.floor(state.xp)); set('hud-level', state.level); set('hud-wanted', state.wanted);
    set('hud-online', window.NeonBlockCloud ? 'cloud optional' : 'offline'); set('hud-vehicle', activeVehicle ? 'Neon car' : 'On foot'); set('hud-vehicle-hp', 100); set('hud-vehicle-gas', 100);
    const m = missions.find((mission) => mission.id === state.mission);
    set('hud-mission', m ? `${m.name} ${Math.floor(m.progress)}/${m.target}` : 'None');
    set('debug-fps', Math.round(1 / Math.max(clock.getDelta(), 0.016))); set('debug-pos', `${player.position.x.toFixed(0)},${player.position.y.toFixed(0)},${player.position.z.toFixed(0)}`);
    set('debug-chunks', chunks.size); set('debug-npcs', npcs.length); set('debug-active-vehicle', activeVehicle ? 'yes' : 'none'); set('debug-save-slot', state.slot); set('debug-online', window.NeonBlockCloud ? 'ready' : 'offline'); set('debug-last-error', state.lastError);
  }

  function updateMinimap() {
    const canvas = $('minimap-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = canvas.width;
    ctx.clearRect(0, 0, w, w); ctx.fillStyle = '#071027'; ctx.fillRect(0, 0, w, w); ctx.strokeStyle = '#17f3ff55'; ctx.strokeRect(4, 4, w - 8, w - 8);
    ctx.fillStyle = '#5ef38c'; crates.filter((c) => c.visible).slice(0, 32).forEach((c) => ctx.fillRect(w / 2 + (c.position.x - player.position.x) / 4, w / 2 + (c.position.z - player.position.z) / 4, 3, 3));
    ctx.fillStyle = '#17f3ff'; ctx.beginPath(); ctx.arc(w / 2, w / 2, 5, 0, Math.PI * 2); ctx.fill();
  }

  function openMissions() {
    const pause = $('pause-overlay'), panel = $('mission-board'), list = $('mission-list'); if (!pause || !panel || !list) return;
    pause.classList.remove('hidden'); panel.classList.remove('hidden'); list.innerHTML = '';
    missions.forEach((mission) => {
      const li = document.createElement('li'); const btn = document.createElement('button');
      btn.textContent = `${mission.name}: ${mission.goal} — $${mission.reward}`;
      btn.onclick = () => { state.mission = mission.id; panel.classList.add('hidden'); pause.classList.add('hidden'); popup(`Mission started: ${mission.name}`); };
      li.appendChild(btn); list.appendChild(li);
    });
  }

  function saveData() { return { v: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, mission: state.mission, owned: state.owned, pos: { x: player.position.x, y: player.position.y, z: player.position.z } }; }
  function restore(data) { if (!data) return; Object.assign(state, { cash: data.cash ?? state.cash, xp: data.xp ?? state.xp, level: data.level ?? state.level, wanted: data.wanted ?? 0, mission: data.mission || null, owned: data.owned || [] }); if (data.pos) player.position.set(data.pos.x || 0, data.pos.y || 4, data.pos.z || 0); }
  function saveGame(slot = 'slot1') { state.slot = slot; const data = saveData(); localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data)); window.NeonBlockCloud?.save?.(slot, data).catch((err) => { state.lastError = err.message; }); popup(`Saved ${slot}`); }
  function loadGame(slot = 'slot1', silent = false) { state.slot = slot; const raw = localStorage.getItem(`neonblock:${slot}`); if (raw) restore(JSON.parse(raw)); if (!silent) popup(`Loaded ${slot}`); }
  setInterval(() => safe(() => saveGame(state.slot)), 30000);

  function bindMenus() {
    $('btn-resume')?.addEventListener('click', () => $('pause-overlay')?.classList.add('hidden'));
    $('btn-settings')?.addEventListener('click', () => $('settings-panel')?.classList.toggle('hidden'));
    $('btn-close-settings')?.addEventListener('click', () => $('settings-panel')?.classList.add('hidden'));
    $('btn-save')?.addEventListener('click', () => $('save-panel')?.classList.toggle('hidden'));
    $('btn-load')?.addEventListener('click', () => loadGame(state.slot));
    $('btn-close-save')?.addEventListener('click', () => $('save-panel')?.classList.add('hidden'));
    $('btn-close-missions')?.addEventListener('click', () => $('mission-board')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach((b) => b.addEventListener('click', () => saveGame(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach((b) => b.addEventListener('click', () => loadGame(b.dataset.slot)));
    $('btn-export')?.addEventListener('click', () => { $('export-json').value = JSON.stringify(saveData(), null, 2); });
    $('btn-import')?.addEventListener('click', () => { try { restore(JSON.parse($('export-json').value)); popup('Imported save'); } catch { popup('Bad save JSON'); } });
    $('graphics-quality')?.addEventListener('change', (e) => renderer.setPixelRatio(e.target.value === 'high' ? Math.min(devicePixelRatio || 1, 2) : 1));
  }

  function bindControls() {
    addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Escape') $('pause-overlay')?.classList.toggle('hidden'); if (e.code === 'KeyM') openMissions(); if (e.code === 'Backquote') $('debug-overlay')?.classList.toggle('visible'); });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    const joy = $('joystick-container'), stick = $('joystick-stick');
    if (joy && stick) {
      let active = false, rect;
      const move = (e) => { if (!active) return; const p = e.touches ? e.touches[0] : e; const dx = p.clientX - (rect.left + rect.width / 2); const dy = p.clientY - (rect.top + rect.height / 2); const len = Math.min(1, Math.hypot(dx, dy) / 50); const a = Math.atan2(dy, dx); input.x = Math.cos(a) * len; input.y = Math.sin(a) * len; stick.style.transform = `translate(${input.x * 36}px,${input.y * 36}px)`; };
      const end = () => { active = false; input.x = 0; input.y = 0; stick.style.transform = 'translate(0,0)'; };
      joy.addEventListener('pointerdown', (e) => { active = true; rect = joy.getBoundingClientRect(); move(e); }); addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
    }
    const press = (id, down, up = down) => { const b = $(id); if (!b) return; b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(true); }); b.addEventListener('pointerup', () => up(false)); b.addEventListener('pointercancel', () => up(false)); };
    press('btn-mobile-jump', () => { input.jump = true; }); press('btn-mobile-sprint', (v) => { input.sprint = v; }); press('btn-mobile-interact', () => { input.interact = true; });
    $('btn-mobile-unstuck')?.addEventListener('click', () => { player.position.set(0, 4, 0); if (activeVehicle) activeVehicle.position.set(0, 0, 0); });
    $('btn-mobile-pause')?.addEventListener('click', () => $('pause-overlay')?.classList.toggle('hidden'));
  }
  addEventListener('DOMContentLoaded', init);
})();
