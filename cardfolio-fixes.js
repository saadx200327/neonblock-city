/* Cardfolio QA hotfixes. Loaded last so corrected functions replace earlier declarations. */
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

/* Keep local scans safe across first cloud sign-in and remove cloud data from memory on sign-out. */
let cardfolioMigrationPromise = null;
function readLocalVault(){
  try{
    return {
      holdings: JSON.parse(localStorage.getItem(LOCAL_HOLDINGS) || '[]'),
      snapshots: JSON.parse(localStorage.getItem(LOCAL_SNAPSHOTS) || '[]')
    };
  }catch{
    return {holdings:[],snapshots:[]};
  }
}
function loadLocal(){
  const local=readLocalVault();
  state.holdings=Array.isArray(local.holdings)?local.holdings:[];
  state.snapshots=Array.isArray(local.snapshots)?local.snapshots:[];
}
function toDb(h){
  const allowed=['id','category','subject','year','manufacturer','brand','set_name','card_number','parallel','serial_number','team','league','condition','quantity','cost_basis','acquisition_source','acquisition_date','manual_value','grading_company','grade','cert_number','rookie','autograph','relic','notes','image_path','tcgdex_card_id','market_value','valuation_source','valuation_observed_at'];
  const out={};
  for(const k of allowed) out[k]=h[k]??null;
  for(const k of ['cost_basis','manual_value','market_value']) if(out[k]==='') out[k]=null;
  for(const k of ['acquisition_date','valuation_observed_at']) if(out[k]==='') out[k]=null;
  out.user_id=state.user.id;
  out.updated_at=nowIso();
  return out;
}
async function migrateLocalToCloud(){
  if(!state.supabase||!state.user) return;
  if(cardfolioMigrationPromise) return cardfolioMigrationPromise;
  cardfolioMigrationPromise=(async()=>{
    const local=readLocalVault();
    const localHoldings=Array.isArray(local.holdings)?local.holdings.filter(h=>h&&h.id&&h.subject):[];
    const localSnapshots=Array.isArray(local.snapshots)?local.snapshots.filter(s=>s&&s.id&&s.holding_id):[];
    if(!localHoldings.length&&!localSnapshots.length) return;

    const [{data:remoteH,error:holdingsReadError},{data:remoteS,error:snapshotsReadError}]=await Promise.all([
      state.supabase.from('card_holdings').select('id'),
      state.supabase.from('price_snapshots').select('id')
    ]);
    if(holdingsReadError||snapshotsReadError) throw new Error('Could not inspect cloud vault before migration');

    const cloudHoldingIds=new Set((remoteH||[]).map(x=>x.id));
    const cloudSnapshotIds=new Set((remoteS||[]).map(x=>x.id));
    let migratedHoldings=0,migratedSnapshots=0;

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

    if(migratedHoldings||migratedSnapshots) toast(`Cloud backup added · ${migratedHoldings} cards${migratedSnapshots?` · ${migratedSnapshots} prices`:''}`);
  })().catch(err=>{console.warn('Cardfolio local migration failed',err);toast('Local cards are still safe on this device; cloud migration will retry.');}).finally(()=>{cardfolioMigrationPromise=null;});
  return cardfolioMigrationPromise;
}
async function initBackend(){
  try{
    const r=await fetch('/api/config',{cache:'no-store'});if(!r.ok) throw new Error('no config');
    const cfg=await r.json();state.config=cfg;if(!cfg.configured) throw new Error('not configured');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
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
    state.backend='local';state.user=null;loadLocal();$('#backendBadge').textContent='Local Vault';$('#backendBadge').className='status-pill neutral';
  }
  updateAuthButton();
}
