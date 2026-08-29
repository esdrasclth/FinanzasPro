import { prisma } from './prisma'
import { CAT_SALDO_INICIAL } from './finanzas'
import { round2 } from './dinero'

// Saldos de las carteras calculados en la base de datos.
//
// Antes la pantalla hacía una consulta POR CARTERA que se traía TODAS sus
// transacciones desde siempre (sin filtro de fecha ni límite) solo para sumarlas
// en el navegador. Con varias carteras y un par de años de historial eso son
// decenas de miles de filas viajando por la red para calcular una suma.
//
// Aquí son tres consultas agregadas, independientemente de cuántas carteras haya.

export interface CarteraConSaldo {
  id: string
  nombre: string
  tipo: string
  moneda: string
  color: string | null
  activo: boolean
  credito_limite: number | null
  fecha_corte: number | null
  fecha_pago: number | null
  numero_cuenta: string | null
  numero_tarjeta: string | null
  posicion: number
  saldo_inicial: number
  saldos: Record<string, number>
  saldo_actual: number
  saldo_inicial_real: number
  ultimo_movimiento: number | null
  movimientos: number
}

export interface CarteraArchivada {
  id: string
  nombre: string
  tipo: string
  moneda: string
  color: string | null
}

const signo = (tipo: string) => (tipo === 'ingreso' ? 1 : -1)

export async function carterasConSaldo(userId: string): Promise<CarteraConSaldo[]> {
  const wallets = await prisma.wallets.findMany({
    where: { user_id: userId, activo: true },
    orderBy: [{ posicion: 'asc' }, { created_at: 'asc' }],
  })
  if (wallets.length === 0) return []

  const ids = wallets.map(w => w.id)
  const base = { wallet_id: { in: ids }, user_id: userId }

  const [movimientos, aperturas, actividad] = await Promise.all([
    // Suma por cartera, moneda y tipo.
    prisma.transactions.groupBy({
      by: ['wallet_id', 'moneda', 'tipo'],
      where: base,
      _sum: { monto: true },
    }),
    // Lo mismo pero solo las aperturas ("Saldo inicial").
    prisma.transactions.groupBy({
      by: ['wallet_id', 'moneda', 'tipo'],
      where: { ...base, category: { nombre: CAT_SALDO_INICIAL } },
      _sum: { monto: true },
    }),
    // Último movimiento real y cuántos hay, para las tarjetas de la pantalla.
    prisma.transactions.groupBy({
      by: ['wallet_id'],
      where: { ...base, NOT: { category: { nombre: CAT_SALDO_INICIAL } } },
      _max: { created_at: true },
      _count: { _all: true },
    }),
  ])

  const porCartera = new Map(wallets.map(w => [w.id, w]))
  const saldos = new Map<string, Record<string, number>>()
  const aperturaPorCartera = new Map<string, Record<string, number>>()

  const acumular = (destino: Map<string, Record<string, number>>, filas: typeof movimientos) => {
    for (const f of filas) {
      const w = porCartera.get(f.wallet_id)
      if (!w) continue
      // Las transacciones antiguas sin moneda son de la moneda primaria.
      const m = f.moneda || w.moneda || 'HNL'
      const actual = destino.get(f.wallet_id) || {}
      // A centavos en cada paso: los montos son DOUBLE PRECISION y sumar
      // ingresos contra gastos deja residuos (una cuenta que quedó en cero
      // acababa valiendo -9.09e-13, y la pantalla la mostraba como "-L0.00",
      // en rojo y con aviso de saldo negativo).
      actual[m] = round2((actual[m] || 0) + signo(f.tipo) * Number(f._sum.monto || 0))
      destino.set(f.wallet_id, actual)
    }
  }

  acumular(saldos, movimientos)
  acumular(aperturaPorCartera, aperturas)

  const actividadPorCartera = new Map(
    actividad.map(a => [a.wallet_id, { ultimo: a._max.created_at, n: a._count._all }])
  )

  return wallets.map(w => {
    const primaria = w.moneda || 'HNL'
    // El campo saldo_inicial es la base de las carteras antiguas; las nuevas
    // registran la apertura como una transacción de categoría "Saldo inicial".
    const acumulado = saldos.get(w.id) || {}
    const conBase: Record<string, number> = { [primaria]: round2(Number(w.saldo_inicial)) }
    for (const [m, v] of Object.entries(acumulado)) {
      conBase[m] = round2((conBase[m] || 0) + v)
    }

    const apertura = aperturaPorCartera.get(w.id) || {}
    const act = actividadPorCartera.get(w.id)

    return {
      id: w.id,
      nombre: w.nombre,
      tipo: w.tipo,
      moneda: primaria,
      color: w.color,
      activo: w.activo,
      credito_limite: w.credito_limite === null ? null : Number(w.credito_limite),
      fecha_corte: w.fecha_corte,
      fecha_pago: w.fecha_pago,
      numero_cuenta: w.numero_cuenta,
      numero_tarjeta: w.numero_tarjeta,
      posicion: w.posicion,
      saldo_inicial: Number(w.saldo_inicial),
      saldos: conBase,
      saldo_actual: conBase[primaria] || 0,
      saldo_inicial_real: round2(Number(w.saldo_inicial) + (apertura[primaria] || 0)),
      ultimo_movimiento: act?.ultimo ? new Date(act.ultimo).getTime() : null,
      movimientos: act?.n ?? 0,
    }
  })
}

export async function carterasArchivadas(userId: string): Promise<CarteraArchivada[]> {
  const filas = await prisma.wallets.findMany({
    where: { user_id: userId, activo: false },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, tipo: true, moneda: true, color: true },
  })
  return filas
}
