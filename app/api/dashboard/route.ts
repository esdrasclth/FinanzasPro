import { NextResponse } from 'next/server'
import { getSessionUser } from '../../lib/auth-server'
import { prisma } from '../../lib/prisma'
import { datosDashboard } from '../../lib/dashboard-server'
import { totales } from '../../lib/finanzas'

// GET /api/dashboard?offset=0
// Movimientos del mes indicado, resumen del mes y del anterior, y la tasa.
// El primer render llega del Server Component; esta ruta cubre el cambio de mes.
export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const offset = Math.min(Math.max(Number(new URL(req.url).searchParams.get('offset')) || 0, -240), 0)

  const [perfil, datos] = await Promise.all([
    prisma.profiles.findUnique({ where: { id: session.id } }),
    datosDashboard(session.id, offset),
  ])
  const moneda = perfil?.moneda_default || 'HNL'

  return NextResponse.json({
    transacciones: datos.transacciones,
    resumen: totales(datos.transacciones, moneda, datos.tasa),
    resumenPrev: totales(datos.previas, moneda, datos.tasa),
    tasa: datos.tasa,
  })
}
