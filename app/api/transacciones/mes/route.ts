import { NextResponse } from 'next/server'
import { getSessionUser } from '../../../lib/auth-server'
import { datosMesTransacciones } from '../../../lib/transacciones-mes-server'

// GET /api/transacciones/mes?mes=YYYY-MM
// Movimientos del mes con su categoría y cartera, más el catálogo de
// categorías, las carteras activas y la tasa. La pantalla recibe el primer
// render del servidor; esta ruta la usa al cambiar de mes o tras un cambio.
export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const mes = new URL(req.url).searchParams.get('mes') || ''
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: { message: 'Mes inválido' } }, { status: 400 })
  }

  return NextResponse.json(await datosMesTransacciones(session.id, mes))
}
