import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth-server'
import { serializarDeuda } from '../route'

// GET /api/deudas/[id]
// La deuda con su historial de abonos y las carteras, para la pantalla de
// detalle. Antes eran tres consultas encadenadas desde el navegador.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const deuda = await prisma.debts.findFirst({ where: { id, user_id: session.id } })
  if (!deuda) {
    return NextResponse.json({ error: { message: 'Deuda no encontrada' } }, { status: 404 })
  }

  const [pagos, carteras] = await Promise.all([
    prisma.debt_payments.findMany({
      where: { debt_id: id, user_id: session.id },
      orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
    }),
    prisma.wallets.findMany({
      where: { user_id: session.id },
      select: { id: true, nombre: true },
    }),
  ])

  return NextResponse.json({
    deuda: serializarDeuda(deuda),
    pagos: pagos.map(p => ({
      ...p,
      monto: Number(p.monto),
      fecha: p.fecha.toISOString().slice(0, 10),
      created_at: p.created_at.toISOString(),
    })),
    carteras,
  })
}
