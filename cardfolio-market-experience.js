/* Cardfolio dense-sale chart readability layer.
   Presentation only: every plotted point is a genuine accepted sold observation. */
(function(){
'use strict';

let timer=null;
let requestSeq=0;

function appState(){try{return state}catch{return null}}
function esc(v=''){return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]))}
function usd(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—'}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function saleTime(r){const t=new Date(r?.sold_at||r?.observed_at||'').getTime();return Number.isFinite(t)?t:null}
function shortDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'})}
function longDate(t){return new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}

function installCss(){
  if(document.getElementById('cardfolio-readable-chart-css'))return;
  const style=document.createElement('style');style.id='cardfolio-readable-chart-css';style.textContent=`
  .cardfolio-readable-chart{position:relative;padding:16px 14px 8px;overflow:hidden;touch-action:pan-y;background:linear-gradient(145deg,rgba(255,255,255,.84),rgba(255,255,255,.54));border:1px solid rgba(255,255,255,.84);border-radius:28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.94),0 16px 44px rgba(40,70,100,.08)}
  .cardfolio-readable-chart .market-chart-readout{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:0 4px 2px}.cardfolio-readable-chart .market-chart-readout>div{display:flex;flex-direction:column;gap:1px}.cardfolio-readable-chart .market-chart-readout strong{font-size:26px;letter-spacing:-.03em;color:var(--text)}.cardfolio-readable-chart .market-chart-readout small,.cardfolio-readable-chart .market-chart-readout span{font-size:10px;color:var(--muted)}
  .cardfolio-readable-chart svg{display:block;width:100%;min-height:180px;height:auto;user-select:none;-webkit-user-select:none}.cardfolio-readable-chart .market-chart-grid{stroke:currentColor;opacity:.065}.cardfolio-readable-chart .market-price-line{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:none}.cardfolio-readable-chart .market-sale-dot{fill:var(--accent);opacity:.16;stroke:#fff;stroke-width:1.5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-sale-dot.selected{opacity:1;r:4.5}.cardfolio-readable-chart .market-chart-tracker{stroke:rgba(36,55,74,.38);stroke-width:1.2;stroke-dasharray:2 5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-chart-focus{fill:var(--accent);stroke:#fff;stroke-width:2.5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-chart-hit{touch-action:pan-y;cursor:crosshair}.cardfolio-readable-chart .market-chart-range{display:flex;justify-content:space-between;padding:0 4px 3px;color:var(--muted);font-size:10px}
  @media(max-width:520px){.cardfolio-readable-chart svg{min-height:166px}.cardfolio-readable-chart .market-chart-readout{flex-direction:column;gap:2px}.cardfolio-readable-chart .market-chart-readout span{text-align:left}}
  `;document.head.appendChild(style);
}

function exactSold(rows){
  return (rows||[]).filter(r=>r?.source_kind==='sold'&&r?.exact_match!==false&&String(r?.currency||'USD').toUpperCase()==='USD'&&Number(r?.price)>0&&saleTime(r)!==null)
    .map(r=>({price:Number(r.price),time:saleTime(r),marketplace:r.marketplace||'Market'})).sort((a,b)=>a.time-b.time||a.price-b.price);
}

/* Preserve chronological order and true endpoint dates while giving dense nearby
   sales a minimum touch target. The displayed readout always exposes the real sale time. */
function readableX(points,left,right){
  if(points.length===1)return [(left+right)/2];
  const t0=points[0].time,t1=points.at(-1).time,width=right-left;
  if(t0===t1)return points.map((_,i)=>left+i/(points.length-1)*width);
  const raw=points.map(p=>left+(p.time-t0)/(t1-t0)*width);
  const gap=Math.min(14,width/(points.length-1));
  const out=[raw[0]];
  for(let i=1;i<raw.length;i++)out[i]=Math.max(raw[i],out[i-1]+gap);
  if(out.at(-1)>right){const shift=out.at(-1)-right;for(let i=0;i<out.length;i++)out[i]-=shift}
  for(let i=out.length-2;i>=0;i--)out[i]=Math.min(out[i],out[i+1]-gap);
  if(out[0]<left){const shift=left-out[0];for(let i=0;i<out.length;i++)out[i]+=shift}
  return out.map(x=>clamp(x,left,right));
}

/* Midpoint Béziers are monotonic in x and cannot form the loops/overshoot that
   made clustered sales look like scribbles. */
function smoothPath(points){
  if(!points.length)return '';
  let d=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],mx=(a.x+b.x)/2;
    d+=` C ${mx.toFixed(2)} ${a.y.toFixed(2)}, ${mx.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return d;
}

function chartHtml(rows){
  const sales=exactSold(rows);
  if(!sales.length)return '<div class="card-chart cardfolio-readable-chart empty-chart"><span>No verified exact sold observations are available yet.</span></div>';
  const w=720,h=255,m={l:24,r:24,t:56,b:34};
  const prices=sales.map(x=>x.price),min=Math.min(...prices),max=Math.max(...prices),spread=max-min,pad=spread?Math.max(spread*.12,.18):Math.max(max*.08,.35),lo=Math.max(0,min-pad),hi=max+pad,span=Math.max(.01,hi-lo);
  const xs=readableX(sales,m.l,w-m.r),y=v=>m.t+(hi-v)/span*(h-m.t-m.b),points=sales.map((s,i)=>({...s,x:xs[i],y:y(s.price)})),latest=points.at(-1);
  const grid=[.2,.5,.8].map(f=>{const gy=m.t+(h-m.t-m.b)*f;return `<line x1="${m.l}" y1="${gy.toFixed(2)}" x2="${w-m.r}" y2="${gy.toFixed(2)}" class="market-chart-grid"/>`}).join('');
  const dots=points.map(p=>`<circle class="market-sale-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3" data-price="${p.price}" data-time="${p.time}" data-marketplace="${esc(p.marketplace)}"/>`).join('');
  return `<div class="card-chart cardfolio-readable-chart" data-readable-sale-chart><div class="market-chart-readout"><div><strong data-chart-price>${usd(latest.price)}</strong><small>${sales.length} verified sale${sales.length===1?'':'s'}</small></div><span data-chart-meta>${esc(longDate(latest.time))} · ${esc(latest.marketplace)}</span></div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Verified exact sold prices over time">${grid}<path d="${smoothPath(points)}" class="market-price-line" vector-effect="non-scaling-stroke"/>${dots}<line class="market-chart-tracker" data-chart-tracker x1="${latest.x}" x2="${latest.x}" y1="${m.t}" y2="${h-m.b}"/><circle class="market-chart-focus" data-chart-focus cx="${latest.x}" cy="${latest.y}" r="6.5"/><rect class="market-chart-hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/></svg><div class="market-chart-range"><span>${shortDate(sales[0].time)}</span><span>${shortDate(sales.at(-1).time)}</span></div></div>`;
}

function wireChart(root){
  if(!root||root.dataset.scrubberReady==='1')return;
  const svg=root.querySelector('svg'),hit=root.querySelector('.market-chart-hit'),tracker=root.querySelector('[data-chart-tracker]'),focus=root.querySelector('[data-chart-focus]'),price=root.querySelector('[data-chart-price]'),meta=root.querySelector('[data-chart-meta]');
  const dots=[...root.querySelectorAll('.market-sale-dot')].map(el=>({el,x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),price:Number(el.dataset.price),time:Number(el.dataset.time),marketplace:el.dataset.marketplace||'Market'}));
  if(!svg||!hit||!dots.length)return;root.dataset.scrubberReady='1';
  const select=p=>{tracker.setAttribute('x1',p.x);tracker.setAttribute('x2',p.x);focus.setAttribute('cx',p.x);focus.setAttribute('cy',p.y);dots.forEach(x=>x.el.classList.toggle('selected',x===p));price.textContent=usd(p.price);meta.textContent=`${longDate(p.time)} · ${p.marketplace}`};
  const choose=e=>{const r=svg.getBoundingClientRect();if(!r.width)return;const vb=svg.viewBox.baseVal,x=vb.x+clamp((e.clientX-r.left)/r.width,0,1)*vb.width;let best=dots[0];for(const d of dots)if(Math.abs(d.x-x)<Math.abs(best.x-x))best=d;select(best)};
  select(dots.at(-1));
  hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});
  hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});
  hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void enhance(),140)}
async function enhance(){
  const st=appState(),box=document.getElementById('cardDetailContent'),dialog=document.getElementById('cardDetailDialog');
  if(!st?.supabase||!box||!dialog?.open)return;
  const holdingId=box.querySelector('[data-detail-edit]')?.dataset.detailEdit,holding=st.holdings?.find(h=>h.id===holdingId);
  if(!holding?.canonical_card_id)return;
  const seq=++requestSeq;
  try{
    const {data:rows,error}=await st.supabase.from('card_market_observations').select('price,currency,marketplace,source_kind,sold_at,observed_at,exact_match').eq('canonical_card_id',holding.canonical_card_id).eq('source_kind','sold').eq('exact_match',true).eq('currency','USD').order('observed_at',{ascending:true}).limit(300);
    if(error||seq!==requestSeq||!dialog.open)return;
    const current=box.querySelector('.card-chart');
    if(current&&!current.matches('[data-readable-sale-chart]'))current.outerHTML=chartHtml(rows||[]);
    wireChart(box.querySelector('[data-readable-sale-chart]'));
  }catch{}
}

function install(){
  installCss();schedule();
  const observer=new MutationObserver(records=>{for(const r of records)for(const node of r.addedNodes)if(node.nodeType===1&&(node.id==='cardDetailContent'||node.matches?.('.card-chart')||node.querySelector?.('.card-chart'))){schedule();return}});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-detail-card],.holding[data-card-id]'))schedule()},true);
  document.addEventListener('cardfolio:cloud-refreshed',schedule);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
