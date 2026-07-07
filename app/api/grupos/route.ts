import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { generarCodigoUnico } from '../../lib/grupos-server'

// GET /api/grupos  -> grupos donde el usuario es miembro
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const miembros = await prisma.grupo_miembros.findMany({
    where: { user_id: user.id, estado: 'activo' },
    select: { grupo_id: true },
  })
  const ids = miembros.map(m => m.grupo_id)

  const grupos = await prisma.grupos.findMany({
    where: { id: { in: ids } },
    orderBy: { created_at: 'desc' },
    include: { _count: { select: { miembros: true } } },
  })

  return NextResponse.json({
    grupos: grupos.map(g => ({
      id: g.id,
      nombre: g.nombre,
      moneda: g.moneda,
      codigo_invitacion: g.codigo_invitacion,
      creado_por: g.creado_por,
      miembros: g._count.miembros,
    })),
  })
}

// POST /api/grupos  { nombre, moneda }
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const nombre = (body?.nombre || '').trim()
  const moneda = (body?.moneda || 'USD').trim().toUpperCase().slice(0, 3)
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const codigo = await generarCodigoUnico()

  const grupo = await prisma.grupos.create({
    data: {
      nombre,
      moneda,
      codigo_invitacion: codigo,
      creado_por: user.id,
      miembros: { create: { user_id: user.id, rol: 'admin', estado: 'activo' } },
    },
  })

  return NextResponse.json({
    grupo: {
      id: grupo.id,
      nombre: grupo.nombre,
      moneda: grupo.moneda,
      codigo_invitacion: grupo.codigo_invitacion,
      creado_por: grupo.creado_por,
      miembros: 1,
    },
  })
}
