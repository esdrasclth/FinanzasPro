// Borrado de movimientos desde el cliente.
//
// Siempre pasa por DELETE /api/transacciones/[id], que sabe si el movimiento
// arrastra una contraparte (la otra pierna de una transferencia, el avance de
// una deuda o de una meta) y la revierte dentro de una sola transacción.

export interface ResumenBorrado {
  eliminadas: number
  deuda_revertida: string | null
  meta_revertida: string | null
  cobro_revertido: boolean
}

export async function eliminarTransaccion(
  id: string
): Promise<{ error?: string; resumen?: ResumenBorrado }> {
  try {
    const res = await fetch(`/api/transacciones/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return { error: json?.error?.message || 'No se pudo eliminar el movimiento' }
    }
    return { resumen: json as ResumenBorrado }
  } catch {
    return { error: 'Error de red al eliminar el movimiento' }
  }
}

export type TipoCompuesto = 'transferencia' | 'abono' | null

// Un movimiento compuesto no puede editarse campo por campo: cambiarle el monto
// dejaría descuadrada su contraparte (la otra pierna, o el avance de la deuda).
export function tipoCompuesto(t: {
  transfer_id?: string | null
  wallet_destino_id?: string | null
  debt_id?: string | null
}): TipoCompuesto {
  if (t?.transfer_id || t?.wallet_destino_id) return 'transferencia'
  if (t?.debt_id) return 'abono'
  return null
}

// Texto de confirmación acorde a lo que se va a revertir.
export function avisoBorrado(tipo: TipoCompuesto): string {
  if (tipo === 'transferencia') {
    return '¿Eliminar esta transferencia?\n\nSe eliminan las dos piernas (la salida y la entrada) para que ambas carteras queden cuadradas.'
  }
  if (tipo === 'abono') {
    return '¿Eliminar este abono?\n\nEl monto vuelve al pendiente de la deuda y se borra el pago del historial.'
  }
  return '¿Eliminar esta transacción?'
}
