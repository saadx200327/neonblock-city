/* Cardfolio iPhone-style crop editor.
   Loaded after runtime hardening so this scan path replaces the older slider cropper.
   Keeps OCR local, adds pinch zoom, rotate, flip, aspect modes and a compact viewport-safe UI. */
(function(){
'use strict';

const W=700,H=980;
let session=null,resolveCrop=null;
const pointers=new Map();
let gesture=null,resizeGesture=null;

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const text=v=>String(v??'').trim().replace(/\s+/g,' ');

function ensureDialog(){
  if(document.getElementById('cardfolioIosCropDialog'))return;
  const d=document.createElement('dialog');
  d.id='cardfolioIosCropDialog';
  d.className='modal cfi-crop-modal';
  d.innerHTML=`<div class="modal-card liquid-modal cfi-crop-card">
    <div class="modal-head cfi-crop-head">
      <div><div class="eyebrow">Prepare scan</div><h2>Crop your card</h2><p class="holding-meta">Drag to reposition · pinch to zoom · rotate or flip.</p></div>
      <button class="icon-btn" id="cfiCropCancelX" type="button" aria-label="Close">×</button>
    </div>
    <div class="cfi-stage" id="cfiStage" aria-label="Card crop editor">
      <canvas id="cfiCanvas" width="${W}" height="${H}"></canvas>
      <div class="cfi-crop-box" id="cfiCropBox">
        <span class="cfi-grid cfi-grid-v one"></span><span class="cfi-grid cfi-grid-v two"></span>
        <span class="cfi-grid cfi-grid-h one"></span><span class="cfi-grid cfi-grid-h two"></span>
        <button class="cfi-handle nw" data-handle="nw" aria-label="Resize crop from top left"></button>
        <button class="cfi-handle ne" data-handle="ne" aria-label="Resize crop from top right"></button>
        <button class="cfi-handle sw" data-handle="sw" aria-label="Resize crop from bottom left"></button>
        <button class="cfi-handle se" data-handle="se" aria-label="Resize crop from bottom right"></button>
      </div>
    </div>
    <div class="cfi-gesture-note"><span>↔ Drag</span><span>⌁ Pinch to zoom</span><span>2× tap to zoom</span></div>
    <div class="cfi-tool-row" role="toolbar" aria-label="Crop tools">
      <button type="button" class="cfi-tool" id="cfiRotateLeft"><b>↺</b><span>Rotate</span></button>
      <button type="button" class="cfi-tool" id="cfiRotateRight"><b>↻</b><span>Rotate</span></button>
      <button type="button" class="cfi-tool" id="cfiFlip"><b>⇋</b><span>Flip</span></button>
      <button type="button" class="cfi-tool" id="cfiAuto"><b>⌗</b><span>Auto</span></button>
    </div>
    <div class="cfi-aspects" role="group" aria-label="Crop aspect ratio">
      <button type="button" data-aspect="original">Original</button>
      <button type="button" data-aspect="freeform" class="active">Freeform</button>
      <button type="button" data-aspect="square">Square</button>
    </div>
    <div class="cfi-bottom-actions">
      <button class="btn secondary" id="cfiUseOriginal" type="button">Use full photo</button>
      <button class="btn primary" id="cfiUseCrop" type="button">Use crop</button>
    </div>
  </div>`;
  document.body.appendChild(d);

  const stage=document.getElementById('cfiStage');
  stage.addEventListener('pointerdown',onPointerDown);
  stage.addEventListener('pointermove',onPointerMove);
  stage.addEventListener('pointerup',onPointerUp);
  stage.addEventListener('pointercancel',onPointerUp);
  stage.addEventListener('wheel',onWheel,{passive:false});
  stage.addEventListener('dblclick',()=>{if(!session)return;session.zoom=session.zoom>1.2?1:1.65;draw();});
  stage.querySelectorAll('.cfi-handle').forEach(h=>h.addEventListener('pointerdown',beginResize));

  document.getElementById('cfiRotateLeft').addEventListener('click',()=>rotate(-90));
  document.getElementById('cfiRotateRight').addEventListener('click',()=>rotate(90));
  document.getElementById('cfiFlip').addEventListener('click',flip);
  document.getElementById('cfiAuto').addEventListener('click',autoFit);
  document.querySelectorAll('#cardfolioIosCropDialog [data-aspect]').forEach(b=>b.addEventListener('click',()=>setAspect(b.dataset.aspect)));
  document.getElementById('cfiCropCancelX').addEventListener('click',()=>finish(null));
  document.getElementById('cfiUseOriginal').addEventListener('click',()=>finish(session?{file:session.file,meta:{mode:'original'}}:null));
  document.getElementById('cfiUseCrop').addEventListener('click',applyCrop);
  d.addEventListener('cancel',e=>{e.preventDefault();finish(null)});

  installStyles();
}

function installStyles(){
  if(document.getElementById('cardfolioIosCropStyles'))return;
  const s=document.createElement('style');s.id='cardfolioIosCropStyles';
  s.textContent=`
  .cfi-crop-modal{width:min(610px,calc(100vw - 14px));padding:0}.cfi-crop-card{width:100%;box-sizing:border-box;max-height:calc(100dvh - 12px);overflow:auto;overscroll-behavior:contain;padding:18px 20px calc(16px + env(safe-area-inset-bottom));border-radius:30px!important}.cfi-crop-head{margin-bottom:10px}.cfi-crop-head h2{margin:2px 0 4px}.cfi-crop-head .holding-meta{margin:0;font-size:12px;line-height:1.35}.cfi-stage{position:relative;width:min(342px,80vw,34dvh);aspect-ratio:5/7;margin:2px auto 10px;border-radius:24px;overflow:hidden;background:#07090d;box-shadow:0 18px 46px rgba(27,38,58,.18),inset 0 0 0 1px rgba(255,255,255,.08);touch-action:none;user-select:none}.cfi-stage canvas{display:block;width:100%;height:100%;touch-action:none}.cfi-crop-box{position:absolute;border:1.5px solid rgba(255,255,255,.96);box-sizing:border-box;pointer-events:none;box-shadow:0 0 0 999px rgba(0,0,0,.24)}.cfi-grid{position:absolute;background:rgba(255,255,255,.35);pointer-events:none}.cfi-grid-v{top:0;bottom:0;width:1px}.cfi-grid-v.one{left:33.333%}.cfi-grid-v.two{left:66.666%}.cfi-grid-h{left:0;right:0;height:1px}.cfi-grid-h.one{top:33.333%}.cfi-grid-h.two{top:66.666%}.cfi-handle{position:absolute;width:26px;height:26px;padding:0;border:0;background:transparent;pointer-events:auto;touch-action:none}.cfi-handle:before,.cfi-handle:after{content:"";position:absolute;background:#fff;border-radius:2px}.cfi-handle:before{width:24px;height:4px}.cfi-handle:after{width:4px;height:24px}.cfi-handle.nw{left:-9px;top:-9px}.cfi-handle.nw:before,.cfi-handle.nw:after{left:0;top:0}.cfi-handle.ne{right:-9px;top:-9px}.cfi-handle.ne:before{right:0;top:0}.cfi-handle.ne:after{right:0;top:0}.cfi-handle.sw{left:-9px;bottom:-9px}.cfi-handle.sw:before{left:0;bottom:0}.cfi-handle.sw:after{left:0;bottom:0}.cfi-handle.se{right:-9px;bottom:-9px}.cfi-handle.se:before{right:0;bottom:0}.cfi-handle.se:after{right:0;bottom:0}.cfi-gesture-note{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;color:#8b93a2;font-size:10px;font-weight:700;margin:0 0 10px}.cfi-tool-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 10px}.cfi-tool{min-width:0;border:1px solid rgba(22,31,47,.07);background:rgba(255,255,255,.68);border-radius:17px;padding:9px 4px 8px;color:#1e2530;box-shadow:0 7px 20px rgba(35,48,74,.045);font:inherit}.cfi-tool b{display:block;font-size:21px;line-height:1;margin-bottom:5px;font-weight:600}.cfi-tool span{display:block;font-size:10px;font-weight:750}.cfi-tool:active{transform:scale(.98)}.cfi-aspects{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:rgba(24,34,52,.055);padding:4px;border-radius:16px;margin-bottom:12px}.cfi-aspects button{border:0;border-radius:13px;background:transparent;color:#697386;padding:9px 5px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.cfi-aspects button.active{background:linear-gradient(180deg,#1a2230,#10161f);color:white;box-shadow:0 7px 18px rgba(18,25,38,.14)}.cfi-bottom-actions{display:grid;grid-template-columns:1fr 1.18fr;gap:10px;position:sticky;bottom:-16px;padding:8px 0 0;background:linear-gradient(180deg,rgba(250,252,255,0),rgba(250,252,255,.96) 30%)}.cfi-bottom-actions .btn{min-height:48px}.cfi-crop-card::-webkit-scrollbar{display:none}@media(max-height:760px){.cfi-crop-card{padding-top:12px}.cfi-crop-head .holding-meta{display:none}.cfi-stage{width:min(300px,76vw,31dvh)}.cfi-gesture-note{display:none}.cfi-tool{padding:7px 3px}.cfi-tool b{font-size:18px}.cfi-bottom-actions .btn{min-height:44px}}`;
  document.head.appendChild(s);
}

function cropRectForRatio(ratio,fill=.88){
  const maxW=W*fill,maxH=H*fill;
  let w=maxW,h=w/ratio;
  if(h>maxH){h=maxH;w=h*ratio;}
  return {x:(W-w)/2,y:(H-h)/2,w,h};
}
function currentImageRatio(){
  if(!session)return 5/7;
  const q=session.rotation%180!==0;
  const rw=q?session.img.naturalHeight:session.img.naturalWidth;
  const rh=q?session.img.naturalWidth:session.img.naturalHeight;
  return rw/rh;
}
function setAspect(mode){
  if(!session)return;
  session.aspect=mode;
  if(mode==='square')session.crop=cropRectForRatio(1,.82);
  else if(mode==='original')session.crop=cropRectForRatio(currentImageRatio(),.88);
  else if(!session.crop)session.crop=cropRectForRatio(5/7,.86);
  document.querySelectorAll('#cardfolioIosCropDialog [data-aspect]').forEach(b=>b.classList.toggle('active',b.dataset.aspect===mode));
  updateOverlay();
}
function updateOverlay(){
  if(!session)return;const box=document.getElementById('cfiCropBox'),r=session.crop;
  box.style.left=`${r.x/W*100}%`;box.style.top=`${r.y/H*100}%`;box.style.width=`${r.w/W*100}%`;box.style.height=`${r.h/H*100}%`;
}
function drawScene(ctx,w,h){
  if(!session)return;
  ctx.save();ctx.clearRect(0,0,w,h);ctx.fillStyle='#07090d';ctx.fillRect(0,0,w,h);
  const img=session.img,q=session.rotation%180!==0;
  const rw=q?img.naturalHeight:img.naturalWidth,rh=q?img.naturalWidth:img.naturalHeight;
  const base=Math.min(w/rw,h/rh)*.96;
  const scale=base*session.zoom;
  const mx=w/W,my=h/H;
  ctx.translate(w/2+session.dx*mx,h/2+session.dy*my);
  ctx.rotate(session.rotation*Math.PI/180);
  ctx.scale(scale*(session.flipX?-1:1),scale);
  ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
  ctx.restore();
}
function draw(){
  if(!session)return;const canvas=document.getElementById('cfiCanvas');drawScene(canvas.getContext('2d'),W,H);updateOverlay();
}
function autoFit(){
  if(!session)return;session.zoom=1;session.dx=0;session.dy=0;session.rotation=0;session.flipX=false;session.aspect='freeform';session.crop=cropRectForRatio(5/7,.86);
  document.querySelectorAll('#cardfolioIosCropDialog [data-aspect]').forEach(b=>b.classList.toggle('active',b.dataset.aspect==='freeform'));
  document.getElementById('cfiFlip')?.classList.remove('active');draw();
}
function rotate(delta){
  if(!session)return;session.rotation=(session.rotation+delta+360)%360;session.dx=0;session.dy=0;
  if(session.aspect==='original')session.crop=cropRectForRatio(currentImageRatio(),.88);draw();
}
function flip(){if(!session)return;session.flipX=!session.flipX;document.getElementById('cfiFlip')?.classList.toggle('active',session.flipX);draw();}

function pointInCanvas(e){
  const r=document.getElementById('cfiStage').getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};
}
function onPointerDown(e){
  if(!session||e.target.closest?.('.cfi-handle'))return;
  const stage=e.currentTarget;stage.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1)gesture={type:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,dx:session.dx,dy:session.dy};
  else if(pointers.size===2){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);gesture={type:'pinch',distance:Math.max(1,dist),zoom:session.zoom};}
}
function onPointerMove(e){
  if(!session||!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(gesture?.type!=='pinch')gesture={type:'pinch',distance:Math.max(1,dist),zoom:session.zoom};session.zoom=clamp(gesture.zoom*(dist/gesture.distance),.72,4.5);draw();return;}
  if(gesture?.type==='pan'&&gesture.id===e.pointerId){const r=document.getElementById('cfiStage').getBoundingClientRect();session.dx=gesture.dx+(e.clientX-gesture.x)*W/r.width;session.dy=gesture.dy+(e.clientY-gesture.y)*H/r.height;const limX=W*.65,limY=H*.65;session.dx=clamp(session.dx,-limX,limX);session.dy=clamp(session.dy,-limY,limY);draw();}
}
function onPointerUp(e){
  pointers.delete(e.pointerId);if(pointers.size===1){const [id,p]=pointers.entries().next().value;gesture={type:'pan',id,x:p.x,y:p.y,dx:session?.dx||0,dy:session?.dy||0};}else if(!pointers.size)gesture=null;
}
function onWheel(e){if(!session)return;e.preventDefault();session.zoom=clamp(session.zoom*Math.exp(-e.deltaY*.0015),.72,4.5);draw();}

