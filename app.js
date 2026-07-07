/* NeonBlock City - playable static build */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("game-canvas");
  const loading = $("loading-screen");
  const state = { cash: 150, xp: 0, level: 1, wanted: 0, slot: "slot1", crates: {}, lots: {}, mission: 0, paused: false, inVehicle: null, cloud: false, lastError: "none", driveMeters: 0 };
  const missions = [
    { name: "Collect 3 energy crates", type: "crates", target: 3, cash: 180, xp: 80 },
    { name: "Buy your first neon lot", type: "lots", target: 1, cash: 260, xp: 120 },
    { name: "Drive 500m safely", type: "drive", target: 500, cash: 320, xp: 160 },
    { name: "Reach Level 3", type: "level", target: 3, cash: 500, xp: 220 }
  ];
  const hud = {
    cash: $("hud-cash"), xp: $("hud-xp"), level: $("hud-level"), wanted: $("hud-wanted"), online: $("hud-online"),
    vehicle: $("hud-vehicle"), hp: $("hud-vehicle-hp"), gas: $("hud-vehicle-gas"), mission: $("hud-mission"),
    fps: $("debug-fps"), pos: $("debug-pos"), chunks: $("debug-chunks"), npcs: $("debug-npcs"), active: $("debug-active-vehicle"),
    slot: $("debug-save-slot"), onlineDebug: $("debug-online"), error: $("debug-last-error"), mini: $("minimap-canvas"), reward: $("reward-popup")
  };
  const keys = new Set();
  const joy = { x: 0, y: 0 };
  const CHUNK = 80, RADIUS = 2;
  let scene, camera, renderer, clock, player, chunks = new Map(), crates = [], vehicles = [], lots = [], npcs = [], fpsT = 0, fpsN = 0, fpsA = 0, autoSave = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function err(e) { state.lastError = e?.message || String(e || "unknown"); console.warn(e); }
  function popup(text) { hud.reward.textContent = text; hud.reward.classList.remove("hidden"); clearTimeout(popup.t); popup.t = setTimeout(() => hud.reward.classList.add("hidden"), 1700); }

  function boot() {
    if (!window.THREE) { document.body.insertAdjacentHTML("beforeend", "<div class='fatal'>Three.js failed to load. Refresh with network access.</div>"); return; }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b18);
    scene.fog = new THREE.Fog(0x080b18, 125, 430);
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
    clock = new THREE.Clock();
    const sun = new THREE.DirectionalLight(0xb6f6ff, 1.4); sun.position.set(55, 85, 40); sun.castShadow = true; scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x5588ff, 0x151018, 1.05));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.MeshStandardMaterial({ color: 0x071018, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    player = makePlayer(); scene.add(player.group);
    seedObjects(); bindInput(); buildMissionBoard(); loadGame(state.slot, true); streamWorld(true);
    setTimeout(() => loading?.classList.add("hidden"), 450);
    requestAnimationFrame(loop);
  }

  function makePlayer() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 2), new THREE.MeshStandardMaterial({ color: 0x24e8ff, roughness: 0.45 }));
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xffd19b, roughness: 0.5 }));
    body.position.y = 4.1; head.position.y = 7.8; body.castShadow = head.castShadow = true; group.add(body, head); group.position.set(0, 0, 0);
    return { group, vel: new THREE.Vector3(), grounded: true };
  }

  function seedObjects() {
    for (let i = 0; i < 36; i++) crates.push(addCrate(((i * 53) % 620) - 310, ((i * 91) % 620) - 310, i));
    for (let i = 0; i < 10; i++) vehicles.push(addVehicle(-110 + i * 24, 38 + (i % 2) * 18, i));
    for (let i = 0; i < 14; i++) lots.push(addLot(-210 + (i % 7) * 70, -150 + Math.floor(i / 7) * 90, i));
    for (let i = 0; i < 18; i++) npcs.push(addNpc(((i * 37) % 480) - 240, ((i * 71) % 480) - 240));
  }
  function addCrate(x, z, id) { const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0xff38c7, emissive: 0x551033 })); m.position.set(x, 1.7, z); m.castShadow = true; m.userData = { id }; scene.add(m); return m; }
  function addVehicle(x, z, id) { const g = new THREE.Group(); const car = new THREE.Mesh(new THREE.BoxGeometry(7, 2.5, 12), new THREE.MeshStandardMaterial({ color: id % 2 ? 0xffcd38 : 0x20ff8f })); const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x111c36 })); car.position.y = 2; cab.position.set(0, 4, -1); car.castShadow = cab.castShadow = true; g.add(car, cab); g.position.set(x, 0, z); g.userData = { id, hp: 100, gas: 100 }; scene.add(g); return g; }
  function addLot(x, z, id) { const m = new THREE.Mesh(new THREE.BoxGeometry(28, 0.5, 22), new THREE.MeshStandardMaterial({ color: 0x222a55, emissive: 0x050820 })); m.position.set(x, 0.3, z); m.userData = { id, price: 250 + id * 60 }; scene.add(m); return m; }
  function addNpc(x, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.8, 2.2), new THREE.MeshStandardMaterial({ color: 0xb884ff })); m.position.set(x, 2.5, z); m.castShadow = true; scene.add(m); return m; }

  function makeChunk(cx, cz) {
    const key = `${cx},${cz}`; if (chunks.has(key)) return;
    const group = new THREE.Group(); group.position.set(cx * CHUNK, 0, cz * CHUNK);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.82 });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.12, 10), roadMat), r2 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.13, CHUNK), roadMat); r1.position.y = 0.07; r2.position.y = 0.08; group.add(r1, r2);
    const count = 3 + Math.abs((cx * 7 + cz * 11) % 5);
    for (let i = 0; i < count; i++) {
      const h = 8 + Math.abs(((cx + 3) * (cz + 5) * (i + 2)) % 34);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + ((i + cx) % 10) / 30, 0.65, 0.22), emissive: 0x030712 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(10 + (i % 3) * 4, h, 10 + ((i + 1) % 3) * 4), mat);
      b.position.set(-28 + ((i * 19 + cx * 5) % 56), h / 2, -26 + ((i * 23 + cz * 7) % 52)); b.castShadow = b.receiveShadow = true; group.add(b);
    }
    scene.add(group); chunks.set(key, group);
  }
  function streamWorld() {
    const pcx = Math.round(player.group.position.x / CHUNK), pcz = Math.round(player.group.position.z / CHUNK);
    for (let x = pcx - RADIUS; x <= pcx + RADIUS; x++) for (let z = pcz - RADIUS; z <= pcz + RADIUS; z++) makeChunk(x, z);
    for (const [key, group] of chunks) { const [cx, cz] = key.split(",").map(Number); if (Math.abs(cx - pcx) > RADIUS + 1 || Math.abs(cz - pcz) > RADIUS + 1) { scene.remove(group); group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); chunks.delete(key); } }
  }

  function bindInput() {
    addEventListener("keydown", e => { keys.add(e.code); if (e.code === "Escape") pause(!state.paused); if (e.code === "KeyE") interact(); if (e.code === "KeyR") unstuck(); });
    addEventListener("keyup", e => keys.delete(e.code));
    addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    $("btn-resume")?.addEventListener("click", () => pause(false)); $("btn-mobile-pause")?.addEventListener("click", () => pause(true)); $("btn-mobile-interact")?.addEventListener("click", interact); $("btn-mobile-unstuck")?.addEventListener("click", unstuck);
    $("btn-save")?.addEventListener("click", () => $("save-panel")?.classList.remove("hidden")); $("btn-load")?.addEventListener("click", () => $("save-panel")?.classList.remove("hidden")); $("btn-close-save")?.addEventListener("click", () => $("save-panel")?.classList.add("hidden"));
    document.querySelectorAll(".btn-save-slot").forEach(b => b.addEventListener("click", () => saveGame(b.dataset.slot))); document.querySelectorAll(".btn-load-slot").forEach(b => b.addEventListener("click", () => loadGame(b.dataset.slot)));
    $("btn-export")?.addEventListener("click", () => { $("export-json").value = JSON.stringify(saveData(), null, 2); });
    $("btn-import")?.addEventListener("click", () => { try { applySave(JSON.parse($("export-json").value)); saveGame(state.slot); } catch (e) { err(e); popup("Import failed"); } });
    for (const id of ["btn-mobile-jump", "btn-mobile-sprint"]) { const code = id.includes("jump") ? "Space" : "ShiftLeft"; $(id)?.addEventListener("pointerdown", () => keys.add(code)); $(id)?.addEventListener("pointerup", () => keys.delete(code)); }
    bindJoystick();
  }
  function bindJoystick() { const base = $("joystick-container"), stick = $("joystick-stick"); let active = false; const move = e => { if (!active) return; const r = base.getBoundingClientRect(), t = e.touches ? e.touches[0] : e, dx = clamp(t.clientX - (r.left + r.width / 2), -45, 45), dy = clamp(t.clientY - (r.top + r.height / 2), -45, 45); joy.x = dx / 45; joy.y = dy / 45; stick.style.transform = `translate(${dx}px,${dy}px)`; e.preventDefault(); }; base?.addEventListener("pointerdown", e => { active = true; base.setPointerCapture(e.pointerId); move(e); }); base?.addEventListener("pointermove", move); base?.addEventListener("pointerup", () => { active = false; joy.x = joy.y = 0; stick.style.transform = ""; }); }
  function pause(v) { state.paused = v; $("pause-overlay")?.classList.toggle("hidden", !v); }

  function input() { let x = joy.x, z = joy.y; if (keys.has("KeyA") || keys.has("ArrowLeft")) x--; if (keys.has("KeyD") || keys.has("ArrowRight")) x++; if (keys.has("KeyW") || keys.has("ArrowUp")) z--; if (keys.has("KeyS") || keys.has("ArrowDown")) z++; const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l, active: Math.hypot(x, z) > 0.1 }; }
  function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); if (!state.paused) tick(dt); renderer.render(scene, camera); }
  function tick(dt) { streamWorld(); move(dt); collect(); mission(); cameraFollow(dt); updateHud(dt); autoSave += dt; if (autoSave > 20) { autoSave = 0; saveGame(state.slot, true); } }
  function move(dt) { const i = input(), avatar = state.inVehicle || player.group, speed = state.inVehicle ? 52 : (keys.has("ShiftLeft") ? 38 : 24); if (i.active) { avatar.position.x += i.x * speed * dt; avatar.position.z += i.z * speed * dt; avatar.rotation.y = Math.atan2(i.x, i.z); if (state.inVehicle) { state.inVehicle.userData.gas = Math.max(0, state.inVehicle.userData.gas - dt * 1.8); state.driveMeters += speed * dt; player.group.position.copy(state.inVehicle.position); } } if (keys.has("Space") && !state.inVehicle && player.grounded) { player.vel.y = 14; player.grounded = false; } player.vel.y -= 30 * dt; player.group.position.y += player.vel.y * dt; if (player.group.position.y <= 0) { player.group.position.y = 0; player.vel.y = 0; player.grounded = true; } }
  function cameraFollow(dt) { const target = state.inVehicle || player.group, back = new THREE.Vector3(Math.sin(target.rotation.y) * -20, 18, Math.cos(target.rotation.y) * -20), desired = target.position.clone().add(back).add(new THREE.Vector3(0, 10, 0)); camera.position.lerp(desired, 1 - Math.pow(0.001, dt)); camera.lookAt(target.position.x, target.position.y + 5, target.position.z); }
  function collect() { for (const c of crates) { c.rotation.y += 0.02; if (!state.crates[c.userData.id] && dist(player.group.position, c.position) < 6) { state.crates[c.userData.id] = true; c.visible = false; state.cash += 45; state.xp += 25; popup("+45 cash / +25 XP"); } else if (state.crates[c.userData.id]) c.visible = false; } }
  function interact() { try { if (state.inVehicle) { const car = state.inVehicle; state.inVehicle = null; player.group.position.copy(car.position).add(new THREE.Vector3(5, 0, 0)); popup("Exited vehicle"); return; } const car = vehicles.find(v => dist(v.position, player.group.position) < 10 && v.userData.gas > 0); if (car) { state.inVehicle = car; popup("Entered vehicle"); return; } const lot = lots.find(l => dist(l.position, player.group.position) < 16 && !state.lots[l.userData.id]); if (lot) { if (state.cash >= lot.userData.price) { state.cash -= lot.userData.price; state.lots[lot.userData.id] = true; lot.material.color.setHex(0x13d982); state.xp += 60; popup("Lot purchased"); } else popup(`Need $${lot.userData.price}`); return; } if (npcs.some(n => dist(n.position, player.group.position) < 9)) popup("NPC: Collect crates, buy lots, drive missions."); else popup("Nothing nearby"); } catch (e) { err(e); } }
  function mission() { const m = missions[state.mission] || missions[missions.length - 1]; let p = m.type === "crates" ? Object.keys(state.crates).length : m.type === "lots" ? Object.keys(state.lots).length : m.type === "drive" ? Math.floor(state.driveMeters) : state.level; if (p >= m.target) { state.cash += m.cash; state.xp += m.xp; state.mission = Math.min(state.mission + 1, missions.length - 1); popup(`Mission complete: +$${m.cash}`); } state.level = 1 + Math.floor(state.xp / 180); }
  function buildMissionBoard() { const ul = $("mission-list"); if (ul) ul.innerHTML = missions.map(m => `<li>${m.name} — $${m.cash}</li>`).join(""); }
  function updateHud(dt) { fpsT += dt; fpsN++; fpsA += 1 / Math.max(dt, 0.001); if (fpsT > 0.5) { hud.fps.textContent = Math.round(fpsA / fpsN); fpsT = fpsN = fpsA = 0; } const car = state.inVehicle, m = missions[state.mission] || missions.at(-1); hud.cash.textContent = Math.floor(state.cash); hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted; hud.online.textContent = state.cloud ? "cloud ready" : "local save"; hud.onlineDebug.textContent = hud.online.textContent; hud.vehicle.textContent = car ? "Neon car" : "On foot"; hud.hp.textContent = car ? Math.round(car.userData.hp) : 100; hud.gas.textContent = car ? Math.round(car.userData.gas) : 100; hud.mission.textContent = m.name; hud.pos.textContent = `${player.group.position.x.toFixed(0)},${player.group.position.y.toFixed(0)},${player.group.position.z.toFixed(0)}`; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.length; hud.active.textContent = car ? `#${car.userData.id}` : "None"; hud.slot.textContent = state.slot; hud.error.textContent = state.lastError; drawMini(); }
  function drawMini() { const ctx = hud.mini?.getContext("2d"); if (!ctx) return; ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = "#071018"; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = "#17f3ff55"; ctx.strokeRect(2, 2, 156, 156); const px = player.group.position.x, pz = player.group.position.z, plot = (x, z, c, r = 2) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(80 + (x - px) / 4, 80 + (z - pz) / 4, r, 0, Math.PI * 2); ctx.fill(); }; lots.forEach(l => plot(l.position.x, l.position.z, state.lots[l.userData.id] ? "#5ef38c" : "#9aa0c2")); vehicles.forEach(v => plot(v.position.x, v.position.z, "#ffcd38")); plot(px, pz, "#17f3ff", 4); }
  function saveData() { return { version: 2, cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, crates: state.crates, lots: state.lots, mission: state.mission, driveMeters: state.driveMeters, position: player.group.position.toArray() }; }
  function applySave(d) { if (!d) return; state.cash = d.cash ?? state.cash; state.xp = d.xp ?? state.xp; state.level = d.level ?? state.level; state.wanted = d.wanted ?? state.wanted; state.crates = d.crates || {}; state.lots = d.lots || {}; state.mission = d.mission || 0; state.driveMeters = d.driveMeters || 0; if (Array.isArray(d.position)) player.group.position.fromArray(d.position); lots.forEach(l => { if (state.lots[l.userData.id]) l.material.color.setHex(0x13d982); }); crates.forEach(c => c.visible = !state.crates[c.userData.id]); }
  async function saveGame(slot = state.slot, silent = false) { state.slot = slot; const d = saveData(); localStorage.setItem(`neonblock:${slot}`, JSON.stringify(d)); if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(slot, d); state.cloud = true; } catch (e) { err(e); } } if (!silent) popup(`Saved ${slot}`); }
  async function loadGame(slot = state.slot, silent = false) { state.slot = slot; let raw = localStorage.getItem(`neonblock:${slot}`); if (!raw && window.NeonBlockCloud?.load) { try { const cloud = await window.NeonBlockCloud.load(slot); if (cloud) raw = JSON.stringify(cloud); state.cloud = true; } catch (e) { err(e); } } if (raw) applySave(JSON.parse(raw)); if (!silent) popup(`Loaded ${slot}`); }
  function unstuck() { player.group.position.set(player.group.position.x + 8, 0, player.group.position.z + 8); player.vel.set(0, 0, 0); if (state.inVehicle) state.inVehicle = null; popup("Unstuck"); }
  boot();
})();
