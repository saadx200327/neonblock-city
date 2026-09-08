/* Cardfolio card-local market experience.
   UI-only: canonical pricing remains server-authoritative; active asks never become FMV. */
(function(){
'use strict';

let activeHoldingId=null;
let enhanceTimer=null;
let requestSeq=0;

function s(){try{return state}catch{return null}}
function esc(v=''){return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]))}
function usd(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—'}
function num(v){const n=Number(v);return v!==null&&v!==undefined&&v!==''&&Number.isFinite(n)?n:null}
function saleTime(r){const t=new Date(r?.sold_at||r?.observed_at||'').getTime();return Number.isFinite(t)?t:null}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function shortDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'})}
function longDate(t){return new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function safeUrl(v=''){try{const u=new URL(String(v),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}}
function holdingPrice(h,c=h?._canonical){for(const v of [c?.current_price,h?.market_value,h?.manual_value]){const n=num(v);if(n!==null)return n}return null}
function toastMsg(m){try{window.toast?.(m)}catch{}}

function installCss(){
  if(document.getElementById('cardfolio-market-experience-css'))return;
  const style=document.createElement('style');style.id='cardfolio-market-experience-css';style.textContent=`
  .cardfolio-readable-chart{position:relative;padding:16px 14px 8px;overflow:hidden;touch-action:pan-y;background:linear-gradient(145deg,rgba(255,255,255,.84),rgba(255,255,255,.54));border:1px solid rgba(255,255,255,.84);border-radius:28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.94),0 16px 44px rgba(40,70,100,.08)}
  .cardfolio-readable-chart .market-chart-readout{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:0 4px 2px}.cardfolio-readable-chart .market-chart-readout>div{display:flex;flex-direction:column;gap:1px}.cardfolio-readable-chart .market-chart-readout strong{font-size:26px;letter-spacing:-.03em;color:var(--text)}.cardfolio-readable-chart .market-chart-readout small,.cardfolio-readable-chart .market-chart-readout span{font-size:10px;color:var(--muted)}
  .cardfolio-readable-chart svg{display:block;width:100%;min-height:180px;height:auto;user-select:none;-webkit-user-select:none}.cardfolio-readable-chart .market-chart-grid{stroke:currentColor;opacity:.065}.cardfolio-readable-chart .market-price-line{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.cardfolio-readable-chart .market-sale-dot{fill:var(--accent);opacity:.16;stroke:#fff;stroke-width:1.5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-sale-dot.selected{opacity:1;r:4.5}.cardfolio-readable-chart .market-chart-tracker{stroke:rgba(36,55,74,.38);stroke-width:1.2;stroke-dasharray:2 5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-chart-focus{fill:var(--accent);stroke:#fff;stroke-width:2.5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-chart-hit{touch-action:pan-y}.cardfolio-readable-chart .market-chart-range{display:flex;justify-content:space-between;padding:0 4px 3px;color:var(--muted);font-size:10px}
  .card-market-button{appearance:none;border:1px solid rgba(54,77,102,.12);background:rgba(255,255,255,.8);box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 8px 22px rgba(28,52,79,.08);border-radius:999px;padding:10px 15px;font:800 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--text);cursor:pointer}
  .active-market-shell{margin-top:18px;padding-top:18px;border-top:1px solid rgba(71,91,112,.10)}.active-market-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.active-market-heading>div{display:flex;flex-direction:column;gap:3px}.active-market-heading small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800}.active-market-heading strong{font-size:16px;color:var(--text)}.active-market-heading>span{font-size:10px;color:var(--muted);text-align:right}
  .active-market-loading,.active-market-empty{padding:17px;border-radius:20px;background:rgba(255,255,255,.52);border:1px solid rgba(255,255,255,.74);color:var(--muted);font-size:12px}.active-market-empty p{margin:0 0 12px}.embedded-market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.embedded-market-listing{display:flex;flex-direction:column;gap:12px;padding:12px;border-radius:22px;background:rgba(255,255,255,.68);border:1px solid rgba(255,255,255,.86);box-shadow:inset 0 1px 0 rgba(255,255,255,.92),0 10px 28px rgba(35,60,86,.07);min-width:0}.embedded-listing-main{display:grid;grid-template-columns:80px minmax(0,1fr);gap:12px;align-items:center}.embedded-listing-main img,.embedded-listing-placeholder{width:80px;height:80px;border-radius:16px;object-fit:cover;background:rgba(225,232,239,.8)}.embedded-listing-placeholder{display:grid;place-items:center;font-size:11px;font-weight:800;color:var(--muted)}.embedded-listing-copy{display:flex;flex-direction:column;gap:5px;min-width:0}.embedded-listing-copy strong{font-size:12px;line-height:1.3;color:var(--text);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.embedded-listing-copy span{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.embedded-listing-copy b{font-size:16px;color:var(--text)}
  .embedded-listing-actions{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:8px}.listing-ebay-button,.listing-copy-card{min-height:48px;border-radius:15px;border:1px solid rgba(50,73,98,.10);font:800 11px/1.05 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}.listing-ebay-button{background:#111827;color:#fff;padding:0 14px}.listing-copy-card{background:rgba(255,255,255,.94);color:var(--text);padding:0 7px;text-align:center;letter-spacing:.04em}.active-market-note{margin:10px 2px 0;font-size:10px;line-height:1.45;color:var(--muted)}.market-fallback-actions{max-width:440px}
  @media(max-width:840px){.embedded-market-grid{grid-template-columns:1fr}.active-market-heading{align-items:flex-start;flex-direction:column;gap:4px}.active-market-heading>span{text-align:left}.embedded-listing-main{grid-template-columns:72px minmax(0,1fr)}.embedded-listing-main img,.embedded-listing-placeholder{width:72px;height:72px}}
  @media(max-width:420px){.cardfolio-readable-chart svg{min-height:166px}.embedded-listing-actions{grid-template-columns:minmax(0,1fr) 74px}.listing-ebay-button,.listing-copy-card{min-height:46px}}
  `;
  document.head.appendChild(style);
}

function exactSold(rows){
  return (rows||[]).filter(r=>r?.source_kind==='sold'&&r?.exact_match!==false&&String(r?.currency||'USD').toUpperCase()==='USD'&&Number(r?.price)>0&&saleTime(r)!==null)
    .map(r=>({price:Number(r.price),time:saleTime(r),marketplace:r.marketplace||'Market'})).sort((a,b)=>a.time-b.time||a.price-b.price);
}
function timelineX(points,left,right){
  if(points.length===1)return [(left+right)/2];
  const t0=points[0].time,t1=points.at(-1).time,w=right-left;
  if(t0===t1)return points.map((_,i)=>left+i/(points.length-1)*w);
  const raw=points.map(p=>left+(p.time-t0)/(t1-t0)*w),gap=Math.min(14,w/(points.length-1)),x=[raw[0]];
  for(let i=1;i<raw.length;i++)x[i]=Math.max(raw[i],x[i-1]+gap);
  if(x.at(-1)>right){const d=x.at(-1)-right;for(let i=0;i<x.length;i++)x[i]-=d}
  for(let i=x.length-2;i>=0;i--)x[i]=Math.min(x[i],x[i+1]-gap);
  if(x[0]<left){const d=left-x[0];for(let i=0;i<x.length;i++)x[i]+=d}
  return x.map(v=>clamp(v,left,right));
}
function smoothPath(points){
  if(!points.length)return '';
  let d=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],m=(a.x+b.x)/2;d+=` C ${m.toFixed(2)} ${a.y.toFixed(2)}, ${m.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`}
  return d;
}
function chartHtml(rows){
  const p=exactSold(rows);if(!p.length)return '<div class="card-chart cardfolio-readable-chart empty-chart"><span>No verified exact sold observations are available yet.</span></div>';
  const w=720,h=255,m={l:24,r:24,t:56,b:34},prices=p.map(x=>x.price),mn=Math.min(...prices),mx=Math.max(...prices),spread=mx-mn,pad=spread?Math.max(spread*.12,.18):Math.max(mx*.08,.35),lo=Math.max(0,mn-pad),hi=mx+pad,span=Math.max(.01,hi-lo),xs=timelineX(p,m.l,w-m.r),y=v=>m.t+(hi-v)/span*(h-m.t-m.b),pts=p.map((v,i)=>({...v,i,x:xs[i],y:y(v.price)})),last=pts.at(-1);
  const grid=[.2,.5,.8].map(f=>{const gy=m.t+(h-m.t-m.b)*f;return `<line x1="${m.l}" y1="${gy}" x2="${w-m.r}" y2="${gy}" class="market-chart-grid"/>`}).join('');
  const dots=pts.map(v=>`<circle class="market-sale-dot" cx="${v.x}" cy="${v.y}" r="3" data-price="${v.price}" data-time="${v.time}" data-marketplace="${esc(v.marketplace)}"/>`).join('');
  return `<div class="card-chart cardfolio-readable-chart" data-readable-sale-chart><div class="market-chart-readout"><div><strong data-chart-price>${usd(last.price)}</strong><small>${p.length} verified sale${p.length===1?'':'s'}</small></div><span data-chart-meta>${esc(longDate(last.time))} · ${esc(last.marketplace)}</span></div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Verified exact sold prices over time">${grid}<path d="${smoothPath(pts)}" class="market-price-line" vector-effect="non-scaling-stroke"/>${dots}<line class="market-chart-tracker" data-chart-tracker x1="${last.x}" x2="${last.x}" y1="${m.t}" y2="${h-m.b}"/><circle class="market-chart-focus" data-chart-focus cx="${last.x}" cy="${last.y}" r="6.5"/><rect class="market-chart-hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/></svg><div class="market-chart-range"><span>${shortDate(p[0].time)}</span><span>${shortDate(p.at(-1).time)}</span></div></div>`;
}
function wireChart(root){
  if(!root||root.dataset.ready)return;root.dataset.ready='1';
  const svg=root.querySelector('svg'),hit=root.querySelector('.market-chart-hit'),tracker=root.querySelector('[data-chart-tracker]'),focus=root.querySelector('[data-chart-focus]'),price=root.querySelector('[data-chart-price]'),meta=root.querySelector('[data-chart-meta]'),dots=[...root.querySelectorAll('.market-sale-dot')].map(el=>({el,x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),price:Number(el.dataset.price),time:Number(el.dataset.time),marketplace:el.dataset.marketplace||'Market'}));
  if(!svg||!hit||!dots.length)return;
  const select=p=>{tracker.setAttribute('x1',p.x);tracker.setAttribute('x2',p.x);focus.setAttribute('cx',p.x);focus.setAttribute('cy',p.y);dots.forEach(x=>x.el.classList.toggle('selected',x===p));price.textContent=usd(p.price);meta.textContent=`${longDate(p.time)} · ${p.marketplace}`};
  const choose=e=>{const r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,x=vb.x+clamp((e.clientX-r.left)/r.width,0,1)*vb.width;let best=dots[0];for(const d of dots)if(Math.abs(d.x-x)<Math.abs(best.x-x))best=d;select(best)};
  select(dots.at(-1));hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});
}

