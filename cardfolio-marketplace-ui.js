/* Cardfolio marketplace/detail UX overlay.
   Keeps canonical valuation server-authoritative while improving $0 display,
   active eBay listing discovery, card-level actions, and dense sale-chart readability. */
(function(){
'use strict';

let marketIntent=false;
const listingCache=new Map();

function getState(){try{return state}catch(_){return null}}
function esc(v=''){return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]))}
function money(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'$0.00'}
function normalize(v=''){return String(v||'').trim().replace(/\s+/g,' ')}
function numeric(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function safeEbayUrl(raw=''){
  try{const u=new URL(raw,location.origin);const host=u.hostname.toLowerCase();return host==='ebay.com'||host.endsWith('.ebay.com')?u.href:''}catch(_){return ''}
}
function holdingById(id){return getState()?.holdings?.find?.(h=>h.id===id)||null}
function canonicalOf(h){return h?._canonical||getState()?.canonicalIndex?.get?.(h?.canonical_card_id)||null}
function currentPrice(h){const c=canonicalOf(h);if(numeric(c?.current_price))return Number(c.current_price);if(numeric(h?.market_value))return Number(h.market_value);if(numeric(h?.manual_value))return Number(h.manual_value);return null}
function isUnpriced(h){return currentPrice(h)===null}
function cardQuery(h){
  const c=canonicalOf(h)||{};
  return [c.year||h?.year,c.manufacturer||h?.manufacturer,c.brand||h?.brand,c.set_name||h?.set_name,c.subject||h?.subject,(c.card_number||h?.card_number)?`#${c.card_number||h.card_number}`:'',c.parallel||h?.parallel,c.variant_name||h?.variant_name,c.grading_company||h?.grading_company,c.grade||h?.grade].filter(Boolean).map(normalize).join(' ').slice(0,190);
}
function cardCopyText(h){
  const c=canonicalOf(h)||{};
  const title=normalize(h?.display_name)||[c.subject||h?.subject,c.year||h?.year,c.brand||h?.brand||c.manufacturer||h?.manufacturer,c.set_name||h?.set_name,(c.card_number||h?.card_number)?`#${c.card_number||h.card_number}`:'',c.parallel||h?.parallel].filter(Boolean).join(' · ');
  const facts=[
    ['Category',c.category||h?.category],['Player / character',c.subject||h?.subject],['Year',c.year||h?.year],['Manufacturer',c.manufacturer||h?.manufacturer],['Product / set',c.set_name||h?.set_name||c.brand||h?.brand],['Card #',c.card_number||h?.card_number],['Parallel',c.parallel||h?.parallel],['Variant',c.variant_name||h?.variant_name],['Serial',c.serial_number||h?.serial_number],['Grade',c.grading_company?`${c.grading_company} ${c.grade||''}`:(h?.grading_company?`${h.grading_company} ${h.grade||''}`:'Raw')]
  ].filter(([,v])=>normalize(v));
  const p=currentPrice(h);
  return [title||'Cardfolio card',...facts.map(([k,v])=>`${k}: ${normalize(v)}`),`Cardfolio FMV: ${p===null?'$0.00':money(p)}`].join('\n');
}
function toastMsg(message){try{if(typeof toast==='function')return toast(message)}catch(_){}const el=document.getElementById('toast');if(el){el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}}
async function copyCard(h){
  const text=cardCopyText(h);
  try{await navigator.clipboard.writeText(text);toastMsg('Card copied')}catch(_){
    const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toastMsg('Card copied')}catch(__){toastMsg('Copy unavailable')}finally{ta.remove()}
  }
}

