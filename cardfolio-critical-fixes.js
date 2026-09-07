/* Cardfolio critical interaction fixes.
   Loaded last to make Save holding deterministic on mobile Safari and to launch
   Supabase Google OAuth with an explicit redirect URL rather than relying on
   browser-side auto-redirect behavior. */
(function(){
'use strict';

let savingHolding=false;

function text(v=''){return String(v??'').trim().replace(/\s+/g,' ')}
function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function currentIdentity(h={}){
  return JSON.stringify([
    text(h.category||'Other').toLowerCase(),text(h.subject).toLowerCase(),text(h.year).toLowerCase(),
    text(h.manufacturer).toLowerCase(),text(h.brand).toLowerCase(),text(h.set_name).toLowerCase(),
    text(h.subset||h.metadata?.subset).toLowerCase(),text(h.card_number).toLowerCase(),text(h.parallel).toLowerCase(),
    text(h.variant_name||h.metadata?.variant_name||h.metadata?.variation).toLowerCase(),
    !!h.autograph,!!h.relic,text(h.serial_number).split('/')[1]||'',text(h.grading_company).toLowerCase(),
    text(h.grade).toLowerCase(),text(h.language||h.metadata?.language).toLowerCase(),text(h.edition||h.metadata?.edition).toLowerCase()
  ]);
}
function canonicalPayload(h={}){
  return {
    category:h.category||'Other',subject:text(h.subject),year:text(h.year),manufacturer:text(h.manufacturer),brand:text(h.brand),
    set_name:text(h.set_name),subset:text(h.subset||h.metadata?.subset),card_number:text(h.card_number),parallel:text(h.parallel),
    variant_name:text(h.variant_name||h.metadata?.variant_name||h.metadata?.variation),card_type:text(h.card_type||h.metadata?.card_type),
    team:text(h.team),league:text(h.league),rookie:!!h.rookie,autograph:!!h.autograph,relic:!!h.relic,
    serial_number:text(h.serial_number),grading_company:text(h.grading_company),grade:text(h.grade),
    language:text(h.language||h.metadata?.language),edition:text(h.edition||h.metadata?.edition)
  };
}
function canonicalReadiness(h={}){
  const missing=[];
  if(!text(h.subject))missing.push('player/character');
  if(!text(h.year))missing.push('year');
  if(!text(h.card_number))missing.push('card number');
  if(!text(h.set_name)&&!text(h.brand)&&!text(h.manufacturer))missing.push('set/product');
  const company=text(h.grading_company),grade=text(h.grade);
  if((company&&!grade)||(!company&&grade))missing.push(company?'grade':'grading company');
  return {ready:missing.length===0,missing};
}
function pendingResolutionMetadata(metadata={},missing=[]){
  const detail=missing.length?`Missing ${missing.join(', ')}.`:'Exact identity is still ambiguous.';
  return {
    ...(metadata||{}),
    needs_canonical_link:true,
    resolution_context:`Canonical identity pending. ${detail} Cardfolio will not create a shared market asset until exact identity is supported.`,
    resolution_last_attempt_at:new Date().toISOString()
  };
}
function setSaveState(message,isError=false){
  let box=document.getElementById('cardSaveState');
  if(!box){
    box=document.createElement('div');box.id='cardSaveState';box.className='inline-note';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
    document.querySelector('#cardDialog .button-row.spread')?.insertAdjacentElement('beforebegin',box);
  }
  box.textContent=message||'';box.classList.toggle('bad',!!isError);
}
function setSaveBusy(busy){
  const b=document.getElementById('saveCardBtn');if(!b)return;
  b.disabled=busy;b.textContent=busy?'Saving…':'Save holding';
}
async function uploadHoldingPhoto(file){
  if(!file||!state.supabase||!state.user)return null;
  try{
    let blob=file;
    if(typeof compressImage==='function')blob=await compressImage(file,1500,.84)||file;
    const path=`${state.user.id}/${typeof uuid==='function'?uuid():crypto.randomUUID()}.jpg`;
    const {error}=await state.supabase.storage.from('card-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(error)throw error;
    return path;
  }catch(err){
    console.warn('Cardfolio photo upload deferred',err);
    return null;
  }
}
async function robustSaveHolding(){
  if(savingHolding)return;
  savingHolding=true;setSaveBusy(true);setSaveState('Saving your card…');
  let uploadedPath=null;
  try{
    if(typeof readCardForm!=='function')throw new Error('Card form is not ready. Reload Cardfolio and try again.');
    const formHolding=readCardForm();
    if(!text(formHolding.subject))throw new Error('Player or character name is required.');
    if(!Number.isFinite(Number(formHolding.quantity))||Number(formHolding.quantity)<1)throw new Error('Quantity must be at least 1.');

    const existing=(state.holdings||[]).find(x=>x.id===formHolding.id)||null;
    const scanFields=!existing&&state.scan?.fields&&typeof state.scan.fields==='object'?state.scan.fields:{};
    const system=typeof holdingSystemFields==='function'?holdingSystemFields(existing||scanFields):{
      image_path:existing?.image_path||scanFields.image_path||null,image_url:existing?.image_url||scanFields.image_url||'',
      market_value:existing?.market_value??scanFields.market_value??null,valuation_source:existing?.valuation_source||scanFields.valuation_source||'',
      valuation_observed_at:existing?.valuation_observed_at||scanFields.valuation_observed_at||null,
      external_ids:existing?.external_ids||scanFields.external_ids||{},metadata:existing?.metadata||scanFields.metadata||{}
    };
    const next={...system,...formHolding};
    next.metadata={...(system.metadata||{}),...(formHolding.metadata||{}),scan_confidence:state.scan?.confidence??system.metadata?.scan_confidence??null};
    if(state.scan?.text)next.metadata.scan_ocr=String(state.scan.text).slice(0,5000);
    if(!next.image_url&&state.scan?.imageDataUrl)next.image_url=state.scan.imageDataUrl;

    const identityChanged=!existing||currentIdentity(existing)!==currentIdentity(next);
    if(identityChanged){
      next.canonical_card_id=null;next.market_value=null;next.valuation_source='';next.valuation_observed_at=null;next.valuation_status='pending_price';
    }else{
      next.canonical_card_id=existing?.canonical_card_id||next.canonical_card_id||null;
      next.valuation_status=existing?.valuation_status||next.valuation_status||'pending_price';
    }

    if(state.backend==='cloud'&&state.user&&state.supabase){
      const photoFile=state.scan?.croppedFile||state.scan?.file||null;
      if(!next.image_path&&photoFile){uploadedPath=await uploadHoldingPhoto(photoFile);if(uploadedPath)next.image_path=uploadedPath;}

      if(identityChanged||!next.canonical_card_id){
        const readiness=canonicalReadiness(next);
        if(readiness.ready){
          try{
            const {data,error}=await state.supabase.rpc('resolve_canonical_card',{p_identity:canonicalPayload(next)});
            if(error)throw error;
            if(data){
              next.canonical_card_id=data;
              next.metadata={...(next.metadata||{}),needs_canonical_link:false,resolution_context:null,resolution_last_attempt_at:new Date().toISOString()};
            }
          }catch(err){
            console.warn('Canonical identity will be retried by the research loop',err);
            next.canonical_card_id=null;next.valuation_status='pending_price';
            next.metadata=pendingResolutionMetadata(next.metadata,[]);
          }
        }else{
          next.canonical_card_id=null;next.valuation_status='pending_price';
          next.metadata=pendingResolutionMetadata(next.metadata,readiness.missing);
        }
      }

      const row=typeof toDb==='function'?toDb(next):next;
      const {error}=await state.supabase.from('card_holdings').upsert(row);
      if(error)throw error;
      try{await syncCloud();}catch(err){console.warn('Post-save cloud refresh deferred',err);}
    }else{
      const readiness=canonicalReadiness(next);
      next.metadata=pendingResolutionMetadata(next.metadata,readiness.ready?[]:readiness.missing);
      if(existing)Object.assign(existing,next);else state.holdings.unshift(next);
      if(typeof saveLocal!=='function')throw new Error('Local Vault is not ready. Reload and try again.');
      saveLocal();
    }

    document.getElementById('cardDialog')?.close();
    state.scan=null;
    if(typeof toast==='function')toast(existing?'Holding updated':'Card added · Pending Price');
    if(typeof setView==='function')setView('portfolio');
  }catch(err){
    console.error('Cardfolio save failed',err);
    if(uploadedPath&&state.supabase){try{await state.supabase.storage.from('card-images').remove([uploadedPath]);}catch{}}
    const message=text(err?.message)||'Could not save this card. Please try again.';
    setSaveState(message,true);
    if(typeof toast==='function')toast(`Save failed · ${message}`);
  }finally{
    savingHolding=false;setSaveBusy(false);
  }
}

function authState(message,isError=false){
  const box=document.getElementById('authState');if(!box)return;
  box.textContent=message||'';box.classList.toggle('bad',!!isError);
}
function ensureGoogleButton(){
  const form=document.getElementById('authForm');if(!form)return;
  let button=document.getElementById('googleLoginBtn');
  if(button){
    const clone=button.cloneNode(true);button.replaceWith(clone);button=clone;
  }else{
    const wrap=document.createElement('div');wrap.className='oauth-wrap';
    wrap.innerHTML='<button type="button" id="googleLoginBtn" class="btn google-btn"><span class="google-g">G</span> Continue with Google</button><div class="oauth-divider"><span>or use email</span></div>';
    document.getElementById('authExplainer')?.insertAdjacentElement('afterend',wrap);button=wrap.querySelector('#googleLoginBtn');
  }
  button?.addEventListener('click',launchGoogleAuth);
}
async function launchGoogleAuth(){
  const button=document.getElementById('googleLoginBtn');
  if(!state.supabase){authState('Cloud sign-in is not ready. Reload Cardfolio and try again.',true);return;}
  if(button)button.disabled=true;authState('Opening Google sign-in…');
  try{
    // The current Vercel shell redirects / without preserving OAuth fragments.
    // Return directly to the proxied document, keeping only its known routing query.
    const redirectTo=location.pathname==='/api/proxy'
      ? `${location.origin}/api/proxy?path=index.html`
      : `${location.origin}/`;
    const {data,error}=await state.supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
    if(error)throw error;
    if(!data?.url)throw new Error('Google sign-in did not return an authorization URL.');
    window.location.assign(data.url);
  }catch(err){
    console.error('Google OAuth launch failed',err);
    const message=text(err?.message)||'Google sign-in could not start.';
    authState(message,true);
    if(typeof toast==='function')toast(`Google sign-in failed · ${message}`);
    if(button)button.disabled=false;
  }
}
function surfaceOAuthReturnError(){
  const params=new URLSearchParams(location.search);const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const error=params.get('error_description')||hash.get('error_description')||params.get('error')||hash.get('error');
  if(error){setTimeout(()=>{authState(decodeURIComponent(error),true);if(typeof toast==='function')toast(`Sign-in failed · ${decodeURIComponent(error)}`);},0);}
}
function installCriticalInteractions(){
  const oldSave=document.getElementById('saveCardBtn');
  if(oldSave){
    const save=oldSave.cloneNode(true);oldSave.replaceWith(save);save.addEventListener('click',robustSaveHolding);
  }
  ensureGoogleButton();surfaceOAuthReturnError();
  document.addEventListener('click',e=>{
    const profile=e.target.closest?.('#profileGoogleSignin');
    if(profile){e.preventDefault();e.stopImmediatePropagation();document.getElementById('authDialog')?.showModal();ensureGoogleButton();}
  },true);
}

document.addEventListener('DOMContentLoaded',installCriticalInteractions);
})();
