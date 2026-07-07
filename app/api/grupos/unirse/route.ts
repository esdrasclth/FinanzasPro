import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth-server'

// POST /api/grupos/unirse  { codigo }
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const codigo = (body?.codigo || '').trim().toUpperCase()
  if (!codigo) return NextResponse.json({ error: 'Ingresa un código' }, { status: 400 })

  const grupo = await prisma.grupos.findUnique({ where: { codigo_invitacion: codigo } })
  if (!grupo) return NextResponse.json({ error: 'Código no válido' }, { status: 404 })

  const existente = await prisma.grupo_miembros.findFirst({
    where: { grupo_id: grupo.id, user_id: user.id },
  })
  if (existente) {
    if (existente.estado === 'removido') {
      return NextResponse.json(
        { error: 'El creador te quitó de este grupo. Pídele que te vuelva a invitar.' },
        { status: 403 }
      )
    }
    if (existente.estado !== 'activo') {
      await prisma.grupo_miembros.update({ where: { id: existente.id }, data: { estado: 'activo' } })
    }
    return NextResponse.json({ grupo_id: grupo.id, yaEra: true })
  }

  await prisma.grupo_miembros.create({
    data: { grupo_id: grupo.id, user_id: user.id, rol: 'miembro', estado: 'activo' },
  })

  return NextResponse.json({ grupo_id: grupo.id, yaEra: false })
}
