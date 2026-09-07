/* Cardfolio exact-identity edit hardening.
   The product layer's legacy identity-change signature does not include subset/insert.
   If an owner edits that field on an already-linked holding, force canonical re-resolution
   and clear the old valuation before the normal save path runs. */
(function(){
'use strict';

if(typeof saveCardFromForm!=='function')return;

const baseSaveCardFromForm=saveCardFromForm;
saveCardFromForm=async function(){
  const id=String(document.getElementById('cardId')?.value||'').trim();
  const existing=id&&state?.holdings?.find?.(x=>x.id===id);
  const nextSubset=String(document.getElementById('subset')?.value||'').trim();
  const subsetChanged=!!existing&&String(existing.subset||'').trim().toLowerCase()!==nextSubset.toLowerCase();
  const prior=existing?{
    canonical_card_id:existing.canonical_card_id,
    market_value:existing.market_value,
    valuation_status:existing.valuation_status,
    valuation_source:existing.valuation_source,
    valuation_observed_at:existing.valuation_observed_at
  }:null;

  if(subsetChanged){
    existing.canonical_card_id=null;
    existing.market_value=null;
    existing.valuation_status='pending_price';
    existing.valuation_source='';
    existing.valuation_observed_at=null;
  }

  try{
    return await baseSaveCardFromForm();
  }finally{
    /* A successful cloud save calls syncCloud(), replacing the holding objects. If the
       same object is still present, the write failed (or stayed local), so restore it. */
    if(subsetChanged&&prior&&state?.holdings?.includes?.(existing)){
      existing.canonical_card_id=prior.canonical_card_id;
      existing.market_value=prior.market_value;
      existing.valuation_status=prior.valuation_status;
      existing.valuation_source=prior.valuation_source;
      existing.valuation_observed_at=prior.valuation_observed_at;
    }
  }
};

})();
