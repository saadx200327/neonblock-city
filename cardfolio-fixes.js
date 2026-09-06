/* Cardfolio QA hotfixes. Loaded after core modules so corrected functions replace earlier declarations. */
function hasNumericValue(value){
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
function valued(h){
  return hasNumericValue(h.market_value) || hasNumericValue(h.manual_value);
}
function holdingValue(h){
  const unitValue = hasNumericValue(h.market_value)
    ? Number(h.market_value)
    : hasNumericValue(h.manual_value)
      ? Number(h.manual_value)
      : 0;
  return unitValue * Number(h.quantity || 1);
}

/* Keep local scans/watchlists safe across first cloud sign-in and remove cloud data from memory on sign-out. */
let cardfolioMigrationPromise = null;
function readLocalVault(){
  try{
    return {
      holdings: JSON.parse(localStorage.getItem(LOCAL_HOLDINGS) || '[]'),
      snapshots: JSON.parse(localStorage.getItem(LOCAL_SNAPSHOTS) || '[]'),
      watchlist: JSON.parse(localStorage.getItem(LOCAL_WATCHLIST) || '[]')
    };
  }catch{
    return {holdings:[],snapshots:[],watchlist:[]};
  }
}
function loadLocal(){
  const local=readLocalVault();
  state.holdings=Array.isArray(local.holdings)?local.holdings:[];
  state.snapshots=Array.isArray(local.snapshots)?local.snapshots:[];
  state.watchlist=Array.isArray(local.watchlist)?local.watchlist:[];
}
function saveLocal(){
  localStorage.setItem(LOCAL_HOLDINGS,JSON.stringify(state.holdings||[]));
  localStorage.setItem(LOCAL_SNAPSHOTS,JSON.stringify(state.snapshots||[]));
  localStorage.setItem(LOCAL_WATCHLIST,JSON.stringify(state.watchlist||[]));
}
function toDb(h){
  const allowed=['id','category','subject','year','manufacturer','brand','set_name','card_number','parallel','serial_number','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value','grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','tcgdex_card_id','market_value','valuation_source','valuation_observed_at','external_ids','metadata'];
  const out={};
  for(const k of allowed){
    if(k==='external_ids'||k==='metadata') out[k]=h[k]&&typeof h[k]==='object'?h[k]:{};
    else out[k]=h[k]??null;
  }
  for(const k of ['cost_basis','manual_value','market_value']) if(out[k]==='') out[k]=null;
  for(const k of ['acquisition_date','valuation_observed_at']) if(out[k]==='') out[k]=null;
  out.user_id=state.user.id;
  out.updated_at=nowIso();
  return out;
}
function toWatchDb(w){
  return {
    id:w.id,
    user_id:state.user.id,
    category:w.category||'Other',
    subject:w.subject,
    year:w.year||null,
    manufacturer:w.manufacturer||null,
    brand:w.brand||null,
    set_name:w.set_name||null,
    card_number:w.card_number||null,
    target_price:hasNumericValue(w.target_price)?Number(w.target_price):null,
    external_ids:w.external_ids&&typeof w.external_ids==='object'?w.external_ids:{}
  };
}
async function migrateLocalToCloud(){
  if(!state.supabase||!state.user) return;
  if(cardfolioMigrationPromise) return cardfolioMigrationPromise;
  cardfolioMigrationPromise=(async()=>{
    const local=readLocalVault();
    const localHoldings=Array.isArray(local.holdings)?local.holdings.filter(h=>h&&h.id&&h.subject):[];
    const localSnapshots=Array.isArray(local.snapshots)?local.snapshots.filter(s=>s&&s.id&&s.holding_id):[];
    const localWatchlist=Array.isArray(local.watchlist)?local.watchlist.filter(w=>w&&w.id&&w.subject):[];
    if(!localHoldings.length&&!localSnapshots.length&&!localWatchlist.length) return;
    const [{data:remoteH,error:holdingsReadError},{data:remoteS,error:snapshotsReadError},{data:remoteW,error:watchReadError}]=await Promise.all([
      state.supabase.from('card_holdings').select('id'),
      state.supabase.from('price_snapshots').select('id'),
      state.supabase.from('watchlist_items').select('id')
    ]);
    if(holdingsReadError||snapshotsReadError||watchReadError) throw new Error('Could not inspect cloud vault before migration');
    const cloudHoldingIds=new Set((remoteH||[]).map(x=>x.id));
    const cloudSnapshotIds=new Set((remoteS||[]).map(x=>x.id));
    const cloudWatchIds=new Set((remoteW||[]).map(x=>x.id));
    let migratedHoldings=0,migratedSnapshots=0,migratedWatchlist=0;
    for(const localHolding of localHoldings){
      if(cloudHoldingIds.has(localHolding.id)) continue;
      const row={...localHolding};
      if(!row.image_path&&typeof row.image_url==='string'&&row.image_url.startsWith('data:image/')){
        try{
          const imageBlob=await (await fetch(row.image_url)).blob();
          const path=`${state.user.id}/${uuid()}.jpg`;
          const {error:uploadError}=await state.supabase.storage.from('card-images').upload(path,imageBlob,{contentType:imageBlob.type||'image/jpeg',upsert:false});
          if(!uploadError) row.image_path=path;
        }catch{}
      }
      const {error}=await state.supabase.from('card_holdings').insert(toDb(row));
      if(!error){cloudHoldingIds.add(localHolding.id);migratedHoldings++;}
    }
    for(const localSnapshot of localSnapshots){
      if(cloudSnapshotIds.has(localSnapshot.id)||!cloudHoldingIds.has(localSnapshot.holding_id)) continue;
      const snapshot={...localSnapshot,user_id:state.user.id};
      const {error}=await state.supabase.from('price_snapshots').insert(snapshot);
      if(!error){cloudSnapshotIds.add(localSnapshot.id);migratedSnapshots++;}
    }
    for(const localTarget of localWatchlist){
      if(cloudWatchIds.has(localTarget.id)) continue;
      const {error}=await state.supabase.from('watchlist_items').insert(toWatchDb(localTarget));
      if(!error){cloudWatchIds.add(localTarget.id);migratedWatchlist++;}
    }
    if(migratedHoldings||migratedSnapshots||migratedWatchlist) toast(`Cloud backup added · ${migratedHoldings} cards${migratedWatchlist?` · ${migratedWatchlist} targets`:''}${migratedSnapshots?` · ${migratedSnapshots} prices`:''}`);
  })().catch(err=>{console.warn('Cardfolio local migration failed',err);toast('Device data is still safe; cloud migration will retry.');}).finally(()=>{cardfolioMigrationPromise=null;});
  return cardfolioMigrationPromise;
}
async function initBackend(){
  let cfg=PUBLIC_BACKEND_CONFIG;
  try{
    const r=await fetch('/api/config',{cache:'no-store'});
    if(r.ok){const remote=await r.json();if(remote?.configured)cfg={...cfg,...remote};}
  }catch{}
  try{
    state.config=cfg;if(!cfg.configured) throw new Error('not configured');
    const {createClient}=await import(SUPABASE_BROWSER_MODULE);
    state.supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session}}=await state.supabase.auth.getSession();state.user=session?.user||null;
    state.backend='cloud';$('#backendBadge').textContent='Supabase cloud';$('#backendBadge').className='status-pill good';
    state.supabase.auth.onAuthStateChange((_event,session)=>{
      state.user=session?.user||null;
      setTimeout(async()=>{
        if(state.user){await migrateLocalToCloud();await syncCloud();}
        else loadLocal();
        updateAuthButton();
        render();
      },0);
    });
    if(state.user){await migrateLocalToCloud();await syncCloud();}
  }catch{
    state.backend='local';state.supabase=null;state.user=null;loadLocal();$('#backendBadge').textContent='Local Vault';$('#backendBadge').className='status-pill neutral';
  }
  updateAuthButton();
}

