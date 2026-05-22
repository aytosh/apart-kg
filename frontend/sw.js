/* Apart.kg — PWA: кэш статики, кэш последних 50 объявлений, push-уведомления */
const CACHE = "apart-kg-v5";
const LISTING_CACHE = "apart-kg-listings-v1";
const LISTING_LIMIT = 50;
const PRECACHE = [
  "/index.html",
  "/styles.css",
  "/dist/app.js",
  "/manifest.webmanifest",
  "/assets/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        for (const path of PRECACHE) {
          try {
            await cache.add(new Request(path, { cache: "reload" }));
          } catch {
            /* ignore offline dev */
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== LISTING_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimListingCache() {
  const cache = await caches.open(LISTING_CACHE);
  const keys = await cache.keys();
  if (keys.length <= LISTING_LIMIT) return;
  for (const key of keys.slice(0, keys.length - LISTING_LIMIT)) {
    await cache.delete(key);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;

  if (url.pathname === "/api/listings" || url.pathname.startsWith("/api/listings/")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(LISTING_CACHE);
            cache.put(request, fresh.clone());
            trimListingCache();
          }
          return fresh;
        } catch {
          const cached = await caches.match(request, { cacheName: LISTING_CACHE });
          if (cached) return cached;
          throw new Error("offline");
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          if (request.mode === "navigate") {
            const fallback = await caches.match("/index.html");
            if (fallback) return fallback;
          }
          throw new Error("offline");
        });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Apart.kg", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Apart.kg";
  const body = payload.body || "";
  const url = payload.url || "/";
  const tag = payload.kind || "apart-kg";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: "/assets/icon.svg",
      badge: "/assets/icon.svg",
      data: { url, payload },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.endsWith(target) && "focus" in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return null;
    })
  );
});
