import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '../../../../lib/prisma'
import { getSessionUser } from '../../../../lib/auth-server'
import { tasaVigente } from '../../../../lib/tipoCambio-server'
import { convertir } from '../../../../lib/tipoCambio'
import { round2 } from '../../../../lib/dinero'

// POST /api/metas/[id]/aportes
// { monto, wallet_id, wallet_destino_id, fecha?, nota? }
//
// Un aporte a una meta mueve dinero de verdad: sale de la cartera de origen y
// entra en la cartera donde se guarda el ahorro, igual que una transferencia,
// y queda registrado en meta_aportes para poder consultarlo y deshacerlo.
//
// Antes "aportar" solo subía metas.monto_actual: el dinero seguía disponible en
// la cuenta y no había historial, así que la meta no significaba nada.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

const EPS = 0.005

const error = (message: string, status: number) =>
  NextResponse.json({ error: { message } }, { status })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) return error('No autenticado', 401)

  const body = await req.json().catch(() => null)
  const monto = round2(Number(body?.monto))
  const nota = (body?.nota || '').trim() || null
  const fecha = toDate(body?.fecha || new Date().toISOString().slice(0, 10))

  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  const meta = await prisma.metas.findFirst({ where: { id, user_id: session.id } })
  if (!meta) return error('Meta no encontrada', 404)
  if (meta.completada) return error('Esta meta ya está completada', 400)

  const restante = round2(Number(meta.monto_objetivo) - Number(meta.monto_actual))
  if (monto > restante + EPS) {
    return error(`El aporte supera lo que falta para la meta (${restante.toFixed(2)})`, 400)
  }

  const [origen, destino] = await Promise.all([
    prisma.wallets.findFirst({ where: { id: body?.wallet_id || '', user_id: session.id } }),
    prisma.wallets.findFirst({ where: { id: body?.wallet_destino_id || '', user_id: session.id } }),
  ])
  if (!origen) return error('Selecciona la cartera de la que sale el aporte', 400)
  if (!destino) return error('Selecciona la cartera donde se guarda el ahorro', 400)
  if (origen.id === destino.id) {
    return error('El ahorro debe guardarse en una cartera distinta a la de origen', 400)
  }

  // El monto se expresa en la moneda de la cartera de ahorro (es lo que se
  // guarda); de la de origen sale su equivalente.
  const monedaOrigen = origen.moneda || 'HNL'
  const monedaDestino = destino.moneda || 'HNL'
  const requiereConversion = monedaOrigen !== monedaDestino

  const tasa = (await tasaVigente(session.id)) || 0
  if (requiereConversion && !(tasa > 0)) {
    return error(
      'No hay tasa de cambio disponible y las carteras usan monedas distintas. Actualízala o fija una manual.',
      400
    )
  }

  const montoOrigen = requiereConversion
    ? convertir(monto, monedaDestino, monedaOrigen, tasa)
    : monto
  const tasaSello = tasa > 0 ? tasa : null
  const transferId = randomUUID()

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const descripcion = `Aporte a meta: ${meta.nombre}${nota ? ' — ' + nota : ''}`

      await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: origen.id,
          monto: montoOrigen,
          moneda: monedaOrigen,
          monto_original: requiereConversion ? monto : null,
          tasa_cambio: tasaSello,
          transfer_id: transferId,
          tipo: 'gasto',
          descripcion,
          fecha,
          wallet_destino_id: destino.id,
        },
      })

      await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: destino.id,
          monto,
          moneda: monedaDestino,
          monto_original: requiereConversion ? montoOrigen : null,
          tasa_cambio: tasaSello,
          transfer_id: transferId,
          tipo: 'ingreso',
          descripcion,
          fecha,
          wallet_destino_id: origen.id,
        },
      })

      const actualizada = await tx.metas.update({
        where: { id: meta.id },
        data: { monto_actual: { increment: monto } },
      })

      if (Number(actualizada.monto_actual) > Number(actualizada.monto_objetivo) + EPS) {
        throw new Error('APORTE_EXCEDIDO')
      }

      const completada =
        Number(actualizada.monto_actual) >= Number(actualizada.monto_objetivo) - EPS
      if (completada && !actualizada.completada) {
        await tx.metas.update({ where: { id: meta.id }, data: { completada: true } })
      }

      const aporte = await tx.meta_aportes.create({
        data: {
          meta_id: meta.id,
          user_id: session.id,
          wallet_id: origen.id,
          wallet_destino_id: destino.id,
          transfer_id: transferId,
          monto,
          fecha,
          nota,
        },
      })

      return {
        aporte_id: aporte.id,
        transfer_id: transferId,
        monto_actual: Number(actualizada.monto_actual),
        monto_origen: montoOrigen,
        completada,
      }
    })

    return NextResponse.json(resultado)
  } catch (e) {
    if (e instanceof Error && e.message === 'APORTE_EXCEDIDO') {
      return error('El aporte supera el objetivo de la meta. No se registró nada.', 400)
    }
    return error('No se pudo registrar el aporte. No se movió dinero.', 400)
  }
}
