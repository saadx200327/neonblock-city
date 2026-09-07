/* Cardfolio production interaction guard — prevents duplicate save/auth submissions and
   makes transient network state explicit without changing canonical pricing semantics. */
(function(){
'use strict';

const pending = new WeakSet();

function setBusy(button, busy, busyLabel){
  if(!button) return;
  if(busy){
    if(pending.has(button)) return;
    pending.add(button);
    button.dataset.cardfolioLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy','true');
    if(busyLabel) button.textContent = busyLabel;
  } else {
    pending.delete(button);
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if(button.dataset.cardfolioLabel){
      button.textContent = button.dataset.cardfolioLabel;
      delete button.dataset.cardfolioLabel;
    }
  }
}

function wrapAsyncAction(name, buttonId, busyLabel){
  const original = window[name];
  if(typeof original !== 'function' || original.__cardfolioProductionGuard) return;
  const wrapped = async function(...args){
    const button = document.getElementById(buttonId);
    if(button && pending.has(button)) return;
    setBusy(button, true, busyLabel);
    try {
      return await original.apply(this,args);
    } finally {
      setBusy(button, false);
    }
  };
  wrapped.__cardfolioProductionGuard = true;
  window[name] = wrapped;
}

function syncNetworkState(){
  const badge = document.getElementById('backendBadge');
  if(!badge) return;
  if(!navigator.onLine){
    badge.dataset.cardfolioOnlineLabel = badge.textContent;
    badge.textContent = 'Offline · Local Vault';
    badge.classList.add('neutral');
    badge.setAttribute('title','Network unavailable. Cloud writes and market refresh are paused until connectivity returns.');
    return;
  }
  if(badge.dataset.cardfolioOnlineLabel){
    badge.textContent = badge.dataset.cardfolioOnlineLabel;
    delete badge.dataset.cardfolioOnlineLabel;
    badge.removeAttribute('title');
  }
}

function install(){
  wrapAsyncAction('saveCardFromForm','saveCardBtn','Saving…');
  wrapAsyncAction('googleSignIn','googleLoginBtn','Opening Google…');
  syncNetworkState();
}

window.addEventListener('online',syncNetworkState);
window.addEventListener('offline',syncNetworkState);
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
