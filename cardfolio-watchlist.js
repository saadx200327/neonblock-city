/* Cardfolio watchlist — cloud/local targets with honest market links. */
const coreRender=render;
const coreBindViewEvents=bindViewEvents;

render=function(){
  if(state.view!=='watchlist') return coreRender();
  updateAuthButton();
  const c=$('#content');
  c.innerHTML=watchlistView();
  bindViewEvents();
};

bindViewEvents=function(){
  coreBindViewEvents();
  $('#watchlistAdd')?.addEventListener('click',()=>openWatchDialog());
  $('#watchSearch')?.addEventListener('input',e=>{state.watchFilter.q=e.target.value;render()});
  $('#watchCategory')?.addEventListener('change',e=>{state.watchFilter.category=e.target.value;render()});
  $$('.watch-edit[data-watch-id]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openWatchDialog(state.watchlist.find(w=>w.id===b.dataset.watchId))}));
  $$('.watch-to-holding[data-watch-id]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const w=state.watchlist.find(x=>x.id===b.dataset.watchId);if(w)openCardDialog(null,{category:w.category,subject:w.subject,year:w.year,manufacturer:w.manufacturer,brand:w.brand,set_name:w.set_name,card_number:w.card_number,condition:'Raw — unknown',quantity:1})}));
};

function watchlistView(){
  const categories=['All',...new Set(state.watchlist.map(w=>w.category).filter(Boolean))];
  const q=state.watchFilter.q.toLowerCase().trim();
  const list=state.watchlist.filter(w=>{
    const text=[w.subject,w.year,w.manufacturer,w.brand,w.set_name,w.card_number].filter(Boolean).join(' ').toLowerCase();
    return(!q||text.includes(q))&&(state.watchFilter.category==='All'||w.category===state.watchFilter.category);
  });
  return `<section class="panel"><div class="section-head"><div><h2>Watchlist</h2><div class="holding-meta">Chases, targets and cards you are considering — never counted in portfolio value.</div></div><button class="btn primary" id="watchlistAdd">Add target</button></div><div class="filters"><input id="watchSearch" class="search-input" placeholder="Search watchlist…" value="${escapeHtml(state.watchFilter.q)}"/><select id="watchCategory">${categories.map(x=>`<option ${x===state.watchFilter.category?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div>${watchlistCards(list)}</section>`;
}

function watchlistCards(list){
  if(!list.length)return `<div class="empty"><div class="empty-icon">☆</div><strong>No targets yet</strong><p>Save a card you want and optionally set the price you would be willing to pay.</p></div>`;
  return `<div class="holding-list">${list.map(w=>{
    const query=watchMarketQuery(w),active=`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`,sold=`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
    return `<article class="holding watch-row"><div class="thumb placeholder">☆</div><div><div class="holding-name">${escapeHtml(w.subject)}</div><div class="holding-meta">${escapeHtml([w.year,w.manufacturer,w.brand,w.set_name,w.card_number&&'#'+w.card_number].filter(Boolean).join(' · '))}</div><div class="grading-actions"><a class="source-tag" href="${active}" target="_blank" rel="noopener noreferrer">eBay active ↗</a><a class="source-tag" href="${sold}" target="_blank" rel="noopener noreferrer">eBay sold ↗</a></div></div><div class="value-col"><span class="metric-label">Target</span><strong>${hasNumericValue(w.target_price)?money(w.target_price):'Open'}</strong></div><div class="watch-actions"><button class="btn secondary watch-edit" data-watch-id="${escapeHtml(w.id)}">Edit</button><button class="btn primary watch-to-holding" data-watch-id="${escapeHtml(w.id)}">I own this</button></div></article>`;
  }).join('')}</div>`;
}

function watchMarketQuery(w){return [w.year,w.manufacturer,w.brand,w.subject,w.set_name,w.card_number&&`#${w.card_number}`].filter(Boolean).join(' ').slice(0,190)}

function ensureWatchDialog(){
  if($('#watchDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="watchDialog" class="modal wide"><form method="dialog" class="modal-card" id="watchForm"><div class="modal-head"><div><div class="eyebrow">Market target</div><h2 id="watchDialogTitle">Add to watchlist</h2></div><button class="icon-btn" value="cancel" aria-label="Close">×</button></div><input type="hidden" id="watchId"/><div class="form-grid"><label>Category<select id="watchCategoryInput"><option>Pokémon</option><option>Basketball</option><option>Soccer</option><option>Baseball</option><option>Football</option><option>Hockey</option><option>WNBA</option><option>UFC / MMA</option><option>Wrestling</option><option>Formula 1</option><option>NASCAR</option><option>College</option><option>Other</option></select></label><label>Player / character<input id="watchSubject" maxlength="120" required/></label><label>Year<input id="watchYear" maxlength="12" placeholder="2025-26"/></label><label>Manufacturer<input id="watchManufacturer" maxlength="80" placeholder="Topps, Panini, Pokémon…"/></label><label>Brand / product<input id="watchBrand" maxlength="100" placeholder="Chrome, Prizm, Select…"/></label><label>Set<input id="watchSet" maxlength="120"/></label><label>Card #<input id="watchCardNumber" maxlength="40"/></label><label>Target buy price ($)<input id="watchTargetPrice" type="number" min="0" step="0.01" placeholder="Optional"/></label></div><div class="button-row spread" style="margin-top:18px"><button type="button" id="deleteWatchBtn" class="btn danger hidden">Delete target</button><div class="button-row"><button value="cancel" class="btn secondary">Cancel</button><button type="button" id="saveWatchBtn" class="btn primary">Save target</button></div></div></form></dialog>`);
  $('#saveWatchBtn').addEventListener('click',saveWatchItem);
  $('#deleteWatchBtn').addEventListener('click',deleteWatchItem);
}

function openWatchDialog(item=null){
  ensureWatchDialog();
  $('#watchDialogTitle').textContent=item?'Edit target':'Add to watchlist';
  $('#watchId').value=item?.id||'';
  $('#watchCategoryInput').value=item?.category||'Pokémon';
  $('#watchSubject').value=item?.subject||'';
  $('#watchYear').value=item?.year||'';
  $('#watchManufacturer').value=item?.manufacturer||'';
  $('#watchBrand').value=item?.brand||'';
  $('#watchSet').value=item?.set_name||'';
  $('#watchCardNumber').value=item?.card_number||'';
  $('#watchTargetPrice').value=item?.target_price??'';
  $('#deleteWatchBtn').classList.toggle('hidden',!item);
  $('#watchDialog').showModal();
}

function readWatchForm(){
  const val=id=>$('#'+id).value.trim();
  return {id:val('watchId')||uuid(),category:val('watchCategoryInput'),subject:val('watchSubject'),year:val('watchYear'),manufacturer:val('watchManufacturer'),brand:val('watchBrand'),set_name:val('watchSet'),card_number:val('watchCardNumber'),target_price:val('watchTargetPrice')===''?'':Number(val('watchTargetPrice')),external_ids:{}};
}

async function saveWatchItem(){
  const item=readWatchForm();
  if(!item.subject){toast('Player or character name is required');return}
  const existing=state.watchlist.find(w=>w.id===item.id);
  if(state.backend==='cloud'&&state.user){
    const row={...item,target_price:item.target_price===''?null:item.target_price,user_id:state.user.id};
    const {error}=await state.supabase.from('watchlist_items').upsert(row);
    if(error){toast('Could not save watchlist target');return}
    await syncCloud();
  }else{
    if(existing)Object.assign(existing,item);else state.watchlist.unshift({...item,created_at:nowIso()});
    saveLocal();
  }
  $('#watchDialog').close();toast(existing?'Target updated':'Added to watchlist');setView('watchlist');
}

async function deleteWatchItem(){
  const id=$('#watchId').value;if(!id||!confirm('Delete this watchlist target?'))return;
  if(state.backend==='cloud'&&state.user){const {error}=await state.supabase.from('watchlist_items').delete().eq('id',id).eq('user_id',state.user.id);if(error){toast('Delete failed');return}await syncCloud();}
  else{state.watchlist=state.watchlist.filter(w=>w.id!==id);saveLocal();}
  $('#watchDialog').close();toast('Target deleted');render();
}

(()=>{const style=document.createElement('style');style.textContent='.watch-row{grid-template-columns:54px minmax(0,1fr) 130px 180px}.watch-actions{display:flex;gap:7px;justify-content:flex-end}.watch-actions .btn{padding:8px 10px}@media(max-width:1000px){.watch-row{grid-template-columns:54px minmax(0,1fr) 120px}.watch-row .watch-actions{grid-column:2 / -1}}@media(max-width:720px){.watch-row{grid-template-columns:48px minmax(0,1fr)}.watch-row>.value-col,.watch-row>.watch-actions{grid-column:2;text-align:left;justify-content:flex-start}}';document.head.appendChild(style)})();