/* Verified market routing: native API where available, honest outbound links everywhere else. */
function primaryMarketLinks(h){
  const maker=`${h.manufacturer||''} ${h.brand||''}`.toUpperCase();
  const links=[];
  if(h.category==='Pokémon'||maker.includes('POKEMON')||maker.includes('POKÉMON')) links.push(['Pokémon Center','https://www.pokemoncenter.com/']);
  if(maker.includes('TOPPS')||maker.includes('BOWMAN')) links.push(['Topps official','https://www.topps.com/collections/cards']);
  if(['PANINI','PRIZM','SELECT','MOSAIC','OPTIC','DONRUSS'].some(x=>maker.includes(x))) links.push(['Panini official','https://www.paniniamerica.net/cards']);
  if(maker.includes('UPPER DECK')||maker.includes('FLEER')) links.push(['Upper Deck official','https://upperdeckstore.com/']);
  return links;
}
function secondaryMarketLinks(){
  return [
    ['Fanatics Collect','https://www.fanaticscollect.com/marketplace'],
    ['Fanatics sold history','https://sales-history.fanaticscollect.com/'],
    ['Mercari sports cards','https://www.mercari.com/us/category/sports-trading-cards-1787/'],
    ['Poshmark sports cards','https://poshmark.com/style-tag/SPORTS%20CARDS'],
    ['OfferUp · manual search','https://offerup.com/'],
    ['Facebook Marketplace · manual search','https://www.facebook.com/marketplace/']
  ];
}
const cardfolioBaseRenderMarketFor=renderMarketFor;
renderMarketFor=async function(h){
  await cardfolioBaseRenderMarketFor(h);
  const box=$('#marketResults');
  if(!box) return;
  const ebayRow=box.querySelector('.button-row');
  if(!ebayRow) return;
  const q=marketQuery(h);
  const primary=primaryMarketLinks(h);
  const primaryHtml=primary.length?`<div class="market-link-group"><div class="eyebrow">Primary market</div><div class="button-row">${primary.map(([name,url])=>`<a class="btn secondary" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} ↗</a>`).join('')}</div></div>`:'';
  const secondaryHtml=`<div class="market-link-group"><div class="eyebrow">Other verified marketplaces</div><div class="button-row">${secondaryMarketLinks().map(([name,url])=>`<a class="btn secondary" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} ↗</a>`).join('')}<button class="btn secondary" id="copyMarketQuery">Copy card search</button></div><div class="holding-meta">These are outbound links, not API-synced prices. Cardfolio does not scrape closed marketplaces or treat asking prices as sold comps.</div></div>`;
  ebayRow.insertAdjacentHTML('afterend',`${primaryHtml}${secondaryHtml}`);
  $('#copyMarketQuery')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(q);toast('Card search copied')}catch{toast(q)}});
};

/* Keep dense market links visually separated instead of bunched together. */
(()=>{if(document.getElementById('cardfolio-fix-styles'))return;const style=document.createElement('style');style.id='cardfolio-fix-styles';style.textContent='.market-link-group{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.market-link-group .button-row{flex-wrap:wrap}.market-link-group .btn{white-space:nowrap}@media(max-width:720px){.market-link-group .button-row{display:grid;grid-template-columns:1fr 1fr}.market-link-group .btn{width:100%;text-align:center;white-space:normal}}';document.head.appendChild(style)})();