function beginResize(e){
  if(!session)return;e.preventDefault();e.stopPropagation();const handle=e.currentTarget.dataset.handle,p=pointInCanvas(e);resizeGesture={id:e.pointerId,handle,start:p,rect:{...session.crop}};e.currentTarget.setPointerCapture?.(e.pointerId);
  const move=ev=>resizeMove(ev),up=ev=>{if(ev.pointerId!==resizeGesture?.id)return;e.currentTarget.removeEventListener('pointermove',move);e.currentTarget.removeEventListener('pointerup',up);e.currentTarget.removeEventListener('pointercancel',up);resizeGesture=null;};
  e.currentTarget.addEventListener('pointermove',move);e.currentTarget.addEventListener('pointerup',up);e.currentTarget.addEventListener('pointercancel',up);
}
function resizeMove(e){
  if(!session||!resizeGesture||e.pointerId!==resizeGesture.id)return;const p=pointInCanvas(e),g=resizeGesture,r=g.rect,min=110,pad=12;let x1=r.x,y1=r.y,x2=r.x+r.w,y2=r.y+r.h;
  if(g.handle.includes('w'))x1=clamp(r.x+(p.x-g.start.x),pad,x2-min);else x2=clamp(r.x+r.w+(p.x-g.start.x),x1+min,W-pad);
  if(g.handle.includes('n'))y1=clamp(r.y+(p.y-g.start.y),pad,y2-min);else y2=clamp(r.y+r.h+(p.y-g.start.y),y1+min,H-pad);
  if(session.aspect!=='freeform'){
    const ratio=session.aspect==='square'?1:currentImageRatio(),anchorX=g.handle.includes('w')?x2:x1,anchorY=g.handle.includes('n')?y2:y1;
    let w=Math.max(min,Math.abs(x2-x1)),h=w/ratio;if(h>H-2*pad){h=H-2*pad;w=h*ratio;}
    if(g.handle.includes('w')){x1=anchorX-w;x2=anchorX}else{x1=anchorX;x2=anchorX+w}
    if(g.handle.includes('n')){y1=anchorY-h;y2=anchorY}else{y1=anchorY;y2=anchorY+h}
    if(x1<pad){x2+=pad-x1;x1=pad}if(x2>W-pad){x1-=x2-(W-pad);x2=W-pad}if(y1<pad){y2+=pad-y1;y1=pad}if(y2>H-pad){y1-=y2-(H-pad);y2=H-pad}
  }
  session.crop={x:x1,y:y1,w:x2-x1,h:y2-y1};updateOverlay();
}