function ensureAlbumMarketButtons(root=document){
  root.querySelectorAll?.('[data-detail-card]').forEach(card=>{
    if(card.querySelector('.card-market-inline-row'))return;
    const copy=card.querySelector('.album-copy');if(!copy)return;
    const row=document.createElement('div');row.className='card-market-inline-row';
    row.innerHTML='<button type="button" class="card-market-mini">Market</button>';
    copy.appendChild(row);
    row.querySelector('button')?.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();marketIntent=true;
      card.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      setTimeout(()=>document.querySelector('#cardDetailContent .marketplace-section-v3')?.scrollIntoView({behavior:'smooth',block:'start'}),420);
    });
  });
}

function applyZeroDisplays(root=document){
  const s=getState();if(!s)return;
  root.querySelectorAll?.('[data-detail-card]').forEach(card=>{
    const h=holdingById(card.dataset.detailCard);if(!h||!isUnpriced(h))return;
    const value=card.querySelector('.album-value b');if(value){value.textContent='$0.00';value.classList.add('unpriced-zero')}
  });
  const box=document.getElementById('cardDetailContent');if(!box)return;
  const id=box.querySelector('[data-detail-edit]')?.dataset.detailEdit;const h=holdingById(id);if(!h||!isUnpriced(h))return;
  const detailPrice=box.querySelector('.detail-price');if(detailPrice)detailPrice.textContent='$0.00';
  box.querySelectorAll('.market-stats-v2>span').forEach(stat=>{
    if(/Fair market value/i.test(stat.querySelector('small')?.textContent||'')){
      const b=stat.querySelector('b');if(b)b.textContent='$0.00';
      if(!stat.querySelector('em'))stat.insertAdjacentHTML('beforeend','<em>No verified sold price yet</em>');
    }
  });
}

