import { round2 } from './dinero'

export interface GrupoResumenInput {
  moneda: string
  mi_saldo: number
  total_mes: number
}

export type MontosPorMoneda = Record<string, number>

const sumar = (destino: MontosPorMoneda, moneda: string, monto: number) => {
  const codigo = (moneda || 'HNL').toUpperCase()
  destino[codigo] = round2((destino[codigo] || 0) + monto)
}

// Nunca suma unidades monetarias incompatibles. Los consumidores pueden
// mostrarlas separadas o convertirlas explícitamente con una tasa conocida.
export function resumenMultimoneda(grupos: GrupoResumenInput[]) {
  const teDeben: MontosPorMoneda = {}
  const debes: MontosPorMoneda = {}
  const gastoMes: MontosPorMoneda = {}
  const maxMes: MontosPorMoneda = {}

  for (const grupo of grupos) {
    const moneda = (grupo.moneda || 'HNL').toUpperCase()
    if (grupo.mi_saldo > 0.005) sumar(teDeben, moneda, grupo.mi_saldo)
    if (grupo.mi_saldo < -0.005) sumar(debes, moneda, -grupo.mi_saldo)
    sumar(gastoMes, moneda, grupo.total_mes)
    maxMes[moneda] = Math.max(maxMes[moneda] || 0, grupo.total_mes, 1)
  }

  const neto: MontosPorMoneda = {}
  for (const moneda of new Set([...Object.keys(teDeben), ...Object.keys(debes)])) {
    neto[moneda] = round2((teDeben[moneda] || 0) - (debes[moneda] || 0))
  }

  return { teDeben, debes, gastoMes, neto, maxMes }
}

export function signoConjunto(montos: MontosPorMoneda): 'positivo' | 'negativo' | 'mixto' | 'cero' {
  const valores = Object.values(montos).filter(v => Math.abs(v) > 0.005)
  if (valores.length === 0) return 'cero'
  if (valores.every(v => v > 0)) return 'positivo'
  if (valores.every(v => v < 0)) return 'negativo'
  return 'mixto'
}
