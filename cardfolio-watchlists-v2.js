/* Cardfolio watchlists v2 — portfolio-only, multi-list watchlists with iOS-safe controls. */
(function(){
'use strict';

const LISTS_LOCAL_KEY='cardfolio.watchlists.v2';
const ACCENTS=['blue','violet','green','amber','rose','slate'];
const ICONS=['☆','★','✦','◆','◉','⚡','🏀','⚽','⚾','🏈','🏒','🃏'];
let selectedListId=null;

const priorRender=typeof render==='function'?render:null;
const priorBind=typeof bindViewEvents==='function'?bindViewEvents:null;
const priorSync=typeof syncCloud==='function'?syncCloud:null;
const priorLoadLocal=typeof loadLocal==='function'?loadLocal:null;
const priorSaveLocal=typeof saveLocal==='function'?saveLocal:null;

function esc(v=''){return typeof escapeHtml==='function'?escapeHtml(String(v)):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attr(v=''){return esc(v).replace(/`/g,'&#96;')}
function numeric(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function cash(v){return numeric(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)):'$0.00'}
function safeText(v=''){return String(v||'').trim().replace(/\s+/g,' ')}
function holdingName(h){return safeText(h?.display_name)||[h?.subject,h?.year,h?.brand||h?.manufacturer,h?.card_number?`#${h.card_number}`:'',h?.parallel].filter(Boolean).join(' · ')||'Card'}
function holdingPrice(h){for(const v of [h?._canonical?.current_price,h?.market_value,h?.manual_value])if(numeric(v))return Number(v);return null}
function membershipListId(item){return item?.watchlist_id||item?.external_ids?.watchlist_id||''}
function membershipHoldingId(item){return item?.holding_id||item?.external_ids?.holding_id||''}
function listById(id){return (state.watchlists||[]).find(x=>x.id===id)||null}
function activeList(){
  const lists=state.watchlists||[];
  if(selectedListId&&lists.some(x=>x.id===selectedListId))return listById(selectedListId);
  selectedListId=lists[0]?.id||null;
  return lists[0]||null;
}
function listItems(listId){return (state.watchlist||[]).filter(x=>membershipListId(x)===listId&&state.holdings.some(h=>h.id===membershipHoldingId(x)))}
function accentClass(a){return ACCENTS.includes(a)?`watch-accent-${a}`:'watch-accent-blue'}

function ensureState(){
  if(!Array.isArray(state.watchlists))state.watchlists=[];
  try{
    const local=JSON.parse(localStorage.getItem(LISTS_LOCAL_KEY)||'[]');
    if(!state.user&&Array.isArray(local))state.watchlists=local;
  }catch{}
}
ensureState();

async function syncListsCloud(){
  if(!state.supabase||!state.user)return;
  const {data,error}=await state.supabase.from('watchlists').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:true});
  if(error){console.warn('Watchlists sync failed',error);return}
  state.watchlists=data||[];
  if(selectedListId&&!state.watchlists.some(x=>x.id===selectedListId))selectedListId=null;
}

syncCloud=async function(){
  if(priorSync)await priorSync();
  await syncListsCloud();
};

loadLocal=function(){
  priorLoadLocal?.();
  ensureState();
};
saveLocal=function(){
  priorSaveLocal?.();
  try{localStorage.setItem(LISTS_LOCAL_KEY,JSON.stringify(state.watchlists||[]))}catch{}
};

function installStyles(){
  if(document.getElementById('cardfolio-watchlists-v2-css'))return;
  const style=document.createElement('style');style.id='cardfolio-watchlists-v2-css';style.textContent=`
  .liquid-hero .glass-action,.album-card .price-state{display:none!important}
  .watch-v2{display:flex;flex-direction:column;gap:18px}.watch-v2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.watch-v2-head h2{margin:2px 0 4px;font-size:30px;letter-spacing:-.035em}.watch-v2-head p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}.watch-v2-new{white-space:nowrap}
  .watch-list-strip{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}.watch-list-strip::-webkit-scrollbar{display:none}.watch-list-chip{scroll-snap-align:start;min-width:150px;max-width:220px;border:1px solid rgba(72,101,132,.11);background:rgba(255,255,255,.64);border-radius:22px;padding:13px 14px;text-align:left;box-shadow:inset 0 1px 0 rgba(255,255,255,.92);color:var(--text);touch-action:manipulation}.watch-list-chip.active{background:rgba(255,255,255,.92);box-shadow:0 12px 28px rgba(28,53,81,.09),inset 0 1px 0 #fff}.watch-list-chip span{display:block;font-size:21px;margin-bottom:7px}.watch-list-chip strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.watch-list-chip small{display:block;color:var(--muted);font-size:10px;margin-top:3px}
  .watch-accent-blue{--watch-accent:#1683ff}.watch-accent-violet{--watch-accent:#7c5cff}.watch-accent-green{--watch-accent:#16a36a}.watch-accent-amber{--watch-accent:#c88400}.watch-accent-rose{--watch-accent:#d94873}.watch-accent-slate{--watch-accent:#617286}.watch-list-chip.active:after{content:'';display:block;width:34px;height:3px;border-radius:99px;background:var(--watch-accent);margin-top:10px}
  .watch-board{border:1px solid rgba(70,100,130,.10);border-radius:30px;background:rgba(255,255,255,.53);padding:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.93),0 18px 48px rgba(32,55,78,.06)}.watch-board-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.watch-board-title{display:flex;gap:12px;align-items:flex-start}.watch-board-icon{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;background:color-mix(in srgb,var(--watch-accent) 12%,white);font-size:21px}.watch-board-title h3{margin:1px 0 3px;font-size:21px}.watch-board-title p{margin:0;color:var(--muted);font-size:11px;line-height:1.4}.watch-board-actions{display:flex;gap:8px}.watch-icon-action{width:42px;height:42px;border-radius:14px;border:1px solid rgba(70,100,130,.10);background:rgba(255,255,255,.78);font-size:17px;color:var(--text);touch-action:manipulation}.watch-add-cards{min-height:42px;border-radius:14px;border:0;background:var(--watch-accent);color:white;padding:0 14px;font-weight:800;font-size:11px;letter-spacing:.03em;touch-action:manipulation}
  .watch-search-wrap{position:relative;margin:16px 0 12px}.watch-search-wrap:before{content:'⌕';position:absolute;left:14px;top:50%;transform:translateY(-53%);color:var(--muted);font-size:19px}.watch-v2-search{width:100%;box-sizing:border-box;min-height:48px;border-radius:16px;border:1px solid rgba(68,96,126,.12);background:rgba(255,255,255,.75);padding:0 14px 0 40px;color:var(--text);font-size:16px;outline:none}.watch-v2-search:focus{border-color:color-mix(in srgb,var(--watch-accent) 55%,white);box-shadow:0 0 0 4px color-mix(in srgb,var(--watch-accent) 10%,transparent)}
  .watch-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.watch-card{display:grid;grid-template-columns:76px minmax(0,1fr) 36px;gap:12px;align-items:center;padding:10px;border-radius:21px;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.9);min-width:0;cursor:pointer}.watch-card[hidden]{display:none}.watch-card img,.watch-card-placeholder{width:76px;height:96px;border-radius:15px;object-fit:cover;background:rgba(120,140,160,.08)}.watch-card-placeholder{display:grid;place-items:center;color:var(--muted);font-size:22px}.watch-card-copy{min-width:0}.watch-card-copy strong{display:block;font-size:13px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.watch-card-copy span{display:block;margin-top:5px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.watch-card-copy b{display:block;margin-top:9px;font-size:16px}.watch-remove{width:34px;height:34px;border:0;border-radius:12px;background:rgba(22,32,44,.06);color:var(--muted);font-size:19px;touch-action:manipulation}.watch-remove:active{transform:scale(.96)}
  .watch-empty{padding:30px 18px;text-align:center;border:1px dashed rgba(70,100,130,.14);border-radius:24px;background:rgba(255,255,255,.35)}.watch-empty span{display:block;font-size:30px;margin-bottom:8px}.watch-empty strong{display:block;font-size:16px}.watch-empty p{max-width:360px;margin:7px auto 15px;color:var(--muted);font-size:11px;line-height:1.5}
  dialog.watch-v2-modal{width:min(620px,calc(100vw - 24px));max-height:min(82dvh,760px);padding:0;border:0;border-radius:30px;background:transparent;overflow:visible}dialog.watch-v2-modal::backdrop{background:rgba(19,30,44,.24);backdrop-filter:blur(12px)}.watch-v2-sheet{max-height:min(82dvh,760px);overflow:auto;border:1px solid rgba(255,255,255,.9);border-radius:30px;background:rgba(247,249,252,.95);box-shadow:0 28px 80px rgba(15,32,52,.22);padding:20px;-webkit-overflow-scrolling:touch}.watch-v2-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.watch-v2-modal-head .eyebrow{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);font-weight:850}.watch-v2-modal-head h3{margin:5px 0 0;font-size:24px}.watch-v2-close{width:46px;height:46px;flex:0 0 46px;border-radius:15px;border:1px solid rgba(70,100,130,.10);background:rgba(255,255,255,.82);font-size:27px;line-height:1;color:var(--text);touch-action:manipulation}.watch-v2-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.watch-v2-fields label{display:flex;flex-direction:column;gap:7px;font-size:11px;font-weight:750;color:var(--muted)}.watch-v2-fields label.full{grid-column:1/-1}.watch-v2-fields input,.watch-v2-fields textarea,.watch-v2-fields select{box-sizing:border-box;width:100%;min-height:48px;border:1px solid rgba(70,100,130,.12);border-radius:15px;background:white;padding:11px 13px;color:var(--text);font-size:16px;outline:none}.watch-v2-fields textarea{min-height:84px;resize:none}.watch-v2-fields input:focus,.watch-v2-fields textarea:focus,.watch-v2-fields select:focus{border-color:#78b5ff;box-shadow:0 0 0 4px rgba(22,131,255,.09)}.watch-v2-footer{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.watch-v2-footer-right{display:flex;gap:9px;margin-left:auto}.watch-v2-btn{min-height:46px;border-radius:15px;border:1px solid rgba(70,100,130,.10);padding:0 15px;font-weight:800;font-size:12px;touch-action:manipulation}.watch-v2-btn.primary{border:0;background:#111827;color:white}.watch-v2-btn.danger{background:rgba(216,72,90,.08);color:#b82d43}.watch-v2-btn.secondary{background:rgba(255,255,255,.82);color:var(--text)}
  .watch-picker-tools{margin-bottom:12px}.watch-picker-list{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-height:46dvh;overflow:auto;padding:2px}.watch-picker-card{display:grid;grid-template-columns:54px minmax(0,1fr) 28px;gap:10px;align-items:center;padding:9px;border-radius:17px;border:1px solid rgba(70,100,130,.09);background:white;cursor:pointer}.watch-picker-card[hidden]{display:none}.watch-picker-card img,.watch-picker-placeholder{width:54px;height:68px;border-radius:11px;object-fit:cover;background:#eef2f6}.watch-picker-placeholder{display:grid;place-items:center;color:var(--muted)}.watch-picker-copy{min-width:0}.watch-picker-copy strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.watch-picker-copy span{display:block;font-size:9px;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.watch-picker-card input{width:20px;height:20px;accent-color:#1683ff}.watch-picker-empty{grid-column:1/-1;padding:24px;text-align:center;color:var(--muted);font-size:12px}
  @media(max-width:720px){.watch-card-grid,.watch-picker-list{grid-template-columns:1fr}.watch-board{padding:15px}.watch-v2-head{align-items:center}.watch-v2-head h2{font-size:27px}.watch-v2-fields{grid-template-columns:1fr}.watch-v2-fields label.full{grid-column:auto}.watch-board-actions{gap:6px}.watch-add-cards{padding:0 11px}.watch-card{grid-template-columns:68px minmax(0,1fr) 34px}.watch-card img,.watch-card-placeholder{width:68px;height:86px}dialog.watch-v2-modal{max-height:88dvh}.watch-v2-sheet{max-height:88dvh;padding:16px}}
  `;document.head.appendChild(style);
}

function pruneHomeChrome(){
  document.querySelectorAll('.liquid-hero .glass-action,.album-card .price-state').forEach(el=>el.remove());
}

function watchlistViewV2(){
  const lists=state.watchlists||[],list=activeList();
  const intro=`<div class="watch-v2-head"><div><div class="eyebrow">Collection watch</div><h2>Watchlists</h2><p>Build custom lists only from cards already in your portfolio.</p></div><button type="button" class="btn primary watch-v2-new" id="watchNewList">New list</button></div>`;
  if(!lists.length)return `<section class="watch-v2">${intro}<div class="watch-empty"><span>☆</span><strong>Create your first watchlist</strong><p>Make Favorites, trade targets, grading candidates, or any custom list. Only cards you already own can be added.</p><button type="button" class="btn primary" id="watchEmptyCreate">Create watchlist</button></div></section>`;
  const strip=`<div class="watch-list-strip">${lists.map(l=>{const count=listItems(l.id).length;return `<button type="button" class="watch-list-chip ${accentClass(l.accent)} ${l.id===list?.id?'active':''}" data-watch-list="${attr(l.id)}"><span>${esc(l.icon||'☆')}</span><strong>${esc(l.name)}</strong><small>${count} card${count===1?'':'s'}</small></button>`}).join('')}</div>`;
  const items=listItems(list.id);
  const cards=items.map(item=>{const h=state.holdings.find(x=>x.id===membershipHoldingId(item));if(!h)return '';const p=holdingPrice(h);const searchable=[holdingName(h),h.category,h.team,h.year,h.manufacturer,h.brand,h.set_name,h.card_number,h.parallel].filter(Boolean).join(' ').toLowerCase();return `<article class="watch-card" data-detail-card="${attr(h.id)}" data-watch-search="${attr(searchable)}"><div>${h.image_url?`<img src="${attr(h.image_url)}" alt="" loading="lazy">`:'<div class="watch-card-placeholder">◇</div>'}</div><div class="watch-card-copy"><strong>${esc(holdingName(h))}</strong><span>${esc([h.team,h.year,h.parallel,h.card_number&&`#${h.card_number}`].filter(Boolean).join(' · ')||h.category||'Card')}</span><b>${p===null?'$0.00':cash(p)}</b></div><button type="button" class="watch-remove" data-watch-remove="${attr(item.id)}" aria-label="Remove from watchlist">×</button></article>`}).join('');
  return `<section class="watch-v2 ${accentClass(list.accent)}">${intro}${strip}<div class="watch-board"><div class="watch-board-head"><div class="watch-board-title"><div class="watch-board-icon">${esc(list.icon||'☆')}</div><div><h3>${esc(list.name)}</h3><p>${esc(list.description||'Custom portfolio watchlist')}</p></div></div><div class="watch-board-actions"><button type="button" class="watch-icon-action" id="watchEditList" aria-label="Edit watchlist">•••</button><button type="button" class="watch-add-cards" id="watchAddCards">Add cards</button></div></div><div class="watch-search-wrap"><input id="watchV2Search" class="watch-v2-search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="Search this watchlist…"></div>${items.length?`<div class="watch-card-grid" id="watchCardGrid">${cards}</div><div class="watch-empty" id="watchNoSearchResults" hidden><strong>No matching cards</strong><p>Try a different search.</p></div>`:`<div class="watch-empty"><span>${esc(list.icon||'☆')}</span><strong>This list is empty</strong><p>Add cards from your portfolio. Nothing outside your collection can be added here.</p><button type="button" class="btn primary" id="watchEmptyAdd">Add portfolio cards</button></div>`}</div></section>`;
}

render=function(){
  if(state.view!=='watchlist'){
    const out=priorRender?.();
    queueMicrotask(pruneHomeChrome);
    return out;
  }
  try{updateAuthButton?.()}catch{}
  const c=document.getElementById('content');if(!c)return;
  c.innerHTML=watchlistViewV2();
  bindViewEvents();
  pruneHomeChrome();
};

function filterWatchCards(value){
  const q=safeText(value).toLowerCase();let visible=0;
  document.querySelectorAll('#watchCardGrid .watch-card').forEach(card=>{const show=!q||(card.dataset.watchSearch||'').includes(q);card.hidden=!show;if(show)visible++});
  const empty=document.getElementById('watchNoSearchResults');if(empty)empty.hidden=visible>0||!q;
}
function filterPicker(value){
  const q=safeText(value).toLowerCase();let visible=0;
  document.querySelectorAll('#watchPickerList .watch-picker-card').forEach(card=>{const show=!q||(card.dataset.search||'').includes(q);card.hidden=!show;if(show)visible++});
  const empty=document.getElementById('watchPickerNoResults');if(empty)empty.hidden=visible>0;
}

function ensureListDialog(){
  let d=document.getElementById('watchListDialogV2');if(d)return d;
  d=document.createElement('dialog');d.id='watchListDialogV2';d.className='watch-v2-modal';d.innerHTML=`<div class="watch-v2-sheet"><div class="watch-v2-modal-head"><div><div class="eyebrow">Custom watchlist</div><h3 id="watchListDialogTitle">New watchlist</h3></div><button type="button" class="watch-v2-close" data-watch-close aria-label="Close">×</button></div><input type="hidden" id="watchListId"><div class="watch-v2-fields"><label>Name<input id="watchListName" maxlength="60" autocomplete="off" placeholder="Favorites"></label><label>Icon<select id="watchListIcon">${ICONS.map(x=>`<option value="${attr(x)}">${esc(x)}</option>`).join('')}</select></label><label class="full">Description<textarea id="watchListDescription" maxlength="240" placeholder="What belongs in this list?"></textarea></label><label>Accent<select id="watchListAccent">${ACCENTS.map(x=>`<option value="${x}">${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label></div><div class="watch-v2-footer"><button type="button" class="watch-v2-btn danger" id="watchDeleteList" hidden>Delete list</button><div class="watch-v2-footer-right"><button type="button" class="watch-v2-btn secondary" data-watch-close>Cancel</button><button type="button" class="watch-v2-btn primary" id="watchSaveList">Save</button></div></div></div>`;
  document.body.appendChild(d);wireDialogClose(d);document.getElementById('watchSaveList').addEventListener('click',saveList);document.getElementById('watchDeleteList').addEventListener('click',deleteList);return d;
}
function wireDialogClose(d){
  d.querySelectorAll('[data-watch-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(d)));
  d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d)});
  d.addEventListener('pointerdown',e=>{if(e.target===d)closeDialog(d)});
}
function closeDialog(d){try{document.activeElement?.blur()}catch{};try{d.close()}catch{}}
function openListDialog(list=null){
  const d=ensureListDialog();document.getElementById('watchListDialogTitle').textContent=list?'Edit watchlist':'New watchlist';document.getElementById('watchListId').value=list?.id||'';document.getElementById('watchListName').value=list?.name||'';document.getElementById('watchListDescription').value=list?.description||'';document.getElementById('watchListIcon').value=ICONS.includes(list?.icon)?list.icon:'☆';document.getElementById('watchListAccent').value=ACCENTS.includes(list?.accent)?list.accent:'blue';document.getElementById('watchDeleteList').hidden=!list;d.showModal();setTimeout(()=>document.getElementById('watchListName')?.focus({preventScroll:true}),80);
}

async function saveList(){
  const id=safeText(document.getElementById('watchListId').value),name=safeText(document.getElementById('watchListName').value),description=safeText(document.getElementById('watchListDescription').value),icon=document.getElementById('watchListIcon').value||'☆',accent=document.getElementById('watchListAccent').value||'blue';
  if(!name){toast('Give this watchlist a name');document.getElementById('watchListName').focus();return}
  const existing=listById(id);let saved;
  if(state.backend==='cloud'&&state.user&&state.supabase){
    if(existing){const {data,error}=await state.supabase.from('watchlists').update({name,description,icon,accent,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',state.user.id).select('*').single();if(error){toast('Could not update watchlist');return}saved=data}
    else{const {data,error}=await state.supabase.from('watchlists').insert({user_id:state.user.id,name,description,icon,accent}).select('*').single();if(error){toast('Could not create watchlist');return}saved=data}
    await syncListsCloud();
  }else{
    saved=existing?Object.assign(existing,{name,description,icon,accent,updated_at:new Date().toISOString()}):{id:uuid(),name,description,icon,accent,sort_order:(state.watchlists||[]).length,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    if(!existing)state.watchlists.push(saved);saveLocal();
  }
  selectedListId=saved?.id||id||selectedListId;closeDialog(document.getElementById('watchListDialogV2'));render();toast(existing?'Watchlist updated':'Watchlist created');
}
async function deleteList(){
  const id=safeText(document.getElementById('watchListId').value),list=listById(id);if(!list)return;if(!confirm(`Delete “${list.name}”?`))return;
  if(state.backend==='cloud'&&state.user&&state.supabase){const {error}=await state.supabase.from('watchlists').delete().eq('id',id).eq('user_id',state.user.id);if(error){toast('Could not delete watchlist');return}state.watchlist=(state.watchlist||[]).filter(x=>membershipListId(x)!==id);await syncListsCloud();}
  else{state.watchlists=(state.watchlists||[]).filter(x=>x.id!==id);state.watchlist=(state.watchlist||[]).filter(x=>membershipListId(x)!==id);saveLocal()}
  selectedListId=null;closeDialog(document.getElementById('watchListDialogV2'));render();toast('Watchlist deleted');
}

function ensurePickerDialog(){
  let d=document.getElementById('watchPickerDialogV2');if(d)return d;
  d=document.createElement('dialog');d.id='watchPickerDialogV2';d.className='watch-v2-modal';d.innerHTML=`<div class="watch-v2-sheet"><div class="watch-v2-modal-head"><div><div class="eyebrow">Your portfolio</div><h3>Add cards</h3></div><button type="button" class="watch-v2-close" data-watch-close aria-label="Close">×</button></div><div class="watch-picker-tools watch-search-wrap"><input id="watchPickerSearch" class="watch-v2-search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="Search your cards…"></div><div class="watch-picker-list" id="watchPickerList"></div><div class="watch-v2-footer"><div class="watch-v2-footer-right"><button type="button" class="watch-v2-btn secondary" data-watch-close>Cancel</button><button type="button" class="watch-v2-btn primary" id="watchPickerSave">Add selected</button></div></div></div>`;
  document.body.appendChild(d);wireDialogClose(d);document.getElementById('watchPickerSearch').addEventListener('input',e=>filterPicker(e.target.value));document.getElementById('watchPickerSave').addEventListener('click',addSelectedCards);return d;
}
function openPicker(){
  const list=activeList();if(!list){openListDialog();return}
  const d=ensurePickerDialog(),existing=new Set(listItems(list.id).map(membershipHoldingId));const available=(state.holdings||[]).filter(h=>!existing.has(h.id));
  const host=document.getElementById('watchPickerList');host.innerHTML=available.length?available.map(h=>{const search=[holdingName(h),h.category,h.team,h.year,h.manufacturer,h.brand,h.set_name,h.card_number,h.parallel].filter(Boolean).join(' ').toLowerCase();return `<label class="watch-picker-card" data-search="${attr(search)}"><div>${h.image_url?`<img src="${attr(h.image_url)}" alt="" loading="lazy">`:'<div class="watch-picker-placeholder">◇</div>'}</div><div class="watch-picker-copy"><strong>${esc(holdingName(h))}</strong><span>${esc([h.team,h.year,h.parallel].filter(Boolean).join(' · ')||h.category||'Card')}</span></div><input type="checkbox" value="${attr(h.id)}" aria-label="Add ${attr(holdingName(h))}"></label>`}).join(''):'<div class="watch-picker-empty">Every portfolio card is already in this list.</div>';
  host.insertAdjacentHTML('beforeend','<div class="watch-picker-empty" id="watchPickerNoResults" hidden>No cards match that search.</div>');document.getElementById('watchPickerSearch').value='';d.showModal();setTimeout(()=>document.getElementById('watchPickerSearch')?.focus({preventScroll:true}),80);
}
async function addSelectedCards(){
  const list=activeList();if(!list)return;const ids=[...document.querySelectorAll('#watchPickerList input[type=checkbox]:checked')].map(x=>x.value);if(!ids.length){toast('Select at least one card');return}
  const holdings=ids.map(id=>state.holdings.find(h=>h.id===id)).filter(Boolean);if(!holdings.length)return;
  if(state.backend==='cloud'&&state.user&&state.supabase){
    const rows=holdings.map(h=>({user_id:state.user.id,watchlist_id:list.id,holding_id:h.id,category:h.category||'Other',subject:h.subject||holdingName(h),year:h.year||null,manufacturer:h.manufacturer||null,brand:h.brand||null,set_name:h.set_name||null,card_number:h.card_number||null,target_price:null,external_ids:{canonical_card_id:h.canonical_card_id||null}}));
    const {error}=await state.supabase.from('watchlist_items').insert(rows);if(error){toast(error.code==='23505'?'One of those cards is already in this watchlist':'Could not add cards');return}await syncCloud();
  }else{
    const t=new Date().toISOString();for(const h of holdings)state.watchlist.unshift({id:uuid(),watchlist_id:list.id,holding_id:h.id,category:h.category||'Other',subject:h.subject||holdingName(h),year:h.year||'',manufacturer:h.manufacturer||'',brand:h.brand||'',set_name:h.set_name||'',card_number:h.card_number||'',target_price:'',external_ids:{canonical_card_id:h.canonical_card_id||null},created_at:t});saveLocal();
  }
  closeDialog(document.getElementById('watchPickerDialogV2'));render();toast(`${holdings.length} card${holdings.length===1?'':'s'} added`);
}
async function removeMembership(id){
  const item=(state.watchlist||[]).find(x=>x.id===id);if(!item)return;
  if(state.backend==='cloud'&&state.user&&state.supabase){const {error}=await state.supabase.from('watchlist_items').delete().eq('id',id).eq('user_id',state.user.id);if(error){toast('Could not remove card');return}}
  state.watchlist=(state.watchlist||[]).filter(x=>x.id!==id);if(state.backend!=='cloud')saveLocal();render();toast('Removed from watchlist');
}

function bindWatchV2(){
  document.getElementById('watchNewList')?.addEventListener('click',()=>openListDialog());document.getElementById('watchEmptyCreate')?.addEventListener('click',()=>openListDialog());document.querySelectorAll('[data-watch-list]').forEach(b=>b.addEventListener('click',()=>{selectedListId=b.dataset.watchList;render()}));document.getElementById('watchEditList')?.addEventListener('click',()=>openListDialog(activeList()));document.getElementById('watchAddCards')?.addEventListener('click',openPicker);document.getElementById('watchEmptyAdd')?.addEventListener('click',openPicker);document.getElementById('watchV2Search')?.addEventListener('input',e=>filterWatchCards(e.target.value));document.querySelectorAll('[data-watch-remove]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void removeMembership(b.dataset.watchRemove)}));
}
bindViewEvents=function(){priorBind?.();if(state.view==='watchlist')bindWatchV2();queueMicrotask(pruneHomeChrome)};

installStyles();
const observer=new MutationObserver(()=>pruneHomeChrome());observer.observe(document.documentElement,{childList:true,subtree:true});pruneHomeChrome();
if(state.user&&state.supabase)void syncListsCloud().then(()=>{if(state.view==='watchlist')render()});
})();
