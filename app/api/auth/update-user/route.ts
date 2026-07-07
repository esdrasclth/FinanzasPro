import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth-server'

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const { password } = await req.json()
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: { message: 'La contraseña debe tener al menos 6 caracteres' } },
      { status: 400 }
    )
  }

  const password_hash = await bcrypt.hash(password, 10)
  await prisma.users.update({ where: { id: session.id }, data: { password_hash } })
  return NextResponse.json({ ok: true })
}