function stabilizeObservationChart(root=document){
  root.querySelectorAll?.('[data-observation-chart]').forEach(chart=>{
    const svg=chart.querySelector('svg'),path=chart.querySelector('.market-price-line');
    const dots=[...chart.querySelectorAll('.market-sale-dot')].map(el=>({x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),price:Number(el.dataset.price)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(!svg||!path||!dots.length)return;
    path.setAttribute('d',dots.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '));
    chart.classList.toggle('dense-sales',dots.length>=12);chart.classList.toggle('very-dense-sales',dots.length>=28);
    if(!chart.querySelector('.chart-price-scale')){
      const prices=dots.map(p=>p.price).filter(Number.isFinite);if(prices.length){
        const min=Math.min(...prices),max=Math.max(...prices),mid=(min+max)/2;
        const labels=document.createElement('div');labels.className='chart-price-scale';labels.innerHTML=`<span>${esc(money(max))}</span><span>${esc(money(mid))}</span><span>${esc(money(min))}</span>`;chart.appendChild(labels);
      }
    }
  });
}

function marketSection(box){return [...box.querySelectorAll('.detail-section')].find(s=>/Market activity|Market evidence/i.test(s.textContent||''))||null}
function buildEbaySearchUrl(h){return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(cardQuery(h))}`}

async function fetchActiveListings(h){
  const key=h?.canonical_card_id||h?.id;if(!key)return {items:[],configured:false};
  const cached=listingCache.get(key);if(cached&&Date.now()-cached.at<60000)return cached.data;
  const r=await fetch('/api/ebay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:cardQuery(h)})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error||'Live eBay lookup failed');
  const safe={...data,items:(data.items||[]).map(i=>({...i,url:safeEbayUrl(i.url)})).filter(i=>i.url&&i.title&&Number.isFinite(Number(i.price)))};
  listingCache.set(key,{at:Date.now(),data:safe});return safe;
}

function listingCard(i){
  return `<article class="embedded-listing-card">
    <a class="embedded-listing-main" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(i.title)} on eBay">
      ${i.image?`<img src="${esc(i.image)}" alt="" loading="lazy"/>`:'<div class="embedded-listing-placeholder">eBay</div>'}
      <div class="embedded-listing-copy"><strong>${esc(i.title)}</strong><span>${esc(i.condition||'Active listing')}</span><b>${i.currency==='USD'?money(i.price):`${esc(i.price)} ${esc(i.currency)}`}</b></div>
    </a>
    <a class="embedded-listing-ebay" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Open on eBay ↗</a>
  </article>`;
}

async function renderListings(section,h){
  const host=section.querySelector('[data-active-listings]');if(!host||host.dataset.loading==='1')return;
  host.dataset.loading='1';host.innerHTML='<div class="listing-loading">Loading active eBay listings…</div>';
  try{
    const data=await fetchActiveListings(h);
    if(!data.configured){host.innerHTML='<div class="listing-empty">eBay live listings are not configured on this deployment.</div>';return}
    const items=(data.items||[]).slice(0,8);
    host.innerHTML=items.length?`<div class="embedded-listing-strip">${items.map(listingCard).join('')}</div><div class="listing-footnote">Active asking prices are shown as marketplace context only and do not set Cardfolio FMV.</div>`:'<div class="listing-empty">No active eBay listings matched this exact-card search right now.</div>';
  }catch(_){host.innerHTML='<div class="listing-empty">Live eBay listings could not be loaded right now.</div>'}
  finally{delete host.dataset.loading}
}

function enhanceDetail(root=document){
  const box=root.id==='cardDetailContent'?root:document.getElementById('cardDetailContent');if(!box)return;
  const id=box.querySelector('[data-detail-edit]')?.dataset.detailEdit;const h=holdingById(id);if(!h)return;
  applyZeroDisplays(box);stabilizeObservationChart(box);
  const section=marketSection(box);if(!section)return;
  section.classList.add('marketplace-section-v3');
  if(!section.querySelector('.card-market-actions')){
    const head=section.querySelector('.section-head');
    const url=buildEbaySearchUrl(h);
    const actions=document.createElement('div');actions.className='card-market-actions';
    actions.innerHTML=`<a class="card-ebay-action" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>VIEW ACTIVE ON eBay</span><b>↗</b></a><button type="button" class="copy-card-action">COPY CARD</button>`;
    head?.insertAdjacentElement('afterend',actions);
    actions.querySelector('.copy-card-action')?.addEventListener('click',()=>void copyCard(h));
  }
  if(!section.querySelector('.active-listings-panel')){
    const evidence=section.querySelector('.evidence-list,.glass-empty');
    const panel=document.createElement('div');panel.className='active-listings-panel';
    panel.innerHTML='<div class="active-listings-head"><div><span>Live marketplace</span><strong>Active eBay listings</strong></div><small>Browse inside Cardfolio</small></div><div data-active-listings></div>';
    if(evidence)evidence.insertAdjacentElement('afterend',panel);else section.appendChild(panel);
  }
  void renderListings(section,h);
  if(marketIntent){marketIntent=false;setTimeout(()=>section.scrollIntoView({behavior:'smooth',block:'start'}),80)}
}

const observer=new MutationObserver(records=>{
  let detail=false,albums=false,chart=false;
  for(const r of records){for(const n of r.addedNodes){if(n.nodeType!==1)continue;if(n.matches?.('[data-detail-card]')||n.querySelector?.('[data-detail-card]'))albums=true;if(n.id==='cardDetailContent'||n.matches?.('.detail-section,.card-chart,[data-observation-chart]')||n.querySelector?.('.detail-section,.card-chart,[data-observation-chart]'))detail=true;if(n.matches?.('[data-observation-chart]')||n.querySelector?.('[data-observation-chart]'))chart=true}}
  if(albums){ensureAlbumMarketButtons();applyZeroDisplays()}
  if(chart)stabilizeObservationChart();
  if(detail)setTimeout(()=>enhanceDetail(),100);
});

function install(){
  ensureAlbumMarketButtons();applyZeroDisplays();stabilizeObservationChart();enhanceDetail();
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    const card=e.target.closest?.('[data-detail-card],.holding[data-card-id]');if(card)setTimeout(()=>enhanceDetail(),140);
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
