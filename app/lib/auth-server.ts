import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

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

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
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

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: { nombre: user.nombre || null },
  }
}
