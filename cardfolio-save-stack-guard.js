/* Cardfolio mobile save stack guard.
   This final interaction layer intentionally bypasses the legacy readCardForm/toDb
   wrapper chain when saving a holding. Safari can otherwise recurse through layered
   serializers and surface "Maximum call stack size exceeded". */
(function(){
'use strict';

let saving=false;

const text=(v='')=>String(v??'').trim().replace(/\s+/g,' ');
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const now=()=>new Date().toISOString();
const makeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;

function value(id){return text(document.getElementById(id)?.value||'');}
function checked(id){return !!document.getElementById(id)?.checked;}

function safeJsonObject(input,maxDepth=6){
  const seen=new WeakSet();
  const walk=(v,depth)=>{
    if(v===null)return null;
    const kind=typeof v;
    if(kind==='string'||kind==='boolean')return v;
    if(kind==='number')return Number.isFinite(v)?v:null;
    if(kind==='bigint')return String(v);
    if(kind==='undefined'||kind==='function'||kind==='symbol')return undefined;
    if(v instanceof Date)return Number.isNaN(v.getTime())?null:v.toISOString();
    if(kind!=='object')return String(v);
    if(depth>=maxDepth)return null;
    if(seen.has(v))return undefined;
    seen.add(v);
    try{
      if(Array.isArray(v)){
        const out=[];
        for(const item of v.slice(0,100)){
          const cleaned=walk(item,depth+1);
          out.push(cleaned===undefined?null:cleaned);
        }
        return out;
      }
      const out={};
      let count=0;
      for(const [key,item] of Object.entries(v)){
        if(count++>=100)break;
        const cleaned=walk(item,depth+1);
        if(cleaned!==undefined)out[key]=cleaned;
      }
      return out;
    }catch{
      return {};
    }finally{
      seen.delete(v);
    }
  };
  const result=walk(input,0);
  return result&&typeof result==='object'&&!Array.isArray(result)?result:{};
}

function displayNameFor(h){
  const entered=value('displayName');
  if(entered)return entered;
  return [h.subject,h.year,h.brand||h.manufacturer,h.set_name,h.card_number?`#${h.card_number}`:'',h.parallel]
    .filter(Boolean).join(' · ');
}

function readFormDirect(){
  const quantityRaw=value('quantity');
  const costRaw=value('costBasis');
  const manualRaw=value('manualValue');
  const variation=value('variation');
  const language=value('cardLanguage')||value('language');
  const h={
    id:value('cardId')||makeId(),
    category:value('category')||'Other',
    subject:value('subject'),
    year:value('year'),
    manufacturer:value('manufacturer'),
    brand:value('brand'),
    set_name:value('setName'),
    subset:value('subset'),
    card_number:value('cardNumber'),
    parallel:value('parallel'),
    variant_name:variation,
    serial_number:value('serialNumber'),
    language,
    edition:value('edition'),
    team:value('team'),
    league:value('league'),
    condition:value('condition')||'Raw — unknown',
    quantity:Number(quantityRaw||1),
    cost_basis:costRaw===''?'':Number(costRaw),
    acquisition_source:value('acquisitionSource'),
    acquisition_date:value('acquisitionDate')||null,
    manual_value:manualRaw===''?'':Number(manualRaw),
    grading_company:value('gradingCompany'),
    grade:value('grade'),
    cert_number:value('certNumber'),
    rookie:checked('rookie'),
    autograph:checked('autograph'),
    relic:checked('relic'),
    notes:value('notes'),
    updated_at:now()
  };
  h.card_type=h.autograph&&h.relic?'autograph_relic':h.autograph?'autograph':h.relic?'relic':(h.parallel||h.variant_name||h.serial_number)?'parallel_or_variation':'base';
  h.display_name=displayNameFor(h);
  h.metadata={
    subset:h.subset||null,
    variation:h.variant_name||null,
    variant_name:h.variant_name||null,
    card_type:h.card_type||null,
    language:h.language||null,
    edition:h.edition||null
  };
  return h;
}

function systemFields(source={}){
  return {
    image_path:source.image_path||null,
    image_url:source.image_url||'',
    tcgdex_card_id:source.tcgdex_card_id||null,
    market_value:source.market_value??null,
    valuation_source:source.valuation_source||'',
    valuation_observed_at:source.valuation_observed_at||null,
    external_ids:safeJsonObject(source.external_ids),
    metadata:safeJsonObject(source.metadata),
    canonical_card_id:source.canonical_card_id||null,
    valuation_status:source.valuation_status||'pending_price',
    display_name:source.display_name||''
  };
}

function identity(h={}){
  const meta=safeJsonObject(h.metadata);
  return JSON.stringify([
    text(h.category||'Other').toLowerCase(),text(h.subject).toLowerCase(),text(h.year).toLowerCase(),
    text(h.manufacturer).toLowerCase(),text(h.brand).toLowerCase(),text(h.set_name).toLowerCase(),
    text(h.subset||meta.subset).toLowerCase(),text(h.card_number).toLowerCase(),text(h.parallel).toLowerCase(),
    text(h.variant_name||meta.variant_name||meta.variation).toLowerCase(),!!h.autograph,!!h.relic,
    text(h.serial_number).split('/')[1]||'',text(h.grading_company).toLowerCase(),text(h.grade).toLowerCase(),
    text(h.language||meta.language).toLowerCase(),text(h.edition||meta.edition).toLowerCase()
  ]);
}

function canonicalPayload(h={}){
  const meta=safeJsonObject(h.metadata);
  return {
    category:h.category||'Other',subject:text(h.subject),year:text(h.year),manufacturer:text(h.manufacturer),brand:text(h.brand),
    set_name:text(h.set_name),subset:text(h.subset||meta.subset),card_number:text(h.card_number),parallel:text(h.parallel),
    variant_name:text(h.variant_name||meta.variant_name||meta.variation),card_type:text(h.card_type||meta.card_type),
    team:text(h.team),league:text(h.league),rookie:!!h.rookie,autograph:!!h.autograph,relic:!!h.relic,
    serial_number:text(h.serial_number),grading_company:text(h.grading_company),grade:text(h.grade),
    language:text(h.language||meta.language),edition:text(h.edition||meta.edition)
  };
}

function readiness(h={}){
  const missing=[];
  if(!text(h.subject))missing.push('player/character');
  if(!text(h.year))missing.push('year');
  if(!text(h.card_number))missing.push('card number');
  if(!text(h.set_name)&&!text(h.brand)&&!text(h.manufacturer))missing.push('set/product');
  const company=text(h.grading_company),grade=text(h.grade);
  if((company&&!grade)||(!company&&grade))missing.push(company?'grade':'grading company');
  return {ready:missing.length===0,missing};
}

function pendingMetadata(metadata={},missing=[]){
  const detail=missing.length?`Missing ${missing.join(', ')}.`:'Exact identity is still ambiguous.';
  return {
    ...safeJsonObject(metadata),
    needs_canonical_link:true,
    resolution_context:`Canonical identity pending. ${detail} Cardfolio will not create a shared market asset until exact identity is supported.`,
    resolution_last_attempt_at:now()
  };
}

const DB_FIELDS=[
  'id','category','subject','display_name','year','manufacturer','brand','set_name','subset','card_number','parallel','variant_name','card_type',
  'serial_number','language','edition','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value',
  'grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','tcgdex_card_id','market_value','valuation_source',
  'valuation_observed_at','external_ids','metadata','canonical_card_id','valuation_status'
];

function serializeForDb(h){
  const out={};
  for(const key of DB_FIELDS){
    if(key==='external_ids'||key==='metadata')out[key]=safeJsonObject(h[key]);
    else out[key]=h[key]??null;
  }
  for(const key of ['cost_basis','manual_value','market_value'])if(out[key]==='')out[key]=null;
  for(const key of ['acquisition_date','valuation_observed_at'])if(out[key]==='')out[key]=null;
  out.quantity=Number.isFinite(Number(out.quantity))?Number(out.quantity):1;
  out.rookie=!!out.rookie;out.autograph=!!out.autograph;out.relic=!!out.relic;
  out.user_id=state.user.id;
  out.updated_at=now();
  return out;
}

function saveMessage(message,isError=false){
  let box=document.getElementById('cardSaveState');
  if(!box){
    box=document.createElement('div');box.id='cardSaveState';box.className='inline-note';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
    document.querySelector('#cardDialog .button-row.spread')?.insertAdjacentElement('beforebegin',box);
  }
  box.textContent=message||'';box.classList.toggle('bad',!!isError);
}

function busy(on){
  const button=document.getElementById('saveCardBtn');if(!button)return;
  button.disabled=on;button.setAttribute('aria-busy',on?'true':'false');button.textContent=on?'Saving…':'Save holding';
  if(!on)button.removeAttribute('aria-busy');
}

async function uploadPhoto(file){
  if(!file||!state.supabase||!state.user)return null;
  try{
    let blob=file;
    if(typeof globalThis.compressImage==='function')blob=await globalThis.compressImage(file,1500,.84)||file;
    const path=`${state.user.id}/${makeId()}.jpg`;
    const {error}=await state.supabase.storage.from('card-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(error)throw error;
    return path;
  }catch(err){
    console.warn('Cardfolio photo upload deferred',err);
    return null;
  }
}

async function saveDirect(){
  if(saving)return;
  saving=true;busy(true);saveMessage('Saving your card…');
  let uploadedPath=null;
  let stage='reading the form';
  try{
    const form=readFormDirect();
    if(!form.subject)throw new Error('Player or character name is required.');
    if(!Number.isFinite(form.quantity)||form.quantity<1)throw new Error('Quantity must be at least 1.');

    stage='preparing the holding';
    const existing=(state.holdings||[]).find(item=>item.id===form.id)||null;
    const scanFields=!existing&&state.scan?.fields&&typeof state.scan.fields==='object'?state.scan.fields:{};
    const base=systemFields(existing||scanFields);
    const next={...base,...form};
    next.metadata={...safeJsonObject(base.metadata),...safeJsonObject(form.metadata),scan_confidence:state.scan?.confidence??base.metadata?.scan_confidence??null};
    if(state.scan?.text)next.metadata.scan_ocr=String(state.scan.text).slice(0,5000);
    if(!next.image_url&&state.scan?.imageDataUrl)next.image_url=state.scan.imageDataUrl;

    const identityChanged=!existing||identity(existing)!==identity(next);
    if(identityChanged){
      next.canonical_card_id=null;next.market_value=null;next.valuation_source='';next.valuation_observed_at=null;next.valuation_status='pending_price';
    }else{
      next.canonical_card_id=existing?.canonical_card_id||next.canonical_card_id||null;
      next.valuation_status=existing?.valuation_status||next.valuation_status||'pending_price';
    }

    if(state.backend==='cloud'&&state.user&&state.supabase){
      stage='uploading the card image';
      const photoFile=state.scan?.croppedFile||state.scan?.file||null;
      if(!next.image_path&&photoFile){uploadedPath=await uploadPhoto(photoFile);if(uploadedPath)next.image_path=uploadedPath;}

      stage='resolving the exact card';
      if(identityChanged||!next.canonical_card_id){
        const ready=readiness(next);
        if(ready.ready){
          try{
            const {data,error}=await state.supabase.rpc('resolve_canonical_card',{p_identity:canonicalPayload(next)});
            if(error)throw error;
            if(data){
              next.canonical_card_id=data;
              next.metadata={...safeJsonObject(next.metadata),needs_canonical_link:false,resolution_context:null,resolution_last_attempt_at:now()};
            }
          }catch(err){
            console.warn('Canonical identity will be retried by the research loop',err);
            next.canonical_card_id=null;next.valuation_status='pending_price';next.metadata=pendingMetadata(next.metadata,[]);
          }
        }else{
          next.canonical_card_id=null;next.valuation_status='pending_price';next.metadata=pendingMetadata(next.metadata,ready.missing);
        }
      }

      stage='serializing the holding';
      const row=serializeForDb(next);
      stage='saving to the cloud';
      const {error}=await state.supabase.from('card_holdings').upsert(row);
      if(error)throw error;
      stage='refreshing the portfolio';
      try{if(typeof globalThis.syncCloud==='function')await globalThis.syncCloud();}catch(err){console.warn('Post-save cloud refresh deferred',err);}
    }else{
      stage='saving to Local Vault';
      const ready=readiness(next);
      next.metadata=pendingMetadata(next.metadata,ready.ready?[]:ready.missing);
      next.external_ids=safeJsonObject(next.external_ids);
      if(existing)Object.assign(existing,next);else state.holdings.unshift(next);
      if(typeof globalThis.saveLocal!=='function')throw new Error('Local Vault is not ready. Reload and try again.');
      globalThis.saveLocal();
    }

    document.getElementById('cardDialog')?.close();
    state.scan=null;
    globalThis.toast?.(existing?'Holding updated':'Card added · Pending Price');
    globalThis.setView?.('portfolio');
  }catch(err){
    console.error(`Cardfolio direct save failed while ${stage}`,err);
    if(uploadedPath&&state.supabase){try{await state.supabase.storage.from('card-images').remove([uploadedPath]);}catch{}}
    const raw=text(err?.message);
    const stackProblem=err instanceof RangeError||/maximum call stack|too much recursion/i.test(raw);
    const message=stackProblem?'Cardfolio reset the save path after a browser recursion error. Reopen this card and save again.':(raw||'Could not save this card. Please try again.');
    saveMessage(message,true);
    globalThis.toast?.(`Save failed · ${message}`);
  }finally{
    saving=false;busy(false);
  }
}

function install(){
  const current=document.getElementById('saveCardBtn');
  if(!current||current.dataset.cardfolioStackGuard==='1')return;
  const button=current.cloneNode(true);
  button.dataset.cardfolioStackGuard='1';
  current.replaceWith(button);
  button.addEventListener('click',saveDirect);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
