import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { datosPresupuesto } from '../../lib/presupuesto-server'
import { categoriasVisibles } from '../../lib/categorias-server'

// GET    /api/presupuesto?mes=&anio=&actual=1
// DELETE /api/presupuesto?id=...&tipo=presupuesto|meta
//
// La pantalla recibe el primer render del servidor; esta ruta la usa al cambiar
// de mes y tras eliminar.

export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const p = new URL(req.url).searchParams
  const mes = Number(p.get('mes'))
  const anio = Number(p.get('anio'))
  if (!(mes >= 1 && mes <= 12) || !(anio > 2000)) {
    return NextResponse.json({ error: { message: 'Mes o año inválido' } }, { status: 400 })
  }

  return NextResponse.json(
    await datosPresupuesto(session.id, mes, anio, p.get('actual') === '1')
  )
}

export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const p = new URL(req.url).searchParams
  const id = p.get('id')
  const tipo = p.get('tipo')
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  if (tipo === 'meta') {
    // Los aportes se borran en cascada, pero las transferencias que movieron el
    // dinero se conservan: son movimientos reales que ya ocurrieron.
    const { count } = await prisma.metas.deleteMany({ where: { id, user_id: session.id } })
    if (count === 0) {
      return NextResponse.json({ error: { message: 'Meta no encontrada' } }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  }

  const { count } = await prisma.budgets.deleteMany({ where: { id, user_id: session.id } })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Presupuesto no encontrado' } }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

// Suma de las partidas de las hijas de una categoría en ese mes. Devuelve null
// si no tiene ninguna, que es cuando el padre manda con su propio monto.
async function sumaDeHijas(
  userId: string,
  categoryId: string,
  mes: number,
  anio: number
): Promise<number | null> {
  const hijas = await prisma.budgets.findMany({
    where: { user_id: userId, mes, anio, category: { parent_id: categoryId } },
    select: { monto_limite: true },
  })
  if (hijas.length === 0) return null
  return hijas.reduce((t, h) => t + Number(h.monto_limite), 0)
}

// POST /api/presupuesto -> crea | PUT -> { id, monto_limite } edita
//
// El monto de una categoría padre no se acepta del cliente: es la suma de las
// partidas de sus hijas (ver presupuesto-server.ts, que es donde se calcula de
// verdad). Aquí se guarda esa suma para que la fila no quede con una cifra que
// contradiga a la pantalla.
// La unicidad por (usuario, categoría, mes, año) la garantiza la base; aquí se
// traduce el choque a un mensaje entendible en vez de un error de Prisma.
export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const categoryId = body?.category_id
  const limite = Number(body?.monto_limite)
  const mes = Number(body?.mes)
  const anio = Number(body?.anio ?? body?.['año'])

  if (!categoryId) return NextResponse.json({ error: { message: 'Selecciona una categoría' } }, { status: 400 })
  if (!(limite > 0)) return NextResponse.json({ error: { message: 'El límite debe ser mayor a 0' } }, { status: 400 })
  if (!(mes >= 1 && mes <= 12) || !(anio > 2000)) {
    return NextResponse.json({ error: { message: 'Mes o año inválido' } }, { status: 400 })
  }

  const cat = await prisma.categories.findFirst({
    where: { id: categoryId, ...categoriasVisibles(s.id) },
    select: { id: true },
  })
  if (!cat) return NextResponse.json({ error: { message: 'Categoría no válida' } }, { status: 400 })

  const suma = await sumaDeHijas(s.id, categoryId, mes, anio)

  try {
    const b = await prisma.budgets.create({
      data: { user_id: s.id, category_id: categoryId, monto_limite: suma ?? limite, mes, anio },
    })
    return NextResponse.json({
      presupuesto: {
        ...b,
        monto_limite: Number(b.monto_limite),
        created_at: b.created_at.toISOString(),
      },
    })
  } catch {
    return NextResponse.json(
      { error: { message: 'Ya tienes un presupuesto para esa categoría en ese mes' } },
      { status: 409 }
    )
  }
}

export async function PUT(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  const limite = Number(body?.monto_limite)
  if (!id) return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  if (!(limite > 0)) return NextResponse.json({ error: { message: 'El límite debe ser mayor a 0' } }, { status: 400 })

  const actual = await prisma.budgets.findFirst({
    where: { id, user_id: s.id },
    select: { category_id: true, mes: true, anio: true },
  })
  if (!actual) {
    return NextResponse.json({ error: { message: 'Presupuesto no encontrado' } }, { status: 404 })
  }

  const suma = await sumaDeHijas(s.id, actual.category_id, actual.mes, actual.anio)
  if (suma !== null) {
    return NextResponse.json(
      {
        error: {
          message: 'El límite de una categoría con subcategorías presupuestadas es la suma de las suyas. Edita las subcategorías.',
        },
      },
      { status: 409 }
    )
  }

  await prisma.budgets.update({ where: { id }, data: { monto_limite: limite } })
  return NextResponse.json({ ok: true })
}
