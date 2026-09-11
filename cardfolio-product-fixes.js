/* Cardfolio product QA fixes — persist exact variant identity dimensions and force
   canonical re-resolution only when an exact shared-market identity field changes.
   Loaded after cardfolio-product.js. */
(function(){
'use strict';

const productToDb=toDb;
toDb=function(h){
  const out=productToDb(h);
  out.subset=h.subset||null;
  out.variant_name=h.variant_name||null;
  out.card_type=h.card_type||null;
  out.language=h.language||null;
  out.edition=h.edition||null;
  return out;
};

const productReadCardForm=readCardForm;
readCardForm=function(){
  const h=productReadCardForm();
  const existing=state.holdings.find(x=>x.id===h.id);
  const meta=existing?.metadata&&typeof existing.metadata==='object'?existing.metadata:{};
  const value=id=>document.getElementById(id)?.value?.trim?.()||'';
  const explicitVariation=value('variation');
  const explicitLanguage=value('cardLanguage')||value('language');
  h.subset=h.subset||value('subset')||meta.subset||'';
  h.variant_name=explicitVariation||h.variant_name||meta.variation||meta.variant_name||'';
  h.language=explicitLanguage||h.language||meta.language||'';
  h.edition=h.edition||value('edition')||meta.edition||'';
  h.card_type=h.autograph&&h.relic?'autograph_relic':h.autograph?'autograph':h.relic?'relic':(h.parallel||h.variant_name||h.serial_number)?'parallel_or_variation':'base';
  h.metadata={...meta,subset:h.subset||null,variation:h.variant_name||null,variant_name:h.variant_name||null,card_type:h.card_type||null,language:h.language||null,edition:h.edition||null};
  return h;
};

const productOpenCardDialog=openCardDialog;
openCardDialog=function(h=null,prefill=null){
  productOpenCardDialog(h,prefill);
  const data=h||prefill||{},meta=data.metadata&&typeof data.metadata==='object'?data.metadata:{};
  const variation=document.getElementById('variation');if(variation)variation.value=data.variant_name||meta.variation||meta.variant_name||'';
  const lang=document.getElementById('cardLanguage');if(lang)lang.value=data.language||meta.language||'';
  const subset=document.getElementById('subset');if(subset&&!subset.value)subset.value=data.subset||meta.subset||'';
  const edition=document.getElementById('edition');if(edition&&!edition.value)edition.value=data.edition||meta.edition||'';
};

function normIdentity(v){return String(v??'').trim().replace(/\s+/g,' ').toLowerCase()}
function serialDenominator(v){
  const parts=String(v??'').trim().split('/');
  return parts.length>1?normIdentity(parts[parts.length-1]):'';
}
function exactIdentitySignature(h={}){
  return [
    h.category,h.subject,h.year,h.manufacturer,h.brand,h.set_name,h.subset,h.card_number,
    h.parallel,h.variant_name,h.card_type,h.team,h.league,!!h.rookie,!!h.autograph,!!h.relic,
    serialDenominator(h.serial_number),h.grading_company,h.grade,h.language,h.edition
  ].map(normIdentity).join('|');
}

const productSaveCardFromForm=saveCardFromForm;
saveCardFromForm=async function(){
  const id=document.getElementById('cardId')?.value||'';
  const existing=id?state.holdings.find(x=>x.id===id):null;
  const next=existing?readCardForm():null;
  const identityChanged=!!existing&&exactIdentitySignature(existing)!==exactIdentitySignature(next);
  const prior=identityChanged?{
    canonical_card_id:existing.canonical_card_id,
    market_value:existing.market_value,
    valuation_source:existing.valuation_source,
    valuation_observed_at:existing.valuation_observed_at,
    valuation_status:existing.valuation_status
  }:null;

  /* Keep the existing shared asset for quantity/cost/notes/acquisition edits. This avoids
     unnecessary resolver reads and writes on Supabase free tier. Exact identity edits
     deliberately clear linkage so the product layer must invoke the canonical resolver. */
  if(identityChanged){
    existing.canonical_card_id=null;
    existing.market_value=null;
    existing.valuation_source='';
    existing.valuation_observed_at=null;
    existing.valuation_status='pending_price';
  }

  try{
    await productSaveCardFromForm();
  }finally{
    const current=id?state.holdings.find(x=>x.id===id):null;
    // A successful cloud save replaces the in-memory holding during syncCloud(). If the
    // original object remains after failure/local-only handling, restore its prior view.
    if(identityChanged&&prior&&current===existing&&state?.holdings?.includes?.(existing)){
      existing.canonical_card_id=prior.canonical_card_id;
      existing.market_value=prior.market_value;
      existing.valuation_source=prior.valuation_source;
      existing.valuation_observed_at=prior.valuation_observed_at;
      existing.valuation_status=prior.valuation_status;
    }
  }
};
})();

/* Cardfolio requested UX — stable mobile search, useful portfolio sorting, richer
   maintained app locales, and Robinhood-style portfolio / sold-price chart scrubbing. */
