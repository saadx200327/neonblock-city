'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function element(value=''){
  return {
    value,
    checked:false,
    disabled:false,
    textContent:'',
    setAttribute(){},
    removeAttribute(){},
    classList:{toggle(){}},
    close(){}
  };
}

async function exercise(file){
  const inputs={
    cardId:element('11111111-1111-4111-8111-111111111111'),
    category:element('Pokémon'),
    subject:element('Pikachu'),
    cardNumber:element('4'),
    variation:element('Base / standard'),
    quantity:element('1'),
    condition:element('Raw — unknown'),
    saveCardBtn:element(),
    cardSaveState:element(),
    cardDialog:element()
  };
  const captured={row:null};

  global.window={};
  global.document={
    getElementById(id){return inputs[id]||element('')},
    querySelector(){return null},
    addEventListener(){},
    createElement(){return element()}
  };
  global.HTMLFormElement=function HTMLFormElement(){};
  global.toast=()=>{};
  global.setView=()=>{};
  global.state={
    backend:'cloud',
    user:{id:'22222222-2222-4222-8222-222222222222'},
    holdings:[],
    scan:{
      imageDataUrl:'data:image/jpeg;base64,card',
      confidence:36,
      text:'#4 Pikachu Scrappy Spark 30',
      localVisualSignature:{
        source:'cardfolio_local_v1',
        image_sha256:'abc123',
        dhash64:'0123456789abcdef',
        width:744,
        height:1039,
        generated_at:'2026-09-07T23:53:00.000Z'
      },
      fields:{metadata:{
        needs_visual_analysis:true,
        visual_analysis_status:'expert_queue_after_save',
        expert_review_status:'queued_after_save'
      }}
    },
    supabase:{
      from(name){
        assert.equal(name,'card_holdings');
        return {
          async upsert(row){captured.row=row;return {error:null}},
          update(){throw new Error('photo update should not run without a File')}
        };
      },
      storage:{from(){throw new Error('storage upload should not run without a File')}}
    }
  };

  vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
  assert.equal(typeof window.cardfolioDefinitiveSave,'function');
  await window.cardfolioDefinitiveSave();

  assert.ok(captured.row,`${file} must upsert a holding`);
  assert.equal(captured.row.variant_name,null,'Base / standard is a placeholder, not a real variation');
  assert.equal(captured.row.card_type,'base','placeholder variation must not turn a base card into a parallel');
  assert.equal(captured.row.metadata.needs_visual_analysis,true,'visual-review queue signal must survive safe save');
  assert.equal(captured.row.metadata.visual_analysis_status,'expert_queue_after_save');
  assert.equal(captured.row.metadata.expert_review_status,'queued_after_save');
  assert.equal(captured.row.metadata.local_visual_signature.image_sha256,'abc123','exact-image fingerprint must survive safe save');
  assert.equal(captured.row.metadata.local_visual_signature.dhash64,'0123456789abcdef','perceptual fingerprint must survive safe save');
  assert.equal(captured.row.metadata.scan_confidence,36);
  assert.match(captured.row.metadata.scan_ocr,/Scrappy Spark/);
}

(async()=>{
  await exercise('cardfolio-save-stack-guard.js');
  await exercise('cardfolio-save-v2.js');
  console.log('Cardfolio save contract: PASS');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
