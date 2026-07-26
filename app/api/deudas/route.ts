import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// GET    /api/deudas          -> lista
// PATCH  /api/deudas          -> { id, completada }  marca saldada / reabre
// DELETE /api/deudas?id=...   -> elimina la deuda y su subcategoría
//
// El borrado y el cierre se hacen en el servidor dentro de una transacción:
// antes eran dos escrituras sueltas desde el navegador (la deuda y su
// subcategoría), así que un fallo entre ambas dejaba una subcategoría
// huérfana o una deuda sin su categoría.

const aISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export function serializarDeuda(d: any) {
  return {
    ...d,
    fecha_limite: aISO(d.fecha_limite),
    fecha_inicio: aISO(d.fecha_inicio),
    created_at: d.created_at.toISOString(),
  }
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }
  const filas = await prisma.debts.findMany({
    where: { user_id: session.id },
    orderBy: [{ completada: 'asc' }, { created_at: 'desc' }],
  })
  return NextResponse.json({ deudas: filas.map(serializarDeuda) })
}

export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const id = body?.id
  const completada = !!body?.completada
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const deuda = await prisma.debts.findFirst({ where: { id, user_id: session.id } })
  if (!deuda) {
    return NextResponse.json({ error: { message: 'Deuda no encontrada' } }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.debts.update({ where: { id }, data: { completada } })
    // Saldada, su subcategoría se archiva para no seguir presupuestándola;
    // al reabrirla vuelve a estar disponible.
    if (deuda.category_id) {
      await tx.categories.update({ where: { id: deuda.category_id }, data: { archivada: completada } })
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const deuda = await prisma.debts.findFirst({ where: { id, user_id: session.id } })
  if (!deuda) {
    return NextResponse.json({ error: { message: 'Deuda no encontrada' } }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    // Los abonos se borran en cascada. Las transacciones que los reflejaron se
    // conservan: son gastos reales que ya ocurrieron, y quedan con debt_id nulo.
    await tx.debts.delete({ where: { id } })
    if (deuda.category_id) {
      await tx.categories.deleteMany({ where: { id: deuda.category_id, user_id: session.id } })
    }
  })

  return NextResponse.json({ ok: true })
}