(function(){
'use strict';
if(window.cardfolioRequestedUxV2)return;
window.cardfolioRequestedUxV2='20260911-portfolio-charts-languages-1';

const LOCALE_KEY='cardfolio.locale.v2';
const EXTRA_LOCALES={
  fr:{label:'Français',lang:'fr'},
  pt:{label:'Português',lang:'pt-BR'},
  ja:{label:'日本語',lang:'ja'},
  ko:{label:'한국어',lang:'ko'},
  zh:{label:'简体中文',lang:'zh-CN'}
};
const EXTRA_COPY={
  fr:{Home:'Accueil',Portfolio:'Portefeuille',Scan:'Scanner',Watch:'Suivi',Watchlist:'Liste de suivi',Market:'Marché',Grading:'Notation',Profile:'Profil','Sign out':'Se déconnecter','Sign in':'Se connecter','Manual add':'Ajouter manuellement','Portfolio value':'Valeur du portefeuille',Collection:'Collection','By category':'Par catégorie','See all':'Tout voir',Assets:'Actifs','Recently added':'Ajoutées récemment','Your collection':'Votre collection','Add card':'Ajouter une carte','Search player, set, card #…':'Rechercher joueur, série, carte n°…',All:'Tous',Priced:'Cotées',Unpriced:'Non cotées','Oldest added':'Plus anciennes','Price: Low → High':'Prix : croissant','Price: High → Low':'Prix : décroissant','Name: A → Z':'Nom : A → Z','Name: Z → A':'Nom : Z → A','Year: Newest → Oldest':'Année : récente → ancienne','Year: Oldest → Newest':'Année : ancienne → récente','Sort cards':'Trier les cartes','Card facts':'Infos carte','Exact asset identity':'Identité exacte',Year:'Année',Set:'Série','Card #':'Carte n°',Parallel:'Parallèle',Variant:'Variante',Grade:'Note',Language:'Langue','Card language':'Langue de la carte','App language':'Langue de l’application',Edition:'Édition','Market evidence':'Données du marché','Market activity':'Activité du marché',Current:'Actuel',Sample:'Échantillon',Confidence:'Confiance','Edit holding':'Modifier la position','Active listings':'Annonces actives','Sold comps':'Ventes comparables','Pending Price':'Prix en attente','Choose language':'Choisir la langue',Cancel:'Annuler','Fair market value':'Juste valeur de marché','Market range':'Fourchette du marché','Quick sale':'Vente rapide','Suggested list':'Prix conseillé','Exact comps':'Comparables exacts','Sales · 30d':'Ventes · 30 j','Last exact sale':'Dernière vente exacte',Liquidity:'Liquidité','Last market check':'Dernière vérification','Live marketplace':'Marché en direct','Active eBay listings':'Annonces eBay actives'},
  pt:{Home:'Início',Portfolio:'Portfólio',Scan:'Escanear',Watch:'Acompanhar',Watchlist:'Lista de acompanhamento',Market:'Mercado',Grading:'Graduação',Profile:'Perfil','Sign out':'Sair','Sign in':'Entrar','Manual add':'Adicionar manualmente','Portfolio value':'Valor do portfólio',Collection:'Coleção','By category':'Por categoria','See all':'Ver tudo',Assets:'Ativos','Recently added':'Adicionadas recentemente','Your collection':'Sua coleção','Add card':'Adicionar carta','Search player, set, card #…':'Buscar jogador, coleção, carta nº…',All:'Todos',Priced:'Com preço',Unpriced:'Sem preço','Oldest added':'Mais antigas','Price: Low → High':'Preço: menor → maior','Price: High → Low':'Preço: maior → menor','Name: A → Z':'Nome: A → Z','Name: Z → A':'Nome: Z → A','Year: Newest → Oldest':'Ano: recente → antigo','Year: Oldest → Newest':'Ano: antigo → recente','Sort cards':'Ordenar cartas','Card facts':'Dados da carta','Exact asset identity':'Identidade exata',Year:'Ano',Set:'Coleção','Card #':'Carta nº',Parallel:'Paralela',Variant:'Variante',Grade:'Nota',Language:'Idioma','Card language':'Idioma da carta','App language':'Idioma do app',Edition:'Edição','Market evidence':'Evidência de mercado','Market activity':'Atividade do mercado',Current:'Atual',Sample:'Amostra',Confidence:'Confiança','Edit holding':'Editar posição','Active listings':'Anúncios ativos','Sold comps':'Vendas comparáveis','Pending Price':'Preço pendente','Choose language':'Escolher idioma',Cancel:'Cancelar','Fair market value':'Valor justo de mercado','Market range':'Faixa de mercado','Quick sale':'Venda rápida','Suggested list':'Preço sugerido','Exact comps':'Comparáveis exatos','Sales · 30d':'Vendas · 30d','Last exact sale':'Última venda exata',Liquidity:'Liquidez','Last market check':'Última verificação','Live marketplace':'Mercado ao vivo','Active eBay listings':'Anúncios ativos do eBay'},
  ja:{Home:'ホーム',Portfolio:'ポートフォリオ',Scan:'スキャン',Watch:'ウォッチ',Watchlist:'ウォッチリスト',Market:'マーケット',Grading:'グレーディング',Profile:'プロフィール','Sign out':'サインアウト','Sign in':'サインイン','Manual add':'手動で追加','Portfolio value':'ポートフォリオ価値',Collection:'コレクション','By category':'カテゴリー別','See all':'すべて見る',Assets:'資産','Recently added':'最近追加','Your collection':'あなたのコレクション','Add card':'カードを追加','Search player, set, card #…':'選手・セット・カード番号を検索…',All:'すべて',Priced:'価格あり',Unpriced:'価格なし','Oldest added':'追加が古い順','Price: Low → High':'価格：安い順','Price: High → Low':'価格：高い順','Name: A → Z':'名前：A → Z','Name: Z → A':'名前：Z → A','Year: Newest → Oldest':'年：新しい順','Year: Oldest → Newest':'年：古い順','Sort cards':'カードを並べ替え','Card facts':'カード情報','Exact asset identity':'正確なカード識別',Year:'年',Set:'セット','Card #':'カード番号',Parallel:'パラレル',Variant:'バリアント',Grade:'グレード',Language:'言語','Card language':'カードの言語','App language':'アプリの言語',Edition:'エディション','Market evidence':'市場データ','Market activity':'市場動向',Current:'現在',Sample:'サンプル',Confidence:'信頼度','Edit holding':'保有を編集','Active listings':'出品中','Sold comps':'成約比較','Pending Price':'価格待ち','Choose language':'言語を選択',Cancel:'キャンセル','Fair market value':'適正市場価格','Market range':'市場レンジ','Quick sale':'早期売却','Suggested list':'推奨出品価格','Exact comps':'完全一致の比較','Sales · 30d':'30日間の販売','Last exact sale':'直近の完全一致販売',Liquidity:'流動性','Last market check':'最終市場確認','Live marketplace':'ライブマーケット','Active eBay listings':'eBay出品中'},
  ko:{Home:'홈',Portfolio:'포트폴리오',Scan:'스캔',Watch:'관심',Watchlist:'관심목록',Market:'마켓',Grading:'등급',Profile:'프로필','Sign out':'로그아웃','Sign in':'로그인','Manual add':'직접 추가','Portfolio value':'포트폴리오 가치',Collection:'컬렉션','By category':'카테고리별','See all':'전체 보기',Assets:'자산','Recently added':'최근 추가','Your collection':'내 컬렉션','Add card':'카드 추가','Search player, set, card #…':'선수, 세트, 카드 번호 검색…',All:'전체',Priced:'가격 있음',Unpriced:'가격 없음','Oldest added':'오래된 추가순','Price: Low → High':'가격: 낮은순','Price: High → Low':'가격: 높은순','Name: A → Z':'이름: A → Z','Name: Z → A':'이름: Z → A','Year: Newest → Oldest':'연도: 최신순','Year: Oldest → Newest':'연도: 오래된순','Sort cards':'카드 정렬','Card facts':'카드 정보','Exact asset identity':'정확한 카드 식별',Year:'연도',Set:'세트','Card #':'카드 번호',Parallel:'패러렐',Variant:'변형',Grade:'등급',Language:'언어','Card language':'카드 언어','App language':'앱 언어',Edition:'에디션','Market evidence':'시장 근거','Market activity':'시장 활동',Current:'현재',Sample:'표본',Confidence:'신뢰도','Edit holding':'보유 수정','Active listings':'활성 매물','Sold comps':'판매 비교','Pending Price':'가격 대기','Choose language':'언어 선택',Cancel:'취소','Fair market value':'공정 시장가치','Market range':'시장 범위','Quick sale':'빠른 판매','Suggested list':'권장 판매가','Exact comps':'정확 일치 비교','Sales · 30d':'30일 판매','Last exact sale':'최근 정확 일치 판매',Liquidity:'유동성','Last market check':'최근 시장 확인','Live marketplace':'실시간 마켓','Active eBay listings':'eBay 활성 매물'},
  zh:{Home:'首页',Portfolio:'投资组合',Scan:'扫描',Watch:'关注',Watchlist:'关注列表',Market:'市场',Grading:'评级',Profile:'个人资料','Sign out':'退出登录','Sign in':'登录','Manual add':'手动添加','Portfolio value':'组合价值',Collection:'收藏','By category':'按类别','See all':'查看全部',Assets:'资产','Recently added':'最近添加','Your collection':'你的收藏','Add card':'添加卡片','Search player, set, card #…':'搜索球员、系列、卡号…',All:'全部',Priced:'已定价',Unpriced:'未定价','Oldest added':'最早添加','Price: Low → High':'价格：从低到高','Price: High → Low':'价格：从高到低','Name: A → Z':'名称：A → Z','Name: Z → A':'名称：Z → A','Year: Newest → Oldest':'年份：从新到旧','Year: Oldest → Newest':'年份：从旧到新','Sort cards':'卡片排序','Card facts':'卡片信息','Exact asset identity':'精确卡片身份',Year:'年份',Set:'系列','Card #':'卡号',Parallel:'平行版',Variant:'版本',Grade:'评级',Language:'语言','Card language':'卡片语言','App language':'应用语言',Edition:'版次','Market evidence':'市场依据','Market activity':'市场活动',Current:'当前',Sample:'样本',Confidence:'置信度','Edit holding':'编辑持有','Active listings':'在售列表','Sold comps':'成交对比','Pending Price':'等待定价','Choose language':'选择语言',Cancel:'取消','Fair market value':'公平市场价值','Market range':'市场区间','Quick sale':'快速出售','Suggested list':'建议挂牌价','Exact comps':'精确成交对比','Sales · 30d':'30天成交','Last exact sale':'最近精确成交',Liquidity:'流动性','Last market check':'最近市场检查','Live marketplace':'实时市场','Active eBay listings':'eBay在售列表'}
};
let extraLocale=EXTRA_LOCALES[localStorage.getItem(LOCALE_KEY)]?localStorage.getItem(LOCALE_KEY):null;
let marketAxisTimer=0;

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function uxUnitPrice(h){for(const v of[h?._canonical?.current_price,h?.market_value,h?.manual_value])if(finite(v))return Number(v);return null}
function moneyLabel(v){try{return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v)||0)}catch{return `$${Number(v||0).toFixed(2)}`}}
function shortDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function longDate(t){return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function localDayKey(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dayTime(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12).getTime()}
function smoothPath(points){if(!points.length)return'';let d=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mx=(a.x+b.x)/2;d+=` C ${mx.toFixed(2)} ${a.y.toFixed(2)}, ${mx.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`}return d}

