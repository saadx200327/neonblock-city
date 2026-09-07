// Cardfolio structured scan review + authenticated GPT visual evidence.
// OCR remains supplementary. Vision only prefills empty fields at high confidence and never prices a card.
(function(){
  const fieldOrder=[
    ['category','Category'],['subject','Player / character'],['year','Year'],['manufacturer','Manufacturer'],
    ['brand','Brand / product'],['set_name','Set'],['subset','Subset / insert'],['card_number','Card #'],
    ['parallel','Parallel'],['variant_name','Image variation'],['serial_number','Serial'],
    ['language','Language'],['edition','Edition'],['team','Team / club'],['league','League'],
    ['grading_company','Grading company'],['grade','Grade']
  ];
  const visualFieldMap={
    category:'category',subject:'subject',year:'year',manufacturer:'manufacturer',brand:'brand',set_name:'set_name',
    subset:'subset',card_number:'card_number',parallel:'parallel',variant_name:'variant_name',serial_number:'serial_number',
    team:'team',league:'league',grading_company:'grading_company',grade:'grade',language:'language',edition:'edition',
    card_type:'card_type'
  };
  const booleanFields=new Set(['rookie','autograph','relic']);

  function truthyVisualValue(value){
    const v=String(value||'').trim().toLowerCase();
    if(['true','yes','present','1'].includes(v))return true;
    if(['false','no','absent','0'].includes(v))return false;
    return null;
  }
  function ensurePanels(){
    const raw=document.getElementById('rawOcr');
    if(!raw)return;
    if(!document.getElementById('scanVisionReview')){
      const vision=document.createElement('section');
      vision.id='scanVisionReview';
      vision.className='scan-structured-review';
      vision.setAttribute('aria-label','GPT visual card analysis');
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

  function visualMetadata(data){
    return {
      source:'openai_vision',
      status:'analyzed',
      model:data.model||'',
      image_fingerprint:data.imageFingerprint||'',
      analyzed_at:data.analyzedAt||new Date().toISOString(),
      overall_confidence:Number(data.analysis?.overall_confidence||0),
      visual_summary:String(data.analysis?.visual_summary||'').slice(0,800),
      observations:Array.isArray(data.analysis?.observations)?data.analysis.observations.slice(0,30):[],
      candidate_identity_clues:Array.isArray(data.analysis?.candidate_identity_clues)?data.analysis.candidate_identity_clues.slice(0,12):[],
      ambiguities:Array.isArray(data.analysis?.ambiguities)?data.analysis.ambiguities.slice(0,12):[],
      recommended_checks:Array.isArray(data.analysis?.recommended_checks)?data.analysis.recommended_checks.slice(0,10):[]
    };
  }

  function mergeHighConfidenceVisualFields(analysis){
    if(!window.state?.scan||!analysis)return;
    const fields=state.scan.fields||(state.scan.fields={});
    const observations=Array.isArray(analysis.observations)?analysis.observations:[];
    for(const observation of observations){
      const confidence=Number(observation?.confidence||0);
      if(confidence<0.78)continue;
      const field=String(observation?.field||'');
      const value=String(observation?.value||'').trim();
      if(!value)continue;

      if(booleanFields.has(field)){
        const parsed=truthyVisualValue(value);
        if(parsed===true&&fields[field]!==true)fields[field]=true;
        continue;
      }
      const target=visualFieldMap[field];
      if(!target)continue;
      if(fields[target]===undefined||fields[target]===null||String(fields[target]).trim()===''){
        fields[target]=value;
      }
    }
  }

  async function analyzeScanWithVision(){
    if(!window.state?.scan?.imageDataUrl)return null;
    state.scan.visionStatus='pending';
    state.scan.visionError='';
    renderVisionReview();

    if(!state.supabase||!state.user){
      state.scan.visionStatus='signin_required';
      state.scan.fields=state.scan.fields||{};
      state.scan.fields.metadata={
        ...(state.scan.fields.metadata||{}),
        needs_visual_analysis:true,
        visual_analysis_status:'signin_required'
      };
      renderVisionReview();
      return null;
    }

    try{
      const {data:{session}}=await state.supabase.auth.getSession();
      const token=session?.access_token;
      if(!token)throw new Error('Your Cardfolio session needs to be refreshed.');

      const r=await fetch('/api/card-vision',{
        method:'POST',
        headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({
          mode:'identify',
          imageDataUrl:state.scan.imageDataUrl,
          ocrText:state.scan.text||'',
          knownFields:state.scan.fields||{}
        })
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok){
        state.scan.visionStatus=data?.configured===false?'not_configured':'error';
        state.scan.visionError=String(data?.error||'GPT visual analysis is unavailable right now.');
        state.scan.fields=state.scan.fields||{};
        state.scan.fields.metadata={
          ...(state.scan.fields.metadata||{}),
          needs_visual_analysis:true,
          visual_analysis_status:state.scan.visionStatus,
          visual_analysis_error:state.scan.visionError.slice(0,300)
        };
        renderVisionReview();
        return null;
      }

      state.scan.visionStatus='ready';
      state.scan.visualAnalysis=data.analysis||null;
      state.scan.visualFingerprint=data.imageFingerprint||'';
      state.scan.visualModel=data.model||'';
      state.scan.visualAnalyzedAt=data.analyzedAt||new Date().toISOString();
      mergeHighConfidenceVisualFields(data.analysis);
      state.scan.fields=state.scan.fields||{};
      state.scan.fields.metadata={
        ...(state.scan.fields.metadata||{}),
        needs_visual_analysis:false,
        visual_analysis_status:'analyzed',
        visual_analysis:visualMetadata(data)
      };
      renderVisionReview();
      return data.analysis||null;
    }catch(err){
      state.scan.visionStatus='error';
      state.scan.visionError=String(err?.message||'GPT visual analysis is unavailable right now.');
      state.scan.fields=state.scan.fields||{};
      state.scan.fields.metadata={
        ...(state.scan.fields.metadata||{}),
        needs_visual_analysis:true,
        visual_analysis_status:'error',
        visual_analysis_error:state.scan.visionError.slice(0,300)
      };
      renderVisionReview();
      return null;
    }
  }

  function renderVisionReview(){
    ensurePanels();
    const panel=document.getElementById('scanVisionReview');
    if(!panel||!window.state?.scan)return;
    const status=state.scan.visionStatus||'idle';

    if(status==='pending'){
      panel.innerHTML='<div class="inline-note"><strong>GPT card expert</strong> · Inspecting the actual card image for visual identity clues…</div>';
      return;
    }
    if(status==='signin_required'){
      panel.innerHTML='<div class="inline-note"><strong>GPT card expert</strong> · Sign in to use private visual analysis. OCR/manual review still works without an account.</div>';
      return;
    }
    if(status==='not_configured'){
      panel.innerHTML='<div class="inline-note"><strong>GPT card expert</strong> · Server vision is not configured yet. The card will remain eligible for later visual analysis; no identity is guessed.</div>';
      return;
    }
    if(status==='error'){
      panel.innerHTML=`<div class="inline-note bad"><strong>GPT card expert</strong> · ${escapeHtml(state.scan.visionError||'Visual analysis failed.')} OCR/manual review is still available.</div>`;
      return;
    }
    if(status!=='ready'||!state.scan.visualAnalysis){
      panel.innerHTML='<div class="inline-note"><strong>GPT card expert</strong> · Visual analysis has not run yet.</div>';
      return;
    }

    const a=state.scan.visualAnalysis;
    const pct=Math.round(Number(a.overall_confidence||0)*100);
    const observations=(Array.isArray(a.observations)?a.observations:[]).slice(0,10)
      .map(o=>`<div class="scan-field-row"><span>${escapeHtml(String(o.field||'').replaceAll('_',' '))}</span><strong>${escapeHtml(o.value||'')}</strong><div class="holding-meta">${Math.round(Number(o.confidence||0)*100)}% · ${escapeHtml(o.evidence||'')}</div></div>`)
      .join('');
    const ambiguities=(Array.isArray(a.ambiguities)?a.ambiguities:[]).slice(0,5);
    const checks=(Array.isArray(a.recommended_checks)?a.recommended_checks:[]).slice(0,4);
    panel.innerHTML=`<div class="scan-review-warning" role="note"><strong>GPT visual analysis · ${pct}% overall confidence.</strong> ${escapeHtml(a.visual_summary||'Image inspected.')}</div>${observations?`<div class="scan-field-grid">${observations}</div>`:''}${ambiguities.length?`<div class="inline-note"><strong>Still ambiguous:</strong> ${ambiguities.map(escapeHtml).join(' · ')}</div>`:''}${checks.length?`<div class="holding-meta">Best next checks: ${checks.map(escapeHtml).join(' · ')}</div>`:''}<div class="holding-meta">High-confidence visual clues can fill empty fields only. You still confirm before saving.</div>`;
  }

  function renderStructuredReview(){
    ensurePanels();
    const panel=document.getElementById('scanStructuredReview');
    if(!panel||!window.state?.scan)return;
    const fields=state.scan.fields||{};
    const confidence=Number(state.scan.confidence||0);
    const warning=confidence<45
      ? 'Low OCR confidence — verify every field before saving.'
      : confidence<70
        ? 'Moderate OCR confidence — review names, numbers, and year carefully.'
        : 'OCR confidence is relatively strong, but the scan still requires human confirmation.';
    const rows=fieldOrder
      .filter(([key])=>fields[key]!==undefined&&fields[key]!==null&&String(fields[key]).trim()!=='')
      .map(([key,label])=>`<div class="scan-field-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(fields[key]))}</strong></div>`)
      .join('');
    const flags=[fields.rookie&&'Rookie / RC',fields.autograph&&'Autograph',fields.relic&&'Relic / memorabilia'].filter(Boolean);
    panel.innerHTML=`<div class="scan-review-warning" role="note"><strong>Review required.</strong> ${escapeHtml(warning)}</div>${rows?`<div class="scan-field-grid">${rows}</div>`:'<div class="inline-note">No structured fields were extracted. Add the card manually rather than guessing.</div>'}${flags.length?`<div class="holding-meta">Detected flags: ${flags.map(escapeHtml).join(' · ')}</div>`:''}`;
  }

  window.cardfolioAnalyzeScanWithVision=analyzeScanWithVision;
  window.cardfolioRenderVisionReview=renderVisionReview;

  const originalScanFile=window.scanFile;
  if(typeof originalScanFile==='function'){
    window.scanFile=async function(file){
      const result=await originalScanFile.apply(this,arguments);
      if(window.state?.scan&&!state.scan.visionStarted){
        state.scan.visionStarted=true;
        const analysis=await analyzeScanWithVision();
        renderVisionReview();
        renderStructuredReview();
        if(analysis&&!document.getElementById('scanReviewDialog')?.open){
          document.getElementById('cardDialog')?.close();
          if(typeof window.showScanReview==='function')window.showScanReview();
        }
      }
      return result;
    };
  }

  const original=window.showScanReview;
  if(typeof original==='function'){
    window.showScanReview=function(){
      original.apply(this,arguments);
      renderVisionReview();
      renderStructuredReview();
    };
  }

  document.addEventListener('DOMContentLoaded',ensurePanels);
})();
