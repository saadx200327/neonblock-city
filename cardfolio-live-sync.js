/* Cardfolio live cloud refresh.
   Keeps long-lived iOS/PWA sessions in sync with server-side expert review and market pricing.
   This is intentionally read-only: syncCloud remains the single cloud hydration authority. */
(function(){
'use strict';

let lastRefreshAt=0;
let inFlight=null;
const MIN_GAP_MS=15000;
const POLL_MS=60000;

function activeView(){
  try{
    if(typeof state!=='undefined'&&state?.view)return state.view;
    if(typeof state!=='undefined'&&state?.currentView)return state.currentView;
  }catch{}
  return document.querySelector('.mobile-nav button.active,[data-view].active')?.dataset?.view||'home';
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
        const view=activeView();
        await syncCloud();
        lastRefreshAt=Date.now();
        if(typeof setView==='function')setView(view);
        document.dispatchEvent(new CustomEvent('cardfolio:cloud-refreshed',{detail:{reason,at:new Date().toISOString()}}));
        return true;
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

document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloud('visible',true);});
window.addEventListener('focus',()=>void refreshCloud('focus',true));
window.addEventListener('pageshow',()=>void refreshCloud('pageshow',true));
setInterval(()=>void refreshCloud('timer',false),POLL_MS);

window.cardfolioRefreshCloud=()=>refreshCloud('manual',true);
})();

/* Loaded after the existing market-integrity layer so it can safely improve only
   the card-detail market presentation without changing canonical valuation data. */
(function loadCardfolioMarketExperience(){
  if(document.querySelector('script[data-cardfolio-market-experience]'))return;
  const script=document.createElement('script');
  script.src='/cardfolio-market-experience.js?v=20260908-1';
  script.async=false;
  script.dataset.cardfolioMarketExperience='1';
  document.head.appendChild(script);
})();

/* Mobile product upgrades. These are presentation/input layers only; they do not
   change canonical pricing authority or delete/overwrite portfolio data. */
(function loadCardfolioMobileUpgrades(){
  const scripts=[
    ['/cardfolio-scanner-native.js?v=20260911-1','cardfolioScannerNative'],
    ['/cardfolio-locale.js?v=20260911-1','cardfolioLocale'],
    ['/cardfolio-market-live-ui.js?v=20260911-1','cardfolioMarketLiveUi']
  ];
  for(const [src,key] of scripts){
    if(document.querySelector(`script[data-${key}]`))continue;
    const script=document.createElement('script');script.src=src;script.async=false;script.dataset[key]='1';document.head.appendChild(script);
  }
})();
