'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const loading = $('loading-screen');
const hud = {
  cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
  vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
  fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), slot: $('debug-save-slot'), onlineDebug: $('debug-online'), lastError: $('debug-last-error')
};
const mini = $('minimap-canvas');
const miniCtx = mini.getContext('2d');
const reward = $('reward-popup');

const SAVE_KEY = 'neonblock-city-save-v14';
const CHUNK = 72;
const RENDER_RADIUS = 2;
const WORLD_LIMIT = 900;
const keys = new Set();
const pointer = { x: 0, y: 0, active: false };
let scene, camera, renderer, clock, sun;
let chunks = new Map();
let npcs = [];
let pickups = [];
let vehicles = [];
let properties = [];
let activeVehicle = null;
let missionIndex = 0;
let lastAutoSave = 0;
let fpsTick = 0, fpsFrames = 0;

const player = {
  x: 0, y: 1.25, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0,
  cash: 150, xp: 0, level: 1, wanted: 0, hp: 100,
  owned: [], checkpoint: { x: 0, z: 0 }
};

const missions = [
  { name: 'Courier Sprint', desc: 'Collect 3 neon crates.', type: 'collect', target: 3, count: 0, reward: 250, xp: 120 },
  { name: 'Taxi Loop', desc: 'Drive through 4 city rings.', type: 'drive', target: 4, count: 0, reward: 420, xp: 220 },
  { name: 'Block Baron', desc: 'Buy your first property.', type: 'own', target: 1, count: 0, reward: 500, xp: 300 }
];

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070914);
  scene.fog = new THREE.Fog(0x070914, 130, 430);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  clock = new THREE.Clock();
  sun = new THREE.DirectionalLight(0x9fdcff, 1.7);
  sun.position.set(40, 90, 30);
  scene.add(new THREE.HemisphereLight(0x77ccff, 0x15152a, 1.2), sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.MeshStandardMaterial({ color: 0x101528, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  makePlayerMesh();
  seedWorld();
  bindInput();
  loadGame('slot1', true);
  setTimeout(() => loading?.classList.add('hidden'), 450);
  requestAnimationFrame(tick);
}

let playerMesh;
function makePlayerMesh() {
  playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.7), mat(0x17f3ff));
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.78), mat(0xffdf9b));
  head.position.y = 2.45;
  playerMesh.add(body, head);
  scene.add(playerMesh);
}

function mat(color, emissive = 0x000000) { return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.25 : 0, roughness: 0.55 }); }
function box(w, h, d, color) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); }
function keyFor(cx, cz) { return `${cx},${cz}`; }
function rand(seed) { const x = Math.sin(seed * 999.91) * 10000; return x - Math.floor(x); }

function seedWorld() {
  for (let i = 0; i < 14; i++) vehicles.push(makeVehicle((i % 7 - 3) * 38, Math.floor(i / 7) * 80 - 60, i));
  for (let i = 0; i < 18; i++) pickups.push(makePickup((rand(i) - .5) * 520, (rand(i + 4) - .5) * 520, i));
  for (let i = 0; i < 9; i++) properties.push(makeProperty((rand(i + 20) - .5) * 620, (rand(i + 30) - .5) * 620, i));
  for (let i = 0; i < 18; i++) npcs.push(makeNpc((rand(i + 100) - .5) * 600, (rand(i + 200) - .5) * 600, i));
}

function ensureChunks() {
  const pcx = Math.floor(player.x / CHUNK), pcz = Math.floor(player.z / CHUNK);
  const keep = new Set();
  for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
    const cx = pcx + dx, cz = pcz + dz, k = keyFor(cx, cz); keep.add(k);
    if (!chunks.has(k)) chunks.set(k, createChunk(cx, cz));
  }
  for (const [k, group] of chunks) if (!keep.has(k)) { scene.remove(group); chunks.delete(k); }
}

