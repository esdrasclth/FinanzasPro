import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { carterasConSaldo, carterasArchivadas } from '../../lib/carteras-server'

// GET /api/carteras
// Carteras activas con su saldo ya calculado, más las archivadas.
// La pantalla recibe el primer render desde el servidor; esta ruta la usa para
// refrescar después de crear, editar, ajustar o archivar una cartera.
export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const [carteras, archivadas] = await Promise.all([
    carterasConSaldo(session.id),
    carterasArchivadas(session.id),
  ])

  return NextResponse.json({ carteras, archivadas })
}

// PATCH /api/carteras  -> { id, activo } archiva o restaura | { orden: [ids] } reordena
export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  if (Array.isArray(body?.orden)) {
    // El orden manual se guarda de una vez, no con una escritura por cartera.
    await prisma.$transaction(
      body.orden.map((id: string, i: number) =>
        prisma.wallets.updateMany({ where: { id, user_id: session.id }, data: { posicion: i } })
      )
    )
    return NextResponse.json({ ok: true })
  }

  const id = body?.id
  if (!id || typeof body?.activo !== 'boolean') {
    return NextResponse.json({ error: { message: 'Datos incompletos' } }, { status: 400 })
  }
  const { count } = await prisma.wallets.updateMany({
    where: { id, user_id: session.id },
    data: { activo: body.activo },
  })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Cartera no encontrada' } }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/carteras?id=...
// Solo si no tiene movimientos: las carteras tienen ON DELETE CASCADE sobre
// transactions, así que borrar una con historial lo destruiría entero.
export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const cartera = await prisma.wallets.findFirst({ where: { id, user_id: session.id } })
  if (!cartera) {
    return NextResponse.json({ error: { message: 'Cartera no encontrada' } }, { status: 404 })
  }

  const movimientos = await prisma.transactions.count({ where: { wallet_id: id } })
  if (movimientos > 0) {
    return NextResponse.json(
      {
        error: {
          message: `No se puede eliminar "${cartera.nombre}": tiene ${movimientos} ${movimientos === 1 ? 'movimiento asociado' : 'movimientos asociados'} que se perderían. Déjala archivada para conservar el histórico.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.wallets.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
