/* ProFit Service Worker — Offline Shell & Page Fallback with Strict Logout Wipe.
 *
 * Security rules:
 * - NEVER caches /api/* responses (per-user JSON caching lives in web/api.js,
 *   scoped to the signed-in user ID and wiped on logout or 401/403).
 * - Online HTML navigations ALWAYS hit Django first (Network-First) so server
 *   RBAC, active-account checks, and fresh pages always win.
 * - Receiving { type: "CLEAR_PRIVATE_CACHES" } immediately deletes all cached
 *   HTML pages so shared gym devices keep zero portal screens after sign-out.
 */
'use strict';

const ASSETS_CACHE = 'profit-assets-v2';
const PAGES_CACHE = 'profit-pages-v1';
const PUBLIC_PAGES_CACHE = 'profit-public-pages-v1';
const KEEP_CACHES = new Set([ASSETS_CACHE, PAGES_CACHE, PUBLIC_PAGES_CACHE]);

const PUBLIC_PATHS = new Set([
  '/',
  '/welcome',
  '/welcome.html',
  '/login',
  '/login.html',
  '/join',
  '/join.html',
  '/forgot',
  '/forgot.html',
  '/faq',
  '/faq.html'
]);

const PUBLIC_PRECACHED = ['/', '/login', '/join', '/forgot'];

const CORE_ASSETS = [
  '/manifest.webmanifest',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/apple-touch-icon.png',
  '/logo.jpg',
  '/splash.js',
  '/config.js',
  '/api.js',
  '/auth.js',
  '/site-footer.js',
  '/pf-system.css'
];

const STATIC_EXT_RE = /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|webmanifest)$/i;
const CDN_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'unpkg.com'
]);

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Offline — ProFit</title>
  <meta name="theme-color" content="#0a0e17">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #0a0e17;
      color: #f6efdc;
      font-family: "Plus Jakarta Sans", Inter, system-ui, -apple-system, sans-serif;
    }
    .card {
      width: min(440px, 100%);
      padding: 28px 24px;
      border-radius: 18px;
      background: #111622;
      border: 1px solid rgba(255, 255, 255, 0.12);
      text-align: center;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(232, 185, 58, 0.14);
      color: #e8b93a;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    h1 { margin: 0 0 10px; font-size: 22px; line-height: 1.25; }
    p { margin: 0 0 20px; font-size: 14px; line-height: 1.55; color: #a7adc0; }
    .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    a, button {
      height: 42px;
      padding: 0 18px;
      border-radius: 999px;
      font: 700 13.5px/1 inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    .primary { background: #e8b93a; color: #191304; border: 0; }
    .secondary { background: transparent; color: #f6efdc; border: 1px solid rgba(255, 255, 255, 0.2); }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Offline Mode</div>
    <h1>This page isn't saved offline yet</h1>
    <p>You can still open pages you already visited while online. Once your internet reconnects, ProFit will update automatically.</p>
    <div class="actions">
      <button type="button" class="primary" onclick="location.reload()">Try again</button>
      <a class="secondary" href="/">Back to Home</a>
    </div>
  </main>
  <script>window.addEventListener('online', function () { location.reload(); });</script>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(ASSETS_CACHE).then((cache) =>
        Promise.allSettled(
          CORE_ASSETS.map((url) =>
            fetch(url, { cache: 'no-cache' })
              .then((res) => (res && res.ok ? cache.put(url, res.clone()) : null))
              .catch(() => null)
          )
        )
      ),
      caches.open(PUBLIC_PAGES_CACHE).then((cache) =>
        Promise.allSettled(
          PUBLIC_PRECACHED.map((url) =>
            fetch(url, { cache: 'no-cache' })
              .then((res) => (res && res.ok ? cache.put(url, res.clone()) : null))
              .catch(() => null)
          )
        )
      )
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP_CACHES.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'CLEAR_PRIVATE_CACHES') {
    event.waitUntil(
      caches.delete(PAGES_CACHE).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true });
        }
      })
    );
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isCacheableNavigationPath(pathname) {
  if (!pathname) return false;
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/accounts/')) return false;
  return true;
}

async function handleNavigation(request, url) {
  const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });
  const targetCacheName = PUBLIC_PATHS.has(url.pathname) ? PUBLIC_PAGES_CACHE : PAGES_CACHE;
  try {
    const response = await fetch(request);
    if (
      response &&
      response.ok &&
      !response.redirected &&
      isCacheableNavigationPath(url.pathname) &&
      (response.headers.get('content-type') || '').includes('text/html')
    ) {
      const cache = await caches.open(targetCacheName);
      cache.put(cacheKey, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    const cache = await caches.open(targetCacheName);
    const hit = (await cache.match(request)) || (await cache.match(cacheKey));
    if (hit) return hit;
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response('', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept or cache API calls in the service worker (handled per-user in web/api.js).
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  // Never cache the service worker script itself.
  if (url.origin === self.location.origin && url.pathname === '/sw.js') {
    return;
  }

  // HTML page navigations: Network-First so online RBAC is always authoritative.
  if (request.mode === 'navigate') {
    if (url.origin !== self.location.origin) return;
    if (!isCacheableNavigationPath(url.pathname)) return;
    event.respondWith(handleNavigation(request, url));
    return;
  }

  // Same-origin static assets and allowed CDN stylesheets/fonts/scripts: Stale-While-Revalidate.
  const isSameOriginAsset = url.origin === self.location.origin && STATIC_EXT_RE.test(url.pathname);
  const isAllowedCdn = CDN_HOSTS.has(url.hostname);
  if (isSameOriginAsset || isAllowedCdn) {
    event.respondWith(handleStaticAsset(request));
  }
});
