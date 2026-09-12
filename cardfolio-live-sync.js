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

/* A category can contain far more cards than the Home 'Recently added' rail. The
   earlier animated drawer had a fixed 950px cap and overflow:hidden, which made a
   large Pokémon category look as though only recent cards existed. Keep the drawer
   compact, but make the entire category scrollable. */
function installCategoryDrawerOverflowFix(){
  if(document.getElementById('cardfolio-category-overflow-fix'))return;
  const style=document.createElement('style');
  style.id='cardfolio-category-overflow-fix';
  style.textContent='.home-category-drawer.open{max-height:min(78vh,1200px)!important;overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}';
  document.head.appendChild(style);
}

function loadScript(path,key,version){
  if(document.querySelector(`script[data-cardfolio-${key}]`))return;
  const script=document.createElement('script');
  script.src=`/api/proxy?path=${encodeURIComponent(path)}&v=${encodeURIComponent(version)}`;
  script.async=true;
  script.setAttribute(`data-cardfolio-${key}`,'1');
  script.onerror=()=>console.warn(`Cardfolio ${key} deferred`);
  document.head.appendChild(script);
}
function loadCss(path,key,version){
  if(document.querySelector(`link[data-cardfolio-${key}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=`/api/proxy?path=${encodeURIComponent(path)}&v=${encodeURIComponent(version)}`;
  link.setAttribute(`data-cardfolio-${key}`,'1');
  document.head.appendChild(link);
}
function loadProductLayers(){
  loadCss('cardfolio-community.css','community','20260911-community-1');
  if(!window.cardfolioCommunityVersion)loadScript('cardfolio-community.js','community','20260911-community-1');
  loadCss('cardfolio-portfolio-lab.css','portfolio-lab','20260911-lab-1');
  if(!window.cardfolioPortfolioLabVersion)loadScript('cardfolio-portfolio-lab.js','portfolio-lab','20260911-lab-1');
}

document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloud('visible',false);});
window.addEventListener('focus',()=>void refreshCloud('focus',false));
window.addEventListener('pageshow',()=>void refreshCloud('pageshow',false));
setInterval(()=>void refreshCloud('timer',false),POLL_MS);
window.cardfolioRefreshCloud=()=>refreshCloud('manual',true);
installCategoryDrawerOverflowFix();
loadProductLayers();
})();
