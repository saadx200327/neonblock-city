const CACHE='cardfolio-shell-v21';
const CORE=[
  '/',
  '/cardfolio.css','/cardfolio-vnext.css','/cardfolio-liquid.css',
  '/cardfolio-app.js','/cardfolio-app-2.js','/cardfolio-app-3.js','/cardfolio-app-4.js',
  '/cardfolio-brand.png?v=20260909-brand-static-1'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>Promise.allSettled(CORE.map(url=>cache.add(url))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;

  const isCardfolioProxy=url.pathname==='/api/proxy'&&url.searchParams.has('path');
  if(url.pathname.startsWith('/api/')&&!isCardfolioProxy)return;

  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req)
        .then(res=>{
          if(res.ok)caches.open(CACHE).then(cache=>cache.put('/',res.clone()));
          return res;
        })
        .catch(()=>caches.match('/') )
    );
    return;
  }

  // Static app resources should feel instant on repeat visits. Serve the cached copy
  // immediately and refresh it in the background for the next request.
  event.respondWith(
    caches.match(req).then(hit=>{
      const refresh=fetch(req).then(res=>{
        if(res.ok)caches.open(CACHE).then(cache=>cache.put(req,res.clone()));
        return res;
      });
      return hit||(refresh.catch(()=>caches.match('/')));
    })
  );
});