portfolioHistory=function(){
  const currentIds=new Set((state.holdings||[]).map(h=>String(h.id)));
  const daily=new Map();
  for(const s of state.snapshots||[]){
    if(!s?.holding_id||!currentIds.has(String(s.holding_id))||!finite(s.market_value))continue;
    const key=localDayKey(s.observed_at);if(!key)continue;
    let byHolding=daily.get(key);if(!byHolding){byHolding=new Map();daily.set(key,byHolding)}
    const id=String(s.holding_id),arr=byHolding.get(id)||[];
    arr.push(Number(s.market_value)*Math.max(1,Number(s.quantity||1)));byHolding.set(id,arr);
  }
  const last=new Map(),history=[];
  for(const key of [...daily.keys()].sort()){
    for(const [id,values] of daily.get(key))last.set(id,values.reduce((a,b)=>a+b,0)/values.length);
    const value=[...last.values()].reduce((a,b)=>a+b,0);
    if(Number.isFinite(value))history.push({date:key,value,time:dayTime(key)});
  }
  const today=localDayKey(Date.now());
  const current=(state.holdings||[]).reduce((sum,h)=>{const p=uxUnitPrice(h);return sum+(p===null?0:p*Math.max(1,Number(h.quantity||1)))},0);
  if(current>0||history.length){const row={date:today,value:current,time:dayTime(today)};if(history.at(-1)?.date===today)history[history.length-1]=row;else history.push(row)}
  return history;
};

