import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { prepararReparto, walletDeUsuario } from '../../lib/repartos-server'
import { tasaVigente, montoParaCartera } from '../../lib/tipoCambio-server'

// GET /api/repartos -> repartos del usuario con resumen de pago
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const repartos = await prisma.repartos.findMany({
    where: { user_id: user.id },
    orderBy: { fecha: 'desc' },
    include: { participantes: true },
  })

  return NextResponse.json({
    repartos: repartos.map(r => {
      // Excluye la parte propia (es_yo): no se cobra.
      const cobrables = r.participantes.filter(p => !p.es_yo)
      const pagado = cobrables.filter(p => p.pagado).reduce((s, p) => s + p.monto_asignado, 0)
      return {
        id: r.id,
        descripcion: r.descripcion,
        monto_total: r.monto_total,
        moneda: r.moneda,
        metodo: r.metodo,
        fecha: r.fecha.toISOString().slice(0, 10),
        participantes: cobrables.length,
        pagados: cobrables.filter(p => p.pagado).length,
        monto_pagado: Math.round((pagado + Number.EPSILON) * 100) / 100,
      }
    }),
  })
}

// POST /api/repartos
// { descripcion, monto_total, moneda, metodo, fecha, participantes:[{nombre, monto_asignado?}] }
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const prep = prepararReparto(body)
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
  const d = prep.data

  const wallet = await walletDeUsuario(user.id, d.walletId)
  if (!wallet) return NextResponse.json({ error: 'Selecciona la cartera de la que salió el gasto' }, { status: 400 })
  const walletId = wallet.id

  // El reparto puede llevarse en otra moneda que la cartera; el dinero sale en
  // la moneda de la cartera.
  const enCartera = montoParaCartera(d.montoTotal, d.moneda, wallet.moneda, await tasaVigente(user.id))

  const reparto = await prisma.$transaction(async (tx) => {
    // Gasto real: sale el monto total de la cartera elegida.
    const gasto = await tx.transactions.create({
      data: {
        user_id: user.id,
        wallet_id: walletId,
        monto: enCartera.monto,
        moneda: enCartera.moneda,
        monto_original: enCartera.monto_original,
        tasa_cambio: enCartera.tasa_cambio,
        tipo: 'gasto',
        descripcion: `Reparto: ${d.descripcion}`,
        fecha: d.fecha,
      },
    })
    return tx.repartos.create({
      data: {
        user_id: user.id,
        descripcion: d.descripcion,
        monto_total: d.montoTotal,
        moneda: d.moneda,
        metodo: d.metodo,
        fecha: d.fecha,
        wallet_id: walletId,
        transaction_id: gasto.id,
        participantes: {
          create: d.participantes.map((p, i) => ({
            nombre: p.nombre,
            monto_asignado: p.monto_asignado,
            es_yo: p.es_yo,
            orden: i,
          })),
        },
      },
    })
  })

  return NextResponse.json({ id: reparto.id })
}
