/* Preserve exact collectible-card identity when resolving shared canonical assets.
   UI-only labels stay user-private; exact variant dimensions are forwarded to the
   authenticated canonical resolver so subset/insert and image variation cannot
   collapse into a base/parallel asset accidentally. */
(function(){
'use strict';

if(typeof window.canonicalIdentityPayload !== 'function') return;

const baseCanonicalIdentityPayload = window.canonicalIdentityPayload;
window.canonicalIdentityPayload = function(h){
  const payload = baseCanonicalIdentityPayload(h);
  const meta = h?.metadata && typeof h.metadata === 'object' ? h.metadata : {};
  return {
    ...payload,
    subset: meta.subset || '',
    variation: meta.variation || '',
    language: meta.language || payload.language || '',
    edition: meta.edition || payload.edition || ''
  };
};
})();
