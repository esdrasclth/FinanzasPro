import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { round2 } from '../../../lib/dinero'
import { prepararReparto, requireReparto, walletDeUsuario } from '../../../lib/repartos-server'
import { tasaVigente, montoParaCartera } from '../../../lib/tipoCambio-server'

// GET /api/repartos/[id] -> detalle con participantes
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const reparto = await prisma.repartos.findUnique({
    where: { id },
    include: { participantes: { orderBy: { orden: 'asc' } } },
  })
  if (!reparto) return NextResponse.json({ error: 'Reparto no encontrado' }, { status: 404 })

  // La parte propia (es_yo) no se cobra; solo lo demás es recuperable.
  const recuperable = reparto.participantes.filter(p => !p.es_yo).reduce((s, p) => s + p.monto_asignado, 0)
  const cobrado = reparto.participantes.filter(p => !p.es_yo && p.pagado).reduce((s, p) => s + p.monto_asignado, 0)
  const miParte = reparto.participantes.filter(p => p.es_yo).reduce((s, p) => s + p.monto_asignado, 0)

  return NextResponse.json({
    reparto: {
      id: reparto.id,
      descripcion: reparto.descripcion,
      monto_total: reparto.monto_total,
      moneda: reparto.moneda,
      metodo: reparto.metodo,
      fecha: reparto.fecha.toISOString().slice(0, 10),
      wallet_id: reparto.wallet_id,
      // Quién puso el dinero y cómo. Null en pagado_por = lo pagaste tú.
      pagado_por: reparto.pagado_por,
      metodo_pago: reparto.metodo_pago,
      metodo_detalle: reparto.metodo_detalle,
      monto_pagado: round2(cobrado),
      monto_recuperable: round2(recuperable),
      mi_parte: round2(miParte),
      participantes: reparto.participantes.map(p => ({
        id: p.id,
        nombre: p.nombre,
        monto_asignado: p.monto_asignado,
        pagado: p.pagado,
        fecha_pago: p.fecha_pago ? p.fecha_pago.toISOString().slice(0, 10) : null,
        es_yo: p.es_yo,
      })),
    },
  })
}

