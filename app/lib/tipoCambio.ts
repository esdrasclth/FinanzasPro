// Cliente del tipo de cambio (USD <-> HNL) vía /api/tipo-cambio.
// La tasa es HNL por 1 USD; para pagos se usa `tasaVenta` (referencia + spread).

export interface TipoCambio {
  origen: string // 'USD'
  destino: string // 'HNL'
  tasa: number // referencia: HNL por 1 USD
  tasaVenta: number // tasa a aplicar en pagos
  spread: number
  fecha: string
  fuente: string // 'BCH' | 'manual'
  stale: boolean // true = no es la tasa de hoy
}

let cache: { data: TipoCambio; ts: number } | null = null
const TTL = 10 * 60 * 1000 // 10 min en memoria

export async function obtenerTipoCambio(forzar = false): Promise<TipoCambio | null> {
  if (!forzar && cache && Date.now() - cache.ts < TTL) return cache.data
  try {
    const res = await fetch('/api/tipo-cambio', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as TipoCambio
    cache = { data, ts: Date.now() }
    return data
  } catch {
    return null
  }
}

export async function fijarTasaManual(tasa: number): Promise<TipoCambio | null> {
  try {
    const res = await fetch('/api/tipo-cambio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasa }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as TipoCambio
    cache = { data, ts: Date.now() }
    return data
  } catch {
    return null
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// La tasa que maneja la app es HNL por USD, así que solo ese par (y la
// identidad) se puede convertir de verdad. Quien vaya a escribir un movimiento
// tiene que preguntar antes: `convertir` devuelve el monto intacto para los
// pares que no soporta, y guardarlo así lo etiquetaría con una moneda que no le
// corresponde.
export const parSoportado = (origen: string, destino: string) =>
  origen === destino ||
  (origen === 'USD' && destino === 'HNL') ||
  (origen === 'HNL' && destino === 'USD')

// Convierte `monto` de `origen` a `destino` usando la tasa dada (HNL por USD).
// Solo soporta el par USD/HNL; si origen === destino devuelve el mismo monto.
export function convertir(
  monto: number,
  origen: string,
  destino: string,
  tasaHnlPorUsd: number
): number {
  if (origen === destino) return round2(monto)
  if (origen === 'USD' && destino === 'HNL') return round2(monto * tasaHnlPorUsd)
  if (origen === 'HNL' && destino === 'USD') return round2(monto / tasaHnlPorUsd)
  return round2(monto)
}

// Convierte un monto a la moneda principal para reportes/totales.
// Sin tasa disponible (o par no soportado) devuelve el monto a valor nominal.
// `monedaOrigen` nula se asume HNL (transacciones previas a multimoneda).
export function aMonedaPrincipal(
  monto: number,
  monedaOrigen: string | null | undefined,
  monedaPrincipal: string,
  tasaHnlPorUsd: number | null
): number {
  const origen = monedaOrigen || 'HNL'
  if (origen === monedaPrincipal) return monto
  if (!tasaHnlPorUsd || tasaHnlPorUsd <= 0) return monto
  return convertir(monto, origen, monedaPrincipal, tasaHnlPorUsd)
}
