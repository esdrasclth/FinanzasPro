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

// POST /api/presupuesto -> crea | PUT -> { id, monto_limite } edita
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

  try {
    const b = await prisma.budgets.create({
      data: { user_id: s.id, category_id: categoryId, monto_limite: limite, mes, anio },
    })
    return NextResponse.json({ presupuesto: { ...b, created_at: b.created_at.toISOString() } })
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

  const { count } = await prisma.budgets.updateMany({
    where: { id, user_id: s.id },
    data: { monto_limite: limite },
  })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Presupuesto no encontrado' } }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
