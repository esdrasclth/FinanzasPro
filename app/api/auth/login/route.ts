import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { createSessionToken, publicUser, SESSION_COOKIE } from '../../../lib/auth-server'

export async function POST(req: Request) {
  const { email, password } = await req.json()

  const user = email
    ? await prisma.users.findUnique({ where: { email: email.toLowerCase() } })
    : null

  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return NextResponse.json(
      { error: { message: 'Credenciales inválidas' } },
      { status: 401 }
    )
  }

  const sessionUser = { id: user.id, email: user.email, nombre: user.nombre }
  const token = await createSessionToken(sessionUser)

  const res = NextResponse.json({ user: publicUser(sessionUser) })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
