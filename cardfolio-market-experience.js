/* Cardfolio card-detail market experience.
   Presentation/read-only: canonical valuation remains server-authoritative and active asks never become FMV. */
(function(){
'use strict';

let timer=null;
let requestSeq=0;
const listingCache=new Map();

function appState(){try{return state}catch{return null}}
function esc(v=''){return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]))}
function usd(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—'}
function numeric(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function saleTime(r){const t=new Date(r?.sold_at||r?.observed_at||'').getTime();return Number.isFinite(t)?t:null}
function shortDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'})}
function longDate(t){return new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function currentPrice(h,c={}){for(const v of [c?.current_price,h?.market_value,h?.manual_value])if(numeric(v))return Number(v);return null}
function safeEbayUrl(raw=''){try{const u=new URL(String(raw));const host=u.hostname.toLowerCase();return u.protocol==='https:'&&(host==='ebay.com'||host.endsWith('.ebay.com'))?u.href:''}catch{return ''}}
function safeImageUrl(raw=''){try{const u=new URL(String(raw));return u.protocol==='https:'?u.href:''}catch{return ''}}
function toastMsg(message){try{if(typeof toast==='function')return toast(message)}catch{}const el=document.getElementById('toast');if(el){el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}}

function installCss(){
  if(document.getElementById('cardfolio-market-experience-css'))return;
  const style=document.createElement('style');style.id='cardfolio-market-experience-css';style.textContent=`
  .cardfolio-readable-chart{position:relative;padding:16px 14px 8px;overflow:hidden;touch-action:pan-y;background:linear-gradient(145deg,rgba(255,255,255,.84),rgba(255,255,255,.54));border:1px solid rgba(255,255,255,.84);border-radius:28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.94),0 16px 44px rgba(40,70,100,.08)}
  .cardfolio-readable-chart .market-chart-readout{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:0 4px 2px}.cardfolio-readable-chart .market-chart-readout>div{display:flex;flex-direction:column;gap:1px}.cardfolio-readable-chart .market-chart-readout strong{font-size:26px;letter-spacing:-.03em;color:var(--text)}.cardfolio-readable-chart .market-chart-readout small,.cardfolio-readable-chart .market-chart-readout span{font-size:10px;color:var(--muted)}
  .cardfolio-readable-chart svg{display:block;width:100%;min-height:180px;height:auto;user-select:none;-webkit-user-select:none}.cardfolio-readable-chart .market-chart-grid{stroke:currentColor;opacity:.065}.cardfolio-readable-chart .market-price-line{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:none}.cardfolio-readable-chart .market-sale-dot{fill:var(--accent);opacity:.16;stroke:#fff;stroke-width:1.5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-sale-dot.selected{opacity:1;r:4.5}.cardfolio-readable-chart .market-chart-tracker{stroke:rgba(36,55,74,.38);stroke-width:1.2;stroke-dasharray:2 5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-chart-focus{fill:var(--accent);stroke:#fff;stroke-width:2.5;vector-effect:non-scaling-stroke}.cardfolio-readable-chart .market-chart-hit{touch-action:pan-y;cursor:crosshair}.cardfolio-readable-chart .market-chart-range{display:flex;justify-content:space-between;padding:0 4px 3px;color:var(--muted);font-size:10px}
  .active-market-shell{margin-top:18px;padding-top:18px;border-top:1px solid rgba(76,105,136,.10);scroll-margin-top:18px}.active-market-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:11px;padding:0 2px}.active-market-heading span{display:block;font-size:9px;font-weight:850;letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}.active-market-heading strong{display:block;margin-top:3px;font-size:17px;letter-spacing:-.02em;color:var(--text)}.active-market-heading small{font-size:10px;color:var(--muted);text-align:right}
  .embedded-market-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(230px,80%);gap:11px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 12px;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch}.embedded-market-strip::-webkit-scrollbar{height:4px}.embedded-market-strip::-webkit-scrollbar-thumb{background:rgba(80,104,128,.18);border-radius:99px}.embedded-market-listing{scroll-snap-align:start;display:flex;flex-direction:column;min-width:0;border:1px solid rgba(72,106,140,.12);border-radius:20px;background:rgba(255,255,255,.66);overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.88)}.embedded-listing-main{display:grid;grid-template-columns:78px minmax(0,1fr);gap:11px;padding:11px}.embedded-listing-main img,.embedded-listing-placeholder{width:78px;height:96px;border-radius:14px;object-fit:cover;background:rgba(120,140,160,.09);display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--muted)}.embedded-listing-copy{min-width:0;display:flex;flex-direction:column;align-items:flex-start}.embedded-listing-copy strong{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:1.25;color:var(--text)}.embedded-listing-copy span{margin-top:6px;font-size:10px;color:var(--muted)}.embedded-listing-copy b{margin-top:auto;padding-top:8px;font-size:16px;color:var(--text)}
  .embedded-listing-actions{display:grid;grid-template-columns:minmax(0,1fr) 82px;gap:8px;padding:0 10px 10px}.listing-ebay-button,.listing-copy-card{min-height:46px;border-radius:14px;border:1px solid rgba(72,106,140,.13);font:800 10px/1.05 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.045em;text-decoration:none;display:flex;align-items:center;justify-content:center;cursor:pointer;box-sizing:border-box}.listing-ebay-button{padding:0 13px;background:rgba(19,25,34,.95);color:#fff;gap:7px}.listing-copy-card{padding:0 7px;background:rgba(255,255,255,.88);color:var(--text);text-align:center}.listing-ebay-button:active,.listing-copy-card:active{transform:scale(.985)}
  .active-market-note,.active-market-loading,.active-market-empty{font-size:10px;line-height:1.45;color:var(--muted)}.active-market-note{padding:0 3px 4px}.active-market-loading,.active-market-empty{padding:14px;border-radius:17px;background:rgba(255,255,255,.50);border:1px solid rgba(255,255,255,.72)}.market-fallback-actions{max-width:430px;margin-top:11px}
  @media(max-width:520px){.cardfolio-readable-chart svg{min-height:166px}.cardfolio-readable-chart .market-chart-readout{flex-direction:column;gap:2px}.cardfolio-readable-chart .market-chart-readout span{text-align:left}.active-market-heading{align-items:flex-start;flex-direction:column;gap:3px}.active-market-heading small{text-align:left}.embedded-market-strip{grid-auto-columns:88%}.embedded-listing-actions{grid-template-columns:minmax(0,1fr) 78px}}
  `;document.head.appendChild(style);
}

function exactSold(rows){
  return (rows||[]).filter(r=>r?.source_kind==='sold'&&r?.exact_match!==false&&String(r?.currency||'USD').toUpperCase()==='USD'&&Number(r?.price)>0&&saleTime(r)!==null)
    .map(r=>({price:Number(r.price),time:saleTime(r),marketplace:r.marketplace||'Market'})).sort((a,b)=>a.time-b.time||a.price-b.price);
}

/* Keep chronology and real endpoint dates, but guarantee enough horizontal room
   for clustered sales to remain selectable instead of collapsing into a scribble. */
function readableX(points,left,right){
  if(points.length===1)return [(left+right)/2];
  const t0=points[0].time,t1=points.at(-1).time,width=right-left;
  if(t0===t1)return points.map((_,i)=>left+i/(points.length-1)*width);
  const raw=points.map(p=>left+(p.time-t0)/(t1-t0)*width),gap=Math.min(14,width/(points.length-1)),out=[raw[0]];
  for(let i=1;i<raw.length;i++)out[i]=Math.max(raw[i],out[i-1]+gap);
  if(out.at(-1)>right){const shift=out.at(-1)-right;for(let i=0;i<out.length;i++)out[i]-=shift}
  for(let i=out.length-2;i>=0;i--)out[i]=Math.min(out[i],out[i+1]-gap);
  if(out[0]<left){const shift=left-out[0];for(let i=0;i<out.length;i++)out[i]+=shift}
  return out.map(x=>clamp(x,left,right));
}

/* Midpoint Béziers stay monotonic in x and between the two adjacent sale prices,
   preventing the loop/overshoot artifacts produced by generic spline smoothing. */
function smoothPath(points){
  if(!points.length)return '';
  let d=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mx=(a.x+b.x)/2;d+=` C ${mx.toFixed(2)} ${a.y.toFixed(2)}, ${mx.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`}
  return d;
}

function chartHtml(rows){
  const sales=exactSold(rows);
  if(!sales.length)return '<div class="card-chart cardfolio-readable-chart empty-chart"><span>No verified exact sold observations are available yet.</span></div>';
  const w=720,h=255,m={l:24,r:24,t:56,b:34},prices=sales.map(x=>x.price),min=Math.min(...prices),max=Math.max(...prices),spread=max-min,pad=spread?Math.max(spread*.12,.18):Math.max(max*.08,.35),lo=Math.max(0,min-pad),hi=max+pad,span=Math.max(.01,hi-lo),xs=readableX(sales,m.l,w-m.r),y=v=>m.t+(hi-v)/span*(h-m.t-m.b),points=sales.map((sale,i)=>({...sale,x:xs[i],y:y(sale.price)})),latest=points.at(-1);
  const grid=[.2,.5,.8].map(f=>{const gy=m.t+(h-m.t-m.b)*f;return `<line x1="${m.l}" y1="${gy.toFixed(2)}" x2="${w-m.r}" y2="${gy.toFixed(2)}" class="market-chart-grid"/>`}).join('');
  const dots=points.map(p=>`<circle class="market-sale-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3" data-price="${p.price}" data-time="${p.time}" data-marketplace="${esc(p.marketplace)}"/>`).join('');
  return `<div class="card-chart cardfolio-readable-chart" data-readable-sale-chart><div class="market-chart-readout"><div><strong data-chart-price>${usd(latest.price)}</strong><small>${sales.length} verified sale${sales.length===1?'':'s'}</small></div><span data-chart-meta>${esc(longDate(latest.time))} · ${esc(latest.marketplace)}</span></div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Verified exact sold prices over time">${grid}<path d="${smoothPath(points)}" class="market-price-line" vector-effect="non-scaling-stroke"/>${dots}<line class="market-chart-tracker" data-chart-tracker x1="${latest.x}" x2="${latest.x}" y1="${m.t}" y2="${h-m.b}"/><circle class="market-chart-focus" data-chart-focus cx="${latest.x}" cy="${latest.y}" r="6.5"/><rect class="market-chart-hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/></svg><div class="market-chart-range"><span>${shortDate(sales[0].time)}</span><span>${shortDate(sales.at(-1).time)}</span></div></div>`;
}

function wireChart(root){
  if(!root||root.dataset.scrubberReady==='1')return;
  const svg=root.querySelector('svg'),hit=root.querySelector('.market-chart-hit'),tracker=root.querySelector('[data-chart-tracker]'),focus=root.querySelector('[data-chart-focus]'),price=root.querySelector('[data-chart-price]'),meta=root.querySelector('[data-chart-meta]'),dots=[...root.querySelectorAll('.market-sale-dot')].map(el=>({el,x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),price:Number(el.dataset.price),time:Number(el.dataset.time),marketplace:el.dataset.marketplace||'Market'}));
  if(!svg||!hit||!dots.length)return;root.dataset.scrubberReady='1';
  const select=p=>{tracker.setAttribute('x1',p.x);tracker.setAttribute('x2',p.x);focus.setAttribute('cx',p.x);focus.setAttribute('cy',p.y);dots.forEach(x=>x.el.classList.toggle('selected',x===p));price.textContent=usd(p.price);meta.textContent=`${longDate(p.time)} · ${p.marketplace}`};
  const choose=e=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const vb=svg.viewBox.baseVal,x=vb.x+clamp((e.clientX-rect.left)/rect.width,0,1)*vb.width;let nearest=dots[0];for(const d of dots)if(Math.abs(d.x-x)<Math.abs(nearest.x-x))nearest=d;select(nearest)};
  select(dots.at(-1));hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});
}

