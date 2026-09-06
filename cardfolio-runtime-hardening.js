/* Cardfolio runtime hardening — loaded after product layers.
   Keeps crop UI independent from older vNext DOM, links migrated holdings to canonical
   assets, and preserves language/crop/code metadata without changing market evidence. */
(function(){
'use strict';

const hardenBaseReadCardForm=window.readCardForm;
const hardenBaseSyncCloud=window.syncCloud;
let linkingCanonical=false;
let cropSession=null;
let cropResolve=null;

function text(v=''){return String(v??'').trim().replace(/\s+/g,' ')}
function identityPayload(h){
  return {
    category:h.category||'Other',subject:text(h.subject),year:text(h.year),manufacturer:text(h.manufacturer),brand:text(h.brand),
    set_name:text(h.set_name),subset:text(h.subset||h.metadata?.subset),card_number:text(h.card_number),parallel:text(h.parallel),
    variant_name:text(h.variant_name),card_type:text(h.card_type),team:text(h.team),league:text(h.league),rookie:!!h.rookie,
    autograph:!!h.autograph,relic:!!h.relic,serial_number:text(h.serial_number),grading_company:text(h.grading_company),grade:text(h.grade),
    language:text(h.language||h.metadata?.language),edition:text(h.edition||h.metadata?.edition)
  };
}

if(typeof hardenBaseReadCardForm==='function'){
  window.readCardForm=function(){
    const h=hardenBaseReadCardForm();
    const cardLanguage=document.getElementById('cardLanguage')?.value||document.getElementById('language')?.value||'';
    const edition=document.getElementById('edition')?.value||'';
    const subset=document.getElementById('subset')?.value||'';
    h.language=text(h.language||cardLanguage);
    h.edition=text(h.edition||edition);
    h.subset=text(h.subset||subset);
    h.metadata={...(h.metadata||{}),language:h.language||null,edition:h.edition||null,subset:h.subset||null};
    return h;
  };
}

async function linkUnresolvedHoldings(){
  if(linkingCanonical||!state.supabase||!state.user)return false;
  const missing=(state.holdings||[]).filter(h=>!h.canonical_card_id&&text(h.subject)).slice(0,50);
  if(!missing.length)return false;
  linkingCanonical=true;
  let changed=false;
  try{
    for(const h of missing){
      const {data:id,error}=await state.supabase.rpc('resolve_canonical_card',{p_identity:identityPayload(h)});
      if(error||!id){console.warn('Deferred canonical link',h.id,error);continue;}
      const {data:canonical}=await state.supabase.from('canonical_cards').select('id,current_price,valuation_status,valuation_source_summary,valuation_observed_at').eq('id',id).maybeSingle();
      const patch={canonical_card_id:id,valuation_status:canonical?.valuation_status||'pending_price',updated_at:new Date().toISOString()};
      if(canonical&&canonical.current_price!==null&&canonical.current_price!==undefined&&Number.isFinite(Number(canonical.current_price))){
        patch.market_value=Number(canonical.current_price);
        patch.valuation_source=canonical.valuation_source_summary||'Cardfolio shared market';
        patch.valuation_observed_at=canonical.valuation_observed_at||new Date().toISOString();
      }
      const {error:updateError}=await state.supabase.from('card_holdings').update(patch).eq('id',h.id).eq('user_id',state.user.id);
      if(!updateError)changed=true;
    }
  }finally{linkingCanonical=false;}
  return changed;
}

if(typeof hardenBaseSyncCloud==='function'){
  window.syncCloud=async function(){
    await hardenBaseSyncCloud();
    const changed=await linkUnresolvedHoldings();
    if(changed)await hardenBaseSyncCloud();
  };
}

function ensureHardCropDialog(){
  if(document.getElementById('cardfolioHardCropDialog'))return;
  const d=document.createElement('dialog');d.id='cardfolioHardCropDialog';d.className='modal crop-modal';
  d.innerHTML=`<div class="modal-card liquid-modal"><div class="modal-head"><div><div class="eyebrow">Prepare scan</div><h2>Crop your card</h2><p class="holding-meta">Drag to reposition, zoom, or rotate. Only the framed card is sent to on-device OCR.</p></div><button class="icon-btn" id="hardCropCancel" aria-label="Cancel">×</button></div><div class="hard-crop-stage"><canvas id="hardCropCanvas" width="700" height="980" aria-label="Crop preview"></canvas><div class="hard-crop-guide"></div></div><div class="crop-controls"><label>Zoom<input id="hardCropZoom" type="range" min="1" max="3.6" value="1" step="0.01" /></label><div class="button-row"><button class="btn secondary" id="hardCropLeft" type="button">↺ Rotate</button><button class="btn secondary" id="hardCropRight" type="button">Rotate ↻</button></div></div><div class="button-row spread"><button class="btn secondary" id="hardCropOriginal" type="button">Use full photo</button><button class="btn primary" id="hardCropApply" type="button">Use crop</button></div></div>`;
  document.body.appendChild(d);
  const canvas=document.getElementById('hardCropCanvas');let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(!cropSession)return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:cropSession.dx,dy:cropSession.dy};});
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||!cropSession)return;const r=canvas.getBoundingClientRect();cropSession.dx=drag.dx+(e.clientX-drag.x)*(canvas.width/r.width);cropSession.dy=drag.dy+(e.clientY-drag.y)*(canvas.height/r.height);drawCrop();});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  document.getElementById('hardCropZoom').addEventListener('input',e=>{if(cropSession){cropSession.zoom=Number(e.target.value);drawCrop();}});
  document.getElementById('hardCropLeft').addEventListener('click',()=>rotateCrop(-90));
  document.getElementById('hardCropRight').addEventListener('click',()=>rotateCrop(90));
  document.getElementById('hardCropCancel').addEventListener('click',()=>finishCrop(null));
  document.getElementById('hardCropOriginal').addEventListener('click',()=>finishCrop(cropSession?{file:cropSession.file,meta:{mode:'original'}}:null));
  document.getElementById('hardCropApply').addEventListener('click',applyCrop);
}
function rotateCrop(delta){if(!cropSession)return;cropSession.rotation=(cropSession.rotation+delta+360)%360;cropSession.dx=0;cropSession.dy=0;drawCrop();}
function drawCrop(){
  if(!cropSession)return;const canvas=document.getElementById('hardCropCanvas'),ctx=canvas.getContext('2d'),img=cropSession.img,W=canvas.width,H=canvas.height;
  const quarter=cropSession.rotation%180!==0,rw=quarter?img.naturalHeight:img.naturalWidth,rh=quarter?img.naturalWidth:img.naturalHeight;
  const scale=Math.max(W/rw,H/rh)*cropSession.zoom,bw=rw*scale,bh=rh*scale;
  const maxX=Math.max(0,(bw-W)/2),maxY=Math.max(0,(bh-H)/2);cropSession.dx=Math.max(-maxX,Math.min(maxX,cropSession.dx));cropSession.dy=Math.max(-maxY,Math.min(maxY,cropSession.dy));
  ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(W/2+cropSession.dx,H/2+cropSession.dy);ctx.rotate(cropSession.rotation*Math.PI/180);ctx.scale(scale,scale);ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);ctx.restore();
}
function finishCrop(result){const d=document.getElementById('cardfolioHardCropDialog');if(d?.open)d.close();const resolve=cropResolve;cropResolve=null;cropSession=null;if(resolve)resolve(result);}
function applyCrop(){
  const canvas=document.getElementById('hardCropCanvas');if(!canvas||!cropSession)return;
  canvas.toBlob(blob=>{if(!blob){finishCrop(null);return;}const file=new File([blob],`card-crop-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});finishCrop({file,meta:{mode:'crop',rotation:cropSession.rotation,zoom:Number(cropSession.zoom.toFixed(2)),ratio:'2.5:3.5'}});},'image/jpeg',.92);
}
async function cropCard(file){
  ensureHardCropDialog();const img=new Image(),url=URL.createObjectURL(file);
  try{await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});}catch{URL.revokeObjectURL(url);return {file,meta:{mode:'original',reason:'preview_unavailable'}};}URL.revokeObjectURL(url);
  cropSession={file,img,zoom:1,rotation:0,dx:0,dy:0};document.getElementById('hardCropZoom').value='1';drawCrop();document.getElementById('cardfolioHardCropDialog').showModal();
  return new Promise(resolve=>{cropResolve=resolve;});
}

async function detectCodes(file){
  if(!('BarcodeDetector' in window))return[];
  try{
    const formats=await BarcodeDetector.getSupportedFormats?.()||[];const preferred=['qr_code','code_128','ean_13','ean_8','data_matrix','pdf417'].filter(x=>formats.includes(x));if(!preferred.length)return[];
    const detector=new BarcodeDetector({formats:preferred}),bitmap=await createImageBitmap(file),results=await detector.detect(bitmap);bitmap.close?.();
    return (results||[]).map(r=>({format:r.format,rawValue:String(r.rawValue||'').slice(0,300)})).filter(r=>r.rawValue).slice(0,8);
  }catch{return[];}
}
function nameCandidates(ocr=''){
  return [...new Set(String(ocr).split(/\n+/).map(text).filter(line=>line.length>=3&&line.length<=45&&/[A-Za-z]/.test(line)&&!/(TOPPS|PANINI|PRIZM|SELECT|MOSAIC|OPTIC|DONRUSS|BOWMAN|UPPER DECK|POK[EÉ]MON|AUTHENTIC|COPYRIGHT|TRADEMARK|CARD NO|WWW\.|HTTP)/i.test(line)))].slice(0,5);
}
async function runOcr(file){
  if(!window.Tesseract)throw new Error('OCR library unavailable');
  return window.Tesseract.recognize(file,'eng',{logger:m=>{const status=document.getElementById('scanStatus');if(status&&m.status==='recognizing text')status.textContent=`Reading card… ${Math.round((m.progress||0)*100)}%`;}});
}

window.scanFile=async function(file){
  if(!file)return;if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'image/jpeg')){toast('Choose a card photo');return;}if(file.size>18*1024*1024){toast('Image is too large');return;}
  const crop=await cropCard(file);if(!crop)return;const prepared=crop.file,status=document.getElementById('scanStatus');if(status)status.textContent='Preparing card…';
  const preview=await fileToPreview(prepared);const codesPromise=detectCodes(prepared);state.scan={file,croppedFile:prepared,imageDataUrl:preview,text:'',confidence:0,fields:{},nameSuggestions:[],crop:crop.meta,codes:[]};
  try{
    const result=await runOcr(prepared),ocr=result.data?.text||'',confidence=Math.round(result.data?.confidence||0),fields=typeof parseOcr==='function'?parseOcr(ocr):{};
    state.scan.text=ocr;state.scan.confidence=confidence;state.scan.fields=fields||{};state.scan.nameSuggestions=nameCandidates(ocr);state.scan.codes=await codesPromise;
    if(!state.scan.fields.subject&&state.scan.nameSuggestions.length)state.scan.fields.subject=state.scan.nameSuggestions[0];
    if(status)status.textContent='Review the extracted card details.';showScanReview();
  }catch(err){console.warn('Card OCR failed',err);state.scan.codes=await codesPromise;if(status)status.textContent='OCR could not finish. You can still review and add the cropped card manually.';showScanReview();}
};

/* Extra crop styling is injected here so this hardening layer stays self-contained. */
if(!document.getElementById('cardfolioHardCropStyles')){
  const style=document.createElement('style');style.id='cardfolioHardCropStyles';style.textContent=`.hard-crop-stage{position:relative;width:min(350px,82vw);aspect-ratio:5/7;margin:0 auto;border-radius:25px;overflow:hidden;background:#dce5ee;box-shadow:0 20px 50px rgba(37,67,96,.14);touch-action:none}.hard-crop-stage canvas{display:block;width:100%;height:100%;touch-action:none}.hard-crop-guide{position:absolute;inset:0;border:2px solid rgba(255,255,255,.86);border-radius:25px;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(10,132,255,.12),inset 0 0 42px rgba(255,255,255,.12)}`;document.head.appendChild(style);
}
})();
