/* Preserve exact collectible-card identity when resolving shared canonical assets.
   Loaded after the product/persistence layers so normalized holding columns remain the
   source of truth, with legacy metadata used only as a fallback. */
(function(){
'use strict';

if(typeof window.canonicalIdentityPayload === 'function'){
  const baseCanonicalIdentityPayload = window.canonicalIdentityPayload;
  window.canonicalIdentityPayload = function(h){
    const payload = baseCanonicalIdentityPayload(h);
    const meta = h?.metadata && typeof h.metadata === 'object' ? h.metadata : {};
    return {
      ...payload,
      subset: h?.subset || payload.subset || meta.subset || '',
      variant_name: h?.variant_name || payload.variant_name || meta.variant_name || meta.variation || '',
      card_type: h?.card_type || payload.card_type || meta.card_type || '',
      variation: h?.variant_name || payload.variant_name || meta.variation || '',
      language: h?.language || payload.language || meta.language || '',
      edition: h?.edition || payload.edition || meta.edition || ''
    };
  };
}

/* The product-layer identity signature predates subset as a first-class column. When
   an existing cloud holding changes subset/insert, force canonical re-resolution and
   clear the old valuation before the original save path runs. Restore the in-memory
   state only when that save fails and syncCloud therefore leaves the same object alive. */
if(typeof window.saveCardFromForm === 'function'){
  const baseSaveCardFromForm = window.saveCardFromForm;
  window.saveCardFromForm = async function(){
    const id = String(document.getElementById('cardId')?.value || '').trim();
    const existing = id && window.state?.holdings?.find?.(x => x.id === id);
    const nextSubset = String(document.getElementById('subset')?.value || '').trim();
    const prior = existing ? {
      canonical_card_id: existing.canonical_card_id,
      market_value: existing.market_value,
      valuation_status: existing.valuation_status,
      valuation_source: existing.valuation_source,
      valuation_observed_at: existing.valuation_observed_at
    } : null;
    const subsetChanged = !!existing && String(existing.subset || '').trim().toLowerCase() !== nextSubset.toLowerCase();

    if(subsetChanged){
      existing.canonical_card_id = null;
      existing.market_value = null;
      existing.valuation_status = 'pending_price';
      existing.valuation_source = '';
      existing.valuation_observed_at = null;
    }

    try{
      return await baseSaveCardFromForm();
    } finally {
      if(subsetChanged && prior && window.state?.holdings?.includes?.(existing)){
        existing.canonical_card_id = prior.canonical_card_id;
        existing.market_value = prior.market_value;
        existing.valuation_status = prior.valuation_status;
        existing.valuation_source = prior.valuation_source;
        existing.valuation_observed_at = prior.valuation_observed_at;
      }
    }
  };
}

})();
