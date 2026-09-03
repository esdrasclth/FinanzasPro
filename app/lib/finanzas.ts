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

// Categoría con la que se corrige un saldo para que cuadre con la realidad.
// Mueve el saldo, igual que la apertura, pero no es dinero ganado ni perdido:
// es reconocer algo que ya había pasado y no estaba registrado.
export const CAT_AJUSTE_SALDO = 'Ajuste de saldo'

export const CAT_TRANSFERENCIA = 'Transferencia'

// Categorías que la app usa para su propia mecánica. Se muestran para que los
// movimientos se entiendan, pero no son categorías de gasto del usuario: no se
// editan, no se borran y no sirven de categoría padre.
export const CATEGORIAS_INTERNAS = [CAT_SALDO_INICIAL, CAT_AJUSTE_SALDO, CAT_TRANSFERENCIA]

export const esCategoriaInterna = (nombre?: string | null) =>
  CATEGORIAS_INTERNAS.includes(nombre || '')

export interface MovimientoLike {
  monto: number | string
  tipo?: string | null
  moneda?: string | null
  tasa_cambio?: number | string | null
  wallet_destino_id?: string | null
  category_id?: string | null
  categories?: { nombre?: string | null; tipo?: string | null } | null
}

// Las dos piernas de una transferencia llevan wallet_destino_id: es dinero que
// cambia de cartera, no que entra o sale del patrimonio.
export const esTransferencia = (t: MovimientoLike) => !!t.wallet_destino_id

// Requiere que la consulta haya traído la relación `categories(nombre)`.
export const esSaldoInicial = (t: MovimientoLike) =>
  (t.categories?.nombre || '') === CAT_SALDO_INICIAL

// Un ajuste de saldo corrige lo registrado para que cuadre con el banco. El
// saldo tiene que moverse —para eso está— pero no es un ingreso ni un gasto:
// contarlo como tal inventa ganancias o pérdidas que nunca ocurrieron. El caso
// que lo hacía evidente es pasar deuda de una moneda a otra a mano, que dejaba
// un "ingreso" del tamaño de la deuda saldada.
//
// Requiere que la consulta haya traído la relación `categories(nombre)`.
export const esAjusteSaldo = (t: MovimientoLike) =>
  (t.categories?.nombre || '') === CAT_AJUSTE_SALDO

export const esMovimientoReal = (t: MovimientoLike) =>
  !esTransferencia(t) && !esSaldoInicial(t) && !esAjusteSaldo(t)

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

// Un ingreso etiquetado con una categoría de GASTO es un reembolso: dinero que
// vuelve de algo que ya se contó como gastado. Se resta dentro de esa misma
// categoría en vez de sumarse aparte como ingreso.
//
// El caso que lo motiva son los repartos. Pagas Spotify entero (L309.40 en
// Suscripciones) y los cuatro que lo comparten te devuelven su parte. Sin
// restar, Suscripciones marca L309.40 todos los meses y se come el presupuesto
// entero por un gasto que en realidad no te costó nada. Con la resta queda en
// L0.01, que es lo que de verdad saliste perdiendo.
//
// La regla no es de repartos sino general, porque describe lo que ese
// movimiento *es*: la devolución de una tienda etiquetada en Compras también
// debe bajar lo gastado en Compras, no aparecer como si hubieras ingresado
// dinero. Un ingreso con categoría de ingreso —el sueldo— no se toca.
//
// Requiere que la consulta haya traído `categories(tipo)`. Sin él, el ingreso
// se agrupa como ingreso: se pierde la resta, no se corrompe el total.
const esReembolso = (t: MovimientoLike) =>
  (t.tipo || '') === 'ingreso' && (t.categories?.tipo || '') === 'gasto'

export interface CategoriaArbol {
  id: string
  parent_id?: string | null
}

// Acumula en cada categoría padre lo gastado por sus hijas.
//
// Un gasto se etiqueta siempre en la categoría más concreta —el formulario
// obliga a bajar a la subcategoría cuando existe—, así que un presupuesto en
// la categoría padre no veía ni un lempira: se comparaba su id contra el de la
// hija y nunca coincidían. Presupuestar "Comida" y gastar en "Supermercado"
// dejaba la partida en cero para siempre.
//
// Aquí el padre pasa a valer lo suyo más lo de sus hijas, que es lo que
// cualquiera espera al ponerle un límite a un grupo. Las hijas conservan su
// cifra propia, así que una que tenga presupuesto aparte sigue midiéndose sola.
//
// El árbol es de dos niveles y el formulario de categorías lo impide crecer, así
// que basta con un pase; si algún día se anidara más, habría que recorrerlo.
export function conHijasAcumuladas(
  porCat: Record<string, number>,
  categorias: CategoriaArbol[]
): Record<string, number> {
  const out: Record<string, number> = { ...porCat }
  for (const c of categorias || []) {
    if (!c.parent_id) continue
    const propio = porCat[c.id] || 0
    if (propio === 0) continue
    out[c.parent_id] = round2((out[c.parent_id] || 0) + propio)
  }
  return out
}

export interface PartidaLike {
  category_id: string
  categories?: { parent_id?: string | null } | null
}

// Las partidas que se pueden sumar entre sí sin contar dos veces lo mismo.
//
// Desde que el presupuesto de una categoría padre incluye lo gastado en sus
// hijas, una hija con partida propia es un SUB-LÍMITE dentro del padre: su
// monto y su gasto ya están dentro de los del padre. Sumar las dos daba un
// total de gasto por encima del gasto real del mes.
//
// Se quedan las de categorías sin padre, y las de hijas cuyo padre no tiene
// partida (esas no están dentro de nada).
export function partidasSinSolapar<T extends PartidaLike>(partidas: T[]): T[] {
  const conPartida = new Set((partidas || []).map(p => p.category_id))
  return (partidas || []).filter(p => {
    const padre = p.categories?.parent_id
    return !padre || !conPartida.has(padre)
  })
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
    if (!esMovimientoReal(t) || !t.category_id) continue
    const reembolso = esReembolso(t)
    // El reembolso va al cubo de gasto —el de su categoría—, no al de ingreso.
    const cubo = reembolso ? 'gasto' : (t.tipo || '')
    if (!acc[cubo]) continue
    const monto = montoNormalizado(t, monedaPrincipal, tasaActual)
    acc[cubo][t.category_id] = round2(
      (acc[cubo][t.category_id] || 0) + (reembolso ? -monto : monto)
    )
  }
  return acc
}
