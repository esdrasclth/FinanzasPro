// Cálculos financieros de una deuda: saldo restante, interés acumulado,
// próximo pago, fecha estimada de liquidación y estado (activa/pagada/mora).
//
// El interés se maneja como interés simple sobre el capital, acumulado desde
// la fecha de inicio hasta hoy (o hasta la liquidación estimada). Es el modelo
// más predecible y suficiente para un control financiero personal.

export type TasaPeriodo = 'anual' | 'mensual' | 'semanal'
export type EstadoDeuda = 'activa' | 'pagada' | 'en_mora'

export interface DeudaLike {
  monto_total: number | string
  monto_pagado: number | string
  completada?: boolean
  tasa_interes?: number | string | null
  tasa_periodo?: string | null
  plazo_meses?: number | string | null
  fecha_inicio?: string | null
  fecha_limite?: string | null
}

export interface DeudaCalculo {
  principal: number
  pagado: number
  saldoPrincipal: number
  tasaMensual: number
  interesAcumulado: number
  saldoTotal: number
  cuota: number | null
  proximoPagoFecha: string | null
  proximoPagoMonto: number | null
  fechaLiquidacion: string | null
  estado: EstadoDeuda
  porcentajePagado: number
  diasParaVencer: number | null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: number | string | null | undefined) => Number(v) || 0

// Convierte la tasa declarada (según su periodo) a fracción mensual.
export function tasaAMensual(tasa: number, periodo?: string | null): number {
  if (!tasa || tasa <= 0) return 0
  const t = tasa / 100
  switch (periodo) {
    case 'anual': return t / 12
    case 'semanal': return (t * 52) / 12
    case 'mensual':
    default: return t
  }
}

// Meses transcurridos (fraccionales) entre dos fechas.
function mesesEntre(desde: Date, hasta: Date): number {
  const ms = hasta.getTime() - desde.getTime()
  if (ms <= 0) return 0
  return ms / (1000 * 60 * 60 * 24 * 30.4375)
}

// Suma meses enteros a una fecha, preservando el día cuando es posible.
function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha)
  const diaOriginal = d.getDate()
  d.setMonth(d.getMonth() + meses)
  // Ajuste por meses más cortos (p. ej. 31 ene + 1 mes).
  if (d.getDate() < diaOriginal) d.setDate(0)
  return d
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

export function calcularDeuda(deuda: DeudaLike, hoy: Date = new Date()): DeudaCalculo {
  const principal = num(deuda.monto_total)
  const pagado = num(deuda.monto_pagado)
  const saldoPrincipal = Math.max(round2(principal - pagado), 0)

  const tasaMensual = tasaAMensual(num(deuda.tasa_interes), deuda.tasa_periodo)
  const inicio = parseFecha(deuda.fecha_inicio)
  const plazo = deuda.plazo_meses ? Number(deuda.plazo_meses) : null

  // Interés simple acumulado sobre el capital desde el inicio hasta hoy.
  let interesAcumulado = 0
  if (tasaMensual > 0 && inicio) {
    const meses = mesesEntre(inicio, hoy)
    interesAcumulado = round2(principal * tasaMensual * meses)
  }

  const saldoTotal = round2(saldoPrincipal + interesAcumulado)

  // Cuota estimada: capital (+ interés total del plazo) dividido en el plazo.
  let cuota: number | null = null
  if (plazo && plazo > 0) {
    const interesPlazo = tasaMensual > 0 ? principal * tasaMensual * plazo : 0
    cuota = round2((principal + interesPlazo) / plazo)
  }

  // Próximo pago: cuota que sigue a los pagos ya cubiertos.
  let proximoPagoFecha: string | null = null
  let proximoPagoMonto: number | null = null
  if (cuota && cuota > 0 && inicio && plazo) {
    const pagosHechos = Math.min(Math.floor(pagado / cuota), plazo)
    if (pagosHechos < plazo) {
      proximoPagoFecha = aFechaLocal(sumarMeses(inicio, pagosHechos + 1))
      proximoPagoMonto = round2(Math.min(cuota, saldoTotal))
    }
  }

  // Fecha estimada de liquidación: fin del plazo o la fecha límite declarada.
  let fechaLiquidacion: string | null = null
  if (inicio && plazo && plazo > 0) {
    fechaLiquidacion = aFechaLocal(sumarMeses(inicio, plazo))
  } else if (deuda.fecha_limite) {
    fechaLiquidacion = aFechaLocal(parseFecha(deuda.fecha_limite) as Date)
  }

  // Días para vencer respecto a la fecha de liquidación estimada.
  const refVenc = parseFecha(fechaLiquidacion)
  let diasParaVencer: number | null = null
  if (refVenc) {
    diasParaVencer = Math.ceil((refVenc.getTime() - hoy.getTime()) / 86400000)
  }

  // Estado de la deuda.
  let estado: EstadoDeuda
  if (deuda.completada || saldoPrincipal <= 0) {
    estado = 'pagada'
  } else if (diasParaVencer !== null && diasParaVencer < 0) {
    estado = 'en_mora'
  } else {
    estado = 'activa'
  }

  const porcentajePagado = principal > 0
    ? Math.min(round2((pagado / principal) * 100), 100)
    : 0

  return {
    principal,
    pagado,
    saldoPrincipal,
    tasaMensual,
    interesAcumulado,
    saldoTotal,
    cuota,
    proximoPagoFecha,
    proximoPagoMonto,
    fechaLiquidacion,
    estado,
    porcentajePagado,
    diasParaVencer,
  }
}

export const ESTADO_META: Record<EstadoDeuda, { label: string; badge: string; dot: string }> = {
  activa: { label: 'Activa', badge: 'text-emerald-600 bg-emerald-50', dot: 'bg-emerald-500' },
  pagada: { label: 'Pagada', badge: 'text-steel bg-mist', dot: 'bg-pebble' },
  en_mora: { label: 'En mora', badge: 'text-red-600 bg-red-50', dot: 'bg-red-500' },
}

export const PERIODO_LABEL: Record<TasaPeriodo, string> = {
  anual: 'anual',
  mensual: 'mensual',
  semanal: 'semanal',
}
