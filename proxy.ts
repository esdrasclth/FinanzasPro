import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifyToken } from './app/lib/auth-token'

// Protección de rutas en el servidor (convención `proxy.ts` de Next 16).
//
// Antes el control de acceso vivía en un `useEffect` de cada página: el HTML se
// servía a cualquiera y el redirect a /login ocurría ya en el navegador. Eso
// significaba destello de contenido y, sobre todo, que la protección era solo
// visual. Aquí la sesión se valida antes de renderizar nada.
//
// No se tocan las rutas /api: cada una ya valida la sesión y responde 401 en
// JSON. Redirigirlas a /login les devolvería HTML y rompería a los clientes.

const PUBLICAS = new Set(['/login', '/registro', '/offline'])

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const sesion = token ? await verifyToken(token) : null

  // La raíz solo reparte: se resuelve aquí para evitar el salto en el cliente.
  if (pathname === '/') {
    return NextResponse.redirect(new URL(sesion ? '/dashboard' : '/login', req.url))
  }

  // Las pantallas de acceso permanecen disponibles incluso si el JWT tiene
  // firma válida. Su versión puede haber sido revocada en la base de datos
  // (cambio de contraseña o cuenta eliminada), algo que el runtime Edge no
  // consulta. Redirigirlo aquí provocaría un bucle login ↔ dashboard.

  if (!sesion && !PUBLICAS.has(pathname)) {
    const url = new URL('/login', req.url)
    // Para volver a donde iba una vez inicie sesión.
    if (pathname !== '/') url.searchParams.set('next', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Se excluyen las rutas de API, los assets de Next y los archivos estáticos
  // del PWA (manifest, service worker, iconos).
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)',
  ],
}
