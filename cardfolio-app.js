/* Cardfolio MVP — source-aware card portfolio. No fabricated pricing. */
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
  ebayConfigured:false
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
  await initBackend();
  render();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/cardfolio-sw.js').catch(()=>{});
}
function loadLocal(){try{state.holdings=JSON.parse(localStorage.getItem(LOCAL_HOLDINGS)||'[]');state.snapshots=JSON.parse(localStorage.getItem(LOCAL_SNAPSHOTS)||'[]');state.watchlist=JSON.parse(localStorage.getItem(LOCAL_WATCHLIST)||'[]')}catch{state.holdings=[];state.snapshots=[];state.watchlist=[]}}
function saveLocal(){localStorage.setItem(LOCAL_HOLDINGS,JSON.stringify(state.holdings));localStorage.setItem(LOCAL_SNAPSHOTS,JSON.stringify(state.snapshots));localStorage.setItem(LOCAL_WATCHLIST,JSON.stringify(state.watchlist))}
async function initBackend(){
  let cfg=PUBLIC_BACKEND_CONFIG;
  try{
    const r=await fetch('/api/config',{cache:'no-store'});
    if(r.ok){const remote=await r.json();if(remote?.configured)cfg={...cfg,...remote};}
  }catch{}
  try{
    state.config=cfg;
    if(!cfg.configured) throw new Error('not configured');
    const {createClient}=await import(SUPABASE_BROWSER_MODULE);
    state.supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session}}=await state.supabase.auth.getSession(); state.user=session?.user||null;
    state.supabase.auth.onAuthStateChange(async(_event,session)=>{
      state.user=session?.user||null;
      if(state.user) await syncCloud();
      else loadLocal();
      updateAuthButton();
      render();
    });
    state.backend='cloud'; $('#backendBadge').textContent='Supabase cloud';$('#backendBadge').className='status-pill good';
    if(state.user) await syncCloud();
  }catch{
    state.backend='local';state.supabase=null;state.user=null;loadLocal();$('#backendBadge').textContent='Local Vault';$('#backendBadge').className='status-pill neutral';
  }
  updateAuthButton();
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
  await hydrateSignedImages();
}
async function hydrateSignedImages(){
  if(!state.supabase||!state.user) return;
  const paths=state.holdings.filter(h=>h.image_path).map(h=>h.image_path);
  await Promise.all(paths.map(async path=>{const {data}=await state.supabase.storage.from('card-images').createSignedUrl(path,3600);const holding=state.holdings.find(h=>h.image_path===path);if(holding)holding.image_url=data?.signedUrl||''}));
}
function updateAuthButton(){
  const b=$('#authButton'); if(!b) return;
  if(state.user){b.textContent='Sign out';b.title=state.user.email||'Signed in'}else b.textContent=state.backend==='cloud'?'Sign in':'Local Vault';
}
function fromDb(r){return {...r,cost_basis:r.cost_basis===null?'':Number(r.cost_basis),manual_value:r.manual_value===null?'':Number(r.manual_value),market_value:r.market_value===null?null:Number(r.market_value)}}
function toDb(h){const allowed=['id','category','subject','year','manufacturer','brand','set_name','card_number','parallel','serial_number','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value','grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','tcgdex_card_id','market_value','valuation_source','valuation_observed_at','external_ids','metadata'];const out={};for(const k of allowed) out[k]=h[k]??null;out.user_id=state.user.id;out.updated_at=nowIso();return out}