function createChunk(cx, cz) {
  const group = new THREE.Group();
  group.userData.chunk = [cx, cz];
  const roadMat = mat(0x1b2033);
  const road1 = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, .05, 9), roadMat);
  const road2 = new THREE.Mesh(new THREE.BoxGeometry(9, .05, CHUNK), roadMat);
  road1.position.set(cx * CHUNK + CHUNK / 2, .03, cz * CHUNK + CHUNK / 2);
  road2.position.copy(road1.position);
  group.add(road1, road2);
  for (let i = 0; i < 5; i++) {
    const s = cx * 31 + cz * 73 + i;
    if (rand(s) < .3) continue;
    const h = 8 + rand(s + 1) * 48;
    const b = box(8 + rand(s + 2) * 13, h, 8 + rand(s + 3) * 13, [0x25304f, 0x34285c, 0x183f55][i % 3]);
    b.position.set(cx * CHUNK + 12 + rand(s + 4) * 48, h / 2, cz * CHUNK + 12 + rand(s + 5) * 48);
    const sign = box(b.geometry.parameters.width * .9, .25, .12, 0x17f3ff);
    sign.position.set(b.position.x, h + .4, b.position.z + b.geometry.parameters.depth / 2 + .08);
    group.add(b, sign);
  }
  scene.add(group);
  return group;
}

function makeVehicle(x, z, i) {
  const g = new THREE.Group();
  const body = box(3.6, 1.1, 5.2, i % 2 ? 0xff3366 : 0x23f38b);
  body.position.y = .75;
  const cab = box(2.6, .9, 2.2, 0xa8edff); cab.position.set(0, 1.55, -.45);
  g.add(body, cab); g.position.set(x, 0, z); scene.add(g);
  return { mesh: g, x, z, yaw: 0, speed: 0, hp: 100, gas: 100, owned: false };
}
function makePickup(x, z, i) { const m = box(1.2, 1.2, 1.2, 0xffd166); m.position.set(x, .9, z); scene.add(m); return { mesh: m, x, z, taken: false, kind: i % 3 ? 'cash' : 'crate' }; }
function makeProperty(x, z, i) { const m = box(12, 5, 12, 0x7d5fff); m.position.set(x, 2.5, z); scene.add(m); return { mesh: m, x, z, id: `property-${i + 1}`, price: 450 + i * 250, owned: false }; }
function makeNpc(x, z, i) { const m = box(1, 1.9, 1, i % 2 ? 0xf6e27f : 0xef8cff); m.position.set(x, .95, z); scene.add(m); return { mesh: m, x, z, phase: rand(i) * 10 }; }

function bindInput() {
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === 'Escape') togglePause(); if (e.key.toLowerCase() === 'e') interact(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  bindButton('btn-mobile-jump', () => jump()); bindButton('btn-mobile-interact', () => interact()); bindButton('btn-mobile-unstuck', () => unstuck()); bindButton('btn-mobile-pause', () => togglePause());
  bindButton('btn-resume', () => togglePause(false)); bindButton('btn-save', () => showSavePanel()); bindButton('btn-load', () => showSavePanel()); bindButton('btn-close-save', () => $('save-panel').classList.add('hidden'));
  bindButton('btn-settings', () => $('settings-panel').classList.toggle('hidden')); bindButton('btn-close-settings', () => $('settings-panel').classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b => b.onclick = () => saveGame(b.dataset.slot));
  document.querySelectorAll('.btn-load-slot').forEach(b => b.onclick = () => loadGame(b.dataset.slot));
  bindButton('btn-export', exportSave); bindButton('btn-import', importSave);
  const joy = $('joystick-container'), stick = $('joystick-stick');
  joy?.addEventListener('pointerdown', e => { pointer.active = true; joy.setPointerCapture(e.pointerId); moveJoy(e); });
  joy?.addEventListener('pointermove', moveJoy);
  joy?.addEventListener('pointerup', () => { pointer.active = false; pointer.x = pointer.y = 0; stick.style.transform = 'translate(0,0)'; });
  function moveJoy(e) { if (!pointer.active) return; const r = joy.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const len = Math.min(46, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); pointer.x = Math.cos(a) * len / 46; pointer.y = Math.sin(a) * len / 46; stick.style.transform = `translate(${Math.cos(a) * len}px,${Math.sin(a) * len}px)`; }
}
function bindButton(id, fn) { const el = $(id); if (el) el.onclick = fn; }

function tick(t) {
  const dt = Math.min(clock.getDelta(), .05);
  ensureChunks(); updatePlayer(dt); updateNpcs(dt, t); updatePickups(t); updateHud(t); drawMinimap(); renderer.render(scene, camera); requestAnimationFrame(tick);
}

