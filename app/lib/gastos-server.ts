// Lógica compartida de gastos compartidos: validación, reflejo en carteras y borrado.
// Reutilizada por la creación (POST) y la edición (PUT) para mantener una sola fuente de verdad.
import { calcularDivisiones, round2, DivisionCalculada, DivisionInput } from './dinero'

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

export interface PagoInput {
  user_id: string
  monto: number
  wallet_id?: string
}

export interface PreparedGasto {
  descripcion: string
  montoTotal: number
  metodo: string
  fecha: Date
  mes: number
  anio: number
  categoryId: string | null
  pagos: PagoInput[]
  asignados: DivisionCalculada[]
}

// Valida el cuerpo de un gasto contra los miembros del grupo y devuelve los datos listos.
export function prepararGasto(
  body: any,
  miembrosSet: Set<string>
): { ok: true; data: PreparedGasto } | { ok: false; status: number; error: string } {
  const descripcion = (body?.descripcion || '').trim()
  const montoTotal = round2(Number(body?.monto_total))
  const metodo = body?.metodo_division === 'porcentaje' || body?.metodo_division === 'partes' ? body.metodo_division : 'exacto'
  const fechaStr = body?.fecha || new Date().toISOString().slice(0, 10)
  const pagos: PagoInput[] = Array.isArray(body?.pagos) ? body.pagos : []
  const divisiones: DivisionInput[] = Array.isArray(body?.divisiones) ? body.divisiones : []

  if (!descripcion) return { ok: false, status: 400, error: 'La descripción es obligatoria' }
  if (!(montoTotal > 0)) return { ok: false, status: 400, error: 'El monto debe ser mayor a 0' }
  if (pagos.length === 0) return { ok: false, status: 400, error: 'Indica quién pagó' }
  if (divisiones.length === 0) return { ok: false, status: 400, error: 'Indica entre quiénes se divide' }

  const participantes = [...pagos.map(p => p.user_id), ...divisiones.map(d => d.user_id)]
  for (const uid of participantes) {
    if (!miembrosSet.has(uid)) return { ok: false, status: 400, error: 'Hay participantes que no son del grupo' }
  }

  const sumaPagos = round2(pagos.reduce((s, p) => s + round2(Number(p.monto) || 0), 0))
  if (sumaPagos !== montoTotal) {
    return { ok: false, status: 400, error: `Lo pagado (${sumaPagos}) no coincide con el total (${montoTotal})` }
  }

  let asignados: DivisionCalculada[]
  try {
    asignados = calcularDivisiones(montoTotal, metodo, divisiones)
  } catch (e: any) {
    return { ok: false, status: 400, error: e?.message || 'División inválida' }
  }
  if (metodo === 'exacto') {
    const sumaDiv = round2(asignados.reduce((s, a) => s + a.monto_asignado, 0))
    if (sumaDiv !== montoTotal) {
      return { ok: false, status: 400, error: `La división (${sumaDiv}) no coincide con el total (${montoTotal})` }
    }
  }

  const fecha = toDate(fechaStr)
  const mes = fecha.getUTCMonth() + 1
  const anio = fecha.getUTCFullYear()
  const categoryId = body?.category_id || null

  const pagosNorm: PagoInput[] = pagos.map(p => ({
    user_id: p.user_id,
    monto: round2(Number(p.monto) || 0),
    wallet_id: p.wallet_id,
  }))

  return { ok: true, data: { descripcion, montoTotal, metodo, fecha, mes, anio, categoryId, pagos: pagosNorm, asignados } }
}

// Crea los pagos, divisiones y transacciones reflejadas en las carteras.
// El usuario que ejecuta la acción usa su cartera elegida; para otros se usa su primera cartera activa.
export async function escribirPagosYDivisiones(
  tx: any,
  opts: {
    gastoId: string
    grupoNombre: string
    descripcion: string
    categoryId: string | null
    fecha: Date
    pagos: PagoInput[]
    asignados: DivisionCalculada[]
    actingUserId: string
  }
) {
  const { gastoId, grupoNombre, descripcion, categoryId, fecha, pagos, asignados, actingUserId } = opts

  for (const p of pagos) {
    const monto = round2(Number(p.monto) || 0)
    let transactionId: string | null = null
    let walletUsado: string | null = null

    let wallet
    if (p.user_id === actingUserId && p.wallet_id) {
      wallet = await tx.wallets.findFirst({ where: { id: p.wallet_id, user_id: actingUserId } })
    } else {
      wallet = await tx.wallets.findFirst({ where: { user_id: p.user_id, activo: true }, orderBy: { created_at: 'asc' } })
    }
    if (wallet) {
      const trans = await tx.transactions.create({
        data: {
          user_id: p.user_id,
          wallet_id: wallet.id,
          category_id: categoryId,
          monto,
          tipo: 'gasto',
          descripcion: `${grupoNombre}: ${descripcion}`,
          fecha,
        },
      })
      transactionId = trans.id
      walletUsado = wallet.id
    }

    await tx.gasto_pagos.create({
      data: { gasto_id: gastoId, user_id: p.user_id, monto, wallet_id: walletUsado, transaction_id: transactionId },
    })
  }

  for (const a of asignados) {
    await tx.gasto_divisiones.create({
      data: { gasto_id: gastoId, user_id: a.user_id, monto_asignado: a.monto_asignado, valor: a.valor },
    })
  }
}

// Borra las transacciones de cartera reflejadas por un gasto (para revertir dinero real al editar/eliminar).
export async function borrarTransaccionesDeGasto(tx: any, gastoId: string) {
  const pagos = await tx.gasto_pagos.findMany({ where: { gasto_id: gastoId }, select: { transaction_id: true } })
  const ids = pagos.map((p: any) => p.transaction_id).filter(Boolean)
  if (ids.length > 0) await tx.transactions.deleteMany({ where: { id: { in: ids } } })
}
