import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { requireMiembro, nombresDeUsuarios } from '../../../../lib/grupos-server'
import { prepararGasto, escribirPagosYDivisiones } from '../../../../lib/gastos-server'

// GET /api/grupos/[id]/gastos?mes=&anio=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const url = new URL(req.url)
  const mes = url.searchParams.get('mes')
  const anio = url.searchParams.get('anio')

  const gastos = await prisma.gastos_compartidos.findMany({
    where: {
      grupo_id: id,
      ...(mes ? { mes: Number(mes) } : {}),
      ...(anio ? { anio: Number(anio) } : {}),
    },
    orderBy: { fecha: 'desc' },
    include: { pagos: true, divisiones: true },
  })

  const userIds = new Set<string>()
  for (const g of gastos) {
    g.pagos.forEach(p => userIds.add(p.user_id))
    g.divisiones.forEach(d => userIds.add(d.user_id))
    userIds.add(g.creado_por)
  }
  const nombres = await nombresDeUsuarios([...userIds])

  return NextResponse.json({
    gastos: gastos.map(g => ({
      id: g.id,
      descripcion: g.descripcion,
      monto_total: g.monto_total,
      fecha: g.fecha.toISOString().slice(0, 10),
      mes: g.mes,
      anio: g.anio,
      metodo_division: g.metodo_division,
      recibo_url: g.recibo_url,
      creado_por: g.creado_por,
      pagos: g.pagos.map(p => ({
        user_id: p.user_id,
        nombre: nombres[p.user_id]?.nombre || 'Usuario',
        monto: p.monto,
        reflejado: !!p.transaction_id,
      })),
      divisiones: g.divisiones.map(d => ({
        user_id: d.user_id,
        nombre: nombres[d.user_id]?.nombre || 'Usuario',
        monto_asignado: d.monto_asignado,
        valor: d.valor,
      })),
    })),
  })
}

// POST /api/grupos/[id]/gastos
// { descripcion, monto_total, fecha, category_id?, metodo_division, pagos:[{user_id,monto,wallet_id?}], divisiones:[{user_id,valor}] }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => null)

  // Todos los participantes deben ser miembros activos del grupo.
  const miembros = await prisma.grupo_miembros.findMany({
    where: { grupo_id: id, estado: 'activo' },
    select: { user_id: true },
  })
  const setMiembros = new Set(miembros.map(m => m.user_id))

  const prep = prepararGasto(body, setMiembros)
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
  const d = prep.data

  const resultado = await prisma.$transaction(async (tx) => {
    const gasto = await tx.gastos_compartidos.create({
      data: {
        grupo_id: id,
        descripcion: d.descripcion,
        monto_total: d.montoTotal,
        fecha: d.fecha,
        mes: d.mes,
        anio: d.anio,
        category_id: d.categoryId,
        metodo_division: d.metodo,
        creado_por: auth.ctx.user.id,
      },
    })

    await escribirPagosYDivisiones(tx, {
      gastoId: gasto.id,
      grupoNombre: grupo.nombre,
      descripcion: d.descripcion,
      categoryId: d.categoryId,
      fecha: d.fecha,
      pagos: d.pagos,
      asignados: d.asignados,
      actingUserId: auth.ctx.user.id,
    })

    return gasto
  })

  return NextResponse.json({ id: resultado.id })
}
