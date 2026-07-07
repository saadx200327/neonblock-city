/* NeonBlock City - static Roblox-inspired browser game runtime */
(function(){
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading-screen');
  const hud = {
    cash: document.getElementById('hud-cash'), xp: document.getElementById('hud-xp'), level: document.getElementById('hud-level'), wanted: document.getElementById('hud-wanted'),
    online: document.getElementById('hud-online'), vehicle: document.getElementById('hud-vehicle'), hp: document.getElementById('hud-vehicle-hp'), gas: document.getElementById('hud-vehicle-gas'),
    mission: document.getElementById('hud-mission'), fps: document.getElementById('debug-fps'), pos: document.getElementById('debug-pos'), chunks: document.getElementById('debug-chunks'),
    npcs: document.getElementById('debug-npcs'), activeVehicle: document.getElementById('debug-active-vehicle'), saveSlot: document.getElementById('debug-save-slot'), onlineDebug: document.getElementById('debug-online'),
    lastError: document.getElementById('debug-last-error'), arrow: document.getElementById('waypoint-arrow'), popup: document.getElementById('reward-popup')
  };
  const ui = {
    pause: document.getElementById('pause-overlay'), settings: document.getElementById('settings-panel'), savePanel: document.getElementById('save-panel'), missionBoard: document.getElementById('mission-board'),
    missions: document.getElementById('mission-list'), exportJson: document.getElementById('export-json'), graphics: document.getElementById('graphics-quality'), minimap: document.getElementById('minimap-canvas')
  };

  if (!window.THREE) {
    hud.lastError.textContent = 'Three.js failed to load';
    if (loading) loading.querySelector('.loading-sub').textContent = 'Three.js failed to load. Check internet/CDN.';
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.FogExp2(0x050814, 0.018);
  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 950);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0x88aaff, 0x111225, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 20); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
  const grid = new THREE.GridHelper(1200, 120, 0x15e7ff, 0x19234f); grid.position.y = 0.01; scene.add(grid);

  const mats = {
    player: new THREE.MeshStandardMaterial({ color: 0x28f0ff, roughness: .55, metalness: .1 }),
    road: new THREE.MeshStandardMaterial({ color: 0x11182d, roughness: .9 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x092512, roughness: .85 }),
    neonA: new THREE.MeshStandardMaterial({ color: 0x161a39, emissive: 0x1436ff, emissiveIntensity: .45, roughness: .55 }),
    neonB: new THREE.MeshStandardMaterial({ color: 0x251236, emissive: 0xff22aa, emissiveIntensity: .35, roughness: .6 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x553300, emissiveIntensity: .25 }),
    owned: new THREE.MeshStandardMaterial({ color: 0x20ff8a, transparent:true, opacity:.4 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x38d9ff, transparent:true, opacity:.18 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xffef7a, roughness:.6 }),
    car: new THREE.MeshStandardMaterial({ color: 0xff3f7f, roughness:.45, metalness:.25 })
  };

  const state = {
    cash: 150, xp: 0, level: 1, wanted: 0, slot: 'slot1', paused: false, lastSave: 0,
    player: { pos: new THREE.Vector3(0, 1.05, 0), vel: new THREE.Vector3(), yaw: 0, sprint: false, grounded: true },
    activeVehicle: null, ownedLots: {}, crates: {}, completed: {}, activeMission: 'courier', clouds: false
  };

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.35, .65), mats.player); body.castShadow = true; body.position.y = .85; player.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.72,.72,.72), new THREE.MeshStandardMaterial({ color: 0xf5d0a8 })); head.castShadow = true; head.position.y = 1.78; player.add(head);
  scene.add(player);

  const keys = new Set();
  const chunks = new Map();
  const vehicles = [];
  const npcs = [];
  const crates = [];
  const lots = [];
  const chunkSize = 80, streamRadius = 2;
  const clock = new THREE.Clock();
  let frameCount = 0, fpsTimer = 0, fps = 0;

  const missions = {
    courier: { name:'Courier Run', target:new THREE.Vector3(95,0,-60), reward:120, xp:55, text:'Deliver a neon parcel to the blue waypoint.' },
    collector: { name:'Crate Hunter', target:null, reward:90, xp:45, text:'Collect 3 glowing crates around the city.' },
    landlord: { name:'First Property', target:new THREE.Vector3(-85,0,70), reward:180, xp:70, text:'Buy your first city lot.' }
  };
  let collectorCount = 0;

  function saveKey(slot=state.slot){ return 'neonblock-city:'+slot; }
  function persist(slot=state.slot){
    const data = { cash:state.cash,xp:state.xp,level:state.level,wanted:state.wanted,slot, pos:state.player.pos.toArray(), yaw:state.player.yaw, ownedLots:state.ownedLots, crates:state.crates, completed:state.completed, activeMission:state.activeMission };
    localStorage.setItem(saveKey(slot), JSON.stringify(data)); state.lastSave = performance.now();
    if (window.NeonBlockCloudSave && window.NeonBlockCloudSave.save) window.NeonBlockCloudSave.save(data).then(()=>setCloud(true)).catch(e=>err(e));
    toast('Saved '+slot);
  }
  function restore(slot=state.slot){
    const raw = localStorage.getItem(saveKey(slot)); if (!raw) { toast('No local save in '+slot); return; }
    try { const d=JSON.parse(raw); Object.assign(state,{cash:d.cash??150,xp:d.xp??0,level:d.level??1,wanted:d.wanted??0,ownedLots:d.ownedLots||{},crates:d.crates||{},completed:d.completed||{},activeMission:d.activeMission||'courier',slot}); state.player.pos.fromArray(d.pos||[0,1.05,0]); state.player.yaw=d.yaw||0; applyOwnership(); toast('Loaded '+slot); }
    catch(e){ err(e); }
  }
  function exportSave(){ ui.exportJson.value = JSON.stringify({ cash:state.cash,xp:state.xp,level:state.level,wanted:state.wanted,pos:state.player.pos.toArray(),ownedLots:state.ownedLots,crates:state.crates,completed:state.completed,activeMission:state.activeMission }, null, 2); }
  function importSave(){ try { localStorage.setItem(saveKey(), ui.exportJson.value); restore(); } catch(e){ err(e); } }
  function setCloud(ok){ state.clouds=!!ok; hud.online.textContent = ok?'cloud-ready':'offline'; hud.onlineDebug.textContent = hud.online.textContent; }
  function err(e){ hud.lastError.textContent = (e && e.message) ? e.message.slice(0,70) : String(e).slice(0,70); }
  function toast(msg){ hud.popup.textContent = msg; hud.popup.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>hud.popup.classList.add('hidden'),1600); }

  function hash(x,z){ let n = (x*73856093) ^ (z*19349663); n = (n << 13) ^ n; return Math.abs(1 - ((n * (n*n*15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824); }
  function addBox(group, size, pos, mat, cast=false){ const m = new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]), mat); m.position.set(pos[0],pos[1],pos[2]); m.castShadow=cast; m.receiveShadow=true; group.add(m); return m; }
  function makeChunk(cx,cz){
    const id = cx+','+cz; if (chunks.has(id)) return;
    const g = new THREE.Group(); g.userData.id=id; g.position.set(cx*chunkSize,0,cz*chunkSize); scene.add(g); chunks.set(id,g);
    addBox(g,[chunkSize,0.08,chunkSize],[0,0,0],mats.grass);
    addBox(g,[chunkSize,0.1,10],[0,.05,0],mats.road); addBox(g,[10,0.11,chunkSize],[0,.06,0],mats.road);
    for(let i=0;i<7;i++){
      const h=8+Math.floor(hash(cx*7+i,cz*5)*26), x=-32+hash(cx+i,cz)*64, z=-32+hash(cx,cz+i)*64;
      if(Math.abs(x)<9 || Math.abs(z)<9) continue;
      const mat = (i%2)?mats.neonA:mats.neonB; addBox(g,[7+hash(i,cx)*7,h,7+hash(cz,i)*7],[x,h/2,z],mat,true);
    }
    if (Math.abs(cx)+Math.abs(cz) < 6) {
      const cId='c'+id; if(!state.crates[cId]) { const crate=addBox(g,[2,2,2],[28,1.1,-28],mats.crate,true); crate.userData={type:'crate',id:cId,world:new THREE.Vector3(cx*chunkSize+28,1,cz*chunkSize-28)}; crates.push(crate); }
      if ((cx+cz)%2===0) { const npc=addBox(g,[1.2,2.2,1.2],[-25,1.1,22],mats.npc,true); npc.userData={type:'npc',tip:'Tip: buy lots and collect crates for faster XP.'}; npcs.push(npc); }
      if (hash(cx,cz)>.55) { const car=addBox(g,[4,1.2,7],[18,.8,18],mats.car,true); car.userData={type:'vehicle',id:'v'+id,gas:100,hp:100,speed:0}; vehicles.push(car); }
      if (Math.abs(cx)<=1 && Math.abs(cz)<=1) { const lot=addBox(g,[18,.15,18],[-23,.15,-23],mats.lot); lot.userData={type:'lot',id:'l'+id,price:180+Math.abs(cx*cz)*90,world:new THREE.Vector3(cx*chunkSize-23,0,cz*chunkSize-23)}; lots.push(lot); }
    }
  }
  function stream(){
    const cx=Math.floor(state.player.pos.x/chunkSize), cz=Math.floor(state.player.pos.z/chunkSize);
    for(let x=cx-streamRadius;x<=cx+streamRadius;x++) for(let z=cz-streamRadius;z<=cz+streamRadius;z++) makeChunk(x,z);
    for(const [id,g] of chunks){ const [x,z]=id.split(',').map(Number); if(Math.abs(x-cx)>streamRadius+1 || Math.abs(z-cz)>streamRadius+1){ scene.remove(g); chunks.delete(id); } }
  }
  function applyOwnership(){ lots.forEach(l=>{ if(state.ownedLots[l.userData.id]) l.material=mats.owned; }); }

  function inputVector(){
    let x=0,z=0; if(keys.has('KeyW')||keys.has('ArrowUp')) z-=1; if(keys.has('KeyS')||keys.has('ArrowDown')) z+=1; if(keys.has('KeyA')||keys.has('ArrowLeft')) x-=1; if(keys.has('KeyD')||keys.has('ArrowRight')) x+=1;
    x += joy.x; z += joy.y; const len=Math.hypot(x,z)||1; return {x:x/len,z:z/len, active:Math.hypot(x,z)>.08};
  }
  function interact(){
    const p=state.player.pos; let best=null, bd=9;
    [...vehicles,...crates,...lots,...npcs].forEach(o=>{ if(!o.parent) return; const wp=o.userData.world || o.getWorldPosition(new THREE.Vector3()); const d=wp.distanceTo(p); if(d<bd){best=o;bd=d;} });
    if(!best){ toast('Nothing nearby'); return; }
    const t=best.userData.type;
    if(t==='vehicle'){ state.activeVehicle = state.activeVehicle===best ? null : best; toast(state.activeVehicle?'Entered vehicle':'Exited vehicle'); }
    if(t==='crate'){ state.crates[best.userData.id]=true; best.parent.remove(best); state.cash+=35; state.xp+=20; collectorCount++; toast('Crate +$35 +20XP'); if(state.activeMission==='collector' && collectorCount>=3) completeMission('collector'); }
    if(t==='lot'){ const id=best.userData.id, price=best.userData.price; if(state.ownedLots[id]) return toast('Lot already owned'); if(state.cash<price) return toast('Need $'+price); state.cash-=price; state.ownedLots[id]=true; best.material=mats.owned; toast('Lot purchased'); if(state.activeMission==='landlord') completeMission('landlord'); }
    if(t==='npc'){ toast(best.userData.tip); }
  }
  function completeMission(id){ const m=missions[id]; if(!m || state.completed[id]) return; state.cash+=m.reward; state.xp+=m.xp; state.completed[id]=true; toast('Mission complete: '+m.name); state.activeMission = id==='courier'?'collector':id==='collector'?'landlord':'courier'; }
  function updateMission(){ const m=missions[state.activeMission]; if(!m) return; if(state.activeMission==='courier' && state.player.pos.distanceTo(m.target)<8) completeMission('courier'); }
  function levelUp(){ const need=state.level*120; if(state.xp>=need){ state.xp-=need; state.level++; state.cash+=75; toast('Level '+state.level+' bonus +$75'); } }

  function update(dt){
    if(state.paused) return;
    stream(); const iv=inputVector(); const speed=(state.activeVehicle?24:9) * (keys.has('ShiftLeft')||state.player.sprint?1.55:1);
    if(iv.active){ state.player.yaw=Math.atan2(iv.x,iv.z); state.player.pos.x += iv.x*speed*dt; state.player.pos.z += iv.z*speed*dt; }
    state.player.vel.y -= 32*dt; state.player.pos.y += state.player.vel.y*dt; if(state.player.pos.y<1.05){state.player.pos.y=1.05; state.player.vel.y=0; state.player.grounded=true;}
    player.position.copy(state.player.pos); player.rotation.y=state.player.yaw;
    if(state.activeVehicle){ state.activeVehicle.position.x = state.player.pos.x - state.activeVehicle.parent.position.x; state.activeVehicle.position.z = state.player.pos.z - state.activeVehicle.parent.position.z; state.activeVehicle.rotation.y=state.player.yaw; state.activeVehicle.userData.gas=Math.max(0,state.activeVehicle.userData.gas - dt*(iv.active?.9:.05)); }
    const camDist=state.activeVehicle?16:10, camHeight=state.activeVehicle?9:6; const back=new THREE.Vector3(Math.sin(state.player.yaw)*-camDist,camHeight,Math.cos(state.player.yaw)*-camDist); camera.position.lerp(state.player.pos.clone().add(back), .12); camera.lookAt(state.player.pos.x,state.player.pos.y+1.2,state.player.pos.z);
    updateMission(); levelUp(); updateHud(); drawMinimap(); if(performance.now()-state.lastSave>30000) persist(state.slot);
  }
  function updateHud(){
    hud.cash.textContent='$'+Math.floor(state.cash); hud.xp.textContent=Math.floor(state.xp); hud.level.textContent=state.level; hud.wanted.textContent=state.wanted;
    const v=state.activeVehicle; hud.vehicle.textContent=v?'Neon Kart':'On foot'; hud.hp.textContent=v?Math.floor(v.userData.hp):100; hud.gas.textContent=v?Math.floor(v.userData.gas):100;
    hud.mission.textContent=missions[state.activeMission]?.name || 'None'; hud.pos.textContent=state.player.pos.toArray().map(n=>n.toFixed(0)).join(','); hud.chunks.textContent=chunks.size; hud.npcs.textContent=npcs.length; hud.activeVehicle.textContent=v?'Neon Kart':'None'; hud.saveSlot.textContent=state.slot;
    const target=missions[state.activeMission]?.target; if(target){ const angle=Math.atan2(target.x-state.player.pos.x,target.z-state.player.pos.z)-state.player.yaw; hud.arrow.style.transform='rotate('+(-angle)+'rad)'; } else hud.arrow.style.transform='rotate(0rad)';
  }
  function drawMinimap(){ const c=ui.minimap, ctx=c.getContext('2d'), w=c.width,h=c.height; ctx.clearRect(0,0,w,h); ctx.fillStyle='#050814cc'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#17f3ff66'; ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke(); ctx.fillStyle='#28f0ff'; ctx.beginPath(); ctx.arc(w/2,h/2,5,0,Math.PI*2); ctx.fill(); const target=missions[state.activeMission]?.target; if(target){ ctx.fillStyle='#ffcc33'; ctx.beginPath(); ctx.arc(w/2+(target.x-state.player.pos.x)/4,h/2+(target.z-state.player.pos.z)/4,4,0,Math.PI*2); ctx.fill(); } }
  function loop(){ const dt=Math.min(clock.getDelta(),.05); frameCount++; fpsTimer+=dt; if(fpsTimer>=.5){fps=Math.round(frameCount/fpsTimer); frameCount=0; fpsTimer=0; hud.fps.textContent=fps;} update(dt); renderer.render(scene,camera); requestAnimationFrame(loop); }

  function setPaused(v){ state.paused=v; ui.pause.classList.toggle('hidden', !v); }
  function jump(){ if(state.player.grounded){ state.player.vel.y=12; state.player.grounded=false; } }
  const joy={x:0,y:0};
  function setupMobileJoystick(){ const cont=document.getElementById('joystick-container'), stick=document.getElementById('joystick-stick'); let active=false; const reset=()=>{active=false; joy.x=0; joy.y=0; stick.style.transform='translate(0,0)';}; cont.addEventListener('pointerdown',e=>{active=true; cont.setPointerCapture(e.pointerId); move(e);}); cont.addEventListener('pointermove',move); cont.addEventListener('pointerup',reset); cont.addEventListener('pointercancel',reset); function move(e){ if(!active)return; const r=cont.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2), max=42, len=Math.min(max,Math.hypot(dx,dy)||1); joy.x=dx/max; joy.y=dy/max; stick.style.transform=`translate(${dx/Math.hypot(dx,dy)*len}px,${dy/Math.hypot(dx,dy)*len}px)`; } }
  addEventListener('keydown', e=>{ keys.add(e.code); if(e.code==='Space') jump(); if(e.code==='KeyE') interact(); if(e.code==='Escape'||e.code==='KeyP') setPaused(!state.paused); if(e.code==='KeyU'){ state.player.pos.set(0,1.05,0); toast('Unstuck'); } });
  addEventListener('keyup', e=>keys.delete(e.code));
  addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
  document.getElementById('btn-mobile-jump').onclick=jump; document.getElementById('btn-mobile-interact').onclick=interact; document.getElementById('btn-mobile-unstuck').onclick=()=>{state.player.pos.set(0,1.05,0);toast('Unstuck');};
  document.getElementById('btn-mobile-pause').onclick=()=>setPaused(true); document.getElementById('btn-mobile-sprint').onpointerdown=()=>state.player.sprint=true; document.getElementById('btn-mobile-sprint').onpointerup=()=>state.player.sprint=false;
  document.getElementById('btn-resume').onclick=()=>setPaused(false); document.getElementById('btn-settings').onclick=()=>ui.settings.classList.toggle('hidden'); document.getElementById('btn-close-settings').onclick=()=>ui.settings.classList.add('hidden');
  document.getElementById('btn-save').onclick=()=>{ui.savePanel.classList.toggle('hidden');}; document.getElementById('btn-load').onclick=()=>restore(); document.getElementById('btn-close-save').onclick=()=>ui.savePanel.classList.add('hidden');
  document.querySelectorAll('.btn-save-slot').forEach(b=>b.onclick=()=>{state.slot=b.dataset.slot;persist(state.slot);}); document.querySelectorAll('.btn-load-slot').forEach(b=>b.onclick=()=>{state.slot=b.dataset.slot;restore(state.slot);});
  document.getElementById('btn-export').onclick=exportSave; document.getElementById('btn-import').onclick=importSave; ui.graphics.onchange=()=>{ const q=ui.graphics.value; renderer.setPixelRatio(q==='low'?1:q==='high'?Math.min(devicePixelRatio,2):Math.min(devicePixelRatio,1.5)); toast('Graphics '+q); };

  setupMobileJoystick(); restore('slot1'); stream(); setCloud(!!window.NeonBlockCloudSave); if (loading) setTimeout(()=>loading.classList.add('hidden'), 350); loop();
})();
