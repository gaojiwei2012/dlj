const CACHE='douliuji-v2';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/manifest.webmanifest','/favicon-32.png','/icon-192.png']))));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&!e.request.url.includes('/api/'))e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))})

self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('douliuji-')&&key!==CACHE).map(key=>caches.delete(key))))));
