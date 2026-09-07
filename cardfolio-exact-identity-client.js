/* Cardfolio exact-identity edit hardening.
   Preserve exact-identity fields in owner-private holdings and never let an edited
   holding keep a canonical link/valuation that belongs to a materially different card. */
(function(){
'use strict';

if(typeof toDb==='function'){
  const baseToDb=toDb;
  toDb=function(h){
    const out=baseToDb(h);
    for(const key of ['subset','variant_name','card_type','language','edition']){
      out[key]=h?.[key]??null;
    }
    return out;
  };
}

if(typeof saveCardFromForm!=='function')return;

const baseSaveCardFromForm=saveCardFromForm;
const IDENTITY_FIELDS=[
  'category','subject','year','manufacturer','brand','set_name','subset','card_number',
  'parallel','variant_name','card_type','autograph','relic','serial_number',
  'grading_company','grade','language','edition'
];
const normalizeIdentityValue=(key,value)=>{
  if(key==='autograph'||key==='relic')return !!value;
  if(key==='serial_number'){
    const raw=String(value||'').trim().toLowerCase();
    const parts=raw.split('/');
    return parts.length>1?`/${parts[parts.length-1].trim()}`:raw;
  }
  return String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
};
const identityChanged=(before,after)=>IDENTITY_FIELDS.some(
  key=>normalizeIdentityValue(key,before?.[key])!==normalizeIdentityValue(key,after?.[key])
);

saveCardFromForm=async function(){
  const id=String(document.getElementById('cardId')?.value||'').trim();
  const existing=id&&state?.holdings?.find?.(x=>x.id===id);
  let next=null;
  if(existing&&typeof readCardForm==='function'){
    try{next=readCardForm();}catch(err){console.warn('Identity preflight failed',err);}
  }
  const changed=!!existing&&!!next&&identityChanged(existing,next);
  const prior=existing?{
    canonical_card_id:existing.canonical_card_id,
    market_value:existing.market_value,
    valuation_status:existing.valuation_status,
    valuation_source:existing.valuation_source,
    valuation_observed_at:existing.valuation_observed_at
  }:null;

  if(changed){
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
    if(changed&&prior&&state?.holdings?.includes?.(existing)){
      existing.canonical_card_id=prior.canonical_card_id;
      existing.market_value=prior.market_value;
      existing.valuation_status=prior.valuation_status;
      existing.valuation_source=prior.valuation_source;
      existing.valuation_observed_at=prior.valuation_observed_at;
    }
  }
};

})();
