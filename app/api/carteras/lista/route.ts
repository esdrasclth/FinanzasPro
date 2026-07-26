import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth-server'

// GET /api/carteras/lista
// Carteras activas sin calcular saldos, para los selectores. /api/carteras
// hace tres consultas agregadas que aquí no hacen falta.
export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const carteras = await prisma.wallets.findMany({
    where: { user_id: session.id, activo: true },
    select: { id: true, nombre: true, moneda: true, tipo: true, color: true },
    orderBy: { posicion: 'asc' },
  })

  return NextResponse.json({ carteras })
}
