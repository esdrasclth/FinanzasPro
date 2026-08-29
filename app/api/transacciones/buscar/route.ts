import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth-server'
import { serializarMovimiento } from '../../../lib/transacciones-mes-server'

// GET /api/transacciones/buscar?q=&tipo=&categoria=&cartera=&desde=&hasta=&limit=
//
// Búsqueda en TODO el historial. La pantalla de movimientos filtraba en memoria
// sobre el mes ya cargado, así que buscar "Uber" en el año era imposible.

const aFecha = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const tipo = url.searchParams.get('tipo') || ''
  const categoria = url.searchParams.get('categoria') || ''
  const cartera = url.searchParams.get('cartera') || ''
  const desde = url.searchParams.get('desde') || ''
  const hasta = url.searchParams.get('hasta') || ''
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  const where: any = { user_id: session.id }

  if (q) {
    // Busca en la descripción y en el nombre de la categoría.
    where.OR = [
      { descripcion: { contains: q, mode: 'insensitive' } },
      { category: { nombre: { contains: q, mode: 'insensitive' } } },
    ]
  }
  if (tipo === 'gasto' || tipo === 'ingreso') where.tipo = tipo
  if (cartera) where.wallet_id = cartera
  if (categoria) where.category = { ...(where.category || {}), nombre: { equals: categoria, mode: 'insensitive' } }
  if (desde || hasta) {
    where.fecha = {}
    if (desde) where.fecha.gte = aFecha(desde)
    if (hasta) where.fecha.lte = aFecha(hasta)
  }

  const [filas, total] = await Promise.all([
    prisma.transactions.findMany({
      where,
      include: {
        category: { select: { nombre: true, icono: true, color: true } },
        wallet: { select: { nombre: true, color: true, tipo: true } },
      },
      orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
      skip: offset,
      take: limit,
    }),
    prisma.transactions.count({ where }),
  ])

  // Misma forma que devuelve el cliente de datos, para que la pantalla no tenga
  // que distinguir de dónde vinieron los resultados.
  const data = filas.map(serializarMovimiento)

  return NextResponse.json({ data, total, truncado: total > data.length })
}
