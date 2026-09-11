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
  // Older UI layers inserted a second button with a different OAuth callback.
  document.getElementById('googleSignInBtn')?.remove();
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
  if(button?.disabled)return;
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

/* Cardfolio requested UX + startup performance layer.
   Essential Home, scanner and language behavior lives in this already-static file so
   first paint does not wait on the GitHub-backed /api/proxy compatibility layer. */
(function(){
'use strict';
if(window.cardfolioDeepUxVersion)return;
window.cardfolioDeepUxVersion='20260911-deep-1';

const RECENT_MS=72*60*60*1000;
const DRAWER_ID='homeCategoryDrawer';
const LOCALE_KEY='cardfolio.locale.v2';
const LOCALES={en:{label:'English',lang:'en'},es:{label:'Español',lang:'es'},bn:{label:'বাংলা',lang:'bn'}};
const COPY={
  es:{Home:'Inicio',Portfolio:'Portafolio',Scan:'Escanear',Watch:'Seguir',Watchlist:'Lista de seguimiento',Market:'Mercado',Grading:'Calificación',Profile:'Perfil','Sign out':'Cerrar sesión','Sign in':'Iniciar sesión','Manual add':'Agregar manualmente','Portfolio value':'Valor del portafolio','Collection':'Colección','By category':'Por categoría','See all':'Ver todo','Assets':'Activos','Recently added':'Añadidas recientemente','Your collection':'Tu colección','Add card':'Agregar tarjeta','Scan a card':'Escanear una tarjeta','Open camera':'Abrir escáner','Choose photo':'Elegir foto','Card scanner':'Escáner de tarjetas','Center the card inside the frame':'Centra la tarjeta dentro del marco','Hold steady, then capture':'Mantén estable y captura','Retake':'Repetir','Use scan':'Usar escaneo','Card facts':'Datos de la tarjeta','Exact asset identity':'Identidad exacta del activo','Exact identity':'Identidad exacta','Year':'Año','Set':'Set','Card #':'Tarjeta #','Parallel':'Paralela','Variant':'Variante','Grade':'Grado','Language':'Idioma','Card language':'Idioma de la tarjeta','App language':'Idioma de la app','Edition':'Edición','Status':'Estado','Player / character':'Jugador / personaje','Manufacturer':'Fabricante','Product':'Producto','Product / set':'Producto / set','Serial':'Serie','Team / club':'Equipo / club','League':'Liga','Market evidence':'Evidencia de mercado','Market activity':'Actividad de mercado','Current':'Actual','Sample':'Muestra','Confidence':'Confianza','Edit holding':'Editar posición','Active listings':'Anuncios activos','Sold comps':'Ventas comparables','Pending Price':'Precio pendiente','Choose language':'Elegir idioma','Cancel':'Cancelar','No recent cards.':'No hay tarjetas recientes.','Cards leave Recently added after 3 days, but stay in Portfolio and their category.':'Las tarjetas salen de Añadidas recientemente después de 3 días, pero permanecen en Portafolio y su categoría.','Category':'Categoría'},
  bn:{Home:'হোম',Portfolio:'পোর্টফোলিও',Scan:'স্ক্যান',Watch:'ওয়াচ',Watchlist:'ওয়াচলিস্ট',Market:'মার্কেট',Grading:'গ্রেডিং',Profile:'প্রোফাইল','Sign out':'সাইন আউট','Sign in':'সাইন ইন','Manual add':'ম্যানুয়ালি যোগ করুন','Portfolio value':'পোর্টফোলিও মূল্য','Collection':'কালেকশন','By category':'ক্যাটাগরি অনুযায়ী','See all':'সব দেখুন','Assets':'অ্যাসেট','Recently added':'সম্প্রতি যোগ করা','Your collection':'আপনার কালেকশন','Add card':'কার্ড যোগ করুন','Scan a card':'কার্ড স্ক্যান করুন','Open camera':'স্ক্যানার খুলুন','Choose photo':'ছবি বেছে নিন','Card scanner':'কার্ড স্ক্যানার','Center the card inside the frame':'কার্ডটি ফ্রেমের মাঝখানে রাখুন','Hold steady, then capture':'স্থির রাখুন, তারপর ক্যাপচার করুন','Retake':'আবার নিন','Use scan':'স্ক্যান ব্যবহার করুন','Card facts':'কার্ড তথ্য','Exact asset identity':'সঠিক অ্যাসেট পরিচয়','Exact identity':'সঠিক পরিচয়','Year':'বছর','Set':'সেট','Card #':'কার্ড #','Parallel':'প্যারালেল','Variant':'ভ্যারিয়েন্ট','Grade':'গ্রেড','Language':'ভাষা','Card language':'কার্ডের ভাষা','App language':'অ্যাপের ভাষা','Edition':'এডিশন','Status':'স্ট্যাটাস','Player / character':'প্লেয়ার / চরিত্র','Manufacturer':'প্রস্তুতকারক','Product':'প্রোডাক্ট','Product / set':'প্রোডাক্ট / সেট','Serial':'সিরিয়াল','Team / club':'টিম / ক্লাব','League':'লিগ','Market evidence':'মার্কেট প্রমাণ','Market activity':'মার্কেট কার্যক্রম','Current':'বর্তমান','Sample':'স্যাম্পল','Confidence':'বিশ্বাসযোগ্যতা','Edit holding':'হোল্ডিং এডিট করুন','Active listings':'সক্রিয় লিস্টিং','Sold comps':'বিক্রি হওয়া তুলনা','Pending Price':'দাম অপেক্ষমাণ','Choose language':'ভাষা বেছে নিন','Cancel':'বাতিল','No recent cards.':'সাম্প্রতিক কোনো কার্ড নেই।','Cards leave Recently added after 3 days, but stay in Portfolio and their category.':'কার্ড ৩ দিন পর সাম্প্রতিক তালিকা থেকে সরে যায়, কিন্তু পোর্টফোলিও ও ক্যাটাগরিতে থাকে।','Category':'ক্যাটাগরি'}
};
let locale=localStorage.getItem(LOCALE_KEY)||'en';if(!LOCALES[locale])locale='en';
let patchQueued=false,recentTimer=0,imageHydration=null,scannerStream=null,scannerBlobUrl='';
const lazy=new Map();

function tr(s){return locale==='en'?s:(COPY[locale]?.[s]||s)}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function categoryName(h){const raw=String(h?.category||'Other').trim(),league=String(h?.league||'').trim().toUpperCase();if(raw==='Basketball')return league==='WNBA'?'WNBA':'NBA';if(raw==='WNBA')return'WNBA';if(/pok[eé]mon/i.test(raw))return'Pokémon';return raw||'Other'}
function categoryIcon(name){return({NBA:'◉',WNBA:'◉',Soccer:'⬡','Pokémon':'✦',Baseball:'◆',Football:'⬢',Hockey:'◇','UFC / MMA':'✹',Wrestling:'✦','Formula 1':'▱',NASCAR:'▰',College:'⌂',Other:'◇'})[name]||'◇'}
function cardName(h){return String(h?.display_name||h?.subject||'Untitled card').trim()}
function canonical(h){return h?._canonical||(state?.canonicalIndex?.get&&h?.canonical_card_id?state.canonicalIndex.get(h.canonical_card_id):null)||(state?.canonicalCards?.[h?.canonical_card_id]||null)}
function unitPrice(h){for(const v of[canonical(h)?.current_price,h?.market_value,h?.manual_value])if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return Number(v);return null}
function moneyText(v){try{return typeof money==='function'?money(v):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v)}catch{return `$${Number(v||0).toFixed(2)}`}}

function installCss(){if(document.getElementById('cardfolio-deep-ux-css'))return;const s=document.createElement('style');s.id='cardfolio-deep-ux-css';s.textContent=`
#viewTitle{visibility:visible!important}.home-category-drawer{margin-top:14px;border:1px solid rgba(255,255,255,.76);border-radius:26px;background:rgba(255,255,255,.78);box-shadow:0 18px 45px rgba(38,54,89,.12),inset 0 1px 0 rgba(255,255,255,.9);backdrop-filter:blur(22px) saturate(135%);-webkit-backdrop-filter:blur(22px) saturate(135%);padding:0 14px;opacity:0;transform:translateY(-8px) scale(.985);max-height:0;overflow:hidden;transition:max-height .24s ease,opacity .18s ease,transform .18s ease,padding .24s ease}.home-category-drawer.open{padding:14px;opacity:1;transform:none;max-height:950px}.home-category-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.home-category-drawer-head>div{display:flex;align-items:center;gap:10px}.home-category-drawer-head>div>span{display:grid;place-items:center;width:42px;height:42px;border-radius:15px;background:rgba(234,245,255,.95);color:#1688ff;font-size:20px}.home-category-drawer-head small{display:block;color:#8c96a7;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.14em}.home-category-drawer-head strong{display:block;color:#111722;font-size:20px;line-height:1.1;margin-top:2px}.home-category-close{border:0;background:rgba(15,23,42,.06);width:38px;height:38px;border-radius:50%;font-size:25px;line-height:1;color:#18202e}.home-category-drawer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.home-drawer-card{border:1px solid rgba(255,255,255,.9);border-radius:20px;background:rgba(255,255,255,.82);padding:8px;text-align:left;box-shadow:0 8px 24px rgba(51,65,85,.08);min-width:0;color:inherit}.home-drawer-image{display:block;aspect-ratio:2.5/3.5;border-radius:15px;overflow:hidden;background:linear-gradient(145deg,#eef4fb,#f9fbfe)}.home-drawer-image img{width:100%;height:100%;object-fit:cover;display:block}.home-drawer-placeholder{width:100%;height:100%;display:grid;place-items:center;font-size:26px;color:#1688ff}.home-drawer-copy{display:grid;gap:3px;padding:8px 3px 3px;min-width:0}.home-drawer-copy strong{font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.home-drawer-copy small{font-size:11px;color:#8791a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.home-drawer-copy b{font-size:15px;margin-top:3px}.category-bubble.selected{outline:2px solid rgba(44,128,255,.28);box-shadow:0 14px 34px rgba(39,104,204,.12)}.recent-empty{min-height:112px;display:flex;flex-direction:column;justify-content:center}.recent-empty p{margin:5px 0 0;color:#8a94a3;line-height:1.35}
#cardfolioScanner{position:fixed;inset:0;z-index:13000;background:#05070a;color:#fff;display:none;flex-direction:column;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text",Segoe UI,sans-serif}#cardfolioScanner.open{display:flex}#cardfolioScanner .scan-top{display:flex;align-items:center;justify-content:space-between;padding:max(18px,env(safe-area-inset-top)) 18px 12px;z-index:2}#cardfolioScanner .scan-top strong{font-size:19px}.scan-x{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);color:#fff;font-size:24px}.scan-spacer{width:44px}#cardfolioScanner .scan-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:#000}#cardfolioScanner video,#cardfolioScanner .scan-preview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.scan-preview{display:none}#cardfolioScanner.preview .scan-preview{display:block}#cardfolioScanner.preview video{display:none}#cardfolioScanner .scan-frame{position:absolute;left:10%;right:10%;top:50%;aspect-ratio:5/7;transform:translateY(-50%);border:2px solid rgba(255,255,255,.96);border-radius:22px;box-shadow:0 0 0 999px rgba(0,0,0,.43);pointer-events:none}.scan-frame:before,.scan-frame:after{content:"";position:absolute;width:48px;height:48px;border-color:#4fa0ff;border-style:solid}.scan-frame:before{left:-3px;top:-3px;border-width:4px 0 0 4px;border-radius:21px 0 0 0}.scan-frame:after{right:-3px;bottom:-3px;border-width:0 4px 4px 0;border-radius:0 0 21px 0}#cardfolioScanner .scan-hint{position:absolute;left:20px;right:20px;bottom:25px;text-align:center;font-size:14px;font-weight:750;text-shadow:0 2px 10px #000}.scan-status{position:absolute;left:16px;right:16px;top:16px;padding:11px 14px;border-radius:14px;background:rgba(0,0,0,.62);backdrop-filter:blur(14px);font-size:13px;display:none;z-index:3}.scan-status.show{display:block}#cardfolioScanner .scan-controls{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;padding:18px 22px calc(18px + env(safe-area-inset-bottom));background:#05070a}.scan-capture{width:76px;height:76px;border-radius:50%;border:5px solid #fff;background:transparent;box-shadow:inset 0 0 0 6px #05070a,inset 0 0 0 30px #fff;justify-self:center}.scan-secondary{min-height:48px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);color:#fff;font-weight:850;padding:0 15px}.scan-secondary[hidden]{display:block;visibility:hidden}.scan-use{background:#fff;color:#0b1017;border-color:#fff}
.cardfolio-language-row{cursor:pointer;position:relative;padding-right:44px!important}.cardfolio-language-row:after{content:'›';position:absolute;right:17px;top:50%;transform:translateY(-50%);font-size:27px;color:var(--muted)}#cardfolioLanguagePicker{border:0;padding:0;background:transparent;max-width:none;width:min(92vw,520px)}#cardfolioLanguagePicker::backdrop{background:rgba(13,22,32,.3);backdrop-filter:blur(14px)}.cf-language-sheet{border-radius:30px;padding:22px;background:rgba(250,252,255,.98);border:1px solid rgba(255,255,255,.92);box-shadow:0 30px 90px rgba(20,34,50,.22);color:var(--text)}.cf-language-sheet h2{margin:2px 0 5px;font-size:24px}.cf-language-sheet p{margin:0 0 16px;color:var(--muted);font-size:13px;line-height:1.45}.cf-language-options{display:grid;gap:9px}.cf-language-option{width:100%;display:flex;align-items:center;justify-content:space-between;min-height:58px;padding:0 17px;border-radius:18px;border:1px solid rgba(70,95,120,.12);background:#fff;color:var(--text);font-size:16px;font-weight:850}.cf-language-option.selected{outline:2px solid #2389ff;outline-offset:-2px}.cf-language-close{margin-top:13px;width:100%;min-height:52px;border-radius:17px;border:0;background:#101620;color:#fff;font-weight:850;font-size:15px}
@media(min-width:760px){.home-category-drawer-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(prefers-reduced-motion:reduce){.home-category-drawer{transition:none}}
`;document.head.appendChild(s)}

/* The product stack already fetched canonical rows during its base cloud sync. Avoid
   the vNext layer immediately issuing three more DB reads before first paint; detail
   market/history is loaded only when the user opens a card. */
try{hydrateCanonicalMarket=async function(){
  state.canonicalCards=state.canonicalCards||{};state.canonicalHistory=state.canonicalHistory||{};state.marketObservations=state.marketObservations||{};
  const next={};for(const h of state.holdings||[]){const c=h?._canonical||(state.canonicalIndex?.get?.(h.canonical_card_id));if(c?.id)next[c.id]={...c,current_price:c.current_price===null?null:Number(c.current_price)}}state.canonicalCards=next;
}}catch{}

function patchVisibleImages(){for(const h of state?.holdings||[]){if(!h?.image_url||!h?.id)continue;const id=window.CSS?.escape?CSS.escape(String(h.id)):String(h.id).replace(/[^\w-]/g,'');document.querySelectorAll(`[data-detail-card="${id}"] .album-image-wrap`).forEach(w=>{let i=w.querySelector('img');if(!i){i=document.createElement('img');i.loading='lazy';i.decoding='async';w.querySelector('.album-placeholder')?.replaceWith(i)}i.src=h.image_url;i.alt=cardName(h)});document.querySelectorAll(`.holding[data-card-id="${id}"]`).forEach(w=>{let i=w.querySelector('img.thumb');if(!i){i=document.createElement('img');i.className='thumb';i.loading='lazy';i.decoding='async';w.querySelector('.thumb.placeholder')?.replaceWith(i)}i.src=h.image_url;i.alt=cardName(h)});document.querySelectorAll(`[data-home-drawer-card="${id}"] .home-drawer-image`).forEach(w=>{let i=w.querySelector('img');if(!i){i=document.createElement('img');w.textContent='';w.appendChild(i)}i.loading='lazy';i.decoding='async';i.src=h.image_url;i.alt=cardName(h)})}}
try{hydrateSignedImages=async function(){if(!state?.supabase||!state?.user||imageHydration)return;const paths=[...new Set((state.holdings||[]).map(h=>h.image_path).filter(Boolean))];if(!paths.length)return;const run=async()=>{const bucket=state.supabase.storage.from('card-images');try{if(typeof bucket.createSignedUrls==='function'){const{data,error}=await bucket.createSignedUrls(paths,3600);if(!error&&Array.isArray(data)){for(let n=0;n<data.length;n++){const row=data[n],path=row?.path||paths[n],h=(state.holdings||[]).find(x=>x.image_path===path);if(h&&row?.signedUrl)h.image_url=row.signedUrl}patchVisibleImages();return}}await Promise.all(paths.map(async path=>{const{data}=await bucket.createSignedUrl(path,3600),h=(state.holdings||[]).find(x=>x.image_path===path);if(h&&data?.signedUrl)h.image_url=data.signedUrl}));patchVisibleImages()}catch(err){console.warn('Cardfolio private images deferred',err)}};const launch=()=>{imageHydration=run().finally(()=>imageHydration=null)};if('requestIdleCallback'in window)requestIdleCallback(launch,{timeout:350});else setTimeout(launch,0)}}catch{}

function patchTitle(){const e=document.getElementById('viewTitle');if(!e)return;const view=state?.view||'home',base=({home:'Home',portfolio:'Portfolio',scan:'Scan a card',watchlist:'Watchlist',market:'Market',grading:'Grading',profile:'Profile'})[view]||'Home';e.style.visibility='visible';e.textContent=tr(base)}
function recentIds(){const cutoff=Date.now()-RECENT_MS;return new Set((state?.holdings||[]).filter(h=>{const t=Date.parse(h?.created_at||'');return Number.isFinite(t)&&t>=cutoff}).slice(0,8).map(h=>String(h.id)))}
function scheduleRecentExpiry(){clearTimeout(recentTimer);if(state?.view!=='home')return;const times=(state.holdings||[]).map(h=>Date.parse(h?.created_at||'')).filter(Number.isFinite).map(t=>t+RECENT_MS).filter(t=>t>Date.now()).sort((a,b)=>a-b);if(!times.length)return;recentTimer=setTimeout(()=>{if(state?.view==='home'&&typeof setView==='function')setView('home')},Math.min(2147483000,Math.max(100,times[0]-Date.now()+100)))}
function patchRecent(){if(state?.view!=='home')return;const sections=[...document.querySelectorAll('.home-section')],section=sections.find(s=>{const h=s.querySelector('h2');return h&&((h.firstChild?.__cfBase||h.textContent.trim())==='Recently added'||h.textContent.trim()===tr('Recently added'))});if(!section)return;const grid=section.querySelector('.home-album');if(grid){const allowed=recentIds();grid.querySelectorAll('[data-detail-card]').forEach(card=>{if(!allowed.has(String(card.dataset.detailCard||'')))card.remove()});if(!grid.querySelector('[data-detail-card]')){const empty=document.createElement('div');empty.className='glass-empty recent-empty';empty.innerHTML=`<strong>${esc(tr('No recent cards.'))}</strong><p>${esc(tr('Cards leave Recently added after 3 days, but stay in Portfolio and their category.'))}</p>`;grid.replaceWith(empty)}}scheduleRecentExpiry()}
function ensureDrawer(){let drawer=document.getElementById(DRAWER_ID);if(drawer)return drawer;const strip=document.querySelector('.category-strip');if(!strip)return null;drawer=document.createElement('section');drawer.id=DRAWER_ID;drawer.className='home-category-drawer';drawer.hidden=true;drawer.setAttribute('aria-live','polite');strip.insertAdjacentElement('afterend',drawer);return drawer}
function drawerCard(h){const p=unitPrice(h),meta=[h?.team,h?.parallel,h?.card_number?`#${h.card_number}`:''].filter(Boolean).join(' · ')||categoryName(h),image=h?.image_url?`<img src="${esc(h.image_url)}" alt="${esc(cardName(h))}" loading="lazy" decoding="async">`:`<div class="home-drawer-placeholder">${categoryIcon(categoryName(h))}</div>`;return `<button type="button" class="home-drawer-card" data-home-drawer-card="${esc(h.id)}"><span class="home-drawer-image">${image}</span><span class="home-drawer-copy"><strong data-no-i18n>${esc(cardName(h))}</strong><small>${esc(meta)}</small><b>${p===null?tr('Pending Price'):moneyText(p)}</b></span></button>`}
function closeDrawer(){const drawer=document.getElementById(DRAWER_ID);if(!drawer||drawer.hidden)return;drawer.classList.remove('open');document.querySelectorAll('.category-bubble[data-open-category]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-expanded','false')});setTimeout(()=>{if(!drawer.classList.contains('open'))drawer.hidden=true},180)}
function openDrawer(name,button){const drawer=ensureDrawer();if(!drawer)return;const cards=(state?.holdings||[]).filter(h=>categoryName(h)===name);drawer.innerHTML=`<div class="home-category-drawer-head"><div><span>${categoryIcon(name)}</span><div><small>${esc(tr('Category'))}</small><strong data-no-i18n>${esc(name)}</strong></div></div><button type="button" class="home-category-close" aria-label="Close">×</button></div><div class="home-category-drawer-grid">${cards.map(drawerCard).join('')}</div>`;drawer.hidden=false;requestAnimationFrame(()=>drawer.classList.add('open'));document.querySelectorAll('.category-bubble[data-open-category]').forEach(b=>{const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-expanded',String(on))});drawer.querySelector('.home-category-close')?.addEventListener('click',closeDrawer);drawer.querySelectorAll('[data-home-drawer-card]').forEach(b=>b.addEventListener('click',()=>{const h=(state.holdings||[]).find(x=>String(x.id)===String(b.dataset.homeDrawerCard));if(h&&typeof openCardDialog==='function')openCardDialog(h)}));drawer.scrollIntoView({behavior:'smooth',block:'nearest'});void hydrateSignedImages?.()}
function patchHome(){if(state?.view!=='home')return;document.querySelectorAll('.category-bubble[data-open-category]').forEach(b=>{b.removeAttribute('data-view');b.type='button';b.setAttribute('aria-controls',DRAWER_ID);if(!b.hasAttribute('aria-expanded'))b.setAttribute('aria-expanded','false')});ensureDrawer();patchRecent()}

/* Capture-phase interception fixes the original race where the older data-view
   handler navigated to Portfolio before the Home drawer's bubbling handler ran. */
document.addEventListener('click',e=>{const b=e.target.closest?.('.category-bubble[data-open-category]');if(!b||state?.view!=='home')return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const drawer=document.getElementById(DRAWER_ID);if(drawer&&!drawer.hidden&&b.classList.contains('selected'))closeDrawer();else openDrawer(b.dataset.openCategory,b)},true);

function shouldSkipText(n){return !!n.parentElement?.closest('.album-copy strong,.asset-title h1,.holding-name,.evidence-row strong,.embedded-listing-copy strong,[data-no-i18n],script,style,textarea')}
function translate(root=document.body){if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);for(const n of nodes){if(shouldSkipText(n))continue;const raw=n.nodeValue||'',trim=raw.trim();if(!trim)continue;if(!n.__cfBase)n.__cfBase=trim;const base=n.__cfBase,next=tr(base),lead=raw.match(/^\s*/)?.[0]||'',tail=raw.match(/\s*$/)?.[0]||'';if(raw!==lead+next+tail)n.nodeValue=lead+next+tail}root.querySelectorAll?.('input[placeholder],textarea[placeholder]').forEach(e=>{if(!e.dataset.cfPh)e.dataset.cfPh=e.getAttribute('placeholder')||'';e.setAttribute('placeholder',tr(e.dataset.cfPh))})}
function localeLabel(){return LOCALES[locale]?.label||'English'}
function languageRow(){const d=document.getElementById('cardDetailDialog');if(!d?.open)return;const rows=[...d.querySelectorAll('.identity-stat-grid > span,.identity-grid > div,.fact-grid > div')],row=rows.find(r=>{const l=r.querySelector(':scope > small,:scope > span')||r.querySelector('small,span');const base=l?.firstChild?.__cfBase||l?.dataset?.cfBase||l?.textContent?.trim();return base==='Language'||l?.textContent?.trim()===tr('Language')});if(!row)return;if(!row.dataset.cardfolioAppLanguage){const value=row.querySelector(':scope > b,:scope > strong')||row.querySelector('b,strong'),cardLanguage=value?.textContent?.trim()||'';if(cardLanguage){const clone=row.cloneNode(true);clone.classList.remove('cardfolio-language-row');clone.removeAttribute('role');clone.removeAttribute('tabindex');clone.dataset.noI18n='1';const cl=clone.querySelector(':scope > small,:scope > span')||clone.querySelector('small,span');if(cl){cl.textContent=tr('Card language');cl.dataset.cfBase='Card language'}const cv=clone.querySelector(':scope > b,:scope > strong')||clone.querySelector('b,strong');if(cv){cv.textContent=cardLanguage;cv.setAttribute('data-no-i18n','1')}row.before(clone)}row.dataset.cardfolioAppLanguage='1'}row.classList.add('cardfolio-language-row');row.setAttribute('role','button');row.setAttribute('tabindex','0');const l=row.querySelector(':scope > small,:scope > span')||row.querySelector('small,span'),v=row.querySelector(':scope > b,:scope > strong')||row.querySelector('b,strong');if(l){l.textContent=tr('Language');l.dataset.cfBase='Language'}if(v){v.textContent=localeLabel();v.setAttribute('data-no-i18n','1')}}
function applyLocale(){document.documentElement.lang=LOCALES[locale].lang;patchTitle();translate();languageRow();document.dispatchEvent(new CustomEvent('cardfolio:locale-changed',{detail:{locale}}))}
function picker(){let p=document.getElementById('cardfolioLanguagePicker');if(p)return p;p=document.createElement('dialog');p.id='cardfolioLanguagePicker';p.innerHTML='<div class="cf-language-sheet"><h2></h2><p>Only Cardfolio interfaces with maintained translations are offered. Card names and marketplace titles are never machine-translated.</p><div class="cf-language-options"></div><button type="button" class="cf-language-close"></button></div>';document.body.appendChild(p);p.querySelector('.cf-language-close').addEventListener('click',()=>p.close());p.addEventListener('click',e=>{if(e.target===p)p.close()});return p}
function openLanguage(){const p=picker(),o=p.querySelector('.cf-language-options');p.querySelector('h2').textContent=tr('Choose language');p.querySelector('.cf-language-close').textContent=tr('Cancel');o.innerHTML=Object.entries(LOCALES).map(([code,m])=>`<button type="button" class="cf-language-option ${code===locale?'selected':''}" data-cf-locale="${code}"><span>${m.label}</span><span>${code===locale?'✓':''}</span></button>`).join('');o.querySelectorAll('[data-cf-locale]').forEach(b=>b.addEventListener('click',()=>{const code=b.dataset.cfLocale;if(!LOCALES[code])return;locale=code;localStorage.setItem(LOCALE_KEY,code);applyLocale();p.close()}));p.showModal()}
document.addEventListener('click',e=>{const r=e.target.closest?.('.cardfolio-language-row');if(!r)return;e.preventDefault();e.stopPropagation();openLanguage()},true);document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest?.('.cardfolio-language-row')){e.preventDefault();openLanguage()}});window.cardfolioSetLocale=code=>{if(LOCALES[code]){locale=code;localStorage.setItem(LOCALE_KEY,code);applyLocale()}};

