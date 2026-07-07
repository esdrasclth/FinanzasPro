import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { requireMiembro } from '../../../../../lib/grupos-server'
import { prepararGasto, escribirPagosYDivisiones, borrarTransaccionesDeGasto } from '../../../../../lib/gastos-server'

type Params = { params: Promise<{ id: string; gastoId: string }> }

// Puede editar/eliminar: el creador del grupo o quien creó el gasto.
async function autorizar(id: string, gastoId: string) {
  const auth = await requireMiembro(id)
  if (!auth.ok) return { ok: false as const, status: auth.status, error: auth.message }

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return { ok: false as const, status: 404, error: 'Grupo no encontrado' }

  const gasto = await prisma.gastos_compartidos.findUnique({ where: { id: gastoId } })
  if (!gasto || gasto.grupo_id !== id) return { ok: false as const, status: 404, error: 'Gasto no encontrado' }

  const puede = grupo.creado_por === auth.ctx.user.id || gasto.creado_por === auth.ctx.user.id
  if (!puede) return { ok: false as const, status: 403, error: 'No puedes modificar este gasto' }

  return { ok: true as const, auth, grupo, gasto }
}

// PUT /api/grupos/[id]/gastos/[gastoId]  -> reemplaza el gasto (revierte y vuelve a reflejar carteras).
export async function PUT(req: Request, { params }: Params) {
  const { id, gastoId } = await params
  const az = await autorizar(id, gastoId)
  if (!az.ok) return NextResponse.json({ error: az.error }, { status: az.status })

  const body = await req.json().catch(() => null)

  const miembros = await prisma.grupo_miembros.findMany({
    where: { grupo_id: id, estado: 'activo' },
    select: { user_id: true },
  })
  const setMiembros = new Set(miembros.map(m => m.user_id))

  const prep = prepararGasto(body, setMiembros)
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
  const d = prep.data

  await prisma.$transaction(async (tx) => {
    // Revertir el estado anterior: transacciones reflejadas + pagos + divisiones.
    await borrarTransaccionesDeGasto(tx, gastoId)
    await tx.gasto_pagos.deleteMany({ where: { gasto_id: gastoId } })
    await tx.gasto_divisiones.deleteMany({ where: { gasto_id: gastoId } })

    await tx.gastos_compartidos.update({
      where: { id: gastoId },
      data: {
        descripcion: d.descripcion,
        monto_total: d.montoTotal,
        fecha: d.fecha,
        mes: d.mes,
        anio: d.anio,
        category_id: d.categoryId,
        metodo_division: d.metodo,
      },
    })

    await escribirPagosYDivisiones(tx, {
      gastoId,
      grupoNombre: az.grupo.nombre,
      descripcion: d.descripcion,
      categoryId: d.categoryId,
      fecha: d.fecha,
      pagos: d.pagos,
      asignados: d.asignados,
      actingUserId: az.auth.ctx.user.id,
    })
  })

  return NextResponse.json({ id: gastoId })
}

// DELETE /api/grupos/[id]/gastos/[gastoId]  -> elimina el gasto y revierte las carteras.
export async function DELETE(_req: Request, { params }: Params) {
  const { id, gastoId } = await params
  const az = await autorizar(id, gastoId)
  if (!az.ok) return NextResponse.json({ error: az.error }, { status: az.status })

  await prisma.$transaction(async (tx) => {
    await borrarTransaccionesDeGasto(tx, gastoId)
    // gasto_pagos y gasto_divisiones se borran en cascada con el gasto.
    await tx.gastos_compartidos.delete({ where: { id: gastoId } })
  })

  return NextResponse.json({ ok: true })
}
