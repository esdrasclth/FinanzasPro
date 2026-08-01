import { NextResponse } from 'next/server'
import { getSessionUser } from '../../lib/auth-server'
import { datosReportes, rangoDeMeses } from '../../lib/reportes-server'
import { hoyUsuario } from '../../lib/fecha-server'

// GET /api/reportes?meses=3
// GET /api/reportes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// La pantalla recibe el primer render desde el servidor; esta ruta la usa al
// cambiar de periodo. Acepta un rango explícito además del atajo por meses.
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const desde = params.get('desde') || ''
  const hasta = params.get('hasta') || ''

  let rango: { desde: string; hasta: string }
  if (ISO.test(desde) && ISO.test(hasta)) {
    if (desde > hasta) {
      return NextResponse.json(
        { error: { message: 'La fecha inicial debe ser anterior a la final' } },
        { status: 400 }
      )
    }
    rango = { desde, hasta }
  } else {
    const meses = Math.min(Math.max(Number(params.get('meses')) || 3, 1), 24)
    rango = rangoDeMeses(await hoyUsuario(), meses)
  }

  return NextResponse.json(await datosReportes(session.id, rango))
}
