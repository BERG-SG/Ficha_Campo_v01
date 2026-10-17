// Service worker: guarda o app inteiro no celular para funcionar sem internet.
const CACHE = "berg-fichas-0.8.1-e62d7dd3";
const ASSETS = ["./", "index.html", "app.js", "form.js", "manifest.webmanifest", "lib/xlsx.mini.min.js", "lib/jszip.min.js", "img/ex_1.jpg", "img/ex_2.jpg", "img/ex_3.jpg", "img/ex_4.jpg", "img/ref_alteracao.jpg", "img/ref_dureza.jpg", "img/ref_estruturas.jpg", "img/ref_granulometria.jpg", "img/ref_indice_cor.jpg", "img/ref_percentual.jpg", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/logo-header.png", "icons/maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("berg-fichas-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Primeiro o que está guardado no celular; internet só se faltar algo.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (e.request.mode === "navigate") return caches.match("index.html");
      return fetch(e.request);
    })
  );
});
