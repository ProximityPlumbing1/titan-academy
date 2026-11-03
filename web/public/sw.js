// Titan Academy service worker: keeps the app and the lessons a tech has opened working with no signal.
// - App screens and built files: served from the cache, refreshed from the network.
// - The tech's own lessons, modules and home screen: network first, cached copy when offline.
// - Nothing else is cached (admin, live classes, sign-off review, uploads), and nothing is sent offline here:
//   the app queues lesson ticks itself and sends them when signal returns.
const VERSION = 'v2';
const SHELL = `titan-shell-${VERSION}`;
const API = 'titan-api';

const API_CACHEABLE = [
  /^\/api\/auth\/me$/,
  /^\/api\/me\/(overview|program|certificate|final|signoffs|numbers)$/,
  /^\/api\/modules\/[a-z0-9]+$/,
  /^\/api\/modules\/[a-z0-9]+\/lessons\/\d+$/,
  /^\/api\/modules\/[a-z0-9]+\/quiz$/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('titan-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-user-data') event.waitUntil(caches.delete(API));
});

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      if (new URL(request.url).pathname === '/api/auth/me') {
        // Signed out: keep nothing for anyone. Signed in: cache, so the app still opens offline.
        copy.clone().json().then((body) => (body && body.user
          ? caches.open(cacheName).then((c) => c.put(request, copy))
          : caches.delete(cacheName))).catch(() => {});
      } else {
        caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
      }
    }
    return res;
  } catch (e) {
    const cached = await caches.match(request, { cacheName });
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Built files have content hashes in their names, so a cached copy is always right.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        // Each deploy brings new file names; keep the cache from growing forever.
        caches.open(SHELL).then(async (c) => {
          await c.put(req, copy);
          const keys = await c.keys();
          const assets = keys.filter((k) => new URL(k.url).pathname.startsWith('/assets/'));
          for (const k of assets.slice(0, Math.max(0, assets.length - 60))) await c.delete(k);
        });
      }
      return res;
    })));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (API_CACHEABLE.some((re) => re.test(url.pathname))) event.respondWith(networkFirst(req, API));
    return;
  }

  // Page loads: try the network, fall back to the cached app so it still opens offline.
  if (req.mode === 'navigate') {
    if (url.pathname.startsWith('/tv/') || url.pathname.startsWith('/present/')) return; // live screens need the network
    event.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match('/', { cacheName: SHELL })));
  }
});
