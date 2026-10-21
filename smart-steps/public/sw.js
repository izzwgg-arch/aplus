// Smart Steps ABA — offline-first service worker
//
// v4: every respondWith() path is guaranteed to resolve to a real Response, and
// the precache list carries the /smart-steps basePath.
//
// v3 shipped two latent bugs that only became reachable on 2026-10-21, when the
// registration path was fixed — until then `register("/sw.js")` resolved to the
// A+ Scheduling SPA, so this worker had NEVER registered in production and
// neither bug could fire:
//
//  1. The offline fallback was `.catch(() => cache.match(request))`, and
//     `cache.match` resolves to UNDEFINED when nothing is cached. Passing that
//     to respondWith() throws "Failed to convert value to 'Response'" and the
//     browser reports "resulted in a network error response: the promise was
//     rejected" — a BLANK PAGE instead of the browser's own error. Any fetch
//     failure on a page outside the precache list did it. Every path now ends in
//     a Response, falling back to a plain offline notice.
//  2. PRECACHE listed "/", "/login", "/dashboard" — root paths, which nginx
//     routes to A+ Scheduling on :4000. Install cached the WRONG app's HTML
//     under those keys, and a single addAll() rejection aborts install outright.
//     The list is prefixed now and entries are cached individually so one
//     failure cannot block activation.
const CACHE_NAME = "smart-steps-v4";
const BASE = "/smart-steps";
const PRECACHE = [`${BASE}/`, `${BASE}/login`, `${BASE}/dashboard`, `${BASE}/manifest.json`];

function offlineResponse(request) {
  const accept = request.headers.get("accept") || "";
  if (request.mode === "navigate" || accept.includes("text/html")) {
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">" +
        "<title>Offline</title>" +
        "<body style=\"font-family:system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f8fafc;color:#0f172a\">" +
        "<div style=\"text-align:center;padding:24px\"><h1 style=\"font-size:1.25rem;margin:0 0 8px\">You're offline</h1>" +
        "<p style=\"margin:0 0 16px;color:#475569\">This page isn't saved for offline use. Any data you already entered is kept and will sync.</p>" +
        "<button onclick=\"location.reload()\" style=\"padding:8px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer\">Try again</button>" +
        "</div></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  return new Response("", { status: 503, statusText: "Offline" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually, so one bad URL cannot abort the whole install.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    )
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

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Leave other origins and the API alone.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  // Hashed build assets are immutable per build (new build = new hash = new
  // cache entry), so they are safe to serve from the cache first.
  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((res) => {
              if (res && res.ok) cache.put(request, res.clone());
              return res;
            });
          })
        )
        .catch(() => offlineResponse(request))
    );
    return;
  }

  // Pages/manifest: network first, so a new deploy is visible immediately.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(request))
          // cache.match resolves undefined on a miss — never hand that to
          // respondWith, or the page dies with a network error.
          .then((cached) => cached || offlineResponse(request))
          .catch(() => offlineResponse(request))
      )
  );
});
