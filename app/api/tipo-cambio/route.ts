import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// Tipo de cambio del Banco Central de Honduras.
// Indicador 620 (EC-TCN-01-2): "Tipo de Cambio Nominal - Venta", HNL por 1 USD.
// Autenticación por query param `clave=<BCH_API_KEY>` (no por header).
// Se cachea la cifra del día en exchange_rates; el spread opcional permite
// añadir un margen sobre la venta del BCH (0 = venta pura).

const BCH_BASE = 'https://bchapi-am.azure-api.net/api/v1'
const INDICADOR_VENTA = 620
const ORIGEN = 'USD'
const DESTINO = 'HNL'

const hoyISO = () => new Date().toISOString().slice(0, 10)
const diasAtrasISO = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const spreadVenta = () => Number(process.env.BCH_SPREAD_VENTA || '0') || 0

interface RateRow {
  tasa: number
  fecha: Date
  fuente: string
}

interface BchCifra {
  Fecha: string
  Valor: number
}

function responder(row: RateRow, stale: boolean) {
  const tasa = Number(row.tasa)
  const tasaVenta = Math.round(tasa * (1 + spreadVenta()) * 1e6) / 1e6
  return NextResponse.json({
    origen: ORIGEN,
    destino: DESTINO,
    tasa, // venta BCH: HNL por 1 USD
    tasaVenta, // tasa a aplicar en pagos (venta BCH + spread opcional)
    spread: spreadVenta(),
    fecha: row.fecha.toISOString().slice(0, 10),
    fuente: row.fuente,
    stale, // true = no es la tasa de hoy (BCH no disponible)
  })
}

// La tasa manual es de cada usuario; la del BCH es global (es la cifra que
// publica el banco central). Por eso se buscan por separado: antes vivían
// mezcladas y la manual de un usuario se le aplicaba a todos.
async function cacheHoy(userId: string): Promise<RateRow | null> {
  const fecha = new Date(`${hoyISO()}T00:00:00.000Z`)

  const manual = await prisma.exchange_rates.findFirst({
    where: { moneda_origen: ORIGEN, moneda_destino: DESTINO, fecha, fuente: 'manual', user_id: userId },
  })
  if (manual) return manual

  return prisma.exchange_rates.findFirst({
    where: { moneda_origen: ORIGEN, moneda_destino: DESTINO, fecha, fuente: 'BCH', user_id: null },
  })
}

async function ultimaCacheada(userId: string): Promise<RateRow | null> {
  return prisma.exchange_rates.findFirst({
    where: {
      moneda_origen: ORIGEN,
      moneda_destino: DESTINO,
      OR: [{ user_id: userId }, { user_id: null, fuente: 'BCH' }],
    },
    orderBy: { fecha: 'desc' },
  })
}

async function consultarBCH(): Promise<RateRow | null> {
  const key = process.env.BCH_API_KEY
  if (!key) return null
  try {
    // La API autentica por query param `clave` y devuelve un rango de fechas.
    const url =
      `${BCH_BASE}/indicadores/${INDICADOR_VENTA}/cifras` +
      `?clave=${encodeURIComponent(key)}` +
      `&fechainicio=${diasAtrasISO(7)}&fechafinal=${hoyISO()}`
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const cifras: BchCifra[] = Array.isArray(data) ? data : []
    if (cifras.length === 0) return null
    // La más reciente por fecha.
    const ultima = cifras.reduce((a, b) =>
      new Date(a.Fecha) > new Date(b.Fecha) ? a : b
    )
    const valor = Number(ultima.Valor)
    if (!valor || Number.isNaN(valor)) return null

    // Guardar en caché con la fecha de hoy (venta vigente). La unicidad de la
    // fila global vive en un índice parcial, que upsert() no puede usar; si dos
    // peticiones compiten, una choca y se ignora porque el valor es el mismo.
    const fecha = new Date(`${hoyISO()}T00:00:00.000Z`)
    try {
      const existente = await prisma.exchange_rates.findFirst({
        where: { moneda_origen: ORIGEN, moneda_destino: DESTINO, fecha, fuente: 'BCH', user_id: null },
        select: { id: true },
      })
      if (existente) {
        await prisma.exchange_rates.update({ where: { id: existente.id }, data: { tasa: valor } })
      } else {
        await prisma.exchange_rates.create({
          data: {
            user_id: null,
            moneda_origen: ORIGEN,
            moneda_destino: DESTINO,
            tasa: valor,
            fecha,
            fuente: 'BCH',
          },
        })
      }
    } catch {
      // La cifra ya quedó guardada por otra petición: se devuelve igual.
    }
    return { tasa: valor, fecha, fuente: 'BCH' }
  } catch {
    return null
  }
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const enCache = await cacheHoy(session.id)
  if (enCache) return responder(enCache, false)

  const bch = await consultarBCH()
  if (bch) return responder(bch, false)

  const previa = await ultimaCacheada(session.id)
  if (previa) return responder(previa, true)

  return NextResponse.json(
    { error: 'No hay tasa disponible. Configura una tasa manual.' },
    { status: 503 }
  )
}

// Override manual de la tasa del día (cuando BCH no responde o se desea fijar).
export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: { tasa?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const tasa = Number(body.tasa)
  if (!tasa || tasa <= 0 || Number.isNaN(tasa)) {
    return NextResponse.json({ error: 'Tasa inválida' }, { status: 400 })
  }

  // El override manual queda a nombre de quien lo fija: ya no se le impone a
  // los demás usuarios de la instancia.
  const fecha = new Date(`${hoyISO()}T00:00:00.000Z`)
  const existente = await prisma.exchange_rates.findFirst({
    where: {
      moneda_origen: ORIGEN,
      moneda_destino: DESTINO,
      fecha,
      fuente: 'manual',
      user_id: session.id,
    },
    select: { id: true },
  })

  if (existente) {
    await prisma.exchange_rates.update({ where: { id: existente.id }, data: { tasa } })
  } else {
    await prisma.exchange_rates.create({
      data: {
        user_id: session.id,
        moneda_origen: ORIGEN,
        moneda_destino: DESTINO,
        tasa,
        fecha,
        fuente: 'manual',
      },
    })
  }

  return responder({ tasa, fecha, fuente: 'manual' }, false)
}
