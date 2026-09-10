/* Cardfolio MVP — source-aware card portfolio. No fabricated pricing. */
const CARDFOLIO_BRAND_DATA_URI='data:image/png;base64,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';
window.CARDFOLIO_BRAND_DATA_URI=CARDFOLIO_BRAND_DATA_URI;
function applyCardfolioBrand(){
  document.querySelectorAll('img[data-cardfolio-brand],.cardfolio-topbar-logo img').forEach(img=>{if(img.src!==CARDFOLIO_BRAND_DATA_URI)img.src=CARDFOLIO_BRAND_DATA_URI});
  const iconLinks=[...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')];
  if(!iconLinks.length){const link=document.createElement('link');link.rel='icon';link.type='image/png';document.head.appendChild(link);iconLinks.push(link)}
  iconLinks.forEach(link=>link.href=CARDFOLIO_BRAND_DATA_URI);
  const tile=document.querySelector('meta[name="msapplication-TileImage"]');if(tile)tile.content=CARDFOLIO_BRAND_DATA_URI;
}
applyCardfolioBrand();
document.addEventListener('DOMContentLoaded',applyCardfolioBrand,{once:true});

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money = (v) => Number.isFinite(Number(v)) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)) : '—';
const pct = (v) => `${Number(v||0).toFixed(1)}%`;
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const SUPABASE_BROWSER_MODULE='https://esm.sh/@supabase/supabase-js@2.115.0';

const PUBLIC_BACKEND_CONFIG={
  configured:true,
  supabaseUrl:'https://tvxwzkununcwxiwvrslh.supabase.co',
  supabasePublishableKey:'sb_publishable_--j19axhauUMNFXCgUumMA_d1teIy0H',
  ebayConfigured:false,
  visionBackend:'expert-queue',
  paidVisionFallback:false
};
const state = {
  view:'home', holdings:[], snapshots:[], watchlist:[], backend:'local', supabase:null, user:null,
  scan:null, filter:{q:'',category:'All',pricing:'All'}, watchFilter:{q:'',category:'All'}, config:null
};
const LOCAL_HOLDINGS='cardfolio.holdings.v1', LOCAL_SNAPSHOTS='cardfolio.snapshots.v1', LOCAL_WATCHLIST='cardfolio.watchlist.v1';
const brands=['TOPPS','BOWMAN','PANINI','PRIZM','SELECT','MOSAIC','OPTIC','DONRUSS','UPPER DECK','LEAF','FLEER','SCORE','SKYBOX','POKEMON','POKÉMON'];
const categoryHints={Basketball:['NBA','BASKETBALL'],Soccer:['SOCCER','UEFA','FIFA','PREMIER LEAGUE','CHAMPIONS LEAGUE'],Baseball:['MLB','BASEBALL'],Football:['NFL','FOOTBALL'],Hockey:['NHL','HOCKEY'],'UFC / MMA':['UFC','MMA'],Wrestling:['WWE','WRESTLING'],'Formula 1':['FORMULA 1','F1'],NASCAR:['NASCAR'],Pokémon:['POKEMON','POKÉMON']};

function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2600)}
function setView(view){state.view=view;$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const meta={home:['Portfolio intelligence','Home'],portfolio:['Your collection','Portfolio'],scan:['Camera-first intake','Scan a card'],watchlist:['Targets & chases','Watchlist'],market:['Verified sources','Market'],grading:['Third-party grading','Grading hub'],profile:['Account & data','Profile']};const next=meta[view]||meta.home;$('#viewEyebrow').textContent=next[0];$('#viewTitle').textContent=next[1];render();$('#content').focus({preventScroll:true})}

