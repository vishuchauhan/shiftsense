// ShiftSense offline app shell.
// Strategy: network-first for same-origin GET requests, falling back to the cache when offline.
// Bump CACHE_VERSION on releases that change caching behaviour; old caches are deleted on activate.
const CACHE_VERSION = "v3";
const CACHE = `shiftsense-shell-${CACHE_VERSION}`;
const SHELL = ["/", "/index.html", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("shiftsense-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only same-origin GETs. Firebase / Google API traffic is handled (and cached) by the SDKs themselves.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/@vite") || url.pathname.includes("__vite")) return; // dev server internals
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("/index.html") : Response.error()))
  );
});
