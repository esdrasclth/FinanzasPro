import { NextResponse } from 'next/server'
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