function portfolioChartHtml(hist){
  const rows=(hist||[]).map(x=>({time:Number(x.time||dayTime(x.date)),value:Number(x.value)})).filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.value));
  if(!rows.length)return '<div class="cf-portfolio-chart empty-chart"><span>Portfolio history begins when Cardfolio records real valuations.</span></div><div class="timeline-note">Built only from recorded Cardfolio valuations.</div>';
  const w=720,h=270,m={l:66,r:16,t:34,b:50},values=rows.map(x=>x.value),min=Math.min(...values),max=Math.max(...values),spread=max-min;
  const pad=spread>0?Math.max(spread*.22,max*.035,1):Math.max(max*.10,1),lo=Math.max(0,min-pad),hi=max+pad,span=Math.max(.01,hi-lo),t0=rows[0].time,t1=rows.at(-1).time,dt=Math.max(1,t1-t0);
  const x=t=>rows.length===1?(m.l+w-m.r)/2:m.l+(t-t0)/dt*(w-m.l-m.r),y=v=>m.t+(hi-v)/span*(h-m.t-m.b),points=rows.map((r,i)=>({...r,i,x:x(r.time),y:y(r.value)})),latest=points.at(-1),positive=latest.value>=points[0].value;
  const ticks=[0,.333,.666,1].map(f=>({value:hi-(hi-lo)*f,y:m.t+(h-m.t-m.b)*f}));
  const yAxis=ticks.map(t=>`<g class="cf-axis-tick"><line x1="${m.l}" y1="${t.y.toFixed(1)}" x2="${w-m.r}" y2="${t.y.toFixed(1)}"/><text x="${m.l-10}" y="${(t.y+4).toFixed(1)}" text-anchor="end">${moneyLabel(t.value)}</text></g>`).join('');
  const xRows=rows.length===1?[rows[0]]:[rows[0],rows[Math.floor((rows.length-1)/2)],rows.at(-1)],seen=new Set(),xAxis=xRows.filter(r=>{const k=localDayKey(r.time);if(seen.has(k))return false;seen.add(k);return true}).map(r=>`<text class="cf-x-label" x="${x(r.time).toFixed(1)}" y="${h-17}" text-anchor="middle">${shortDate(r.time)}</text>`).join('');
  const dots=points.map(p=>`<circle class="cf-portfolio-point" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3" data-index="${p.i}" data-value="${p.value}" data-time="${p.time}"/>`).join(''),path=smoothPath(points),area=`${m.l},${h-m.b} ${points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} ${w-m.r},${h-m.b}`;
  return `<div class="cf-portfolio-chart" data-cf-portfolio-chart><div class="cf-portfolio-chart-readout" data-cf-portfolio-readout>${moneyLabel(latest.value)} · ${longDate(latest.time)}</div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Portfolio value over time">${yAxis}${xAxis}<polygon class="cf-portfolio-area ${positive?'up':'down'}" points="${area}"/><path class="cf-portfolio-line ${positive?'up':'down'}" d="${path}" vector-effect="non-scaling-stroke"/>${dots}<line class="cf-portfolio-tracker" data-cf-portfolio-tracker x1="${latest.x}" x2="${latest.x}" y1="${m.t}" y2="${h-m.b}"/><circle class="cf-portfolio-focus" data-cf-portfolio-focus cx="${latest.x}" cy="${latest.y}" r="6"/><rect class="cf-portfolio-hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/></svg></div><div class="timeline-note">Built only from recorded Cardfolio valuations.</div>`;
}
historyChart=function(hist){return portfolioChartHtml(hist)};

