// Cálculos de suscripciones recurrentes: normalización del costo a mensual,
// proyección anual, próximo cobro (a partir de la fecha de inicio como ancla,
// avanzada por la frecuencia hasta superar hoy) y estado.

export type Frecuencia = 'semanal' | 'mensual' | 'trimestral' | 'anual'
export type EstadoSuscripcion = 'activa' | 'pausada' | 'cancelada'

export interface SuscripcionLike {
  monto: number | string
  frecuencia?: string | null
  estado?: string | null
  fecha_inicio?: string | null
  proximo_cobro?: string | null
}

export interface SuscripcionCalculo {
  monto: number
  montoMensual: number
  montoAnual: number
  proximoCobro: string | null
  diasParaCobro: number | null
  estado: EstadoSuscripcion
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: number | string | null | undefined) => Number(v) || 0

// Cuántos cobros de esta frecuencia caben en un año.
const COBROS_POR_ANIO: Record<Frecuencia, number> = {
  semanal: 52,
  mensual: 12,
  trimestral: 4,
  anual: 1,
}

const aFechaLocal = (d: Date) => {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().split('T')[0]
}

const parseFecha = (s?: string | null): Date | null => {
  if (!s) return null
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s)
  return isNaN(d.getTime()) ? null : d
}

// Avanza una fecha un ciclo de la frecuencia dada, preservando el día.
function avanzarCiclo(fecha: Date, frecuencia: Frecuencia): Date {
  const d = new Date(fecha)
  if (frecuencia === 'semanal') {
    d.setDate(d.getDate() + 7)
    return d
  }
  const meses = frecuencia === 'anual' ? 12 : frecuencia === 'trimestral' ? 3 : 1
  const diaOriginal = d.getDate()
  d.setMonth(d.getMonth() + meses)
  if (d.getDate() < diaOriginal) d.setDate(0)
  return d
}

const esFrecuencia = (f?: string | null): Frecuencia =>
  f === 'semanal' || f === 'trimestral' || f === 'anual' ? f : 'mensual'

export function calcularSuscripcion(sub: SuscripcionLike, hoy: Date = new Date()): SuscripcionCalculo {
  const monto = num(sub.monto)
  const frecuencia = esFrecuencia(sub.frecuencia)
  const cobros = COBROS_POR_ANIO[frecuencia]

  const montoAnual = round2(monto * cobros)
  const montoMensual = round2(montoAnual / 12)

  const estado: EstadoSuscripcion =
    sub.estado === 'pausada' || sub.estado === 'cancelada' ? sub.estado : 'activa'

  // Próximo cobro: usa el override si existe; si no, avanza el ancla por la
  // frecuencia hasta caer en el futuro (o hoy).
  let proximoCobro: string | null = null
  let diasParaCobro: number | null = null

  if (estado === 'activa') {
    const override = parseFecha(sub.proximo_cobro)
    const inicio = parseFecha(sub.fecha_inicio)
    let ref: Date | null = override

    if (!ref && inicio) {
      let cursor = new Date(inicio)
      let guard = 0
      while (cursor.getTime() < hoy.getTime() && guard < 600) {
        cursor = avanzarCiclo(cursor, frecuencia)
        guard++
      }
      ref = cursor
    }

    if (ref) {
      proximoCobro = aFechaLocal(ref)
      diasParaCobro = Math.ceil((parseFecha(proximoCobro)!.getTime() - hoy.getTime()) / 86400000)
    }
  }

  return { monto, montoMensual, montoAnual, proximoCobro, diasParaCobro, estado }
}

export const ESTADO_META: Record<EstadoSuscripcion, { label: string; badge: string; dot: string }> = {
  activa: { label: 'Activa', badge: 'text-emerald-600 bg-emerald-50', dot: 'bg-emerald-500' },
  pausada: { label: 'Pausada', badge: 'text-amber-600 bg-amber-50', dot: 'bg-amber-500' },
  cancelada: { label: 'Cancelada', badge: 'text-steel bg-mist', dot: 'bg-pebble' },
}

export const FRECUENCIA_META: Record<Frecuencia, { label: string; adverbio: string }> = {
  semanal: { label: 'Semanal', adverbio: 'por semana' },
  mensual: { label: 'Mensual', adverbio: 'por mes' },
  trimestral: { label: 'Trimestral', adverbio: 'por trimestre' },
  anual: { label: 'Anual', adverbio: 'por año' },
}