async function bootstrap(){
  bindGlobalEvents();
  loadLocal();
  // First paint must never wait for Vercel, Supabase, auth, or image signing.
  render();
  const registerServiceWorker=()=>{
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/cardfolio-sw.js').catch(()=>{});
  };
  if('requestIdleCallback' in window) requestIdleCallback(registerServiceWorker,{timeout:1500});
  else setTimeout(registerServiceWorker,0);
  // Cloud setup and refresh happen behind the already-usable local UI.
  initBackend().catch(()=>{});
}
function loadLocal(){try{state.holdings=JSON.parse(localStorage.getItem(LOCAL_HOLDINGS)||'[]');state.snapshots=JSON.parse(localStorage.getItem(LOCAL_SNAPSHOTS)||'[]');state.watchlist=JSON.parse(localStorage.getItem(LOCAL_WATCHLIST)||'[]')}catch{state.holdings=[];state.snapshots=[];state.watchlist=[]}}
function saveLocal(){localStorage.setItem(LOCAL_HOLDINGS,JSON.stringify(state.holdings));localStorage.setItem(LOCAL_SNAPSHOTS,JSON.stringify(state.snapshots));localStorage.setItem(LOCAL_WATCHLIST,JSON.stringify(state.watchlist))}
async function initBackend(){
  let cfg={...PUBLIC_BACKEND_CONFIG};
  try{
    const [remoteResult,mod]=await Promise.all([
      fetch('/api/config',{cache:'no-store'}).then(async r=>r.ok?await r.json():null).catch(()=>null),
      import(SUPABASE_BROWSER_MODULE)
    ]);
    if(remoteResult?.configured){
      cfg={...cfg,...remoteResult,visionBackend:'expert-queue',paidVisionFallback:false};
    }
    state.config=cfg;
    if(!cfg.configured) throw new Error('not configured');
    state.supabase=mod.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session}}=await state.supabase.auth.getSession();
    state.user=session?.user||null;
    const initialUserId=state.user?.id||null;
    state.supabase.auth.onAuthStateChange((event,nextSession)=>{
      const previousId=state.user?.id||null;
      const nextUser=nextSession?.user||null;
      const nextId=nextUser?.id||null;
      state.user=nextUser;
      if(event==='INITIAL_SESSION'&&nextId===initialUserId){updateAuthButton();return}
      if(event==='TOKEN_REFRESHED'&&nextId===previousId){updateAuthButton();return}
      Promise.resolve().then(async()=>{
        if(nextUser){await syncCloud();}
        else{loadLocal();render();}
        updateAuthButton();
        render();
      });
    });
    state.backend='cloud';
    $('#backendBadge').textContent='Supabase cloud';
    $('#backendBadge').className='status-pill good';
    updateAuthButton();
    render();
    if(state.user){
      await syncCloud();
      render();
    }
  }catch{
    state.backend='local';state.supabase=null;state.user=null;loadLocal();$('#backendBadge').textContent='Local Vault';$('#backendBadge').className='status-pill neutral';
    updateAuthButton();
    render();
  }
}
async function syncCloud(){
  if(!state.supabase||!state.user) return;
  const [{data:h,error:he},{data:s,error:se},{data:w,error:we}]=await Promise.all([
    state.supabase.from('card_holdings').select('*').order('created_at',{ascending:false}),
    state.supabase.from('price_snapshots').select('*').order('observed_at',{ascending:true}),
    state.supabase.from('watchlist_items').select('*').order('created_at',{ascending:false})
  ]);
  if(he||se||we){toast('Cloud sync failed');return}
  state.holdings=(h||[]).map(fromDb); state.snapshots=s||[]; state.watchlist=(w||[]).map(w=>({...w,target_price:w.target_price===null?'':Number(w.target_price)}));
  render();
  await hydrateSignedImages();
}
async function hydrateSignedImages(){
  if(!state.supabase||!state.user) return;
  const paths=[...new Set(state.holdings.filter(h=>h.image_path).map(h=>h.image_path))];
  if(!paths.length)return;
  const bucket=state.supabase.storage.from('card-images');
  try{
    if(typeof bucket.createSignedUrls==='function'){
      const {data,error}=await bucket.createSignedUrls(paths,3600);
      if(!error&&Array.isArray(data)){
        data.forEach((row,index)=>{
          const path=row?.path||paths[index];
          if(!path)return;
          const holding=state.holdings.find(h=>h.image_path===path);
          if(holding)holding.image_url=row?.signedUrl||'';
        });
        render();
        return;
      }
    }
  }catch{}
  await Promise.all(paths.map(async path=>{
    const {data}=await bucket.createSignedUrl(path,3600);
    const holding=state.holdings.find(h=>h.image_path===path);
    if(holding)holding.image_url=data?.signedUrl||'';
  }));
  render();
}
function updateAuthButton(){
  const b=$('#authButton'); if(!b) return;
  if(state.user){b.textContent='Sign out';b.title=state.user.email||'Signed in'}else b.textContent=state.backend==='cloud'?'Sign in':'Local Vault';
}
function fromDb(r){return {...r,cost_basis:r.cost_basis===null?'':Number(r.cost_basis),manual_value:r.manual_value===null?'':Number(r.manual_value),market_value:r.market_value===null?null:Number(r.market_value)}}
function toDb(h){const allowed=['id','category','subject','year','manufacturer','brand','set_name','card_number','parallel','serial_number','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value','grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','tcgdex_card_id','market_value','valuation_source','valuation_observed_at','external_ids','metadata'];const out={};for(const k of allowed) out[k]=h[k]??null;out.user_id=state.user.id;out.updated_at=nowIso();return out}