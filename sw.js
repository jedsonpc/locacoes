const appVersion = "local-2.1.40-auto-20260716-1337";
const cachePrefix = "app-locacao-";
const cacheName = `${cachePrefix}${appVersion}-relatorios-20260716-v2140`;
const staticFiles = [
  "./",
  "./index.html",
  "./login.html",
  "./styles.css",
  "./app.js",
  "./supabase-config.js",
  "./supabase-sync.js",
  "./update-checker.js",
  "./manifest.webmanifest",
  "./version.json",
  "./logo-cupe-beach-living.png",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./cupe-beach-living.jpg",
  "./cupe-login-recorte-real.jpg"
];

const offlineHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Cupe Beach Living offline</title><style>body{margin:0;font-family:Arial,sans-serif;background:#f7f8fb;color:#111827;display:grid;min-height:100vh;place-items:center;padding:24px}main{max-width:520px;background:#fff;border:1px solid #d8dee9;border-radius:8px;box-shadow:0 18px 45px rgba(17,24,39,.08);padding:28px}h1{color:#0f766e;font-size:24px;margin:0 0 10px}p{line-height:1.5}button{background:#0f766e;border:0;border-radius:8px;color:#fff;cursor:pointer;font-weight:700;padding:10px 14px}</style></head><body><main><h1>Voce esta offline</h1><p>O app continua disponivel neste dispositivo. As informacoes salvas localmente aparecem assim que a tela carregar.</p><button onclick="location.reload()">Tentar novamente</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => Promise.allSettled(staticFiles.map((file) => cache.add(file)))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(cacheName).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return new Response(offlineHtml, { headers: { "Content-Type": "text/html;charset=utf-8" } });
    return Response.error();
  }));
});






























