/* Cardfolio vNext post-QA fixes. Loaded after cardfolio-vnext.js. */
state.collapsedCategories = state.collapsedCategories || new Set();

canonicalIdentityPayload=function(h){
  const meta=h?.metadata&&typeof h.metadata==='object'?h.metadata:{};
  return {
    category:h.category||'Other',
    subject:h.subject||'',
    year:h.year||'',
    manufacturer:h.manufacturer||'',
    brand:h.brand||'',
    set_name:h.set_name||'',
    subset:meta.subset||'',
    card_number:h.card_number||'',
    parallel:h.parallel||'',
    variant_name:meta.variation||'',
    variation:meta.variation||'',
    card_type:h.autograph&&h.relic?'autograph_relic':h.autograph?'autograph':h.relic?'relic':(h.parallel||meta.variation||h.serial_number)?'parallel_or_variation':'base',
    serial_number:h.serial_number||'',
    team:h.team||'',
    league:h.league||'',
    rookie:!!h.rookie,
    autograph:!!h.autograph,
    relic:!!h.relic,
    grading_company:h.grading_company||'',
    grade:h.grade||'',
    language:meta.language||'',
    edition:meta.edition||''
  };
};

categoryAlbum=function(cat,list){
  const total=list.reduce((s,h)=>s+holdingValue(h),0),pending=list.filter(h=>!valued(h)).length,open=!state.collapsedCategories.has(cat);
  return `<section class="category-album liquid-card ${open?'open':''}"><button class="category-toggle" data-category-toggle="${escapeHtml(cat)}" aria-expanded="${open?'true':'false'}"><div class="category-icon">${categoryGlyph(cat)}</div><div><strong>${escapeHtml(categoryLabel(cat))}</strong><span>${list.length} card${list.length===1?'':'s'}${pending?` · ${pending} pending`:''}</span></div><div class="category-value"><strong>${money(total)}</strong><span class="chevron">⌄</span></div></button><div class="album-grid">${list.map(h=>albumCard(h)).join('')}</div></section>`;
};

bindViewEvents=function(){
  vnextExistingBindViewEvents();
  $$('.album-card[data-card-id]').forEach(el=>el.addEventListener('click',()=>{const h=state.holdings.find(x=>x.id===el.dataset.cardId);if(h)openCardDetail(h);}));
  $$('[data-category-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
    const cat=btn.dataset.categoryToggle,section=btn.closest('.category-album'),willOpen=!section?.classList.contains('open');
    if(willOpen)state.collapsedCategories.delete(cat);else state.collapsedCategories.add(cat);
    section?.classList.toggle('open',willOpen);btn.setAttribute('aria-expanded',willOpen?'true':'false');
  }));
  $('#profileGoogleSignin')?.addEventListener('click',signInWithGoogle);
};
