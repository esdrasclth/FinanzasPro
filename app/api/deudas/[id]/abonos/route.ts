import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getSessionUser } from '../../../../lib/auth-server'
import { tasaVigente } from '../../../../lib/tipoCambio-server'
import { round2 } from '../../../../lib/dinero'
import { hoyUsuario } from '../../../../lib/fecha-server'

// POST /api/deudas/[id]/abonos
// { monto, wallet_id, fecha?, nota?, category_id?, moneda?, descripcion? }
//
// Registra un abono como una sola unidad: el pago en debt_payments, el avance
// de la deuda y la transacción de gasto ligada (debt_id). Antes eran tres
// escrituras encadenadas desde el navegador, así que un fallo a medias dejaba
// la deuda descuadrada respecto a sus pagos, o un pago que nunca salió de la
// cartera.
//
// El avance usa `increment` en vez de leer-sumar-escribir: dos abonos
// simultáneos ya no se pisan entre sí.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

// Tolerancia para comparar montos con decimales de punto flotante.
const EPS = 0.005

const error = (message: string, status: number) =>
  NextResponse.json({ error: { message } }, { status })

class AbonoExcedido extends Error {}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) return error('No autenticado', 401)

  const body = await req.json().catch(() => null)
  const monto = round2(Number(body?.monto))
  const walletId = body?.wallet_id
  const nota = (body?.nota || '').trim() || null
  const descripcion = (body?.descripcion || '').trim()
  const categoryId = body?.category_id || null
  const fecha = toDate(body?.fecha || (await hoyUsuario()))

  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  const deuda = await prisma.debts.findFirst({ where: { id, user_id: session.id } })
  if (!deuda) return error('Deuda no encontrada', 404)
  if (deuda.completada) return error('Esta deuda ya está saldada', 400)

  const pendiente = round2(Number(deuda.monto_total) - Number(deuda.monto_pagado))
  if (monto > pendiente + EPS) {
    return error(`El abono supera el pendiente de la deuda (${pendiente.toFixed(2)})`, 400)
  }

  const wallet = walletId
    ? await prisma.wallets.findFirst({ where: { id: walletId, user_id: session.id } })
    : null
  if (!wallet) return error('Selecciona una cartera válida', 400)

  // Las deudas creadas antes de que la subcategoría fuera automática no la
  // tienen; se crea aquí para que el abono cuente en su presupuesto.
  let categoriaFinal = categoryId
  if (!categoriaFinal && deuda.tipo === 'debo') {
    categoriaFinal = deuda.category_id
    if (!categoriaFinal) {
      const creada = await asegurarSubcategoria(session.id, deuda.id, deuda.nombre)
      categoriaFinal = creada
    }
  }

  const moneda = body?.moneda || wallet.moneda || 'HNL'
  const tasaSello = await tasaVigente(session.id)

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const pago = await tx.debt_payments.create({
        data: {
          debt_id: deuda.id,
          user_id: session.id,
          wallet_id: wallet.id,
          monto,
          fecha,
          nota,
        },
      })

      const actualizada = await tx.debts.update({
        where: { id: deuda.id },
        data: { monto_pagado: { increment: monto } },
      })

      // Otro abono simultáneo se adelantó y entre los dos superan el total:
      // se revierte todo lanzando desde dentro de la transacción.
      if (Number(actualizada.monto_pagado) > Number(actualizada.monto_total) + EPS) {
        throw new AbonoExcedido()
      }

      const completada =
        Number(actualizada.monto_pagado) >= Number(actualizada.monto_total) - EPS
      if (completada && !actualizada.completada) {
        await tx.debts.update({ where: { id: deuda.id }, data: { completada: true } })
      }

      const trans = await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: wallet.id,
          category_id: categoriaFinal,
          debt_id: deuda.id,
          monto,
          moneda,
          tasa_cambio: tasaSello,
          tipo: 'gasto',
          descripcion:
            descripcion || `Abono: ${deuda.nombre}${nota ? ' — ' + nota : ''}`,
          fecha,
        },
      })

      // Enlace explícito abono <-> transacción, para poder deshacer el par.
      await tx.debt_payments.update({
        where: { id: pago.id },
        data: { transaction_id: trans.id },
      })

      return {
        pago_id: pago.id,
        transaction_id: trans.id,
        monto_pagado: Number(actualizada.monto_pagado),
        completada,
      }
    })

    return NextResponse.json(resultado)
  } catch (e) {
    if (e instanceof AbonoExcedido) {
      return error('El abono supera el pendiente de la deuda. No se registró nada.', 400)
    }
    return error('No se pudo registrar el abono. No se movió dinero.', 400)
  }
}

// Crea la subcategoría de una deuda bajo la raíz "Deudas" y la enlaza.
async function asegurarSubcategoria(userId: string, deudaId: string, nombre: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    let raiz = await tx.categories.findFirst({
      where: { user_id: userId, protegida: true, nombre: 'Deudas' },
      select: { id: true },
    })
    if (!raiz) {
      raiz = await tx.categories.create({
        data: {
          user_id: userId, nombre: 'Deudas', tipo: 'gasto', icono: '🤝',
          color: '#0EA5E9', protegida: true, es_sistema: false,
        },
        select: { id: true },
      })
    }
    const sub = await tx.categories.create({
      data: {
        user_id: userId, nombre, tipo: 'gasto', icono: '💸',
        color: '#EF4444', parent_id: raiz.id,
      },
      select: { id: true },
    })
    await tx.debts.update({ where: { id: deudaId }, data: { category_id: sub.id } })
    return sub.id
  })
}
