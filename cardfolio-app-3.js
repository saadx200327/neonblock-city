function bindViewEvents(){
 $$('.holding[data-card-id]').forEach(el=>el.addEventListener('click',()=>openCardDialog(state.holdings.find(h=>h.id===el.dataset.cardId))));
 $('#portfolioAdd')?.addEventListener('click',()=>openCardDialog());
 $('#portfolioSearch')?.addEventListener('input',e=>{state.filter.q=e.target.value;render()});
 $('#categoryFilter')?.addEventListener('change',e=>{state.filter.category=e.target.value;render()});
 $('#pricingFilter')?.addEventListener('change',e=>{state.filter.pricing=e.target.value;render()});
 $('#cameraBtn')?.addEventListener('click',()=>$('#cameraInput').click());$('#uploadBtn')?.addEventListener('click',()=>$('#uploadInput').click());
 $('#cameraInput')?.addEventListener('change',e=>scanFile(e.target.files?.[0]));$('#uploadInput')?.addEventListener('change',e=>scanFile(e.target.files?.[0]));
 $('#marketSearchBtn')?.addEventListener('click',marketSearchChooser);
 $('#profileSignin')?.addEventListener('click',()=>$('#authDialog').showModal());
 $('#exportBtn')?.addEventListener('click',exportData);
}

