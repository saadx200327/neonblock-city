/* Cardfolio vNext — shared exact-card market model, crop-first scanning, richer OCR,
   Robinhood-style portfolio/card detail UX, and Google OAuth. Loaded last. */

state.canonicalCards = state.canonicalCards || {};
state.canonicalHistory = state.canonicalHistory || {};
state.marketObservations = state.marketObservations || {};
state.openCategories = state.openCategories || new Set();

const vnextBaseSyncCloud = syncCloud;
const vnextBaseToDb = toDb;
const vnextBaseReadCardForm = readCardForm;
const vnextBaseOpenCardDialog = openCardDialog;
const vnextBaseHoldingSystemFields = holdingSystemFields;
const vnextBaseSaveCardFromForm = saveCardFromForm;
const vnextExistingBindViewEvents = bindViewEvents;
const vnextBaseShowScanReview = showScanReview;
let cardfolioForceEdit = false;
let cropSession = null;
let cropResultResolver = null;

function canonicalFor(h){return h?.canonical_card_id ? state.canonicalCards[h.canonical_card_id] || null : null;}
function canonicalUnitValue(h){
  const c=canonicalFor(h);
  if(hasNumericValue(c?.current_price)) return Number(c.current_price);
  if(hasNumericValue(h?.market_value)) return Number(h.market_value);
  if(hasNumericValue(h?.manual_value)) return Number(h.manual_value);
  return null;
}
function cardValuationStatus(h){
  const c=canonicalFor(h);
  if(c?.valuation_status) return c.valuation_status;
  if(h?.valuation_status) return h.valuation_status;
  return canonicalUnitValue(h)!==null ? 'priced' : 'pending_price';
}
function pendingPrice(h){return canonicalUnitValue(h)===null || ['pending_price','insufficient_data','stale','error'].includes(cardValuationStatus(h));}
function valued(h){return canonicalUnitValue(h)!==null;}
function holdingValue(h){const unit=canonicalUnitValue(h);return (unit===null?0:unit)*Number(h?.quantity||1);}
function currentUnitLabel(h){const unit=canonicalUnitValue(h);return unit===null?'Pending Price':money(unit);}
function displayCardName(h){return h?.display_name?.trim() || h?.subject || 'Untitled card';}
function categoryLabel(category){
  const labels={Basketball:'NBA / Basketball',Soccer:'Soccer',Pokémon:'Pokémon',Baseball:'Baseball',Football:'Football',Hockey:'Hockey',WNBA:'WNBA','UFC / MMA':'UFC / MMA',Wrestling:'Wrestling','Formula 1':'Formula 1',NASCAR:'NASCAR',College:'College',Other:'Other'};
  return labels[category]||category||'Other';
}
function categoryGlyph(category){return ({Basketball:'◉',Soccer:'⬡',Pokémon:'✦',Baseball:'◇',Football:'◆',Hockey:'⬢',WNBA:'◌','UFC / MMA':'◈',Wrestling:'✧','Formula 1':'⌁',NASCAR:'⌁',College:'▣',Other:'□'})[category]||'□';}
function cardIdentityLine(h){return [h.year,h.manufacturer,h.brand,h.set_name,h.card_number&&`#${h.card_number}`,h.parallel].filter(Boolean).join(' · ');}
function clampText(v,max=240){return String(v||'').replace(/\s+/g,' ').trim().slice(0,max);}
function makeSuggestedDisplayName(h){return clampText(h?.subject||'',120) || 'Untitled card';}

async function hydrateCanonicalMarket(){
  state.canonicalCards={};state.canonicalHistory={};state.marketObservations={};
  if(!state.supabase||!state.user)return;
  const ids=[...new Set((state.holdings||[]).map(h=>h.canonical_card_id).filter(Boolean))];
  if(!ids.length)return;
  const [{data:cards,error:ce},{data:history,error:he},{data:obs,error:oe}]=await Promise.all([
    state.supabase.from('canonical_cards').select('*').in('id',ids),
    state.supabase.from('canonical_price_history').select('canonical_card_id,market_price,currency,low,high,sample_size,confidence,method,source_summary,observed_at').in('canonical_card_id',ids).order('observed_at',{ascending:true}),
    state.supabase.from('card_market_observations').select('canonical_card_id,marketplace,source_kind,title,price,currency,condition,provenance_url,sold_at,observed_at,exact_match,match_score').in('canonical_card_id',ids).order('observed_at',{ascending:false}).limit(300)
  ]);
  if(!ce)for(const c of cards||[])state.canonicalCards[c.id]={...c,current_price:hasNumericValue(c.current_price)?Number(c.current_price):null};
  if(!he)for(const p of history||[])(state.canonicalHistory[p.canonical_card_id]||(state.canonicalHistory[p.canonical_card_id]=[])).push({...p,market_price:Number(p.market_price)});
  if(!oe)for(const o of obs||[])(state.marketObservations[o.canonical_card_id]||(state.marketObservations[o.canonical_card_id]=[])).push({...o,price:Number(o.price)});
}

syncCloud=async function(){await vnextBaseSyncCloud();await hydrateCanonicalMarket();};

function toDb(h){
  const out=vnextBaseToDb(h);
  out.canonical_card_id=h.canonical_card_id||null;
  out.valuation_status=h.valuation_status||'pending_price';
  out.display_name=h.display_name||null;
  return out;
}
function holdingSystemFields(source={}){
  return {...vnextBaseHoldingSystemFields(source),canonical_card_id:source.canonical_card_id||null,valuation_status:source.valuation_status||'pending_price'};
}

