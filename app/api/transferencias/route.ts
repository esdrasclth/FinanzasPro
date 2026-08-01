import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { tasaVigente } from '../../lib/tipoCambio-server'
import { convertir } from '../../lib/tipoCambio'
import { round2 } from '../../lib/dinero'
import { hoyUsuario } from '../../lib/fecha-server'

// POST /api/transferencias
// { wallet_id, wallet_destino_id, monto, moneda_destino?, tasa_cambio?, descripcion?, fecha? }
//
// El monto se expresa en la moneda de DESTINO (lo que se paga o se recibe);
// el servidor calcula cuánto sale de la cartera de origen.
//
// Las dos piernas se escriben dentro de una sola transacción de base de datos.
// Antes esto eran dos inserts encadenados desde el navegador: si el segundo
// fallaba (o se cerraba la pestaña entre uno y otro) el dinero salía de la
// cartera de origen y nunca llegaba a la de destino.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

const error = (message: string, status: number) =>
  NextResponse.json({ error: { message } }, { status })

// La categoría de sistema "Transferencia" agrupa ambas piernas.
async function categoriaTransferencia(tx: any, userId: string): Promise<string> {
  const existente = await tx.categories.findFirst({
    where: {
      nombre: 'Transferencia',
      es_sistema: true,
      OR: [{ user_id: userId }, { user_id: null }],
    },
    select: { id: true },
  })
  if (existente) return existente.id

  const creada = await tx.categories.create({
    data: {
      nombre: 'Transferencia',
      tipo: 'gasto',
      icono: '↔️',
      color: '#6366F1',
      es_sistema: true,
      user_id: userId,
    },
    select: { id: true },
  })
  return creada.id
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return error('No autenticado', 401)

  const body = await req.json().catch(() => null)
  const walletId = body?.wallet_id
  const destinoId = body?.wallet_destino_id
  const monto = round2(Number(body?.monto))
  const descripcion = (body?.descripcion || '').trim()
  const fecha = toDate(body?.fecha || (await hoyUsuario()))

  if (!walletId || !destinoId) return error('Selecciona la cartera de origen y la de destino', 400)
  if (walletId === destinoId) return error('El origen y el destino deben ser carteras distintas', 400)
  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  const [origen, destino] = await Promise.all([
    prisma.wallets.findFirst({ where: { id: walletId, user_id: session.id } }),
    prisma.wallets.findFirst({ where: { id: destinoId, user_id: session.id } }),
  ])
  if (!origen || !destino) return error('Cartera no encontrada', 404)

  const monedaOrigen = origen.moneda || 'HNL'
  // Las tarjetas de crédito llevan deuda en HNL y en USD a la vez; el usuario
  // elige cuál de las dos está pagando.
  const monedaDestino =
    destino.tipo === 'credito'
      ? body?.moneda_destino === 'USD'
        ? 'USD'
        : 'HNL'
      : destino.moneda || 'HNL'

  const requiereConversion = monedaOrigen !== monedaDestino

  // Tasa: la que envía el cliente (puede ser una manual recién fijada) y, si no,
  // la vigente en el servidor.
  let tasa = Number(body?.tasa_cambio) || 0
  if (!(tasa > 0)) tasa = (await tasaVigente(session.id)) || 0

  if (requiereConversion && !(tasa > 0)) {
    return error(
      'No hay tasa de cambio disponible. Actualízala o fija una manual antes de mover dinero entre monedas distintas.',
      400
    )
  }

  const montoOrigen = requiereConversion
    ? convertir(monto, monedaDestino, monedaOrigen, tasa)
    : monto

  // Se sella la tasa aunque no haya conversión: permite normalizar el histórico
  // más adelante sin depender de la tasa del día en que se consulte.
  const tasaSello = tasa > 0 ? tasa : null

  // Identificador común de las dos piernas: permite borrarlas o rehacerlas
  // juntas sin tener que adivinar cuál era la pareja.
  const transferId = randomUUID()

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const categoryId = await categoriaTransferencia(tx, session.id)

      const salida = await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: origen.id,
          category_id: categoryId,
          monto: montoOrigen,
          moneda: monedaOrigen,
          monto_original: requiereConversion ? monto : null,
          tasa_cambio: tasaSello,
          transfer_id: transferId,
          tipo: 'gasto',
          descripcion: descripcion || `Transferencia a ${destino.nombre}`,
          fecha,
          wallet_destino_id: destino.id,
        },
      })

      const entrada = await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: destino.id,
          category_id: categoryId,
          monto,
          moneda: monedaDestino,
          monto_original: requiereConversion ? montoOrigen : null,
          tasa_cambio: tasaSello,
          transfer_id: transferId,
          tipo: 'ingreso',
          descripcion: descripcion || `Transferencia desde ${origen.nombre}`,
          fecha,
          wallet_destino_id: origen.id,
        },
      })

      return { salida_id: salida.id, entrada_id: entrada.id, transfer_id: transferId }
    })

    return NextResponse.json({
      ...resultado,
      monto_origen: montoOrigen,
      moneda_origen: monedaOrigen,
      moneda_destino: monedaDestino,
      tasa_cambio: tasaSello,
    })
  } catch {
    return error('No se pudo registrar la transferencia. No se movió dinero.', 400)
  }
}
