/* ProFit service worker: offline shell only.
   - Pages and assets are network-first and fall back to the cache when offline.
   - /api/ is never cached, so member and staff data always comes from the server. */
const CACHE = "profit-shell-v8";
const SHELL = [
  "./", "index.html", "login.html","ui-final.css", "welcome.html", "splash.js", "member-home.html", "trainer-portal.html",
  "styles.css", "pro-theme.css", "spotify.css", "portal-ui.css", "portal-fx.js", "api.js", "auth.js", "config.js",
  "data.js", "layout.js", "sidebar.js", "pf-common.js", "pwa.js", "logo.jpg",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const cached = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
      if (cached) return cached;
      if (req.mode === "navigate") return (await cache.match("login.html")) || Response.error();
      return Response.error();
    }
  })());
});
