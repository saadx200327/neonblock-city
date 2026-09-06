export default async () => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') || 'https://tvxwzkununcwxiwvrslh.supabase.co';
  const supabasePublishableKey = Netlify.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const ebayConfigured = Boolean(Netlify.env.get('EBAY_CLIENT_ID') && Netlify.env.get('EBAY_CLIENT_SECRET'));

  return new Response(JSON.stringify({
    configured: Boolean(supabaseUrl && supabasePublishableKey),
    supabaseUrl,
    supabasePublishableKey,
    ebayConfigured
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
};

export const config = {
  path: '/api/config'
};
