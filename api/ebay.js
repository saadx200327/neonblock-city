let tokenCache={token:null,expiresAt:0};
const MAX_QUERY=200;
function safeText(v,max=300){return typeof v==='string'?v.slice(0,max):''}
async function appToken(){
  if(tokenCache.token&&Date.now()<tokenCache.expiresAt-60000)return tokenCache.token;
  const id=process.env.EBAY_CLIENT_ID,secret=process.env.EBAY_CLIENT_SECRET;
  if(!id||!secret)throw Object.assign(new Error('eBay API credentials are not configured'),{code:'NOT_CONFIGURED'});
  const auth=Buffer.from(`${id}:${secret}`).toString('base64');
  const body=new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'});
  const r=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)throw new Error(`eBay OAuth failed (${r.status})`);
  const data=await r.json();tokenCache={token:data.access_token,expiresAt:Date.now()+Number(data.expires_in||7200)*1000};return tokenCache.token;
}
function stats(items){const values=items.filter(x=>x.currency==='USD'&&Number.isFinite(x.price)).map(x=>x.price).sort((a,b)=>a-b);if(!values.length)return{count:0,median:null,low:null,high:null};const mid=Math.floor(values.length/2),median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;return{count:values.length,median:Number(median.toFixed(2)),low:values[0],high:values.at(-1)}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const query=safeText(req.body?.query,MAX_QUERY).replace(/[\x00-\x1F\x7F]/g,' ').trim();
  if(query.length<2)return res.status(400).json({error:'A card query is required'});
  try{
    const token=await appToken();
    const url=new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');url.searchParams.set('q',query);url.searchParams.set('limit','30');
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US','Accept-Language':'en-US'}});
    if(!r.ok)throw new Error(`eBay Browse search failed (${r.status})`);
    const data=await r.json();
    const items=(data.itemSummaries||[]).map(x=>({id:safeText(x.itemId,100),title:safeText(x.title,240),price:Number(x.price?.value),currency:safeText(x.price?.currency,8),condition:safeText(x.condition,80),image:safeText(x.image?.imageUrl,500),url:safeText(x.itemWebUrl,700)})).filter(x=>x.title&&x.url&&Number.isFinite(x.price));
    return res.status(200).json({configured:true,query,observedAt:new Date().toISOString(),stats:stats(items),items});
  }catch(err){if(err.code==='NOT_CONFIGURED')return res.status(503).json({configured:false,error:err.message});return res.status(502).json({configured:true,error:'Live eBay lookup failed'});}
}
