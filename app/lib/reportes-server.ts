import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'
import { soloMovimientosReales, montoNormalizado } from './finanzas'
import { aFechaUTC, diasAntes, finMesDesplazado, inicioMesDesplazado } from './fecha'
import { hoyUsuario } from './fecha-server'

// Datos de Reportes resueltos en el servidor.
//
// La pantalla se traía todas las transacciones del periodo al navegador para
// filtrarlas y normalizarlas ahí. Ahora llegan ya filtradas y con el monto en
// la moneda principal, junto con los totales del periodo anterior: sin algo
// contra qué comparar, un reporte solo dice cuánto, nunca si va mejor o peor.

export interface CategoriaReporte {
  id: string | null
  nombre: string
  icono: string | null
  color: string | null
}

export interface MovimientoReporte {
  fecha: string
  tipo: string
  monto: number
  categoria: CategoriaReporte
  cartera: string
}

export interface TotalesPeriodo {
  desde: string
  hasta: string
  ingresos: number
  gastos: number
  // Gasto por categoría, para comparar categoría a categoría entre periodos.
  porCategoria: Record<string, number>
}

export interface PresupuestoPeriodo {
  // Límite del periodo por categoría, indexado por id de categoría.
  porCategoria: Record<string, number>
  mesesEnRango: number
  mesesConPresupuesto: number
  // El rango no cubre meses enteros, así que algún límite va prorrateado.
  prorrateado: boolean
}

export interface DatosReportes {
  moneda: string
  desde: string
  hasta: string
  transacciones: MovimientoReporte[]
  anterior: TotalesPeriodo
  presupuesto: PresupuestoPeriodo
}

const SIN_CATEGORIA: CategoriaReporte = {
  id: null, nombre: 'Sin categoría', icono: 'Tag', color: '#a1a1aa',
}

// "Últimos 3 meses" son este mes y los dos anteriores, no cuatro: `-meses`
// dejaba fuera de cuenta el mes en curso y el rango se iba uno de más.
export function rangoDeMeses(hoy: string, meses: number): { desde: string; hasta: string } {
  return {
    desde: inicioMesDesplazado(hoy, -(meses - 1)),
    hasta: finMesDesplazado(hoy),
  }
}

// El periodo anterior es el tramo de la misma longitud que termina justo antes
// del actual, que es contra lo que tiene sentido comparar.
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const dias = Math.round(
    (aFechaUTC(hasta).getTime() - aFechaUTC(desde).getTime()) / 86400000
  ) + 1
  return { desde: diasAntes(desde, dias), hasta: diasAntes(desde, 1) }
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((aFechaUTC(hasta).getTime() - aFechaUTC(desde).getTime()) / 86400000) + 1

// Los meses que toca el rango, con qué parte de cada uno queda dentro. Un
// reporte del 10 al 20 no puede compararse contra el presupuesto entero del
// mes, así que ese límite se prorratea por los días incluidos.
function mesesDelRango(desde: string, hasta: string) {
  const out: { anio: number; mes: number; fraccion: number }[] = []
  let cursor = `${desde.slice(0, 7)}-01`
  const tope = hasta.slice(0, 7)

  while (cursor.slice(0, 7) <= tope && out.length < 36) {
    const ultimo = finMesDesplazado(cursor)
    const ini = cursor > desde ? cursor : desde
    const fin = ultimo < hasta ? ultimo : hasta
    const [anio, mes] = cursor.split('-').map(Number)
    out.push({
      anio,
      mes,
      fraccion: diasEntre(ini, fin) / diasEntre(cursor, ultimo),
    })
    cursor = inicioMesDesplazado(cursor, 1)
  }
  return out
}

async function presupuestoDelRango(
  userId: string,
  desde: string,
  hasta: string
): Promise<PresupuestoPeriodo> {
  const meses = mesesDelRango(desde, hasta)
  const filas = await prisma.budgets.findMany({
    where: {
      user_id: userId,
      OR: meses.map(m => ({ mes: m.mes, anio: m.anio })),
    },
    select: { category_id: true, monto_limite: true, mes: true, anio: true },
  })

  const porCategoria: Record<string, number> = {}
  const conPresupuesto = new Set<string>()
  for (const b of filas) {
    const m = meses.find(x => x.mes === b.mes && x.anio === b.anio)
    if (!m) continue
    porCategoria[b.category_id] = (porCategoria[b.category_id] || 0) + Number(b.monto_limite) * m.fraccion
    conPresupuesto.add(`${b.anio}-${b.mes}`)
  }

  return {
    porCategoria,
    mesesEnRango: meses.length,
    mesesConPresupuesto: conPresupuesto.size,
    prorrateado: meses.some(m => m.fraccion < 0.999),
  }
}

async function movimientosDe(userId: string, desde: string, hasta: string) {
  const filas = await prisma.transactions.findMany({
    where: {
      user_id: userId,
      fecha: { gte: aFechaUTC(desde), lte: aFechaUTC(hasta) },
    },
    select: {
      fecha: true, tipo: true, monto: true, moneda: true,
      tasa_cambio: true, wallet_destino_id: true,
      category: { select: { id: true, nombre: true, icono: true, color: true } },
      wallet: { select: { nombre: true } },
    },
    orderBy: { fecha: 'asc' },
  })
  // Descarta transferencias y saldos de apertura: mueven dinero de sitio, no lo
  // hacen entrar ni salir.
  return soloMovimientosReales(
    filas.map((t: any) => ({ ...t, categories: t.category }))
  )
}

export async function datosReportes(
  userId: string,
  rango: { desde: string; hasta: string }
): Promise<DatosReportes> {
  const perfil = await prisma.profiles.findUnique({ where: { id: userId } })
  const moneda = perfil?.moneda_default || 'HNL'
  const previo = periodoAnterior(rango.desde, rango.hasta)

  const [filas, filasPrevias, presupuesto, tasa] = await Promise.all([
    movimientosDe(userId, rango.desde, rango.hasta),
    movimientosDe(userId, previo.desde, previo.hasta),
    presupuestoDelRango(userId, rango.desde, rango.hasta),
    tasaVigente(userId),
  ])

  const monto = (t: any) => montoNormalizado(t, moneda, tasa)

  const transacciones: MovimientoReporte[] = filas.map((t: any) => ({
    fecha: t.fecha.toISOString().slice(0, 10),
    tipo: t.tipo,
    monto: monto(t),
    categoria: t.category
      ? {
          id: t.category.id,
          nombre: t.category.nombre,
          icono: t.category.icono,
          color: t.category.color,
        }
      : SIN_CATEGORIA,
    cartera: t.wallet?.nombre || 'Sin cartera',
  }))

  const porCategoria: Record<string, number> = {}
  let ingresos = 0
  let gastos = 0
  for (const t of filasPrevias as any[]) {
    const m = monto(t)
    if (t.tipo === 'ingreso') { ingresos += m; continue }
    gastos += m
    const clave = t.category?.nombre || SIN_CATEGORIA.nombre
    porCategoria[clave] = (porCategoria[clave] || 0) + m
  }

  return {
    moneda,
    desde: rango.desde,
    hasta: rango.hasta,
    transacciones,
    anterior: { ...previo, ingresos, gastos, porCategoria },
    presupuesto,
  }
}

// Rango por defecto de la pantalla: los últimos tres meses.
export async function rangoPorDefecto() {
  return rangoDeMeses(await hoyUsuario(), 3)
}
