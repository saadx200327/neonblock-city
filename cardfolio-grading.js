/* Cardfolio grading hub — official verification/submission links only. */
function graderInfo(company,cert=''){
  const c=String(company||'').toUpperCase();
  const clean=String(cert||'').trim();
  if(c==='PSA')return {name:'PSA',verify:clean?`https://www.psacard.com/cert/${encodeURIComponent(clean)}`:'https://www.psacard.com/cert',submit:'https://www.psacard.com/submit'};
  if(c==='BGS'||c.includes('BECKETT'))return {name:'Beckett / BGS',verify:'https://www.beckett.com/grading/card-lookup',submit:'https://www.beckett.com/grading'};
  if(c==='CGC'||c.includes('CGC'))return {name:'CGC Cards',verify:'https://www.cgccards.com/certlookup/',submit:'https://www.cgccards.com/submit/how-to-submit/'};
  if(c==='SGC'||c.includes('SGC'))return {name:'SGC',verify:'https://www.gosgc.com/cert-code-lookup',submit:'https://www.gosgc.com/card-grading/services-pricing'};
  return {name:company||'Grader',verify:'',submit:''};
}

function gradedHoldingList(){
  const graded=state.holdings.filter(h=>h.grading_company);
  if(!graded.length)return `<div class="empty"><div class="empty-icon">◇</div><strong>No graded cards yet</strong><p>Add grading company, grade and cert number to a holding when you receive the slab.</p></div>`;
  return `<div class="holding-list">${graded.map(h=>{
    const g=graderInfo(h.grading_company,h.cert_number);
    return `<article class="holding graded-row">${h.image_url?`<img class="thumb" src="${escapeHtml(h.image_url)}" alt="${escapeHtml(h.subject)}"/>`:`<div class="thumb placeholder">◇</div>`}<div><div class="holding-name">${escapeHtml(h.subject)}</div><div class="holding-meta">${escapeHtml([h.year,h.manufacturer,h.brand,h.set_name,h.card_number&&'#'+h.card_number].filter(Boolean).join(' · '))}</div><div class="holding-meta">${escapeHtml(g.name)} ${escapeHtml(h.grade||'')} ${h.cert_number?`· Cert ${escapeHtml(h.cert_number)}`:''}</div></div><div class="value-col"><strong>${valued(h)?money(holdingValue(h)):'Unpriced'}</strong><div class="source-tag">${escapeHtml(h.valuation_source||'No market source')}</div></div><div class="grading-actions">${g.verify?`<a class="btn primary" href="${g.verify}" target="_blank" rel="noopener noreferrer">Verify cert ↗</a>`:''}<button class="btn secondary" data-card-id="${escapeHtml(h.id)}">Edit holding</button></div></article>`;
  }).join('')}</div>`;
}

gradingView=function(){
  const graders=[
    ['PSA','https://www.psacard.com/cert','https://www.psacard.com/submit','Cert verification + online submission'],
    ['Beckett / BGS','https://www.beckett.com/grading/card-lookup','https://www.beckett.com/grading','BGS/BVG/BCCG cert lookup + grading'],
    ['CGC Cards','https://www.cgccards.com/certlookup/','https://www.cgccards.com/submit/how-to-submit/','Cert lookup + submission instructions'],
    ['SGC','https://www.gosgc.com/cert-code-lookup','https://www.gosgc.com/card-grading/services-pricing','Cert lookup + current grading services']
  ];
  return `<section class="panel"><div class="section-head"><div><h2>Grading hub</h2><div class="holding-meta">Cardfolio stores your grader, grade and cert. Authenticity is verified on the grader's own database.</div></div></div><div class="grading-grid">${graders.map(([name,verify,submit,desc])=>`<article class="grader-card tip"><div class="market-logo">◇</div><h3>${escapeHtml(name)}</h3><p class="muted">${escapeHtml(desc)}.</p><div class="grading-actions"><a class="btn primary" href="${verify}" target="_blank" rel="noopener noreferrer">Verify cert ↗</a><a class="btn secondary" href="${submit}" target="_blank" rel="noopener noreferrer">Submit ↗</a></div></article>`).join('')}</div><div class="tip" style="margin-top:16px"><strong>Verification ≠ guaranteed authenticity</strong><p class="holding-meta">A valid certification number confirms a record exists in the grader's database. Always compare the physical holder, label and images when available.</p></div></section><section class="panel" style="margin-top:16px"><div class="section-head"><h2>Your graded cards</h2><span class="source-tag">${state.holdings.filter(h=>h.grading_company).length} slabs</span></div>${gradedHoldingList()}</section>`;
};

const gradingBaseMarketView=marketView;
marketView=function(){
  return `${gradingBaseMarketView()}<section class="panel" style="margin-top:16px"><div class="section-head"><div><h2>Grading & authentication</h2><div class="holding-meta">Submit cards and verify existing slabs through the grader's official database.</div></div><button class="btn secondary" data-view="grading">Open grading hub</button></div></section>`;
};

const gradingBaseBindViewEvents=bindViewEvents;
bindViewEvents=function(){
  gradingBaseBindViewEvents();
  $$('.graded-row [data-card-id]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const h=state.holdings.find(x=>x.id===b.dataset.cardId);if(h)openCardDialog(h)}));
};
