import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { categoriasVisibles } from '../../lib/categorias-server'

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
    where: categoriasVisibles(session.id),
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

  // Se busca entre las que el usuario ve —las suyas y las de sistema— para
  // poder explicar por qué no se borra una del sistema en vez de decir que no
  // existe.
  const cat = await prisma.categories.findFirst({
    where: { id, ...categoriasVisibles(session.id) },
  })
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

function leerCategoria(body: any) {
  const nombre = String(body?.nombre || '').trim()
  const tipo = body?.tipo === 'ingreso' ? 'ingreso' : 'gasto'
  if (!nombre) return { error: 'El nombre es obligatorio' }
  return {
    datos: {
      nombre,
      tipo,
      icono: body?.icono || null,
      color: body?.color || null,
      parent_id: body?.parent_id || null,
    },
  }
}

export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const r = leerCategoria(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  // La subcategoría debe colgar de una categoría propia del mismo tipo.
  if (r.datos!.parent_id) {
    const padre = await prisma.categories.findFirst({
      where: { id: r.datos!.parent_id, ...categoriasVisibles(s.id) },
    })
    if (!padre) {
      return NextResponse.json({ error: { message: 'Categoría padre no válida' } }, { status: 400 })
    }
  }

  const cat = await prisma.categories.create({ data: { user_id: s.id, ...r.datos! } })
  return NextResponse.json({ categoria: { ...cat, created_at: cat.created_at.toISOString() } })
}

export async function PUT(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })

  const r = leerCategoria(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const actual = await prisma.categories.findFirst({ where: { id, ...categoriasVisibles(s.id) } })
  if (!actual) return NextResponse.json({ error: { message: 'Categoría no encontrada' } }, { status: 404 })
  if (actual.es_sistema) {
    return NextResponse.json({ error: { message: 'Las categorías del sistema no se editan' } }, { status: 409 })
  }

  const cat = await prisma.categories.update({ where: { id }, data: r.datos! })
  return NextResponse.json({ categoria: { ...cat, created_at: cat.created_at.toISOString() } })
}
