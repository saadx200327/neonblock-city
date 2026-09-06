const MAX_QUERY = 200;

function safeText(value: unknown, max = 300) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function listingStats(items: Array<{ price: number; currency: string }>) {
  const values = items
    .filter((item) => item.currency === 'USD' && Number.isFinite(item.price))
    .map((item) => item.price)
    .sort((a, b) => a - b);

  if (!values.length) return { count: 0, median: null, low: null, high: null };
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;

  return {
    count: values.length,
    median: Number(median.toFixed(2)),
    low: values[0],
    high: values[values.length - 1]
  };
}

async function getEbayAppToken(clientId: string, clientSecret: string) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope'
  });

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) throw new Error(`eBay OAuth failed (${response.status})`);
  const data = await response.json();
  return String(data.access_token || '');
}

export default async (request: Request) => {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers });
  }

  let body: { query?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const query = safeText(body.query, MAX_QUERY).replace(/[\x00-\x1F\x7F]/g, ' ').trim();
  if (query.length < 2) {
    return new Response(JSON.stringify({ error: 'A card query is required' }), { status: 400, headers });
  }

  const clientId = Netlify.env.get('EBAY_CLIENT_ID') || '';
  const clientSecret = Netlify.env.get('EBAY_CLIENT_SECRET') || '';
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({
      configured: false,
      error: 'eBay API credentials are not configured'
    }), { status: 503, headers });
  }

  try {
    const token = await getEbayAppToken(clientId, clientSecret);
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '30');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept-Language': 'en-US'
      }
    });

    if (!response.ok) throw new Error(`eBay Browse search failed (${response.status})`);
    const data = await response.json();
    const items = (Array.isArray(data.itemSummaries) ? data.itemSummaries : [])
      .map((item: any) => ({
        id: safeText(item.itemId, 100),
        title: safeText(item.title, 240),
        price: Number(item.price?.value),
        currency: safeText(item.price?.currency, 8),
        condition: safeText(item.condition, 80),
        image: safeText(item.image?.imageUrl, 500),
        url: safeText(item.itemWebUrl, 700)
      }))
      .filter((item: any) => item.title && item.url && Number.isFinite(item.price));

    return new Response(JSON.stringify({
      configured: true,
      query,
      observedAt: new Date().toISOString(),
      stats: listingStats(items),
      items
    }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ configured: true, error: 'Live eBay lookup failed' }), {
      status: 502,
      headers
    });
  }
};

export const config = {
  path: '/api/ebay'
};
