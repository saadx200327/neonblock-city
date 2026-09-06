// Cardfolio structured scan review.
// Makes OCR output auditable before a holding is created; no catalog match or price is inferred here.
(function(){
  const fieldOrder=[
    ['category','Category'],['subject','Player / character'],['year','Year'],['manufacturer','Manufacturer'],
    ['brand','Brand / product'],['set_name','Set'],['card_number','Card #'],['serial_number','Serial'],
    ['team','Team / club'],['league','League']
  ];

  function ensurePanel(){
    const raw=document.getElementById('rawOcr');
    if(!raw||document.getElementById('scanStructuredReview'))return;
    const panel=document.createElement('section');
    panel.id='scanStructuredReview';
    panel.className='scan-structured-review';
    panel.setAttribute('aria-label','Extracted card fields');
    raw.insertAdjacentElement('beforebegin',panel);
  }

  function renderStructuredReview(){
    ensurePanel();
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

  const original=window.showScanReview;
  if(typeof original==='function'){
    window.showScanReview=function(){
      original.apply(this,arguments);
      renderStructuredReview();
    };
  }

  document.addEventListener('DOMContentLoaded',ensurePanel);
})();
