// ShiftSense offline app shell: network-first, fall back to cache.
// Lets the operator reload the app with no connection (the AI model itself is cached by Chrome).
const CACHE = "shiftsense-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only same-origin GETs (app code, styles). Firebase/Google API traffic is handled by the SDKs.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/@vite/") && url.pathname.includes("hmr")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : Response.error()))
      )
  );
});
