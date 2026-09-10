export default function handler(req,res){
  // Cardfolio's browser config is intentionally pinned to its canonical public Supabase
  // endpoint and publishable key. Do not inherit generic Vercel SUPABASE_* variables
  // from unrelated projects; privileged credentials never belong in this response.
  const supabaseUrl='https://tvxwzkununcwxiwvrslh.supabase.co';
  const supabasePublishableKey='sb_publishable_--j19axhauUMNFXCgUumMA_d1teIy0H';
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
