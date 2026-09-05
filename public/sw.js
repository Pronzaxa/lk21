const APP_CACHE = "nuresq-app-hybrid-v1";
const TILE_CACHE = "nuresq-tiles-v3";
const ROUTE_CACHE = "nuresq-routes-v2";
const DATA_CACHE = "nuresq-data-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];
const CACHE_LIMITS = { [TILE_CACHE]: 320, [ROUTE_CACHE]: 40, [DATA_CACHE]: 32 };
const CACHE_TTL = {
  [TILE_CACHE]: 30 * 24 * 60 * 60 * 1000,
  [ROUTE_CACHE]: 6 * 60 * 60 * 1000,
  [DATA_CACHE]: 60 * 60 * 1000,
};

const TILE_HOSTS = new Set([
  "a.basemaps.cartocdn.com", "b.basemaps.cartocdn.com",
  "c.basemaps.cartocdn.com", "d.basemaps.cartocdn.com",
  "tile.openstreetmap.org",
]);
const ROUTE_HOSTS = new Set(["router.project-osrm.org"]);
const DATA_HOSTS = new Set(["data.bmkg.go.id", "api.bmkg.go.id", "api.petabencana.id"]);

async function trimCache(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const limit = CACHE_LIMITS[cacheName] ?? 40;
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function responseWithTimestamp(response) {
  if (response.type === "opaque") return response;
  const headers = new Headers(response.headers);
  headers.set("X-nuRESQ-Cached-At", new Date().toISOString());
  return new Response(await response.clone().blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cacheAge(response) {
  const storedAt = Date.parse(response?.headers.get("X-nuRESQ-Cached-At") ?? "");
  return Number.isFinite(storedAt) ? Date.now() - storedAt : Number.POSITIVE_INFINITY;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      await cache.put(request, await responseWithTimestamp(response));
      void trimCache(cacheName);
    }
    return response;
  } catch {
    if (cached) return cached;
    throw new Error("network and cache unavailable");
  }
}

async function cacheWithTtl(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const freshEnough = cached && cacheAge(cached) <= CACHE_TTL[cacheName];
  if (freshEnough) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      await cache.put(request, await responseWithTimestamp(response));
      void trimCache(cacheName);
    }
    return response;
  } catch {
    if (cached) return cached;
    return new Response(cacheName === ROUTE_CACHE ? "Rute jalan belum tersedia" : "Data belum tersedia", { status: 503 });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const active = new Set([APP_CACHE, TILE_CACHE, ROUTE_CACHE, DATA_CACHE]);
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('nuresq-') && !key.startsWith('nuresq-local-ai-') && !active.has(key)).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Health, capabilities and private backend responses are never cached.
  if (url.pathname === '/health' || (url.pathname.startsWith('/api/') && url.pathname !== '/api/hazards')) return;
  if (url.pathname.includes('/models/')) return; // Versioned model cache belongs to the AI worker.

  if (TILE_HOSTS.has(url.hostname)) {
    event.respondWith(networkFirst(event.request, TILE_CACHE).catch(() => new Response("Peta offline belum tersimpan", { status: 503 })));
    return;
  }
  if (ROUTE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheWithTtl(event.request, ROUTE_CACHE));
    return;
  }
  if (DATA_HOSTS.has(url.hostname) || (url.origin === self.location.origin && url.pathname === "/api/hazards")) {
    event.respondWith(cacheWithTtl(event.request, DATA_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) void caches.open(APP_CACHE).then((cache) => cache.put("/", response.clone()));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) void caches.open(APP_CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
