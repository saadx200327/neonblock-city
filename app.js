/* NeonBlock City - static browser game runtime */
(function(){
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: byId('hud-cash'), xp: byId('hud-xp'), level: byId('hud-level'), wanted: byId('hud-wanted'), online: byId('hud-online'),
    vehicle: byId('hud-vehicle'), hp: byId('hud-vehicle-hp'), gas: byId('hud-vehicle-gas'), mission: byId('hud-mission'),
    fps: byId('debug-fps'), pos: byId('debug-pos'), chunks: byId('debug-chunks'), npcs: byId('debug-npcs'), activeVehicle: byId('debug-active-vehicle'), slot: byId('debug-save-slot'), debugOnline: byId('debug-online'), lastError: byId('debug-last-error')
  };
  const minimap = byId('minimap-canvas');
  const miniCtx = minimap ? minimap.getContext('2d') : null;
  const popup = byId('reward-popup');
  const debugOverlay = byId('debug-overlay');
  const pauseOverlay = byId('pause-overlay');
  const savePanel = byId('save-panel');
  const settingsPanel = byId('settings-panel');
  const missionBoard = byId('mission-board');
  const missionList = byId('mission-list');
  const exportJson = byId('export-json');

  if (!canvas || !window.THREE) {
    setError('Missing canvas or Three.js');
    return;
  }

  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen() ? 1.35 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !isSmallScreen();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 55, 180);

  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 500);
  const hemi = new THREE.HemisphereLight(0x9defff, 0x0a1028, 1.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(20, 40, 15);
  sun.castShadow = renderer.shadowMap.enabled;
  scene.add(sun);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x10162f, roughness: 0.88, metalness: 0.05 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x15192b, roughness: 0.9 });
  const playerMat = new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x083344, roughness: 0.55 });
  const npcMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x331900 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x12381f });
  const lotMat = new THREE.MeshStandardMaterial({ color: 0x3b2b73, emissive: 0x10072a });
  const ownedLotMat = new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x043044 });
  const vehicleMat = new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x29020b });

  const player = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), playerMat);
  player.position.set(0, 0.9, 0);
  player.castShadow = true;
  scene.add(player);

  const state = {
    cash: 100, xp: 0, level: 1, wanted: 0, health: 100,
    pos: {x:0,y:0,z:0}, velocityY: 0, grounded: true, yaw: 0,
    inVehicle: false, vehicleId: null, vehicleGas: 100, vehicleHp: 100,
    activeMission: null, missionProgress: {}, ownedLots: [], collectedCrates: [],
    saveSlot: 'slot1', graphics: localStorage.getItem('nbc_graphics') || 'auto', lastCloud: 'offline'
  };

  const keys = new Set();
  const chunks = new Map();
  const crates = new Map();
  const lots = new Map();
  const vehicles = new Map();
  const npcs = new Map();
  const interactables = [];
  let last = performance.now();
  let fpsTimer = 0, frames = 0, autosaveTimer = 0, popupTimer = 0;
  let paused = false;
  let debugVisible = false;
  let lookDrag = null;
  const joystick = { active:false, id:null, x:0, y:0, dx:0, dy:0 };

  const missions = [
    { id:'crate-run', title:'Crate Run', text:'Collect 5 glowing crates around downtown.', rewardCash:350, rewardXp:60, target:5 },
    { id:'lot-owner', title:'First Property', text:'Buy one neon lot.', rewardCash:200, rewardXp:80, target:1 },
    { id:'ride-test', title:'Ride Test', text:'Enter a vehicle and drive 250m.', rewardCash:300, rewardXp:70, target:250 }
  ];

  initUi();
  hydrate();
  streamWorld(true);
  requestAnimationFrame(loop);
  setTimeout(() => loading && loading.classList.add('hidden'), 350);

  function loop(now){
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    if (!paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt){
    updateControls(dt);
    updateMission(dt);
    streamWorld(false);
    updateHud(dt);
    autosaveTimer += dt;
    if (autosaveTimer > 18) { autosaveTimer = 0; saveLocal(false); }
    if (popupTimer > 0) { popupTimer -= dt; if (popupTimer <= 0 && popup) popup.classList.add('hidden'); }
  }

  function updateControls(dt){
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || byId('btn-mobile-sprint')?.classList.contains('pressed');
    const speed = state.inVehicle ? (sprint ? 23 : 16) : (sprint ? 9 : 5.2);
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    mx += joystick.dx; mz += joystick.dy;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    if (keys.has('KeyQ')) state.yaw += dt * 2.3;
    if (keys.has('KeyE')) state.yaw -= dt * 2.3;

    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    const dx = (mx * cos - mz * sin) * speed * dt;
    const dz = (mz * cos + mx * sin) * speed * dt;
    player.position.x += dx;
    player.position.z += dz;

    if (state.inVehicle && (Math.abs(dx)+Math.abs(dz)>0.001)) {
      state.vehicleGas = Math.max(0, state.vehicleGas - dt * 2.1);
      const p = progressFor('ride-test');
      setProgress('ride-test', p + Math.hypot(dx,dz));
      if (state.vehicleGas <= 0) state.inVehicle = false;
    }

    state.velocityY -= 22 * dt;
    player.position.y += state.velocityY * dt;
    if (player.position.y <= 0.9) { player.position.y = 0.9; state.velocityY = 0; state.grounded = true; }

    if (len > 0.05) player.rotation.y = Math.atan2(dx, dz);
    state.pos.x = player.position.x; state.pos.y = player.position.y; state.pos.z = player.position.z;
  }

  function jump(){ if (state.grounded && !state.inVehicle) { state.velocityY = 9; state.grounded = false; } }

  function interact(){
    const near = nearestInteractable();
    if (!near) { showPopup('Nothing close enough. Walk to crates, cars, lots, or NPCs.'); return; }
    if (near.type === 'crate') collectCrate(near.id);
    if (near.type === 'lot') buyLot(near.id);
    if (near.type === 'vehicle') toggleVehicle(near.id);
    if (near.type === 'npc') showPopup('NPC: Try missions, buy lots, and use vehicles to cross the city faster.');
  }

  function nearestInteractable(){
    let best = null, bestD = 4.3;
    for (const it of interactables) {
      if (!it.mesh || !it.mesh.parent) continue;
      const d = player.position.distanceTo(it.mesh.position);
      if (d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  function collectCrate(id){
    if (state.collectedCrates.includes(id)) return;
    const item = crates.get(id);
    state.collectedCrates.push(id);
    state.cash += 45; state.xp += 12;
    setProgress('crate-run', progressFor('crate-run') + 1);
    if (item) item.visible = false;
    levelCheck(); saveLocal(false); showPopup('+ $45 crate collected');
  }

  function buyLot(id){
    if (state.ownedLots.includes(id)) { showPopup('You already own this lot.'); return; }
    const price = 250;
    if (state.cash < price) { showPopup('Need $250 to buy this lot.'); return; }
    state.cash -= price; state.ownedLots.push(id);
    const lot = lots.get(id); if (lot) lot.material = ownedLotMat;
    setProgress('lot-owner', state.ownedLots.length);
    saveLocal(false); showPopup('Lot purchased. Ownership saved.');
  }

  function toggleVehicle(id){
    if (state.inVehicle && state.vehicleId === id) { state.inVehicle = false; state.vehicleId = null; showPopup('Exited vehicle'); return; }
    state.inVehicle = true; state.vehicleId = id; state.vehicleGas = Math.max(state.vehicleGas, 20); showPopup('Vehicle entered. WASD to drive.');
  }

  function updateMission(){
    const m = missions.find(x => x.id === state.activeMission);
    if (!m) return;
    const p = progressFor(m.id);
    if (p >= m.target && !state.missionProgress[m.id]?.complete) {
      state.missionProgress[m.id] = { value:m.target, complete:true };
      state.cash += m.rewardCash; state.xp += m.rewardXp;
      levelCheck(); saveLocal(false); showPopup(`Mission complete: ${m.title} +$${m.rewardCash}`);
    }
  }

  function levelCheck(){
    const next = Math.floor(state.xp / 100) + 1;
    if (next > state.level) { state.level = next; showPopup(`Level ${state.level} reached`); }
  }
  function progressFor(id){ return state.missionProgress[id]?.value || 0; }
  function setProgress(id, value){ state.missionProgress[id] = Object.assign({}, state.missionProgress[id], { value }); }

  function streamWorld(force){
    const size = 48;
    const radius = isSmallScreen() ? 2 : 3;
    const cx = Math.floor(player.position.x / size);
    const cz = Math.floor(player.position.z / size);
    const needed = new Set();
    for (let x = cx - radius; x <= cx + radius; x++) for (let z = cz - radius; z <= cz + radius; z++) {
      const key = `${x},${z}`; needed.add(key); if (!chunks.has(key)) makeChunk(x,z,size);
    }
    for (const [key, group] of chunks) if (!needed.has(key)) unloadChunk(key, group);
  }

  function makeChunk(cx, cz, size){
    const group = new THREE.Group(); group.userData.items = [];
    const gx = cx * size, gz = cz * size;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), groundMat);
    ground.position.set(gx + size/2, -0.1, gz + size/2); ground.receiveShadow = true; group.add(ground);
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(size, 0.03, 5), roadMat); road1.position.set(gx+size/2, 0.02, gz+size/2); group.add(road1);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.03, size), roadMat); road2.position.set(gx+size/2, 0.025, gz+size/2); group.add(road2);
    const seed = hash(cx,cz);
    for (let i=0;i<5;i++) {
      const h = 4 + ((seed+i*7)%18);
      const b = new THREE.Mesh(new THREE.BoxGeometry(5+(i%3)*2,h,5+((i+1)%3)*2), new THREE.MeshStandardMaterial({ color: 0x1b2452, emissive: i%2?0x07091d:0x071f25, roughness:.8 }));
      b.position.set(gx + 8 + ((seed+i*11)%34), h/2, gz + 7 + ((seed+i*17)%34));
      group.add(b);
    }
    addCrate(group, `crate-${cx}-${cz}`, gx + 10 + seed%25, gz + 12 + (seed*3)%25);
    if ((seed % 3) === 0) addVehicle(group, `car-${cx}-${cz}`, gx+size/2+8, gz+size/2-7);
    if ((seed % 4) === 0) addLot(group, `lot-${cx}-${cz}`, gx+size/2-13, gz+size/2+12);
    if ((seed % 5) === 0) addNpc(group, `npc-${cx}-${cz}`, gx+size/2-4, gz+size/2-10);
    scene.add(group); chunks.set(`${cx},${cz}`, group);
  }

  function unloadChunk(key, group){
    scene.remove(group);
    for (const id of group.userData.items || []) { crates.delete(id); lots.delete(id); vehicles.delete(id); npcs.delete(id); }
    for (let i=interactables.length-1;i>=0;i--) if ((group.userData.items||[]).includes(interactables[i].id)) interactables.splice(i,1);
    chunks.delete(key);
  }
  function addCrate(group,id,x,z){
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,1.4), crateMat); m.position.set(x,0.7,z); m.visible = !state.collectedCrates.includes(id); group.add(m); group.userData.items.push(id); crates.set(id,m); interactables.push({type:'crate',id,mesh:m});
  }
  function addLot(group,id,x,z){
    const owned = state.ownedLots.includes(id);
    const m = new THREE.Mesh(new THREE.BoxGeometry(8,0.18,8), owned ? ownedLotMat : lotMat); m.position.set(x,0.08,z); group.add(m); group.userData.items.push(id); lots.set(id,m); interactables.push({type:'lot',id,mesh:m});
  }
  function addVehicle(group,id,x,z){
    const m = new THREE.Mesh(new THREE.BoxGeometry(3.2,1.3,5.1), vehicleMat); m.position.set(x,0.7,z); group.add(m); group.userData.items.push(id); vehicles.set(id,m); interactables.push({type:'vehicle',id,mesh:m});
  }
  function addNpc(group,id,x,z){
    const m = new THREE.Mesh(new THREE.BoxGeometry(1,1.8,1), npcMat); m.position.set(x,0.9,z); group.add(m); group.userData.items.push(id); npcs.set(id,m); interactables.push({type:'npc',id,mesh:m});
  }

  function render(){
    const camDist = state.inVehicle ? 15 : 11;
    camera.position.set(player.position.x + Math.sin(state.yaw)*camDist, player.position.y + 8, player.position.z + Math.cos(state.yaw)*camDist);
    camera.lookAt(player.position.x, player.position.y + 1.1, player.position.z);
    renderer.render(scene, camera);
    drawMinimap();
  }

  function drawMinimap(){
    if (!miniCtx) return;
    miniCtx.clearRect(0,0,160,160);
    miniCtx.fillStyle = '#050814'; miniCtx.fillRect(0,0,160,160);
    miniCtx.strokeStyle = '#17f3ff55'; miniCtx.strokeRect(1,1,158,158);
    const scale = 1.1;
    drawDot(80,80,'#17f3ff',5);
    for (const [id,m] of crates) if (m.visible) drawWorldDot(m.position, '#5ef38c', 2, scale);
    for (const [id,m] of lots) drawWorldDot(m.position, state.ownedLots.includes(id) ? '#17f3ff' : '#a77cff', 3, scale);
    for (const [id,m] of vehicles) drawWorldDot(m.position, '#ff3366', 3, scale);
  }
  function drawWorldDot(pos,color,r,scale){ const x=80+(pos.x-player.position.x)*scale, y=80+(pos.z-player.position.z)*scale; if(x>0&&x<160&&y>0&&y<160) drawDot(x,y,color,r); }
  function drawDot(x,y,color,r){ miniCtx.fillStyle=color; miniCtx.beginPath(); miniCtx.arc(x,y,r,0,Math.PI*2); miniCtx.fill(); }

  function updateHud(dt){
    frames++; fpsTimer += dt;
    if (fpsTimer > 0.5) { if(hud.fps) hud.fps.textContent = Math.round(frames/fpsTimer); frames=0; fpsTimer=0; }
    setText(hud.cash, `$${Math.floor(state.cash)}`); setText(hud.xp, Math.floor(state.xp)); setText(hud.level, state.level); setText(hud.wanted, state.wanted);
    setText(hud.online, state.lastCloud); setText(hud.debugOnline, state.lastCloud);
    setText(hud.vehicle, state.inVehicle ? 'Neon car' : 'On foot'); setText(hud.hp, Math.round(state.vehicleHp)); setText(hud.gas, Math.round(state.vehicleGas));
    const m = missions.find(x => x.id === state.activeMission); setText(hud.mission, m ? `${m.title} ${Math.floor(progressFor(m.id))}/${m.target}` : 'None');
    setText(hud.pos, `${player.position.x.toFixed(1)},${player.position.y.toFixed(1)},${player.position.z.toFixed(1)}`); setText(hud.chunks, chunks.size); setText(hud.npcs, npcs.size); setText(hud.activeVehicle, state.vehicleId || 'None'); setText(hud.slot, state.saveSlot);
  }

  function initUi(){
    window.addEventListener('keydown', e => { keys.add(e.code); if(e.code==='Space') jump(); if(e.code==='KeyF') interact(); if(e.code==='Escape') togglePause(); if(e.code==='F3') toggleDebug(); if(e.code==='KeyM') openMissions(); });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(false); });
    bind('btn-resume', 'click', () => togglePause(false)); bind('btn-mobile-pause','click',()=>togglePause()); bind('btn-settings','click',()=>settingsPanel?.classList.toggle('hidden'));
    bind('btn-close-settings','click',()=>settingsPanel?.classList.add('hidden')); bind('btn-save','click',()=>savePanel?.classList.toggle('hidden')); bind('btn-load','click',()=>savePanel?.classList.toggle('hidden'));
    bind('btn-close-save','click',()=>savePanel?.classList.add('hidden')); bind('btn-export','click',exportSave); bind('btn-import','click',importSave);
    bind('btn-mobile-jump','click',jump); bind('btn-mobile-interact','click',interact); bind('btn-mobile-unstuck','click',unstuck);
    bind('graphics-quality','change',e=>{state.graphics=e.target.value; localStorage.setItem('nbc_graphics',state.graphics); applyGraphics();});
    document.querySelectorAll('.btn-save-slot').forEach(b=>b.addEventListener('click',()=>{state.saveSlot=b.dataset.slot||'slot1'; saveLocal(true);}));
    document.querySelectorAll('.btn-load-slot').forEach(b=>b.addEventListener('click',()=>{state.saveSlot=b.dataset.slot||'slot1'; hydrate(); showPopup('Save loaded');}));
    setupJoystick(); setupLook(); buildMissionBoard(); if (debugOverlay) debugOverlay.style.display = 'none';
  }
  function buildMissionBoard(){
    if (!missionList) return; missionList.innerHTML='';
    missions.forEach(m=>{ const li=document.createElement('li'); const btn=document.createElement('button'); btn.textContent=`${m.title}: ${m.text}`; btn.onclick=()=>{state.activeMission=m.id; missionBoard?.classList.add('hidden'); showPopup(`Mission started: ${m.title}`);}; li.appendChild(btn); missionList.appendChild(li); });
    bind('btn-close-missions','click',()=>missionBoard?.classList.add('hidden'));
  }
  function openMissions(){ missionBoard?.classList.toggle('hidden'); pauseOverlay?.classList.remove('hidden'); paused = true; }
  function togglePause(force){ paused = typeof force === 'boolean' ? !force : !paused; pauseOverlay?.classList.toggle('hidden', !paused); }
  function toggleDebug(){ debugVisible=!debugVisible; if(debugOverlay) debugOverlay.style.display=debugVisible?'block':'none'; }
  function unstuck(){ player.position.set(0,0.9,0); state.velocityY=0; showPopup('Returned to spawn'); }
  function setupJoystick(){
    const box=byId('joystick-container'), stick=byId('joystick-stick'); if(!box||!stick) return;
    box.addEventListener('pointerdown',e=>{joystick.active=true;joystick.id=e.pointerId;box.setPointerCapture(e.pointerId);moveJoy(e);});
    box.addEventListener('pointermove',e=>{if(joystick.active&&e.pointerId===joystick.id)moveJoy(e);});
    box.addEventListener('pointerup',resetJoy); box.addEventListener('pointercancel',resetJoy);
    function moveJoy(e){const r=box.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const d=Math.hypot(dx,dy),max=42;if(d>max){dx=dx/d*max;dy=dy/d*max;}joystick.dx=dx/max;joystick.dy=dy/max;stick.style.transform=`translate(${dx}px,${dy}px)`;}
    function resetJoy(){joystick.active=false;joystick.dx=0;joystick.dy=0;stick.style.transform='translate(0,0)';}
  }
  function setupLook(){
    canvas.addEventListener('pointerdown',e=>{ if(e.clientX < innerWidth*0.45) return; lookDrag={id:e.pointerId,x:e.clientX}; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove',e=>{ if(!lookDrag||lookDrag.id!==e.pointerId) return; const dx=e.clientX-lookDrag.x; lookDrag.x=e.clientX; state.yaw -= dx*0.006; });
    canvas.addEventListener('pointerup',()=>lookDrag=null); canvas.addEventListener('pointercancel',()=>lookDrag=null);
  }

  async function saveLocal(loud){
    const payload = snapshot(); localStorage.setItem(`nbc_${state.saveSlot}`, JSON.stringify(payload));
    if (window.NeonBlockCloud?.save) { try { await window.NeonBlockCloud.save(state.saveSlot,payload); state.lastCloud='cloud saved'; } catch(e){ state.lastCloud='local only'; setError(e.message || 'cloud save failed'); } }
    if (loud) showPopup('Game saved');
  }
  function hydrate(){
    try { const raw=localStorage.getItem(`nbc_${state.saveSlot}`); if(raw) applySave(JSON.parse(raw)); } catch(e){ setError('Load failed: '+e.message); }
  }
  function snapshot(){ return { version:2, savedAt:new Date().toISOString(), cash:state.cash,xp:state.xp,level:state.level,wanted:state.wanted,pos:{x:player.position.x,y:player.position.y,z:player.position.z},yaw:state.yaw,vehicleGas:state.vehicleGas,vehicleHp:state.vehicleHp,activeMission:state.activeMission,missionProgress:state.missionProgress,ownedLots:state.ownedLots,collectedCrates:state.collectedCrates }; }
  function applySave(s){ Object.assign(state, { cash:s.cash??state.cash, xp:s.xp??0, level:s.level??1, wanted:s.wanted??0, yaw:s.yaw??0, vehicleGas:s.vehicleGas??100, vehicleHp:s.vehicleHp??100, activeMission:s.activeMission??null, missionProgress:s.missionProgress||{}, ownedLots:s.ownedLots||[], collectedCrates:s.collectedCrates||[] }); if(s.pos) player.position.set(s.pos.x||0,0.9,s.pos.z||0); }
  function exportSave(){ if(exportJson) exportJson.value = JSON.stringify(snapshot(), null, 2); }
  function importSave(){ try{ if(!exportJson?.value) return; applySave(JSON.parse(exportJson.value)); saveLocal(true); streamWorld(true); }catch(e){ showPopup('Import failed'); setError(e.message); } }

  function applyGraphics(){ const low = state.graphics === 'low' || (state.graphics === 'auto' && isSmallScreen()); renderer.setPixelRatio(Math.min(devicePixelRatio||1, low ? 1.1 : 1.75)); scene.fog.far = low ? 130 : 180; }
  function resize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); applyGraphics(); }
  function showPopup(text){ if(!popup) return; popup.textContent=text; popup.classList.remove('hidden'); popupTimer=2.8; }
  function setError(text){ setText(hud.lastError,text); console.warn('[NeonBlock]', text); }
  function setText(el,text){ if(el) el.textContent = text; }
  function bind(id,ev,fn){ const el=byId(id); if(el) el.addEventListener(ev,fn); }
  function byId(id){ return document.getElementById(id); }
  function isSmallScreen(){ return Math.min(innerWidth, innerHeight) < 760; }
  function hash(x,z){ let n=(x*73856093)^(z*19349663); return Math.abs(n%9973); }
})();
