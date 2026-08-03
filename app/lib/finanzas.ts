// Fuente única de verdad para decidir qué cuenta como movimiento y por cuánto.
//
// Antes cada pantalla aplicaba sus propias reglas: el Dashboard excluía
// transferencias y convertía monedas, Transacciones no hacía ninguna de las dos
// y Presupuesto solo una. El mismo mes mostraba cifras distintas según dónde se
// mirara. Todo agregado de dinero debe pasar por aquí.

import { convertir } from './tipoCambio'
import { round2 } from './dinero'

// Categoría de sistema con la que se registra la apertura de una cartera.
// Es un saldo de partida, no un ingreso ni un gasto del periodo.
export const CAT_SALDO_INICIAL = 'Saldo inicial'

// Categorías que la app usa para su propia mecánica. Se muestran para que los
// movimientos se entiendan, pero no son categorías de gasto del usuario: no se
// editan, no se borran y no sirven de categoría padre.
export const CATEGORIAS_INTERNAS = [CAT_SALDO_INICIAL, 'Ajuste de saldo', 'Transferencia']

export const esCategoriaInterna = (nombre?: string | null) =>
  CATEGORIAS_INTERNAS.includes(nombre || '')

export interface MovimientoLike {
  monto: number | string
  tipo?: string | null
  moneda?: string | null
  tasa_cambio?: number | string | null
  wallet_destino_id?: string | null
  category_id?: string | null
  categories?: { nombre?: string | null } | null
}

// Las dos piernas de una transferencia llevan wallet_destino_id: es dinero que
// cambia de cartera, no que entra o sale del patrimonio.
export const esTransferencia = (t: MovimientoLike) => !!t.wallet_destino_id

// Requiere que la consulta haya traído la relación `categories(nombre)`.
export const esSaldoInicial = (t: MovimientoLike) =>
  (t.categories?.nombre || '') === CAT_SALDO_INICIAL

export const esMovimientoReal = (t: MovimientoLike) =>
  !esTransferencia(t) && !esSaldoInicial(t)

export const soloMovimientosReales = <T extends MovimientoLike>(movs: T[]): T[] =>
  (movs || []).filter(esMovimientoReal)

// Monto expresado en la moneda principal del usuario.
//
// Prioriza la tasa sellada en la propia transacción (la que estaba vigente
// cuando se registró) sobre la tasa de hoy: si no, un reporte trimestral
// cambiaría de cifras cada día aunque no se registre nada nuevo. La tasa de hoy
// queda solo como respaldo para las transacciones antiguas, anteriores al
// sellado, que no la tienen guardada.
export function montoNormalizado(
  t: MovimientoLike,
  monedaPrincipal: string,
  tasaActual: number | null
): number {
  const monto = Number(t.monto) || 0
  const origen = t.moneda || 'HNL'
  if (origen === monedaPrincipal) return monto
  const sellada = Number(t.tasa_cambio) || 0
  const tasa = sellada > 0 ? sellada : tasaActual
  if (!tasa || tasa <= 0) return monto
  return convertir(monto, origen, monedaPrincipal, tasa)
}

export interface Totales {
  ingresos: number
  gastos: number
  neto: number
}

// Totales de un conjunto de transacciones, ya normalizados a la moneda
// principal y sin transferencias ni aperturas de cartera.
export function totales(
  movs: MovimientoLike[],
  monedaPrincipal: string,
  tasaActual: number | null
): Totales {
  let ingresos = 0
  let gastos = 0
  for (const t of movs || []) {
    if (!esMovimientoReal(t)) continue
    const m = montoNormalizado(t, monedaPrincipal, tasaActual)
    if (t.tipo === 'ingreso') ingresos += m
    else if (t.tipo === 'gasto') gastos += m
  }
  // A centavos: acumular decimales en coma flotante deja residuos, y un neto
  // de -9.09e-13 se pinta en rojo y con signo como si fuera un número rojo.
  return { ingresos: round2(ingresos), gastos: round2(gastos), neto: round2(ingresos - gastos) }
}

// Suma por category_id separando gasto de ingreso, normalizada y sin
// transferencias. La usan los presupuestos y las alertas de la campana.
export function porCategoria(
  movs: MovimientoLike[],
  monedaPrincipal: string,
  tasaActual: number | null
): Record<string, Record<string, number>> {
  const acc: Record<string, Record<string, number>> = { gasto: {}, ingreso: {} }
  for (const t of movs || []) {
    if (!esMovimientoReal(t)) continue
    const tipo = t.tipo || ''
    if (!acc[tipo] || !t.category_id) continue
    acc[tipo][t.category_id] = round2(
      (acc[tipo][t.category_id] || 0) + montoNormalizado(t, monedaPrincipal, tasaActual)
    )
  }
  return acc
}
