import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { requireReparto, walletDeUsuario } from '../../../../../lib/repartos-server'
import { tasaVigente, montoParaCartera } from '../../../../../lib/tipoCambio-server'

// PATCH /api/repartos/[id]/participantes/[pid]  { pagado: boolean, wallet_id?: string }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const participante = await prisma.reparto_participantes.findUnique({ where: { id: pid } })
  if (!participante || participante.reparto_id !== id) {
    return NextResponse.json({ error: 'Participante no encontrado' }, { status: 404 })
  }

  const reparto = await prisma.repartos.findUnique({ where: { id }, select: { descripcion: true, moneda: true } })
  if (!reparto) return NextResponse.json({ error: 'Reparto no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const pagado = !!body?.pagado

  // La parte propia (es_yo) no genera cobro; solo se marca.
  if (participante.es_yo) {
    await prisma.reparto_participantes.update({
      where: { id: pid },
      data: { pagado, fecha_pago: pagado ? new Date() : null },
    })
    return NextResponse.json({ ok: true })
  }

  let cartera: { id: string; moneda: string } | null = null
  if (pagado) {
    cartera = await walletDeUsuario(auth.userId, body?.wallet_id)
    if (!cartera) return NextResponse.json({ error: 'Selecciona la cartera donde recibiste el pago' }, { status: 400 })
  }
  const walletCobro = cartera?.id ?? null
  const tasa = await tasaVigente(auth.userId)

  await prisma.$transaction(async (tx) => {
    // Revierte cualquier ingreso previo de este participante para no duplicar.
    if (participante.transaction_id) {
      await tx.transactions.deleteMany({ where: { id: participante.transaction_id } })
    }

    let txId: string | null = null
    if (pagado && cartera && participante.monto_asignado > 0) {
      // El cobro entra en la moneda de la cartera donde se recibió.
      const enCartera = montoParaCartera(
        participante.monto_asignado, reparto.moneda, cartera.moneda, tasa
      )
      const ingreso = await tx.transactions.create({
        data: {
          user_id: auth.userId,
          wallet_id: cartera.id,
          monto: enCartera.monto,
          moneda: enCartera.moneda,
          monto_original: enCartera.monto_original,
          tasa_cambio: enCartera.tasa_cambio,
          tipo: 'ingreso',
          descripcion: `Cobro reparto: ${reparto.descripcion} — ${participante.nombre}`,
          fecha: new Date(),
        },
      })
      txId = ingreso.id
    }

    await tx.reparto_participantes.update({
      where: { id: pid },
      data: {
        pagado,
        fecha_pago: pagado ? new Date() : null,
        wallet_id: pagado ? walletCobro : null,
        transaction_id: txId,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