function cardIdentity(h,c={}){
  const grade=c.grading_company?`${c.grading_company} ${c.grade||''}`:(h.grading_company?`${h.grading_company} ${h.grade||''}`:'Raw');
  return [
    ['Player / character',c.subject||h.subject],['Year',c.year||h.year],['Manufacturer',c.manufacturer||h.manufacturer],['Product / set',c.set_name||h.set_name||c.brand||h.brand],['Card #',c.card_number||h.card_number],['Parallel',c.parallel||h.parallel],['Variant',c.variant_name||h.variant_name],['Serial',c.serial_number||h.serial_number],['Grade',grade],['Language',c.language||h.language]
  ].filter(([,v])=>String(v||'').trim()).map(([k,v])=>`${k}: ${String(v).trim()}`).join('\n');
}
function marketQuery(h,c={}){return [c.year||h.year,c.manufacturer||h.manufacturer,c.brand||h.brand,c.subject||h.subject,c.set_name||h.set_name,(c.card_number||h.card_number)?`#${c.card_number||h.card_number}`:'',c.parallel||h.parallel,c.variant_name||h.variant_name,c.grading_company||h.grading_company,c.grade||h.grade].map(v=>String(v||'').trim()).filter(Boolean).join(' ').slice(0,190)}
async function copyCard(h,c={}){
  const text=cardIdentity(h,c);if(!text)return;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}toastMsg('Card copied')}catch{toastMsg('Copy unavailable')}
}
function ebaySearchUrl(q){return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`}

function listingCard(item){
  const url=safeEbayUrl(item.url),image=safeImageUrl(item.image),price=String(item.currency||'USD').toUpperCase()==='USD'?usd(item.price):`${Number(item.price).toFixed(2)} ${esc(item.currency||'')}`;
  if(!url)return '';
  return `<article class="embedded-market-listing"><div class="embedded-listing-main">${image?`<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>`:'<div class="embedded-listing-placeholder">eBay</div>'}<div class="embedded-listing-copy"><strong>${esc(item.title||'eBay listing')}</strong><span>${esc(item.condition||'Active listing')}</span><b>${price}</b></div></div><div class="embedded-listing-actions"><a class="listing-ebay-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">VIEW ON eBay <span>↗</span></a><button type="button" class="listing-copy-card" data-copy-open-card>COPY<br/>CARD</button></div></article>`;
}

async function loadActiveListings(area,h,c,force=false){
  const body=area.querySelector('[data-active-market-body]'),q=marketQuery(h,c),key=`${h.canonical_card_id||h.id}|${q}`;
  if(!body||!q)return;
  const cached=listingCache.get(key);
  if(!force&&cached&&Date.now()-cached.at<60000){renderActiveListings(body,cached.data,h,c,q);return}
  if(body.dataset.loading==='1')return;body.dataset.loading='1';body.innerHTML='<div class="active-market-loading">Loading live eBay listings…</div>';
  try{
    const response=await fetch('/api/ebay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q})}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||'eBay lookup failed');listingCache.set(key,{at:Date.now(),data});renderActiveListings(body,data,h,c,q);
  }catch{renderActiveListings(body,{configured:false,items:[]},h,c,q,true)}finally{delete body.dataset.loading}
}

function renderActiveListings(body,data,h,c,q,failed=false){
  const items=(Array.isArray(data?.items)?data.items:[]).map(i=>({...i,url:safeEbayUrl(i.url)})).filter(i=>i.url&&i.title&&Number.isFinite(Number(i.price))).slice(0,6);
  if(items.length){body.innerHTML=`<div class="embedded-market-strip">${items.map(listingCard).join('')}</div><p class="active-market-note">Active asking prices are marketplace context only. They never set Cardfolio FMV or sold history.</p>`}
  else{body.innerHTML=`<div class="active-market-empty"><div>${failed?'Live eBay listings could not be loaded right now.':data?.configured===false?'eBay live listings are unavailable on this deployment right now.':'No active eBay listings matched this card search right now.'}</div><div class="embedded-listing-actions market-fallback-actions"><a class="listing-ebay-button" href="${esc(ebaySearchUrl(q))}" target="_blank" rel="noopener noreferrer">SEARCH eBay <span>↗</span></a><button type="button" class="listing-copy-card" data-copy-open-card>COPY<br/>CARD</button></div></div>`}
  body.querySelectorAll('[data-copy-open-card]').forEach(btn=>btn.addEventListener('click',()=>void copyCard(h,c)));
}

function marketSection(box){return [...box.querySelectorAll('.detail-section')].find(section=>/Market activity|Market evidence/i.test(section.textContent||''))||null}
function ensureMarketUi(box,h,c){
  const section=marketSection(box);if(!section)return;
  const heading=section.querySelector('h3');if(heading)heading.textContent='Market activity';
  let area=section.querySelector('[data-active-market]');
  if(!area){section.insertAdjacentHTML('beforeend','<div class="active-market-shell" data-active-market><div class="active-market-heading"><div><span>Live marketplace</span><strong>Active eBay listings</strong></div><small>Browse here · open eBay only when you choose</small></div><div data-active-market-body></div></div>');area=section.querySelector('[data-active-market]')}
  void loadActiveListings(area,h,c,false);
}

function applyUnpricedDetail(box,h,c){
  if(currentPrice(h,c)!==null)return;
  const top=box.querySelector('.detail-price');if(top)top.textContent='$0.00';
  box.querySelectorAll('.market-stats-v2>span').forEach(stat=>{if(!/Fair market value/i.test(stat.querySelector('small')?.textContent||''))return;const value=stat.querySelector('b');if(value)value.textContent='$0.00';let note=stat.querySelector('em');if(!note){note=document.createElement('em');stat.appendChild(note)}note.textContent='No verified sold price yet'});
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void enhance(),140)}
async function enhance(){
  const st=appState(),box=document.getElementById('cardDetailContent'),dialog=document.getElementById('cardDetailDialog');if(!st?.supabase||!box||!dialog?.open)return;
  const holdingId=box.querySelector('[data-detail-edit]')?.dataset.detailEdit,holding=st.holdings?.find(h=>h.id===holdingId);if(!holding?.canonical_card_id)return;
  const seq=++requestSeq;
  try{
    const [{data:canonical,error:canonicalError},{data:rows,error:rowsError}]=await Promise.all([
      st.supabase.from('canonical_cards').select('*').eq('id',holding.canonical_card_id).maybeSingle(),
      st.supabase.from('card_market_observations').select('price,currency,marketplace,source_kind,sold_at,observed_at,exact_match').eq('canonical_card_id',holding.canonical_card_id).eq('source_kind','sold').eq('exact_match',true).eq('currency','USD').order('observed_at',{ascending:true}).limit(300)
    ]);
    if(seq!==requestSeq||!dialog.open||canonicalError||rowsError)return;
    const c=canonical||holding._canonical||{},current=box.querySelector('.card-chart');if(current&&!current.matches('[data-readable-sale-chart]'))current.outerHTML=chartHtml(rows||[]);wireChart(box.querySelector('[data-readable-sale-chart]'));applyUnpricedDetail(box,holding,c);ensureMarketUi(box,holding,c);
  }catch{}
}

function install(){
  installCss();schedule();
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&(node.id==='cardDetailContent'||node.matches?.('.card-chart,.detail-section')||node.querySelector?.('.card-chart,.detail-section'))){schedule();return}});observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-detail-card],.holding[data-card-id]'))schedule()},true);document.addEventListener('cardfolio:cloud-refreshed',schedule);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
