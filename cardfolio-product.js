/* Cardfolio product layer — canonical shared cards, crop-first scanning, pending pricing,
   category albums, card detail market pages, and Google OAuth. Loaded last so it can
   safely upgrade the original MVP without losing its local/cloud fallbacks. */
(function(){
'use strict';

const CATEGORY_ORDER=['NBA','WNBA','Soccer','Pokémon','Baseball','Football','Hockey','UFC / MMA','Wrestling','Formula 1','NASCAR','College','Other'];
const PRODUCT_PATTERNS=[
  ['Topps Chrome',/\bTOPPS\s+CHROME\b/i],['Topps Finest',/\bTOPPS\s+FINEST\b/i],['Topps Now',/\bTOPPS\s+NOW\b/i],
  ['Bowman Chrome',/\bBOWMAN\s+CHROME\b/i],['Bowman',/\bBOWMAN\b/i],['Prizm',/\bPRIZM\b/i],['Select',/\bSELECT\b/i],
  ['Donruss Optic',/\bDONRUSS\s+OPTIC\b|\bOPTIC\b/i],['Mosaic',/\bMOSAIC\b/i],['NBA Hoops',/\bNBA\s+HOOPS\b|\bHOOPS\b/i],
  ['Court Kings',/\bCOURT\s+KINGS\b/i],['National Treasures',/\bNATIONAL\s+TREASURES\b/i],['Flawless',/\bFLAWLESS\b/i],
  ['Immaculate',/\bIMMACULATE\b/i],['Origins',/\bORIGINS\b/i],['Revolution',/\bREVOLUTION\b/i],['Spectra',/\bSPECTRA\b/i],
  ['Upper Deck',/\bUPPER\s+DECK\b/i],['Pokémon',/\bPOK[EÉ]MON\b/i]
];
const MANUFACTURER_PATTERNS=[['Topps',/\bTOPPS\b/i],['Panini',/\bPANINI\b/i],['Upper Deck',/\bUPPER\s+DECK\b/i],['Leaf',/\bLEAF\b/i],['Pokémon',/\bPOK[EÉ]MON\b/i],['Fleer',/\bFLEER\b/i]];
const PARALLEL_WORDS=['superfractor','refractor','x-fractor','sapphire','aqua','sepia','negative','black','gold','orange','red','blue','green','purple','pink','silver','white','wave','mojo','shimmer','sparkle','glitter','ice','cracked ice','disco','scope','laser','pulsar','velocity','holofoil','reverse holo','holo','genesis','zebra','tiger','elephant','snakeskin','cosmic','neon','photo variation','image variation'];
const NOISE_LINES=/^(TOPPS|PANINI|PRIZM|SELECT|MOSAIC|OPTIC|DONRUSS|BOWMAN|POK[EÉ]MON|NBA|NFL|MLB|NHL|UEFA|FIFA|ROOKIE|RC|AUTOGRAPH|AUTHENTIC|TRADING CARD|CARD)$/i;

function ensureProductState(){
  if(!state.canonicalIndex)state.canonicalIndex=new Map();
  if(!state.marketDetailCache)state.marketDetailCache=new Map();
  if(!state.categoryOpen)state.categoryOpen={};
  if(!state.crop)state.crop=null;
}
ensureProductState();

function escapeAttr(v=''){return escapeHtml(String(v)).replace(/`/g,'&#96;')}
function numeric(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function normalizeText(v=''){return String(v||'').trim().replace(/\s+/g,' ')}
function safeLower(v=''){return normalizeText(v).toLowerCase()}
function displayCategory(h){
  const category=normalizeText(h?.category||'Other');
  const league=normalizeText(h?.league||'').toUpperCase();
  if(category==='Basketball') return league==='WNBA'?'WNBA':'NBA';
  if(category==='WNBA')return 'WNBA';
  if(category==='Soccer')return 'Soccer';
  if(category==='Pokémon'||/pok[eé]mon/i.test(category))return 'Pokémon';
  return category||'Other';
}
function displayName(h){
  if(normalizeText(h?.display_name))return normalizeText(h.display_name);
  const parts=[h?.subject,h?.year,h?.brand||h?.manufacturer,h?.card_number?`#${h.card_number}`:'',h?.parallel].filter(Boolean);
  return parts.join(' · ')||'Untitled card';
}
function unitPrice(h){
  if(numeric(h?._canonical?.current_price))return Number(h._canonical.current_price);
  if(numeric(h?.market_value))return Number(h.market_value);
  if(numeric(h?.manual_value))return Number(h.manual_value);
  return null;
}
function holdingValueV2(h){const p=unitPrice(h);return p===null?0:p*Number(h.quantity||1)}
function isPending(h){
  const s=h?._canonical?.valuation_status||h?.valuation_status;
  return !numeric(unitPrice(h))||['pending_price','stale','insufficient_data','error'].includes(s);
}
function priceStatus(h){
  const c=h?._canonical;
  const s=c?.valuation_status||h?.valuation_status||'pending_price';
  if(numeric(unitPrice(h))&&s==='priced')return {label:'Live market',className:'priced'};
  if(s==='insufficient_data')return {label:'Needs more comps',className:'pending'};
  if(s==='stale')return {label:'Refreshing',className:'pending'};
  if(s==='error')return {label:'Research retry',className:'pending'};
  return {label:'Pending price',className:'pending'};
}
function identitySignature(h){
  return [h.category,h.subject,h.year,h.manufacturer,h.brand,h.set_name,h.card_number,h.parallel,!!h.autograph,!!h.relic,(h.serial_number||'').split('/')[1]||'',h.grading_company,h.grade,h.language,h.edition].map(x=>safeLower(x)).join('|');
}
function canonicalIdentityPayload(h){
  return {
    category:h.category||'Other',subject:normalizeText(h.subject),year:normalizeText(h.year),manufacturer:normalizeText(h.manufacturer),
    brand:normalizeText(h.brand),set_name:normalizeText(h.set_name),subset:normalizeText(h.subset),card_number:normalizeText(h.card_number),
    parallel:normalizeText(h.parallel),variant_name:normalizeText(h.variant_name),card_type:normalizeText(h.card_type),team:normalizeText(h.team),
    league:normalizeText(h.league),rookie:!!h.rookie,autograph:!!h.autograph,relic:!!h.relic,serial_number:normalizeText(h.serial_number),
    grading_company:normalizeText(h.grading_company),grade:normalizeText(h.grade),language:normalizeText(h.language),edition:normalizeText(h.edition)
  };
}
function localIdentityKey(h){return identitySignature(h)}
function canonicalMeta(h){return h?._canonical||state.canonicalIndex.get(h?.canonical_card_id)||null}

/* ---------- Cloud synchronization / shared canonical market ---------- */
async function fetchCanonicalMap(ids){
  const out=new Map();
  if(!state.supabase||!ids.length)return out;
  const unique=[...new Set(ids.filter(Boolean))];
  if(!unique.length)return out;
  const {data,error}=await state.supabase.from('canonical_cards').select('*').in('id',unique);
  if(error){console.warn('Canonical card fetch failed',error);return out}
  for(const row of data||[])out.set(row.id,row);
  return out;
}

const originalSyncCloud=typeof syncCloud==='function'?syncCloud:null;
syncCloud=async function(){
  if(!state.supabase||!state.user)return;
  ensureProductState();
  const [{data:h,error:he},{data:s,error:se},{data:w,error:we}]=await Promise.all([
    state.supabase.from('card_holdings').select('*').order('created_at',{ascending:false}),
    state.supabase.from('price_snapshots').select('*').order('observed_at',{ascending:true}),
    state.supabase.from('watchlist_items').select('*').order('created_at',{ascending:false})
  ]);
  if(he||se||we){toast('Cloud sync failed');return}
  state.holdings=(h||[]).map(fromDb);
  state.snapshots=s||[];
  state.watchlist=(w||[]).map(x=>({...x,target_price:x.target_price===null?'':Number(x.target_price)}));
  state.canonicalIndex=await fetchCanonicalMap(state.holdings.map(x=>x.canonical_card_id));
  for(const holding of state.holdings){
    const c=state.canonicalIndex.get(holding.canonical_card_id);
    if(!c)continue;
    holding._canonical=c;
    holding.valuation_status=c.valuation_status||holding.valuation_status;
    if(numeric(c.current_price)){
      holding.market_value=Number(c.current_price);
      holding.valuation_source=c.valuation_source_summary||holding.valuation_source||'Cardfolio shared market';
      holding.valuation_observed_at=c.valuation_observed_at||holding.valuation_observed_at;
    }
  }
  await hydrateSignedImages();
};

const originalToDb=typeof toDb==='function'?toDb:null;
toDb=function(h){
  const allowed=['id','category','subject','year','manufacturer','brand','set_name','card_number','parallel','serial_number','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value','grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','tcgdex_card_id','market_value','valuation_source','valuation_observed_at','external_ids','metadata','canonical_card_id','valuation_status','display_name'];
  const out={};
  for(const k of allowed){
    if(k==='external_ids'||k==='metadata')out[k]=h[k]&&typeof h[k]==='object'?h[k]:{};
    else out[k]=h[k]??null;
  }
  for(const k of ['cost_basis','manual_value','market_value'])if(out[k]==='')out[k]=null;
  for(const k of ['acquisition_date','valuation_observed_at'])if(out[k]==='')out[k]=null;
  out.user_id=state.user.id;
  out.updated_at=nowIso();
  return out;
};

async function resolveCanonical(h){
  if(!state.supabase||!state.user)return {id:null,card:null,error:null};
  const {data,error}=await state.supabase.rpc('resolve_canonical_card',{p_identity:canonicalIdentityPayload(h)});
  if(error)return {id:null,card:null,error};
  const id=data;
  const {data:card,error:readError}=await state.supabase.from('canonical_cards').select('*').eq('id',id).maybeSingle();
  return {id,card:card||null,error:readError||null};
}

/* ---------- Add fields + Google sign-in UI ---------- */
function ensureFormUpgrades(){
  const subject=document.getElementById('subject');
  if(subject&&!document.getElementById('displayName')){
    const formGrid=subject.closest('.form-grid');
    const subjectLabel=subject.closest('label');
    const label=document.createElement('label');
    label.innerHTML='Display name<input id="displayName" maxlength="180" placeholder="Auto-generated, but you can rename it" />';
    subjectLabel?.insertAdjacentElement('afterend',label);
    if(formGrid&&!document.getElementById('subset')){
      const subset=document.createElement('label');subset.innerHTML='Subset / insert<input id="subset" maxlength="120" placeholder="Insert or subset name" />';formGrid.appendChild(subset);
      const language=document.createElement('label');language.innerHTML='Language<input id="language" maxlength="40" placeholder="English" />';formGrid.appendChild(language);
      const edition=document.createElement('label');edition.innerHTML='Edition<input id="edition" maxlength="80" placeholder="1st Edition, Unlimited…" />';formGrid.appendChild(edition);
    }
  }
  const authForm=document.getElementById('authForm');
  if(authForm&&!document.getElementById('googleLoginBtn')){
    const explainer=document.getElementById('authExplainer');
    const wrap=document.createElement('div');
    wrap.className='oauth-wrap';
    wrap.innerHTML='<button type="button" id="googleLoginBtn" class="btn google-btn"><span class="google-g">G</span> Continue with Google</button><div class="oauth-divider"><span>or use email</span></div>';
    explainer?.insertAdjacentElement('afterend',wrap);
    document.getElementById('googleLoginBtn')?.addEventListener('click',googleSignIn);
  }
}
async function googleSignIn(){
  if(!state.supabase){toast('Cloud sign-in is unavailable');return}
  const btn=document.getElementById('googleLoginBtn');if(btn)btn.disabled=true;
  const redirectTo=location.origin+location.pathname;
  const {error}=await state.supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:false}});
  if(error){toast(`Google sign-in unavailable · ${error.message}`);if(btn)btn.disabled=false;}
}

