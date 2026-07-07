import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { requireMiembro } from '../../../../../lib/grupos-server'

type Params = { params: Promise<{ id: string; userId: string }> }

// DELETE /api/grupos/[id]/miembros/[userId]  -> el creador quita a un miembro (baja lógica).
export async function DELETE(_req: Request, { params }: Params) {
  const { id, userId } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  if (grupo.creado_por !== auth.ctx.user.id) {
    return NextResponse.json({ error: 'Solo el creador puede quitar miembros' }, { status: 403 })
  }
  if (userId === grupo.creado_por) {
    return NextResponse.json({ error: 'El creador no puede quitarse a sí mismo' }, { status: 400 })
  }

  const miembro = await prisma.grupo_miembros.findFirst({ where: { grupo_id: id, user_id: userId } })
  if (!miembro) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })

  await prisma.grupo_miembros.update({ where: { id: miembro.id }, data: { estado: 'removido' } })

  return NextResponse.json({ ok: true })
}

// POST /api/grupos/[id]/miembros/[userId]  -> el creador readmite a un miembro removido.
export async function POST(_req: Request, { params }: Params) {
  const { id, userId } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  if (grupo.creado_por !== auth.ctx.user.id) {
    return NextResponse.json({ error: 'Solo el creador puede readmitir miembros' }, { status: 403 })
  }

  const miembro = await prisma.grupo_miembros.findFirst({ where: { grupo_id: id, user_id: userId } })
  if (!miembro) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })

  await prisma.grupo_miembros.update({ where: { id: miembro.id }, data: { estado: 'activo' } })

  return NextResponse.json({ ok: true })
}
