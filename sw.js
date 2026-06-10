// Rio dos Passos PWA - service worker
// A linha __APP_VERSION__ eh reescrita automaticamente pelo GitHub Actions
// no momento do deploy (vira o SHA do commit). Cada deploy = novo cache.
const appVersion = ["127.0.0.1", "localhost"].includes(self.location.hostname)
  ? "local-1.7.8"
  : "__APP_VERSION__";
const cacheName = `gestao-locacoes-${appVersion}`;
const staticFiles = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./logo-imobiliaria-rio.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      Promise.allSettled(staticFiles.map((f) => cache.add(f).catch(() => null))),
    ),
  );
  // NAO fazemos skipWaiting automatico: aguardamos confirmacao do usuario
  // via o banner "nova versao disponivel".
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== cacheName).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isHtmlOrScript(request, url) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document" || request.destination === "script") return true;
  if (url.pathname.endsWith(".html") || url.pathname.endsWith(".js")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // version.json: sempre rede, nunca cache (eh o checador de nova versao)
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => new Response("{}", { headers: { "Content-Type": "application/json" } })));
    return;
  }

  if (isHtmlOrScript(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(cacheName).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("./index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkResponse = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(cacheName).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cachedResponse);
      return cachedResponse || networkResponse;
    }),
  );
});
