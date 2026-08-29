import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifyToken, type SessionUser } from './auth-token'
import { prisma } from './prisma'

// Capa de sesión para Server Components y rutas de API (runtime Node).
// La firma y verificación del token viven en auth-token.ts, que también usa el
// middleware desde el runtime Edge.

export { SESSION_COOKIE, createSessionToken } from './auth-token'
export type { SessionUser } from './auth-token'

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session) return null

  // Los JWT siguen siendo autocontenidos para que el proxy pueda validarlos,
  // pero las rutas con datos comprueban la versión contra la base. Cambiar la
  // contraseña o eliminar la cuenta incrementa la versión y revoca de inmediato
  // todas las sesiones emitidas anteriormente.
  const user = await prisma.users.findUnique({
    where: { id: session.id },
    select: { session_version: true, deleted_at: true },
  })
  if (!user || user.deleted_at || user.session_version !== session.session_version) return null
  return session
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: { nombre: user.nombre || null },
  }
}
