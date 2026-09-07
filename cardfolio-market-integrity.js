/* Cardfolio market-integrity guard.
   Active marketplace asking prices are context only. They must never become a
   holding or canonical market valuation; only verified sold evidence may price
   shared assets through the server-side canonical repricer. */
(function(){
'use strict';

function hardenActiveAskControls(root=document){
  const button = root.querySelector?.('#useEbayMedian') || document.getElementById('useEbayMedian');
  if(!button || button.dataset.cardfolioMarketGuard === '1') return;
  button.dataset.cardfolioMarketGuard = '1';
  button.disabled = true;
  button.setAttribute('aria-disabled','true');
  button.textContent = 'Active ask · context only';
  button.title = 'Active asking prices do not set Cardfolio market value. Verified sold comps are required.';

  const note = button.closest('.button-row')?.nextElementSibling;
  if(note && note.classList.contains('holding-meta')){
    note.textContent = 'Active asking prices are shown only as market context. They never change portfolio or canonical market value.';
  }
}

const observer = new MutationObserver((records)=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(node.nodeType !== 1) continue;
      hardenActiveAskControls(node);
      if(node.querySelector?.('#useEbayMedian')) hardenActiveAskControls(node);
    }
  }
});

function install(){
  hardenActiveAskControls();
  observer.observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener('click',(event)=>{
    const button = event.target.closest?.('#useEbayMedian');
    if(!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.toast?.('Active asking prices are context only. Cardfolio requires verified sold comps for market value.');
  },true);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
