import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getSessionUser } from '../../../../lib/auth-server'
import { tasaVigente } from '../../../../lib/tipoCambio-server'
import { montoParaCartera } from '../../../../lib/tipoCambio-server'
import { calcularSuscripcion, avanzarDesde } from '../../../../lib/suscripciones'
import { round2 } from '../../../../lib/dinero'
import { aMediodiaLocal } from '../../../../lib/fecha'
import { hoyUsuario } from '../../../../lib/fecha-server'

// POST /api/suscripciones/[id]/cobros
// { fecha?, wallet_id?, monto? }
//
// Confirma el cobro de un ciclo: crea el gasto real en la cartera, lo registra
// en subscription_charges y adelanta proximo_cobro al siguiente ciclo.
//
// Una suscripción por sí sola no mueve dinero: hasta ahora la app calculaba muy
// bien cuándo tocaba pagar, pero nunca creaba el gasto, así que el dinero salía
// de la cuenta en la vida real y no aparecía en ninguna parte.
//
// No es automático a propósito: el cobro se confirma cuando de verdad ocurrió.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)
const aISO = (d: Date) => d.toISOString().slice(0, 10)

const error = (message: string, status: number) =>
  NextResponse.json({ error: { message } }, { status })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) return error('No autenticado', 401)

  const sub = await prisma.subscriptions.findFirst({ where: { id, user_id: session.id } })
  if (!sub) return error('Suscripción no encontrada', 404)
  if (sub.estado === 'cancelada') return error('Esta suscripción está cancelada', 400)

  const body = await req.json().catch(() => null)

  // Por defecto se cobra el ciclo que toca según el cálculo de la suscripción.
  // El "hoy" del cálculo es el del usuario, no el del reloj del servidor.
  const hoy = await hoyUsuario()
  const calc = calcularSuscripcion({
    monto: Number(sub.monto),
    frecuencia: sub.frecuencia,
    estado: sub.estado,
    fecha_inicio: sub.fecha_inicio ? aISO(sub.fecha_inicio) : null,
    proximo_cobro: sub.proximo_cobro ? aISO(sub.proximo_cobro) : null,
  }, aMediodiaLocal(hoy))
  const fechaStr = body?.fecha || calc.proximoCobro || hoy
  const fecha = toDate(fechaStr)

  const monto = round2(Number(body?.monto ?? sub.monto))
  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  // Cartera: la indicada, la de la suscripción, o la primera activa.
  const walletId = body?.wallet_id || sub.wallet_id
  const wallet = walletId
    ? await prisma.wallets.findFirst({ where: { id: walletId, user_id: session.id } })
    : await prisma.wallets.findFirst({
        where: { user_id: session.id, activo: true },
        orderBy: { posicion: 'asc' },
      })
  if (!wallet) return error('Selecciona la cartera de la que sale el cobro', 400)

  const yaCobrado = await prisma.subscription_charges.findFirst({
    where: { subscription_id: sub.id, fecha },
    select: { id: true },
  })
  if (yaCobrado) {
    return error(`El cobro del ${fechaStr} ya estaba registrado`, 409)
  }

  const tasa = await tasaVigente(session.id)
  const conversion = montoParaCartera(monto, sub.moneda, wallet.moneda, tasa)
  if (!conversion.ok) return error(conversion.mensaje, 400)
  const enCartera = conversion.valor

  // Siguiente ciclo a partir del que se acaba de cobrar.
  const siguiente = avanzarDesde(fechaStr, sub.frecuencia)

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Un recurrente de ingreso (sueldo, renta) usa el mismo mecanismo: solo
      // cambia el signo del movimiento.
      const esIngreso = sub.tipo === 'ingreso'
      const trans = await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: wallet.id,
          category_id: sub.category_id,
          monto: enCartera.monto,
          moneda: enCartera.moneda,
          monto_original: enCartera.monto_original,
          tasa_cambio: enCartera.tasa_cambio,
          tipo: esIngreso ? 'ingreso' : 'gasto',
          descripcion: `${esIngreso ? 'Ingreso recurrente' : 'Suscripción'}: ${sub.nombre}${sub.plan ? ' (' + sub.plan + ')' : ''}`,
          fecha,
        },
      })

      const cobro = await tx.subscription_charges.create({
        data: {
          subscription_id: sub.id,
          user_id: session.id,
          wallet_id: wallet.id,
          transaction_id: trans.id,
          monto,
          moneda: sub.moneda,
          fecha,
        },
      })

      await tx.subscriptions.update({
        where: { id: sub.id },
        data: { proximo_cobro: toDate(siguiente) },
      })

      return {
        cobro_id: cobro.id,
        transaction_id: trans.id,
        monto_cobrado: enCartera.monto,
        moneda: enCartera.moneda,
        proximo_cobro: siguiente,
      }
    })

    return NextResponse.json(resultado)
  } catch {
    return error('No se pudo registrar el cobro. No se movió dinero.', 400)
  }
}
