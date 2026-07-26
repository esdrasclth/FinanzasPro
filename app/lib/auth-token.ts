import { SignJWT, jwtVerify } from 'jose'

// Firma y verificación del token de sesión, sin depender de `next/headers`.
//
// Vive aparte de auth-server.ts a propósito: el middleware corre en el runtime
// Edge, donde `cookies()` de next/headers no existe pero `jose` sí funciona.
// Así el middleware puede validar la sesión sin arrastrar nada de Node.

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'caudal-dev-secret'
)

export const SESSION_COOKIE = 'finanzas-pro-session'

export interface SessionUser {
  id: string
  email: string
  nombre?: string | null
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ email: user.email, nombre: user.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (!payload.sub) return null
    return {
      id: payload.sub,
      email: (payload.email as string) || '',
      nombre: (payload.nombre as string) || null,
    }
  } catch {
    return null
  }
}
