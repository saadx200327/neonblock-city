const CACHE='cardfolio-shell-v18';
const APP='/api/proxy?path=index.html';
const SHELL=[
  '/',APP,
  '/cardfolio.css','/cardfolio-vnext.css','/cardfolio-liquid.css',
  '/cardfolio-app.js','/cardfolio-app-2.js','/cardfolio-app-3.js','/cardfolio-app-4.js',
  '/cardfolio-fixes.js','/cardfolio-watchlist.js','/cardfolio-grading.js','/cardfolio-valuation-integrity.js',
  '/cardfolio-scan-review.js','/cardfolio-vnext.js','/cardfolio-product.js','/cardfolio-product-fixes.js',
  '/cardfolio-runtime-hardening.js','/cardfolio-critical-fixes.js','/cardfolio-live-sync.js',
  '/api/proxy?path=cardfolio-commercial.js',
  '/api/proxy?path=cardfolio-identity-persistence.js',
  '/api/proxy?path=cardfolio-exact-identity-client.js',
  '/api/proxy?path=cardfolio-production-guard.js',
  '/api/proxy?path=cardfolio-market-integrity.js',
  '/api/proxy?path=cardfolio-ui-prune.js',
  '/cardfolio-manifest.webmanifest','/cardfolio-icon.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;

  const isCardfolioProxy=url.pathname==='/api/proxy'&&url.searchParams.has('path');
  if(url.pathname.startsWith('/api/')&&!isCardfolioProxy)return;

  event.respondWith(
    fetch(req)
      .then(res=>{
        if(res.ok){
          const copy=res.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy));
        }
        return res;
      })
      .catch(()=>caches.match(req).then(hit=>hit||caches.match(APP)||caches.match('/')))
  );
});