export default function handler(req,res){
  const supabaseUrl=process.env.SUPABASE_URL||'';
  const supabasePublishableKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'';
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    configured:Boolean(supabaseUrl&&supabasePublishableKey),
    supabaseUrl,
    supabasePublishableKey,
    ebayConfigured:Boolean(process.env.EBAY_CLIENT_ID&&process.env.EBAY_CLIENT_SECRET)
  });
}
