/* Cardfolio market-integrity guard + evidence-detail upgrade.
   Active marketplace asking prices are context only. They must never become a
   holding or canonical market valuation; only verified sold evidence may price
   shared assets through the server-side canonical repricer. */
(function(){
'use strict';

let activeHoldingId=null;
let detailUpgradeTimer=null;
let detailRequestSeq=0;
let cloudRefreshBusy=false;

function getState(){try{return state}catch(_){return null}}
function usd(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—'}
function esc(v=''){return String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function quantile(values,q){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;if(a.length===1)return a[0];
  const pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos),f=pos-lo;return a[lo]+(a[hi]-a[lo])*f;
}
function saleTime(row){const raw=row?.sold_at||row?.observed_at;const t=raw?new Date(raw).getTime():NaN;return Number.isFinite(t)?t:null}

function hardenActiveAskControls(root=document){
  const button = root.querySelector?.('#useEbayMedian') || document.getElementById('useEbayMedian');
  if(!button || button.dataset.cardfolioMarketGuard === '1') return;
  button.dataset.cardfolioMarketGuard = '1';
  button.disabled = true;
  button.setAttribute('aria-disabled','true');
  button.textContent = 'Active ask · context only';
  button.title = 'Active asking prices do not set Cardfolio market value. Verified sold comps are required.';

  const note = button.closest('.button-row')?.nextElementSibling;
  if(note && note.classList.contains('holding-meta')){
    note.textContent = 'Active asking prices are shown only as market context. They never change portfolio or canonical market value.';
  }
}

function soldObservationChart(rows){
  const points=(rows||[])
    .filter(r=>r?.source_kind==='sold'&&r?.exact_match!==false&&String(r?.currency||'USD').toUpperCase()==='USD'&&Number(r?.price)>0&&saleTime(r)!==null)
    .map(r=>({price:Number(r.price),time:saleTime(r),marketplace:r.marketplace||'Market'}))
    .sort((a,b)=>a.time-b.time);
  if(!points.length)return '<div class="card-chart empty-chart"><span>No verified sold observations are available yet.</span></div>';

  const w=720,h=270,m={l:74,r:18,t:18,b:54};
  const prices=points.map(p=>p.price),rawMin=Math.min(...prices),rawMax=Math.max(...prices),rawSpan=rawMax-rawMin;
  const pad=rawSpan>0?Math.max(rawSpan*.10,.25):Math.max(rawMax*.08,.50);
  const yMin=Math.max(0,rawMin-pad),yMax=rawMax+pad,ySpan=Math.max(.01,yMax-yMin);
  const tMin=Math.min(...points.map(p=>p.time)),tMax=Math.max(...points.map(p=>p.time)),tSpan=Math.max(1,tMax-tMin);
  const x=t=>m.l+(t-tMin)/tSpan*(w-m.l-m.r),y=v=>m.t+(yMax-v)/ySpan*(h-m.t-m.b);
  const yTicks=Array.from({length:5},(_,i)=>yMin+(yMax-yMin)*(4-i)/4);
  const xTimes=tMin===tMax?[tMin]:[tMin,tMin+tSpan/2,tMax];
  const xLabel=t=>new Date(t).toLocaleDateString(undefined,{month:'numeric',day:'numeric',year:tMax-tMin>300*86400000?'2-digit':undefined});
  const line=points.map(p=>`${x(p.time).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const grids=yTicks.map(v=>`<line x1="${m.l}" y1="${y(v).toFixed(1)}" x2="${w-m.r}" y2="${y(v).toFixed(1)}" stroke="currentColor" opacity=".10"/><text x="${m.l-10}" y="${(y(v)+4).toFixed(1)}" text-anchor="end" font-size="12" fill="currentColor" opacity=".65">${esc(usd(v))}</text>`).join('');
  const xt=xTimes.map((t,i)=>`<line x1="${x(t).toFixed(1)}" y1="${h-m.b}" x2="${x(t).toFixed(1)}" y2="${h-m.b+5}" stroke="currentColor" opacity=".35"/><text x="${x(t).toFixed(1)}" y="${h-m.b+22}" text-anchor="${i===0?'start':i===xTimes.length-1?'end':'middle'}" font-size="12" fill="currentColor" opacity=".65">${esc(xLabel(t))}</text>`).join('');
  const dots=points.map(p=>`<circle cx="${x(p.time).toFixed(1)}" cy="${y(p.price).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="white" stroke-width="1.5"><title>${esc(p.marketplace)} · ${esc(new Date(p.time).toLocaleString())} · ${esc(usd(p.price))}</title></circle>`).join('');
  return `<div class="card-chart observation-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${points.length} verified sold price observations over time" style="display:block;width:100%;height:auto;overflow:visible"><g>${grids}</g><line x1="${m.l}" y1="${h-m.b}" x2="${w-m.r}" y2="${h-m.b}" stroke="currentColor" opacity=".30"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h-m.b}" stroke="currentColor" opacity=".30"/>${xt}${points.length>1?`<polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" opacity=".38" vector-effect="non-scaling-stroke"/>`:''}${dots}<text x="${(m.l+w-m.r)/2}" y="${h-6}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" opacity=".68">Time</text><text x="16" y="${(m.t+h-m.b)/2}" text-anchor="middle" transform="rotate(-90 16 ${(m.t+h-m.b)/2})" font-size="12" font-weight="700" fill="currentColor" opacity=".68">Price (USD)</text></svg><div class="chart-evidence-caption">${points.length} exact sold observation${points.length===1?'':'s'} · each dot is a real recorded sale</div></div>`;
}

function buildOutlook(c,rows){
  const prices=(rows||[]).filter(r=>r?.source_kind==='sold'&&r?.exact_match!==false&&Number(r?.price)>0).map(r=>Number(r.price));
  const d=c?.metadata?.valuation_details||{};
  const n=Number(c?.valuation_sample_size||prices.length||0);
  const fmv=Number(c?.current_price);
  const p10=Number.isFinite(Number(d.p10))?Number(d.p10):quantile(prices,.10);
  const p25=Number.isFinite(Number(c?.valuation_low))?Number(c.valuation_low):(Number.isFinite(Number(d.p25))?Number(d.p25):quantile(prices,.25));
  const p75=Number.isFinite(Number(c?.valuation_high))?Number(c.valuation_high):(Number.isFinite(Number(d.p75))?Number(d.p75):quantile(prices,.75));
  const p90=Number.isFinite(Number(d.p90))?Number(d.p90):quantile(prices,.90);
  const base=c?.analyst_base||((Number.isFinite(fmv)&&n)?`Current fair value is ${usd(fmv)}, anchored by ${n} verified exact sold comp${n===1?'':'s'}. The middle 50% of accepted sales sits around ${usd(p25)}–${usd(p75)}.`:'Not enough verified exact sold evidence yet to form a base case.');
  const bull=c?.analyst_bull||((n>=3&&Number.isFinite(p75))?`Upside evidence is the upper part of the actual sold distribution: the 75th percentile is ${usd(p75)}${Number.isFinite(p90)?` and the 90th percentile is ${usd(p90)}`:''}. Sustained new exact sales above that band would support a higher reprice.`:'Not enough verified exact sold evidence yet to define an upside case.');
  const bear=c?.analyst_bear||((n>=3&&Number.isFinite(p25))?`Downside evidence is the lower part of the actual sold distribution: the 25th percentile is ${usd(p25)}${Number.isFinite(p10)?` and the 10th percentile is ${usd(p10)}`:''}. Sustained new exact sales below that band would support a lower reprice.`:'Not enough verified exact sold evidence yet to define a downside case.');
  return {bull,base,bear};
}

function scheduleDetailUpgrade(){
  clearTimeout(detailUpgradeTimer);
  detailUpgradeTimer=setTimeout(()=>{void enhanceCardDetail()},80);
}

async function enhanceCardDetail(){
  const s=getState(),box=document.getElementById('cardDetailContent');
  if(!s?.supabase||!activeHoldingId||!box||!box.querySelector('.card-chart'))return;
  const holding=s.holdings?.find(h=>h.id===activeHoldingId);if(!holding?.canonical_card_id)return;
  const seq=++detailRequestSeq,marker=holding.canonical_card_id;
  if(box.dataset.marketEvidenceV2===marker)return;
  box.dataset.marketEvidenceV2='loading';
  try{
    const [{data:c,error:ce},{data:rows,error:oe}]=await Promise.all([
      s.supabase.from('canonical_cards').select('*').eq('id',holding.canonical_card_id).maybeSingle(),
      s.supabase.from('card_market_observations').select('price,currency,marketplace,source_kind,sold_at,observed_at,exact_match').eq('canonical_card_id',holding.canonical_card_id).eq('source_kind','sold').eq('exact_match',true).eq('currency','USD').order('observed_at',{ascending:true}).limit(200)
    ]);
    if(seq!==detailRequestSeq||!document.getElementById('cardDetailDialog')?.open)return;
    if(ce||oe)throw ce||oe;
    const chart=box.querySelector('.card-chart');if(chart)chart.outerHTML=soldObservationChart(rows||[]);
    const outlook=buildOutlook(c||holding._canonical||{},rows||[]);
    const bull=box.querySelector('.analyst-card.bull p'),base=box.querySelector('.analyst-card.base p'),bear=box.querySelector('.analyst-card.bear p');
    if(bull)bull.textContent=outlook.bull;if(base)base.textContent=outlook.base;if(bear)bear.textContent=outlook.bear;
    const analyst=box.querySelector('.analyst-grid');
    if(analyst&&!box.querySelector('.analyst-evidence-note'))analyst.insertAdjacentHTML('afterend','<p class="holding-meta analyst-evidence-note">Outlook scenarios are generated from verified exact sold observations and update as new sales are accepted.</p>');
    box.dataset.marketEvidenceV2=marker;
  }catch(err){console.warn('Cardfolio evidence-detail upgrade failed',err);delete box.dataset.marketEvidenceV2;}
}

async function refreshCloudMarket(){
  if(cloudRefreshBusy||document.hidden)return;
  const s=getState();if(!s?.supabase||!s?.user||typeof syncCloud!=='function')return;
  cloudRefreshBusy=true;
  try{
    await syncCloud();
    s.marketDetailCache?.clear?.();
    if(typeof render==='function')render();
    if(document.getElementById('cardDetailDialog')?.open){const box=document.getElementById('cardDetailContent');if(box)delete box.dataset.marketEvidenceV2;scheduleDetailUpgrade();}
  }catch(err){console.warn('Cardfolio live market refresh failed',err)}finally{cloudRefreshBusy=false}
}

const observer = new MutationObserver((records)=>{
  let detailChanged=false;
  for(const record of records){
    for(const node of record.addedNodes){
      if(node.nodeType !== 1) continue;
      hardenActiveAskControls(node);
      if(node.querySelector?.('#useEbayMedian')) hardenActiveAskControls(node);
      if(node.id==='cardDetailContent'||node.matches?.('.card-chart,.analyst-grid')||node.querySelector?.('.card-chart,.analyst-grid'))detailChanged=true;
    }
  }
  if(detailChanged)scheduleDetailUpgrade();
});

function install(){
  hardenActiveAskControls();
  observer.observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener('click',(event)=>{
    const card=event.target.closest?.('[data-detail-card],.holding[data-card-id]');
    if(card){
      activeHoldingId=card.dataset.detailCard||card.dataset.cardId||null;
      const box=document.getElementById('cardDetailContent');if(box)delete box.dataset.marketEvidenceV2;
      scheduleDetailUpgrade();
    }
    const button = event.target.closest?.('#useEbayMedian');
    if(!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.toast?.('Active asking prices are context only. Cardfolio requires verified sold comps for market value.');
  },true);

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloudMarket()});
  window.setInterval(()=>{void refreshCloudMarket()},60000);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