function ensureEnhancedCardForm(){
  const grid=$('#cardDialog .form-grid');if(!grid||$('#displayName'))return;
  grid.insertAdjacentHTML('afterbegin',`<label class="form-span-2">Display name<input id="displayName" maxlength="140" placeholder="Auto-suggested; customize anytime"/></label>`);
  grid.insertAdjacentHTML('beforeend',`
    <label>Subset / insert<input id="subset" maxlength="120" placeholder="Rookie insert, Debut, Update…"/></label>
    <label>Variation<input id="variation" maxlength="120" placeholder="Image variation, SP, SSP…"/></label>
    <label>Language<input id="cardLanguage" maxlength="40" placeholder="English, Japanese…"/></label>
    <label>Edition<input id="edition" maxlength="80" placeholder="1st Edition, Unlimited…"/></label>`);
  const manual=$('#manualValue')?.closest('label');if(manual){manual.childNodes[0].textContent='Manual value override ($)';manual.title='Optional personal override. Canonical market pricing remains separate.';}
}

function readCardForm(){
  const h=vnextBaseReadCardForm();
  const existing=state.holdings.find(x=>x.id===h.id);
  const priorMeta=existing?.metadata&&typeof existing.metadata==='object'?existing.metadata:{};
  const get=id=>$('#'+id)?.value?.trim?.()||'';
  h.display_name=get('displayName')||existing?.display_name||makeSuggestedDisplayName(h);
  h.metadata={...priorMeta,
    subset:get('subset')||null,
    variation:get('variation')||null,
    language:get('cardLanguage')||null,
    edition:get('edition')||null,
    crop:state.scan?.crop||priorMeta.crop||null,
    ocr_confidence:Number.isFinite(Number(state.scan?.confidence))?Number(state.scan.confidence):(priorMeta.ocr_confidence??null),
    ocr_text:state.scan?.text?String(state.scan.text).slice(0,5000):(priorMeta.ocr_text||null),
    detected_codes:Array.isArray(state.scan?.codes)?state.scan.codes.slice(0,8):(priorMeta.detected_codes||[])
  };
  return h;
}

openCardDialog=function(h=null,prefill=null){
  if(h&&!cardfolioForceEdit){openCardDetail(h);return;}
  ensureEnhancedCardForm();
  vnextBaseOpenCardDialog(h,prefill);
  const data=h||prefill||{};const meta=data.metadata||{};
  $('#displayName').value=data.display_name||makeSuggestedDisplayName(data);
  $('#subset').value=meta.subset||'';$('#variation').value=meta.variation||'';$('#cardLanguage').value=meta.language||'';$('#edition').value=meta.edition||'';
  $('#cardDialogTitle').textContent=h?'Edit your holding':'Confirm card details';
};
function openHoldingEditor(h){cardfolioForceEdit=true;try{openCardDialog(h)}finally{cardfolioForceEdit=false;}}

function canonicalIdentityPayload(h){
  return {category:h.category||'Other',subject:h.subject||'',year:h.year||'',manufacturer:h.manufacturer||'',brand:h.brand||'',set_name:h.set_name||'',card_number:h.card_number||'',parallel:h.parallel||'',serial_number:h.serial_number||'',team:h.team||'',league:h.league||'',rookie:!!h.rookie,autograph:!!h.autograph,relic:!!h.relic,grading_company:h.grading_company||'',grade:h.grade||'',language:h.metadata?.language||'',edition:h.metadata?.edition||''};
}

saveCardFromForm=async function(){
  const draft=readCardForm();if(!draft.subject){toast('Player or character name is required');return;}
  const existing=state.holdings.find(x=>x.id===draft.id);
  let canonicalId=existing?.canonical_card_id||null;
  if(state.backend==='cloud'&&state.user&&state.supabase){
    try{
      const {data,error}=await state.supabase.rpc('resolve_canonical_card',{p_identity:canonicalIdentityPayload(draft)});
      if(error)throw error;canonicalId=data||canonicalId;
    }catch(err){console.warn('Canonical matching deferred',err);}
  }
  if(!state.scan)state.scan={file:null,imageDataUrl:'',fields:{},text:'',confidence:0};
  state.scan.fields={...(state.scan.fields||{}),canonical_card_id:canonicalId,valuation_status:'pending_price',display_name:draft.display_name,metadata:draft.metadata};
  if(existing){existing.canonical_card_id=canonicalId;existing.valuation_status=existing.market_value!=null?'priced':'pending_price';}
  await vnextBaseSaveCardFromForm();
  const saved=state.holdings.find(x=>x.id===draft.id);
  const c=saved?canonicalFor(saved):null;
  toast(c&&hasNumericValue(c.current_price)?'Added · live market record linked':(existing?'Holding updated':'Added · Pending Price'));
};