function updatePlayer(dt) {
  let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + pointer.x;
  let iz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + pointer.y;
  const sprint = keys.has('shift') || $('btn-mobile-sprint')?.matches(':active');
  if (activeVehicle) driveVehicle(dt, ix, iz, sprint); else walk(dt, ix, iz, sprint);
  player.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, player.x)); player.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, player.z));
  playerMesh.position.set(player.x, player.y - 1.25, player.z); playerMesh.rotation.y = player.yaw;
  camera.position.lerp(new THREE.Vector3(player.x - Math.sin(player.yaw) * 11, player.y + 8, player.z - Math.cos(player.yaw) * 11), .12);
  camera.lookAt(player.x, player.y + 1.2, player.z);
}
function walk(dt, ix, iz, sprint) { const l = Math.hypot(ix, iz); if (l > .05) { ix /= l; iz /= l; const sp = sprint ? 15 : 8; player.x += ix * sp * dt; player.z += iz * sp * dt; player.yaw = Math.atan2(ix, iz); player.checkpoint = { x: player.x, z: player.z }; } }
function driveVehicle(dt, ix, iz, sprint) { const v = activeVehicle; v.gas = Math.max(0, v.gas - Math.abs(iz) * dt * (sprint ? 2 : 1)); const accel = v.gas > 0 ? (sprint ? 34 : 23) : 4; v.speed += -iz * accel * dt; v.speed *= .96; v.yaw -= ix * dt * Math.min(2.6, Math.abs(v.speed) * .1); v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; v.mesh.position.set(v.x, 0, v.z); v.mesh.rotation.y = v.yaw; player.x = v.x; player.z = v.z; player.yaw = v.yaw; const m = missions[missionIndex]; if (m?.type === 'drive' && Math.hypot(v.x, v.z) > 80 + m.count * 35) completeStep(); }
function jump() { player.y = 1.55; setTimeout(() => player.y = 1.25, 170); }
function unstuck() { player.x = player.checkpoint.x || 0; player.z = player.checkpoint.z || 0; showReward('Unstuck: returned to safe road'); }

function interact() {
  if (activeVehicle) { activeVehicle = null; showReward('Exited vehicle'); return; }
  const nearV = vehicles.find(v => Math.hypot(v.x - player.x, v.z - player.z) < 6);
  if (nearV) { activeVehicle = nearV; nearV.owned = true; showReward('Vehicle entered'); return; }
  const p = properties.find(p => !p.owned && Math.hypot(p.x - player.x, p.z - player.z) < 12);
  if (p) { if (player.cash >= p.price) { player.cash -= p.price; p.owned = true; player.owned.push(p.id); completeStep('own'); showReward(`Bought ${p.id}`); } else showReward(`Need $${p.price}`); }
}
function updatePickups(t) { for (const p of pickups) { if (p.taken) continue; p.mesh.rotation.y += .03; p.mesh.position.y = .9 + Math.sin(t * .004 + p.x) * .2; if (Math.hypot(p.x - player.x, p.z - player.z) < 3) { p.taken = true; p.mesh.visible = false; player.cash += p.kind === 'cash' ? 45 : 20; if (p.kind === 'crate') completeStep('collect'); showReward(p.kind === 'crate' ? 'Crate collected' : '+$45'); } } }
function updateNpcs(dt, t) { for (const n of npcs) { n.phase += dt; n.x += Math.sin(n.phase) * dt * 2; n.z += Math.cos(n.phase * .7) * dt * 2; n.mesh.position.set(n.x, .95, n.z); } }
function completeStep(type) { const m = missions[missionIndex]; if (!m || (type && m.type !== type)) return; m.count++; if (m.count >= m.target) { player.cash += m.reward; player.xp += m.xp; missionIndex = Math.min(missionIndex + 1, missions.length - 1); showReward(`Mission complete: ${m.name}`); } }

