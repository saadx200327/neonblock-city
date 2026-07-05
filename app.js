/* NeonBlock City playable core. Static-only, no required backend. */
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), vehicleHp: $('hud-vehicle-hp'), vehicleGas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), onlineDbg: $('debug-online'), lastError: $('debug-last-error'), minimap: $('minimap-canvas'), arrow: $('waypoint-arrow')
  };

  if (!window.THREE) {
    reportError('Three.js failed to load. Check connection or vendor the library for offline play.');
    if (loading) loading.querySelector('.loading-sub').textContent = 'Three.js failed to load.';
    return;
  }

  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.Fog(0x050814, 90, 420);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);

  const ambient = new THREE.HemisphereLight(0x7defff, 0x080816, 1.15);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(90, 160, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.82 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x202943, roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x0e392e, roughness: 0.9 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, roughness: 0.35, emissive: 0x06323a }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.55 }),
    pickup: new THREE.MeshStandardMaterial({ color: 0x5ef38c, roughness: 0.25, emissive: 0x0d4a22 }),
    mission: new THREE.MeshStandardMaterial({ color: 0xff5cc8, roughness: 0.25, emissive: 0x4c0830 }),
    garage: new THREE.MeshStandardMaterial({ color: 0x835bff, roughness: 0.45, emissive: 0x1d1248 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.38, emissive: 0x320611 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x30e0a1, roughness: 0.5, emissive: 0x062f22 })
  };

  const state = {
    cash: 125, xp: 0, level: 1, wanted: 0, saveSlot: 'slot1', paused: false,
    pos: new THREE.Vector3(0, 2, 0), vel: new THREE.Vector3(), heading: 0, grounded: false,
    activeVehicle: null, properties: {}, missionsDone: {}, currentMission: null, lastSave: 0,
    graphics: localStorage.getItem('nbc_graphics') || 'auto'
  };

  const input = { keys: new Set(), joyX: 0, joyY: 0, jump: false, sprint: false, interact: false };
  const chunks = new Map();
  const npcs = [];
  const pickups = [];
  const missionPads = [];
  const vehicles = [];
  const properties = [];
  const colliders = [];
  const interactables = [];

  const player = makePlayer();
  scene.add(player.group);

  const missionDefs = [
    { id: 'courier', name: 'Neon Courier', reward: 180, xp: 60, start: new THREE.Vector3(30,0,30), target: new THREE.Vector3(150,0,-110), text: 'Reach the pink delivery beacon.' },
    { id: 'taxi', name: 'Block Taxi', reward: 260, xp: 85, start: new THREE.Vector3(-90,0,70), target: new THREE.Vector3(-180,0,-160), text: 'Enter a vehicle and drive to the dropoff.' },
    { id: 'collector', name: 'Data Chips', reward: 220, xp: 75, start: new THREE.Vector3(80,0,-120), target: null, text: 'Collect 5 glowing chips.' }
  ];

  initStaticWorld();
  bindControls();
  loadGame(state.saveSlot, true);
  setTimeout(() => loading && loading.classList.add('hidden'), 450);
  requestAnimationFrame(loop);

  function makePlayer(){
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.8), mats.player);
    body.castShadow = true; body.position.y = 1.15; group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.9), mats.player);
    head.castShadow = true; head.position.y = 2.65; group.add(head);
    group.position.copy(state.pos);
    return { group, body, radius: 0.75 };
  }

  function initStaticWorld(){
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200,1200), mats.grass);
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

    for (let i=0;i<5;i++) addVehicle(new THREE.Vector3(-60+i*42, 0.35, 20+(i%2)*60), i);
    addMissionPad(missionDefs[0]); addMissionPad(missionDefs[1]); addMissionPad(missionDefs[2]);
    addProperty('Starter Garage', 450, new THREE.Vector3(55,0,95));
    addProperty('Neon Loft', 900, new THREE.Vector3(-135,0,115));
    addProperty('Skyline Plot', 1500, new THREE.Vector3(190,0,150));
    for (let i=0;i<12;i++) addPickup(new THREE.Vector3(rand(-240,240),1,rand(-240,240)));
  }

  function ensureChunks(){
    const size = 90;
    const cx = Math.floor(state.pos.x / size), cz = Math.floor(state.pos.z / size);
    const need = new Set();
    for (let x=cx-2;x<=cx+2;x++) for (let z=cz-2;z<=cz+2;z++) {
      const key = x+','+z; need.add(key); if (!chunks.has(key)) chunks.set(key, createChunk(x,z,size));
    }
    for (const [key, group] of chunks) if (!need.has(key)) { scene.remove(group); disposeGroup(group); chunks.delete(key); }
  }

  function createChunk(cx,cz,size){
    const group = new THREE.Group(); group.userData.colliders = [];
    const ox = cx*size, oz = cz*size;
    const roadW = 14;
    if (cx % 2 === 0) addBox(group, mats.road, [size,0.08,roadW], [ox+size/2,0.02,oz+size/2], false);
    if (cz % 2 === 0) addBox(group, mats.road, [roadW,0.09,size], [ox+size/2,0.03,oz+size/2], false);
    addBox(group, mats.sidewalk, [size,0.06,2.5], [ox+size/2,0.06,oz+9], false);
    addBox(group, mats.sidewalk, [2.5,0.06,size], [ox+9,0.06,oz+size/2], false);

    const seed = Math.abs(cx*928371 + cz*364479);
    const count = 3 + (seed % 4);
    for (let i=0;i<count;i++) {
      const bx = ox + 22 + ((seed+i*29)%45);
      const bz = oz + 20 + ((seed+i*17)%48);
      if (Math.abs((bx%90)-45)<11 || Math.abs((bz%90)-45)<11) continue;
      const h = 9 + ((seed+i*13)%36);
      const color = new THREE.Color().setHSL(((seed+i*41)%360)/360, 0.72, 0.45);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color.clone().multiplyScalar(0.08) });
      const mesh = addBox(group, mat, [12+(i%3)*5,h,12+(i%2)*6], [bx,h/2,bz], true);
      group.userData.colliders.push(mesh);
    }
    if (seed % 3 === 0) addNpc(new THREE.Vector3(ox+rand(15,75),0,oz+rand(15,75)));
    scene.add(group);
    colliders.push(...group.userData.colliders);
    return group;
  }

  function addBox(parent, mat, scale, pos, shadow){
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(scale[0],scale[1],scale[2]), mat);
    mesh.position.set(pos[0],pos[1],pos[2]); mesh.castShadow = !!shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  function addNpc(pos){
    if (npcs.length > 24) return;
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1,1.8,0.75), mats.npc); b.position.y=0.9; b.castShadow=true; g.add(b);
    g.position.copy(pos); g.userData.base = pos.clone(); g.userData.phase = Math.random()*10;
    scene.add(g); npcs.push(g);
  }

  function addPickup(pos){
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), mats.pickup);
    m.position.copy(pos); m.castShadow = true; scene.add(m); pickups.push(m); interactables.push({type:'pickup', object:m});
  }

  function addMissionPad(def){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2.8,2.8,0.25,24), mats.mission);
    m.position.copy(def.start); m.position.y=0.13; scene.add(m);
    missionPads.push({ def, object:m }); interactables.push({type:'mission', object:m, def});
  }

  function addVehicle(pos, index){
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2,1.25,7), index%2?mats.garage:mats.car); body.position.y=1; body.castShadow=true; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.3,1,3.1), mats.sidewalk); cab.position.set(0,2,0.5); cab.castShadow=true; g.add(cab);
    g.position.copy(pos); g.userData = { type:'vehicle', hp:100, gas:100, speed:0, name:index%2?'Neon Van':'Pulse Car' };
    scene.add(g); vehicles.push(g); interactables.push({type:'vehicle', object:g});
  }

  function addProperty(name, price, pos){
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(13,6,13), mats.garage); base.position.y=3; base.castShadow=true; g.add(base);
    g.position.copy(pos); g.userData = { type:'property', name, price };
    scene.add(g); properties.push(g); interactables.push({type:'property', object:g});
  }

  function bindControls(){
    addEventListener('keydown', (e)=>{ input.keys.add(e.code); if(e.code==='Escape') togglePause(); if(e.code==='KeyE') interact(); if(e.code==='KeyR') unstuck(); });
    addEventListener('keyup', (e)=> input.keys.delete(e.code));
    addEventListener('resize', onResize);
    $('btn-mobile-jump')?.addEventListener('pointerdown',()=>input.jump=true);
    $('btn-mobile-jump')?.addEventListener('pointerup',()=>input.jump=false);
    $('btn-mobile-sprint')?.addEventListener('pointerdown',()=>input.sprint=true);
    $('btn-mobile-sprint')?.addEventListener('pointerup',()=>input.sprint=false);
    $('btn-mobile-interact')?.addEventListener('click', interact);
    $('btn-mobile-unstuck')?.addEventListener('click', unstuck);
    $('btn-mobile-pause')?.addEventListener('click', togglePause);
    $('btn-resume')?.addEventListener('click', togglePause);
    $('btn-save')?.addEventListener('click',()=>showPanel('save-panel'));
    $('btn-load')?.addEventListener('click',()=>showPanel('save-panel'));
    $('btn-settings')?.addEventListener('click',()=>showPanel('settings-panel'));
    $('btn-close-settings')?.addEventListener('click',()=>hidePanel('settings-panel'));
    $('btn-close-save')?.addEventListener('click',()=>hidePanel('save-panel'));
    $('graphics-quality') && ($('graphics-quality').value = state.graphics);
    $('graphics-quality')?.addEventListener('change',(e)=>{ state.graphics=e.target.value; localStorage.setItem('nbc_graphics', state.graphics); applyGraphics(); });
    document.querySelectorAll('.btn-save-slot').forEach(b=>b.addEventListener('click',()=>saveGame(b.dataset.slot)));
    document.querySelectorAll('.btn-load-slot').forEach(b=>b.addEventListener('click',()=>loadGame(b.dataset.slot)));
    $('btn-export')?.addEventListener('click',()=>{ $('export-json').value = JSON.stringify(snapshot(), null, 2); });
    $('btn-import')?.addEventListener('click',()=>{ try { restore(JSON.parse($('export-json').value)); popup('Imported save'); } catch(e){ reportError('Import failed: '+e.message); } });
    bindJoystick(); applyGraphics();
  }

  function bindJoystick(){
    const zone = $('joystick-container'), stick = $('joystick-stick'); if(!zone||!stick) return;
    let active = false, rect = null;
    function move(e){ if(!active) return; const p=e.touches?e.touches[0]:e; const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2; const dx=p.clientX-cx, dy=p.clientY-cy; const max=44; const len=Math.max(1, Math.hypot(dx,dy)); const cl=Math.min(max,len); input.joyX=(dx/len)*(cl/max); input.joyY=(dy/len)*(cl/max); stick.style.transform=`translate(${input.joyX*44}px,${input.joyY*44}px)`; e.preventDefault(); }
    function end(){ active=false; input.joyX=0; input.joyY=0; stick.style.transform='translate(0,0)'; }
    zone.addEventListener('pointerdown',(e)=>{ active=true; rect=zone.getBoundingClientRect(); zone.setPointerCapture(e.pointerId); move(e); });
    zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  function loop(){
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.paused) { ensureChunks(); updatePlayer(dt); updateNpcs(dt); updatePickups(dt); updateMission(dt); updateCamera(dt); updateHud(dt); autosave(); }
    renderer.render(scene,camera); requestAnimationFrame(loop);
  }

  function updatePlayer(dt){
    let x = (input.keys.has('KeyD')||input.keys.has('ArrowRight')?1:0) - (input.keys.has('KeyA')||input.keys.has('ArrowLeft')?1:0) + input.joyX;
    let z = (input.keys.has('KeyS')||input.keys.has('ArrowDown')?1:0) - (input.keys.has('KeyW')||input.keys.has('ArrowUp')?1:0) + input.joyY;
    const len = Math.hypot(x,z); if (len>1) { x/=len; z/=len; }
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || input.sprint;
    if (state.activeVehicle) updateVehicle(dt,x,z,sprint); else updateOnFoot(dt,x,z,sprint);
    state.pos.copy(player.group.position);
  }

  function updateOnFoot(dt,x,z,sprint){
    const speed = sprint ? 18 : 10;
    const next = player.group.position.clone(); next.x += x*speed*dt; next.z += z*speed*dt;
    if (x||z) player.group.rotation.y = Math.atan2(x,z);
    if (!hitsBuilding(next, player.radius)) player.group.position.copy(next);
    state.vel.y -= 28*dt; if ((input.keys.has('Space')||input.jump) && state.grounded) { state.vel.y = 11; state.grounded=false; }
    player.group.position.y += state.vel.y*dt;
    if (player.group.position.y <= 0) { player.group.position.y=0; state.vel.y=0; state.grounded=true; }
  }

  function updateVehicle(dt,x,z,sprint){
    const v = state.activeVehicle;
    const max = sprint ? 46 : 34;
    v.userData.speed += (-z*max - v.userData.speed) * Math.min(1, dt*2.5);
    v.rotation.y -= x * dt * (v.userData.speed>=0?1:-1) * 1.8;
    const forward = new THREE.Vector3(Math.sin(v.rotation.y),0,Math.cos(v.rotation.y));
    const next = v.position.clone().addScaledVector(forward, v.userData.speed*dt);
    if (!hitsBuilding(next, 2.8)) v.position.copy(next); else { v.userData.speed *= -0.25; v.userData.hp = Math.max(0, v.userData.hp-12*dt); }
    v.userData.gas = Math.max(0, v.userData.gas - Math.abs(v.userData.speed)*dt*0.018);
    if (v.userData.gas <= 0) v.userData.speed *= 0.96;
    player.group.position.copy(v.position).add(new THREE.Vector3(0,1.6,0));
    player.group.rotation.y = v.rotation.y;
  }

  function hitsBuilding(pos, radius){
    for (const c of colliders) {
      if (!c.parent) continue;
      const box = new THREE.Box3().setFromObject(c).expandByScalar(radius);
      if (box.containsPoint(new THREE.Vector3(pos.x, Math.max(1,pos.y), pos.z))) return true;
    }
    return false;
  }

  function updateNpcs(dt){
    for (const n of npcs) {
      const t = performance.now()*0.001 + n.userData.phase;
      n.position.x = n.userData.base.x + Math.sin(t)*8;
      n.position.z = n.userData.base.z + Math.cos(t*0.8)*8;
      n.rotation.y = t;
    }
  }

  function updatePickups(dt){
    for (let i=pickups.length-1;i>=0;i--) {
      const p = pickups[i]; p.rotation.y += dt*2; p.position.y = 1.2 + Math.sin(performance.now()*0.004+i)*0.25;
      if (p.position.distanceTo(player.group.position) < 2.2) { scene.remove(p); pickups.splice(i,1); state.cash += 25; state.xp += 8; popup('+$25 data chip'); levelCheck(); }
    }
  }

  function interact(){
    const near = nearestInteractable(6); if (!near) { popup('Nothing nearby'); return; }
    if (near.type === 'vehicle') {
      if (state.activeVehicle === near.object) { state.activeVehicle = null; player.group.position.add(new THREE.Vector3(3,0,0)); popup('Exited vehicle'); }
      else { state.activeVehicle = near.object; popup('Entered '+near.object.userData.name); }
    }
    if (near.type === 'mission') startMission(near.def);
    if (near.type === 'property') buyProperty(near.object);
  }

  function nearestInteractable(dist){
    let best=null, bd=dist;
    for (const it of interactables) { if (!it.object.parent) continue; const d = it.object.position.distanceTo(player.group.position); if (d<bd) { best=it; bd=d; } }
    return best;
  }

  function startMission(def){
    state.currentMission = { id:def.id, target:def.target ? def.target.toArray() : null, chips: def.id==='collector'?5:0, started: Date.now() };
    popup(def.name+': '+def.text);
  }

  function updateMission(){
    const m = state.currentMission; if (!m) return;
    const def = missionDefs.find(d=>d.id===m.id); if (!def) return;
    if (m.id === 'collector') { if (pickups.length <= 7) finishMission(def); return; }
    const target = new THREE.Vector3().fromArray(m.target);
    if (player.group.position.distanceTo(target) < (state.activeVehicle?9:5)) finishMission(def);
  }

  function finishMission(def){
    state.cash += def.reward; state.xp += def.xp; state.missionsDone[def.id] = (state.missionsDone[def.id]||0)+1; state.currentMission=null; levelCheck(); popup('Mission complete: +$'+def.reward+' +'+def.xp+' XP');
  }

  function buyProperty(obj){
    const id = obj.userData.name;
    if (state.properties[id]) { popup(id+' already owned'); return; }
    if (state.cash < obj.userData.price) { popup('Need $'+obj.userData.price); return; }
    state.cash -= obj.userData.price; state.properties[id]=true; obj.children[0].material = mats.owned; popup('Bought '+id); saveGame(state.saveSlot, true);
  }

  function levelCheck(){
    const next = Math.floor(state.xp/120)+1; if (next>state.level) { state.level=next; popup('Level '+next+' reached'); }
  }

  function updateCamera(dt){
    const target = player.group.position.clone();
    const back = new THREE.Vector3(Math.sin(player.group.rotation.y),0,Math.cos(player.group.rotation.y));
    const desired = target.clone().addScaledVector(back, -18).add(new THREE.Vector3(0, state.activeVehicle?11:8, 0));
    camera.position.lerp(desired, 1-Math.pow(0.001,dt)); camera.lookAt(target.x, target.y+2, target.z);
  }

  let fpsAcc=0, fpsFrames=0, fpsLast=0;
  function updateHud(dt){
    fpsAcc += dt; fpsFrames++; if (fpsAcc>0.5) { fpsLast=Math.round(fpsFrames/fpsAcc); fpsAcc=0; fpsFrames=0; }
    hud.cash.textContent = '$'+Math.floor(state.cash); hud.xp.textContent = Math.floor(state.xp); hud.level.textContent = state.level; hud.wanted.textContent = state.wanted;
    hud.vehicle.textContent = state.activeVehicle ? state.activeVehicle.userData.name : 'On foot'; hud.vehicleHp.textContent = state.activeVehicle ? Math.round(state.activeVehicle.userData.hp) : 100; hud.vehicleGas.textContent = state.activeVehicle ? Math.round(state.activeVehicle.userData.gas) : 100;
    hud.mission.textContent = state.currentMission ? missionDefs.find(d=>d.id===state.currentMission.id).name : 'None'; hud.fps.textContent = fpsLast; hud.pos.textContent = `${state.pos.x.toFixed(0)},${state.pos.y.toFixed(0)},${state.pos.z.toFixed(0)}`; hud.chunks.textContent = chunks.size; hud.npcs.textContent = npcs.length; hud.activeVehicle.textContent = state.activeVehicle ? state.activeVehicle.userData.name : 'None'; hud.saveSlot.textContent = state.saveSlot;
    const online = window.NeonBlockCloud?.enabled ? 'cloud-ready' : 'local'; hud.online.textContent = online; hud.onlineDbg.textContent = online;
    drawMinimap(); updateArrow();
  }

  function drawMinimap(){
    const c = hud.minimap, ctx = c && c.getContext('2d'); if(!ctx) return;
    ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='#07101d'; ctx.fillRect(0,0,c.width,c.height); ctx.strokeStyle='#17f3ff55'; ctx.strokeRect(1,1,c.width-2,c.height-2);
    const scale=0.28, cx=c.width/2, cy=c.height/2;
    ctx.fillStyle='#888'; vehicles.forEach(v=>dot(ctx,cx+(v.position.x-state.pos.x)*scale,cy+(v.position.z-state.pos.z)*scale,3));
    ctx.fillStyle='#5ef38c'; pickups.forEach(p=>dot(ctx,cx+(p.position.x-state.pos.x)*scale,cy+(p.position.z-state.pos.z)*scale,2));
    ctx.fillStyle='#ff5cc8'; missionPads.forEach(p=>dot(ctx,cx+(p.object.position.x-state.pos.x)*scale,cy+(p.object.position.z-state.pos.z)*scale,4));
    ctx.fillStyle='#17f3ff'; dot(ctx,cx,cy,5);
  }
  function dot(ctx,x,y,r){ if(x>-5&&x<165&&y>-5&&y<165){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } }

  function updateArrow(){
    if (!hud.arrow) return;
    let target = null;
    if (state.currentMission) { const m=state.currentMission; target = m.target ? new THREE.Vector3().fromArray(m.target) : nearestPickupPos(); }
    if (!target) { hud.arrow.textContent='^'; return; }
    const dx=target.x-state.pos.x, dz=target.z-state.pos.z; const angle = Math.atan2(dx,dz)-player.group.rotation.y; hud.arrow.style.transform = `rotate(${angle}rad)`; hud.arrow.textContent='➤';
  }
  function nearestPickupPos(){ let best=null, bd=Infinity; pickups.forEach(p=>{const d=p.position.distanceTo(player.group.position); if(d<bd){bd=d; best=p.position;}}); return best; }

  function snapshot(){ return { cash:state.cash, xp:state.xp, level:state.level, wanted:state.wanted, pos:player.group.position.toArray(), properties:state.properties, missionsDone:state.missionsDone, currentMission:state.currentMission, savedAt:new Date().toISOString() }; }
  function restore(s){ if(!s) return; Object.assign(state, { cash:s.cash??state.cash, xp:s.xp??state.xp, level:s.level??state.level, wanted:s.wanted??0, properties:s.properties||{}, missionsDone:s.missionsDone||{}, currentMission:s.currentMission||null }); if (Array.isArray(s.pos)) player.group.position.fromArray(s.pos); properties.forEach(p=>{ if(state.properties[p.userData.name]) p.children[0].material=mats.owned; }); }
  async function saveGame(slot, quiet){ state.saveSlot=slot||state.saveSlot; const data=snapshot(); localStorage.setItem('nbc_'+state.saveSlot, JSON.stringify(data)); if (window.NeonBlockCloud?.save) await window.NeonBlockCloud.save(state.saveSlot, data).catch(e=>reportError('Cloud save failed: '+e.message)); if(!quiet) popup('Saved '+state.saveSlot); }
  async function loadGame(slot, quiet){ state.saveSlot=slot||state.saveSlot; let raw=localStorage.getItem('nbc_'+state.saveSlot); if (window.NeonBlockCloud?.load) { const cloud = await window.NeonBlockCloud.load(state.saveSlot).catch(()=>null); if (cloud) raw = JSON.stringify(cloud); } if(raw) restore(JSON.parse(raw)); if(!quiet) popup('Loaded '+state.saveSlot); }
  function autosave(){ if (Date.now()-state.lastSave>30000) { state.lastSave=Date.now(); saveGame(state.saveSlot, true); } }

  function togglePause(){ state.paused=!state.paused; $('pause-overlay')?.classList.toggle('hidden', !state.paused); }
  function showPanel(id){ $(id)?.classList.remove('hidden'); }
  function hidePanel(id){ $(id)?.classList.add('hidden'); }
  function unstuck(){ const p=player.group.position; p.y=3; p.x += 8; p.z += 8; if(state.activeVehicle){ state.activeVehicle.position.copy(p); state.activeVehicle.userData.speed=0; } popup('Unstuck'); }
  function popup(msg){ const el=$('reward-popup'); if(!el) return; el.textContent=msg; el.classList.remove('hidden'); clearTimeout(popup.t); popup.t=setTimeout(()=>el.classList.add('hidden'),1800); }
  function reportError(msg){ console.warn(msg); if(hud.lastError) hud.lastError.textContent=msg; }
  function applyGraphics(){ const low = state.graphics==='low' || (state.graphics==='auto' && (navigator.hardwareConcurrency||4)<=4); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, low?1:1.75)); sun.shadow.mapSize.set(low?512:1024, low?512:1024); }
  function onResize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); }
  function disposeGroup(g){ g.traverse(o=>{ if(o.geometry) o.geometry.dispose?.(); if(o.material && !Object.values(mats).includes(o.material)) o.material.dispose?.(); }); }
  function rand(a,b){ return a + Math.random()*(b-a); }
})();
