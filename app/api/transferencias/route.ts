import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { tasaVigente } from '../../lib/tipoCambio-server'
import { convertir } from '../../lib/tipoCambio'
import { round2 } from '../../lib/dinero'
import { hoyUsuario } from '../../lib/fecha-server'
import { categoriaSistema } from '../../lib/categorias-server'

// POST /api/transferencias
// { wallet_id, wallet_destino_id, monto, moneda_origen?, moneda_destino?,
//   tasa_cambio?, descripcion?, fecha? }
//
// El monto se expresa en la moneda de DESTINO (lo que se paga o se recibe);
// el servidor calcula cuánto sale de la cartera de origen.
//
// Las dos piernas se escriben dentro de una sola transacción de base de datos.
// Antes esto eran dos inserts encadenados desde el navegador: si el segundo
// fallaba (o se cerraba la pestaña entre uno y otro) el dinero salía de la
// cartera de origen y nunca llegaba a la de destino.
//
// Caso especial: la MISMA tarjeta de crédito como origen y destino. Sirve para
// pasar deuda de una moneda a la otra, que es una operación que los bancos
// ofrecen y que hasta ahora no había forma de registrar sin ensuciar el mes.
// Se admite solo si es de crédito (las demás carteras llevan una sola moneda)
// y si las dos monedas difieren. Al llevar `wallet_destino_id`, las dos piernas
// quedan fuera de ingresos y gastos igual que cualquier traspaso.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

const error = (message: string, status: number) =>
  NextResponse.json({ error: { message } }, { status })

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
  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  const [origen, destino] = await Promise.all([
    prisma.wallets.findFirst({ where: { id: walletId, user_id: session.id } }),
    prisma.wallets.findFirst({ where: { id: destinoId, user_id: session.id } }),
  ])
  if (!origen || !destino) return error('Cartera no encontrada', 404)

  const mismaCartera = walletId === destinoId

  // Solo se acepta `moneda_origen` si la cartera lleva dos monedas. Sin el
  // campo se cae a la moneda de la cartera, que es como se comportaba antes.
  const monedaOrigen =
    origen.tipo === 'credito' && (body?.moneda_origen === 'USD' || body?.moneda_origen === 'HNL')
      ? body.moneda_origen
      : origen.moneda || 'HNL'

  // Las tarjetas de crédito llevan deuda en HNL y en USD a la vez; el usuario
  // elige cuál de las dos está pagando.
  const monedaDestino =
    destino.tipo === 'credito'
      ? body?.moneda_destino === 'USD'
        ? 'USD'
        : 'HNL'
      : destino.moneda || 'HNL'

  const requiereConversion = monedaOrigen !== monedaDestino

  if (mismaCartera) {
    if (origen.tipo !== 'credito') {
      return error('El origen y el destino deben ser carteras distintas', 400)
    }
    if (!requiereConversion) {
      return error('Para pasar deuda dentro de la misma tarjeta, elige dos monedas distintas', 400)
    }
  }

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

  // Dentro de una misma tarjeta no hay "desde" ni "hacia" que nombrar: las dos
  // piernas son la misma cuenta. Se describe lo que de verdad pasó, que es que
  // la deuda cambió de moneda. La que se salda es la de destino (entra un
  // ingreso que la reduce) y la que crece es la de origen (sale un gasto).
  const glosaMismaTarjeta = `Conversión de deuda ${monedaDestino} → ${monedaOrigen}`
  const glosaSalida = mismaCartera ? glosaMismaTarjeta : `Transferencia a ${destino.nombre}`
  const glosaEntrada = mismaCartera ? glosaMismaTarjeta : `Transferencia desde ${origen.nombre}`

  // La categoría de sistema "Transferencia" agrupa ambas piernas. Es global, y
  // se resuelve fuera de la transacción para no crearla dentro de ella.
  const categoryId = await categoriaSistema('Transferencia', 'gasto')

  try {
    const resultado = await prisma.$transaction(async (tx) => {
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
          descripcion: descripcion || glosaSalida,
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
          descripcion: descripcion || glosaEntrada,
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
