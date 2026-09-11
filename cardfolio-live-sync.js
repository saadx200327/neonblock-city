/* Cardfolio live cloud refresh.
   Keeps long-lived iOS/PWA sessions in sync with server-side review and market pricing.
   Loaded after first paint; it does not own scanner, locale, market UI, or startup rendering. */
(function(){
'use strict';

let lastRefreshAt=0;
let inFlight=null;
const MIN_GAP_MS=20000;
const POLL_MS=90000;

function activeView(){
  try{
    if(typeof state!=='undefined'&&state?.view)return state.view;
    if(typeof state!=='undefined'&&state?.currentView)return state.currentView;
  }catch{}
  return document.querySelector('.mobile-nav button.active,[data-view].active')?.dataset?.view||'home';
}
function fingerprint(){
  try{
    return JSON.stringify((state?.holdings||[]).map(h=>[
      h.id,h.updated_at,h.canonical_card_id,h.market_value,h.valuation_status,h.image_path,
      h?._canonical?.current_price,h?._canonical?.valuation_status,h?._canonical?.last_market_check
    ]));
  }catch{return ''}
}

async function refreshCloud(reason='timer',force=false){
  try{
    if(typeof state==='undefined'||!state?.user||!state?.supabase||state.backend!=='cloud')return false;
    if(typeof syncCloud!=='function')return false;
    if(document.hidden&&reason!=='manual')return false;
    const t=Date.now();
    if(!force&&t-lastRefreshAt<MIN_GAP_MS)return false;
    if(inFlight)return inFlight;

    inFlight=(async()=>{
      try{
        const view=activeView(),before=fingerprint();
        await syncCloud();
        lastRefreshAt=Date.now();
        const changed=before!==fingerprint();
        if(changed&&typeof setView==='function')setView(view);
        document.dispatchEvent(new CustomEvent('cardfolio:cloud-refreshed',{detail:{reason,changed,at:new Date().toISOString()}}));
        return changed;
      }catch(error){
        console.warn('Cardfolio background cloud refresh deferred',error);
        return false;
      }finally{
        inFlight=null;
      }
    })();
    return inFlight;
  }catch(error){
    console.warn('Cardfolio cloud refresh guard deferred',error);
    inFlight=null;
    return false;
  }
}

document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloud('visible',false);});
window.addEventListener('focus',()=>void refreshCloud('focus',false));
window.addEventListener('pageshow',()=>void refreshCloud('pageshow',false));
setInterval(()=>void refreshCloud('timer',false),POLL_MS);
window.cardfolioRefreshCloud=()=>refreshCloud('manual',true);
})();
