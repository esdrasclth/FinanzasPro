import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { generarCodigoUnico } from '../../lib/grupos-server'
import { round2 } from '../../lib/dinero'

// GET /api/grupos  -> grupos donde el usuario es miembro, con saldo y total del mes
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

  // Saldo neto del usuario (histórico) y total del mes actual por grupo.
  const [gastos, liqs] = await Promise.all([
    prisma.gastos_compartidos.findMany({ where: { grupo_id: { in: ids } }, include: { pagos: true, divisiones: true } }),
    prisma.liquidaciones.findMany({ where: { grupo_id: { in: ids } } }),
  ])

  const now = new Date()
  const mesActual = now.getMonth() + 1
  const anioActual = now.getFullYear()
  const net: Record<string, number> = {}
  const totalMes: Record<string, number> = {}

  for (const g of gastos) {
    if (g.mes === mesActual && g.anio === anioActual) totalMes[g.grupo_id] = (totalMes[g.grupo_id] || 0) + g.monto_total
    for (const p of g.pagos) if (p.user_id === user.id) net[g.grupo_id] = (net[g.grupo_id] || 0) + p.monto
    for (const d of g.divisiones) if (d.user_id === user.id) net[g.grupo_id] = (net[g.grupo_id] || 0) - d.monto_asignado
  }
  for (const l of liqs) {
    if (l.de_user_id === user.id) net[l.grupo_id] = (net[l.grupo_id] || 0) + l.monto
    if (l.a_user_id === user.id) net[l.grupo_id] = (net[l.grupo_id] || 0) - l.monto
  }

  return NextResponse.json({
    grupos: grupos.map(g => ({
      id: g.id,
      nombre: g.nombre,
      moneda: g.moneda,
      codigo_invitacion: g.codigo_invitacion,
      creado_por: g.creado_por,
      miembros: g._count.miembros,
      mi_saldo: round2(net[g.id] || 0), // >0 te deben, <0 debes
      total_mes: round2(totalMes[g.id] || 0),
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
