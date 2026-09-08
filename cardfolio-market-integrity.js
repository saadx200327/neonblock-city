/* Cardfolio market-integrity guard + Robinhood-style evidence detail.
   Canonical pricing remains server-authoritative. Active asks are context only;
   this layer visualizes genuine exact sold observations without inventing points. */
(function(){
'use strict';

let activeHoldingId=null;
let detailUpgradeTimer=null;
let detailRequestSeq=0;
let cloudRefreshBusy=false;

function getState(){try{return state}catch(_){return null}}
function usd(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—'}
function esc(v=''){return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]))}
function quantile(values,q){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;if(a.length===1)return a[0];const pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos),f=pos-lo;return a[lo]+(a[hi]-a[lo])*f}
function saleTime(row){const raw=row?.sold_at||row?.observed_at;const t=raw?new Date(raw).getTime():NaN;return Number.isFinite(t)?t:null}
function ageDays(t){return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/86400000)):null}
function formatDateTime(t){return Number.isFinite(t)?new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'}
function shortDate(t){return Number.isFinite(t)?new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'}):'—'}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

function hardenActiveAskControls(root=document){
  const button=root.querySelector?.('#useEbayMedian')||document.getElementById('useEbayMedian');
  if(!button||button.dataset.cardfolioMarketGuard==='1')return;
  button.dataset.cardfolioMarketGuard='1';button.disabled=true;button.setAttribute('aria-disabled','true');
  button.textContent='Active ask · context only';button.title='Active asking prices do not set Cardfolio market value. Verified sold comps are required.';
  const note=button.closest('.button-row')?.nextElementSibling;
  if(note?.classList.contains('holding-meta'))note.textContent='Active asking prices are context only. They never change portfolio or canonical market value.';
}

function smoothPath(points){
  if(!points.length)return '';
  if(points.length===1)return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let d=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for(let i=0;i<points.length-1;i++){
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
    const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6;
    const c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;
    d+=` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function exactSoldPoints(rows){
  return (rows||[]).filter(r=>r?.source_kind==='sold'&&r?.exact_match!==false&&String(r?.currency||'USD').toUpperCase()==='USD'&&Number(r?.price)>0&&saleTime(r)!==null)
    .map(r=>({price:Number(r.price),time:saleTime(r),marketplace:r.marketplace||'Market',url:r.provenance_url||'',title:r.title||''})).sort((a,b)=>a.time-b.time);
}

function soldObservationChart(rows){
  const points=exactSoldPoints(rows);
  if(!points.length)return '<div class="card-chart observation-chart empty-chart"><span>No verified exact sold observations are available yet.</span></div>';
  const w=720,h=260,m={l:18,r:18,t:58,b:32};
  const prices=points.map(p=>p.price),rawMin=Math.min(...prices),rawMax=Math.max(...prices),rawSpan=rawMax-rawMin;
  const pad=rawSpan>0?Math.max(rawSpan*.14,.18):Math.max(rawMax*.08,.35);
  const yMin=Math.max(0,rawMin-pad),yMax=rawMax+pad,ySpan=Math.max(.01,yMax-yMin);
  const tMin=points[0].time,tMax=points[points.length-1].time,tSpan=Math.max(1,tMax-tMin);
  const x=t=>m.l+(t-tMin)/tSpan*(w-m.l-m.r),y=v=>m.t+(yMax-v)/ySpan*(h-m.t-m.b);
  const plotted=points.map((p,i)=>({...p,i,x:x(p.time),y:y(p.price)}));
  const path=smoothPath(plotted);
  const latest=plotted[plotted.length-1];
  const yTicks=[.25,.5,.75].map(f=>m.t+(h-m.t-m.b)*f);
  const grid=yTicks.map(gy=>`<line x1="${m.l}" y1="${gy.toFixed(1)}" x2="${w-m.r}" y2="${gy.toFixed(1)}" class="market-chart-grid"/>`).join('');
  const dots=plotted.map(p=>`<circle class="market-sale-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3.2" data-sale-index="${p.i}" data-price="${p.price}" data-time="${p.time}" data-marketplace="${esc(p.marketplace)}"/>`).join('');
  const labels=points.length>1?`<span>${esc(shortDate(tMin))}</span><span>${esc(shortDate(tMax))}</span>`:`<span>${esc(shortDate(tMin))}</span>`;
  return `<div class="card-chart observation-chart" data-observation-chart>
    <div class="card-chart-readout"><strong data-chart-price>${esc(usd(latest.price))}</strong><span data-chart-meta>${esc(formatDateTime(latest.time))} · ${esc(latest.marketplace)}</span></div>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Verified exact sold prices over time" preserveAspectRatio="none">
      ${grid}<path d="${path}" class="market-price-line" vector-effect="non-scaling-stroke"/>${dots}
      <line class="market-chart-tracker" data-chart-tracker x1="${latest.x.toFixed(2)}" y1="${m.t}" x2="${latest.x.toFixed(2)}" y2="${h-m.b}"/>
      <circle class="market-chart-focus" data-chart-focus cx="${latest.x.toFixed(2)}" cy="${latest.y.toFixed(2)}" r="6.5"/>
      <rect class="market-chart-hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
    </svg><div class="chart-range market-chart-range">${labels}</div></div>`;
}

function wireObservationChart(root){
  if(!root||root.dataset.scrubberReady==='1')return;
  const svg=root.querySelector('svg'),hit=root.querySelector('.market-chart-hit'),tracker=root.querySelector('[data-chart-tracker]'),focus=root.querySelector('[data-chart-focus]'),priceEl=root.querySelector('[data-chart-price]'),metaEl=root.querySelector('[data-chart-meta]');
  const dots=[...root.querySelectorAll('.market-sale-dot')].map(el=>({el,x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),price:Number(el.dataset.price),time:Number(el.dataset.time),marketplace:el.dataset.marketplace||'Market'})).filter(p=>Number.isFinite(p.x));
  if(!svg||!hit||!dots.length)return;root.dataset.scrubberReady='1';
  const select=point=>{tracker?.setAttribute('x1',point.x);tracker?.setAttribute('x2',point.x);focus?.setAttribute('cx',point.x);focus?.setAttribute('cy',point.y);for(const p of dots)p.el.classList.toggle('selected',p===point);if(priceEl)priceEl.textContent=usd(point.price);if(metaEl)metaEl.textContent=`${formatDateTime(point.time)} · ${point.marketplace}`};
  select(dots[dots.length-1]);
  const choose=e=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const vb=svg.viewBox.baseVal;const px=vb.x+clamp((e.clientX-rect.left)/rect.width,0,1)*vb.width;let nearest=dots[0],best=Math.abs(dots[0].x-px);for(let i=1;i<dots.length;i++){const d=Math.abs(dots[i].x-px);if(d<best){best=d;nearest=dots[i]}}select(nearest)};
  hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});hit.addEventListener('pointercancel',()=>select(dots[dots.length-1]));
}

function confidenceLabel(c){const v=Number(c?.valuation_confidence);if(!Number.isFinite(v))return 'Pending';if(v>=.8)return 'High';if(v>=.45)return 'Medium';return 'Low'}
function liquidityLabel(rows){const cutoff=Date.now()-30*86400000,n=exactSoldPoints(rows).filter(p=>p.time>=cutoff).length;if(n>=8)return 'High';if(n>=3)return 'Active';if(n>=1)return 'Thin';return 'Sparse'}
function stat(label,value,sub=''){return `<span><small>${esc(label)}</small><b>${esc(value)}</b>${sub?`<em>${esc(sub)}</em>`:''}</span>`}

function upgradeStats(box,c,rows){
  const facts=box.querySelector('.market-facts');if(!facts)return;
  const sold=exactSoldPoints(rows),latest=sold[sold.length-1],d=c?.metadata?.valuation_details||{};
  const range=(Number.isFinite(Number(c?.valuation_low))&&Number.isFinite(Number(c?.valuation_high)))?`${usd(c.valuation_low)}–${usd(c.valuation_high)}`:'—';
  const quick=Number.isFinite(Number(d.quick_sale_estimate))?usd(d.quick_sale_estimate):'—';
  const list=Number.isFinite(Number(d.suggested_listing_reference))?usd(d.suggested_listing_reference):'—';
  const checkTime=new Date(c?.last_market_check||c?.last_researched_at||c?.market_updated_at||'').getTime();
  const latestAge=latest?ageDays(latest.time):null,conf=Number(c?.valuation_confidence);
  const recent30=sold.filter(p=>p.time>=Date.now()-30*86400000).length;
  facts.classList.add('market-stats-v2');
  facts.innerHTML=[
    stat('Fair market value',Number.isFinite(Number(c?.current_price))?usd(c.current_price):'Pending'),
    stat('Market range',range),stat('Quick sale',quick),stat('Suggested list',list),
    stat('Exact comps',String(Number(c?.valuation_sample_size||sold.length||0))),stat('Sales · 30d',String(recent30)),
    stat('Last exact sale',latest?shortDate(latest.time):'—',latestAge===null?'':latestAge===0?'Today':`${latestAge}d ago`),
    stat('Liquidity',liquidityLabel(rows)),stat('Confidence',Number.isFinite(conf)?`${Math.round(conf*100)}% · ${confidenceLabel(c)}`:'Pending'),
    stat('Last market check',Number.isFinite(checkTime)?shortDate(checkTime):'—')
  ].join('');
  const prior=box.querySelector('.market-source-strip');prior?.remove();
  const sources=[...new Set(sold.map(p=>p.marketplace).filter(Boolean))];
  facts.insertAdjacentHTML('afterend',`<div class="market-source-strip"><span>Accepted-sale sources</span><strong>${sources.length?sources.map(esc).join(' · '):'No exact sold source accepted yet'}</strong></div>`);
}

function upgradeCardFacts(box,c,holding){
  if(box.querySelector('.card-identity-facts'))return;
  const fields=[['Year',c?.year||holding?.year],['Set',c?.set_name||holding?.set_name],['Card #',c?.card_number||holding?.card_number],['Parallel',c?.parallel||holding?.parallel],['Variant',c?.variant_name||holding?.variant_name],['Serial',c?.serial_number||holding?.serial_number],['Grade',c?.grading_company?`${c.grading_company} ${c.grade||''}`:(holding?.grading_company?`${holding.grading_company} ${holding.grade||''}`:'Raw')],['Language',c?.language||holding?.language]].filter(([,v])=>String(v||'').trim());
  const marketSection=[...box.querySelectorAll('.detail-section')].find(s=>/Market evidence/i.test(s.textContent||''));
  const html=`<section class="detail-section card-identity-facts"><div class="section-head"><div><div class="eyebrow">Card facts</div><h3>Exact asset identity</h3></div></div><div class="identity-stat-grid">${fields.map(([k,v])=>stat(k,String(v))).join('')}</div></section>`;
  if(marketSection)marketSection.insertAdjacentHTML('beforebegin',html);else box.insertAdjacentHTML('beforeend',html);
}

function buildOutlook(c,rows){
  const prices=exactSoldPoints(rows).map(r=>r.price),d=c?.metadata?.valuation_details||{},n=Number(c?.valuation_sample_size||prices.length||0),fmv=Number(c?.current_price);
  const p10=Number.isFinite(Number(d.p10))?Number(d.p10):quantile(prices,.10),p25=Number.isFinite(Number(c?.valuation_low))?Number(c.valuation_low):(Number.isFinite(Number(d.p25))?Number(d.p25):quantile(prices,.25)),p75=Number.isFinite(Number(c?.valuation_high))?Number(c.valuation_high):(Number.isFinite(Number(d.p75))?Number(d.p75):quantile(prices,.75)),p90=Number.isFinite(Number(d.p90))?Number(d.p90):quantile(prices,.90);
  const base=c?.analyst_base||((Number.isFinite(fmv)&&n)?`Current fair value is ${usd(fmv)}, anchored by ${n} verified exact sold comp${n===1?'':'s'}. The middle 50% of accepted sales sits around ${usd(p25)}–${usd(p75)}.`:'Not enough verified exact sold evidence yet to form a base case.');
  const bull=c?.analyst_bull||((n>=3&&Number.isFinite(p75))?`Upside evidence is the upper part of the actual sold distribution: the 75th percentile is ${usd(p75)}${Number.isFinite(p90)?` and the 90th percentile is ${usd(p90)}`:''}. Sustained new exact sales above that band would support a higher reprice.`:'Not enough verified exact sold evidence yet to define an upside case.');
  const bear=c?.analyst_bear||((n>=3&&Number.isFinite(p25))?`Downside evidence is the lower part of the actual sold distribution: the 25th percentile is ${usd(p25)}${Number.isFinite(p10)?` and the 10th percentile is ${usd(p10)}`:''}. Sustained new exact sales below that band would support a lower reprice.`:'Not enough verified exact sold evidence yet to define a downside case.');
  return {bull,base,bear};
}

function scheduleDetailUpgrade(){clearTimeout(detailUpgradeTimer);detailUpgradeTimer=setTimeout(()=>{void enhanceCardDetail()},80)}

async function enhanceCardDetail(){
  const s=getState(),box=document.getElementById('cardDetailContent');if(!s?.supabase||!activeHoldingId||!box||!box.querySelector('.card-chart'))return;
  const holding=s.holdings?.find(h=>h.id===activeHoldingId);if(!holding?.canonical_card_id)return;
  const seq=++detailRequestSeq,marker=holding.canonical_card_id;if(box.dataset.marketEvidenceV3===marker)return;box.dataset.marketEvidenceV3='loading';
  try{
    const [{data:c,error:ce},{data:rows,error:oe}]=await Promise.all([
      s.supabase.from('canonical_cards').select('*').eq('id',holding.canonical_card_id).maybeSingle(),
      s.supabase.from('card_market_observations').select('price,currency,marketplace,source_kind,sold_at,observed_at,exact_match,provenance_url,title').eq('canonical_card_id',holding.canonical_card_id).eq('source_kind','sold').eq('exact_match',true).eq('currency','USD').order('observed_at',{ascending:true}).limit(300)
    ]);
    if(seq!==detailRequestSeq||!document.getElementById('cardDetailDialog')?.open)return;if(ce||oe)throw ce||oe;
    const chart=box.querySelector('.card-chart');if(chart){chart.outerHTML=soldObservationChart(rows||[]);wireObservationChart(box.querySelector('[data-observation-chart]'))}
    const canonical=c||holding._canonical||{};upgradeStats(box,canonical,rows||[]);upgradeCardFacts(box,canonical,holding);
    const outlook=buildOutlook(canonical,rows||[]),bull=box.querySelector('.analyst-card.bull p'),base=box.querySelector('.analyst-card.base p'),bear=box.querySelector('.analyst-card.bear p');
    if(bull)bull.textContent=outlook.bull;if(base)base.textContent=outlook.base;if(bear)bear.textContent=outlook.bear;
    const analyst=box.querySelector('.analyst-grid');if(analyst&&!box.querySelector('.analyst-evidence-note'))analyst.insertAdjacentHTML('afterend','<p class="holding-meta analyst-evidence-note">Outlook is separate from current fair value and is refreshed only from accepted exact-sale evidence and verified card context.</p>');
    const marketSection=[...box.querySelectorAll('.detail-section')].find(s=>/Market evidence/i.test(s.textContent||''));if(marketSection){const h3=marketSection.querySelector('h3');if(h3)h3.textContent='Market activity'}
    box.dataset.marketEvidenceV3=marker;
  }catch(err){console.warn('Cardfolio evidence-detail upgrade failed',err);delete box.dataset.marketEvidenceV3;}
}

async function refreshCloudMarket(){if(cloudRefreshBusy||document.hidden)return;const s=getState();if(!s?.supabase||!s?.user||typeof syncCloud!=='function')return;cloudRefreshBusy=true;try{await syncCloud();s.marketDetailCache?.clear?.();if(typeof render==='function')render();if(document.getElementById('cardDetailDialog')?.open){const box=document.getElementById('cardDetailContent');if(box){delete box.dataset.marketEvidenceV3;delete box.dataset.marketEvidenceV2}scheduleDetailUpgrade()}}catch(err){console.warn('Cardfolio live market refresh failed',err)}finally{cloudRefreshBusy=false}}

const observer=new MutationObserver(records=>{let detailChanged=false;for(const record of records){for(const node of record.addedNodes){if(node.nodeType!==1)continue;hardenActiveAskControls(node);if(node.querySelector?.('#useEbayMedian'))hardenActiveAskControls(node);if(node.id==='cardDetailContent'||node.matches?.('.card-chart,.analyst-grid')||node.querySelector?.('.card-chart,.analyst-grid'))detailChanged=true}}if(detailChanged)scheduleDetailUpgrade()});

function install(){
  hardenActiveAskControls();observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',event=>{const card=event.target.closest?.('[data-detail-card],.holding[data-card-id]');if(card){activeHoldingId=card.dataset.detailCard||card.dataset.cardId||null;const box=document.getElementById('cardDetailContent');if(box){delete box.dataset.marketEvidenceV3;delete box.dataset.marketEvidenceV2}scheduleDetailUpgrade()}const button=event.target.closest?.('#useEbayMedian');if(!button)return;event.preventDefault();event.stopImmediatePropagation();window.toast?.('Active asking prices are context only. Cardfolio requires verified sold comps for market value.')},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloudMarket()});window.setInterval(()=>{void refreshCloudMarket()},60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
