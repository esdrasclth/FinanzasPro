import { NextResponse } from 'next/server'
import { getSessionUser } from '../../../../lib/auth-server'
import { reporteDeReparto } from '../../../../lib/repartos-reporte-server'

// GET /api/repartos/[id]/reporte
// El mismo documento de liquidación pero de un solo reparto, para poder
// compartir ese gasto sin esperar al cierre del periodo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const reporte = await reporteDeReparto(session.id, id)
  if (!reporte) {
    return NextResponse.json({ error: { message: 'Reparto no encontrado' } }, { status: 404 })
  }
  return NextResponse.json(reporte)
}
