const C='bombbusters-v3';   // 2026-09-22 デザイン刷新で更新
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(C).then(function(c){return c.addAll(['./','./index.html','./online.html','./game_core.js','./manifest.webmanifest','./online.webmanifest','./icon-192.png']);}).catch(function(){}));
  self.skipWaiting();
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==C;}).map(function(k){return caches.delete(k);}));}));
  self.clients.claim();
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  if(new URL(e.request.url).pathname.indexOf('/api/')>=0)return;   // サーバーAPIはキャッシュしない
  e.respondWith(
    fetch(e.request).then(function(r){
      var cp=r.clone();caches.open(C).then(function(c){c.put(e.request,cp);});return r;
    }).catch(function(){return caches.match(e.request);})
  );
});
