import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { requireMiembro, nombresDeUsuarios } from '../../../../lib/grupos-server'
import { round2 } from '../../../../lib/dinero'

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

// POST /api/grupos/[id]/liquidar
// { de_user_id, a_user_id, monto, fecha?, nota?, wallet_id? }
// wallet_id refleja el movimiento en la cartera del usuario actual (su propio dinero).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const deUser = body?.de_user_id
  const aUser = body?.a_user_id
  const monto = round2(Number(body?.monto))
  const fechaStr = body?.fecha || new Date().toISOString().slice(0, 10)
  const nota = (body?.nota || '').trim() || null
  const walletId = body?.wallet_id || null

  if (!deUser || !aUser || deUser === aUser) {
    return NextResponse.json({ error: 'Selecciona quién paga y quién recibe' }, { status: 400 })
  }
  if (!(monto > 0)) return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })

  const miembros = await prisma.grupo_miembros.findMany({
    where: { grupo_id: id, estado: 'activo' },
    select: { user_id: true },
  })
  const set = new Set(miembros.map(m => m.user_id))
  if (!set.has(deUser) || !set.has(aUser)) {
    return NextResponse.json({ error: 'Los participantes deben ser del grupo' }, { status: 400 })
  }
  if (auth.ctx.user.id !== deUser && auth.ctx.user.id !== aUser) {
    return NextResponse.json({ error: 'Solo puedes registrar pagos donde participas' }, { status: 403 })
  }

  const fecha = toDate(fechaStr)
  const nombres = await nombresDeUsuarios([deUser, aUser])

  // Elige la cartera de un usuario: la indicada si es el usuario actual, o su primera activa.
  const elegirWallet = async (tx: any, userId: string) => {
    if (userId === auth.ctx.user.id && walletId) {
      return tx.wallets.findFirst({ where: { id: walletId, user_id: userId } })
    }
    return tx.wallets.findFirst({ where: { user_id: userId, activo: true }, orderBy: { created_at: 'asc' } })
  }

  const liq = await prisma.$transaction(async (tx) => {
    const data: any = {
      grupo_id: id,
      de_user_id: deUser,
      a_user_id: aUser,
      monto,
      fecha,
      nota,
    }

    // El que paga: gasto en su cartera.
    const walletDe = await elegirWallet(tx, deUser)
    if (walletDe) {
      const t = await tx.transactions.create({
        data: {
          user_id: deUser,
          wallet_id: walletDe.id,
          monto,
          tipo: 'gasto',
          descripcion: `${grupo.nombre}: pago a ${nombres[aUser]?.nombre || 'miembro'}`,
          fecha,
        },
      })
      data.de_wallet_id = walletDe.id
      data.de_transaction_id = t.id
    }

    // El que recibe: ingreso en su cartera.
    const walletA = await elegirWallet(tx, aUser)
    if (walletA) {
      const t = await tx.transactions.create({
        data: {
          user_id: aUser,
          wallet_id: walletA.id,
          monto,
          tipo: 'ingreso',
          descripcion: `${grupo.nombre}: cobro de ${nombres[deUser]?.nombre || 'miembro'}`,
          fecha,
        },
      })
      data.a_wallet_id = walletA.id
      data.a_transaction_id = t.id
    }

    return tx.liquidaciones.create({ data })
  })

  return NextResponse.json({ id: liq.id })
}