function finish(result){
  const d=document.getElementById('cardfolioIosCropDialog');if(d?.open)d.close();pointers.clear();gesture=null;resizeGesture=null;const resolve=resolveCrop;resolveCrop=null;session=null;if(resolve)resolve(result);
}
function applyCrop(){
  if(!session)return;const k=2,scene=document.createElement('canvas');scene.width=W*k;scene.height=H*k;drawScene(scene.getContext('2d'),scene.width,scene.height);
  const r=session.crop,out=document.createElement('canvas');out.width=Math.max(1,Math.round(r.w*k));out.height=Math.max(1,Math.round(r.h*k));out.getContext('2d',{alpha:false}).drawImage(scene,r.x*k,r.y*k,r.w*k,r.h*k,0,0,out.width,out.height);
  out.toBlob(blob=>{if(!blob){finish(null);return;}const file=new File([blob],`card-crop-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});finish({file,meta:{mode:'crop',rotation:session?.rotation||0,flip:!!session?.flipX,zoom:Number((session?.zoom||1).toFixed(2)),aspect:session?.aspect||'freeform',ratio:`${Math.round(r.w)}:${Math.round(r.h)}`}});},'image/jpeg',.94);
}
async function cropCard(file){
  ensureDialog();const img=new Image(),url=URL.createObjectURL(file);
  try{await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});}catch{URL.revokeObjectURL(url);return {file,meta:{mode:'original',reason:'preview_unavailable'}};}URL.revokeObjectURL(url);
  session={file,img,zoom:1,rotation:0,flipX:false,dx:0,dy:0,aspect:'freeform',crop:cropRectForRatio(5/7,.86)};draw();document.getElementById('cardfolioIosCropDialog').showModal();return new Promise(resolve=>{resolveCrop=resolve;});
}

async function detectCodes(file){
  if(!('BarcodeDetector' in window))return[];
  try{const formats=await BarcodeDetector.getSupportedFormats?.()||[];const preferred=['qr_code','code_128','ean_13','ean_8','data_matrix','pdf417'].filter(x=>formats.includes(x));if(!preferred.length)return[];const detector=new BarcodeDetector({formats:preferred}),bitmap=await createImageBitmap(file),results=await detector.detect(bitmap);bitmap.close?.();return(results||[]).map(r=>({format:r.format,rawValue:String(r.rawValue||'').slice(0,300)})).filter(r=>r.rawValue).slice(0,8);}catch{return[];}
}
function nameCandidates(ocr=''){return[...new Set(String(ocr).split(/\n+/).map(text).filter(line=>line.length>=3&&line.length<=45&&/[A-Za-z]/.test(line)&&!/(TOPPS|PANINI|PRIZM|SELECT|MOSAIC|OPTIC|DONRUSS|BOWMAN|UPPER DECK|POK[EÉ]MON|AUTHENTIC|COPYRIGHT|TRADEMARK|CARD NO|WWW\.|HTTP)/i.test(line)))].slice(0,5);}
async function runOcr(file){if(!window.Tesseract)throw new Error('OCR library unavailable');return window.Tesseract.recognize(file,'eng',{logger:m=>{const status=document.getElementById('scanStatus');if(status&&m.status==='recognizing text')status.textContent=`Reading card… ${Math.round((m.progress||0)*100)}%`;}});}

window.scanFile=async function(file){
  if(!file)return;if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'image/jpeg')){if(typeof toast==='function')toast('Choose a card photo');return;}if(file.size>18*1024*1024){if(typeof toast==='function')toast('Image is too large');return;}
  const crop=await cropCard(file);if(!crop)return;const prepared=crop.file,status=document.getElementById('scanStatus');if(status)status.textContent='Preparing card…';
  const preview=typeof fileToPreview==='function'?await fileToPreview(prepared):URL.createObjectURL(prepared);const codesPromise=detectCodes(prepared);
  state.scan={file,croppedFile:prepared,imageDataUrl:preview,text:'',confidence:0,fields:{},nameSuggestions:[],crop:crop.meta,codes:[]};
  try{const result=await runOcr(prepared),ocr=result.data?.text||'',confidence=Math.round(result.data?.confidence||0),fields=typeof parseOcr==='function'?parseOcr(ocr):{};state.scan.text=ocr;state.scan.confidence=confidence;state.scan.fields=fields||{};state.scan.nameSuggestions=nameCandidates(ocr);state.scan.codes=await codesPromise;if(!state.scan.fields.subject&&state.scan.nameSuggestions.length)state.scan.fields.subject=state.scan.nameSuggestions[0];if(status)status.textContent='Review the extracted card details.';if(typeof showScanReview==='function')showScanReview();}
  catch(err){console.warn('Card OCR failed',err);state.scan.codes=await codesPromise;if(status)status.textContent='OCR could not finish. You can still review and add the cropped card manually.';if(typeof showScanReview==='function')showScanReview();}
  try{if(typeof window.cardfolioAnalyzeScanWithVision==='function')await window.cardfolioAnalyzeScanWithVision();}catch(err){console.warn('Visual fingerprint deferred',err);}
};

window.cardfolioCropEditorVersion='ios-crop-20260907-1';
})();
