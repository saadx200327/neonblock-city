/* Cardfolio identity persistence hardening.
   Loaded last so exact-identity fields collected by the product layer cannot be dropped
   by earlier serializers before an owner-private holding is written to Supabase. */
(function(){
'use strict';

if(typeof toDb!=='function')return;

const baseToDb=toDb;
const EXACT_IDENTITY_FIELDS=['subset','variant_name','card_type','language','edition'];

toDb=function(h){
  const out=baseToDb(h);
  for(const key of EXACT_IDENTITY_FIELDS){
    out[key]=h?.[key]??null;
  }
  return out;
};

})();
