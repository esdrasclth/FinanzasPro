import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { datosPresupuesto } from '../../lib/presupuesto-server'

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
