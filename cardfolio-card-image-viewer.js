/* Cardfolio — enlarge a card image from the individual-card detail view. */
(() => {
  'use strict';

  const VERSION = '20260910-2';
  if (window.cardfolioCardImageViewerVersion === VERSION) return;
  window.cardfolioCardImageViewerVersion = VERSION;

  const STYLE_ID = 'cardfolio-card-image-viewer-css-v2';
  const DIALOG_ID = 'cardfolioCardImageViewer';
  const IMAGE_SELECTOR = '#cardDetailContent .detail-image img, #assetDetailContent .asset-image-wrap img';
  const WRAP_SELECTOR = '.detail-image, .asset-image-wrap';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #cardDetailContent .detail-image.cardfolio-image-zoomable,
      #assetDetailContent .asset-image-wrap.cardfolio-image-zoomable {
        cursor: zoom-in;
        outline: none;
        -webkit-tap-highlight-color: transparent;
      }
      #cardDetailContent .detail-image.cardfolio-image-zoomable:focus-visible,
      #assetDetailContent .asset-image-wrap.cardfolio-image-zoomable:focus-visible {
        box-shadow: 0 0 0 4px rgba(22,119,255,.18);
      }
      #cardfolioCardImageViewer {
        inset: 0;
        width: 100vw;
        max-width: none;
        height: 100dvh;
        max-height: none;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        overflow: hidden;
      }
      #cardfolioCardImageViewer[open] {
        display: grid;
        place-items: center;
      }
      #cardfolioCardImageViewer::backdrop {
        background: rgba(10,14,22,.32);
        backdrop-filter: blur(9px) saturate(.92);
        -webkit-backdrop-filter: blur(9px) saturate(.92);
      }
      .cardfolio-card-image-viewer-stage {
        width: min(92vw,720px);
        height: min(88dvh,980px);
        display: grid;
        place-items: center;
        pointer-events: none;
      }
      .cardfolio-card-image-viewer-image {
        display: block;
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: 22px;
        box-shadow: 0 28px 90px rgba(0,0,0,.38),0 2px 10px rgba(0,0,0,.16);
        pointer-events: auto;
        user-select: none;
        -webkit-user-drag: none;
        transform: scale(.975);
        opacity: 0;
        transition: transform .18s ease,opacity .18s ease;
      }
      #cardfolioCardImageViewer[open] .cardfolio-card-image-viewer-image {
        transform: scale(1);
        opacity: 1;
      }
      .cardfolio-card-image-viewer-close {
        position: fixed;
        top: calc(env(safe-area-inset-top,0px) + 16px);
        right: 16px;
        z-index: 2;
        width: 46px;
        height: 46px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,.36);
        border-radius: 50%;
        background: rgba(20,25,34,.72);
        color: #fff;
        font: 400 32px/1 -apple-system,BlinkMacSystemFont,"SF Pro Display",Inter,sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.2);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .cardfolio-card-image-viewer-close:active { transform: scale(.96); }
      @media(max-width:720px) {
        .cardfolio-card-image-viewer-stage { width: 94vw; height: 84dvh; }
        .cardfolio-card-image-viewer-image { border-radius: 18px; }
      }
      @media(prefers-reduced-motion:reduce) {
        .cardfolio-card-image-viewer-image { transition: none; transform: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureViewer() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.setAttribute('aria-label','Enlarged card image');
    dialog.innerHTML = `
      <button type="button" class="cardfolio-card-image-viewer-close" aria-label="Close enlarged card">×</button>
      <div class="cardfolio-card-image-viewer-stage">
        <img class="cardfolio-card-image-viewer-image" alt="" />
      </div>`;
    document.body.appendChild(dialog);

    const close = () => { if (dialog.open) dialog.close(); };
    dialog.querySelector('.cardfolio-card-image-viewer-close')?.addEventListener('click',close);
    dialog.addEventListener('click',(event)=>{ if(event.target===dialog) close(); });
    dialog.addEventListener('cancel',(event)=>{ event.preventDefault(); close(); });
    dialog.addEventListener('close',()=>{
      const image=dialog.querySelector('.cardfolio-card-image-viewer-image');
      if(image){ image.removeAttribute('src'); image.alt=''; }
    });
    return dialog;
  }

  function openViewer(sourceImage) {
    if (!sourceImage?.src) return;
    installStyles();
    const dialog=ensureViewer();
    const image=dialog.querySelector('.cardfolio-card-image-viewer-image');
    image.src=sourceImage.currentSrc||sourceImage.src;
    image.alt=sourceImage.alt?`${sourceImage.alt} — enlarged`:'Enlarged card';
    if(!dialog.open) dialog.showModal();
  }

  function prepareZoomTargets(root=document) {
    root.querySelectorAll?.(IMAGE_SELECTOR).forEach((image)=>{
      const wrap=image.closest(WRAP_SELECTOR);
      if(!wrap) return;
      wrap.dataset.cardfolioImageViewerReady=VERSION;
      wrap.classList.add('cardfolio-image-zoomable');
      wrap.setAttribute('role','button');
      wrap.setAttribute('tabindex','0');
      wrap.setAttribute('aria-label',image.alt?`Enlarge ${image.alt}`:'Enlarge card image');
    });
  }

  document.addEventListener('click',(event)=>{
    const image=event.target?.closest?.(IMAGE_SELECTOR);
    if(!image) return;
    event.preventDefault();
    event.stopPropagation();
    openViewer(image);
  },true);

  document.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter'&&event.key!==' ') return;
    const wrap=event.target?.closest?.('#cardDetailContent .detail-image.cardfolio-image-zoomable, #assetDetailContent .asset-image-wrap.cardfolio-image-zoomable');
    if(!wrap) return;
    const image=wrap.querySelector('img');
    if(!image) return;
    event.preventDefault();
    openViewer(image);
  });

  const observer=new MutationObserver(()=>prepareZoomTargets());
  const start=()=>{
    installStyles();
    prepareZoomTargets();
    observer.observe(document.body,{childList:true,subtree:true});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
