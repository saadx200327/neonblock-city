(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const loading = $('loading-screen');
  const hud = {
    cash: $('hud-cash'), xp: $('hud-xp'), level: $('hud-level'), wanted: $('hud-wanted'), online: $('hud-online'),
    vehicle: $('hud-vehicle'), hp: $('hud-vehicle-hp'), gas: $('hud-vehicle-gas'), mission: $('hud-mission'),
    fps: $('debug-fps'), pos: $('debug-pos'), chunks: $('debug-chunks'), npcs: $('debug-npcs'), activeVehicle: $('debug-active-vehicle'),
    saveSlot: $('debug-save-slot'), debugOnline: $('debug-online'), lastError: $('debug-last-error'), reward: $('reward-popup')
  };

  if (!window.THREE) {
    document.body.innerHTML = '<main class="fatal">Three.js did not load. Reconnect and refresh NeonBlock City.</main>';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060914);
  scene.fog = new THREE.Fog(0x060914, 65, 210);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 420);
  const clock = new THREE.Clock();

  const mat = {
    grass: new THREE.MeshStandardMaterial({ color: 0x10251d }), road: new THREE.MeshStandardMaterial({ color: 0x151a2b }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x16efff, emissive: 0x06333a }), pink: new THREE.MeshStandardMaterial({ color: 0xff36b8, emissive: 0x351020 }),
    player: new THREE.MeshStandardMaterial({ color: 0xffcf66 }), car: new THREE.MeshStandardMaterial({ color: 0x7b61ff, emissive: 0x191244 }),
    npc: new THREE.MeshStandardMaterial({ color: 0x5ef38c }), coin: new THREE.MeshStandardMaterial({ color: 0xffee70, emissive: 0x403900 })
  };
  const box = (w,h,d,m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };

  const state = { cash: 150, xp: 0, wanted: 0, slot: 'slot1', pos: new THREE.Vector3(0,1,0), vel: new THREE.Vector3(), yaw: 0, sprint: false, car: null, owned: {}, taken: {}, online: false, err: 'none' };
  const input = { f:false,b:false,l:false,r:false,j:false,joyX:0,joyY:0 };
  const chunks = new Map(), interactables = [], npcs = [];
  const mission = { id:'starter', title:'Starter Hustle', progress:0, need:3, reward:300 };
  const CHUNK = 42;

  function resize(){ renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize);

  scene.add(new THREE.HemisphereLight(0xb9d8ff, 0x07120b, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(35,65,20); sun.castShadow = true; scene.add(sun);

  const player = new THREE.Group();
  const body = box(.9,1.3,.55,mat.player); body.position.y = 1;
  const head = box(.6,.6,.6,mat.cyan); head.position.y = 1.95; player.add(body, head); scene.add(player);

  function hash(x,z){ let n = x*374761393 + z*668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
  function reward(text){ hud.reward.textContent = text; hud.reward.classList.remove('hidden'); clearTimeout(reward.t); reward.t = setTimeout(() => hud.reward.classList.add('hidden'), 1700); }
  function error(e){ state.err = String(e && e.message ? e.message : e).slice(0,80); hud.lastError.textContent = state.err; console.warn(e); }

  function makeChunk(cx, cz){
    const key = `${cx},${cz}`; if (chunks.has(key)) return;
    const g = new THREE.Group(); g.position.set(cx*CHUNK,0,cz*CHUNK); scene.add(g); chunks.set(key,g);
    const ground = box(CHUNK,.12,CHUNK,mat.grass); ground.position.y = -.07; g.add(ground);
    const road1 = box(CHUNK,.05,6,mat.road); road1.position.y = .01; g.add(road1);
    const road2 = box(6,.05,CHUNK,mat.road); road2.position.y = .02; g.add(road2);
    for (let i=0;i<7;i++){
      const r = hash(cx+i,cz-i); const h = 5 + Math.floor(r*16); const b = box(4+r*4,h,4+hash(cz,i)*4,i%2?mat.pink:mat.cyan);
      b.position.set((hash(cx*3,i)-.5)*32,h/2,(hash(i,cz*5)-.5)*32); if (Math.abs(b.position.x)>5 && Math.abs(b.position.z)>5) g.add(b);
    }
    const lot = box(6,.16,6,mat.road); lot.position.set(14,.08,-14); lot.userData = { type:'lot', id:`lot-${key}`, price:400+75*(Math.abs(cx)+Math.abs(cz)) }; g.add(lot); interactables.push(lot);
    if (hash(cx,cz) > .38){ const p = box(1,1,1,mat.coin); p.position.set(-13,1,12); p.userData = { type:'pickup', id:`cube-${key}` }; g.add(p); interactables.push(p); }
    if (hash(cx+9,cz-4) > .62){ const car = new THREE.Group(); const c = box(2.5,.8,4,mat.car); c.position.y=.55; const cab = box(1.5,.7,1.6,mat.cyan); cab.position.y=1.15; car.add(c,cab); car.position.set(-15,0,-9); car.userData={type:'car', id:`car-${key}`, speed:0, gas:100, hp:100}; g.add(car); interactables.push(car); }
  }

  function stream(){
    const cx = Math.floor(state.pos.x/CHUNK), cz = Math.floor(state.pos.z/CHUNK);
    for(let x=cx-2;x<=cx+2;x++) for(let z=cz-2;z<=cz+2;z++) makeChunk(x,z);
    for (const [key,g] of chunks){ const [x,z]=key.split(',').map(Number); if(Math.abs(x-cx)>3 || Math.abs(z-cz)>3){ scene.remove(g); chunks.delete(key); } }
  }

  function spawnNpcs(){ for(let i=0;i<18;i++){ const n = box(.7,1.3,.5,mat.npc); n.position.set((Math.random()-.5)*90,.65,(Math.random()-.5)*90); n.userData={a:Math.random()*6.28,s:.5+Math.random()}; scene.add(n); npcs.push(n); } }
  function nearest(){ let best=null, dist=5; const base = state.car || player; const bp = new THREE.Vector3(); base.getWorldPosition(bp); for(const obj of interactables){ if(!obj.parent || obj.visible===false) continue; const p = new THREE.Vector3(); obj.getWorldPosition(p); const d=p.distanceTo(bp); if(d<dist){best=obj;dist=d;} } return best; }
  function interact(){ const obj=nearest(); if(!obj) return reward('Nothing nearby'); const d=obj.userData; if(d.type==='pickup'){ if(state.taken[d.id]) return; state.taken[d.id]=true; obj.visible=false; state.cash+=40; state.xp+=20; mission.progress++; reward('+40 cash data cube'); if(mission.progress>=mission.need){ state.cash+=mission.reward; state.xp+=80; mission.progress=0; reward('Mission complete +300'); } } if(d.type==='car'){ state.car = state.car===obj ? null : obj; reward(state.car?'Vehicle entered':'Vehicle exited'); } if(d.type==='lot'){ if(state.owned[d.id]) return reward('Already owned'); if(state.cash<d.price) return reward(`Need ${d.price} cash`); state.cash-=d.price; state.owned[d.id]=true; obj.material=mat.pink; state.xp+=60; reward('Lot purchased'); } }

  function move(dt){
    const x = (input.r?1:0)-(input.l?1:0)+input.joyX, y = (input.f?1:0)-(input.b?1:0)-input.joyY;
    if(state.car){ const car=state.car; car.userData.speed = THREE.MathUtils.clamp((car.userData.speed||0)+y*24*dt,-8,state.sprint?32:22); car.userData.speed*=.982; car.rotation.y -= x*dt*(.9+Math.abs(car.userData.speed)*.025); car.position.addScaledVector(new THREE.Vector3(Math.sin(car.rotation.y),0,Math.cos(car.rotation.y)),car.userData.speed*dt); car.userData.gas=Math.max(0,car.userData.gas-Math.abs(car.userData.speed)*dt*.02); state.pos.copy(car.position).setY(1); }
    else { const speed=state.sprint?9:5.4; const f=new THREE.Vector3(Math.sin(state.yaw),0,Math.cos(state.yaw)), r=new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw)); const wish=new THREE.Vector3().addScaledVector(f,y).addScaledVector(r,x); if(wish.lengthSq()>.01){wish.normalize(); state.pos.addScaledVector(wish,speed*dt); state.yaw=Math.atan2(wish.x,wish.z);} if(input.j && state.pos.y<=1.02) state.vel.y=6.2; state.vel.y-=18*dt; state.pos.addScaledVector(state.vel,dt); if(state.pos.y<1){state.pos.y=1;state.vel.y=0;} player.position.copy(state.pos); player.rotation.y=state.yaw; }
  }

  function cameraFollow(dt){ const target = state.car ? state.car.position : state.pos; const a = state.car ? state.car.rotation.y : state.yaw; camera.position.lerp(new THREE.Vector3(target.x-Math.sin(a)*9,target.y+6.2,target.z-Math.cos(a)*9),1-Math.pow(.001,dt)); camera.lookAt(target.x,target.y+1.2,target.z); }
  function updateNpcs(dt){ npcs.forEach(n=>{n.userData.a+=dt*n.userData.s*.25; n.position.x+=Math.sin(n.userData.a)*dt*n.userData.s; n.position.z+=Math.cos(n.userData.a)*dt*n.userData.s; n.rotation.y=n.userData.a;}); }
  function updateHud(dt){ const level=Math.floor(state.xp/100)+1; hud.cash.textContent=Math.floor(state.cash); hud.xp.textContent=Math.floor(state.xp); hud.level.textContent=level; hud.wanted.textContent=state.wanted; hud.online.textContent=state.online?'cloud':'offline'; hud.debugOnline.textContent=hud.online.textContent; hud.vehicle.textContent=state.car?'Neon Cruiser':'On foot'; hud.hp.textContent=state.car?Math.round(state.car.userData.hp):100; hud.gas.textContent=state.car?Math.round(state.car.userData.gas):100; hud.mission.textContent=`${mission.title} ${mission.progress}/${mission.need}`; hud.fps.textContent=Math.round(1/Math.max(dt,.001)); hud.pos.textContent=`${state.pos.x.toFixed(1)},${state.pos.y.toFixed(1)},${state.pos.z.toFixed(1)}`; hud.chunks.textContent=chunks.size; hud.npcs.textContent=npcs.length; hud.activeVehicle.textContent=state.car?state.car.userData.id:'None'; hud.saveSlot.textContent=state.slot; hud.lastError.textContent=state.err; }
  function save(slot=state.slot){ const data={cash:state.cash,xp:state.xp,wanted:state.wanted,pos:state.pos.toArray(),owned:state.owned,taken:state.taken}; localStorage.setItem(`neonblock-save-${slot}`,JSON.stringify(data)); window.NeonBlockCloud?.save?.(slot,data).then(()=>state.online=true).catch(()=>state.online=false); return data; }
  function load(slot=state.slot){ try{ const raw=localStorage.getItem(`neonblock-save-${slot}`); if(!raw) return reward('No save'); const data=JSON.parse(raw); state.cash=data.cash||150; state.xp=data.xp||0; state.wanted=data.wanted||0; if(data.pos) state.pos.fromArray(data.pos); state.owned=data.owned||{}; state.taken=data.taken||{}; state.slot=slot; reward(`Loaded ${slot}`); } catch(e){ error(e); } }

  function bind(){
    const set=(e,v)=>{ const k=e.key.toLowerCase(); if(['w','arrowup'].includes(k)) input.f=v; if(['s','arrowdown'].includes(k)) input.b=v; if(['a','arrowleft'].includes(k)) input.l=v; if(['d','arrowright'].includes(k)) input.r=v; if(k==='shift') state.sprint=v; if(k===' ') input.j=v; if(v&&k==='e') interact(); if(v&&k==='r') { state.pos.y=4; reward('Unstuck'); } if(v&&k==='escape') $('pause-overlay').classList.toggle('hidden'); };
    addEventListener('keydown',e=>set(e,true)); addEventListener('keyup',e=>set(e,false));
    const joy=$('joystick-container'), stick=$('joystick-stick'); let active=false, start={x:0,y:0};
    joy.onpointerdown=e=>{ active=true; start={x:e.clientX,y:e.clientY}; joy.setPointerCapture(e.pointerId); };
    joy.onpointermove=e=>{ if(!active) return; const dx=e.clientX-start.x, dy=e.clientY-start.y, len=Math.min(48,Math.hypot(dx,dy)), a=Math.atan2(dy,dx); input.joyX=Math.cos(a)*len/48; input.joyY=Math.sin(a)*len/48; stick.style.transform=`translate(${Math.cos(a)*len}px,${Math.sin(a)*len}px)`; };
    joy.onpointerup=()=>{ active=false; input.joyX=0; input.joyY=0; stick.style.transform='translate(0,0)'; };
    $('btn-mobile-jump').onpointerdown=()=>input.j=true; $('btn-mobile-jump').onpointerup=()=>input.j=false; $('btn-mobile-sprint').onpointerdown=()=>state.sprint=true; $('btn-mobile-sprint').onpointerup=()=>state.sprint=false; $('btn-mobile-interact').onclick=interact; $('btn-mobile-unstuck').onclick=()=>{state.pos.y=4;}; $('btn-mobile-pause').onclick=()=>$('pause-overlay').classList.toggle('hidden'); $('btn-resume').onclick=()=>$('pause-overlay').classList.add('hidden'); $('btn-save').onclick=()=>{$('save-panel').classList.toggle('hidden'); save(); reward('Saved');}; $('btn-load').onclick=()=>load(); $('btn-settings').onclick=()=>$('settings-panel').classList.toggle('hidden'); $('btn-close-settings').onclick=()=>$('settings-panel').classList.add('hidden'); $('btn-close-save').onclick=()=>$('save-panel').classList.add('hidden'); document.querySelectorAll('.btn-save-slot').forEach(b=>b.onclick=()=>{state.slot=b.dataset.slot; save(state.slot); reward('Saved '+state.slot);}); document.querySelectorAll('.btn-load-slot').forEach(b=>b.onclick=()=>load(b.dataset.slot)); $('btn-export').onclick=()=>$('export-json').value=JSON.stringify(save(),null,2); $('btn-import').onclick=()=>{try{const d=JSON.parse($('export-json').value); localStorage.setItem(`neonblock-save-${state.slot}`,JSON.stringify(d)); load();}catch(e){error(e);}};
  }

  function loop(){ requestAnimationFrame(loop); const dt=Math.min(clock.getDelta(),.05); try{ move(dt); stream(); updateNpcs(dt); cameraFollow(dt); updateHud(dt); renderer.render(scene,camera); }catch(e){ error(e); } }
  resize(); bind(); spawnNpcs(); load(); stream(); player.position.copy(state.pos); loading.classList.add('hidden'); loop(); setInterval(()=>save(),15000);
})();
