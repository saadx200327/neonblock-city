(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const mini = minimapCanvas.getContext('2d');
  const hud = id => document.getElementById(id);

  const state = {
    cash: 350,
    xp: 0,
    level: 1,
    wanted: 0,
    online: false,
    paused: false,
    slot: 'slot1',
    lastError: 'none',
    player: { x: 0, y: 0, vx: 0, vy: 0, size: 18, speed: 210, sprint: false, color: '#17f3ff' },
    camera: { x: 0, y: 0, zoom: 1 },
    activeVehicle: null,
    ownedLots: new Set(),
    completedMissions: new Set(),
    chunks: new Map(),
    npcs: [],
    crates: [],
    vehicles: [],
    lots: [],
    keys: new Set(),
    joystick: { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 },
    mission: null,
    perf: { fps: 0, frames: 0, acc: 0 },
    lastSave: 0
  };

  const missions = [
    { id: 'crate-run', title: 'Crate Run', text: 'Collect 3 neon crates.', type: 'crate', goal: 3, reward: 250, xp: 90 },
    { id: 'taxi-hop', title: 'Taxi Hop', text: 'Drive through 4 checkpoints.', type: 'drive', goal: 4, reward: 400, xp: 130 },
    { id: 'lot-owner', title: 'Block Owner', text: 'Buy one city lot.', type: 'own', goal: 1, reward: 150, xp: 75 }
  ];

  const input = { x: 0, y: 0, interact: false, jump: false, unstuck: false };
  const world = { chunkSize: 640, radius: 2, road: 86 };
  let ctx, last = performance.now();

  function boot() {
    ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return fail('2D canvas unavailable');
    bindControls();
    bindMenus();
    resize();
    window.addEventListener('resize', resize, { passive: true });
    loadLocal(state.slot);
    setMission(missions.find(m => !state.completedMissions.has(m.id)) || missions[0]);
    loading?.classList.add('hidden');
    requestAnimationFrame(tick);
  }

  function fail(message) {
    state.lastError = message;
    if (loading) loading.querySelector('.loading-sub').textContent = message;
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * ratio);
    canvas.height = Math.floor(innerHeight * ratio);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function bindControls() {
    addEventListener('keydown', e => {
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyE','Space','Escape','KeyR'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyE') input.interact = true;
      if (e.code === 'Space') input.jump = true;
      if (e.code === 'KeyR') input.unstuck = true;
      state.keys.add(e.code);
    });
    addEventListener('keyup', e => state.keys.delete(e.code));

    const joy = hud('joystick-container');
    const stick = hud('joystick-stick');
    joy?.addEventListener('pointerdown', e => {
      state.joystick.active = true; state.joystick.id = e.pointerId;
      joy.setPointerCapture(e.pointerId); moveJoy(e);
    });
    joy?.addEventListener('pointermove', e => state.joystick.active && moveJoy(e));
    joy?.addEventListener('pointerup', clearJoy);
    joy?.addEventListener('pointercancel', clearJoy);

    function moveJoy(e) {
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const max = r.width * 0.36;
      const dx = Math.max(-max, Math.min(max, e.clientX - cx));
      const dy = Math.max(-max, Math.min(max, e.clientY - cy));
      state.joystick.dx = dx / max; state.joystick.dy = dy / max;
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    function clearJoy() {
      state.joystick.active = false; state.joystick.dx = 0; state.joystick.dy = 0;
      if (stick) stick.style.transform = 'translate(0, 0)';
    }

    holdButton('btn-mobile-sprint', v => state.player.sprint = v);
    tapButton('btn-mobile-jump', () => input.jump = true);
    tapButton('btn-mobile-interact', () => input.interact = true);
    tapButton('btn-mobile-unstuck', () => input.unstuck = true);
    tapButton('btn-mobile-pause', togglePause);
  }

  function holdButton(id, fn) {
    const el = hud(id); if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); fn(true); });
    el.addEventListener('pointerup', () => fn(false));
    el.addEventListener('pointercancel', () => fn(false));
  }
  function tapButton(id, fn) { hud(id)?.addEventListener('click', e => { e.preventDefault(); fn(); }); }

  function bindMenus() {
    tapButton('btn-resume', togglePause);
    tapButton('btn-settings', () => hud('settings-panel')?.classList.toggle('hidden'));
    tapButton('btn-close-settings', () => hud('settings-panel')?.classList.add('hidden'));
    tapButton('btn-save', () => hud('save-panel')?.classList.toggle('hidden'));
    tapButton('btn-load', () => hud('save-panel')?.classList.toggle('hidden'));
    tapButton('btn-close-save', () => hud('save-panel')?.classList.add('hidden'));
    document.querySelectorAll('.btn-save-slot').forEach(b => b.addEventListener('click', () => saveLocal(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach(b => b.addEventListener('click', () => loadLocal(b.dataset.slot)));
    tapButton('btn-export', () => hud('export-json').value = JSON.stringify(serialize(), null, 2));
    tapButton('btn-import', () => { try { applySave(JSON.parse(hud('export-json').value)); popup('Save imported'); } catch { popup('Invalid save JSON', true); } });
  }

  function togglePause() {
    state.paused = !state.paused;
    hud('pause-overlay')?.classList.toggle('hidden', !state.paused);
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016); last = now;
    if (!state.paused) update(dt, now);
    draw(); updateHud(dt);
    requestAnimationFrame(tick);
  }

  function update(dt, now) {
    readInput();
    streamWorld();
    movePlayer(dt);
    updateNpcs(dt);
    if (input.interact) interact();
    if (input.unstuck) unstuck();
    input.interact = input.jump = input.unstuck = false;
    if (now - state.lastSave > 15000) { saveLocal(state.slot, true); state.lastSave = now; }
    state.camera.x += (state.player.x - state.camera.x) * 0.12;
    state.camera.y += (state.player.y - state.camera.y) * 0.12;
  }

  function readInput() {
    const left = state.keys.has('KeyA') || state.keys.has('ArrowLeft');
    const right = state.keys.has('KeyD') || state.keys.has('ArrowRight');
    const up = state.keys.has('KeyW') || state.keys.has('ArrowUp');
    const down = state.keys.has('KeyS') || state.keys.has('ArrowDown');
    input.x = (right ? 1 : 0) - (left ? 1 : 0) + state.joystick.dx;
    input.y = (down ? 1 : 0) - (up ? 1 : 0) + state.joystick.dy;
    const len = Math.hypot(input.x, input.y);
    if (len > 1) { input.x /= len; input.y /= len; }
    state.player.sprint = state.player.sprint || state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
  }

  function movePlayer(dt) {
    const v = state.activeVehicle || state.player;
    const speed = state.activeVehicle ? state.activeVehicle.speed : state.player.speed * (state.player.sprint ? 1.55 : 1);
    v.x += input.x * speed * dt;
    v.y += input.y * speed * dt;
    if (state.activeVehicle) {
      state.player.x = v.x; state.player.y = v.y;
      v.gas = Math.max(0, v.gas - Math.hypot(input.x, input.y) * dt * 2.4);
      if (v.gas <= 0) state.activeVehicle = null;
      progressMission('drive', Math.hypot(input.x, input.y) > 0.2 ? dt : 0);
    }
  }

  function streamWorld() {
    const cx = Math.floor(state.player.x / world.chunkSize);
    const cy = Math.floor(state.player.y / world.chunkSize);
    for (let y = cy - world.radius; y <= cy + world.radius; y++) {
      for (let x = cx - world.radius; x <= cx + world.radius; x++) ensureChunk(x, y);
    }
    for (const [key, chunk] of state.chunks) {
      if (Math.abs(chunk.x - cx) > world.radius + 1 || Math.abs(chunk.y - cy) > world.radius + 1) state.chunks.delete(key);
    }
    state.crates = [...state.chunks.values()].flatMap(c => c.crates).filter(c => !c.used);
    state.vehicles = [...state.chunks.values()].flatMap(c => c.vehicles);
    state.lots = [...state.chunks.values()].flatMap(c => c.lots);
    state.npcs = [...state.chunks.values()].flatMap(c => c.npcs);
  }

  function ensureChunk(x, y) {
    const key = `${x},${y}`; if (state.chunks.has(key)) return;
    const rand = mulberry(hash(key));
    const ox = x * world.chunkSize, oy = y * world.chunkSize;
    const chunk = { x, y, buildings: [], crates: [], vehicles: [], lots: [], npcs: [] };
    for (let i = 0; i < 10; i++) chunk.buildings.push({ x: ox + rand()*world.chunkSize, y: oy + rand()*world.chunkSize, w: 60+rand()*100, h: 60+rand()*120, neon: rand() > .5 ? '#ff3df2' : '#17f3ff' });
    for (let i = 0; i < 3; i++) chunk.crates.push({ x: ox + rand()*world.chunkSize, y: oy + rand()*world.chunkSize, r: 12, used: false });
    for (let i = 0; i < 2; i++) chunk.vehicles.push({ x: ox + rand()*world.chunkSize, y: oy + rand()*world.chunkSize, w: 38, h: 22, speed: 330+rand()*80, hp: 100, gas: 100, name: rand()>.5?'Neon Kart':'Block Coupe' });
    chunk.lots.push({ id: key, x: ox + 80, y: oy + 80, w: 96, h: 96, price: 500 + Math.abs(x+y)*90 });
    for (let i = 0; i < 4; i++) chunk.npcs.push({ x: ox + rand()*world.chunkSize, y: oy + rand()*world.chunkSize, a: rand()*6.28, speed: 25+rand()*35 });
    state.chunks.set(key, chunk);
  }

  function updateNpcs(dt) {
    for (const n of state.npcs) {
      n.a += (Math.random() - .5) * dt;
      n.x += Math.cos(n.a) * n.speed * dt;
      n.y += Math.sin(n.a) * n.speed * dt;
    }
  }

  function interact() {
    const nearVehicle = nearest(state.vehicles, 54);
    if (state.activeVehicle) { state.activeVehicle = null; popup('Exited vehicle'); return; }
    if (nearVehicle) { state.activeVehicle = nearVehicle; popup(`Entered ${nearVehicle.name}`); return; }
    const crate = nearest(state.crates, 42);
    if (crate) { crate.used = true; state.cash += 75; state.xp += 20; progressMission('crate', 1); popup('+$75 crate'); return; }
    const lot = nearest(state.lots, 70);
    if (lot) {
      if (state.ownedLots.has(lot.id)) return popup('You own this block');
      if (state.cash < lot.price) return popup(`Need $${lot.price}`, true);
      state.cash -= lot.price; state.ownedLots.add(lot.id); progressMission('own', 1); popup('Block purchased'); return;
    }
  }

  function nearest(list, dist) {
    let best = null, bd = dist;
    for (const item of list) { const d = Math.hypot(item.x - state.player.x, item.y - state.player.y); if (d < bd) { bd = d; best = item; } }
    return best;
  }

  function progressMission(type, amount) {
    if (!state.mission || state.mission.type !== type) return;
    state.mission.progress = Math.min(state.mission.goal, (state.mission.progress || 0) + (type === 'drive' ? amount * 0.8 : amount));
    if (state.mission.progress >= state.mission.goal) {
      state.cash += state.mission.reward; state.xp += state.mission.xp; state.completedMissions.add(state.mission.id);
      popup(`Mission complete: ${state.mission.title}`);
      setMission(missions.find(m => !state.completedMissions.has(m.id)) || missions[0]);
    }
  }

  function setMission(m) { state.mission = { ...m, progress: 0 }; }
  function unstuck() { state.player.x = Math.round(state.player.x / world.chunkSize) * world.chunkSize; state.player.y = Math.round(state.player.y / world.chunkSize) * world.chunkSize; state.activeVehicle = null; popup('Unstuck'); }

  function draw() {
    ctx.clearRect(0,0,innerWidth,innerHeight);
    ctx.fillStyle = '#070a18'; ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.save(); ctx.translate(innerWidth/2 - state.camera.x, innerHeight/2 - state.camera.y);
    drawGrid();
    for (const c of state.chunks.values()) drawChunk(c);
    drawPlayer(); ctx.restore(); drawMinimap();
  }

  function drawGrid() {
    ctx.strokeStyle = '#16204a'; ctx.lineWidth = 2;
    const startX = Math.floor((state.camera.x - innerWidth/2) / 160) * 160;
    const endX = state.camera.x + innerWidth/2;
    const startY = Math.floor((state.camera.y - innerHeight/2) / 160) * 160;
    const endY = state.camera.y + innerHeight/2;
    for (let x = startX; x < endX; x += 160) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for (let y = startY; y < endY; y += 160) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
  }

  function drawChunk(c) {
    for (const b of c.buildings) { ctx.fillStyle = '#101735'; ctx.fillRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h); ctx.strokeStyle = b.neon; ctx.strokeRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h); }
    for (const l of c.lots) { ctx.strokeStyle = state.ownedLots.has(l.id) ? '#5ef38c' : '#ffd166'; ctx.strokeRect(l.x-l.w/2,l.y-l.h/2,l.w,l.h); }
    for (const crate of c.crates) if (!crate.used) { ctx.fillStyle = '#ff3df2'; ctx.fillRect(crate.x-10, crate.y-10, 20, 20); }
    for (const v of c.vehicles) { ctx.fillStyle = v === state.activeVehicle ? '#5ef38c' : '#ffd166'; ctx.fillRect(v.x-v.w/2, v.y-v.h/2, v.w, v.h); }
    for (const n of c.npcs) { ctx.fillStyle = '#f7f9ff'; ctx.beginPath(); ctx.arc(n.x,n.y,8,0,7); ctx.fill(); }
  }

  function drawPlayer() {
    ctx.fillStyle = state.activeVehicle ? '#5ef38c' : state.player.color;
    ctx.beginPath(); ctx.arc(state.player.x, state.player.y, state.player.size, 0, Math.PI*2); ctx.fill();
  }

  function drawMinimap() {
    mini.clearRect(0,0,160,160); mini.fillStyle = '#050814'; mini.fillRect(0,0,160,160);
    mini.strokeStyle = '#16204a'; for (let i=0;i<160;i+=20){ mini.beginPath(); mini.moveTo(i,0); mini.lineTo(i,160); mini.moveTo(0,i); mini.lineTo(160,i); mini.stroke(); }
    const plot = (x,y,color,size=3) => { mini.fillStyle=color; mini.fillRect(80+(x-state.player.x)/24-size/2,80+(y-state.player.y)/24-size/2,size,size); };
    state.crates.slice(0,30).forEach(c=>plot(c.x,c.y,'#ff3df2'));
    state.vehicles.slice(0,20).forEach(v=>plot(v.x,v.y,'#ffd166'));
    state.lots.slice(0,20).forEach(l=>plot(l.x,l.y,state.ownedLots.has(l.id)?'#5ef38c':'#888'));
    plot(state.player.x,state.player.y,'#17f3ff',6);
  }

  function updateHud(dt) {
    state.level = Math.max(1, 1 + Math.floor(state.xp / 180));
    state.perf.frames++; state.perf.acc += dt;
    if (state.perf.acc > .5) { state.perf.fps = Math.round(state.perf.frames / state.perf.acc); state.perf.frames = 0; state.perf.acc = 0; }
    setText('hud-cash', '$' + state.cash); setText('hud-xp', Math.floor(state.xp)); setText('hud-level', state.level); setText('hud-wanted', state.wanted);
    setText('hud-online', state.online ? 'cloud-ready' : 'offline'); setText('hud-vehicle', state.activeVehicle?.name || 'On foot'); setText('hud-vehicle-hp', Math.round(state.activeVehicle?.hp ?? 100)); setText('hud-vehicle-gas', Math.round(state.activeVehicle?.gas ?? 100));
    setText('hud-mission', state.mission ? `${state.mission.title} ${Math.floor(state.mission.progress||0)}/${state.mission.goal}` : 'None');
    setText('debug-fps', state.perf.fps); setText('debug-pos', `${Math.round(state.player.x)},${Math.round(state.player.y)}`); setText('debug-chunks', state.chunks.size); setText('debug-npcs', state.npcs.length); setText('debug-active-vehicle', state.activeVehicle?.name || 'None'); setText('debug-save-slot', state.slot); setText('debug-online', state.online ? 'yes' : 'no'); setText('debug-last-error', state.lastError);
  }
  function setText(id, value) { const el = hud(id); if (el) el.textContent = value; }

  function serialize() { return { cash: state.cash, xp: state.xp, level: state.level, wanted: state.wanted, player: state.player, ownedLots: [...state.ownedLots], completedMissions: [...state.completedMissions] }; }
  function applySave(data) { if (!data) return; state.cash=data.cash??state.cash; state.xp=data.xp??state.xp; state.wanted=data.wanted??0; Object.assign(state.player, data.player||{}); state.ownedLots=new Set(data.ownedLots||[]); state.completedMissions=new Set(data.completedMissions||[]); }
  function saveLocal(slot='slot1', silent=false) { state.slot = slot; localStorage.setItem('neonblock:'+slot, JSON.stringify(serialize())); if (!silent) popup('Saved '+slot); window.NeonBlockCloud?.save?.(slot, serialize()).then(()=>state.online=true).catch(()=>state.online=false); }
  function loadLocal(slot='slot1') { state.slot = slot; const raw = localStorage.getItem('neonblock:'+slot); if (raw) { try { applySave(JSON.parse(raw)); popup('Loaded '+slot); } catch { state.lastError='save parse failed'; } } }
  function popup(text, bad=false) { const el = hud('reward-popup'); if (!el) return; el.textContent=text; el.style.color = bad ? '#ff3366' : '#5ef38c'; el.classList.remove('hidden'); clearTimeout(popup.t); popup.t=setTimeout(()=>el.classList.add('hidden'),1600); }
  function hash(str){let h=2166136261; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0;}
  function mulberry(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}

  addEventListener('error', e => { state.lastError = e.message || 'runtime error'; });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
