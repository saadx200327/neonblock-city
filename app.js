(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const minimap = $('minimap-canvas');
  const mini = minimap.getContext('2d');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'), slot: $('debug-save-slot'), onlineDbg: $('debug-online'), err: $('debug-last-error'),
    reward: $('reward-popup'), pause: $('pause-overlay'), settings: $('settings-panel'), missions: $('mission-board'), missionList: $('mission-list'), savePanel: $('save-panel'), exportJson: $('export-json')
  };

  const THREE = window.THREE;
  if (!THREE) {
    document.body.innerHTML = '<main class="fatal"><h1>NeonBlock City</h1><p>Three.js failed to load. Check internet or vendor Three.js locally.</p></main>';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07101f);
  scene.fog = new THREE.Fog(0x07101f, 70, 220);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 520);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);

  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(30, 70, 20); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8bd7ff, 0x19112a, 1.4));

  const mats = {
    road: new THREE.MeshLambertMaterial({ color: 0x12182b }), grass: new THREE.MeshLambertMaterial({ color: 0x0b3b35 }), player: new THREE.MeshLambertMaterial({ color: 0x18f2ff }),
    coin: new THREE.MeshLambertMaterial({ color: 0xffd25a }), car: new THREE.MeshLambertMaterial({ color: 0xff3d78 }), owned: new THREE.MeshLambertMaterial({ color: 0x34ff93 }), npc: new THREE.MeshLambertMaterial({ color: 0xffa654 }), marker: new THREE.MeshLambertMaterial({ color: 0x8d6bff })
  };

  const ground = new THREE.Mesh(new THREE.BoxGeometry(520, 1, 520), mats.grass); ground.position.y = -0.55; scene.add(ground);
  const player = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), mats.player); player.position.set(0, 2, 0); scene.add(player);
  const marker = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.5, 8), mats.marker); marker.position.set(10, 3, 10); scene.add(marker);

  const state = {
    cash: 0, xp: 0, level: 1, wanted: 0, x: 0, z: 0, y: 2, vy: 0, angle: 0, sprint: false, paused: false,
    activeVehicle: null, owned: {}, completed: {}, slot: 'slot1', chunkRadius: 1, quality: 'auto', lastSave: 0
  };
  const input = { f: 0, r: 0, jump: false, interact: false };
  const world = { chunks: new Map(), npcs: [], vehicles: [], pickups: [], properties: [] };
  const missions = [
    { id:'coins', title:'Collect 8 neon coins', reward:150, xp:60, target:{x:38,z:-24}, done:()=>world.pickups.filter(p=>!p.userData.taken).length <= 10 },
    { id:'drive', title:'Find a hover car and drive to the tower', reward:260, xp:95, target:{x:-70,z:45}, done:()=>state.activeVehicle && dist2D(player.position,{x:-70,z:45}) < 12 },
    { id:'own', title:'Buy one glowing property', reward:400, xp:120, target:{x:52,z:52}, done:()=>Object.keys(state.owned).length > 0 }
  ];
  let mission = missions.find(m => !state.completed[m.id]) || null;

  function dist2D(a,b){ const dx=(a.x||0)-(b.x||0), dz=(a.z||0)-(b.z||0); return Math.hypot(dx,dz); }
  function showReward(text){ hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(showReward.t); showReward.t = setTimeout(()=>hud.reward.classList.add('hidden'), 1800); }
  function addCash(n,xp=0){ state.cash += n; state.xp += xp; state.level = 1 + Math.floor(state.xp / 180); }
  function safe(fn){ try { fn(); } catch(e) { hud.err.textContent = e.message; console.warn(e); } }

  function makeBuilding(x,z,w,d,h, owned=false){ const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), owned ? mats.owned : new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL((x*z%100)/100,0.45,0.28) })); m.position.set(x,h/2,z); scene.add(m); return m; }
  function addRoad(x,z,w,d){ const r = new THREE.Mesh(new THREE.BoxGeometry(w,0.08,d), mats.road); r.position.set(x,0.02,z); scene.add(r); return r; }
  function spawnChunk(cx,cz){
    const key = `${cx},${cz}`; if (world.chunks.has(key)) return;
    const group = new THREE.Group(); group.userData.key = key; scene.add(group); world.chunks.set(key, group);
    const baseX=cx*48, baseZ=cz*48;
    group.add(addRoad(baseX,baseZ,48,8)); group.add(addRoad(baseX,baseZ,8,48));
    for(let i=0;i<4;i++){ const x=baseX+((i%2)?14:-14)+(Math.random()*6-3), z=baseZ+(i<2?14:-14)+(Math.random()*6-3); const b=makeBuilding(x,z,8+Math.random()*8,8+Math.random()*8,8+Math.random()*24); group.add(b); }
    if ((cx+cz)%2===0) addPickup(baseX+12,baseZ-15);
    if ((cx-cz)%3===0) addVehicle(baseX-12,baseZ+10);
    if ((cx+cz)%4===0) addProperty(baseX+18,baseZ+18, 500 + Math.abs(cx*cz)*75);
    if ((cx*cz)%3===0) addNpc(baseX-18,baseZ-12);
  }
  function trimChunks(){
    const pcx=Math.round(player.position.x/48), pcz=Math.round(player.position.z/48);
    for(let x=pcx-state.chunkRadius;x<=pcx+state.chunkRadius;x++) for(let z=pcz-state.chunkRadius;z<=pcz+state.chunkRadius;z++) spawnChunk(x,z);
    for(const [key,g] of world.chunks){ const [x,z]=key.split(',').map(Number); if(Math.abs(x-pcx)>state.chunkRadius+1 || Math.abs(z-pcz)>state.chunkRadius+1){ scene.remove(g); world.chunks.delete(key); } }
  }
  function addPickup(x,z){ const p=new THREE.Mesh(new THREE.IcosahedronGeometry(1.1,0),mats.coin); p.position.set(x,1.4,z); p.userData={taken:false}; scene.add(p); world.pickups.push(p); }
  function addVehicle(x,z){ const car=new THREE.Group(); const body=new THREE.Mesh(new THREE.BoxGeometry(5,1.4,8),mats.car); body.position.y=1; car.add(body); car.position.set(x,0,z); scene.add(car); car.userData={gas:100,hp:100,speed:0}; world.vehicles.push(car); }
  function addProperty(x,z,price){ const pr=makeBuilding(x,z,12,12,10,true); pr.userData={price,id:`${Math.round(x)},${Math.round(z)}`}; world.properties.push(pr); }
  function addNpc(x,z){ const n=new THREE.Mesh(new THREE.BoxGeometry(1.5,3,1.5),mats.npc); n.position.set(x,1.5,z); n.userData={home:{x,z},t:Math.random()*9}; scene.add(n); world.npcs.push(n); }

  function setMission(m){ mission = m; if(m) marker.position.set(m.target.x, 3, m.target.z); renderMissionBoard(); }
  function renderMissionBoard(){ if(!hud.missionList) return; hud.missionList.innerHTML = missions.map(m => `<li><button data-mission="${m.id}">${state.completed[m.id]?'Done: ':''}${m.title}</button></li>`).join(''); hud.missionList.querySelectorAll('button').forEach(b => b.onclick = () => setMission(missions.find(m=>m.id===b.dataset.mission))); }

  function save(slot=state.slot){
    const data = { cash:state.cash,xp:state.xp,level:state.level,wanted:state.wanted,x:player.position.x,z:player.position.z,owned:state.owned,completed:state.completed,quality:state.quality,ts:Date.now() };
    localStorage.setItem(`neonblock:${slot}`, JSON.stringify(data));
    window.NeonBlockCloud?.save?.(slot,data).catch?.(()=>{});
    showReward('Game saved'); state.lastSave = Date.now();
  }
  async function load(slot=state.slot){
    let data=null; try { data = await window.NeonBlockCloud?.load?.(slot); } catch{}
    data = data || JSON.parse(localStorage.getItem(`neonblock:${slot}`) || 'null');
    if(!data) return showReward('No save found');
    Object.assign(state, data); player.position.set(data.x||0,2,data.z||0); state.owned=data.owned||{}; state.completed=data.completed||{}; setMission(missions.find(m=>!state.completed[m.id]) || missions[0]); showReward('Game loaded');
  }

  function interact(){
    const nearCar = world.vehicles.find(v => dist2D(player.position,v.position)<6);
    if(nearCar){ state.activeVehicle = state.activeVehicle ? null : nearCar; showReward(state.activeVehicle?'Vehicle entered':'Vehicle exited'); return; }
    const nearProp = world.properties.find(p => dist2D(player.position,p.position)<9);
    if(nearProp){ const id=nearProp.userData.id, price=nearProp.userData.price; if(state.owned[id]) return showReward('Already owned'); if(state.cash>=price){ state.cash-=price; state.owned[id]=true; addCash(0,40); showReward(`Property bought -$${price}`); } else showReward(`Need $${price}`); }
  }

  function update(dt){
    if(state.paused) return;
    const speed = (state.activeVehicle ? 22 : 10) * (state.sprint ? 1.55 : 1);
    const dx = input.r * speed * dt, dz = input.f * speed * dt;
    if(input.f || input.r) state.angle = Math.atan2(dx,dz);
    const target = state.activeVehicle || player;
    target.position.x += dx; target.position.z += dz;
    if(state.activeVehicle){ player.position.copy(state.activeVehicle.position).add(new THREE.Vector3(0,2.2,0)); state.activeVehicle.userData.gas = Math.max(0, state.activeVehicle.userData.gas - Math.abs(input.f+input.r)*dt*2); if(state.activeVehicle.userData.gas<=0) state.activeVehicle=null; }
    state.vy -= 30*dt; if(input.jump && player.position.y<=2.05){ state.vy=12; input.jump=false; } player.position.y=Math.max(2,player.position.y+state.vy*dt); if(player.position.y===2) state.vy=0;
    player.rotation.y = state.angle;
    camera.position.lerp(new THREE.Vector3(player.position.x-22*Math.sin(state.angle), 18, player.position.z-22*Math.cos(state.angle)), 0.12);
    camera.lookAt(player.position.x, player.position.y+2, player.position.z);
    world.pickups.forEach(p=>{ if(!p.userData.taken){ p.rotation.y+=dt*2; if(dist2D(player.position,p.position)<3){ p.userData.taken=true; p.visible=false; addCash(25,10); showReward('+$25 neon coin'); } }});
    world.npcs.forEach(n=>{ n.userData.t+=dt; n.position.x=n.userData.home.x+Math.sin(n.userData.t)*5; n.position.z=n.userData.home.z+Math.cos(n.userData.t*0.7)*5; });
    if(input.interact){ input.interact=false; interact(); }
    if(mission && !state.completed[mission.id] && mission.done()){ state.completed[mission.id]=true; addCash(mission.reward, mission.xp); showReward(`Mission complete +$${mission.reward}`); setMission(missions.find(m=>!state.completed[m.id]) || mission); }
    trimChunks(); updateHud(); drawMini(); if(Date.now()-state.lastSave>45000) save(state.slot);
  }

  function updateHud(){
    hud.cash.textContent = `$${state.cash}`; hud.xp.textContent=state.xp; hud.level.textContent=state.level; hud.wanted.textContent=state.wanted;
    hud.vehicle.textContent = state.activeVehicle?'Hover car':'On foot'; hud.hp.textContent=state.activeVehicle?Math.round(state.activeVehicle.userData.hp):100; hud.gas.textContent=state.activeVehicle?Math.round(state.activeVehicle.userData.gas):100;
    hud.mission.textContent = mission ? mission.title : 'None'; hud.pos.textContent = `${player.position.x.toFixed(0)},${player.position.y.toFixed(0)},${player.position.z.toFixed(0)}`;
    hud.chunks.textContent = world.chunks.size; hud.npcs.textContent = world.npcs.length; hud.activeVehicle.textContent = state.activeVehicle?'car':'none'; hud.slot.textContent=state.slot;
    const online = navigator.onLine ? 'online' : 'offline'; hud.online.textContent=online; hud.onlineDbg.textContent=online;
  }
  function drawMini(){ mini.clearRect(0,0,160,160); mini.fillStyle='#07101f'; mini.fillRect(0,0,160,160); mini.strokeStyle='#17f3ff44'; for(let i=0;i<160;i+=24){ mini.beginPath(); mini.moveTo(i,0); mini.lineTo(i,160); mini.moveTo(0,i); mini.lineTo(160,i); mini.stroke(); } const px=80,pz=80; mini.fillStyle='#17f3ff'; mini.fillRect(px-3,pz-3,6,6); if(mission){ mini.fillStyle='#8d6bff'; mini.fillRect(80+(mission.target.x-player.position.x)/3,80+(mission.target.z-player.position.z)/3,5,5); } }

  const keys = new Set();
  addEventListener('keydown', e=>{ keys.add(e.key.toLowerCase()); if(e.key==='Escape') togglePause(); if(e.key.toLowerCase()==='e') input.interact=true; if(e.key===' ') input.jump=true; });
  addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));
  function pollKeys(){ input.f=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0); input.r=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0); state.sprint=keys.has('shift'); }

  function bindButton(id,down,up=()=>{}){ const b=$(id); if(!b) return; ['pointerdown','touchstart'].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();down();},{passive:false})); ['pointerup','pointercancel','touchend'].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();up();},{passive:false})); }
  bindButton('btn-mobile-jump',()=>input.jump=true); bindButton('btn-mobile-sprint',()=>state.sprint=true,()=>state.sprint=false); bindButton('btn-mobile-interact',()=>input.interact=true); bindButton('btn-mobile-unstuck',()=>{player.position.y=2; state.vy=0; if(state.activeVehicle) state.activeVehicle.position.add(new THREE.Vector3(4,0,4));}); bindButton('btn-mobile-pause',()=>togglePause());
  const joy=$('joystick-container'), stick=$('joystick-stick'); let joyOn=false;
  joy?.addEventListener('pointerdown', e=>{ joyOn=true; joy.setPointerCapture(e.pointerId); moveJoy(e); }); joy?.addEventListener('pointermove', e=>joyOn&&moveJoy(e)); joy?.addEventListener('pointerup', resetJoy); joy?.addEventListener('pointercancel', resetJoy);
  function moveJoy(e){ const r=joy.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, dx=e.clientX-cx, dy=e.clientY-cy, len=Math.min(45,Math.hypot(dx,dy)||1); input.r=(dx/45); input.f=(-dy/45); stick.style.transform=`translate(${dx/Math.hypot(dx,dy)*len}px,${dy/Math.hypot(dx,dy)*len}px)`; }
  function resetJoy(){ joyOn=false; input.f=0; input.r=0; stick.style.transform='translate(0,0)'; }

  function togglePause(){ state.paused=!state.paused; hud.pause.classList.toggle('hidden',!state.paused); }
  $('btn-resume')?.addEventListener('click', togglePause); $('btn-settings')?.addEventListener('click',()=>hud.settings.classList.toggle('hidden')); $('btn-close-settings')?.addEventListener('click',()=>hud.settings.classList.add('hidden'));
  $('btn-save')?.addEventListener('click',()=>hud.savePanel.classList.remove('hidden')); $('btn-load')?.addEventListener('click',()=>load()); $('btn-close-save')?.addEventListener('click',()=>hud.savePanel.classList.add('hidden'));
  document.querySelectorAll('.btn-save-slot').forEach(b=>b.onclick=()=>{state.slot=b.dataset.slot;save(state.slot);}); document.querySelectorAll('.btn-load-slot').forEach(b=>b.onclick=()=>{state.slot=b.dataset.slot;load(state.slot);});
  $('btn-export')?.addEventListener('click',()=>{ hud.exportJson.value = localStorage.getItem(`neonblock:${state.slot}`)||''; }); $('btn-import')?.addEventListener('click',()=>{ try{ JSON.parse(hud.exportJson.value); localStorage.setItem(`neonblock:${state.slot}`,hud.exportJson.value); load(state.slot); }catch{ showReward('Invalid JSON'); } });
  $('graphics-quality')?.addEventListener('change',e=>{ state.quality=e.target.value; state.chunkRadius = e.target.value==='high'?2:1; renderer.setPixelRatio(e.target.value==='low'?1:Math.min(devicePixelRatio||1,1.5)); });
  addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

  let last=performance.now(), frames=0, acc=0;
  function loop(now){ const dt=Math.min(0.05,(now-last)/1000); last=now; pollKeys(); safe(()=>update(dt)); renderer.render(scene,camera); frames++; acc+=dt; if(acc>1){ hud.fps.textContent=frames; frames=0; acc=0; } requestAnimationFrame(loop); }
  for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++) spawnChunk(x,z); setMission(missions[0]); loading?.classList.add('hidden'); updateHud(); requestAnimationFrame(loop);
})();
