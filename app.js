(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const ui = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), onlineDebug: $('debug-online'), error: $('debug-last-error')
  };
  const SAVE = 'neonblock-city-save-v16';
  const CHUNK = 120;
  const RADIUS = 2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a18);
  scene.fog = new THREE.Fog(0x070a18, 80, 520);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(80, 150, 90); sun.castShadow = true; scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9df8ff, 0x09051a, 1.35));
  const mat = {
    grass: new THREE.MeshStandardMaterial({ color: 0x10291f }), road: new THREE.MeshStandardMaterial({ color: 0x111525 }),
    player: new THREE.MeshStandardMaterial({ color: 0x17f3ff, emissive: 0x06343a }), pickup: new THREE.MeshStandardMaterial({ color: 0xfff36d, emissive: 0x605000 }),
    npc: new THREE.MeshStandardMaterial({ color: 0xff4fd8, emissive: 0x2a0720 }), lot: new THREE.MeshStandardMaterial({ color: 0x18245a }),
    owned: new THREE.MeshStandardMaterial({ color: 0x21ff91, emissive: 0x063516 }), ring: new THREE.MeshBasicMaterial({ color: 0x30ff8b, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  };
  const state = { cash: 120, xp: 0, level: 1, wanted: 0, slot: 'slot1', mission: null, progress: 0, owned: new Set(), car: null, lastError: 'none', paused: false, online: false };
  const input = { keys: new Set(), joy: { x: 0, y: 0 }, jump: false, sprint: false, cameraDx: 0, pointer: null };
  const chunks = new Map(), pickups = [], npcs = [], cars = [], lots = [], rings = [];
  const missions = [
    { id: 'collect', name: 'Data Dash', type: 'collect', need: 5, cash: 250, xp: 90 },
    { id: 'drive', name: 'Ring Run', type: 'ring', need: 3, cash: 300, xp: 110 },
    { id: 'own', name: 'Buy A Lot', type: 'own', need: 1, cash: 160, xp: 130 }
  ];
  function avatar(material) { const g = new THREE.Group(); [[1.8,2.1,1,0,1.1,0],[1.2,1.2,1.2,0,2.75,0],[.6,1.2,.6,-.45,-.6,0],[.6,1.2,.6,.45,-.6,0]].forEach(p=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(p[0],p[1],p[2]),material); m.position.set(p[3],p[4],p[5]); m.castShadow=m.receiveShadow=true; g.add(m); }); return g; }
  const player = avatar(mat.player); player.position.set(0,2.2,0); player.userData.vel = 0; scene.add(player);
  let yaw = Math.PI / 4;
  function rnd(x,z){ const n=Math.sin(x*127.1+z*311.7)*43758.5453; return n-Math.floor(n); }
  function key(x,z){ return `${x},${z}`; }
  function cc(v){ return Math.floor((v + CHUNK / 2) / CHUNK); }
  function chunk(cx,cz){
    const g = new THREE.Group(), bx = cx * CHUNK, bz = cz * CHUNK;
    g.userData = { cx, cz };
    const ground = new THREE.Mesh(new THREE.BoxGeometry(CHUNK,1,CHUNK), mat.grass); ground.position.set(bx,-.55,bz); ground.receiveShadow=true; g.add(ground);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(18,.08,CHUNK), mat.road); r1.position.set(bx,.04,bz);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(CHUNK,.08,18), mat.road); r2.position.set(bx,.05,bz); g.add(r1,r2);
    for(let i=0;i<4;i++){ const x=bx+(rnd(cx+i,cz)-.5)*82, z=bz+(rnd(cx,cz+i)-.5)*82; if(Math.abs(x-bx)<16||Math.abs(z-bz)<16) continue; const h=12+rnd(cx+i*3,cz-i)*48; const m=new THREE.Mesh(new THREE.BoxGeometry(12+rnd(i,cx)*14,h,12+rnd(cz,i)*14), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(.55+rnd(cx,cz+i)*.25,.65,.38), roughness:.55, emissive:0x050816 })); m.position.set(x,h/2,z); m.castShadow=m.receiveShadow=true; g.add(m); }
    if(rnd(cx,cz)>.42) addPickup(bx+(rnd(cx,cz+9)-.5)*72,bz+(rnd(cx+8,cz)-.5)*72,g);
    if(cars.length<18 && rnd(cx+4,cz-3)>.67) addCar(bx+8,bz+28,g);
    if(npcs.length<46 && rnd(cx-2,cz+5)>.5) addNpc(bx-30+rnd(cx,7)*60,bz-30+rnd(6,cz)*60,g);
    if((cx+cz)%2===0) addLot(bx+38,bz-38,g,`lot-${cx}-${cz}`);
    if(rings.length<14 && rnd(cx+20,cz+20)>.72) addRing(bx-40+rnd(cx,3)*80,bz-40+rnd(4,cz)*80,g);
    scene.add(g); chunks.set(key(cx,cz),g);
  }
  function addPickup(x,z,g){ const p=new THREE.Mesh(new THREE.OctahedronGeometry(2.2,0),mat.pickup); p.position.set(x,2.8,z); p.castShadow=true; g.add(p); pickups.push(p); }
  function addNpc(x,z,g){ const n=avatar(mat.npc); n.scale.setScalar(.78); n.position.set(x,1.75,z); n.userData.home={x,z,phase:Math.random()*9}; g.add(n); npcs.push(n); }
  function addLot(x,z,g,id){ const l=new THREE.Mesh(new THREE.BoxGeometry(18,.35,18),state.owned.has(id)?mat.owned:mat.lot); l.position.set(x,.22,z); l.userData={id,price:300}; g.add(l); lots.push(l); }
  function addRing(x,z,g){ const r=new THREE.Mesh(new THREE.TorusGeometry(5.2,.28,8,32),mat.ring); r.rotation.x=Math.PI/2; r.position.set(x,4.8,z); g.add(r); rings.push(r); }
  function addCar(x,z,g){ const car=new THREE.Group(); const body=new THREE.Mesh(new THREE.BoxGeometry(5.8,1.5,8.4),new THREE.MeshStandardMaterial({color:0x2b65ff,emissive:0x071130})); body.position.y=1.2; const cab=new THREE.Mesh(new THREE.BoxGeometry(4.2,1.3,3.4),new THREE.MeshStandardMaterial({color:0x87f8ff,transparent:true,opacity:.72})); cab.position.set(0,2.25,-.4); car.add(body,cab); car.position.set(x,0,z); car.userData={hp:100,gas:100}; g.add(car); cars.push(car); }
  function stream(){ const cx=cc(player.position.x), cz=cc(player.position.z); for(let x=cx-RADIUS;x<=cx+RADIUS;x++) for(let z=cz-RADIUS;z<=cz+RADIUS;z++) if(!chunks.has(key(x,z))) chunk(x,z); for(const [k,g] of chunks) if(Math.abs(g.userData.cx-cx)>RADIUS+1||Math.abs(g.userData.cz-cz)>RADIUS+1){ scene.remove(g); chunks.delete(k); } }
  function progress(type){ if(!state.mission||state.mission.type!==type) return; state.progress++; if(state.progress>=state.mission.need){ state.cash+=state.mission.cash; state.xp+=state.mission.xp; toast(`Mission complete +$${state.mission.cash}`); state.mission=null; state.progress=0; save(true); } }
  function move(dt){ let ax=0,az=0; if(input.keys.has('w')||input.keys.has('arrowup'))az--; if(input.keys.has('s')||input.keys.has('arrowdown'))az++; if(input.keys.has('a')||input.keys.has('arrowleft'))ax--; if(input.keys.has('d')||input.keys.has('arrowright'))ax++; ax+=input.joy.x; az+=input.joy.y; const mag=Math.hypot(ax,az); const speed=(state.car?38:18)*(input.keys.has('shift')||input.sprint?1.7:1); if(mag>.05){ ax/=Math.max(1,mag); az/=Math.max(1,mag); const dx=Math.sin(yaw)*az+Math.cos(yaw)*ax, dz=Math.cos(yaw)*az-Math.sin(yaw)*ax; if(state.car){ state.car.position.x+=dx*speed*dt; state.car.position.z+=dz*speed*dt; state.car.rotation.y=Math.atan2(dx,dz); state.car.userData.gas=Math.max(0,state.car.userData.gas-dt*2); player.position.copy(state.car.position).add(new THREE.Vector3(0,2.1,0)); } else { player.position.x+=dx*speed*dt; player.position.z+=dz*speed*dt; player.rotation.y=Math.atan2(dx,dz); } } if(!state.car){ player.userData.vel-=36*dt; if((input.keys.has(' ')||input.jump)&&player.position.y<=2.21) player.userData.vel=16; player.position.y+=player.userData.vel*dt; if(player.position.y<2.2){player.position.y=2.2;player.userData.vel=0;} } yaw-=input.cameraDx*.004; input.cameraDx=0; input.jump=false; }
  function interact(){ if(state.car){ player.position.copy(state.car.position).add(new THREE.Vector3(5,2.2,0)); state.car=null; toast('Exited vehicle'); return; } let best=null, d=99; [...cars,...lots].forEach(o=>{ if(!o.parent) return; const nd=o.position.distanceTo(player.position); if(nd<d){best=o;d=nd;} }); if(!best||d>12){toast('Nothing nearby');return;} if(cars.includes(best)){ if(best.userData.gas<=0){toast('Out of gas');return;} state.car=best; toast('Entered vehicle'); } else { if(state.owned.has(best.userData.id)){toast('Already owned');return;} if(state.cash<best.userData.price){toast('Need $300');return;} state.cash-=best.userData.price; state.owned.add(best.userData.id); best.material=mat.owned; progress('own'); toast('Lot purchased'); save(true); } }
  function world(dt){ pickups.forEach(p=>{ if(!p.parent)return; p.rotation.y+=dt*2; p.position.y=2.8+Math.sin(performance.now()*.004+p.position.x)*.45; if(p.position.distanceTo(player.position)<4.2){p.parent.remove(p);state.cash+=25;state.xp+=10;progress('collect');toast('Data cube +$25');}}); rings.forEach(r=>{ if(!r.parent)return; r.rotation.z+=dt; if(state.car&&r.position.distanceTo(state.car.position)<7){r.parent.remove(r);progress('ring');toast('Ring cleared');}}); npcs.forEach(n=>{ if(!n.parent)return; const t=performance.now()*.001+n.userData.home.phase; n.position.x=n.userData.home.x+Math.sin(t*.7)*8; n.position.z=n.userData.home.z+Math.cos(t*.9)*8; }); }
  function follow(){ const t=state.car?state.car.position:player.position; camera.position.lerp(new THREE.Vector3(Math.sin(yaw)*(state.car?38:28),state.car?22:18,Math.cos(yaw)*(state.car?38:28)).add(t),.12); camera.lookAt(t.x,t.y+4,t.z); }
  function hud(){ state.level=1+Math.floor(state.xp/200); ui.cash.textContent=Math.floor(state.cash); ui.xp.textContent=Math.floor(state.xp); ui.level.textContent=state.level; ui.wanted.textContent=state.wanted; ui.vehicle.textContent=state.car?'Neon Cruiser':'On foot'; ui.hp.textContent=state.car?Math.round(state.car.userData.hp):100; ui.gas.textContent=state.car?Math.round(state.car.userData.gas):100; ui.mission.textContent=state.mission?`${state.mission.name} ${state.progress}/${state.mission.need}`:'None'; ui.online.textContent=state.online?'cloud-ready':'offline'; ui.onlineDebug.textContent=ui.online.textContent; ui.pos.textContent=`${player.position.x.toFixed(0)},${player.position.y.toFixed(0)},${player.position.z.toFixed(0)}`; ui.chunks.textContent=chunks.size; ui.npcs.textContent=npcs.filter(n=>n.parent).length; ui.activeVehicle.textContent=state.car?'Neon Cruiser':'None'; ui.saveSlot.textContent=state.slot; ui.error.textContent=state.lastError; }
  function mini(){ const c=$('minimap-canvas'); if(!c)return; const x=c.getContext('2d'); x.fillStyle='#071024'; x.fillRect(0,0,160,160); x.strokeStyle='#17f3ff55'; for(let i=0;i<=160;i+=40){x.beginPath();x.moveTo(i,0);x.lineTo(i,160);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(160,i);x.stroke();} x.fillStyle='#17f3ff'; x.beginPath(); x.arc(80,80,5,0,7); x.fill(); }
  function payload(){return{cash:state.cash,xp:state.xp,wanted:state.wanted,pos:[player.position.x,player.position.y,player.position.z],owned:[...state.owned]};}
  async function save(silent=false){ const data=payload(); localStorage.setItem(`${SAVE}-${state.slot}`,JSON.stringify(data)); try{ if(window.NeonCloudSave) await window.NeonCloudSave.save(state.slot,data); }catch(e){ state.lastError='cloud save fallback'; } if(!silent) toast('Saved'); }
  async function load(slot='slot1'){ state.slot=slot; let raw=localStorage.getItem(`${SAVE}-${slot}`); try{ if(window.NeonCloudSave){ const cloud=await window.NeonCloudSave.load(slot); if(cloud) raw=JSON.stringify(cloud); } }catch(e){ state.lastError='cloud load fallback'; } if(!raw)return; try{ const d=JSON.parse(raw); state.cash=d.cash??120; state.xp=d.xp??0; state.wanted=d.wanted??0; state.owned=new Set(d.owned||[]); if(d.pos) player.position.set(d.pos[0],Math.max(2.2,d.pos[1]),d.pos[2]); }catch(e){state.lastError='bad save';} }
  function toast(msg){ const e=$('reward-popup'); e.textContent=msg; e.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>e.classList.add('hidden'),1700); }
  function menus(show){ $('pause-overlay').classList.toggle('hidden',!show); state.paused=show; }
  function bind(){ addEventListener('keydown',e=>{input.keys.add(e.key.toLowerCase()); if(e.key==='Escape')menus(!state.paused); if(e.key.toLowerCase()==='e')interact(); if(e.key.toLowerCase()==='m'){menus(true);$('mission-board').classList.remove('hidden');}}); addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase())); canvas.addEventListener('pointerdown',e=>input.pointer=[e.clientX,e.clientY]); addEventListener('pointerup',()=>input.pointer=null); addEventListener('pointermove',e=>{if(input.pointer){input.cameraDx+=e.clientX-input.pointer[0];input.pointer=[e.clientX,e.clientY];}}); $('btn-resume').onclick=()=>menus(false); $('btn-mobile-pause').onclick=()=>menus(true); $('btn-mobile-interact').onclick=interact; $('btn-mobile-jump').onclick=()=>input.jump=true; $('btn-mobile-unstuck').onclick=()=>{player.position.y=8;toast('Unstuck');}; $('btn-mobile-sprint').onpointerdown=()=>input.sprint=true; $('btn-mobile-sprint').onpointerup=()=>input.sprint=false; $('btn-save').onclick=()=>$('save-panel').classList.toggle('hidden'); $('btn-load').onclick=()=>load(state.slot); $('btn-close-save').onclick=()=>$('save-panel').classList.add('hidden'); $('btn-export').onclick=()=>$('export-json').value=JSON.stringify(payload(),null,2); $('btn-import').onclick=()=>{localStorage.setItem(`${SAVE}-${state.slot}`,$('export-json').value);load(state.slot);}; document.querySelectorAll('.btn-save-slot').forEach(b=>b.onclick=()=>{state.slot=b.dataset.slot;save();}); document.querySelectorAll('.btn-load-slot').forEach(b=>b.onclick=()=>load(b.dataset.slot)); $('btn-settings').onclick=()=>$('settings-panel').classList.toggle('hidden'); $('btn-close-settings').onclick=()=>$('settings-panel').classList.add('hidden'); $('btn-close-missions').onclick=()=>$('mission-board').classList.add('hidden'); const list=$('mission-list'); missions.forEach(m=>{const li=document.createElement('li');li.innerHTML=`<strong>${m.name}</strong><br><small>${m.type} ${m.need}</small>`;li.onclick=()=>{state.mission=m;state.progress=0;toast('Mission started');menus(false);};list.appendChild(li);}); joystick(); }
  function joystick(){ const box=$('joystick-container'), stick=$('joystick-stick'); let rect; function reset(){input.joy.x=0;input.joy.y=0;stick.style.transform='translate(0,0)';} function joy(e){const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),max=42;if(len>max){dx=dx/len*max;dy=dy/len*max;} input.joy.x=dx/max;input.joy.y=dy/max;stick.style.transform=`translate(${dx}px,${dy}px)`;} box.addEventListener('pointerdown',e=>{rect=box.getBoundingClientRect();box.setPointerCapture(e.pointerId);joy(e);}); box.addEventListener('pointermove',joy); box.addEventListener('pointerup',reset); box.addEventListener('pointercancel',reset); }
  function resize(){ renderer.setSize(innerWidth,innerHeight,false); renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
  let ft=0,fc=0,auto=0; const clock=new THREE.Clock(); function loop(){ requestAnimationFrame(loop); const dt=Math.min(.05,clock.getDelta()); if(!state.paused){move(dt);stream();world(dt);follow();auto+=dt;if(auto>20){auto=0;save(true);}} ft+=dt;fc++; if(ft>.5){ui.fps.textContent=Math.round(fc/ft);ft=0;fc=0;} hud(); mini(); renderer.render(scene,camera); }
  addEventListener('resize',resize); addEventListener('beforeunload',()=>save(true)); bind(); resize(); stream(); load('slot1'); state.online=!!window.NeonCloudSave&&window.NeonCloudSave.mode!=='local'; loading.classList.add('hidden'); loop();
})();