// PUT /api/repartos/[id] -> reemplaza datos y participantes
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const prep = prepararReparto(body)
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
  const d = prep.data

  // Igual que al crear: si pagó otra persona no se toca ninguna cartera tuya.
  const pagoAjeno = !!d.pagadoPor
  const wallet = pagoAjeno ? null : await walletDeUsuario(auth.userId, d.walletId)
  if (!pagoAjeno && !wallet) {
    return NextResponse.json({ error: 'Selecciona la cartera de la que salió el gasto' }, { status: 400 })
  }
  const walletId = wallet?.id ?? null

  const repartoPrev = await prisma.repartos.findUnique({ where: { id }, select: { transaction_id: true } })
  const previos = await prisma.reparto_participantes.findMany({ where: { reparto_id: id } })
  // Conserva el cobro (estado y cartera) de participantes que sigan tras la edición, por nombre.
  const cobroPorNombre = new Map(
    previos.filter(p => p.pagado && !p.es_yo).map(p => [p.nombre.toLowerCase(), { fecha_pago: p.fecha_pago, wallet_id: p.wallet_id }])
  )
  const txIdsRecuperacion = previos.map(p => p.transaction_id).filter((x): x is string => !!x)

  // Monedas de las carteras donde ya se habían cobrado partes, para recrear
  // cada ingreso en la moneda de su propia cartera.
  const idsCobro = [...new Set(
    [...cobroPorNombre.values()].map(c => c.wallet_id).filter((x): x is string => !!x)
  )]
  const carterasCobro = idsCobro.length > 0
    ? await prisma.wallets.findMany({
        where: { id: { in: idsCobro }, user_id: auth.userId },
        select: { id: true, moneda: true },
      })
    : []
  const monedaDeCartera = new Map(carterasCobro.map(w => [w.id, w.moneda]))
  const tasa = await tasaVigente(auth.userId)
  const enCarteraGasto = wallet ? montoParaCartera(d.montoTotal, d.moneda, wallet.moneda, tasa) : null

  await prisma.$transaction(async (tx) => {
    // Rehacer el gasto: borra las transacciones viejas y crea una nueva por el nuevo total.
    const aBorrar = [repartoPrev?.transaction_id, ...txIdsRecuperacion].filter((x): x is string => !!x)
    if (aBorrar.length > 0) await tx.transactions.deleteMany({ where: { id: { in: aBorrar } } })

    const gasto = enCarteraGasto && walletId
      ? await tx.transactions.create({
          data: {
            user_id: auth.userId,
            wallet_id: walletId,
            monto: enCarteraGasto.monto,
            moneda: enCarteraGasto.moneda,
            monto_original: enCarteraGasto.monto_original,
            tasa_cambio: enCarteraGasto.tasa_cambio,
            tipo: 'gasto',
            descripcion: `Reparto: ${d.descripcion}`,
            fecha: d.fecha,
          },
        })
      : null

    await tx.repartos.update({
      where: { id },
      data: {
        descripcion: d.descripcion,
        monto_total: d.montoTotal,
        moneda: d.moneda,
        metodo: d.metodo,
        fecha: d.fecha,
        wallet_id: walletId,
        transaction_id: gasto?.id ?? null,
        pagado_por: d.pagadoPor,
        metodo_pago: d.metodoPago,
        metodo_detalle: d.metodoDetalle,
      },
    })
    await tx.reparto_participantes.deleteMany({ where: { reparto_id: id } })

    for (let i = 0; i < d.participantes.length; i++) {
      const p = d.participantes[i]
      const cobro = !p.es_yo ? cobroPorNombre.get(p.nombre.toLowerCase()) : undefined
      // Recrea el ingreso de cobro solo si antes estaba pagado y sabemos a qué cartera entró.
      let txId: string | null = null
      let walletCobro: string | null = null
      if (!pagoAjeno && cobro && cobro.wallet_id && p.monto_asignado > 0) {
        const enCartera = montoParaCartera(
          p.monto_asignado, d.moneda, monedaDeCartera.get(cobro.wallet_id), tasa
        )
        const ingreso = await tx.transactions.create({
          data: {
            user_id: auth.userId,
            wallet_id: cobro.wallet_id,
            monto: enCartera.monto,
            moneda: enCartera.moneda,
            monto_original: enCartera.monto_original,
            tasa_cambio: enCartera.tasa_cambio,
            tipo: 'ingreso',
            descripcion: `Cobro reparto: ${d.descripcion} — ${p.nombre}`,
            fecha: cobro.fecha_pago ?? new Date(),
          },
        })
        txId = ingreso.id
        walletCobro = cobro.wallet_id
      }
      await tx.reparto_participantes.create({
        data: {
          reparto_id: id,
          nombre: p.nombre,
          monto_asignado: p.monto_asignado,
          es_yo: p.es_yo,
          pagado: !!cobro,
          fecha_pago: cobro ? cobro.fecha_pago ?? null : null,
          wallet_id: walletCobro,
          transaction_id: txId,
          orden: i,
        },
      })
    }
  })

  return NextResponse.json({ id })
}

// DELETE /api/repartos/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const reparto = await prisma.repartos.findUnique({ where: { id }, select: { transaction_id: true } })
  const participantes = await prisma.reparto_participantes.findMany({ where: { reparto_id: id }, select: { transaction_id: true } })
  const txIds = [reparto?.transaction_id, ...participantes.map(p => p.transaction_id)].filter((x): x is string => !!x)

  await prisma.$transaction(async (tx) => {
    if (txIds.length > 0) await tx.transactions.deleteMany({ where: { id: { in: txIds } } })
    await tx.repartos.delete({ where: { id } })
  })
  return NextResponse.json({ ok: true })
}
