(function(){
  const prefix='neonblock-city:';
  function parse(v){try{return v?JSON.parse(v):null;}catch(e){return null;}}
  window.NeonBlockSaveBackend={
    mode:'offline-localStorage',
    async save(slot,payload){localStorage.setItem(prefix+slot,JSON.stringify(Object.assign({},payload,{savedAt:Date.now()})));return{ok:true,mode:this.mode};},
    async load(slot){return parse(localStorage.getItem(prefix+slot));},
    async listSlots(){return Object.keys(localStorage).filter(k=>k.indexOf(prefix)===0).map(k=>k.slice(prefix.length));}
  };
})();
