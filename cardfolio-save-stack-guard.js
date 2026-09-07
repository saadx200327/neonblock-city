/* Cardfolio definitive save path for iOS/Safari.
   Runs in capture phase and never calls the legacy form/serializer save chain. */
(function(){
'use strict';

let saving=false;
const text=v=>String(v??'').trim().replace(/\s+/g,' ');
const value=id=>text(document.getElementById(id)?.value||'');
const checked=id=>!!document.getElementById(id)?.checked;
const now=()=>new Date().toISOString();

function uuid(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function numOrNull(v){return v!==''&&Number.isFinite(Number(v))?Number(v):null}
function intAtLeastOne(v){const n=Math.floor(Number(v||1));return Number.isFinite(n)&&n>0?n:1}
function validUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(v))}

function saveState(message,isError=false){
  let box=document.getElementById('cardSaveState');
  if(!box){
    box=document.createElement('div');box.id='cardSaveState';box.className='inline-note';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
    document.querySelector('#cardDialog .button-row.spread')?.insertAdjacentElement('beforebegin',box);
  }
  box.textContent=message||'';box.classList.toggle('bad',!!isError);
}
function busy(on){
  const b=document.getElementById('saveCardBtn');if(!b)return;
  b.disabled=on;b.textContent=on?'Saving…':'Save holding';b.setAttribute('aria-busy',on?'true':'false');
  if(!on)b.removeAttribute('aria-busy');
}
function displayName(h){return [h.subject,h.year,h.brand||h.manufacturer,h.set_name,h.card_number?`#${h.card_number}`:'',h.parallel].filter(Boolean).join(' · ')}
function identity(h={}){
  return [h.category,h.subject,h.year,h.manufacturer,h.brand,h.set_name,h.subset,h.card_number,h.parallel,h.variant_name,h.serial_number,h.grading_company,h.grade,h.language,h.edition,!!h.autograph,!!h.relic]
    .map(v=>typeof v==='boolean'?v:text(v).toLowerCase()).join('|');
}

function readPrimitiveForm(){
  const idValue=value('cardId');
  const h={
    id:validUuid(idValue)?idValue:uuid(),
    category:value('category')||'Other',
    subject:value('subject'),
    year:value('year')||null,
    manufacturer:value('manufacturer')||null,
    brand:value('brand')||null,
    set_name:value('setName')||null,
    subset:value('subset')||null,
    card_number:value('cardNumber')||null,
    parallel:value('parallel')||null,
    variant_name:value('variation')||null,
    serial_number:value('serialNumber')||null,
    language:value('cardLanguage')||null,
    edition:value('edition')||null,
    team:value('team')||null,
    league:value('league')||null,
    condition:value('condition')||'Raw — unknown',
    quantity:intAtLeastOne(value('quantity')),
    cost_basis:numOrNull(value('costBasis')),
    acquisition_source:value('acquisitionSource')||null,
    acquisition_date:value('acquisitionDate')||null,
    manual_value:numOrNull(value('manualValue')),
    grading_company:value('gradingCompany')||null,
    grade:value('grade')||null,
    cert_number:value('certNumber')||null,
    rookie:checked('rookie'),
    autograph:checked('autograph'),
    relic:checked('relic'),
    notes:value('notes')||null
  };
  h.card_type=h.autograph&&h.relic?'autograph_relic':h.autograph?'autograph':h.relic?'relic':(h.parallel||h.variant_name||h.serial_number)?'parallel_or_variation':'base';
  h.display_name=displayName(h);
  return h;
}

function plainMetadata(h){
  const confidence=typeof state!=='undefined'&&Number.isFinite(Number(state.scan?.confidence))?Number(state.scan.confidence):null;
  const ocr=typeof state!=='undefined'&&state.scan?.text?String(state.scan.text).slice(0,5000):null;
  return {
    subset:h.subset,
    variation:h.variant_name,
    variant_name:h.variant_name,
    card_type:h.card_type,
    language:h.language,
    edition:h.edition,
    scan_confidence:confidence,
    scan_ocr:ocr,
    needs_canonical_link:true,
    resolution_context:'Saved safely. Exact catalog identity and pricing can be resolved after intake.',
    resolution_last_attempt_at:now()
  };
}
function clientHolding(row,imageUrl=''){
  return {...row,image_url:imageUrl||'',cost_basis:row.cost_basis??'',manual_value:row.manual_value??'',market_value:row.market_value??null};
}
function sanitizeExisting(h={}){
  const out={};
  const keys=['id','category','subject','display_name','year','manufacturer','brand','set_name','subset','card_number','parallel','variant_name','card_type','serial_number','language','edition','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value','grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','image_url','tcgdex_card_id','market_value','valuation_source','valuation_observed_at','canonical_card_id','valuation_status','created_at','updated_at'];
  for(const k of keys){const v=h?.[k];if(v===null||['string','number','boolean'].includes(typeof v))out[k]=v;}
  out.external_ids={};out.metadata={};return out;
}

async function uploadPhotoAfterSave(row){
  try{
    if(typeof state==='undefined'||!state.supabase||!state.user)return;
    const file=state.scan?.croppedFile||state.scan?.file||null;if(!file)return;
    const ext=(file.name?.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').slice(0,8)||'jpg';
    const path=`${state.user.id}/${uuid()}.${ext}`;
    const {error}=await state.supabase.storage.from('card-images').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(error)throw error;
    const {error:updateError}=await state.supabase.from('card_holdings').update({image_path:path,updated_at:now()}).eq('id',row.id).eq('user_id',state.user.id);
    if(updateError)throw updateError;
    const local=(state.holdings||[]).find(x=>x.id===row.id);if(local)local.image_path=path;
  }catch(err){console.warn('Cardfolio photo upload deferred',err)}
}

async function definitiveSave(){
  if(saving)return;
  saving=true;busy(true);saveState('Saving your card…');
  try{
    if(typeof state==='undefined')throw new Error('Cardfolio is still loading. Reload and try again.');
    const form=readPrimitiveForm();
    if(!form.subject)throw new Error('Player or character name is required.');
    const existing=(state.holdings||[]).find(x=>x?.id===form.id)||null;
    const sameIdentity=!!existing&&identity(existing)===identity(form);
    const row={
      ...form,
      image_path:existing?.image_path||null,
      tcgdex_card_id:sameIdentity?(existing?.tcgdex_card_id||null):null,
      market_value:sameIdentity&&Number.isFinite(Number(existing?.market_value))?Number(existing.market_value):null,
      valuation_source:sameIdentity?(text(existing?.valuation_source)||null):null,
      valuation_observed_at:sameIdentity?(existing?.valuation_observed_at||null):null,
      external_ids:{},
      metadata:plainMetadata(form),
      canonical_card_id:sameIdentity&&validUuid(existing?.canonical_card_id)?existing.canonical_card_id:null,
      valuation_status:sameIdentity?(text(existing?.valuation_status)||'pending_price'):'pending_price',
      updated_at:now()
    };

    if(state.backend==='cloud'&&state.user&&state.supabase){
      row.user_id=state.user.id;
      const {error}=await state.supabase.from('card_holdings').upsert(row,{onConflict:'id'});
      if(error)throw error;
      const imageUrl=existing?.image_url||state.scan?.imageDataUrl||'';
      const next=clientHolding(row,imageUrl);
      const i=(state.holdings||[]).findIndex(x=>x?.id===row.id);
      if(i>=0)state.holdings[i]=next;else state.holdings.unshift(next);
      void uploadPhotoAfterSave(row);
    }else{
      const next=clientHolding(row,existing?.image_url||state.scan?.imageDataUrl||'');
      const safe=(state.holdings||[]).map(sanitizeExisting);
      const i=safe.findIndex(x=>x.id===row.id);if(i>=0)safe[i]=next;else safe.unshift(next);
      state.holdings=safe;
      localStorage.setItem('cardfolio.holdings.v1',JSON.stringify(safe));
    }

    document.getElementById('cardDialog')?.close();
    state.scan=null;
    if(typeof toast==='function')toast(existing?'Holding updated':'Card added · Pending Price');
    if(typeof setView==='function')setView('portfolio');
  }catch(err){
    console.error('Cardfolio definitive save failed',err);
    const raw=text(err?.message);
    const recursion=err instanceof RangeError||/maximum call stack|too much recursion/i.test(raw);
    saveState(recursion?'Save recursion was blocked. Reload once and retry; the legacy handler will not run.':(raw||'Could not save this card. Please try again.'),true);
  }finally{
    saving=false;busy(false);
  }
}

function interceptSave(event){
  const button=event.target?.closest?.('#saveCardBtn');if(!button)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  void definitiveSave();
}
function interceptSubmit(event){
  const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=='cardForm')return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  void definitiveSave();
}

// Capture phase makes this independent of whichever older script last replaced the button.
document.addEventListener('click',interceptSave,true);
document.addEventListener('submit',interceptSubmit,true);
window.cardfolioDefinitiveSave=definitiveSave;
})();
