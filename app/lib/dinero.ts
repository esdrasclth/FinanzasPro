// Utilidades de dinero y reparto de gastos compartidos.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const SIMBOLOS: Record<string, string> = { USD: '$', HNL: 'L', EUR: '€', MXN: '$' }

export const simboloMoneda = (moneda: string) => SIMBOLOS[moneda] || (moneda ? moneda + ' ' : '$')

export function formatoMoneda(n: number, moneda: string) {
  const s = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))
  return `${n < 0 ? '-' : ''}${simboloMoneda(moneda)}${s}`
}

export interface DivisionInput {
  user_id: string
  valor: number // monto exacto, número de partes, o porcentaje según método
}

export interface DivisionCalculada {
  user_id: string
  valor: number
  monto_asignado: number
}

// Reparte monto_total entre participantes. Ajusta el residuo de redondeo
// en el último participante para que la suma cuadre exactamente.
export function calcularDivisiones(
  montoTotal: number,
  metodo: string,
  divisiones: DivisionInput[]
): DivisionCalculada[] {
  if (divisiones.length === 0) return []

  let asignados: DivisionCalculada[]

  if (metodo === 'exacto') {
    // Montos tal cual; la ruta valida que sumen el total (sin autoajuste).
    return divisiones.map(d => ({
      user_id: d.user_id,
      valor: d.valor,
      monto_asignado: round2(d.valor),
    }))
  }

  // 'partes' o 'porcentaje': reparto proporcional al valor.
  const totalValor = divisiones.reduce((s, d) => s + (Number(d.valor) || 0), 0)
  if (totalValor <= 0) throw new Error('La suma de partes/porcentajes debe ser mayor a 0')
  asignados = divisiones.map(d => ({
    user_id: d.user_id,
    valor: d.valor,
    monto_asignado: round2((montoTotal * (Number(d.valor) || 0)) / totalValor),
  }))

  // Ajuste de residuo de redondeo en el último participante.
  const suma = round2(asignados.reduce((s, a) => s + a.monto_asignado, 0))
  const residuo = round2(montoTotal - suma)
  if (residuo !== 0 && asignados.length > 0) {
    asignados[asignados.length - 1].monto_asignado = round2(
      asignados[asignados.length - 1].monto_asignado + residuo
    )
  }

  return asignados
}
