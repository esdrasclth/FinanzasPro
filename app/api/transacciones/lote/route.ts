import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth-server'
import { eliminarMovimiento } from '../../../lib/transacciones-server'
import { categoriasVisibles } from '../../../lib/categorias-server'

// POST /api/transacciones/lote
//   { accion: 'eliminar', ids: [...] }
//   { accion: 'categorizar', ids: [...], category_id }
//
// Cada movimiento se procesa por separado (uno puede arrastrar su pareja, otro
// puede estar ligado a un grupo y rechazarse) y se devuelve el detalle de qué
// se hizo y qué no, en vez de fallar todo el lote por un caso.

const MAX = 200

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const accion = body?.accion
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []

  if (ids.length === 0) {
    return NextResponse.json({ error: { message: 'No seleccionaste ningún movimiento' } }, { status: 400 })
  }
  if (ids.length > MAX) {
    return NextResponse.json({ error: { message: `Máximo ${MAX} movimientos por lote` } }, { status: 400 })
  }

  if (accion === 'eliminar') {
    let eliminadas = 0
    const omitidos: { id: string; motivo: string }[] = []
    const yaBorrados = new Set<string>()

    for (const id of ids) {
      // Una transferencia se borra entera al procesar su primera pierna; si la
      // otra también venía en la selección, ya no existe.
      if (yaBorrados.has(id)) continue

      const r = await eliminarMovimiento(session.id, id)
      if (r.ok) {
        eliminadas += r.eliminadas
        yaBorrados.add(id)
      } else if (r.status === 404) {
        yaBorrados.add(id)
      } else {
        omitidos.push({ id, motivo: r.message })
      }
    }

    return NextResponse.json({ eliminadas, omitidos })
  }

  if (accion === 'categorizar') {
    const categoryId = body?.category_id
    if (!categoryId) {
      return NextResponse.json({ error: { message: 'Selecciona una categoría' } }, { status: 400 })
    }

    // La categoría debe ser del usuario o de sistema.
    const cat = await prisma.categories.findFirst({
      where: { id: categoryId, ...categoriasVisibles(session.id) },
      select: { id: true },
    })
    if (!cat) {
      return NextResponse.json({ error: { message: 'Categoría no válida' } }, { status: 400 })
    }

    // No se recategorizan transferencias ni abonos: su categoría es parte de
    // cómo están ligados a su contraparte.
    const { count } = await prisma.transactions.updateMany({
      where: {
        id: { in: ids },
        user_id: session.id,
        wallet_destino_id: null,
        debt_id: null,
      },
      data: { category_id: categoryId },
    })

    return NextResponse.json({ actualizadas: count, omitidos: ids.length - count })
  }

  return NextResponse.json({ error: { message: 'Acción no soportada' } }, { status: 400 })
}