function wirePortfolioChart(root=document){
  const chart=root.matches?.('[data-cf-portfolio-chart]')?root:root.querySelector?.('[data-cf-portfolio-chart]');if(!chart||chart.dataset.cfWired==='1')return;
  const svg=chart.querySelector('svg'),hit=chart.querySelector('.cf-portfolio-hit'),tracker=chart.querySelector('[data-cf-portfolio-tracker]'),focus=chart.querySelector('[data-cf-portfolio-focus]'),readout=chart.querySelector('[data-cf-portfolio-readout]'),points=[...chart.querySelectorAll('.cf-portfolio-point')].map(el=>({el,x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),value:Number(el.dataset.value),time:Number(el.dataset.time)}));
  if(!svg||!hit||!points.length)return;chart.dataset.cfWired='1';
  const select=p=>{tracker?.setAttribute('x1',p.x);tracker?.setAttribute('x2',p.x);focus?.setAttribute('cx',p.x);focus?.setAttribute('cy',p.y);points.forEach(v=>v.el.classList.toggle('selected',v===p));if(readout)readout.textContent=`${moneyLabel(p.value)} · ${longDate(p.time)}`};
  const choose=e=>{const r=svg.getBoundingClientRect();if(!r.width)return;const vb=svg.viewBox.baseVal,px=vb.x+Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*vb.width;let n=points[0];for(const p of points)if(Math.abs(p.x-px)<Math.abs(n.x-px))n=p;select(n)};
  select(points.at(-1));hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});hit.addEventListener('pointercancel',()=>select(points.at(-1)));
}

const basePortfolioView=portfolioView;
portfolioView=function(){const saved=state.filter.q||'';state.filter.q='';try{return basePortfolioView()}finally{state.filter.q=saved}};
function searchText(h){return [h.display_name,h.subject,h.category,h.team,h.league,h.year,h.manufacturer,h.brand,h.set_name,h.subset,h.card_number,h.parallel,h.variant_name,h.grading_company,h.grade,h.language,h.edition].filter(Boolean).join(' ').toLowerCase()}
function yearNumber(h){const m=String(h?.year||'').match(/(?:19|20)\d{2}/);return m?Number(m[0]):0}
function addedTime(h){const t=Date.parse(h?.created_at||'');return Number.isFinite(t)?t:0}
function compareHolding(a,b,sort){
  const an=String(a?.display_name||a?.subject||'').toLocaleLowerCase(),bn=String(b?.display_name||b?.subject||'').toLocaleLowerCase(),ap=uxUnitPrice(a),bp=uxUnitPrice(b),ay=yearNumber(a),by=yearNumber(b);
  if(sort==='price-asc'){if(ap===null)return bp===null?an.localeCompare(bn):1;if(bp===null)return-1;return ap-bp||an.localeCompare(bn)}if(sort==='price-desc'){if(ap===null)return bp===null?an.localeCompare(bn):1;if(bp===null)return-1;return bp-ap||an.localeCompare(bn)}if(sort==='name-asc')return an.localeCompare(bn);if(sort==='name-desc')return bn.localeCompare(an);if(sort==='year-desc')return by-ay||an.localeCompare(bn);if(sort==='year-asc')return ay-by||an.localeCompare(bn);if(sort==='oldest')return addedTime(a)-addedTime(b)||an.localeCompare(bn);return addedTime(b)-addedTime(a)||an.localeCompare(bn)
}
function sortLabel(value){return ({recent:'Recently added',oldest:'Oldest added','price-asc':'Price: Low → High','price-desc':'Price: High → Low','name-asc':'Name: A → Z','name-desc':'Name: Z → A','year-desc':'Year: Newest → Oldest','year-asc':'Year: Oldest → Newest'})[value]||'Recently added'}
function trExtra(s){return extraLocale?EXTRA_COPY[extraLocale]?.[s]||s:s}
function ensureSortControl(){
  const filters=document.querySelector('.liquid-filters'),pricing=document.getElementById('pricingFilter');if(!filters||!pricing)return null;state.filter=state.filter||{};
  let sort=document.getElementById('portfolioSort');if(!sort){sort=document.createElement('select');sort.id='portfolioSort';sort.setAttribute('aria-label','Sort cards');pricing.insertAdjacentElement('afterend',sort)}
  state.filter.sort=state.filter.sort||'recent';const opts=['recent','oldest','price-asc','price-desc','name-asc','name-desc','year-desc','year-asc'];sort.innerHTML=opts.map(v=>`<option value="${v}" ${v===state.filter.sort?'selected':''}>${trExtra(sortLabel(v))}</option>`).join('');if(sort.dataset.cfBound!=='1'){sort.dataset.cfBound='1';sort.addEventListener('change',e=>{state.filter.sort=e.target.value;applyPortfolioFilter()})}return sort;
}
function applyPortfolioFilter(){
  const input=document.getElementById('portfolioSearch');if(!input)return;const q=String(input.value||'').trim().toLowerCase();state.filter.q=input.value;const sort=state.filter.sort||'recent',byId=new Map((state.holdings||[]).map(h=>[String(h.id),h]));let visible=0;
  document.querySelectorAll('.collection-group,.category-album').forEach(group=>{const grid=group.querySelector('.album-grid');if(!grid)return;const cards=[...grid.querySelectorAll('[data-card-id]')];cards.sort((a,b)=>compareHolding(byId.get(String(a.dataset.cardId)),byId.get(String(b.dataset.cardId)),sort)).forEach(card=>grid.appendChild(card));let groupVisible=0;for(const card of cards){const h=byId.get(String(card.dataset.cardId)),show=!!h&&(!q||searchText(h).includes(q));card.hidden=!show;if(show){groupVisible++;visible++}}group.hidden=groupVisible===0});
  let empty=document.getElementById('cfPortfolioSearchEmpty');if(!empty){empty=document.createElement('div');empty.id='cfPortfolioSearchEmpty';empty.className='glass-empty cf-search-empty';empty.innerHTML='<strong>No matching cards</strong><p>Try a different search or filter.</p>';document.querySelector('.collection-stack,.category-stack')?.appendChild(empty)}if(empty)empty.hidden=visible!==0;const count=document.querySelector('.portfolio-toolbar h2');if(count)count.textContent=`${visible} holding${visible===1?'':'s'}`;
}
window.cardfolioApplyPortfolioFilter=applyPortfolioFilter;
function stabilizeSearch(){
  const old=document.getElementById('portfolioSearch');if(!old)return;let input=old;if(old.dataset.cfStable!=='1'){input=old.cloneNode(true);input.dataset.cfStable='1';input.value=state.filter.q||old.value||'';old.replaceWith(input);input.addEventListener('input',()=>applyPortfolioFilter())}ensureSortControl();applyPortfolioFilter();
}
const baseBindViewEvents=bindViewEvents;
bindViewEvents=function(){baseBindViewEvents();stabilizeSearch();wirePortfolioChart(document)};

