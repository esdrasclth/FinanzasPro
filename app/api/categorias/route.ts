import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// GET    /api/categorias        -> las del usuario más las de sistema
// DELETE /api/categorias?id=... -> elimina una propia
//
// El borrado valida en el servidor lo que antes solo se comprobaba en el
// navegador: que la categoría sea del usuario, que no sea de sistema ni de
// gestión de deudas, y que no tenga subcategorías ni movimientos.

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const filas = await prisma.categories.findMany({
    where: { OR: [{ user_id: session.id }, { es_sistema: true }] },
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({
    categorias: filas.map(c => ({ ...c, created_at: c.created_at.toISOString() })),
  })
}

export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const cat = await prisma.categories.findFirst({ where: { id, user_id: session.id } })
  if (!cat) {
    return NextResponse.json({ error: { message: 'Categoría no encontrada' } }, { status: 404 })
  }
  if (cat.es_sistema || cat.protegida) {
    return NextResponse.json(
      { error: { message: 'Esta categoría es del sistema y no se puede eliminar' } },
      { status: 409 }
    )
  }

  const [hijos, movimientos] = await Promise.all([
    prisma.categories.count({ where: { parent_id: id } }),
    prisma.transactions.count({ where: { category_id: id, user_id: session.id } }),
  ])

  if (hijos > 0) {
    return NextResponse.json(
      { error: { message: 'Esta categoría tiene subcategorías. Elimínalas primero.' } },
      { status: 409 }
    )
  }
  if (movimientos > 0) {
    return NextResponse.json(
      {
        error: {
          message: `Esta categoría tiene ${movimientos} ${movimientos === 1 ? 'movimiento asociado' : 'movimientos asociados'}. Recategorízalos antes de eliminarla.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.categories.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
