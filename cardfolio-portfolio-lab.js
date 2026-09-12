/* Cardfolio Portfolio Lab — original portfolio tooling inspired by useful collector workflows,
   not by another app's layout. Adds movers, trade math, bulk export, and richer profile stats. */
(function(){
'use strict';
if(window.cardfolioPortfolioLabVersion)return;
window.cardfolioPortfolioLabVersion='20260911-lab-1';

const esc=(v='')=>typeof escapeHtml==='function'?escapeHtml(String(v)):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moneyText=v=>{try{return typeof money==='function'?money(Number(v||0)):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}catch{return `$${Number(v||0).toFixed(2)}`;}};
function canonical(h){return h?._canonical||(state?.canonicalCards?.[h?.canonical_card_id]||null)||(state?.canonicalIndex?.get?.(h?.canonical_card_id)||null);}
function unit(h){for(const v of[canonical(h)?.current_price,h?.market_value,h?.manual_value])if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return Number(v);return null;}
function total(h){const u=unit(h);return u===null?0:u*Number(h?.quantity||1);}
function name(h){return String(h?.display_name||h?.subject||'Untitled card');}
function page(){return document.getElementById('content');}

function download(filename,text,type='application/json'){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function safeExportRow(h){
  return {name:name(h),category:h.category||'Other',year:h.year||'',manufacturer:h.manufacturer||'',brand:h.brand||'',set:h.set_name||'',card_number:h.card_number||'',parallel:h.parallel||'',quantity:Number(h.quantity||1),market_value:unit(h),cost_basis:Number(h.cost_basis||0),grading_company:h.grading_company||'',grade:h.grade||''};
}
function exportAll(){download(`cardfolio-portfolio-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify((state?.holdings||[]).map(safeExportRow),null,2));}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function exportSelected(ids){
  const set=new Set(ids),rows=(state?.holdings||[]).filter(h=>set.has(String(h.id))).map(safeExportRow);
  const keys=['name','category','year','manufacturer','brand','set','card_number','parallel','quantity','market_value','cost_basis','grading_company','grade'];
  const csv=[keys.join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\n');
  download(`cardfolio-selected-${new Date().toISOString().slice(0,10)}.csv`,csv,'text/csv;charset=utf-8');
}

function ensureDialog(){
  let d=document.getElementById('cfLabDialog');if(d)return d;
  d=document.createElement('dialog');d.id='cfLabDialog';d.className='cf-lab-dialog';
  d.innerHTML='<div class="cf-lab-sheet"><div class="cf-lab-head"><div><div class="eyebrow" id="cfLabEyebrow">Portfolio Lab</div><h2 id="cfLabTitle">Tool</h2></div><button type="button" class="cf-lab-close" aria-label="Close">×</button></div><div id="cfLabBody"></div></div>';
  document.body.appendChild(d);d.querySelector('.cf-lab-close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d)d.close();});return d;
}
function openLab(title,html,eyebrow='Portfolio Lab'){
  const d=ensureDialog();d.querySelector('#cfLabTitle').textContent=title;d.querySelector('#cfLabEyebrow').textContent=eyebrow;d.querySelector('#cfLabBody').innerHTML=html;d.showModal();return d;
}

async function openMovers(){
  const ids=[...new Set((state?.holdings||[]).map(h=>h.canonical_card_id).filter(Boolean))];
  const d=openLab('Market movers','<div class="cf-lab-loading">Calculating movement from stored market history…</div>','Market intelligence');
  if(!ids.length){d.querySelector('#cfLabBody').innerHTML='<div class="cf-lab-empty">No exact-card market history is linked yet.</div>';return;}
  try{
    let history=[];
    if(state?.supabase){
      const {data,error}=await state.supabase.from('canonical_price_history').select('canonical_card_id,market_price,observed_at').in('canonical_card_id',ids).order('observed_at',{ascending:true}).limit(2000);
      if(error)throw error;history=data||[];
    }else{
      for(const id of ids)for(const row of state?.canonicalHistory?.[id]||[])history.push({canonical_card_id:id,market_price:row.market_price,observed_at:row.observed_at});
    }
    const grouped=new Map();for(const r of history){if(!Number.isFinite(Number(r.market_price)))continue;const a=grouped.get(r.canonical_card_id)||[];a.push(r);grouped.set(r.canonical_card_id,a);}
    const movers=[];
    for(const h of state?.holdings||[]){const rows=grouped.get(h.canonical_card_id)||[];if(rows.length<2)continue;const first=Number(rows[0].market_price),last=Number(rows.at(-1).market_price);if(!Number.isFinite(first)||first<=0||!Number.isFinite(last))continue;movers.push({h,first,last,pct:(last-first)/first*100,delta:last-first});}
    movers.sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
    d.querySelector('#cfLabBody').innerHTML=movers.length?`<div class="cf-movers-list">${movers.map(m=>`<button class="cf-mover-row" data-lab-card="${esc(m.h.id)}"><div><strong>${esc(name(m.h))}</strong><small>${esc(m.h.category||'Other')} · ${rowsLabel(grouped.get(m.h.canonical_card_id))}</small></div><div class="cf-mover-value ${m.pct>=0?'good':'bad'}"><strong>${m.pct>=0?'+':''}${m.pct.toFixed(1)}%</strong><small>${m.delta>=0?'+':''}${moneyText(m.delta)} / card</small></div></button>`).join('')}</div>`:'<div class="cf-lab-empty">Market history needs at least two real observations per card before Cardfolio calls something a mover.</div>';
    d.querySelectorAll('[data-lab-card]').forEach(b=>b.addEventListener('click',()=>{const h=(state.holdings||[]).find(x=>String(x.id)===String(b.dataset.labCard));d.close();if(h&&typeof openCardDialog==='function')openCardDialog(h);}));
  }catch(error){console.warn('Market movers unavailable',error);d.querySelector('#cfLabBody').innerHTML='<div class="cf-lab-empty">Market history could not be loaded right now. No movement was fabricated.</div>';}
}
function rowsLabel(rows=[]){if(!rows.length)return 'No history';const a=new Date(rows[0].observed_at),b=new Date(rows.at(-1).observed_at);return `${a.toLocaleDateString(undefined,{month:'short',day:'numeric'})} → ${b.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;}

function openTradeLab(){
  const cards=(state?.holdings||[]).filter(h=>unit(h)!==null);
  const options=cards.map(h=>`<label class="cf-trade-card"><input type="checkbox" data-trade-own="${esc(h.id)}"><span><strong>${esc(name(h))}</strong><small>${moneyText(total(h))}</small></span></label>`).join('');
  const d=openLab('Trade Lab',`<div class="cf-trade-grid"><section><h3>Your side</h3><p class="muted">Select cards you would give.</p><div class="cf-trade-list">${options||'<div class="cf-lab-empty">Price cards first to compare a trade.</div>'}</div></section><section><h3>Incoming side</h3><p class="muted">Enter the other side's verified market value.</p><label class="cf-lab-field">Incoming cards value ($)<input id="cfTradeIncoming" type="number" min="0" step="0.01" value="0"></label><label class="cf-lab-field">Cash added to incoming side ($)<input id="cfTradeCash" type="number" step="0.01" value="0"></label><div class="cf-trade-result" id="cfTradeResult"></div></section></div><p class="cf-lab-note">Trade Lab does math only. Verify exact variants, grades, condition and comps before trading.</p>`,'Decision tools');
  const recalc=()=>{const selected=[...d.querySelectorAll('[data-trade-own]:checked')].map(x=>x.dataset.tradeOwn),mine=(state.holdings||[]).filter(h=>selected.includes(String(h.id))).reduce((s,h)=>s+total(h),0),incoming=Number(d.querySelector('#cfTradeIncoming')?.value||0)+Number(d.querySelector('#cfTradeCash')?.value||0),delta=incoming-mine,pct=mine?delta/mine*100:0;d.querySelector('#cfTradeResult').innerHTML=`<div><span>Your side</span><strong>${moneyText(mine)}</strong></div><div><span>Incoming</span><strong>${moneyText(incoming)}</strong></div><div><span>Difference</span><strong class="${delta>=0?'good':'bad'}">${delta>=0?'+':''}${moneyText(delta)} ${mine?`(${delta>=0?'+':''}${pct.toFixed(1)}%)`:''}</strong></div>`;};
  d.querySelectorAll('[data-trade-own],#cfTradeIncoming,#cfTradeCash').forEach(el=>el.addEventListener('input',recalc));recalc();
}

function openBulk(){
  const rows=(state?.holdings||[]).map(h=>`<label class="cf-bulk-row"><input type="checkbox" data-bulk-id="${esc(h.id)}"><span><strong>${esc(name(h))}</strong><small>${esc(h.category||'Other')} · ${unit(h)===null?'Unpriced':moneyText(total(h))}</small></span></label>`).join('');
  const d=openLab('Bulk select',`<div class="cf-bulk-toolbar"><button class="btn secondary" id="cfBulkAll">Select all</button><span id="cfBulkCount">0 selected</span></div><div class="cf-bulk-list">${rows||'<div class="cf-lab-empty">No cards yet.</div>'}</div><div class="cf-lab-actions"><button class="btn secondary" id="cfBulkCopy">Copy list</button><button class="btn primary" id="cfBulkCsv">Export CSV</button></div>`,'Collection tools');
  const selected=()=>[...d.querySelectorAll('[data-bulk-id]:checked')].map(x=>x.dataset.bulkId),sync=()=>{d.querySelector('#cfBulkCount').textContent=`${selected().length} selected`;};
  d.querySelectorAll('[data-bulk-id]').forEach(x=>x.addEventListener('change',sync));d.querySelector('#cfBulkAll')?.addEventListener('click',()=>{d.querySelectorAll('[data-bulk-id]').forEach(x=>x.checked=true);sync();});
  d.querySelector('#cfBulkCsv')?.addEventListener('click',()=>{const ids=selected();if(!ids.length)return;exportSelected(ids);});
  d.querySelector('#cfBulkCopy')?.addEventListener('click',async()=>{const ids=new Set(selected()),text=(state.holdings||[]).filter(h=>ids.has(String(h.id))).map(h=>`${name(h)} — ${unit(h)===null?'Unpriced':moneyText(total(h))}`).join('\n');if(!text)return;try{await navigator.clipboard.writeText(text);if(typeof toast==='function')toast('Selected card list copied');}catch{}});sync();
}

function portfolioTools(){
  if(state?.view!=='portfolio')return;const c=page();if(!c||c.querySelector('.cf-portfolio-tools'))return;
  const host=c.querySelector('.portfolio-shell,.panel,.content-card')||c.firstElementChild||c;
  const tools=document.createElement('section');tools.className='cf-portfolio-tools';tools.innerHTML='<button data-cf-tool="movers"><span>↗</span><strong>Market Movers</strong><small>Real price-history changes</small></button><button data-cf-tool="trade"><span>⇄</span><strong>Trade Lab</strong><small>Compare deal value</small></button><button data-cf-tool="bulk"><span>☷</span><strong>Bulk Select</strong><small>Copy or export cards</small></button><button data-cf-tool="export"><span>⇧</span><strong>Export</strong><small>Portable portfolio backup</small></button>';
  host.insertAdjacentElement('beforebegin',tools);
  tools.querySelector('[data-cf-tool="movers"]')?.addEventListener('click',openMovers);tools.querySelector('[data-cf-tool="trade"]')?.addEventListener('click',openTradeLab);tools.querySelector('[data-cf-tool="bulk"]')?.addEventListener('click',openBulk);tools.querySelector('[data-cf-tool="export"]')?.addEventListener('click',exportAll);
}

function profilePerformance(){
  if(state?.view!=='profile')return;const c=page();if(!c||c.querySelector('[data-cf-performance]'))return;
  const holdings=state?.holdings||[],value=holdings.reduce((s,h)=>s+total(h),0),cost=holdings.reduce((s,h)=>s+(Number(h.cost_basis)||0)*Number(h.quantity||1),0),pnl=value-cost,priced=holdings.filter(h=>unit(h)!==null).length,graded=holdings.filter(h=>h.grading_company).length;
  const panel=document.createElement('section');panel.className='panel cf-profile-performance';panel.dataset.cfPerformance='1';panel.innerHTML=`<div class="section-head"><div><div class="eyebrow">Portfolio performance</div><h3>Your collection at a glance</h3></div></div><div class="cf-performance-grid"><div><span>Value</span><strong>${moneyText(value)}</strong></div><div><span>Cost basis</span><strong>${moneyText(cost)}</strong></div><div><span>Gain / loss</span><strong class="${pnl>=0?'good':'bad'}">${pnl>=0?'+':''}${moneyText(pnl)}</strong></div><div><span>Priced</span><strong>${priced}/${holdings.length}</strong></div><div><span>Graded</span><strong>${graded}</strong></div><div><span>Total qty</span><strong>${holdings.reduce((s,h)=>s+Number(h.quantity||1),0)}</strong></div></div><div class="cf-profile-actions"><button class="btn secondary" data-cf-profile-export>Export backup</button><button class="btn secondary" data-view="market">Open Market</button></div>`;c.appendChild(panel);panel.querySelector('[data-cf-profile-export]')?.addEventListener('click',exportAll);

  const recent=[...holdings].sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,5);if(recent.length){const activity=document.createElement('section');activity.className='panel cf-profile-activity';activity.dataset.cfPerformance='1';activity.innerHTML=`<div class="section-head"><div><div class="eyebrow">Collection activity</div><h3>Recent additions</h3></div></div><div class="cf-activity-list">${recent.map(h=>`<button data-cf-activity-card="${esc(h.id)}"><span><strong>${esc(name(h))}</strong><small>${esc(h.category||'Other')} · ${h.created_at?new Date(h.created_at).toLocaleDateString():''}</small></span><b>${unit(h)===null?'Unpriced':moneyText(total(h))}</b></button>`).join('')}</div>`;c.appendChild(activity);activity.querySelectorAll('[data-cf-activity-card]').forEach(b=>b.addEventListener('click',()=>{const h=holdings.find(x=>String(x.id)===String(b.dataset.cfActivityCard));if(h&&typeof openCardDialog==='function')openCardDialog(h);}));}
}

function marketEnhance(){
  if(state?.view!=='market')return;const c=page();if(!c||c.querySelector('[data-cf-market-lab]'))return;
  const note=document.createElement('section');note.className='panel cf-market-lab';note.dataset.cfMarketLab='1';note.innerHTML='<div class="section-head"><div><div class="eyebrow">Cardfolio Market</div><h3>Research, don’t guess.</h3></div></div><p class="muted">Use active listings, exact-card sold evidence when available, watchlists and your own stored price history. Cardfolio does not turn asking prices into fake sales.</p><div class="cf-profile-actions"><button class="btn secondary" data-view="watchlist">Watchlists</button><button class="btn secondary" data-cf-tool-market-movers>Market Movers</button><button class="btn secondary" data-view="grading">Grading</button></div>';c.appendChild(note);note.querySelector('[data-cf-tool-market-movers]')?.addEventListener('click',openMovers);
}

const observer=new MutationObserver(()=>{portfolioTools();profilePerformance();marketEnhance();});observer.observe(document.documentElement,{subtree:true,childList:true});
portfolioTools();profilePerformance();marketEnhance();
document.addEventListener('click',e=>{const x=e.target.closest?.('[data-cf-tool]');if(!x)return;const t=x.dataset.cfTool;if(t==='movers')openMovers();if(t==='trade')openTradeLab();if(t==='bulk')openBulk();if(t==='export')exportAll();});
window.cardfolioOpenMarketMovers=openMovers;window.cardfolioOpenTradeLab=openTradeLab;
})();