function marketChartSignature(chart){const daily=chart.dataset.cardfolioDailyAverageReady||'0',pts=[...chart.querySelectorAll('.market-sale-dot')].map(d=>`${d.dataset.price}@${d.dataset.time}`).join('|');return `${daily}:${pts}`}
function upgradeMarketChart(chart){
  if(!chart?.querySelector)return;const svg=chart.querySelector('svg'),path=chart.querySelector('.market-price-line'),dots=[...chart.querySelectorAll('.market-sale-dot')].map(el=>({el,price:Number(el.dataset.price),time:Number(el.dataset.time),marketplace:el.dataset.marketplace||'Market'})).filter(p=>p.price>0&&Number.isFinite(p.price)&&Number.isFinite(p.time));if(!svg||!path||!dots.length)return;const signature=marketChartSignature(chart);if(chart.dataset.cfAxisSignature===signature)return;
  dots.sort((a,b)=>a.time-b.time);const w=720,h=270,m={l:68,r:16,t:58,b:48},prices=dots.map(p=>p.price),min=Math.min(...prices),max=Math.max(...prices),spread=max-min,pad=spread>0?Math.max(spread*.22,max*.035,.22):Math.max(max*.10,.4),lo=Math.max(0,min-pad),hi=max+pad,span=Math.max(.01,hi-lo),t0=dots[0].time,t1=dots.at(-1).time,dt=Math.max(1,t1-t0),x=t=>dots.length===1?(m.l+w-m.r)/2:m.l+(t-t0)/dt*(w-m.l-m.r),y=v=>m.t+(hi-v)/span*(h-m.t-m.b),plotted=dots.map((p,i)=>({...p,i,x:x(p.time),y:y(p.price)}));path.setAttribute('d',smoothPath(plotted));svg.setAttribute('viewBox',`0 0 ${w} ${h}`);chart.querySelectorAll('.market-chart-grid,[data-cf-chart-axes]').forEach(n=>n.remove());plotted.forEach(p=>{p.el.setAttribute('cx',p.x.toFixed(2));p.el.setAttribute('cy',p.y.toFixed(2));p.el.dataset.saleIndex=String(p.i)});
  const axes=document.createElementNS('http://www.w3.org/2000/svg','g');axes.setAttribute('data-cf-chart-axes','1');axes.setAttribute('class','cf-market-axes');for(const f of[0,.333,.666,1]){const gy=m.t+(h-m.t-m.b)*f,val=hi-(hi-lo)*f,line=document.createElementNS('http://www.w3.org/2000/svg','line'),text=document.createElementNS('http://www.w3.org/2000/svg','text');line.setAttribute('x1',m.l);line.setAttribute('x2',w-m.r);line.setAttribute('y1',gy);line.setAttribute('y2',gy);text.setAttribute('x',m.l-10);text.setAttribute('y',gy+4);text.setAttribute('text-anchor','end');text.textContent=moneyLabel(val);axes.append(line,text)}const xPts=dots.length===1?[dots[0]]:[dots[0],dots[Math.floor((dots.length-1)/2)],dots.at(-1)],seen=new Set();for(const p of xPts){const k=localDayKey(p.time);if(seen.has(k))continue;seen.add(k);const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('class','cf-market-x-label');text.setAttribute('x',x(p.time));text.setAttribute('y',h-15);text.setAttribute('text-anchor','middle');text.textContent=shortDate(p.time);axes.appendChild(text)}svg.insertBefore(axes,path);
  const tracker=chart.querySelector('[data-chart-tracker]'),focus=chart.querySelector('[data-chart-focus]'),priceEl=chart.querySelector('[data-chart-price]'),metaEl=chart.querySelector('[data-chart-meta]');if(tracker){tracker.setAttribute('y1',m.t);tracker.setAttribute('y2',h-m.b)}let hit=chart.querySelector('.market-chart-hit');if(hit){const fresh=hit.cloneNode(true);hit.replaceWith(fresh);hit=fresh;hit.setAttribute('x','0');hit.setAttribute('y','0');hit.setAttribute('width',w);hit.setAttribute('height',h)}const select=p=>{tracker?.setAttribute('x1',p.x);tracker?.setAttribute('x2',p.x);focus?.setAttribute('cx',p.x);focus?.setAttribute('cy',p.y);plotted.forEach(v=>v.el.classList.toggle('selected',v===p));if(priceEl)priceEl.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(p.price);if(metaEl)metaEl.textContent=`${new Date(p.time).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})} · ${p.marketplace}`};const choose=e=>{const r=svg.getBoundingClientRect();if(!r.width)return;const vb=svg.viewBox.baseVal,px=vb.x+Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*vb.width;let n=plotted[0];for(const p of plotted)if(Math.abs(p.x-px)<Math.abs(n.x-px))n=p;select(n)};if(hit){hit.addEventListener('pointerdown',e=>{hit.setPointerCapture?.(e.pointerId);choose(e)});hit.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||hit.hasPointerCapture?.(e.pointerId))choose(e)});hit.addEventListener('pointerup',e=>{choose(e);hit.releasePointerCapture?.(e.pointerId)});hit.addEventListener('pointercancel',()=>select(plotted.at(-1)))}select(plotted.at(-1));const range=chart.querySelector('.market-chart-range');if(range)range.hidden=true;chart.dataset.cfAxisSignature=signature;
}
function queueMarketAxes(){clearTimeout(marketAxisTimer);marketAxisTimer=setTimeout(()=>{document.querySelectorAll('[data-observation-chart],.cardfolio-readable-chart[data-readable-sale-chart]').forEach(upgradeMarketChart)},0)}

