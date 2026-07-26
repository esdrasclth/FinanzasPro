import { NextResponse } from 'next/server'
import { getSessionUser } from '../../lib/auth-server'
import { datosReportes } from '../../lib/reportes-server'

// GET /api/reportes?meses=3
// La pantalla recibe el primer render desde el servidor; esta ruta la usa al
// cambiar de periodo.
export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const meses = Math.min(Math.max(Number(new URL(req.url).searchParams.get('meses')) || 3, 1), 24)
  const datos = await datosReportes(session.id, meses)
  return NextResponse.json(datos)
}
