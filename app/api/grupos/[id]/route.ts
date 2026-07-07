import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { requireMiembro, nombresDeUsuarios } from '../../../lib/grupos-server'

// GET /api/grupos/[id]  -> detalle del grupo + miembros
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  const miembros = await prisma.grupo_miembros.findMany({
    where: { grupo_id: id, estado: 'activo' },
    orderBy: { created_at: 'asc' },
  })
  const removidos = await prisma.grupo_miembros.findMany({
    where: { grupo_id: id, estado: 'removido' },
    orderBy: { created_at: 'asc' },
  })
  const nombres = await nombresDeUsuarios([...miembros, ...removidos].map(m => m.user_id))

  return NextResponse.json({
    grupo: {
      id: grupo.id,
      nombre: grupo.nombre,
      moneda: grupo.moneda,
      codigo_invitacion: grupo.codigo_invitacion,
      creado_por: grupo.creado_por,
    },
    yo: auth.ctx.user.id,
    miembros: miembros.map(m => ({
      user_id: m.user_id,
      rol: m.rol,
      nombre: nombres[m.user_id]?.nombre || 'Usuario',
      email: nombres[m.user_id]?.email || '',
    })),
    removidos: removidos.map(m => ({
      user_id: m.user_id,
      nombre: nombres[m.user_id]?.nombre || 'Usuario',
      email: nombres[m.user_id]?.email || '',
    })),
  })
}
