import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

// Elimina todos los datos privados de una cuenta. Los apuntes compartidos se
// conservan anonimizados porque también forman parte de la contabilidad de
// terceros. Sin esa referencia, borrar una cuenta podría cambiar cuánto deben
// los demás miembros de un grupo.
export async function eliminarCuenta(
  userId: string,
  anonimo: { email: string; passwordHash: string }
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const gruposCreados = await tx.grupos.findMany({
      where: { creado_por: userId },
      select: { id: true },
    })

    for (const grupo of gruposCreados) {
      const sucesor = await tx.grupo_miembros.findFirst({
        where: {
          grupo_id: grupo.id,
          user_id: { not: userId },
          estado: 'activo',
        },
        orderBy: { created_at: 'asc' },
        select: { id: true, user_id: true },
      })

      if (!sucesor) {
        await tx.grupos.delete({ where: { id: grupo.id } })
        continue
      }

      await tx.grupos.update({
        where: { id: grupo.id },
        data: { creado_por: sucesor.user_id },
      })
      await tx.grupo_miembros.update({
        where: { id: sucesor.id },
        data: { rol: 'admin' },
      })
    }

    // Las referencias a carteras/transacciones privadas no deben sobrevivir al
    // borrado. El monto compartido sí permanece para no alterar balances ajenos.
    await Promise.all([
      tx.gasto_pagos.updateMany({
        where: { user_id: userId },
        data: { wallet_id: null, transaction_id: null },
      }),
      tx.liquidaciones.updateMany({
        where: { de_user_id: userId },
        data: { de_wallet_id: null, de_transaction_id: null },
      }),
      tx.liquidaciones.updateMany({
        where: { a_user_id: userId },
        data: { a_wallet_id: null, a_transaction_id: null },
      }),
      tx.grupo_miembros.updateMany({
        where: { user_id: userId },
        data: { estado: 'removido', rol: 'miembro' },
      }),
    ])

    // Se borran primero las tablas sin relación declarada hacia users. Las
    // relaciones internas con onDelete:Cascade resuelven aportes, abonos,
    // cobros y participantes dependientes.
    await tx.notificaciones_descartadas.deleteMany({ where: { user_id: userId } })
    await tx.exchange_rates.deleteMany({ where: { user_id: userId } })
    await tx.subscription_charges.deleteMany({ where: { user_id: userId } })
    await tx.meta_aportes.deleteMany({ where: { user_id: userId } })
    await tx.debt_payments.deleteMany({ where: { user_id: userId } })
    await tx.budget_rollovers.deleteMany({ where: { user_id: userId } })
    await tx.budgets.deleteMany({ where: { user_id: userId } })
    await tx.repartos.deleteMany({ where: { user_id: userId } })
    await tx.transactions.deleteMany({ where: { user_id: userId } })
    await tx.subscriptions.deleteMany({ where: { user_id: userId } })
    await tx.debts.deleteMany({ where: { user_id: userId } })
    await tx.metas.deleteMany({ where: { user_id: userId } })
    await tx.wallets.deleteMany({ where: { user_id: userId } })
    await tx.categories.deleteMany({ where: { user_id: userId } })
    await tx.profiles.deleteMany({ where: { id: userId } })

    // Se conserva únicamente un identificador técnico anónimo para los gastos
    // compartidos históricos. El correo original y las credenciales dejan de
    // existir y todas las sesiones quedan revocadas.
    await tx.users.update({
      where: { id: userId },
      data: {
        email: anonimo.email,
        nombre: 'Usuario eliminado',
        password_hash: anonimo.passwordHash,
        deleted_at: new Date(),
        session_version: { increment: 1 },
      },
    })
  })
}
