// Minimal service worker — enables install-to-home-screen (spec §8) and an
// app-shell cache so the board opens instantly. API calls always hit the
// network (relevance is computed on read; data must be fresh).
//
// IMPORTANT: HTML/navigations are served NETWORK-FIRST. A cache-first shell
// serves a stale index.html that points at the previous build's hashed JS
// bundles; after a redeploy those filenames no longer exist -> the scripts
// 404 -> white screen. Network-first means every deploy is picked up
// immediately; the cache is only an offline fallback. Bump CACHE on changes
// here so the activate handler purges the previous (possibly bad) cache.
const CACHE = "memory-shell-v2";
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return; // never cache API

  // HTML / navigations: network-first so a new deploy is picked up at once.
  const isHTML =
    e.request.mode === "navigate" ||
    (e.request.headers.get("accept") || "").includes("text/html");
  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((h) => h || caches.match("/"))),
    );
    return;
  }

  // Hashed static assets (JS/CSS/images): cache-first is safe because the
  // filenames change per build, so a cached entry is never stale.
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }),
    ),
  );
});