function shouldSkipLocale(node){return !!node.parentElement?.closest('.album-copy strong,.asset-title h1,.holding-name,.evidence-row strong,.embedded-listing-copy strong,[data-no-i18n],script,style,textarea,input,option')}
const extraBases=new WeakMap();
function translateExtra(root=document.body){
  if(!extraLocale||!root)return;const dict=EXTRA_COPY[extraLocale]||{},walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){if(shouldSkipLocale(node))continue;const raw=node.nodeValue||'',trim=raw.trim();if(!trim)continue;let base=extraBases.get(node);if(!base){base=trim;extraBases.set(node,base)}const next=dict[base]||base,lead=raw.match(/^\s*/)?.[0]||'',tail=raw.match(/\s*$/)?.[0]||'';if(trim!==next)node.nodeValue=lead+next+tail}root.querySelectorAll?.('input[placeholder]').forEach(el=>{if(!el.dataset.cfExtraPh)el.dataset.cfExtraPh=el.getAttribute('placeholder')||'';const base=el.dataset.cfExtraPh,next=dict[base]||base;if(el.getAttribute('placeholder')!==next)el.setAttribute('placeholder',next)});const row=root.querySelector?.('.cardfolio-language-row')||document.querySelector('.cardfolio-language-row'),value=row?.querySelector(':scope > b,:scope > strong')||row?.querySelector('b,strong'),label=EXTRA_LOCALES[extraLocale].label;if(value&&value.textContent!==label)value.textContent=label;document.documentElement.lang=EXTRA_LOCALES[extraLocale].lang;
}
function applyExtraLocale(code){if(!EXTRA_LOCALES[code])return;if(typeof window.cardfolioSetLocale==='function')window.cardfolioSetLocale('en');extraLocale=code;localStorage.setItem(LOCALE_KEY,code);translateExtra(document.body);enhanceLanguagePicker();ensureSortControl();applyPortfolioFilter()}
function enhanceLanguagePicker(){
  const picker=document.getElementById('cardfolioLanguagePicker'),options=picker?.querySelector('.cf-language-options');if(!picker||!options)return;for(const [code,meta] of Object.entries(EXTRA_LOCALES)){let btn=options.querySelector(`[data-cf-extra-locale="${code}"]`);if(!btn){btn=document.createElement('button');btn.type='button';btn.className='cf-language-option';btn.dataset.cfExtraLocale=code;btn.innerHTML=`<span>${meta.label}</span><span></span>`;btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();applyExtraLocale(code);picker.close()});options.appendChild(btn)}btn.classList.toggle('selected',extraLocale===code);const mark=extraLocale===code?'✓':'';if(btn.lastElementChild&&btn.lastElementChild.textContent!==mark)btn.lastElementChild.textContent=mark}if(extraLocale)options.querySelectorAll('[data-cf-locale]').forEach(btn=>{btn.classList.remove('selected');if(btn.lastElementChild&&btn.lastElementChild.textContent)btn.lastElementChild.textContent=''})
}
let replayingBaseLocale=false;
function restoreExtra(root=document.body){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){const base=extraBases.get(node);if(base!==undefined&&node.nodeValue?.trim()){const raw=node.nodeValue,lead=raw.match(/^\s*/)?.[0]||'',tail=raw.match(/\s*$/)?.[0]||'';node.nodeValue=lead+base+tail}}root.querySelectorAll?.('input[data-cf-extra-ph]').forEach(el=>el.setAttribute('placeholder',el.dataset.cfExtraPh||''))}
document.addEventListener('cardfolio:locale-changed',e=>{const code=e.detail?.locale;if(EXTRA_LOCALES[code]||replayingBaseLocale)return;if(extraLocale&&['en','es','bn'].includes(code)){restoreExtra(document.body);extraLocale=null;replayingBaseLocale=true;setTimeout(()=>{try{window.cardfolioSetLocale?.(code)}finally{replayingBaseLocale=false}},0);return}if(code&&code!=='en')extraLocale=null;else if(localStorage.getItem(LOCALE_KEY)==='en')extraLocale=null});