const originalOpenCardDialog=typeof openCardDialog==='function'?openCardDialog:null;
openCardDialog=function(h=null,prefill=null){
  ensureFormUpgrades();
  const d=document.getElementById('cardDialog'),data=h||prefill||{};
  document.getElementById('cardDialogTitle').textContent=h?'Edit holding':'Add card';
  document.getElementById('cardId').value=h?.id||'';
  const map={category:'category',subject:'subject',displayName:'display_name',year:'year',manufacturer:'manufacturer',brand:'brand',setName:'set_name',subset:'subset',cardNumber:'card_number',parallel:'parallel',serialNumber:'serial_number',team:'team',league:'league',condition:'condition',quantity:'quantity',costBasis:'cost_basis',acquisitionSource:'acquisition_source',acquisitionDate:'acquisition_date',manualValue:'manual_value',gradingCompany:'grading_company',grade:'grade',certNumber:'cert_number',language:'language',edition:'edition',notes:'notes'};
  for(const [id,key] of Object.entries(map)){
    const el=document.getElementById(id);if(!el)continue;
    const defaultValue=id==='quantity'?1:(id==='condition'?'Raw — unknown':'');
    el.value=data[key]??defaultValue;
  }
  document.getElementById('rookie').checked=!!data.rookie;
  document.getElementById('autograph').checked=!!data.autograph;
  document.getElementById('relic').checked=!!data.relic;
  document.getElementById('deleteCardBtn').classList.toggle('hidden',!h);
  const manual=document.getElementById('manualValue');if(manual)manual.closest('label').classList.add('advanced-field');
  d.showModal();
};

