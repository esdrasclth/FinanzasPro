import { NextResponse } from 'next/server'
import { getSessionUser } from '../../../lib/auth-server'
import { reporteLiquidacion } from '../../../lib/repartos-reporte-server'

// GET /api/repartos/reporte?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Liquidación del periodo: gastos desglosados, total, lo que le toca a cada
// quien y quién le paga a quién.
export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const p = new URL(req.url).searchParams
  const desde = p.get('desde') || ''
  const hasta = p.get('hasta') || ''
  const valida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

  if (!valida(desde) || !valida(hasta)) {
    return NextResponse.json({ error: { message: 'Indica el rango de fechas' } }, { status: 400 })
  }
  if (desde > hasta) {
    return NextResponse.json({ error: { message: 'La fecha inicial no puede ser posterior a la final' } }, { status: 400 })
  }

  return NextResponse.json(await reporteLiquidacion(session.id, desde, hasta))
}
