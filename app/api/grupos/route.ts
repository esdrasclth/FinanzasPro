import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { generarCodigoUnico, nombresDeUsuarios } from '../../lib/grupos-server'
import { round2 } from '../../lib/dinero'

// GET /api/grupos  -> grupos donde el usuario es miembro, con saldo y total del mes
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const miembros = await prisma.grupo_miembros.findMany({
    where: { user_id: user.id, estado: 'activo' },
    select: { grupo_id: true, rol: true },
  })
  const ids = miembros.map(m => m.grupo_id)
  const rolPorGrupo: Record<string, string> = {}
  for (const m of miembros) rolPorGrupo[m.grupo_id] = m.rol

  const grupos = await prisma.grupos.findMany({
    where: { id: { in: ids } },
    orderBy: { created_at: 'desc' },
    include: { _count: { select: { miembros: true } } },
  })
  const nombrePorGrupo: Record<string, { nombre: string; color: string; icono: string; moneda: string }> = {}
  for (const g of grupos) nombrePorGrupo[g.id] = { nombre: g.nombre, color: g.color, icono: g.icono, moneda: g.moneda }

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
  const ultima: Record<string, { descripcion: string; fecha: Date }> = {}

  for (const g of gastos) {
    if (g.mes === mesActual && g.anio === anioActual) totalMes[g.grupo_id] = (totalMes[g.grupo_id] || 0) + g.monto_total
    for (const p of g.pagos) if (p.user_id === user.id) net[g.grupo_id] = (net[g.grupo_id] || 0) + p.monto
    for (const d of g.divisiones) if (d.user_id === user.id) net[g.grupo_id] = (net[g.grupo_id] || 0) - d.monto_asignado
    const prev = ultima[g.grupo_id]
    if (!prev || g.created_at > prev.fecha) ultima[g.grupo_id] = { descripcion: g.descripcion, fecha: g.created_at }
  }
  for (const l of liqs) {
    if (l.de_user_id === user.id) net[l.grupo_id] = (net[l.grupo_id] || 0) + l.monto
    if (l.a_user_id === user.id) net[l.grupo_id] = (net[l.grupo_id] || 0) - l.monto
  }

  // Feed de actividad reciente (últimos gastos de todos los grupos).
  const recientes = [...gastos].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, 10)
  const autores = await nombresDeUsuarios(recientes.map(g => g.creado_por))
  const actividad = recientes.map(g => ({
    id: g.id,
    grupo_id: g.grupo_id,
    grupo_nombre: nombrePorGrupo[g.grupo_id]?.nombre || 'Grupo',
    grupo_color: nombrePorGrupo[g.grupo_id]?.color || '#2c6e49',
    grupo_icono: nombrePorGrupo[g.grupo_id]?.icono || '👥',
    descripcion: g.descripcion,
    monto: round2(g.monto_total),
    moneda: nombrePorGrupo[g.grupo_id]?.moneda || 'USD',
    autor: autores[g.creado_por]?.nombre || 'Alguien',
    fecha: g.created_at.toISOString(),
  }))

  return NextResponse.json({
    grupos: grupos.map(g => ({
      id: g.id,
      nombre: g.nombre,
      moneda: g.moneda,
      icono: g.icono,
      color: g.color,
      codigo_invitacion: g.codigo_invitacion,
      creado_por: g.creado_por,
      mi_rol: rolPorGrupo[g.id] || 'miembro',
      miembros: g._count.miembros,
      mi_saldo: round2(net[g.id] || 0), // >0 te deben, <0 debes
      total_mes: round2(totalMes[g.id] || 0),
      ultima_actividad: ultima[g.id]
        ? { descripcion: ultima[g.id].descripcion, fecha: ultima[g.id].fecha.toISOString() }
        : null,
    })),
    actividad,
  })
}

// POST /api/grupos  { nombre, moneda, icono?, color? }
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const nombre = (body?.nombre || '').trim()
  const moneda = (body?.moneda || 'USD').trim().toUpperCase().slice(0, 3)
  const icono = (body?.icono || '👥').toString().slice(0, 8)
  const color = /^#[0-9a-fA-F]{6}$/.test(body?.color || '') ? body.color : '#2c6e49'
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const codigo = await generarCodigoUnico()

  const grupo = await prisma.grupos.create({
    data: {
      nombre,
      moneda,
      icono,
      color,
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
      icono: grupo.icono,
      color: grupo.color,
      codigo_invitacion: grupo.codigo_invitacion,
      creado_por: grupo.creado_por,
      miembros: 1,
    },
  })
}
