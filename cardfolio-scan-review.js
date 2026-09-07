// Cardfolio Vision Zero v1 — local visual fingerprinting + private expert-review queue.
// No paid OpenAI API call occurs during scanning. OCR and visual signatures are computed on-device.
(function(){
  const fieldOrder=[
    ['category','Category'],['subject','Player / character'],['year','Year'],['manufacturer','Manufacturer'],
    ['brand','Brand / product'],['set_name','Set'],['subset','Subset / insert'],['card_number','Card #'],
    ['parallel','Parallel'],['variant_name','Image variation'],['serial_number','Serial'],
    ['language','Language'],['edition','Edition'],['team','Team / club'],['league','League'],
    ['grading_company','Grading company'],['grade','Grade']
  ];

  function ensurePanels(){
    const raw=document.getElementById('rawOcr');
    if(!raw)return;
    if(!document.getElementById('scanVisionReview')){
      const vision=document.createElement('section');
      vision.id='scanVisionReview';
      vision.className='scan-structured-review';
      vision.setAttribute('aria-label','Cardfolio visual card analysis');
      raw.insertAdjacentElement('beforebegin',vision);
    }
    if(!document.getElementById('scanStructuredReview')){
      const panel=document.createElement('section');
      panel.id='scanStructuredReview';
      panel.className='scan-structured-review';
      panel.setAttribute('aria-label','Extracted card fields');
      raw.insertAdjacentElement('beforebegin',panel);
    }
  }

  function bytesToHex(bytes){return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')}
  async function sha256Buffer(buffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return bytesToHex(new Uint8Array(digest))}
  async function exactFileHash(file,dataUrl){
    if(file?.arrayBuffer)return await sha256Buffer(await file.arrayBuffer());
    return await sha256Buffer(new TextEncoder().encode(String(dataUrl||'')));
  }
  function loadImage(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.decoding='async';
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('Image preview could not be decoded'));
      img.src=src;
    });
  }
  async function perceptualDHash(dataUrl){
    const img=await loadImage(dataUrl);
    const canvas=document.createElement('canvas');
    canvas.width=9;canvas.height=8;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,9,8);
    const px=ctx.getImageData(0,0,9,8).data;
    const gray=[];
    for(let i=0;i<px.length;i+=4)gray.push(Math.round(px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114));
    let bits='';
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits+=gray[y*9+x]>gray[y*9+x+1]?'1':'0';
    let hex='';
    for(let i=0;i<bits.length;i+=4)hex+=parseInt(bits.slice(i,i+4),2).toString(16);
    return {dhash64:hex.padStart(16,'0'),width:Number(img.naturalWidth||img.width||0),height:Number(img.naturalHeight||img.height||0)};
  }

  async function buildLocalVisualSignature(){
    if(typeof state==='undefined'||!state.scan?.imageDataUrl)return null;
    if(state.scan.localVisualSignature)return state.scan.localVisualSignature;
    const createdAt=new Date().toISOString();
    let exact='',visual={dhash64:'',width:0,height:0};
    try{exact=await exactFileHash(state.scan.file,state.scan.imageDataUrl)}catch{}
    try{visual=await perceptualDHash(state.scan.imageDataUrl)}catch{}
    const signature={
      source:'cardfolio_local_v1',
      image_sha256:exact,
      dhash64:visual.dhash64||'',
      width:visual.width||0,
      height:visual.height||0,
      generated_at:createdAt
    };
    state.scan.localVisualSignature=signature;
    return signature;
  }

  async function analyzeScanWithVision(){
    if(typeof state==='undefined'||!state.scan?.imageDataUrl)return null;
    state.scan.visionStatus='local_processing';
    state.scan.visionError='';
    renderVisionReview();
    state.scan.fields=state.scan.fields||{};
    try{
      const signature=await buildLocalVisualSignature();
      const signedIn=!!(state.supabase&&state.user);
      state.scan.fields.metadata={
        ...(state.scan.fields.metadata||{}),
        needs_visual_analysis:true,
        visual_analysis_status:signedIn?'expert_queue_after_save':'local_only',
        expert_review_status:signedIn?'queued_after_save':'signin_required',
        local_visual_signature:signature||{source:'cardfolio_local_v1',generated_at:new Date().toISOString()}
      };
      state.scan.visionStatus=signedIn?'queued':'signin_required';
      renderVisionReview();
      return signature;
    }catch(err){
      const signedIn=!!(state.supabase&&state.user);
      state.scan.visionError=String(err?.message||'Local visual fingerprinting could not complete.');
      state.scan.fields.metadata={
        ...(state.scan.fields.metadata||{}),
        needs_visual_analysis:true,
        visual_analysis_status:signedIn?'expert_queue_after_save':'local_only',
        expert_review_status:signedIn?'queued_after_save':'signin_required',
        local_visual_error:state.scan.visionError.slice(0,240)
      };
      state.scan.visionStatus=signedIn?'queued_degraded':'signin_required';
      renderVisionReview();
      return null;
    }
  }

  function renderVisionReview(){
    ensurePanels();
    const panel=document.getElementById('scanVisionReview');
    if(!panel||typeof state==='undefined'||!state.scan)return;
    const status=state.scan.visionStatus||'idle';
    const sig=state.scan.localVisualSignature||state.scan.fields?.metadata?.local_visual_signature||{};
    const hashReady=!!sig.image_sha256;
    const pHashReady=!!sig.dhash64;

    if(status==='local_processing'){
      panel.innerHTML='<div class="inline-note"><strong>Cardfolio Vision Zero</strong> · Building a private on-device visual fingerprint…</div>';
      return;
    }
    if(status==='queued'||status==='queued_degraded'){
      panel.innerHTML=`<div class="scan-review-warning" role="note"><strong>Cardfolio Vision Zero · ready.</strong> ${hashReady?'Exact-image fingerprint captured. ':''}${pHashReady?'Perceptual visual hash captured. ':''}Save this card and the private photo enters the expert-review queue.</div><div class="holding-meta">The scan itself makes no paid OpenAI API call. The hourly Cardfolio expert loop can inspect unresolved images, research the exact card, and write evidence back to your portfolio.</div>${status==='queued_degraded'?'<div class="inline-note">Some local visual features were unavailable, but the saved private photo can still be reviewed by the expert loop.</div>':''}`;
      return;
    }
    if(status==='signin_required'){
      panel.innerHTML=`<div class="scan-review-warning" role="note"><strong>Cardfolio Vision Zero · local analysis ready.</strong> ${hashReady||pHashReady?'A local visual fingerprint was captured. ':''}Sign in before saving if you want this private image added to the hourly expert-review queue.</div><div class="holding-meta">No paid GPT API call was made.</div>`;
      return;
    }
    panel.innerHTML='<div class="inline-note"><strong>Cardfolio Vision Zero</strong> · Visual fingerprinting will run after the image is prepared.</div>';
  }

  function renderStructuredReview(){
    ensurePanels();
    const panel=document.getElementById('scanStructuredReview');
    if(!panel||typeof state==='undefined'||!state.scan)return;
    const fields=state.scan.fields||{};
    const confidence=Number(state.scan.confidence||0);
    const warning=confidence<45
      ? 'Low OCR confidence — verify every field before saving.'
      : confidence<70
        ? 'Moderate OCR confidence — review names, numbers, and year carefully.'
        : 'OCR confidence is relatively strong, but OCR is not exact card identity.';
    const rows=fieldOrder
      .filter(([key])=>fields[key]!==undefined&&fields[key]!==null&&String(fields[key]).trim()!=='')
      .map(([key,label])=>`<div class="scan-field-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(fields[key]))}</strong></div>`)
      .join('');
    const flags=[fields.rookie&&'Rookie / RC',fields.autograph&&'Autograph',fields.relic&&'Relic / memorabilia'].filter(Boolean);
    panel.innerHTML=`<div class="scan-review-warning" role="note"><strong>Review required.</strong> ${escapeHtml(warning)}</div>${rows?`<div class="scan-field-grid">${rows}</div>`:'<div class="inline-note">No structured fields were extracted. Add the card manually rather than guessing.</div>'}${flags.length?`<div class="holding-meta">Detected flags: ${flags.map(escapeHtml).join(' · ')}</div>`:''}`;
  }

  window.cardfolioAnalyzeScanWithVision=analyzeScanWithVision;
  window.cardfolioBuildLocalVisualSignature=buildLocalVisualSignature;
  window.cardfolioRenderVisionReview=renderVisionReview;

  const originalScanFile=window.scanFile;
  if(typeof originalScanFile==='function'){
    window.scanFile=async function(file){
      const result=await originalScanFile.apply(this,arguments);
      if(typeof state!=='undefined'&&state.scan&&!state.scan.visionStarted){
        state.scan.visionStarted=true;
        await analyzeScanWithVision();
        renderVisionReview();
        renderStructuredReview();
      }
      return result;
    };
  }

  const originalShowScanReview=window.showScanReview;
  if(typeof originalShowScanReview==='function'){
    window.showScanReview=function(){
      originalShowScanReview.apply(this,arguments);
      renderVisionReview();
      renderStructuredReview();
    };
  }

  document.addEventListener('DOMContentLoaded',ensurePanels);
})();
