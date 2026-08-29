import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import {
  createSessionToken,
  getSessionUser,
  SESSION_COOKIE,
} from '../../../lib/auth-server'

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const currentPassword = String(body?.current_password || '')
  const password = String(body?.password || '')
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: { message: 'La contraseña debe tener al menos 6 caracteres' } },
      { status: 400 }
    )
  }

  const user = await prisma.users.findUnique({ where: { id: session.id } })
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return NextResponse.json(
      { error: { message: 'La contraseña actual no es correcta' } },
      { status: 403 }
    )
  }

  const password_hash = await bcrypt.hash(password, 10)
  const updated = await prisma.users.update({
    where: { id: session.id },
    data: { password_hash, session_version: { increment: 1 } },
  })

  // Mantiene abierta únicamente esta sesión; todas las demás conservan la
  // versión anterior y dejan de ser válidas en su siguiente petición.
  const token = await createSessionToken({
    id: updated.id,
    email: updated.email,
    nombre: updated.nombre,
    session_version: updated.session_version,
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