function ensureCropDialog(){
  if($('#cropDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="cropDialog" class="modal crop-modal"><div class="modal-card liquid-modal"><div class="modal-head"><div><div class="eyebrow">Crop before scan</div><h2>Frame the card</h2><p class="holding-meta">Drag to reposition. Pinch is approximated with the zoom slider. The crop uses a standard trading-card ratio.</p></div><button class="icon-btn" id="cropCancel" aria-label="Cancel">×</button></div><div class="crop-stage"><canvas id="cropCanvas" width="600" height="840" aria-label="Card crop preview"></canvas><div class="crop-guide" aria-hidden="true"></div></div><div class="crop-controls"><label>Zoom<input id="cropZoom" type="range" min="1" max="3" value="1" step="0.01"/></label><div class="button-row"><button class="btn secondary" id="cropRotateLeft" type="button">↺ Rotate</button><button class="btn secondary" id="cropRotateRight" type="button">Rotate ↻</button></div></div><div class="button-row spread"><button class="btn secondary" id="cropUseOriginal" type="button">Use original</button><button class="btn primary" id="cropApply" type="button">Use crop</button></div></div></dialog>`);
  const canvas=$('#cropCanvas');
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(!cropSession)return;canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,dx:cropSession.dx,dy:cropSession.dy};});
  canvas.addEventListener('pointermove',e=>{if(!drag||!cropSession)return;const rect=canvas.getBoundingClientRect(),sx=canvas.width/rect.width,sy=canvas.height/rect.height;cropSession.dx=drag.dx+(e.clientX-drag.x)*sx;cropSession.dy=drag.dy+(e.clientY-drag.y)*sy;renderCrop();});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  $('#cropZoom').addEventListener('input',e=>{if(cropSession){cropSession.zoom=Number(e.target.value);renderCrop();}});
  $('#cropRotateLeft').addEventListener('click',()=>{if(cropSession){cropSession.rotation=(cropSession.rotation+270)%360;cropSession.dx=0;cropSession.dy=0;renderCrop();}});
  $('#cropRotateRight').addEventListener('click',()=>{if(cropSession){cropSession.rotation=(cropSession.rotation+90)%360;cropSession.dx=0;cropSession.dy=0;renderCrop();}});
  $('#cropCancel').addEventListener('click',()=>finishCrop(null));
  $('#cropUseOriginal').addEventListener('click',()=>finishCrop(cropSession?.originalFile||null,{mode:'original'}));
  $('#cropApply').addEventListener('click',applyCropFromCanvas);
}

