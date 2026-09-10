export default function handler(req,res){
  const supabaseUrl=process.env.SUPABASE_URL||'https://tvxwzkununcwxiwvrslh.supabase.co';
  const configuredPublishableKey=process.env.SUPABASE_PUBLISHABLE_KEY||'';
  const supabasePublishableKey=configuredPublishableKey.startsWith('sb_publishable_')
    ? configuredPublishableKey
    : 'sb_publishable_--j19axhauUMNFXCgUumMA_d1teIy0H';
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    configured:Boolean(supabaseUrl&&supabasePublishableKey),
    supabaseUrl,
    supabasePublishableKey,
    ebayConfigured:Boolean(process.env.EBAY_CLIENT_ID&&process.env.EBAY_CLIENT_SECRET),
    visionBackend:'expert-queue',
    paidVisionFallback:false
  });
}
