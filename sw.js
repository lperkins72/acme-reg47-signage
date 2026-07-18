const CACHE_VERSION = "2026-07-18-2";
const APP_CACHE = `beacon-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `beacon-runtime-${CACHE_VERSION}`;
const MEDIA_CACHE = `beacon-media-${CACHE_VERSION}`;
const CACHE_NAMES = [APP_CACHE, RUNTIME_CACHE, MEDIA_CACHE];

const APP_SHELL = [
  "./",
  "index.html",
  "primary.html",
  "secondary.html",
  "footer.html",
  "primaryending.html",
  "assets/sync.js",
  "assets/bdn-identity.js",
  "assets/bdn-content-paths.js",
  "assets/bdn-runtime-config.js",
  "assets/kiosk-color-picker.js",
  "assets/tiny-pixel-clock-v2.js",
  "assets/triviatimebeaconlogo.png",
  "assets/icons/clear-night.svg",
  "assets/icons/cloudy.svg",
  "assets/icons/fog.svg",
  "assets/icons/partly-cloudy.svg",
  "assets/icons/partly-cloudy-night.svg",
  "assets/icons/rain.svg",
  "assets/icons/snow.svg",
  "assets/icons/storm.svg",
  "assets/icons/sunny.svg",
  "assets/icons/unknown.svg",
  "assets/primary/manifest.json",
  "data/primary-assets.json",
  "data/primary.json",
  "data/secondary.json",
  "data/footer.json",
  "data/primaryending.json",
  "data/sync.json",
  "regions/reg47/data/primary-assets.json",
  "regions/reg47/data/primary.json",
  "regions/reg47/data/footer.json",
  "regions/reg47/data/primaryending.json",
  "regions/reg47/assets/primary/manifest.json",
  "regions/reg47/assets/footer/manifest.json",
  "devices/reg47/index.html",
  "devices/reg47/nuc-001.html"
];

const MEDIA_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".mp4",
  ".webm",
  ".ogg"
]);

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function extensionOf(pathname) {
  const index = pathname.lastIndexOf(".");
  return index === -1 ? "" : pathname.slice(index).toLowerCase();
}

function isMediaRequest(url) {
  return MEDIA_EXTENSIONS.has(extensionOf(url.pathname));
}

function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  if (url.pathname === "/" || url.pathname.endsWith(".html")) return true;
  return request.headers.get("accept")?.includes("text/html");
}

function isDataRequest(url) {
  return url.pathname.endsWith(".json") || url.pathname.endsWith(".txt");
}

async function putIfUsable(cacheName, request, response, options = {}) {
  if (!response || !response.ok) return response;
  if (response.type !== "basic") return response;

  const clone = response.clone();
  if (options.skipEmpty) {
    const contentLength = clone.headers.get("content-length");
    if (contentLength === "0") return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, clone);
  return response;
}

async function cacheUrl(url) {
  const request = new Request(url, { cache: "reload" });
  try {
    const response = await fetch(request);
    if (!response.ok || response.type !== "basic") return;
    const skipEmpty = isMediaRequest(new URL(request.url));
    await putIfUsable(skipEmpty ? MEDIA_CACHE : RUNTIME_CACHE, request, response, { skipEmpty });
  } catch {
    // Cache warming is best-effort.
  }
}

async function precacheShell() {
  await Promise.allSettled(APP_SHELL.map((path) => cacheUrl(new URL(path, self.location.href).toString())));
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    return putIfUsable(cacheName, request, response);
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error("No cached response available");
  }
}

async function cacheFirst(request, cacheName, options = {}) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  return putIfUsable(cacheName, request, response, options);
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => putIfUsable(cacheName, request, response))
    .catch(() => null);

  return cached || refresh;
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!match || size <= 0) return null;

  let start = match[1] === "" ? null : Number(match[1]);
  let end = match[2] === "" ? null : Number(match[2]);

  if (start === null && end === null) return null;
  if (start === null) {
    const suffixLength = Math.max(0, end || 0);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0) {
    return null;
  }

  return { start, end };
}

async function handleRangeRequest(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (!cached) return fetch(request);

  const buffer = await cached.arrayBuffer();
  const range = parseRange(request.headers.get("range"), buffer.byteLength);
  if (!range) return cached;

  const sliced = buffer.slice(range.start, range.end + 1);
  const headers = new Headers(cached.headers);
  headers.set("accept-ranges", "bytes");
  headers.set("content-length", String(sliced.byteLength));
  headers.set("content-range", `bytes ${range.start}-${range.end}/${buffer.byteLength}`);

  return new Response(sliced, {
    status: 206,
    statusText: "Partial Content",
    headers
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("beacon-") && !CACHE_NAMES.includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;

  event.waitUntil(Promise.allSettled(
    data.urls
      .filter((url) => typeof url === "string" && url.trim())
      .map((url) => cacheUrl(new URL(url, self.location.href).toString()))
  ));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  if (url.searchParams.has("beacon-probe")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.headers.has("range")) {
    event.respondWith(handleRangeRequest(request));
    return;
  }

  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirst(request, APP_CACHE));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isMediaRequest(url)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE, { skipEmpty: true }));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});
