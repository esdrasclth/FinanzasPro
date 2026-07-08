import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { prepararReparto, requireReparto } from '../../../lib/repartos-server'

// GET /api/repartos/[id] -> detalle con participantes
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const reparto = await prisma.repartos.findUnique({
    where: { id },
    include: { participantes: { orderBy: { orden: 'asc' } } },
  })
  if (!reparto) return NextResponse.json({ error: 'Reparto no encontrado' }, { status: 404 })

  const pagado = reparto.participantes.filter(p => p.pagado).reduce((s, p) => s + p.monto_asignado, 0)

  return NextResponse.json({
    reparto: {
      id: reparto.id,
      descripcion: reparto.descripcion,
      monto_total: reparto.monto_total,
      moneda: reparto.moneda,
      metodo: reparto.metodo,
      fecha: reparto.fecha.toISOString().slice(0, 10),
      monto_pagado: Math.round((pagado + Number.EPSILON) * 100) / 100,
      participantes: reparto.participantes.map(p => ({
        id: p.id,
        nombre: p.nombre,
        monto_asignado: p.monto_asignado,
        pagado: p.pagado,
        fecha_pago: p.fecha_pago ? p.fecha_pago.toISOString().slice(0, 10) : null,
      })),
    },
  })
}

// PUT /api/repartos/[id] -> reemplaza datos y participantes
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const prep = prepararReparto(body)
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
  const d = prep.data

  // Conserva el estado de pago de participantes que sigan (por nombre) tras la edición.
  const previos = await prisma.reparto_participantes.findMany({ where: { reparto_id: id } })
  const pagadoPorNombre = new Map(previos.filter(p => p.pagado).map(p => [p.nombre.toLowerCase(), p.fecha_pago]))

  await prisma.$transaction(async (tx) => {
    await tx.repartos.update({
      where: { id },
      data: {
        descripcion: d.descripcion,
        monto_total: d.montoTotal,
        moneda: d.moneda,
        metodo: d.metodo,
        fecha: d.fecha,
      },
    })
    await tx.reparto_participantes.deleteMany({ where: { reparto_id: id } })
    await tx.reparto_participantes.createMany({
      data: d.participantes.map((p, i) => {
        const eraPagado = pagadoPorNombre.has(p.nombre.toLowerCase())
        return {
          reparto_id: id,
          nombre: p.nombre,
          monto_asignado: p.monto_asignado,
          pagado: eraPagado,
          fecha_pago: eraPagado ? pagadoPorNombre.get(p.nombre.toLowerCase()) ?? null : null,
          orden: i,
        }
      }),
    })
  })

  return NextResponse.json({ id })
}

// DELETE /api/repartos/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  await prisma.repartos.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
