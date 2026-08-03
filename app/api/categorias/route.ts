import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { categoriasVisibles } from '../../lib/categorias-server'
import { esCategoriaInterna } from '../../lib/finanzas'

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

// Reglas del árbol de categorías, iguales al crear que al mover: el padre debe
// existir y ser visible, ser una categoría principal (el árbol es de dos
// niveles), del mismo tipo, y no ser una categoría propia de sí misma ni parte
// del árbol de Deudas, que se administra en su propia pantalla.
async function validarPadre(
  userId: string,
  padreId: string,
  tipo: string,
  idPropio?: string
): Promise<string | null> {
  if (idPropio && padreId === idPropio) return 'Una categoría no puede colgar de sí misma'

  const padre = await prisma.categories.findFirst({
    where: { id: padreId, ...categoriasVisibles(userId) },
  })
  if (!padre) return 'Categoría padre no válida'
  if (padre.parent_id) {
    return `"${padre.nombre}" ya es una subcategoría. Elige una categoría principal.`
  }
  if (padre.tipo !== tipo) {
    return `"${padre.nombre}" es de ${padre.tipo} y esta categoría es de ${tipo}: no se pueden mezclar.`
  }
  if (padre.protegida) {
    return 'Las categorías de deudas se administran desde la pantalla de Deudas'
  }
  if (esCategoriaInterna(padre.nombre)) {
    return `"${padre.nombre}" la usa la app para su propia mecánica: no puede tener subcategorías.`
  }
  return null
}

export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const r = leerCategoria(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  if (r.datos!.parent_id) {
    const mal = await validarPadre(s.id, r.datos!.parent_id, r.datos!.tipo)
    if (mal) return NextResponse.json({ error: { message: mal } }, { status: 400 })
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
  if (actual.protegida) {
    return NextResponse.json(
      { error: { message: 'Esta categoría se administra desde la pantalla de Deudas' } },
      { status: 409 }
    )
  }

  if (r.datos!.parent_id) {
    const mal = await validarPadre(s.id, r.datos!.parent_id, r.datos!.tipo, id)
    if (mal) return NextResponse.json({ error: { message: mal } }, { status: 400 })

    // Colgarla de otra la convertiría en subcategoría, y sus propias
    // subcategorías quedarían en un tercer nivel que la pantalla no dibuja.
    const hijas = await prisma.categories.count({ where: { parent_id: id } })
    if (hijas > 0) {
      return NextResponse.json(
        {
          error: {
            message: `Esta categoría tiene ${hijas} ${hijas === 1 ? 'subcategoría' : 'subcategorías'}: muévelas antes de colgarla de otra.`,
          },
        },
        { status: 409 }
      )
    }
  }

  const cat = await prisma.categories.update({ where: { id }, data: r.datos! })
  return NextResponse.json({ categoria: { ...cat, created_at: cat.created_at.toISOString() } })
}