function renderCrop(){
  if(!cropSession)return;const canvas=$('#cropCanvas'),ctx=canvas.getContext('2d'),img=cropSession.img,W=canvas.width,H=canvas.height;
  const quarter=cropSession.rotation%180!==0,rw=quarter?img.naturalHeight:img.naturalWidth,rh=quarter?img.naturalWidth:img.naturalHeight;
  const base=Math.max(W/rw,H/rh),scale=base*cropSession.zoom;
  const boundW=rw*scale,boundH=rh*scale,maxX=Math.max(0,(boundW-W)/2),maxY=Math.max(0,(boundH-H)/2);
  cropSession.dx=Math.max(-maxX,Math.min(maxX,cropSession.dx));cropSession.dy=Math.max(-maxY,Math.min(maxY,cropSession.dy));
  ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(W/2+cropSession.dx,H/2+cropSession.dy);ctx.rotate(cropSession.rotation*Math.PI/180);ctx.scale(scale,scale);ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);ctx.restore();
}
function finishCrop(file,meta=null){const d=$('#cropDialog');if(d.open)d.close();const resolve=cropResultResolver;cropResultResolver=null;cropSession=null;if(resolve)resolve(file?{file,meta}:null);}
function applyCropFromCanvas(){const canvas=$('#cropCanvas');if(!cropSession||!canvas)return;canvas.toBlob(blob=>{if(!blob){finishCrop(null);return;}const file=new File([blob],`card-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});finishCrop(file,{mode:'crop',rotation:cropSession.rotation,zoom:Number(cropSession.zoom.toFixed(2)),ratio:'2.5:3.5'});},'image/jpeg',.9);}
async function cropImageFile(file){
  ensureCropDialog();const url=URL.createObjectURL(file);const img=new Image();
  try{await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});}
  catch{URL.revokeObjectURL(url);return {file,meta:{mode:'original',reason:'preview_unavailable'}};}
  URL.revokeObjectURL(url);cropSession={img,originalFile:file,zoom:1,rotation:0,dx:0,dy:0};$('#cropZoom').value='1';renderCrop();$('#cropDialog').showModal();
  return new Promise(resolve=>{cropResultResolver=resolve;});
}

async function makeOcrEnhancedBlob(file){
  try{const bitmap=await createImageBitmap(file),max=1800,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.filter='grayscale(1) contrast(1.55) brightness(1.05)';ctx.drawImage(bitmap,0,0,w,h);return await new Promise(res=>canvas.toBlob(res,'image/jpeg',.9));}catch{return null;}
}
async function detectOnDeviceCodes(file){
  if(!('BarcodeDetector'in window))return[];try{const detector=new BarcodeDetector({formats:['qr_code','code_128','ean_13','ean_8','upc_a','upc_e']});const bitmap=await createImageBitmap(file),codes=await detector.detect(bitmap);return codes.map(x=>clampText(x.rawValue,160)).filter(Boolean).slice(0,8);}catch{return[];}
}
async function recognizeCardText(file,status){
  if(!window.Tesseract)throw new Error('OCR library unavailable');
  const enhanced=await makeOcrEnhancedBlob(file);const primary=enhanced||file;
  const run=async(input,label)=>window.Tesseract.recognize(input,'eng',{logger:m=>{if(m.status==='recognizing text')status.textContent=`${label} · ${Math.round((m.progress||0)*100)}%`;}});
  status.textContent='Reading card details on-device…';const a=await run(primary,'Reading card');let texts=[a.data.text||''],conf=[Number(a.data.confidence||0)];
  if(conf[0]<74){status.textContent='Running a second OCR pass…';try{const b=await run(file,'Second pass');texts.push(b.data.text||'');conf.push(Number(b.data.confidence||0));}catch{}}
  const lines=[];for(const text of texts)for(const line of text.split(/\n+/)){const clean=line.trim();if(clean&&!lines.some(x=>x.toLowerCase()===clean.toLowerCase()))lines.push(clean);}
  return {text:lines.join('\n'),confidence:Math.round(Math.max(...conf,0))};
}

parseOcr=function(text){
  const clean=String(text||'').replace(/[|]/g,' ').split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),upper=clean.join('\n').toUpperCase();
  let category='Other';for(const [cat,hints] of Object.entries(categoryHints))if(hints.some(h=>upper.includes(h))){category=cat;break;}
  if(category==='Other'&&/\bNBA\b/.test(upper))category='Basketball';if(category==='Other'&&/\bMLB\b/.test(upper))category='Baseball';if(category==='Other'&&/\bNFL\b/.test(upper))category='Football';
  const year=(upper.match(/\b(?:19|20)\d{2}(?:[-–/]\d{2,4})?\b/)||[])[0]||'';
  const manufacturer=brands.find(b=>upper.includes(b))||(/TOPPS/.test(upper)?'TOPPS':'');
  const cardPatterns=[/(?:CARD\s*(?:NO\.?|#)|NO\.?|#)\s*[:.-]?\s*([A-Z0-9-]{1,18})\b/i,/\b([A-Z]{1,5}-\d{1,4})\b/];let card_number='';for(const rx of cardPatterns){const m=text.match(rx);if(m?.[1]){card_number=m[1];break;}}
  const serial=(text.match(/\b(\d{1,5}\s*\/\s*\d{1,6})\b/)||[])[1]?.replace(/\s/g,'')||'';
  const grader=(upper.match(/\b(PSA|BGS|BECKETT|CGC|SGC|TAG)\b/)||[])[1]||'';let grade='';if(grader){const gm=upper.match(new RegExp(`(?:${grader}|GRADE)\\s*(?:GEM MINT|MINT|NM-MT|NM)?\\s*([1-9](?:\\.5)?|10)\\b`));grade=gm?.[1]||'';}
  const parallelTerms=['SUPERFRACTOR','REFRACTOR','X-FRACTOR','PRIZM','SILVER','GOLD','GREEN','BLUE','RED','PURPLE','ORANGE','BLACK','SEPIA','NEGATIVE','MOJO','SHIMMER','WAVE','SAPPHIRE','AQUA','PINK','IMAGE VARIATION','VARIATION','SSP',' SP '];
  let parallel='';for(const term of parallelTerms){if(upper.includes(term)){parallel=term.trim().replace('PRIZM','Prizm').replace('REFRACTOR','Refractor');break;}}
  const ignore=new Set(['NBA','NFL','MLB','NHL','FIFA','UEFA','TOPPS','PANINI','PRIZM','SELECT','MOSAIC','OPTIC','DONRUSS','UPPER DECK','POKEMON','POKÉMON','ROOKIE CARD']);
  const candidates=clean.filter(line=>{const u=line.toUpperCase();return /[A-Z]/i.test(line)&&line.length>=3&&line.length<=44&&!/^\d/.test(line)&&!ignore.has(u)&&!brands.some(b=>u===b)&&!/COPYRIGHT|TRADEMARK|AUTHENTIC|CONGRATULATIONS|GUARANTEED|WWW\.|HTTP|CARD NO|MADE IN|PRINTED IN/i.test(u);});
  const subject=candidates.sort((a,b)=>{const aw=(a.match(/[A-Za-z]+/g)||[]).length,bw=(b.match(/[A-Za-z]+/g)||[]).length;return (bw>=2?3:0)+(b===b.toUpperCase()?1:0)-((aw>=2?3:0)+(a===a.toUpperCase()?1:0));})[0]||'';
  let language='';if(/[ぁ-んァ-ン一-龯]/.test(text))language='Japanese';else if(/[가-힣]/.test(text))language='Korean';
  let edition='';const em=upper.match(/\b(1ST EDITION|FIRST EDITION|UNLIMITED|SHADOWLESS)\b/);if(em)edition=em[1].replace('1ST','1st');
  return {category,subject,year,manufacturer:manufacturer.replace('POKEMON','Pokémon'),card_number,parallel,serial_number:serial,rookie:/\bRC\b|ROOKIE/i.test(upper),autograph:/AUTOGRAPH|AUTO\b|SIGNATURE|SIGNED/i.test(upper),relic:/RELIC|MEMORABILIA|JERSEY|PATCH|GAME[- ]USED/i.test(upper),grading_company:grader==='BECKETT'?'BGS':grader,grade,metadata:{language,edition,ocr_lines:clean.slice(0,60)}};
};

async function processCroppedCard(cropped,originalFile){
  const file=cropped.file,status=$('#scanStatus');status.textContent='Preparing crop…';const preview=await fileToPreview(file);state.scan={originalFile,file,imageDataUrl:preview,text:'',confidence:0,fields:{},crop:cropped.meta||{mode:'original'},codes:[]};
  try{
    const [ocr,codes]=await Promise.all([recognizeCardText(file,status),detectOnDeviceCodes(file)]);state.scan.text=ocr.text;state.scan.confidence=ocr.confidence;state.scan.codes=codes;state.scan.fields=parseOcr(ocr.text);state.scan.fields.metadata={...(state.scan.fields.metadata||{}),detected_codes:codes};showScanReview();status.textContent='';
  }catch(err){console.warn('Card OCR failed',err);status.textContent='OCR could not finish. The cropped photo is preserved; confirm details manually.';openCardDialog(null,{category:'Other',subject:'',quantity:1,condition:'Raw — unknown',metadata:{crop:cropped.meta||null}});}
}
scanFile=async function(file){
  if(!file)return;if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'image/jpeg')){toast('Use an image file');return}if(file.size>15*1024*1024){toast('Image is too large');return}
  const cropped=await cropImageFile(file);if(!cropped)return;await processCroppedCard(cropped,file);
};

showScanReview=function(){
  vnextBaseShowScanReview();const f=state.scan?.fields||{},modal=$('#scanReviewDialog .modal-card');let summary=$('#scanExtractedSummary');if(!summary){const confidence=$('#scanReviewDialog .confidence-card');confidence.insertAdjacentHTML('afterend','<div id="scanExtractedSummary" class="scan-extracted"></div>');summary=$('#scanExtractedSummary');const row=$('#scanReviewDialog .button-row');row.insertAdjacentHTML('afterbegin','<button id="recropBtn" class="btn secondary" type="button">Crop again</button>');$('#recropBtn').addEventListener('click',async()=>{const original=state.scan?.originalFile;if(!original)return;$('#scanReviewDialog').close();const cropped=await cropImageFile(original);if(cropped)await processCroppedCard(cropped,original);});}
  const fields=[['Category',f.category],['Player / character',f.subject],['Year',f.year],['Maker',f.manufacturer],['Card #',f.card_number],['Parallel',f.parallel],['Serial',f.serial_number],['Grade',f.grading_company&&`${f.grading_company} ${f.grade||''}`],['Rookie',f.rookie?'Yes':''],['Auto',f.autograph?'Yes':''],['Relic',f.relic?'Yes':'']].filter(([,v])=>v);
  summary.innerHTML=`<div class="eyebrow">Detected details</div><div class="extracted-grid">${fields.map(([k,v])=>`<div><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')||'<div class="holding-meta">No reliable identity fields were detected. Confirm manually.</div>'}</div><div class="holding-meta">OCR is evidence, not final identity. You approve every field before saving.</div>`;
};

useScanFields=function(){
  const f={...(state.scan?.fields||{})},meta={...(f.metadata||{})};delete f.metadata;$('#scanReviewDialog').close();openCardDialog(null,{...f,display_name:makeSuggestedDisplayName(f),metadata:meta,condition:'Raw — unknown',quantity:1});
};

function priceHistorySvg(hist,label='Market price'){
  if(!hist||hist.length<2)return `<div class="asset-chart empty-chart"><div><strong>${label}</strong><span>History begins when Cardfolio records real market observations. No synthetic backfill.</span></div></div>`;
  const w=720,h=230,vals=hist.map(x=>Number(x.market_price??x.value)).filter(Number.isFinite),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
  const pts=hist.map((x,i)=>`${(i/(hist.length-1))*w},${h-18-((Number(x.market_price??x.value)-min)/span)*(h-36)}`).join(' '),last=vals.at(-1),first=vals[0],positive=last>=first;
  return `<div class="asset-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${positive?'#34c759':'#ff3b30'}" stop-opacity=".18"/><stop offset="1" stop-color="${positive?'#34c759':'#ff3b30'}" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#chartFill)"/><polyline points="${pts}" fill="none" stroke="${positive?'#34c759':'#ff3b30'}" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
}
function historyChart(hist){return priceHistorySvg((hist||[]).map(x=>({market_price:x.value,observed_at:x.date})),'Portfolio value')+`<div class="timeline-note">Built only from recorded Cardfolio valuations.</div>`;}

function portfolioHistory(){
  const groups={};for(const s of state.snapshots||[]){const d=(s.observed_at||'').slice(0,10);if(!d)continue;groups[d]=(groups[d]||0)+Number(s.market_value||0)*Number(s.quantity||1)}
  return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
}

function holdingList(list){
  if(!list.length)return `<div class="empty"><div class="empty-icon">◇</div><strong>No cards yet</strong><p>Scan or add your first card.</p></div>`;
  return `<div class="holding-list modern-holdings">${list.map(h=>{const c=canonicalFor(h),status=cardValuationStatus(h),pending=!valued(h);return `<article class="holding asset-row" data-card-id="${escapeHtml(h.id)}">${h.image_url?`<img class="thumb" src="${escapeHtml(h.image_url)}" alt="${escapeHtml(displayCardName(h))}"/>`:`<div class="thumb placeholder">${categoryGlyph(h.category)}</div>`}<div><div class="holding-name">${escapeHtml(displayCardName(h))}</div><div class="holding-meta">${escapeHtml(cardIdentityLine(h)||categoryLabel(h.category))}</div><div class="asset-badges">${h.rookie?'<span>RC</span>':''}${h.autograph?'<span>Auto</span>':''}${h.relic?'<span>Relic</span>':''}${h.serial_number?`<span>${escapeHtml(h.serial_number)}</span>`:''}</div></div><div class="value-col"><strong class="${pending?'pending-text':''}">${pending?'Pending Price':money(holdingValue(h))}</strong><div class="source-tag ${pending?'pending-pill':''}">${pending?'Hourly research queued':escapeHtml(c?.valuation_source_summary||h.valuation_source||'Market priced')}</div></div><div class="value-col"><strong>${escapeHtml(h.grading_company?`${h.grading_company} ${h.grade||''}`:'Raw')}</strong><div class="holding-meta">×${Number(h.quantity||1)}</div></div></article>`;}).join('')}</div>`;
}

function homeView(){
  const m=metrics(),hist=portfolioHistory(),pending=state.holdings.filter(h=>!valued(h)).length,last=hist.at(-1)?.value??m.value,prev=hist.length>1?hist.at(-2).value:last,delta=last-prev,deltaPct=prev?delta/prev*100:0;
  return `<div class="dashboard-shell"><section class="liquid-card portfolio-hero-vnext"><div class="portfolio-toolbar"><div><div class="eyebrow">Total portfolio value</div><div class="portfolio-value">${money(m.value)}</div><div class="market-change ${delta>=0?'good':'bad'}">${delta>=0?'+':''}${money(delta)} (${delta>=0?'+':''}${pct(deltaPct)}) <span>latest recorded move</span></div></div><button class="round-action" data-view="scan" aria-label="Scan a card">＋</button></div>${historyChart(hist)}<div class="range-row"><span class="active">LIVE</span><span>1W</span><span>1M</span><span>3M</span><span>ALL</span></div><div class="metric-strip glass-metrics"><div><span>Cost basis</span><strong>${money(m.cost)}</strong></div><div><span>Cards</span><strong>${m.total}</strong></div><div><span>Pending</span><strong>${pending}</strong></div></div></section><div class="dashboard-grid"><section class="liquid-card"><div class="section-head"><div><div class="eyebrow">Collection</div><h2>Recently added</h2></div><button class="text-action" data-view="portfolio">See all</button></div>${holdingList(state.holdings.slice(0,5))}</section><section class="liquid-card"><div class="section-head"><div><div class="eyebrow">Allocation</div><h2>By category</h2></div></div>${allocationHtml()}<div class="market-loop-note"><span class="pulse-dot"></span><div><strong>Hourly market loop</strong><p>${pending?`${pending} holding${pending===1?'':'s'} awaiting market research.`:'All current holdings have a market value.'}</p></div></div></section></div></div>`;
}

function categorySort(a,b){const order=['Basketball','Soccer','Pokémon','Baseball','Football','Hockey','WNBA','UFC / MMA','Wrestling','Formula 1','NASCAR','College','Other'];return (order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b));}
function portfolioView(){
  const q=state.filter.q.toLowerCase().trim(),pricing=state.filter.pricing;
  const filtered=state.holdings.filter(h=>{const text=[h.display_name,h.subject,h.team,h.year,h.manufacturer,h.brand,h.set_name,h.card_number,h.parallel,h.grading_company,h.grade].join(' ').toLowerCase();return(!q||text.includes(q))&&(pricing==='All'||(pricing==='Priced'?valued(h):!valued(h)));});
  const groups={};for(const h of filtered)(groups[h.category||'Other']||(groups[h.category||'Other']=[])).push(h);const cats=Object.keys(groups).sort(categorySort);
  return `<div class="portfolio-page"><section class="portfolio-header"><div><div class="eyebrow">Your collection</div><h2>Card portfolio</h2><p>${filtered.length} holding${filtered.length===1?'':'s'} · shared exact-card market records</p></div><button class="btn primary" id="portfolioAdd">＋ Add card</button></section><div class="filters liquid-filters"><input class="search-input" id="portfolioSearch" placeholder="Search player, set, card #…" value="${escapeHtml(state.filter.q)}"/><select id="pricingFilter"><option ${pricing==='All'?'selected':''}>All</option><option ${pricing==='Priced'?'selected':''}>Priced</option><option ${pricing==='Unpriced'?'selected':''}>Unpriced</option></select></div><div class="category-stack">${cats.length?cats.map(cat=>categoryAlbum(cat,groups[cat])).join(''):`<section class="liquid-card"><div class="empty"><div class="empty-icon">◇</div><strong>No matching cards</strong><p>Scan a card or clear the filters.</p></div></section>`}</div></div>`;
}
function categoryAlbum(cat,list){
  const total=list.reduce((s,h)=>s+holdingValue(h),0),pending=list.filter(h=>!valued(h)).length,open=state.openCategories.has(cat)||state.openCategories.size===0;
  return `<section class="category-album liquid-card ${open?'open':''}"><button class="category-toggle" data-category-toggle="${escapeHtml(cat)}"><div class="category-icon">${categoryGlyph(cat)}</div><div><strong>${escapeHtml(categoryLabel(cat))}</strong><span>${list.length} card${list.length===1?'':'s'}${pending?` · ${pending} pending`:''}</span></div><div class="category-value"><strong>${money(total)}</strong><span class="chevron">⌄</span></div></button><div class="album-grid">${list.map(h=>albumCard(h)).join('')}</div></section>`;
}
function albumCard(h){const unit=canonicalUnitValue(h);return `<button class="album-card" data-card-id="${escapeHtml(h.id)}">${h.image_url?`<img src="${escapeHtml(h.image_url)}" alt="${escapeHtml(displayCardName(h))}"/>`:`<div class="album-placeholder">${categoryGlyph(h.category)}</div>`}<span class="album-card-info"><strong>${escapeHtml(displayCardName(h))}</strong><small>${escapeHtml([h.year,h.brand||h.manufacturer,h.card_number&&'#'+h.card_number,h.parallel].filter(Boolean).join(' · '))}</small><b class="${unit===null?'pending-text':''}">${unit===null?'Pending Price':money(unit)}</b></span></button>`;}

function scanView(){return `<div class="scan-layout"><section class="liquid-card scan-hero"><div class="scan-orb">◎</div><div><div class="eyebrow">Camera-first intake</div><h2>Scan your card</h2><p>Upload → crop → on-device OCR → confirm → portfolio. The card appears immediately as <strong>Pending Price</strong> until the hourly market loop has enough real evidence.</p></div><input id="cameraInput" class="capture-input" type="file" accept="image/*" capture="environment"/><input id="uploadInput" class="capture-input" type="file" accept="image/*"/><div class="button-row"><button id="cameraBtn" class="btn primary">Open camera</button><button id="uploadBtn" class="btn secondary">Choose photo</button></div><div id="scanStatus" class="scan-status"></div></section><aside class="scan-sidebar"><div class="liquid-card"><div class="eyebrow">What Cardfolio reads</div><div class="feature-list"><span>Player / character</span><span>Year / season</span><span>Manufacturer + product</span><span>Set + card number</span><span>Parallel / variation</span><span>Serial numbering</span><span>Rookie / autograph / relic</span><span>Grading cues</span><span>Language / edition</span></div></div><div class="liquid-card"><div class="eyebrow">Identity rule</div><p class="muted">Base, auto, relic, numbered parallel and graded versions are never intentionally merged. If evidence is weak, Cardfolio asks you to confirm instead of guessing.</p></div></aside></div>`;}

function metrics(){const priced=state.holdings.filter(valued),value=priced.reduce((a,h)=>a+holdingValue(h),0),cost=state.holdings.reduce((a,h)=>a+(Number(h.cost_basis)||0)*Number(h.quantity||1),0),pnl=value-cost;return{priced,value,cost,pnl,pnlPct:cost?pnl/cost*100:0,total:state.holdings.reduce((a,h)=>a+Number(h.quantity||1),0)}}

function ensureCardDetailDialog(){
  if($('#cardDetailDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="cardDetailDialog" class="modal asset-detail-modal"><div class="modal-card liquid-modal asset-detail-shell"><div class="asset-detail-topbar"><button class="icon-btn" id="assetDetailClose" aria-label="Close">×</button><button class="btn secondary" id="assetDetailEdit">Edit holding</button></div><div id="assetDetailContent"></div></div></dialog>`);
  $('#assetDetailClose').addEventListener('click',()=>$('#cardDetailDialog').close());
}
function openCardDetail(h){
  ensureCardDetailDialog();const c=canonicalFor(h),hist=h.canonical_card_id?(state.canonicalHistory[h.canonical_card_id]||[]):[],obs=h.canonical_card_id?(state.marketObservations[h.canonical_card_id]||[]):[],unit=canonicalUnitValue(h),status=cardValuationStatus(h),priced=unit!==null;
  const latest=hist.at(-1),first=hist[0],change=latest&&first?Number(latest.market_price)-Number(first.market_price):0,changePct=first?.market_price?change/Number(first.market_price)*100:0;
  $('#assetDetailContent').innerHTML=`<div class="asset-hero"><div class="asset-image-wrap">${h.image_url?`<img src="${escapeHtml(h.image_url)}" alt="${escapeHtml(displayCardName(h))}"/>`:`<div class="asset-image-placeholder">${categoryGlyph(h.category)}</div>`}</div><div class="asset-title"><div class="eyebrow">${escapeHtml(categoryLabel(h.category))}</div><h1>${escapeHtml(displayCardName(h))}</h1><p>${escapeHtml(cardIdentityLine(h))}</p><div class="asset-price ${priced?'':'pending-text'}">${priced?money(unit):'Pending Price'}</div>${priced&&hist.length>1?`<div class="market-change ${change>=0?'good':'bad'}">${change>=0?'+':''}${money(change)} (${change>=0?'+':''}${pct(changePct)}) recorded history</div>`:`<div class="pending-caption">${status==='insufficient_data'?'More exact sold evidence is needed.':'Queued for hourly market research.'}</div>`}</div></div><section class="asset-chart-section">${priceHistorySvg(hist,'Card market history')}<div class="range-row"><span class="active">LIVE</span><span>1W</span><span>1M</span><span>3M</span><span>ALL</span></div></section><div class="asset-detail-grid"><section class="detail-panel"><div class="eyebrow">Cardfolio analyst</div>${analystHtml(c)}</section><section class="detail-panel"><div class="eyebrow">Market evidence</div>${marketEvidenceHtml(c,obs)}</section></div><section class="detail-panel"><div class="eyebrow">Exact identity</div><div class="identity-grid">${identityRows(h,c)}</div></section>`;
  $('#assetDetailEdit').onclick=()=>{$('#cardDetailDialog').close();openHoldingEditor(h);};$('#cardDetailDialog').showModal();
}
function analystHtml(c){
  if(!c?.analyst_bull&&!c?.analyst_base&&!c?.analyst_bear)return `<div class="analysis-pending"><span class="pulse-dot"></span><div><strong>Analysis pending</strong><p>The hourly loop will add evidence-based bull/base/bear notes after market research. No opinion is invented before evidence exists.</p></div></div>`;
  return `<div class="analyst-cards"><div class="analyst bull"><span>Bull</span><p>${escapeHtml(c.analyst_bull||'No distinct bull case yet.')}</p></div><div class="analyst base"><span>Base</span><p>${escapeHtml(c.analyst_base||'No base case yet.')}</p></div><div class="analyst bear"><span>Bear</span><p>${escapeHtml(c.analyst_bear||'No distinct bear case yet.')}</p></div></div>`;
}
function marketEvidenceHtml(c,obs){
  if(!c||!hasNumericValue(c.current_price))return `<div class="analysis-pending"><div><strong>Pending Price</strong><p>Exact sold comps are prioritized. Active listings are secondary context and never silently treated as completed sales.</p></div></div>`;
  const exact=(obs||[]).filter(o=>o.exact_match).slice(0,5),confidence=hasNumericValue(c.valuation_confidence)?Math.round(Number(c.valuation_confidence)*100):null;
  return `<div class="market-summary"><div><span>Current</span><strong>${money(c.current_price)}</strong></div><div><span>Sample</span><strong>${Number(c.valuation_sample_size||0)}</strong></div><div><span>Confidence</span><strong>${confidence===null?'—':confidence+'%'}</strong></div></div><p class="holding-meta">${escapeHtml(c.valuation_source_summary||c.valuation_method||'Cardfolio market model')}</p>${exact.length?`<div class="evidence-list">${exact.map(o=>`<${o.provenance_url?'a':'div'} class="evidence-row" ${o.provenance_url?`href="${escapeHtml(o.provenance_url)}" target="_blank" rel="noopener noreferrer"`:''}><div><strong>${escapeHtml(o.marketplace)}</strong><span>${escapeHtml(o.source_kind)}${o.sold_at?` · ${new Date(o.sold_at).toLocaleDateString()}`:''}</span></div><b>${o.currency==='USD'?money(o.price):`${o.price} ${escapeHtml(o.currency)}`}</b></${o.provenance_url?'a':'div'}>`).join('')}</div>`:''}`;
}
function identityRows(h,c){const rows=[['Player / character',h.subject],['Year',h.year],['Manufacturer',h.manufacturer],['Product',h.brand],['Set',h.set_name],['Card #',h.card_number],['Parallel',h.parallel],['Serial',h.serial_number],['Team / club',h.team],['League',h.league],['Grade',h.grading_company?`${h.grading_company} ${h.grade||''}`:'Raw'],['Language',h.metadata?.language],['Edition',h.metadata?.edition],['Status',valued(h)?'Priced':'Pending Price']].filter(([,v])=>v);return rows.map(([k,v])=>`<div><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');}

function profileView(){const cloud=state.backend==='cloud';return `<div class="profile-grid"><section class="liquid-card"><div class="eyebrow">Account</div><h2>${state.user?'Your Cardfolio':'Sync your portfolio'}</h2><p class="muted">${state.user?`Signed in as ${escapeHtml(state.user.email||'user')}. Holdings are private; canonical market records are shared across owners of the same exact card.`:'Sign in to sync your private holdings across devices and link them to shared exact-card market records.'}</p><div class="button-row">${cloud&&!state.user?'<button class="btn google-btn" id="profileGoogleSignin">Continue with Google</button><button class="btn secondary" id="profileSignin">Email sign in</button>':''}<button class="btn secondary" id="exportBtn">Export JSON</button></div></section><section class="liquid-card"><div class="eyebrow">Market engine</div><h2>Hourly research</h2><div class="market-loop-note"><span class="pulse-dot"></span><div><strong>${state.holdings.filter(h=>!valued(h)).length} pending</strong><p>Each exact card is researched as one shared market asset. New valid prices propagate to every owner of that exact variant.</p></div></div><div class="market-summary"><div><span>Holdings</span><strong>${state.holdings.length}</strong></div><div><span>Snapshots</span><strong>${state.snapshots.length}</strong></div><div><span>Shared assets</span><strong>${Object.keys(state.canonicalCards).length}</strong></div></div></section></div>`;}

async function signInWithGoogle(){
  if(state.backend!=='cloud'||!state.supabase){toast('Cloud auth is not available');return;}
  const {error}=await state.supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});if(error){console.warn(error);toast('Google sign-in needs provider configuration');}
}
function ensureGoogleAuthButton(){
  // The product layer owns the Google button and its canonical return path.
  if($('#googleLoginBtn')){$('#googleSignInBtn')?.remove();return;}
  const authRow=$('#authDialog .button-row');if(authRow&&!$('#googleSignInBtn'))authRow.insertAdjacentHTML('beforebegin','<button type="button" id="googleSignInBtn" class="btn google-btn full-btn">Continue with Google</button>');
  $('#googleSignInBtn')?.addEventListener('click',signInWithGoogle);
}

bindViewEvents=function(){
  vnextExistingBindViewEvents();
  $$('[data-category-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const cat=btn.dataset.categoryToggle;if(state.openCategories.has(cat))state.openCategories.delete(cat);else state.openCategories.add(cat);const section=btn.closest('.category-album');section?.classList.toggle('open');}));
  $('#profileGoogleSignin')?.addEventListener('click',signInWithGoogle);
};

function applyLiquidChrome(){
  ensureEnhancedCardForm();ensureGoogleAuthButton();
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content','#f5f7fb');
  document.documentElement.classList.add('cardfolio-liquid');
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(applyLiquidChrome,0));
