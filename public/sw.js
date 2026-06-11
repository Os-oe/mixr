// MIXR service worker — precache app shell + sprites, network-first for API.
const CACHE = 'mixr-v1';
const SPRITES = ['tapioka', 'popping-boba', 'kokos-jelly', 'eiswuerfel', 'erdbeere', 'mango', 'banane', 'blaubeeren', 'kiwi', 'minze', 'sahne', 'karamell-drizzle'];
const PRECACHE = ['/', '/manifest.webmanifest', '/icon.svg', '/menu.json', ...SPRITES.map(s => `/sprites/${s}.png`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // always network
  // <video> fragt mit Range-Header an (Chrome bytes=0-, iOS bytes=0-1):
  // cache.put() wirft fuer 206-Responses, und eine gecachte volle 200 auf einen
  // Range-Request bricht iOS Safari (Media-Error). -> Range immer ans Netz.
  if (e.request.headers.has('range')) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok && res.status === 200 && (url.pathname.startsWith('/sprites/') || url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
