import { createHash } from 'node:crypto';

const MAX_IMAGE_DATA_URL = 3_400_000;
const MAX_OCR_TEXT = 5000;
const MAX_KNOWN_FIELDS = 5000;
const DEFAULT_MODEL = 'gpt-5.6-sol';
const ALLOWED_FIELDS = [
  'category','subject','year','manufacturer','brand','set_name','subset','card_number',
  'parallel','variant_name','serial_number','serial_denominator','team','league',
  'grading_company','grade','language','edition','rookie','autograph','relic','card_type'
];

function safeText(value,max=1000){
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max) : '';
}
function clamp01(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
}
function imageFingerprint(dataUrl){
  return createHash('sha256').update(dataUrl).digest('hex');
}
function isImageDataUrl(value){
  return typeof value==='string'
    && value.length>40
    && value.length<=MAX_IMAGE_DATA_URL
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(value);
}
function safeJson(value,max=MAX_KNOWN_FIELDS){
  try{return JSON.stringify(value??{}).slice(0,max)}catch{return '{}'}
}
function extractOutputText(response){
  if(typeof response?.output_text==='string')return response.output_text;
  for(const item of response?.output||[]){
    for(const content of item?.content||[]){
      if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
    }
  }
  return '';
}
async function verifyUser(token){
  const supabaseUrl=process.env.SUPABASE_URL||'https://tvxwzkununcwxiwvrslh.supabase.co';
  const publishable=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_--j19axhauUMNFXCgUumMA_d1teIy0H';
  if(!token)return null;
  const r=await fetch(`${supabaseUrl}/auth/v1/user`,{
    headers:{apikey:publishable,Authorization:`Bearer ${token}`},
    signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)return null;
  const user=await r.json();
  return user?.id?user:null;
}
function identifySchema(){
  return {
    type:'object',
    additionalProperties:false,
    required:['overall_confidence','visual_summary','observations','candidate_identity_clues','ambiguities','recommended_checks'],
    properties:{
      overall_confidence:{type:'number'},
      visual_summary:{type:'string'},
      observations:{
        type:'array',
        items:{
          type:'object',
          additionalProperties:false,
          required:['field','value','confidence','evidence'],
          properties:{
            field:{type:'string',enum:ALLOWED_FIELDS},
            value:{type:'string'},
            confidence:{type:'number'},
            evidence:{type:'string'}
          }
        }
      },
      candidate_identity_clues:{type:'array',items:{type:'string'}},
      ambiguities:{type:'array',items:{type:'string'}},
      recommended_checks:{type:'array',items:{type:'string'}}
    }
  };
}
function compareSchema(){
  return {
    type:'object',
    additionalProperties:false,
    required:['decision','match_score','summary','matching_evidence','differences','ambiguities'],
    properties:{
      decision:{type:'string',enum:['accept','reject','ambiguous']},
      match_score:{type:'number'},
      summary:{type:'string'},
      matching_evidence:{type:'array',items:{type:'string'}},
      differences:{type:'array',items:{type:'string'}},
      ambiguities:{type:'array',items:{type:'string'}}
    }
  };
}
function sanitizeIdentify(raw){
  const observations=Array.isArray(raw?.observations)?raw.observations.slice(0,30).map(o=>({
    field:ALLOWED_FIELDS.includes(o?.field)?o.field:'card_type',
    value:safeText(o?.value,160),
    confidence:clamp01(o?.confidence),
    evidence:safeText(o?.evidence,320)
  })).filter(o=>o.value):[];
  return {
    overall_confidence:clamp01(raw?.overall_confidence),
    visual_summary:safeText(raw?.visual_summary,800),
    observations,
    candidate_identity_clues:(Array.isArray(raw?.candidate_identity_clues)?raw.candidate_identity_clues:[]).slice(0,12).map(x=>safeText(x,240)).filter(Boolean),
    ambiguities:(Array.isArray(raw?.ambiguities)?raw.ambiguities:[]).slice(0,12).map(x=>safeText(x,240)).filter(Boolean),
    recommended_checks:(Array.isArray(raw?.recommended_checks)?raw.recommended_checks:[]).slice(0,10).map(x=>safeText(x,240)).filter(Boolean)
  };
}
function sanitizeCompare(raw){
  return {
    decision:['accept','reject','ambiguous'].includes(raw?.decision)?raw.decision:'ambiguous',
    match_score:clamp01(raw?.match_score),
    summary:safeText(raw?.summary,700),
    matching_evidence:(Array.isArray(raw?.matching_evidence)?raw.matching_evidence:[]).slice(0,12).map(x=>safeText(x,260)).filter(Boolean),
    differences:(Array.isArray(raw?.differences)?raw.differences:[]).slice(0,12).map(x=>safeText(x,260)).filter(Boolean),
    ambiguities:(Array.isArray(raw?.ambiguities)?raw.ambiguities:[]).slice(0,10).map(x=>safeText(x,260)).filter(Boolean)
  };
}
async function openaiResponse(payload){
  const key=process.env.OPENAI_API_KEY;
  if(!key)throw Object.assign(new Error('GPT card vision is not configured on the server'),{code:'NOT_CONFIGURED'});
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(60000)
  });
  if(!r.ok){
    let message=`OpenAI vision request failed (${r.status})`;
    try{
      const body=await r.json();
      if(body?.error?.message)message=safeText(body.error.message,300);
    }catch{}
    throw Object.assign(new Error(message),{code:'UPSTREAM',status:r.status});
  }
  return r.json();
}
function identifyPrompt(ocrText,knownFields){
  return `You are Cardfolio's conservative collectible-card visual identity analyst.
Inspect the actual card image pixels first. OCR and known fields are supplementary evidence only.
Do NOT price the card. Do NOT invent a checklist match, parallel, serial number, grade, autograph, relic, rookie status, or variation.
Look for visual-only evidence such as foil/refractor treatment, border/color parallel, image/photo variation, insert/subset branding, rookie marks, autograph or relic windows, serial stamps, grading slab/label, manufacturer marks, card number placement, language/edition and front/back design cues.
Return an observation only when there is visible evidence. Use confidence below 0.75 for uncertain or glare-sensitive calls.
When an exact variant cannot be distinguished from this photo, put that uncertainty in ambiguities and recommend the minimum extra photo/check needed.
OCR text:
${safeText(ocrText,MAX_OCR_TEXT)||'(none)'}
Existing extracted/user-known fields:
${safeJson(knownFields)}`;
}
function comparePrompt(knownIdentity){
  return `You are Cardfolio's exact-comp visual auditor.
Image 1 is the user's reference card. Image 2 is a marketplace candidate.
Decide whether Image 2 is visually compatible with the SAME EXACT collectible-card state as Image 1.
Reject meaningful differences in set/product, card number, base vs parallel, foil/color treatment, image variation, insert/subset, autograph/relic, serial-number denominator, language/edition, or grading company/grade.
Do not accept merely because the same player/character appears.
If photos do not reveal enough to decide, return ambiguous rather than guessing.
Known reference identity (supplementary, not a substitute for the images):
${safeJson(knownIdentity)}`;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const auth=safeText(req.headers.authorization,500);
  const token=auth.match(/^Bearer\s+(.+)$/i)?.[1]||'';
  let user;
  try{user=await verifyUser(token)}catch{return res.status(503).json({error:'Authentication verification unavailable'})}
  if(!user)return res.status(401).json({error:'Sign in to use GPT card vision'});

  const mode=req.body?.mode==='compare'?'compare':'identify';
  const referenceImage=req.body?.imageDataUrl||req.body?.referenceImageDataUrl;
  if(!isImageDataUrl(referenceImage))return res.status(400).json({error:'A compressed JPEG, PNG, or WebP card image is required'});
  const model=safeText(process.env.OPENAI_VISION_MODEL,80)||DEFAULT_MODEL;
  const fingerprint=imageFingerprint(referenceImage);

  try{
    let payload;
    if(mode==='compare'){
      const candidateImageUrl=safeText(req.body?.candidateImageUrl,2000);
      let parsed;
      try{parsed=new URL(candidateImageUrl)}catch{}
      if(!parsed||parsed.protocol!=='https:')return res.status(400).json({error:'A public HTTPS candidate image URL is required'});
      payload={
        model,
        store:false,
        input:[{
          role:'user',
          content:[
            {type:'input_text',text:comparePrompt(req.body?.knownIdentity||{})},
            {type:'input_image',image_url:referenceImage,detail:'high'},
            {type:'input_image',image_url:candidateImageUrl,detail:'high'}
          ]
        }],
        text:{format:{type:'json_schema',name:'card_comp_visual_review',strict:true,schema:compareSchema()}}
      };
    }else{
      payload={
        model,
        store:false,
        input:[{
          role:'user',
          content:[
            {type:'input_text',text:identifyPrompt(req.body?.ocrText||'',req.body?.knownFields||{})},
            {type:'input_image',image_url:referenceImage,detail:'high'}
          ]
        }],
        text:{format:{type:'json_schema',name:'card_visual_analysis',strict:true,schema:identifySchema()}}
      };
    }

    const response=await openaiResponse(payload);
    const outputText=extractOutputText(response);
    if(!outputText)throw Object.assign(new Error('GPT card vision returned no structured result'),{code:'UPSTREAM'});
    let parsed;
    try{parsed=JSON.parse(outputText)}catch{throw Object.assign(new Error('GPT card vision returned invalid structured data'),{code:'UPSTREAM'})}

    if(mode==='compare'){
      return res.status(200).json({
        configured:true,mode,model,imageFingerprint:fingerprint,
        reviewedAt:new Date().toISOString(),review:sanitizeCompare(parsed)
      });
    }
    return res.status(200).json({
      configured:true,mode,model,imageFingerprint:fingerprint,
      analyzedAt:new Date().toISOString(),analysis:sanitizeIdentify(parsed)
    });
  }catch(err){
    if(err?.code==='NOT_CONFIGURED')return res.status(503).json({configured:false,error:'GPT card vision is not configured yet'});
    console.error('Cardfolio vision failed',{code:err?.code||'UNKNOWN',status:err?.status||null,message:safeText(err?.message,300)});
    return res.status(502).json({configured:true,error:'GPT card vision could not analyze this image'});
  }
}