const originalReadCardForm=typeof readCardForm==='function'?readCardForm:null;
readCardForm=function(){
  const get=id=>normalizeText(document.getElementById(id)?.value||'');
  const subject=get('subject');
  const base={
    id:get('cardId')||uuid(),category:get('category')||'Other',subject,display_name:get('displayName'),year:get('year'),manufacturer:get('manufacturer'),brand:get('brand'),
    set_name:get('setName'),subset:get('subset'),card_number:get('cardNumber'),parallel:get('parallel'),serial_number:get('serialNumber'),team:get('team'),league:get('league'),
    condition:get('condition')||'Raw — unknown',quantity:Number(get('quantity')||1),cost_basis:get('costBasis')===''?'':Number(get('costBasis')),acquisition_source:get('acquisitionSource'),
    acquisition_date:get('acquisitionDate')||null,manual_value:get('manualValue')===''?'':Number(get('manualValue')),grading_company:get('gradingCompany'),grade:get('grade'),cert_number:get('certNumber'),
    language:get('language'),edition:get('edition'),rookie:!!document.getElementById('rookie')?.checked,autograph:!!document.getElementById('autograph')?.checked,relic:!!document.getElementById('relic')?.checked,
    notes:get('notes'),updated_at:nowIso()
  };
  if(!base.display_name)base.display_name=suggestDisplayName(base);
  base.variant_name=suggestVariantName(base);
  base.card_type=suggestCardType(base);
  return base;
};

function suggestDisplayName(h){
  const core=[h.subject,h.year,h.brand||h.manufacturer,h.set_name,h.card_number?`#${h.card_number}`:''].filter(Boolean).join(' · ');
  const variant=suggestVariantName(h);return [core,variant&&variant!=='Base / standard'?variant:''].filter(Boolean).join(' · ');
}
function suggestVariantName(h){
  const parts=[];
  if(h.parallel)parts.push(h.parallel);
  if(h.autograph)parts.push('Autograph');
  if(h.relic)parts.push('Relic');
  const denom=(h.serial_number||'').split('/')[1];if(denom)parts.push(`/${denom}`);
  if(h.grading_company)parts.push(`${h.grading_company}${h.grade?` ${h.grade}`:''}`);
  return parts.join(' · ')||'Base / standard';
}
function suggestCardType(h){
  if(h.autograph&&h.relic)return 'Autograph relic';if(h.autograph)return 'Autograph';if(h.relic)return 'Relic';
  if(/insert|case hit|ssp|short print/i.test(`${h.subset||''} ${h.parallel||''}`))return 'Insert / variation';return 'Standard';
}

