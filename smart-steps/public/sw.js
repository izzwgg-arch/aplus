// Smart Steps ABA — offline-first service worker
//
// v3: switched from cache-first (every GET, including HTML pages) to
// network-first for pages/manifest. Cache-first was silently freezing
// returning users on whatever build was cached when they first visited —
// new deploys never showed up until the cache was manually cleared.
// Hashed `_next/static/*` build assets are still cache-first since they're
// immutable per build (new build = new hash = new cache entry anyway).
const CACHE_NAME = "smart-steps-v3";
const PRECACHE = ["/", "/login", "/dashboard", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.includes("/api/")) return;

  const isHashedBuildAsset = url.pathname.includes("/_next/static/");

  if (isHashedBuildAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Pages/manifest: always try the network first so a new deploy is visible
  // immediately; fall back to the cache only when offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
  );
});
