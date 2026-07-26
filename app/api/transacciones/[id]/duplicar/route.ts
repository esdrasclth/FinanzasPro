import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getSessionUser } from '../../../../lib/auth-server'
import { serializarMovimiento } from '../../../../lib/transacciones-mes-server'

// POST /api/transacciones/[id]/duplicar   { fecha? }
//
// Copia un movimiento con la fecha indicada (hoy por defecto), que es para lo
// que sirve duplicar: repetir un gasto habitual sin volver a teclearlo.
//
// Rechaza los movimientos compuestos: una transferencia son dos filas ligadas y
// un abono arrastra el avance de una deuda, así que copiar una sola fila
// dejaría los datos descuadrados.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const original = await prisma.transactions.findFirst({
    where: { id, user_id: session.id },
  })
  if (!original) {
    return NextResponse.json({ error: { message: 'Movimiento no encontrado' } }, { status: 404 })
  }

  if (original.transfer_id || original.wallet_destino_id || original.debt_id) {
    return NextResponse.json(
      {
        error: {
          message: 'Las transferencias y los abonos no se duplican: registran movimiento en dos sitios a la vez. Créalos con el botón de nuevo movimiento.',
        },
      },
      { status: 409 }
    )
  }

  const body = await req.json().catch(() => null)
  const fecha = toDate(body?.fecha || new Date().toISOString().slice(0, 10))

  const copia = await prisma.transactions.create({
    data: {
      user_id: session.id,
      wallet_id: original.wallet_id,
      category_id: original.category_id,
      monto: original.monto,
      moneda: original.moneda,
      tasa_cambio: original.tasa_cambio,
      tipo: original.tipo,
      descripcion: original.descripcion,
      fecha,
    },
    include: {
      category: { select: { nombre: true, icono: true, color: true } },
      wallet: { select: { nombre: true, color: true, tipo: true } },
    },
  })

  return NextResponse.json({ transaccion: serializarMovimiento(copia) })
}