async function uploadPreparedPhoto(file){
  if(!state.supabase||!state.user||!file)return null;
  try{
    const blob=file instanceof Blob?await compressImage(file,1800,.88):await compressImage(file,1800,.88);
    const path=`${state.user.id}/${uuid()}.jpg`;
    const {error}=await state.supabase.storage.from('card-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(error)throw error;return path;
  }catch(err){console.warn('Photo upload failed',err);toast('Card saved, but photo upload failed');return null}
}

saveCardFromForm=async function(){
  const formHolding=readCardForm();
  if(!formHolding.subject){toast('Player or character name is required');return}
  const existing=state.holdings.find(x=>x.id===formHolding.id);
  const scanFields=!existing&&state.scan?.fields?state.scan.fields:{};
  const preserved=holdingSystemFields(existing||scanFields);
  const next={...preserved,...(existing?{created_at:existing.created_at}:{}),...formHolding};
  next.created_at=existing?.created_at||nowIso();
  next.display_name=next.display_name||suggestDisplayName(next);
  const identityChanged=!existing||identitySignature(existing)!==identitySignature(next);
  if(identityChanged){next.valuation_status='pending_price';next.market_value=null;next.valuation_source='';next.valuation_observed_at=null;}
  if(!next.image_url&&state.scan?.imageDataUrl)next.image_url=state.scan.imageDataUrl;
  next.metadata={...(next.metadata||{}),scan_confidence:state.scan?.confidence??next.metadata?.scan_confidence??null,scan_ocr:state.scan?.text?String(state.scan.text).slice(0,5000):next.metadata?.scan_ocr||null,identity_signature:identitySignature(next)};

  if(state.backend==='cloud'&&state.user){
    let uploadedPath=null;
    const uploadSource=state.scan?.croppedFile||state.scan?.file;
    if(!next.image_path&&uploadSource){uploadedPath=await uploadPreparedPhoto(uploadSource);if(uploadedPath)next.image_path=uploadedPath;}
    if(identityChanged||!next.canonical_card_id){
      const resolved=await resolveCanonical(next);
      if(resolved.id){
        next.canonical_card_id=resolved.id;next._canonical=resolved.card;
        if(resolved.card&&numeric(resolved.card.current_price)){
          next.market_value=Number(resolved.card.current_price);next.valuation_status=resolved.card.valuation_status||'priced';
          next.valuation_source=resolved.card.valuation_source_summary||'Cardfolio shared market';next.valuation_observed_at=resolved.card.valuation_observed_at||nowIso();
        }else next.valuation_status=resolved.card?.valuation_status||'pending_price';
      }else{
        console.warn('Canonical resolution deferred',resolved.error);next.canonical_card_id=null;next.valuation_status='pending_price';
      }
    }
    const {error}=await state.supabase.from('card_holdings').upsert(toDb(next));
    if(error){if(uploadedPath)await state.supabase.storage.from('card-images').remove([uploadedPath]).catch(()=>{});toast('Cloud save failed · no changes were applied');return}
    if(!existing&&numeric(next.market_value)&&next.valuation_source){
      await state.supabase.from('price_snapshots').insert({id:uuid(),holding_id:next.id,user_id:state.user.id,market_value:Number(next.market_value),quantity:Number(next.quantity||1),currency:'USD',source:next.valuation_source,observed_at:next.valuation_observed_at||nowIso(),raw_reference:{canonical_card_id:next.canonical_card_id}}).catch(()=>{});
    }
    await syncCloud();
  }else{
    next.canonical_card_id=null;next.valuation_status=next.valuation_status||'pending_price';
    next.metadata={...(next.metadata||{}),local_identity_key:localIdentityKey(next),needs_canonical_link:true};
    if(existing)Object.assign(existing,next);else state.holdings.unshift(next);
    saveLocal();
  }
  document.getElementById('cardDialog').close();state.scan=null;
  toast(existing?'Holding updated':'Added · price research queued');setView('portfolio');
};

/* ---------- Crop-first scan pipeline ---------- */
function ensureCropDialog(){
  if(document.getElementById('cropDialog'))return;
  const d=document.createElement('dialog');d.id='cropDialog';d.className='modal crop-modal';
  d.innerHTML=`<div class="modal-card crop-card"><div class="modal-head"><div><div class="eyebrow">Prepare scan</div><h2>Crop your card</h2><p class="muted crop-help">Drag to position. Pinch or use the slider to zoom.</p></div><button class="icon-btn" id="cropClose" aria-label="Close">×</button></div><div class="crop-stage" id="cropStage"><img id="cropImage" alt="Card crop preview" draggable="false"/><div class="crop-glass"></div></div><div class="crop-controls"><label>Zoom<input id="cropZoom" type="range" min="1" max="3.5" value="1" step="0.01" /></label><button class="btn secondary" id="cropReset">Reset</button></div><div class="button-row crop-actions"><button class="btn secondary" id="cropFull">Use full photo</button><button class="btn primary" id="cropApply">Use crop</button></div></div>`;
  document.body.appendChild(d);
  document.getElementById('cropClose').addEventListener('click',()=>{d.close();state.crop=null});
  document.getElementById('cropReset').addEventListener('click',resetCrop);
  document.getElementById('cropZoom').addEventListener('input',e=>{if(!state.crop)return;state.crop.zoom=Number(e.target.value);clampCrop();renderCropTransform()});
  document.getElementById('cropApply').addEventListener('click',applyCrop);
  document.getElementById('cropFull').addEventListener('click',useFullPhoto);
  const stage=document.getElementById('cropStage');
  stage.addEventListener('pointerdown',cropPointerDown);stage.addEventListener('pointermove',cropPointerMove);stage.addEventListener('pointerup',cropPointerUp);stage.addEventListener('pointercancel',cropPointerUp);
}
function resetCrop(){if(!state.crop)return;state.crop.zoom=1;state.crop.dx=0;state.crop.dy=0;const z=document.getElementById('cropZoom');if(z)z.value='1';renderCropTransform()}
function renderCropTransform(){
  const img=document.getElementById('cropImage');if(!img||!state.crop)return;
  img.style.transform=`translate3d(${state.crop.dx}px,${state.crop.dy}px,0) scale(${state.crop.zoom})`;
}
function clampCrop(){
  if(!state.crop)return;
  const stage=document.getElementById('cropStage'),img=document.getElementById('cropImage');if(!stage||!img)return;
  const sw=stage.clientWidth,sh=stage.clientHeight;
  const base=Math.max(sw/state.crop.naturalWidth,sh/state.crop.naturalHeight);
  const rw=state.crop.naturalWidth*base*state.crop.zoom,rh=state.crop.naturalHeight*base*state.crop.zoom;
  const maxX=Math.max(0,(rw-sw)/2),maxY=Math.max(0,(rh-sh)/2);
  state.crop.dx=Math.max(-maxX,Math.min(maxX,state.crop.dx));state.crop.dy=Math.max(-maxY,Math.min(maxY,state.crop.dy));
}
function cropPointerDown(e){if(!state.crop)return;e.currentTarget.setPointerCapture(e.pointerId);state.crop.drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:state.crop.dx,dy:state.crop.dy}}
function cropPointerMove(e){if(!state.crop?.drag||state.crop.drag.id!==e.pointerId)return;state.crop.dx=state.crop.drag.dx+(e.clientX-state.crop.drag.x);state.crop.dy=state.crop.drag.dy+(e.clientY-state.crop.drag.y);clampCrop();renderCropTransform()}
function cropPointerUp(e){if(state.crop?.drag?.id===e.pointerId)state.crop.drag=null}
async function openCropper(file){
  ensureCropDialog();
  const url=URL.createObjectURL(file),img=document.getElementById('cropImage');
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
  state.crop={file,url,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,zoom:1,dx:0,dy:0,drag:null};
  document.getElementById('cropZoom').value='1';renderCropTransform();document.getElementById('cropDialog').showModal();
}
async function applyCrop(){
  if(!state.crop)return;
  const stage=document.getElementById('cropStage');
  const sw=stage.clientWidth,sh=stage.clientHeight,nw=state.crop.naturalWidth,nh=state.crop.naturalHeight;
  const base=Math.max(sw/nw,sh/nh),scale=base*state.crop.zoom,rw=nw*scale,rh=nh*scale;
  const left=(sw-rw)/2+state.crop.dx,top=(sh-rh)/2+state.crop.dy;
  let sx=-left/scale,sy=-top/scale,sourceW=sw/scale,sourceH=sh/scale;
  sx=Math.max(0,Math.min(nw-sourceW,sx));sy=Math.max(0,Math.min(nh-sourceH,sy));
  const outW=1200,outH=Math.round(outW*(sh/sw));const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
  const bitmap=await createImageBitmap(state.crop.file);canvas.getContext('2d',{alpha:false}).drawImage(bitmap,sx,sy,sourceW,sourceH,0,0,outW,outH);bitmap.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
  const cropped=new File([blob],`card-crop-${Date.now()}.jpg`,{type:'image/jpeg'});const original=state.crop.file;
  URL.revokeObjectURL(state.crop.url);document.getElementById('cropDialog').close();state.crop=null;await processScanFile(cropped,original);
}
async function useFullPhoto(){if(!state.crop)return;const file=state.crop.file;URL.revokeObjectURL(state.crop.url);document.getElementById('cropDialog').close();state.crop=null;await processScanFile(file,file)}

scanFile=async function(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'image/jpeg')){toast('Choose a card photo');return}
  if(file.size>18*1024*1024){toast('Image is too large');return}
  try{await openCropper(file)}catch(err){console.warn('Cropper unavailable',err);await processScanFile(file,file)}
};

async function processScanFile(file,originalFile){
  const status=document.getElementById('scanStatus');if(status)status.textContent='Preparing card…';
  const preview=await fileToPreview(file);
  state.scan={file:originalFile||file,croppedFile:file,imageDataUrl:preview,text:'',confidence:0,fields:{},nameSuggestions:[]};
  try{
    if(!window.Tesseract)throw new Error('OCR library unavailable');
    if(status)status.textContent='Reading card on-device…';
    const result=await window.Tesseract.recognize(file,'eng',{logger:m=>{if(m.status==='recognizing text'&&status)status.textContent=`Reading card… ${Math.round((m.progress||0)*100)}%`}});
    const text=result.data?.text||'',confidence=Math.round(result.data?.confidence||0);
    const parsed=parseOcrV2(text);
    state.scan.text=text;state.scan.confidence=confidence;state.scan.fields=parsed.fields;state.scan.nameSuggestions=parsed.nameSuggestions;
    showScanReview();
  }catch(err){console.warn('OCR failed',err);if(status)status.textContent='OCR could not finish. You can still add the cropped card manually.';state.scan.fields={};showScanReview();}
}

