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
