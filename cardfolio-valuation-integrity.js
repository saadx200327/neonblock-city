// Cardfolio valuation integrity guard.
// Cloud valuation changes use a single Supabase RPC so the holding and analytics snapshot commit together.

(function(){
  const valuationSource='eBay Browse · active asking median (user accepted)';

  window.applyEbayEstimate=async function applyEbayEstimate(h,value,observedAt){
    const numericValue=Number(value);
    if(!Number.isFinite(numericValue)||numericValue<0)return;
    const timestamp=normalizeTimestamp(observedAt||nowIso());

    if(state.backend==='cloud'&&state.user){
      const {data,error}=await state.supabase.rpc('set_holding_valuation',{
        p_holding_id:h.id,
        p_market_value:numericValue,
        p_source:valuationSource,
        p_observed_at:timestamp,
        p_provenance_url:null,
        p_raw_reference:{provider:'ebay_browse',basis:'active_asking_median',user_accepted:true}
      });
      if(error){
        console.error('Atomic valuation save failed',error);
        toast('Could not save valuation. Nothing changed.');
        return;
      }
      const saved=Array.isArray(data)?data[0]:data;
      h.market_value=Number(saved?.market_value??numericValue);
      h.valuation_source=saved?.valuation_source||valuationSource;
      h.valuation_observed_at=saved?.valuation_observed_at||timestamp;
      const {data:snapshots,error:snapshotError}=await state.supabase
        .from('price_snapshots')
        .select('*')
        .eq('user_id',state.user.id)
        .order('observed_at',{ascending:true});
      if(!snapshotError)state.snapshots=snapshots||[];
    }else{
      h.market_value=numericValue;
      h.valuation_source=valuationSource;
      h.valuation_observed_at=timestamp;
      await recordSnapshot(h,numericValue,valuationSource,timestamp);
      saveLocal();
    }

    toast('Active-listing estimate saved');
    render();
  };
})();
