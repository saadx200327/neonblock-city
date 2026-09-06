const CACHE='cardfolio-shell-v1';
const SHELL=['/','/index.html','/cardfolio.css','/cardfolio-app.js','/cardfolio-app-2.js','/cardfolio-app-3.js','/cardfolio-app-4.js','/cardfolio-manifest.webmanifest','/cardfolio-icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin||new URL(req.url).pathname.startsWith('/api/'))return;
  event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return res}).catch(()=>caches.match(req).then(hit=>hit||caches.match('/index.html'))));
});
