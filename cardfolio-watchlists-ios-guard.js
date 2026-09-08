/* Cardfolio iOS watchlist interaction guard.
   Prevents programmatic focus from summoning the keyboard when opening controls;
   the keyboard appears only after the user explicitly taps a field. */
(function(){
'use strict';
let suppressFocusUntil=0;
const openActionSelector='#watchNewList,#watchEmptyCreate,#watchEditList,#watchAddCards,#watchEmptyAdd';
const fieldSelector='#watchListDialogV2 input,#watchListDialogV2 textarea,#watchListDialogV2 select,#watchPickerDialogV2 input,#watchPickerDialogV2 textarea,#watchPickerDialogV2 select';

function blurActive(){try{document.activeElement?.blur?.()}catch{}}

document.addEventListener('pointerdown',event=>{
  if(event.target.closest?.(openActionSelector))suppressFocusUntil=Date.now()+220;
  if(event.target.closest?.('[data-watch-close],.watch-v2-close'))blurActive();
},true);

document.addEventListener('focusin',event=>{
  if(Date.now()>suppressFocusUntil||!event.target.matches?.(fieldSelector))return;
  requestAnimationFrame(()=>{if(document.activeElement===event.target)event.target.blur()});
},true);

/* Compatibility protection for a stale cached copy of the retired watch-target dialog. */
document.addEventListener('click',event=>{
  const close=event.target.closest?.('#watchDialog button[value="cancel"],#watchDialog [aria-label="Close"]');
  if(!close)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  blurActive();
  try{document.getElementById('watchDialog')?.close()}catch{}
},true);
})();
