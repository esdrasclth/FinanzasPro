import { prisma } from './prisma'

// Borrado de movimientos, con todo lo que arrastran.
//
// Un movimiento rara vez es una sola fila: una transferencia son dos
// transacciones, un abono son tres filas y un aporte a meta mueve además el
// avance de la meta. Esta función es la única que sabe deshacer cada caso, y la
// usan tanto el borrado individual como el borrado en lote.

const EPS = 0.005

export type ResultadoBorrado =
  | { ok: true; eliminadas: number; deuda_revertida: string | null; meta_revertida: string | null; cobro_revertido: boolean }
  | { ok: false; status: number; message: string }

export async function eliminarMovimiento(userId: string, id: string): Promise<ResultadoBorrado> {
  const trans = await prisma.transactions.findFirst({ where: { id, user_id: userId } })
  if (!trans) return { ok: false, status: 404, message: 'Movimiento no encontrado' }

  // Lo que refleja un gasto de grupo, una liquidación o un reparto se gestiona
  // desde su propia pantalla, que revierte también para los demás participantes.
  const [pagoGrupo, liquidacion, participante, reparto] = await Promise.all([
    prisma.gasto_pagos.findFirst({ where: { transaction_id: id }, select: { id: true } }),
    prisma.liquidaciones.findFirst({
      where: { OR: [{ de_transaction_id: id }, { a_transaction_id: id }] },
      select: { id: true },
    }),
    prisma.reparto_participantes.findFirst({ where: { transaction_id: id }, select: { id: true } }),
    prisma.repartos.findFirst({ where: { transaction_id: id }, select: { id: true } }),
  ])

  if (pagoGrupo || liquidacion) {
    return {
      ok: false,
      status: 409,
      message: 'Este movimiento refleja un gasto o una liquidación de grupo. Elimínalo desde la pantalla del grupo para que se revierta también para los demás.',
    }
  }
  if (participante || reparto) {
    return {
      ok: false,
      status: 409,
      message: 'Este movimiento pertenece a un reparto. Elimínalo desde la pantalla del reparto para que se revierta el cobro completo.',
    }
  }

  // Las dos piernas de una transferencia. transfer_id las une desde que existe;
  // para las anteriores se empareja por carteras cruzadas, fecha y tipo opuesto.
  let idsABorrar = [id]
  if (trans.transfer_id) {
    const piernas = await prisma.transactions.findMany({
      where: { transfer_id: trans.transfer_id, user_id: userId },
      select: { id: true },
    })
    idsABorrar = piernas.map(p => p.id)
  } else if (trans.wallet_destino_id) {
    const pareja = await prisma.transactions.findFirst({
      where: {
        user_id: userId,
        id: { not: id },
        fecha: trans.fecha,
        wallet_id: trans.wallet_destino_id,
        wallet_destino_id: trans.wallet_id,
        tipo: trans.tipo === 'gasto' ? 'ingreso' : 'gasto',
      },
      select: { id: true },
    })
    if (pareja) idsABorrar = [id, pareja.id]
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let deudaRevertida: string | null = null
      let metaRevertida: string | null = null
      let cobroRevertido = false

      // Abono a deuda: devuelve el monto a la deuda y borra el pago.
      const pagos = await tx.debt_payments.findMany({
        where: { transaction_id: { in: idsABorrar }, user_id: userId },
      })
      for (const pago of pagos) {
        const deuda = await tx.debts.update({
          where: { id: pago.debt_id },
          data: { monto_pagado: { decrement: Number(pago.monto) } },
        })
        if (deuda.completada && Number(deuda.monto_pagado) < Number(deuda.monto_total) - EPS) {
          await tx.debts.update({ where: { id: deuda.id }, data: { completada: false } })
        }
        await tx.debt_payments.delete({ where: { id: pago.id } })
        deudaRevertida = deuda.id
      }

      // Aporte a meta: devuelve el monto a la meta y borra el aporte.
      if (trans.transfer_id) {
        const aportes = await tx.meta_aportes.findMany({
          where: { transfer_id: trans.transfer_id, user_id: userId },
        })
        for (const aporte of aportes) {
          const meta = await tx.metas.update({
            where: { id: aporte.meta_id },
            data: { monto_actual: { decrement: Number(aporte.monto) } },
          })
          if (meta.completada && Number(meta.monto_actual) < Number(meta.monto_objetivo) - EPS) {
            await tx.metas.update({ where: { id: meta.id }, data: { completada: false } })
          }
          await tx.meta_aportes.delete({ where: { id: aporte.id } })
          metaRevertida = meta.id
        }
      }

      // Cobro de suscripción: se libera el ciclo para poder confirmarlo de nuevo.
      const cobros = await tx.subscription_charges.findMany({
        where: { transaction_id: { in: idsABorrar }, user_id: userId },
        select: { id: true },
      })
      if (cobros.length > 0) {
        await tx.subscription_charges.deleteMany({ where: { id: { in: cobros.map(c => c.id) } } })
        cobroRevertido = true
      }

      await tx.transactions.deleteMany({ where: { id: { in: idsABorrar }, user_id: userId } })

      return {
        ok: true as const,
        eliminadas: idsABorrar.length,
        deuda_revertida: deudaRevertida,
        meta_revertida: metaRevertida,
        cobro_revertido: cobroRevertido,
      }
    })
  } catch {
    return { ok: false, status: 400, message: 'No se pudo eliminar el movimiento. No se cambió nada.' }
  }
}