function identityText(h,c={}){
  return [c.subject||h.subject,c.year||h.year,c.manufacturer||h.manufacturer,c.brand||h.brand,c.set_name||h.set_name,(c.card_number||h.card_number)?`#${c.card_number||h.card_number}`:'',c.parallel||h.parallel,c.variant_name||h.variant_name,c.serial_number||h.serial_number,c.grading_company?`${c.grading_company} ${c.grade||''}`:(h.grading_company?`${h.grading_company} ${h.grade||''}`:''),(c.rookie??h.rookie)?'RC':'',(c.autograph??h.autograph)?'Autograph':'',(c.relic??h.relic)?'Relic':''].map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
}
function queryText(h,c={}){
  return [c.year||h.year,c.manufacturer||h.manufacturer,c.brand||h.brand,c.subject||h.subject,c.set_name||h.set_name,(c.card_number||h.card_number)?`#${c.card_number||h.card_number}`:'',c.parallel||h.parallel,c.variant_name||h.variant_name,c.grading_company||h.grading_company,c.grade||h.grade].map(v=>String(v||'').trim()).filter(Boolean).join(' ').slice(0,190);
}
async function copyCard(h,c={}){
  const text=identityText(h,c);if(!text)return;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}toastMsg('Card identity copied')}catch{toastMsg('Could not copy card')}
}
function ebaySearch(q){return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`}
function listingHtml(i){
  const url=safeUrl(i.url),img=safeUrl(i.image),price=String(i.currency||'USD').toUpperCase()==='USD'?usd(i.price):`${Number(i.price).toFixed(2)} ${esc(i.currency||'')}`;
  return `<article class="embedded-market-listing"><div class="embedded-listing-main">${img?`<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>`:'<div class="embedded-listing-placeholder">eBay</div>'}<div class="embedded-listing-copy"><strong>${esc(i.title||'eBay listing')}</strong><span>${esc(i.condition||'Active listing')}</span><b>${price}</b></div></div><div class="embedded-listing-actions"><a class="listing-ebay-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">View on eBay <span>↗</span></a><button type="button" class="listing-copy-card" data-copy-card>COPY<br/>CARD</button></div></article>`;
}
async function loadListings(area,h,c={},force=false){
  const body=area.querySelector('[data-active-body]'),q=queryText(h,c);if(!body||!q)return;
  if(!force&&area.dataset.query===q)return;area.dataset.query=q;body.innerHTML='<div class="active-market-loading">Loading live eBay listings…</div>';
  try{
    const r=await fetch('/api/ebay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q})}),data=await r.json().catch(()=>({}));
    if(r.ok&&data?.configured&&Array.isArray(data.items)&&data.items.length)body.innerHTML=`<div class="embedded-market-grid">${data.items.slice(0,6).map(listingHtml).join('')}</div><p class="active-market-note">Live asking-price listings from eBay for this card search. They do not set Cardfolio FMV or sold history.</p>`;
    else body.innerHTML=`<div class="active-market-empty"><p>${r.ok?'No live eBay listings returned for this search.':'Live eBay listings are unavailable right now.'}</p><div class="embedded-listing-actions market-fallback-actions"><a class="listing-ebay-button" href="${esc(ebaySearch(q))}" target="_blank" rel="noopener noreferrer">Search eBay <span>↗</span></a><button type="button" class="listing-copy-card" data-copy-card>COPY<br/>CARD</button></div></div>`;
  }catch{body.innerHTML=`<div class="active-market-empty"><p>Live eBay lookup failed. No price was substituted.</p><div class="embedded-listing-actions market-fallback-actions"><a class="listing-ebay-button" href="${esc(ebaySearch(q))}" target="_blank" rel="noopener noreferrer">Search eBay <span>↗</span></a><button type="button" class="listing-copy-card" data-copy-card>COPY<br/>CARD</button></div></div>`}
  body.querySelectorAll('[data-copy-card]').forEach(b=>b.addEventListener('click',()=>void copyCard(h,c)));
}
function marketUi(box,h,c={}){
  const sec=[...box.querySelectorAll('.detail-section')].find(x=>/Market evidence|Market activity/i.test(x.textContent||''));if(!sec)return;
  const head=sec.querySelector('.section-head'),h3=head?.querySelector('h3');if(h3)h3.textContent='Market activity';
  let btn=head?.querySelector('[data-card-market-button]');if(head&&!btn){head.insertAdjacentHTML('beforeend','<button type="button" class="card-market-button" data-card-market-button>Market</button>');btn=head.querySelector('[data-card-market-button]')}
  let area=sec.querySelector('[data-active-market]');if(!area){sec.insertAdjacentHTML('beforeend','<div class="active-market-shell" data-active-market><div class="active-market-heading"><div><small>Live marketplace</small><strong>Active eBay listings</strong></div><span>Asking prices · not sold comps</span></div><div data-active-body><div class="active-market-loading">Loading live listings…</div></div></div>');area=sec.querySelector('[data-active-market]')}
  if(btn&&!btn.dataset.ready){btn.dataset.ready='1';btn.addEventListener('click',()=>{void loadListings(area,h,c,true);area.scrollIntoView({behavior:'smooth',block:'nearest'})})}
  void loadListings(area,h,c,false);
}

function zeroUi(root=document){
  const st=s();if(!st?.holdings)return;
  const cards=[...(root.matches?.('[data-detail-card]')?[root]:[]),...(root.querySelectorAll?.('[data-detail-card]')||[])];
  for(const el of cards){const h=st.holdings.find(x=>x.id===el.dataset.detailCard);if(h&&holdingPrice(h)===null){const b=el.querySelector('.album-value b');if(b)b.textContent=usd(0)}}
  if(activeHoldingId){const h=st.holdings.find(x=>x.id===activeHoldingId),box=document.getElementById('cardDetailContent');if(h&&box&&holdingPrice(h)===null){const p=box.querySelector('.detail-price');if(p)p.textContent=usd(0);for(const span of box.querySelectorAll('.market-stats-v2>span')){if(/Fair market value/i.test(span.querySelector('small')?.textContent||'')){const b=span.querySelector('b');if(b)b.textContent=usd(0);let e=span.querySelector('em');if(!e){e=document.createElement('em');span.appendChild(e)}e.textContent='No accepted sold valuation yet'}}}}
}

function schedule(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>void enhance(),140)}
async function enhance(){
  const st=s(),box=document.getElementById('cardDetailContent'),dlg=document.getElementById('cardDetailDialog');if(!st?.supabase||!activeHoldingId||!box||!dlg?.open)return;
  const h=st.holdings?.find(x=>x.id===activeHoldingId);if(!h?.canonical_card_id)return;
  const seq=++requestSeq;
  try{
    const [{data:c,error:ce},{data:rows,error:re}]=await Promise.all([
      st.supabase.from('canonical_cards').select('*').eq('id',h.canonical_card_id).maybeSingle(),
      st.supabase.from('card_market_observations').select('price,currency,marketplace,source_kind,sold_at,observed_at,exact_match').eq('canonical_card_id',h.canonical_card_id).eq('source_kind','sold').eq('exact_match',true).eq('currency','USD').order('observed_at',{ascending:true}).limit(300)
    ]);
    if(seq!==requestSeq||!dlg.open||ce||re)return;
    const canonical=c||h._canonical||{},chart=box.querySelector('.cardfolio-readable-chart,.observation-chart,.card-chart');if(chart&&!chart.classList.contains('cardfolio-readable-chart'))chart.outerHTML=chartHtml(rows||[]);
    wireChart(box.querySelector('[data-readable-sale-chart]'));zeroUi(box);marketUi(box,h,canonical);
  }catch{}
}

function install(){
  installCss();zeroUi();
  const observer=new MutationObserver(records=>{let detail=false;for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){zeroUi(n);if(n.id==='cardDetailContent'||n.matches?.('.card-chart,.detail-section')||n.querySelector?.('.card-chart,.detail-section'))detail=true}if(detail)schedule()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{const card=e.target.closest?.('[data-detail-card],.holding[data-card-id]');if(card){activeHoldingId=card.dataset.detailCard||card.dataset.cardId||null;schedule()}},true);
  document.addEventListener('cardfolio:cloud-refreshed',()=>{zeroUi();schedule()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();