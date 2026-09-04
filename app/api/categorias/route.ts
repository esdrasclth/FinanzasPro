import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { categoriasVisibles } from '../../lib/categorias-server'
import { esCategoriaInterna } from '../../lib/finanzas'

// GET    /api/categorias        -> las del usuario más las de sistema
// DELETE /api/categorias?id=... -> elimina una propia
//
// El borrado valida en el servidor lo que antes solo se comprobaba en el
// navegador: que la categoría sea visible para el usuario, que no sea interna
// ni de gestión de deudas, y que no tenga subcategorías ni movimientos suyos.
// Las predeterminadas no se borran, se ocultan: son globales.

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
  if (cat.protegida) {
    return NextResponse.json(
      { error: { message: 'Esta categoría se administra desde la pantalla de Deudas' } },
      { status: 409 }
    )
  }
  if (esCategoriaInterna(cat.nombre)) {
    return NextResponse.json(
      { error: { message: `"${cat.nombre}" la usa la app para su propia mecánica y no se puede eliminar` } },
      { status: 409 }
    )
  }

  // Solo cuentan las subcategorías propias: una predeterminada es global y
  // otras cuentas pueden tener las suyas colgando de ella.
  const [hijos, movimientos] = await Promise.all([
    prisma.categories.count({ where: { parent_id: id, user_id: session.id } }),
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

  // Una predeterminada es global: borrarla se la quitaría a todas las cuentas.
  // Se oculta solo para esta, dejando una copia marcada que la sustituye igual
  // que al editarla (ver PUT); categoriasVisibles hace el resto.
  //
  // Lo que apuntaba a ella se trata como en un borrado de verdad, según lo que
  // haría cada clave foránea: los presupuestos caen (Cascade) y deudas,
  // suscripciones y repartos se quedan sin categoría (SetNull). Movimientos no
  // hay, que es lo que se acaba de comprobar.
  if (!cat.user_id) {
    await prisma.$transaction(async (tx) => {
      const mio = { user_id: session.id, category_id: id }
      await tx.budgets.deleteMany({ where: mio })
      await tx.debts.updateMany({ where: mio, data: { category_id: null } })
      await tx.subscriptions.updateMany({ where: mio, data: { category_id: null } })
      await tx.repartos.updateMany({ where: mio, data: { category_id: null } })
      await tx.categories.create({
        data: {
          user_id: session.id,
          origen_id: cat.id,
          nombre: cat.nombre,
          tipo: cat.tipo,
          icono: cat.icono,
          color: cat.color,
          oculta: true,
        },
      })
    })
    return NextResponse.json({ ok: true })
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
  if (esCategoriaInterna(actual.nombre)) {
    return NextResponse.json(
      {
        error: {
          message: `"${actual.nombre}" la usa la app para registrar aperturas, traspasos y ajustes, y la reconoce por su nombre: cambiárselo descuadraría los saldos.`,
        },
      },
      { status: 409 }
    )
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

  // Editar una predeterminada no la cambia para todos: el usuario se lleva una
  // copia propia y con ella lo suyo —movimientos, presupuestos, deudas,
  // suscripciones y sus subcategorías—, que siguen siendo las mismas filas y
  // conservan su historial. Lo de las demás cuentas se queda en la global.
  //
  // Los gastos de grupo se quedan fuera a propósito: son de un grupo, no de una
  // persona, y moverlos metería la categoría privada de uno en el gasto de otro.
  if (!actual.user_id) {
    const copia = await prisma.$transaction(async (tx) => {
      const nueva = await tx.categories.create({
        data: { user_id: s.id, origen_id: actual.id, ...r.datos! },
      })
      const mio = { user_id: s.id, category_id: actual.id }
      await tx.transactions.updateMany({ where: mio, data: { category_id: nueva.id } })
      await tx.budgets.updateMany({ where: mio, data: { category_id: nueva.id } })
      await tx.debts.updateMany({ where: mio, data: { category_id: nueva.id } })
      await tx.subscriptions.updateMany({ where: mio, data: { category_id: nueva.id } })
      await tx.categories.updateMany({
        where: { user_id: s.id, parent_id: actual.id },
        data: { parent_id: nueva.id },
      })
      return nueva
    })
    return NextResponse.json({ categoria: { ...copia, created_at: copia.created_at.toISOString() } })
  }

  const cat = await prisma.categories.update({ where: { id }, data: r.datos! })
  return NextResponse.json({ categoria: { ...cat, created_at: cat.created_at.toISOString() } })
}