function scannerUi(){let el=document.getElementById('cardfolioScanner');if(el)return el;el=document.createElement('div');el.id='cardfolioScanner';el.innerHTML=`<div class="scan-top"><button class="scan-x" type="button" aria-label="Close">×</button><strong>${esc(tr('Card scanner'))}</strong><span class="scan-spacer"></span></div><div class="scan-stage"><video playsinline autoplay muted></video><img class="scan-preview" alt="Card scan preview"><div class="scan-frame"></div><div class="scan-hint">${esc(tr('Center the card inside the frame'))}</div><div class="scan-status"></div></div><div class="scan-controls"><button class="scan-secondary scan-retake" type="button" hidden>${esc(tr('Retake'))}</button><button class="scan-capture" type="button" aria-label="Capture"></button><button class="scan-secondary scan-use" type="button" hidden>${esc(tr('Use scan'))}</button></div>`;document.body.appendChild(el);el.querySelector('.scan-x').addEventListener('click',closeScanner);el.querySelector('.scan-capture').addEventListener('click',captureScanner);el.querySelector('.scan-retake').addEventListener('click',()=>void openScanner());el.querySelector('.scan-use').addEventListener('click',useScanner);return el}
function scannerStatus(msg=''){const e=document.querySelector('#cardfolioScanner .scan-status');if(!e)return;e.textContent=msg;e.classList.toggle('show',!!msg)}
function stopScanner(){if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null}}
function clearScannerBlob(){if(scannerBlobUrl){URL.revokeObjectURL(scannerBlobUrl);scannerBlobUrl=''}}
function closeScanner(){stopScanner();clearScannerBlob();const e=document.getElementById('cardfolioScanner');e?.classList.remove('open','preview');if(e)e._blob=null;document.body.style.overflow=''}
async function openScanner(){const el=scannerUi();stopScanner();clearScannerBlob();el._blob=null;el.classList.remove('preview');el.classList.add('open');document.body.style.overflow='hidden';el.querySelector('.scan-capture').hidden=false;el.querySelector('.scan-retake').hidden=true;el.querySelector('.scan-use').hidden=true;scannerStatus(tr('Hold steady, then capture'));try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera_api_unavailable');scannerStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:2560}}});const v=el.querySelector('video');v.srcObject=scannerStream;await v.play();scannerStatus('')}catch(err){console.warn('Cardfolio live scanner unavailable',err);scannerStatus('Opening the device camera…');setTimeout(()=>{closeScanner();document.getElementById('cameraInput')?.click()},450)}}
async function captureScanner(){const el=document.getElementById('cardfolioScanner'),v=el?.querySelector('video');if(!el||!v||!v.videoWidth||!v.videoHeight)return;const stage=el.querySelector('.scan-stage'),frame=el.querySelector('.scan-frame'),sr=stage.getBoundingClientRect(),fr=frame.getBoundingClientRect(),vw=v.videoWidth,vh=v.videoHeight,scale=Math.max(sr.width/vw,sr.height/vh),shownW=vw*scale,shownH=vh*scale,hiddenX=Math.max(0,(shownW-sr.width)/2),hiddenY=Math.max(0,(shownH-sr.height)/2);let sx=(fr.left-sr.left+hiddenX)/scale,sy=(fr.top-sr.top+hiddenY)/scale,cw=fr.width/scale,ch=fr.height/scale;sx=Math.max(0,Math.min(vw-1,sx));sy=Math.max(0,Math.min(vh-1,sy));cw=Math.max(1,Math.min(cw,vw-sx));ch=Math.max(1,Math.min(ch,vh-sy));const c=document.createElement('canvas');c.width=Math.round(cw);c.height=Math.round(ch);c.getContext('2d').drawImage(v,sx,sy,cw,ch,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));if(!blob)return;stopScanner();clearScannerBlob();scannerBlobUrl=URL.createObjectURL(blob);el._blob=blob;el.querySelector('.scan-preview').src=scannerBlobUrl;el.classList.add('preview');el.querySelector('.scan-capture').hidden=true;el.querySelector('.scan-retake').hidden=false;el.querySelector('.scan-use').hidden=false;scannerStatus('')}
async function useScanner(){const el=document.getElementById('cardfolioScanner'),blob=el?._blob;if(!blob)return;const file=new File([blob],`card-scan-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});closeScanner();try{if(typeof processCroppedCard==='function')await processCroppedCard({file,meta:{mode:'scanner',ratio:'2.5:3.5',captured_at:new Date().toISOString()}},file);else if(typeof scanFile==='function')await scanFile(file)}catch(err){console.error('Cardfolio scanner processing failed',err);try{toast('Scan processing failed. Try again.')}catch{}}}
document.addEventListener('click',e=>{if(!e.target.closest?.('#cameraBtn'))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();void openScanner()},true);window.cardfolioOpenScanner=openScanner;

function loadProxy(path,key){if(lazy.has(key))return lazy.get(key);const p=new Promise((resolve,reject)=>{if(document.querySelector(`script[data-cardfolio-lazy="${key}"]`)){resolve();return}const s=document.createElement('script');s.src=`/api/proxy?path=${encodeURIComponent(path)}&v=20260911-deep-1`;s.async=false;s.dataset.cardfolioLazy=key;s.onload=resolve;s.onerror=()=>reject(new Error(`Failed to load ${path}`));document.head.appendChild(s)}).catch(err=>console.warn('Cardfolio enhancement deferred',err));lazy.set(key,p);return p}
function loadProxyCss(path,key){if(document.querySelector(`link[data-cardfolio-lazy-css="${key}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=`/api/proxy?path=${encodeURIComponent(path)}&v=20260911-deep-1`;l.dataset.cardfolioLazyCss=key;document.head.appendChild(l)}
async function loadDetailMarket(){loadProxyCss('cardfolio-market-v2.css','market-v2');await loadProxy('cardfolio-market-integrity.js','market-integrity');await loadProxy('cardfolio-chart-daily-average.js','daily-average');await loadProxy('cardfolio-market-experience.js','market-experience');await loadProxy('cardfolio-market-live-ui.js','market-live-ui')}
async function loadWatch(){const fresh=!lazy.has('watch-v2');await loadProxy('cardfolio-watchlists-v2.js','watch-v2');await loadProxy('cardfolio-watchlists-ios-guard.js','watch-ios');if(fresh&&state?.view==='watchlist'&&typeof render==='function')render()}
async function loadMarket(){loadProxyCss('cardfolio-marketplace-ui.css','market-ui');await loadProxy('cardfolio-commercial.js','commercial');await loadProxy('cardfolio-marketplace-ui.js','marketplace-ui');if(state?.view==='market'&&typeof render==='function')render()}
function loadForView(v){if(v==='watchlist')void loadWatch();if(v==='market')void loadMarket()}

const baseSetView=typeof setView==='function'?setView:null;if(baseSetView){setView=function(v){const r=baseSetView(v);loadForView(v);queuePatch();return r}}
function patch(){patchTitle();patchHome();applyLocale();if(document.getElementById('cardDetailDialog')?.open){languageRow();void loadDetailMarket()}}
function queuePatch(){if(patchQueued)return;patchQueued=true;requestAnimationFrame(()=>{patchQueued=false;patch()})}
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.id==='cardDetailContent'||n.querySelector?.('#cardDetailContent,.category-strip,.home-album,#viewTitle')){queuePatch();if(n.id==='cardDetailContent'||n.querySelector?.('#cardDetailContent'))void loadDetailMarket();return}}}).observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',e=>{if(e.target.closest?.('[data-detail-card],.holding[data-card-id]'))void loadDetailMarket();const v=e.target.closest?.('[data-view]')?.dataset?.view;if(v)loadForView(v)},true);

installCss();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{queuePatch();applyLocale()},{once:true});else{queuePatch();applyLocale()}
const idle=()=>{void loadProxy('cardfolio-live-sync.js','live-sync');void loadProxy('cardfolio-ui-prune.js','ui-prune')};if('requestIdleCallback'in window)requestIdleCallback(idle,{timeout:2500});else setTimeout(idle,1200);
})();