function updateHud(t) {
  player.level = 1 + Math.floor(player.xp / 250);
  const m = missions[missionIndex]; hud.cash.textContent = `$${player.cash}`; hud.xp.textContent = player.xp; hud.level.textContent = player.level; hud.wanted.textContent = player.wanted;
  hud.vehicle.textContent = activeVehicle ? 'Neon car' : 'On foot'; hud.hp.textContent = activeVehicle ? Math.round(activeVehicle.hp) : player.hp; hud.gas.textContent = activeVehicle ? Math.round(activeVehicle.gas) : '—';
  hud.mission.textContent = m ? `${m.name} ${m.count}/${m.target}` : 'Done'; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.length; hud.pos.textContent = `${player.x.toFixed(0)},${player.y.toFixed(0)},${player.z.toFixed(0)}`; hud.activeVehicle.textContent = activeVehicle ? 'Yes' : 'No';
  const online = window.NeonBlockCloud?.isConfigured ? 'cloud ready' : 'local save'; hud.online.textContent = online; hud.onlineDebug.textContent = online;
  fpsFrames++; if (t - fpsTick > 500) { hud.fps.textContent = Math.round(fpsFrames * 1000 / (t - fpsTick)); fpsTick = t; fpsFrames = 0; }
  if (t - lastAutoSave > 15000) { saveGame('slot1', true); lastAutoSave = t; }
}
function drawMinimap() { miniCtx.clearRect(0, 0, 160, 160); miniCtx.fillStyle = '#07101f'; miniCtx.fillRect(0, 0, 160, 160); miniCtx.strokeStyle = '#17f3ff55'; for (let i = 0; i < 160; i += 24) { miniCtx.beginPath(); miniCtx.moveTo(i, 0); miniCtx.lineTo(i, 160); miniCtx.moveTo(0, i); miniCtx.lineTo(160, i); miniCtx.stroke(); } miniCtx.fillStyle = '#5ef38c'; miniCtx.fillRect(77, 77, 6, 6); for (const v of vehicles) dot(v.x, v.z, '#ff3366'); for (const p of pickups) if (!p.taken) dot(p.x, p.z, '#ffd166'); }
function dot(x, z, color) { const dx = (x - player.x) / 5 + 80, dz = (z - player.z) / 5 + 80; if (dx > 0 && dx < 160 && dz > 0 && dz < 160) { miniCtx.fillStyle = color; miniCtx.fillRect(dx, dz, 3, 3); } }
function showReward(msg) { reward.textContent = msg; reward.classList.remove('hidden'); clearTimeout(showReward.t); showReward.t = setTimeout(() => reward.classList.add('hidden'), 1400); }
function togglePause(force) { $('pause-overlay').classList.toggle('hidden', force === undefined ? undefined : !force); }
function showSavePanel() { $('save-panel').classList.remove('hidden'); }

function snapshot() { return { player, missionIndex, missions: missions.map(m => ({ count: m.count })), pickups: pickups.map(p => p.taken), properties: properties.map(p => p.owned), vehicles: vehicles.map(v => ({ x: v.x, z: v.z, gas: v.gas, hp: v.hp, owned: v.owned })) }; }
function restore(s) { if (!s?.player) return; Object.assign(player, s.player); missionIndex = s.missionIndex || 0; s.missions?.forEach((m, i) => { if (missions[i]) missions[i].count = m.count || 0; }); s.pickups?.forEach((taken, i) => { if (pickups[i]) { pickups[i].taken = taken; pickups[i].mesh.visible = !taken; } }); s.properties?.forEach((owned, i) => { if (properties[i]) properties[i].owned = owned; }); s.vehicles?.forEach((sv, i) => { if (vehicles[i]) Object.assign(vehicles[i], sv); }); }
async function saveGame(slot = 'slot1', silent = false) { localStorage.setItem(`${SAVE_KEY}-${slot}`, JSON.stringify(snapshot())); hud.slot.textContent = slot; try { await window.NeonBlockCloud?.save?.(slot, snapshot()); } catch (e) { hud.lastError.textContent = e.message; } if (!silent) showReward(`Saved ${slot}`); }
async function loadGame(slot = 'slot1', silent = false) { let raw = localStorage.getItem(`${SAVE_KEY}-${slot}`); try { const cloud = await window.NeonBlockCloud?.load?.(slot); if (cloud) raw = JSON.stringify(cloud); } catch (e) { hud.lastError.textContent = e.message; } if (raw) restore(JSON.parse(raw)); hud.slot.textContent = slot; if (!silent) showReward(`Loaded ${slot}`); }
function exportSave() { $('export-json').value = JSON.stringify(snapshot(), null, 2); }
function importSave() { try { restore(JSON.parse($('export-json').value)); saveGame('slot1', true); showReward('Imported save'); } catch (e) { hud.lastError.textContent = e.message; showReward('Invalid JSON'); } }

try { init(); } catch (e) { console.error(e); hud.lastError.textContent = e.message; loading.querySelector('.loading-sub').textContent = e.message; }