function parseOcrV2(text){
  const rawLines=String(text||'').split(/\n+/).map(normalizeText).filter(Boolean);
  const upper=String(text||'').toUpperCase();
  let category='Other';
  if(/\bNBA\b|BASKETBALL|LAKERS|CELTICS|WARRIORS|SPURS|KNICKS|HEAT|BUCKS|MAVERICKS|76ERS|SIXERS/i.test(upper))category='Basketball';
  else if(/\bWNBA\b/i.test(upper))category='WNBA';
  else if(/SOCCER|FOOTBALL CLUB|UEFA|FIFA|CHAMPIONS LEAGUE|PREMIER LEAGUE|LA LIGA|BUNDESLIGA|SERIE A/i.test(upper))category='Soccer';
  else if(/\bMLB\b|BASEBALL/i.test(upper))category='Baseball';
  else if(/\bNFL\b|AMERICAN FOOTBALL/i.test(upper))category='Football';
  else if(/\bNHL\b|HOCKEY/i.test(upper))category='Hockey';
  else if(/POK[EÉ]MON|TRAINER|ENERGY/i.test(upper))category='Pokémon';
  else if(/\bUFC\b|MMA/i.test(upper))category='UFC / MMA';
  else if(/\bWWE\b|WRESTLING/i.test(upper))category='Wrestling';
  else if(/FORMULA\s*1|\bF1\b/i.test(upper))category='Formula 1';
  else if(/NASCAR/i.test(upper))category='NASCAR';
  const year=(String(text).match(/\b(?:19|20)\d{2}(?:[-–/]\d{2,4})?\b/)||[])[0]||'';
  const manufacturer=(MANUFACTURER_PATTERNS.find(([,re])=>re.test(text))||[])[0]||'';
  const brand=(PRODUCT_PATTERNS.find(([,re])=>re.test(text))||[])[0]||'';
  const cardNumber=(String(text).match(/(?:#|NO\.?|CARD\s*(?:NO\.?|#)?)\s*([A-Z0-9-]{1,18})\b/i)||[])[1]||'';
  const serial=(String(text).match(/\b(\d{1,5}\s*\/\s*\d{1,6})\b/)||[])[1]?.replace(/\s/g,'')||'';
  const gradingCompany=(String(text).match(/\b(PSA|BGS|BECKETT|CGC|SGC|TAG)\b/i)||[])[1]?.toUpperCase().replace('BECKETT','BGS')||'';
  const gradeMatch=gradingCompany?String(text).match(new RegExp(`${gradingCompany === 'BGS'?'(?:BGS|BECKETT)':gradingCompany}\\s*(?:GEM\\s*MINT|MINT|NM-MT|NM)?\\s*([0-9](?:\\.[0-9])?|10)\\b`,'i')):null;
  const grade=gradeMatch?.[1]||'';
  const rookie=/\bROOKIE\b|\bRC\b|ROOKIE CARD/i.test(text);
  const autograph=/AUTOGRAPH|CERTIFIED AUTO|AUTO\b|SIGNATURE|SIGNED/i.test(text);
  const relic=/RELIC|MEMORABILIA|JERSEY|PATCH|GAME[- ]USED|PLAYER[- ]WORN/i.test(text);
  const parallel=PARALLEL_WORDS.find(word=>new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&').replace(/\s+/g,'\\s+')}\\b`,'i').test(text))||'';
  const subset=rawLines.find(line=>/INSERT|DEBUT|ROOKIE DEBUT|FUTURE STARS|ALL[- ]STAR|LEGENDS|PHENOMS|BREAKOUT|RISING|PROSPECT/i.test(line))||'';
  const candidates=rawLines.filter(line=>{
    const u=line.toUpperCase();
    if(line.length<3||line.length>44||NOISE_LINES.test(line)||/^\d+$/.test(line))return false;
    if(PRODUCT_PATTERNS.some(([,re])=>re.test(line))||MANUFACTURER_PATTERNS.some(([,re])=>re.test(line)))return false;
    if(/COPYRIGHT|LICENSED|AUTHENTIC|GUARANTEED|CONGRATULATIONS|WWW\.|HTTP|CARD NO|SERIAL|PRINTED|MADE IN|TRADEMARK|©|TM\b/i.test(u))return false;
    const letters=(line.match(/[A-Za-z]/g)||[]).length;return letters>=3;
  });
  const nameSuggestions=[...new Set(candidates)].slice(0,5);
  const subject=nameSuggestions[0]||'';
  const league=category==='Basketball'?'NBA':category==='WNBA'?'WNBA':category==='Baseball'?'MLB':category==='Football'?'NFL':category==='Hockey'?'NHL':category==='Soccer'?(upper.includes('UEFA')?'UEFA':''):'';
  const fields={category,subject,year,manufacturer,brand,set_name:'',subset,card_number:cardNumber,parallel,serial_number:serial,team:'',league,grading_company:gradingCompany,grade,rookie,autograph,relic,language:category==='Pokémon'?'English':'',edition:'',condition:gradingCompany?`${gradingCompany} ${grade}`:'Raw — unknown'};
  fields.variant_name=suggestVariantName(fields);fields.card_type=suggestCardType(fields);fields.display_name=suggestDisplayName(fields);
  return {fields,nameSuggestions};
}
parseOcr=function(text){return parseOcrV2(text).fields};

showScanReview=function(){
  const d=document.getElementById('scanReviewDialog');if(!state.scan)return;
  document.getElementById('scanReviewImage').src=state.scan.imageDataUrl;
  document.getElementById('rawOcr').textContent=state.scan.text||'No readable text detected.';
  document.getElementById('ocrConfidence').textContent=`${state.scan.confidence||0}%`;
  const existing=document.getElementById('scanSmartReview');existing?.remove();
  const panel=document.createElement('section');panel.id='scanSmartReview';panel.className='scan-smart-review';
  const f=state.scan.fields||{};
  const rows=[['Category',f.category],['Player / character',f.subject],['Year',f.year],['Manufacturer',f.manufacturer],['Product',f.brand],['Subset / insert',f.subset],['Card #',f.card_number],['Parallel',f.parallel],['Serial',f.serial_number],['Grade',f.grading_company?`${f.grading_company} ${f.grade||''}`:''],['Variant',f.variant_name]].filter(([,v])=>normalizeText(v));
  const suggestions=(state.scan.nameSuggestions||[]).filter(x=>x!==f.subject);
  panel.innerHTML=`<div class="scan-review-warning ${state.scan.confidence<55?'warn':''}"><strong>${state.scan.confidence<55?'Double-check this scan':'Review the extracted identity'}</strong><span>${state.scan.confidence<55?'OCR confidence is low. Nothing becomes a market match until you save the reviewed fields.':'Cardfolio extracted visible details on-device. You can correct everything before saving.'}</span></div>${suggestions.length?`<div class="name-suggestions"><div class="eyebrow">Possible name</div><div class="chip-row">${[f.subject,...suggestions].filter(Boolean).map((x,i)=>`<button class="suggestion-chip ${i===0?'active':''}" data-scan-name="${escapeAttr(x)}">${escapeHtml(x)}</button>`).join('')}</div></div>`:''}<div class="scan-field-grid">${rows.map(([k,v])=>`<div class="scan-field-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div><div class="scan-flags">${f.rookie?'<span>RC</span>':''}${f.autograph?'<span>Auto</span>':''}${f.relic?'<span>Relic</span>':''}${!f.rookie&&!f.autograph&&!f.relic?'<span>Standard/base candidate</span>':''}</div>`;
  document.getElementById('rawOcr').insertAdjacentElement('beforebegin',panel);
  panel.querySelectorAll('[data-scan-name]').forEach(btn=>btn.addEventListener('click',()=>{state.scan.fields.subject=btn.dataset.scanName;state.scan.fields.display_name=suggestDisplayName(state.scan.fields);showScanReview()}));
  document.getElementById('matchPokemonBtn').classList.toggle('hidden',f.category!=='Pokémon');
  document.getElementById('pokemonMatches').innerHTML='';d.showModal();
};
useScanFields=function(){
  const f={...(state.scan?.fields||{})};
  document.getElementById('scanReviewDialog').close();
  openCardDialog(null,{...f,condition:f.condition||'Raw — unknown',quantity:1,display_name:f.display_name||suggestDisplayName(f)});
};

/* ---------- Robinhood-like portfolio ---------- */
function portfolioMetricsV2(){
  const priced=state.holdings.filter(h=>unitPrice(h)!==null);const value=priced.reduce((sum,h)=>sum+holdingValueV2(h),0);const cost=state.holdings.reduce((sum,h)=>sum+(Number(h.cost_basis)||0)*Number(h.quantity||1),0);
  const pnl=value-cost;return {value,cost,pnl,pnlPct:cost?pnl/cost*100:0,priced:priced.length,pending:state.holdings.filter(isPending).length,total:state.holdings.reduce((s,h)=>s+Number(h.quantity||1),0)};
}
function categoryGroups(list){
  const map=new Map();for(const h of list){const key=displayCategory(h);if(!map.has(key))map.set(key,[]);map.get(key).push(h)}
  return [...map.entries()].sort((a,b)=>{const ai=CATEGORY_ORDER.indexOf(a[0]),bi=CATEGORY_ORDER.indexOf(b[0]);return (ai<0?999:ai)-(bi<0?999:bi)||a[0].localeCompare(b[0])});
}
function albumCard(h){
  const status=priceStatus(h),price=unitPrice(h);return `<article class="album-card" data-detail-card="${escapeAttr(h.id)}"><div class="album-image-wrap">${h.image_url?`<img src="${escapeAttr(h.image_url)}" alt="${escapeAttr(displayName(h))}" loading="lazy"/>`:`<div class="album-placeholder">◇</div>`}<span class="price-state ${status.className}">${escapeHtml(status.label)}</span></div><div class="album-copy"><strong>${escapeHtml(displayName(h))}</strong><span>${escapeHtml([h.team,h.parallel,h.grading_company&&`${h.grading_company} ${h.grade||''}`].filter(Boolean).join(' · ')||displayCategory(h))}</span><div class="album-value"><b>${price===null?'—':money(price)}</b><small>${Number(h.quantity||1)>1?`×${Number(h.quantity||1)}`:'per card'}</small></div></div></article>`;
}
function categoryAlbum(name,cards){
  const open=state.categoryOpen[name]!==false;const total=cards.reduce((s,h)=>s+holdingValueV2(h),0);const pending=cards.filter(isPending).length;
  return `<section class="collection-group ${open?'open':''}"><button class="collection-head" data-category-toggle="${escapeAttr(name)}"><div><span class="collection-icon">${categoryIcon(name)}</span><span><strong>${escapeHtml(name)}</strong><small>${cards.length} holding${cards.length===1?'':'s'}${pending?` · ${pending} pending`:''}</small></span></div><div><strong>${money(total)}</strong><span class="chevron">⌄</span></div></button><div class="album-grid">${cards.map(albumCard).join('')}</div></section>`;
}
function categoryIcon(name){return ({NBA:'◉',WNBA:'◉',Soccer:'⬡','Pokémon':'✦',Baseball:'◆',Football:'⬢',Hockey:'◇','UFC / MMA':'✹',Wrestling:'✦','Formula 1':'▱',NASCAR:'▰',College:'⌂',Other:'◇'})[name]||'◇'}

homeView=function(){
  const m=portfolioMetricsV2(),hist=portfolioHistory();const groups=categoryGroups(state.holdings);
  return `<section class="liquid-hero"><div class="hero-top"><div><div class="metric-label">Portfolio value</div><div class="portfolio-value">${money(m.value)}</div><div class="metric-line"><strong class="${m.pnl>=0?'good':'bad'}">${m.pnl>=0?'+':''}${money(m.pnl)}</strong><span class="${m.pnl>=0?'good':'bad'}">${m.pnl>=0?'+':''}${pct(m.pnlPct)} vs cost</span></div></div><button class="glass-action" data-view="scan" aria-label="Scan a card">＋</button></div>${historyChart(hist)}<div class="hero-pills"><span><b>${m.total}</b> cards</span><span><b>${m.priced}</b> priced</span><span class="${m.pending?'pending-copy':''}"><b>${m.pending}</b> pending</span></div></section><section class="home-section"><div class="section-head"><div><div class="eyebrow">Collection</div><h2>By category</h2></div><button class="btn secondary" data-view="portfolio">See all</button></div><div class="category-strip">${groups.length?groups.map(([name,cards])=>`<button class="category-bubble" data-view="portfolio" data-open-category="${escapeAttr(name)}"><span>${categoryIcon(name)}</span><strong>${escapeHtml(name)}</strong><small>${cards.length} · ${money(cards.reduce((s,h)=>s+holdingValueV2(h),0))}</small></button>`).join(''):'<button class="category-bubble empty-bubble" data-view="scan"><span>＋</span><strong>Add your first card</strong><small>Scan → review → pending price</small></button>'}</div></section><section class="home-section"><div class="section-head"><div><div class="eyebrow">Assets</div><h2>Recently added</h2></div></div>${state.holdings.length?`<div class="album-grid home-album">${state.holdings.slice(0,8).map(albumCard).join('')}</div>`:'<div class="glass-empty"><strong>Your collection starts here.</strong><p>Upload a card, crop it, confirm the identity, and Cardfolio will queue market research.</p><button class="btn primary" data-view="scan">Scan card</button></div>'}</section>`;
};
portfolioView=function(){
  const q=state.filter.q.toLowerCase();const filtered=state.holdings.filter(h=>{const text=[h.display_name,h.subject,h.team,h.year,h.manufacturer,h.brand,h.set_name,h.card_number,h.parallel,h.grading_company,h.grade].join(' ').toLowerCase();return(!q||text.includes(q))&&(state.filter.pricing==='All'||(state.filter.pricing==='Priced'?!isPending(h):isPending(h)))});const groups=categoryGroups(filtered);
  return `<section class="portfolio-toolbar"><div><div class="eyebrow">Your collection</div><h2>${state.holdings.length} holdings</h2></div><button class="btn primary" id="portfolioAdd">＋ Add card</button></section><div class="filters liquid-filters"><input class="search-input" id="portfolioSearch" placeholder="Search player, set, card #…" value="${escapeAttr(state.filter.q)}"/><select id="pricingFilter"><option ${state.filter.pricing==='All'?'selected':''}>All</option><option ${state.filter.pricing==='Priced'?'selected':''}>Priced</option><option ${state.filter.pricing==='Unpriced'?'selected':''}>Unpriced</option></select></div><div class="collection-stack">${groups.length?groups.map(([name,cards])=>categoryAlbum(name,cards)).join(''):'<div class="glass-empty"><strong>No cards match this view.</strong><p>Try another search or add a card.</p></div>'}</div>`;
};
profileView=function(){
  const cloud=state.backend==='cloud';return `<div class="profile-grid"><section class="panel profile-card"><div class="profile-avatar">${state.user?.email?escapeHtml(state.user.email[0].toUpperCase()):'C'}</div><div><div class="eyebrow">Cardfolio account</div><h2>${state.user?escapeHtml(state.user.user_metadata?.full_name||state.user.email||'Signed in'):'Your collection, everywhere'}</h2><p class="muted">${state.user?'Your holdings are private to your account while shared market records stay synchronized across owners of the same exact card.':'Sign in to keep your collection synced and attach holdings to shared card market records.'}</p></div><div class="button-row">${cloud&&!state.user?'<button class="btn primary" id="profileGoogleSignin">Continue with Google</button>':''}<button class="btn secondary" id="exportBtn">Export JSON</button></div></section><section class="panel"><div class="eyebrow">Market engine</div><h3>Hourly shared pricing</h3><p class="muted">Saved cards remain <strong>Pending Price</strong> until exact-card evidence is sufficient. Shared canonical prices and research history are reused for every owner of the same variant.</p><div class="profile-stats"><span><b>${state.holdings.length}</b> holdings</span><span><b>${state.holdings.filter(isPending).length}</b> pending</span><span><b>${state.snapshots.length}</b> price points</span></div></section></div>`;
};

/* ---------- Per-card market detail ---------- */
function ensureDetailDialog(){
  if(document.getElementById('cardDetailDialog'))return;
  const d=document.createElement('dialog');d.id='cardDetailDialog';d.className='modal detail-modal';d.innerHTML='<div class="detail-shell" id="cardDetailContent"></div>';document.body.appendChild(d);
}
function cardChart(history){
  if(!history||history.length<2)return '<div class="card-chart empty-chart"><span>Price history starts when Cardfolio records real valuations.</span></div>';
  const vals=history.map(x=>Number(x.market_price)).filter(Number.isFinite);if(vals.length<2)return '<div class="card-chart empty-chart"><span>Not enough price history yet.</span></div>';
  const w=720,h=220,min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;let vi=0;
  const pts=history.filter(x=>Number.isFinite(Number(x.market_price))).map((x,i,a)=>{const v=Number(x.market_price),px=a.length===1?0:i/(a.length-1)*w,py=h-18-(v-min)/span*(h-36);vi++;return `${px.toFixed(1)},${py.toFixed(1)}`}).join(' ');
  return `<div class="card-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Card price history"><defs><linearGradient id="cardArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#cardArea)"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="chart-range"><span>${new Date(history[0].observed_at).toLocaleDateString()}</span><span>${new Date(history[history.length-1].observed_at).toLocaleDateString()}</span></div></div>`;
}
async function getCardMarketDetail(h){
  const id=h.canonical_card_id;if(!id)return {canonical:null,history:[],observations:[],variants:[]};
  const cached=state.marketDetailCache.get(id);if(cached&&Date.now()-cached.cachedAt<60000)return cached;
  const c=canonicalMeta(h)||(await state.supabase.from('canonical_cards').select('*').eq('id',id).maybeSingle()).data;
  const [{data:history},{data:observations},{data:variants}]=await Promise.all([
    state.supabase.from('canonical_price_history').select('*').eq('canonical_card_id',id).order('observed_at',{ascending:true}).limit(300),
    state.supabase.from('card_market_observations').select('*').eq('canonical_card_id',id).order('observed_at',{ascending:false}).limit(30),
    c?.family_key?state.supabase.from('card_variant_catalog').select('*').eq('family_key',c.family_key).order('variant_name',{ascending:true}).limit(100):Promise.resolve({data:[]})
  ]);
  const result={canonical:c||null,history:history||[],observations:observations||[],variants:variants||[],cachedAt:Date.now()};state.marketDetailCache.set(id,result);return result;
}
function changeSummary(history){
  if(!history||history.length<2)return null;const first=Number(history[history.length-2].market_price),last=Number(history[history.length-1].market_price);if(!Number.isFinite(first)||!Number.isFinite(last)||first===0)return null;return {d:last-first,p:(last-first)/first*100};
}
async function openCardDetail(h){
  ensureDetailDialog();const d=document.getElementById('cardDetailDialog'),box=document.getElementById('cardDetailContent');
  box.innerHTML='<div class="detail-loading"><span class="liquid-spinner"></span><strong>Loading card market…</strong></div>';d.showModal();
  let detail={canonical:canonicalMeta(h),history:[],observations:[],variants:[]};
  if(state.backend==='cloud'&&state.supabase&&h.canonical_card_id)try{detail=await getCardMarketDetail(h)}catch(err){console.warn('Market detail failed',err)}
  const c=detail.canonical||{},price=numeric(c.current_price)?Number(c.current_price):unitPrice(h),status=priceStatus({...h,_canonical:c}),chg=changeSummary(detail.history);
  const analysis=[['Bull',c.analyst_bull,'bull'],['Base',c.analyst_base,'base'],['Bear',c.analyst_bear,'bear']];
  box.innerHTML=`<div class="detail-topbar"><button class="icon-btn" data-detail-close aria-label="Close">×</button><button class="btn secondary" data-detail-edit="${escapeAttr(h.id)}">Edit holding</button></div><div class="detail-hero"><div class="detail-image">${h.image_url?`<img src="${escapeAttr(h.image_url)}" alt="${escapeAttr(displayName(h))}"/>`:'<div class="album-placeholder">◇</div>'}</div><div class="detail-title"><div class="eyebrow">${escapeHtml(displayCategory(h))} · ${escapeHtml(c.variant_name||suggestVariantName(h))}</div><h2>${escapeHtml(displayName(h))}</h2><div class="detail-price">${price===null?'Pending':money(price)}</div><div class="detail-change ${chg?(chg.d>=0?'good':'bad'):''}">${chg?`${chg.d>=0?'+':''}${money(chg.d)} (${chg.p>=0?'+':''}${chg.p.toFixed(1)}%) latest move`:escapeHtml(status.label)}</div></div></div>${cardChart(detail.history)}<div class="market-facts"><span><small>Status</small><b>${escapeHtml(status.label)}</b></span><span><small>Confidence</small><b>${numeric(c.valuation_confidence)?`${Math.round(Number(c.valuation_confidence)*100)}%`:'—'}</b></span><span><small>Exact comps</small><b>${Number(c.valuation_sample_size||0)}</b></span><span><small>Range</small><b>${numeric(c.valuation_low)&&numeric(c.valuation_high)?`${money(c.valuation_low)}–${money(c.valuation_high)}`:'—'}</b></span></div><section class="detail-section"><div class="section-head"><div><div class="eyebrow">Cardfolio analyst</div><h3>Evidence-based outlook</h3></div></div><div class="analyst-grid">${analysis.map(([label,text,cls])=>`<article class="analyst-card ${cls}"><span>${label}</span><p>${escapeHtml(text||'Waiting for enough market and card context to form this view.')}</p></article>`).join('')}</div></section><section class="detail-section"><div class="section-head"><div><div class="eyebrow">Market evidence</div><h3>Recent observations</h3></div></div>${detail.observations.length?`<div class="evidence-list">${detail.observations.slice(0,12).map(o=>`<${o.provenance_url?'a':'div'} class="evidence-row" ${o.provenance_url?`href="${escapeAttr(o.provenance_url)}" target="_blank" rel="noopener noreferrer"`:''}><span><b>${escapeHtml(o.marketplace)}</b><small>${escapeHtml(o.source_kind)} · ${o.sold_at?new Date(o.sold_at).toLocaleDateString():new Date(o.observed_at).toLocaleDateString()}</small></span><strong>${money(o.price)}</strong></${o.provenance_url?'a':'div'}>`).join('')}</div>`:'<div class="glass-empty compact"><p>No verified marketplace observations stored yet. The hourly research loop will keep checking.</p></div>'}</section>${detail.variants.length>1?`<section class="detail-section"><div class="section-head"><div><div class="eyebrow">Variant family</div><h3>${detail.variants.length} known versions</h3></div></div><div class="variant-chips">${detail.variants.map(v=>`<span class="variant-chip ${v.canonical_card_id===h.canonical_card_id?'active':''}">${escapeHtml(v.variant_name)}</span>`).join('')}</div></section>`:''}<section class="detail-section holding-private"><div class="eyebrow">Your holding</div><div class="private-facts"><span>Quantity <b>${Number(h.quantity||1)}</b></span><span>Cost basis <b>${numeric(h.cost_basis)?money(h.cost_basis):'—'}</b></span><span>Condition <b>${escapeHtml(h.condition||'Raw — unknown')}</b></span></div></section>`;
  box.querySelector('[data-detail-close]')?.addEventListener('click',()=>d.close());
  box.querySelector('[data-detail-edit]')?.addEventListener('click',()=>{d.close();openCardDialog(h)});
}

/* Upgrade view event binding while preserving market/watch/grading handlers. */
const baseBindViewEvents=typeof bindViewEvents==='function'?bindViewEvents:null;
bindViewEvents=function(){
  baseBindViewEvents?.();
  document.querySelectorAll('.holding[data-card-id]').forEach(el=>{const clone=el.cloneNode(true);el.replaceWith(clone);clone.addEventListener('click',()=>openCardDetail(state.holdings.find(h=>h.id===clone.dataset.cardId)))});
  document.querySelectorAll('[data-detail-card]').forEach(el=>el.addEventListener('click',()=>{const h=state.holdings.find(x=>x.id===el.dataset.detailCard);if(h)openCardDetail(h)}));
  document.querySelectorAll('[data-category-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.categoryToggle;state.categoryOpen[key]=state.categoryOpen[key]===false?true:false;render()}));
  document.querySelectorAll('[data-open-category]').forEach(btn=>btn.addEventListener('click',()=>{state.categoryOpen[btn.dataset.openCategory]=true}));
  document.getElementById('profileGoogleSignin')?.addEventListener('click',googleSignIn);
};

const baseBindGlobalEvents=typeof bindGlobalEvents==='function'?bindGlobalEvents:null;
bindGlobalEvents=function(){baseBindGlobalEvents?.();ensureFormUpgrades();ensureCropDialog();ensureDetailDialog();};

/* Make scan view reflect the actual crop/OCR/pending-price path. */
scanView=function(){return `<div class="scanner liquid-scanner"><section class="camera-zone panel"><div><div class="camera-icon">◎</div><h2>Scan a card</h2><p class="muted">Take or choose a photo, crop the exact card, then Cardfolio reads visible details on-device. You confirm the identity before saving.</p><input id="cameraInput" class="capture-input" type="file" accept="image/*" capture="environment"/><input id="uploadInput" class="capture-input" type="file" accept="image/*"/><div class="button-row" style="justify-content:center"><button id="cameraBtn" class="btn primary">Open camera</button><button id="uploadBtn" class="btn secondary">Choose photo</button></div><div id="scanStatus" class="inline-note"></div></div></section><aside class="scan-tips"><div class="tip"><strong>1 · Crop precisely</strong><p class="holding-meta">Remove table/background so OCR focuses on the card itself.</p></div><div class="tip"><strong>2 · On-device extraction</strong><p class="holding-meta">Name, year, product, card number, serial, grading and variant cues are extracted when visible.</p></div><div class="tip"><strong>3 · Exact variant matters</strong><p class="holding-meta">Base, parallel, autograph, relic, numbered and graded cards stay separate market assets.</p></div><div class="tip"><strong>4 · Pending price is normal</strong><p class="holding-meta">Saving never invents a value. Market research fills the shared price when exact evidence is sufficient.</p></div></aside></div>`};

/* Theme metadata + UI bootstrapping. */
document.documentElement.style.colorScheme='light';
const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.setAttribute('content','#f4f7fb');
document.addEventListener('DOMContentLoaded',()=>{ensureFormUpgrades();ensureCropDialog();ensureDetailDialog();});

})();
