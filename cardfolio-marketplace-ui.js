/* Cardfolio marketplace UX companion.
   Complements the card-local market experience without changing valuation data. */
(function(){
'use strict';

let marketIntent=false;
function getState(){try{return state}catch(_){return null}}
function numeric(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function currentPrice(h){const c=h?._canonical||getState()?.canonicalIndex?.get?.(h?.canonical_card_id);for(const v of [c?.current_price,h?.market_value,h?.manual_value])if(numeric(v))return Number(v);return null}
function holdingById(id){return getState()?.holdings?.find?.(h=>h.id===id)||null}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0)}

function marketTarget(){
  const box=document.getElementById('cardDetailContent');if(!box)return null;
  return box.querySelector('[data-active-market]')||[...box.querySelectorAll('.detail-section')].find(s=>/Market activity|Market evidence/i.test(s.textContent||''))||null;
}
function scrollMarket(){const target=marketTarget();if(target){target.scrollIntoView({behavior:'smooth',block:'start'});marketIntent=false;return true}return false}

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
      setTimeout(scrollMarket,260);setTimeout(scrollMarket,650);
    });
  });
}

function applyZeroDisplays(root=document){
  const s=getState();if(!s?.holdings)return;
  root.querySelectorAll?.('[data-detail-card]').forEach(card=>{
    const h=holdingById(card.dataset.detailCard);if(!h||currentPrice(h)!==null)return;
    const value=card.querySelector('.album-value b');if(value){value.textContent='$0.00';value.classList.add('unpriced-zero')}
  });
  const box=document.getElementById('cardDetailContent');if(!box)return;
  const id=box.querySelector('[data-detail-edit]')?.dataset.detailEdit;const h=holdingById(id);if(!h||currentPrice(h)!==null)return;
  const price=box.querySelector('.detail-price');if(price)price.textContent='$0.00';
}

function addReadablePriceScale(root=document){
  root.querySelectorAll?.('[data-readable-sale-chart]').forEach(chart=>{
    if(chart.querySelector('.chart-price-scale'))return;
    const prices=[...chart.querySelectorAll('.market-sale-dot')].map(d=>Number(d.dataset.price)).filter(Number.isFinite);if(!prices.length)return;
    const min=Math.min(...prices),max=Math.max(...prices),mid=(min+max)/2;
    const scale=document.createElement('div');scale.className='chart-price-scale';scale.innerHTML=`<span>${money(max)}</span><span>${money(mid)}</span><span>${money(min)}</span>`;chart.appendChild(scale);
  });
}

const observer=new MutationObserver(records=>{
  let albums=false,detail=false,chart=false;
  for(const r of records)for(const n of r.addedNodes){if(n.nodeType!==1)continue;if(n.matches?.('[data-detail-card]')||n.querySelector?.('[data-detail-card]'))albums=true;if(n.id==='cardDetailContent'||n.matches?.('.detail-section,[data-active-market]')||n.querySelector?.('.detail-section,[data-active-market]'))detail=true;if(n.matches?.('[data-readable-sale-chart]')||n.querySelector?.('[data-readable-sale-chart]'))chart=true}
  if(albums){ensureAlbumMarketButtons();applyZeroDisplays()}
  if(chart)addReadablePriceScale();
  if(detail){applyZeroDisplays();addReadablePriceScale();if(marketIntent)setTimeout(scrollMarket,80)}
});

function install(){ensureAlbumMarketButtons();applyZeroDisplays();addReadablePriceScale();observer.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('cardfolio:cloud-refreshed',()=>{ensureAlbumMarketButtons();applyZeroDisplays();addReadablePriceScale()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
