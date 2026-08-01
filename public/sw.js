// v2: la v1 guardaba en caché, para siempre, los payloads de navegación del
// router de Next. Al subir la versión, el handler de `activate` borra la caché
// vieja y con ella las respuestas ya rancias.
const CACHE = 'caudal-v2'
const OFFLINE_URL = '/offline'
const PRECACHE = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

// Lo único que se sirve desde caché sin preguntar: assets con hash en el nombre
// o que no cambian. Todo lo demás va a la red.
const ESTATICO = /^\/(?:_next\/static|icons)\/|\.(?:js|css|woff2?|png|jpe?g|svg|ico|webp)$/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Don't cache API/auth calls — always hit network.
  if (url.pathname.startsWith('/api/')) return

  // Payloads RSC: es lo que pide el router de Next al navegar dentro de la app
  // (router.push). No llegan con mode 'navigate', así que caían en la rama de
  // abajo y se servían desde caché para siempre: los saldos y los movimientos
  // se quedaban congelados hasta recargar con F5.
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return

  // Navigations: network-first, fall back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    )
    return
  }

  // Static assets: cache-first, then network.
  if (!ESTATICO.test(url.pathname)) return

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && (res.type === 'basic' || res.type === 'default')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          }
          return res
        })
    )
  )
})