function installCss(){if(document.getElementById('cardfolio-requested-ux-v2-css'))return;const s=document.createElement('style');s.id='cardfolio-requested-ux-v2-css';s.textContent=`
.liquid-filters{align-items:center}.liquid-filters #portfolioSort{min-width:170px}.cf-search-empty{margin-top:14px}.cf-search-empty[hidden]{display:none!important}
.cf-portfolio-chart{position:relative;margin-top:14px;touch-action:pan-y}.cf-portfolio-chart svg{display:block;width:100%;min-height:230px;overflow:visible}.cf-portfolio-chart-readout{position:absolute;right:6px;top:0;z-index:2;font-size:11px;font-weight:750;color:var(--muted);pointer-events:none}.cf-axis-tick line,.cf-market-axes line{stroke:rgba(76,94,118,.12);stroke-width:1;vector-effect:non-scaling-stroke}.cf-axis-tick text,.cf-x-label,.cf-market-axes text{fill:var(--muted);font-size:10px;font-weight:650}.cf-portfolio-line{fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.cf-portfolio-line.up{stroke:#34c759}.cf-portfolio-line.down{stroke:#ff3b30}.cf-portfolio-area.up{fill:rgba(52,199,89,.07)}.cf-portfolio-area.down{fill:rgba(255,59,48,.06)}.cf-portfolio-point{opacity:.08}.cf-portfolio-point.selected{opacity:1;fill:#34c759}.cf-portfolio-tracker{stroke:rgba(34,48,65,.35);stroke-width:1.1;stroke-dasharray:3 5;vector-effect:non-scaling-stroke}.cf-portfolio-focus{fill:#34c759;stroke:white;stroke-width:2.5;vector-effect:non-scaling-stroke}.cf-portfolio-hit{touch-action:pan-y;cursor:crosshair}
[data-observation-chart] svg,.cardfolio-readable-chart svg{overflow:visible}.cf-market-axes text{font-size:10px}.cf-market-x-label{font-weight:650}.market-chart-hit{touch-action:pan-y}
@media(max-width:620px){.liquid-filters{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important}.liquid-filters #portfolioSearch{grid-column:1/-1}.liquid-filters #pricingFilter,.liquid-filters #portfolioSort{width:100%;min-width:0}.cf-portfolio-chart svg{min-height:210px}.cf-axis-tick text,.cf-x-label,.cf-market-axes text{font-size:11px}}
`;document.head.appendChild(s)}

const observer=new MutationObserver(records=>{let needsMarket=false,needsLocale=false;for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches?.('[data-observation-chart],.cardfolio-readable-chart')||node.querySelector?.('[data-observation-chart],.cardfolio-readable-chart'))needsMarket=true;if(node.id==='cardfolioLanguagePicker'||node.querySelector?.('#cardfolioLanguagePicker,.cardfolio-language-row'))needsLocale=true;if(node.matches?.('[data-cf-portfolio-chart]')||node.querySelector?.('[data-cf-portfolio-chart]'))wirePortfolioChart(node);if(node.id==='portfolioSearch'||node.querySelector?.('#portfolioSearch'))setTimeout(stabilizeSearch,0)}if(needsMarket)queueMarketAxes();if(needsLocale)setTimeout(()=>{enhanceLanguagePicker();if(extraLocale)translateExtra(document.body)},0);if(extraLocale)setTimeout(()=>translateExtra(document.body),0)});
function install(){installCss();observer.observe(document.documentElement,{childList:true,subtree:true});stabilizeSearch();wirePortfolioChart(document);queueMarketAxes();enhanceLanguagePicker();if(extraLocale)translateExtra(document.body)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