function openCardDialog(h=null,prefill=null){
 const d=$('#cardDialog'),data=h||prefill||{};
 $('#cardDialogTitle').textContent=h?'Edit holding':'Add card';
 $('#cardId').value=h?.id||'';
 const map={
   category:'category',subject:'subject',year:'year',manufacturer:'manufacturer',brand:'brand',setName:'set_name',
   subset:'subset',cardNumber:'card_number',parallel:'parallel',variation:'variant_name',serialNumber:'serial_number',
   cardLanguage:'language',edition:'edition',team:'team',league:'league',condition:'condition',quantity:'quantity',
   costBasis:'cost_basis',acquisitionSource:'acquisition_source',acquisitionDate:'acquisition_date',manualValue:'manual_value',
   gradingCompany:'grading_company',grade:'grade',certNumber:'cert_number',notes:'notes'
 };
 for(const [id,key] of Object.entries(map)){
   const el=$('#'+id);
   if(!el)continue;
   el.value=data[key]??(id==='quantity'?1:(id==='condition'?'Raw — unknown':''));
 }
 $('#rookie').checked=!!data.rookie;
 $('#autograph').checked=!!data.autograph;
 $('#relic').checked=!!data.relic;
 $('#deleteCardBtn').classList.toggle('hidden',!h);
 d.showModal();
}
function readCardForm(){
 const get=id=>$('#'+id)?.value?.trim?.()??'';
 return {
   id:get('cardId')||uuid(),category:get('category'),subject:get('subject'),year:get('year'),manufacturer:get('manufacturer'),
   brand:get('brand'),set_name:get('setName'),subset:get('subset'),card_number:get('cardNumber'),parallel:get('parallel'),
   variant_name:get('variation'),serial_number:get('serialNumber'),language:get('cardLanguage'),edition:get('edition'),
   team:get('team'),league:get('league'),condition:get('condition'),quantity:Number(get('quantity')||1),
   cost_basis:get('costBasis')===''?'':Number(get('costBasis')),acquisition_source:get('acquisitionSource'),
   acquisition_date:get('acquisitionDate')||null,manual_value:get('manualValue')===''?'':Number(get('manualValue')),
   grading_company:get('gradingCompany'),grade:get('grade'),cert_number:get('certNumber'),rookie:$('#rookie').checked,
   autograph:$('#autograph').checked,relic:$('#relic').checked,notes:get('notes'),updated_at:nowIso()
 };
}
function holdingSystemFields(source={}){return {image_path:source.image_path||null,image_url:source.image_url||'',tcgdex_card_id:source.tcgdex_card_id||null,market_value:source.market_value??null,valuation_source:source.valuation_source||'',valuation_observed_at:source.valuation_observed_at||null,external_ids:source.external_ids&&typeof source.external_ids==='object'?source.external_ids:{},metadata:source.metadata&&typeof source.metadata==='object'?source.metadata:{}}}
async function saveCardFromForm(){
  const formHolding=readCardForm();
  if(!formHolding.subject){toast('Player or character name is required');return}
  const existing=state.holdings.find(x=>x.id===formHolding.id);

  // Vision Zero is local-only at scan time. Await its fingerprint before serializing
  // the holding so a very fast Save tap cannot bypass expert-queue dedupe metadata.
  if(!existing&&state.scan?.imageDataUrl&&typeof window.cardfolioAnalyzeScanWithVision==='function'&&!state.scan.localVisualSignature){
    try{await window.cardfolioAnalyzeScanWithVision()}catch{}
  }

  const scanFields=!existing&&state.scan?.fields?state.scan.fields:{};
  const nextHolding={...holdingSystemFields(existing||scanFields),...(existing?{created_at:existing.created_at}:{}),...formHolding};
  if(!existing)nextHolding.created_at=nowIso();
  if(!nextHolding.image_url&&state.scan?.imageDataUrl)nextHolding.image_url=state.scan.imageDataUrl;

  if(state.backend==='cloud'&&state.user){
    let uploadedPath=null;
    if(!nextHolding.image_path&&state.scan?.file){
      uploadedPath=await uploadCardPhoto(state.scan.file);
      if(uploadedPath)nextHolding.image_path=uploadedPath;
    }
    const {error}=await state.supabase.from('card_holdings').upsert(toDb(nextHolding));
    if(error){
      if(uploadedPath)await state.supabase.storage.from('card-images').remove([uploadedPath]).catch(()=>{});
      toast('Cloud save failed · no changes were applied');
      return;
    }
    if(!existing&&hasNumericValue(nextHolding.market_value)&&nextHolding.valuation_source){
      const {error:snapshotError}=await state.supabase.from('price_snapshots').insert({id:uuid(),holding_id:nextHolding.id,user_id:state.user.id,market_value:Number(nextHolding.market_value),quantity:Number(nextHolding.quantity||1),currency:'USD',source:nextHolding.valuation_source,observed_at:nextHolding.valuation_observed_at||nowIso()});
      if(snapshotError)console.warn('Cardfolio initial valuation snapshot failed',snapshotError);
    }
    await syncCloud();
  }else{
    if(existing)Object.assign(existing,nextHolding);else state.holdings.unshift(nextHolding);
    if(!existing&&hasNumericValue(nextHolding.market_value)&&nextHolding.valuation_source){
      state.snapshots.push({id:uuid(),holding_id:nextHolding.id,user_id:null,market_value:Number(nextHolding.market_value),quantity:Number(nextHolding.quantity||1),currency:'USD',source:nextHolding.valuation_source,observed_at:nextHolding.valuation_observed_at||nowIso()});
    }
    saveLocal();
  }
  $('#cardDialog').close();state.scan=null;toast(existing?'Holding updated':'Added to portfolio');setView('portfolio')
}
async function uploadCardPhoto(file){try{const blob=await compressImage(file,1500,.82),path=`${state.user.id}/${uuid()}.jpg`;const {error}=await state.supabase.storage.from('card-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw error;return path}catch{toast('Card saved without photo');return null}}
async function deleteCurrentCard(){const id=$('#cardId').value;if(!id||!confirm('Delete this holding? This cannot be undone.'))return;if(state.backend==='cloud'&&state.user){const h=state.holdings.find(x=>x.id===id);const {error}=await state.supabase.from('card_holdings').delete().eq('id',id).eq('user_id',state.user.id);if(error){toast('Delete failed');return}if(h?.image_path)await state.supabase.storage.from('card-images').remove([h.image_path]);await syncCloud()}else{state.holdings=state.holdings.filter(x=>x.id!==id);state.snapshots=state.snapshots.filter(x=>x.holding_id!==id);saveLocal()}$('#cardDialog').close();toast('Holding deleted');render()}
