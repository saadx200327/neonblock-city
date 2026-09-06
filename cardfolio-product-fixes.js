/* Cardfolio product QA fixes — persist exact variant identity dimensions and force
   canonical re-resolution on edits so base/parallel/auto/relic/graded variants
   can never silently inherit a stale market record. Loaded after cardfolio-product.js. */
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

const productSaveCardFromForm=saveCardFromForm;
saveCardFromForm=async function(){
  const id=document.getElementById('cardId')?.value||'';
  const existing=id?state.holdings.find(x=>x.id===id):null;
  const prior=existing?{
    canonical_card_id:existing.canonical_card_id,
    market_value:existing.market_value,
    valuation_source:existing.valuation_source,
    valuation_observed_at:existing.valuation_observed_at,
    valuation_status:existing.valuation_status
  }:null;
  // Re-resolve every edited holding. The RPC is idempotent for unchanged cards and
  // prevents newly edited subset/variation/language/edition fields from retaining
  // the former card's canonical price.
  if(existing){
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
    // If the cloud save failed before sync, restore the in-memory view. The next
    // successful save will retry canonical resolution.
    if(existing&&current&&!current.canonical_card_id&&prior?.canonical_card_id){
      current.canonical_card_id=prior.canonical_card_id;
      current.market_value=prior.market_value;
      current.valuation_source=prior.valuation_source;
      current.valuation_observed_at=prior.valuation_observed_at;
      current.valuation_status=prior.valuation_status;
    }
  }
};
})();
