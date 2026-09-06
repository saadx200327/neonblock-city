/* Cardfolio watchlist — local-first, Supabase-synced when authenticated. */
state.watchlist=[];
const LOCAL_WATCHLIST='cardfolio.watchlist.v1';

const watchlistBaseReadLocalVault=readLocalVault;
readLocalVault=function(){
  const local=watchlistBaseReadLocalVault();
  try{local.watchlist=JSON.parse(localStorage.getItem(LOCAL_WATCHLIST)||'[]')}catch{local.watchlist=[]}
  return local;
};
const watchlistBaseLoadLocal=loadLocal;
loadLocal=function(){
  watchlistBaseLoadLocal();
  const local=readLocalVault();
  state.watchlist=Array.isArray(local.watchlist)?local.watchlist:[];
};
const watchlistBaseSaveLocal=saveLocal;
saveLocal=function(){
  watchlistBaseSaveLocal();
  localStorage.setItem(LOCAL_WATCHLIST,JSON.stringify(state.watchlist||[]));
};

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
    target_price:hasNumericValue(w.target_price)?Number(w.target_price):null
  };
}

const watchlistBaseSyncCloud=syncCloud;
syncCloud=async function(){
  await watchlistBaseSyncCloud();
  if(!state.supabase||!state.user) return;
  const {data,error}=await state.supabase.from('watchlist_items').select('*').order('created_at',{ascending:false});
  if(error){toast('Watchlist sync failed');return}
  state.watchlist=data||[];
};

let watchlistMigrationPromise=null;
const watchlistBaseMigrateLocalToCloud=migrateLocalToCloud;
migrateLocalToCloud=async function(){
  await watchlistBaseMigrateLocalToCloud();
  if(!state.supabase||!state.user) return;
  if(watchlistMigrationPromise) return watchlistMigrationPromise;
  watchlistMigrationPromise=(async()=>{
    const local=readLocalVault();
    const items=Array.isArray(local.watchlist)?local.watchlist.filter(w=>w&&w.id&&w.subject):[];
    if(!items.length)return;
    const {data,error}=await state.supabase.from('watchlist_items').select('id');
    if(error)throw error;
    const existing=new Set((data||[]).map(x=>x.id));
    for(const item of items){
      if(existing.has(item.id))continue;
      const {error:insertError}=await state.supabase.from('watchlist_items').insert(toWatchDb(item));
      if(!insertError)existing.add(item.id);
    }
  })().catch(err=>{console.warn('Watchlist migration failed',err);toast('Device watchlist is safe; cloud backup will retry.');}).finally(()=>{watchlistMigrationPromise=null});
  return watchlistMigrationPromise;
};

function watchlistRows(){
  if(!state.watchlist?.length)return '<div class="empty"><div class="empty-icon">☆</div><strong>No chase cards yet</strong><p>Add a card you want to track without pretending you already own it.</p></div>';
  return `<div class="holding-list">${state.watchlist.map(w=>`<article class="holding watch-row"><div class="thumb placeholder">☆</div><div><div class="holding-name">${escapeHtml(w.subject)}</div><div class="holding-meta">${escapeHtml([w.category,w.year,w.manufacturer,w.brand,w.set_name,w.card_number&&'#'+w.card_number].filter(Boolean).join(' · '))}</div></div><div class="value-col"><strong>${hasNumericValue(w.target_price)?money(w.target_price):'No target'}</strong><div class="source-tag">Target price</div></div><div class="watch-actions"><button class="btn secondary" data-watch-search="${escapeHtml(w.id)}">Market</button><button class="btn secondary" data-watch-remove="${escapeHtml(w.id)}" aria-label="Remove ${escapeHtml(w.subject)} from watchlist">×</button></div></article>`).join('')}</div>`;
}

const watchlistBaseMarketView=marketView;
marketView=function(){
  const categories=['Pokémon','Basketball','Soccer','Baseball','Football','Hockey','WNBA','UFC / MMA','Wrestling','Formula 1','NASCAR','College','Other'];
  return `${watchlistBaseMarketView()}<section class="panel" style="margin-top:16px"><div class="section-head"><div><h2>Watchlist</h2><div class="holding-meta">Chase cards are separate from owned holdings.</div></div><span class="source-tag">${state.watchlist?.length||0} tracked</span></div><div class="watch-form"><label>Card / player<input id="watchSubject" maxlength="120" placeholder="e.g. Lamine Yamal rookie"/></label><label>Category<select id="watchCategory">${categories.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></label><label>Target price ($)<input id="watchTarget" type="number" min="0" step="0.01" placeholder="Optional"/></label><button class="btn primary" id="watchAdd">Add to watchlist</button></div>${watchlistRows()}</section>`;
};

async function addWatchlistFromForm(){
  const subject=$('#watchSubject')?.value.trim();
  if(!subject){toast('Enter a card or player');return}
  const target=$('#watchTarget')?.value.trim()||'';
  const item={id:uuid(),category:$('#watchCategory')?.value||'Other',subject,target_price:target===''?null:Number(target),created_at:nowIso()};
  if(state.backend==='cloud'&&state.user){
    const {error}=await state.supabase.from('watchlist_items').insert(toWatchDb(item));
    if(error){toast('Could not save watchlist item');return}
    await syncCloud();
  }else{
    state.watchlist.unshift(item);saveLocal();
  }
  toast('Added to watchlist');render();
}
async function removeWatchlistItem(id){
  if(state.backend==='cloud'&&state.user){
    const {error}=await state.supabase.from('watchlist_items').delete().eq('id',id).eq('user_id',state.user.id);
    if(error){toast('Could not remove watchlist item');return}
    await syncCloud();
  }else{state.watchlist=state.watchlist.filter(w=>w.id!==id);saveLocal()}
  render();
}
async function searchWatchlistItem(id){
  const w=state.watchlist.find(x=>x.id===id);if(!w)return;
  await renderMarketFor({...w,quantity:1,manual_value:null,market_value:null});
  $('#marketResults')?.scrollIntoView({behavior:'smooth',block:'start'});
}

const watchlistBaseBindViewEvents=bindViewEvents;
bindViewEvents=function(){
  watchlistBaseBindViewEvents();
  $('#watchAdd')?.addEventListener('click',addWatchlistFromForm);
  $$('[data-watch-remove]').forEach(b=>b.addEventListener('click',()=>removeWatchlistItem(b.dataset.watchRemove)));
  $$('[data-watch-search]').forEach(b=>b.addEventListener('click',()=>searchWatchlistItem(b.dataset.watchSearch)));
};

(()=>{const style=document.createElement('style');style.textContent='.watch-form{display:grid;grid-template-columns:minmax(220px,2fr) minmax(140px,1fr) minmax(130px,.8fr) auto;gap:10px;align-items:end;margin-bottom:18px}.watch-actions{display:flex;gap:7px;justify-content:flex-end}.watch-actions .btn{padding:8px 10px}@media(max-width:820px){.watch-form{grid-template-columns:1fr 1fr}.watch-form .btn{align-self:end}}@media(max-width:520px){.watch-form{grid-template-columns:1fr}.watch-row{grid-template-columns:48px 1fr}.watch-row>.value-col,.watch-row>.watch-actions{grid-column:2;text-align:left;justify-content:flex-start}}';document.head.appendChild(style)})();
