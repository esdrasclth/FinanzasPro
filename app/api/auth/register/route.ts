import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { createSessionToken, publicUser, SESSION_COOKIE } from '../../../lib/auth-server'

export async function POST(req: Request) {
  const { email, password, nombre } = await req.json()

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: { message: 'Email y contraseña (mínimo 6 caracteres) son requeridos' } },
      { status: 400 }
    )
  }

  const existing = await prisma.users.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    return NextResponse.json(
      { error: { message: 'Ya existe una cuenta con este correo' } },
      { status: 400 }
    )
  }

  const password_hash = await bcrypt.hash(password, 10)
  const user = await prisma.users.create({
    data: { email: email.toLowerCase(), password_hash, nombre: nombre || null },
  })

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
