/* Cardfolio market detail presentation: keep sold comps and active listings in one Market activity section,
   but make their roles visually distinct. Active asking prices remain context only. */
(() => {
  'use strict';
  let queued=false;
  function css(){if(document.getElementById('cardfolio-market-live-ui-css'))return;const s=document.createElement('style');s.id='cardfolio-market-live-ui-css';s.textContent=`
    .market-active-label,.market-sold-label{display:flex;align-items:center;gap:8px;margin:18px 2px 10px;font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.market-active-label:before,.market-sold-label:before{content:"";width:8px;height:8px;border-radius:50%}.market-active-label{color:#137d54}.market-active-label:before{background:#20b778;box-shadow:0 0 0 5px rgba(32,183,120,.10)}.market-sold-label{color:#697687}.market-sold-label:before{background:#8b98a8}
    .detail-section [data-active-market].active-market-shell{margin:8px 0 20px;padding:14px;border:1px solid rgba(28,174,116,.22);border-radius:24px;background:linear-gradient(145deg,rgba(226,255,244,.80),rgba(248,255,252,.60));box-shadow:inset 0 1px 0 rgba(255,255,255,.92)}.detail-section [data-active-market] .active-market-heading span{color:#11835a}.detail-section [data-active-market] .embedded-market-listing{background:rgba(255,255,255,.84);border-color:rgba(28,174,116,.17)}.detail-section [data-active-market] .listing-ebay-button{background:#0f6f4c}.detail-section [data-active-market] .active-market-note{color:#507061}
    .detail-section .evidence-list .evidence-row{background:rgba(255,255,255,.60)}
  `;document.head.appendChild(s)}
  function enhance(){
    document.querySelectorAll('.detail-section').forEach(section=>{
      const h=section.querySelector('h3');if(!h||!/Market activity|Market evidence|Actividad de mercado|মার্কেট কার্যক্রম/i.test(h.textContent||''))return;
      const active=section.querySelector('[data-active-market]'),evidence=section.querySelector('.evidence-list');
      if(active){
        let a=section.querySelector(':scope > .market-active-label');if(!a){a=document.createElement('div');a.className='market-active-label';a.textContent='Active listings';const head=section.querySelector('.section-head');if(head?.nextSibling)section.insertBefore(a,head.nextSibling);else section.prepend(a)}
        if(active.previousElementSibling!==a)section.insertBefore(active,a.nextSibling);
      }
      if(evidence){let s=evidence.previousElementSibling;if(!s?.classList?.contains('market-sold-label')){s=document.createElement('div');s.className='market-sold-label';s.textContent='Sold comps';evidence.parentNode.insertBefore(s,evidence)}}
    });
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})}
  css();new MutationObserver(queue).observe(document.documentElement,{subtree:true,childList:true});document.addEventListener('DOMContentLoaded',enhance);document.addEventListener('cardfolio:locale-changed',()=>setTimeout(enhance,0));if(document.readyState!=='loading')enhance();
})();
