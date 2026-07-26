import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifyToken, type SessionUser } from './auth-token'

// Capa de sesión para Server Components y rutas de API (runtime Node).
// La firma y verificación del token viven en auth-token.ts, que también usa el
// middleware desde el runtime Edge.

export { SESSION_COOKIE, createSessionToken } from './auth-token'
export type { SessionUser } from './auth-token'

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: { nombre: user.nombre || null },
  }
}
