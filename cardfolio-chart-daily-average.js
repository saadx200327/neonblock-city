/* Cardfolio chart de-cluttering: one plotted point per calendar day.
   Multiple verified sold comps on the same displayed day are averaged for the chart only.
   Raw observations remain untouched for FMV, comp counts, liquidity, and analyst evidence. */
(function(){
'use strict';

const FLAG='cardfolioDailyAverageReady';
const SVG_NS='http://www.w3.org/2000/svg';

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function usd(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—'}
function displayDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function shortDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'})}
function localDayKey(t){const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function localDayAnchor(t){const d=new Date(t);return new Date(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0,0).getTime()}

function aggregateByDay(points){
  const groups=new Map();
  for(const point of points){
    const key=localDayKey(point.time);
    let group=groups.get(key);
    if(!group){group={key,time:localDayAnchor(point.time),sum:0,count:0,markets:new Set()};groups.set(key,group)}
    group.sum+=point.price;group.count+=1;if(point.marketplace)group.markets.add(point.marketplace);
  }
  return [...groups.values()].map(group=>{
    const markets=[...group.markets];
    return {time:group.time,price:group.sum/group.count,count:group.count,marketplace:markets.length===1?markets[0]:markets.length?`${markets.length} markets`:'Market'};
  }).sort((a,b)=>a.time-b.time);
}

/* Smooth through every daily-average point without spline overshoot or loops. */
function smoothPath(points){
  if(!points.length)return '';
  let d=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],mx=(a.x+b.x)/2;
    d+=` C ${mx.toFixed(2)} ${a.y.toFixed(2)}, ${mx.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return d;
}

function pointMeta(point){
  const sales=`${point.count} sale${point.count===1?'':'s'}${point.count>1?' avg':''}`;
  return `${displayDate(point.time)} · ${sales} · ${point.marketplace}`;
}

function processChart(chart){
  if(!chart||chart.dataset[FLAG]==='1')return;
  const raw=[...chart.querySelectorAll('.market-sale-dot')].map(el=>({
    price:Number(el.dataset.price),time:Number(el.dataset.time),marketplace:el.dataset.marketplace||'Market'
  })).filter(p=>Number.isFinite(p.price)&&p.price>0&&Number.isFinite(p.time));
  if(!raw.length)return;

  const daily=aggregateByDay(raw);
  if(!daily.length)return;

  /* Clone once so the old chart scrubber cannot keep references to removed raw dots. */
  const fresh=chart.cloneNode(true);
  chart.replaceWith(fresh);
  fresh.dataset[FLAG]='1';

  const svg=fresh.querySelector('svg'),path=fresh.querySelector('.market-price-line'),tracker=fresh.querySelector('[data-chart-tracker]'),focus=fresh.querySelector('[data-chart-focus]'),hit=fresh.querySelector('.market-chart-hit'),priceEl=fresh.querySelector('[data-chart-price]'),metaEl=fresh.querySelector('[data-chart-meta]');
  if(!svg||!path||!hit)return;

  const vb=svg.viewBox.baseVal,w=vb?.width||720,h=vb?.height||260,m={l:18,r:18,t:58,b:32};
  const prices=daily.map(p=>p.price),rawMin=Math.min(...prices),rawMax=Math.max(...prices),rawSpan=rawMax-rawMin;
  const pad=rawSpan>0?Math.max(rawSpan*.14,.18):Math.max(rawMax*.08,.35);
  const yMin=Math.max(0,rawMin-pad),yMax=rawMax+pad,ySpan=Math.max(.01,yMax-yMin);
  const tMin=daily[0].time,tMax=daily[daily.length-1].time,tSpan=tMax-tMin;
  const x=t=>tSpan>0?m.l+(t-tMin)/tSpan*(w-m.l-m.r):(m.l+w-m.r)/2;
  const y=v=>m.t+(yMax-v)/ySpan*(h-m.t-m.b);
  const plotted=daily.map((p,i)=>({...p,i,x:x(p.time),y:y(p.price)}));
  const latest=plotted[plotted.length-1];

  path.setAttribute('d',smoothPath(plotted));
  svg.setAttribute('aria-label','Daily average of verified exact sold prices over time');
  fresh.querySelectorAll('.market-sale-dot').forEach(el=>el.remove());

  for(const p of plotted){
    const dot=document.createElementNS(SVG_NS,'circle');
    dot.setAttribute('class','market-sale-dot');dot.setAttribute('cx',p.x.toFixed(2));dot.setAttribute('cy',p.y.toFixed(2));dot.setAttribute('r','3.2');
    dot.dataset.saleIndex=String(p.i);dot.dataset.price=String(p.price);dot.dataset.time=String(p.time);dot.dataset.marketplace=p.marketplace;dot.dataset.saleCount=String(p.count);
    svg.insertBefore(dot,tracker||focus||hit);
    p.el=dot;
  }

  const range=fresh.querySelector('.market-chart-range');
  if(range)range.innerHTML=daily.length>1?`<span>${shortDate(tMin)}</span><span>${shortDate(tMax)}</span>`:`<span>${shortDate(tMin)}</span>`;

  const select=point=>{
    tracker?.setAttribute('x1',point.x);tracker?.setAttribute('x2',point.x);focus?.setAttribute('cx',point.x);focus?.setAttribute('cy',point.y);
    for(const p of plotted)p.el.classList.toggle('selected',p===point);
    if(priceEl)priceEl.textContent=usd(point.price);if(metaEl)metaEl.textContent=pointMeta(point);
  };
  select(latest);

  const choose=e=>{
    const rect=svg.getBoundingClientRect();if(!rect.width)return;
    const current=svg.viewBox.baseVal,px=current.x+clamp((e.clientX-rect.left)/rect.width,0,1)*current.width;
    let nearest=plotted[0],best=Math.abs(nearest.x-px);
    for(let i=1;i<plotted.length;i++){const distance=Math.abs(plotted[i].x-px);if(distance<best){best=distance;nearest=plotted[i]}}
    select(nearest);
  };
  hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});
  hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});
  hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});
  hit.addEventListener('pointercancel',()=>select(latest));
}

function scan(root=document){
  if(root?.matches?.('[data-observation-chart]'))processChart(root);
  root?.querySelectorAll?.('[data-observation-chart]').forEach(processChart);
}

const observer=new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)scan(node);
});

function install(){scan();observer.observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();