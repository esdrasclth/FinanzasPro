import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { tasaVigente } from '../../lib/tipoCambio-server'
import { serializarMovimiento } from '../../lib/transacciones-mes-server'
import { round2 } from '../../lib/dinero'
import { hoyUsuario } from '../../lib/fecha-server'
import { categoriaSistema, categoriasVisibles } from '../../lib/categorias-server'

// POST /api/transacciones  -> crea un movimiento simple (gasto o ingreso)
// PUT  /api/transacciones  -> { id, ... } edita uno simple
//
// Los movimientos compuestos tienen sus propias rutas: /api/transferencias,
// /api/deudas/[id]/abonos y /api/metas/[id]/aportes. Aquí se rechaza tocarlos
// para no descuadrar su contraparte.
//
// `categoria_sistema` permite pedir una categoría de sistema por nombre
// ("Saldo inicial", "Ajuste de saldo") sin que el cliente tenga que buscarla o
// crearla con dos llamadas sueltas.

const toDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

const error = (message: string, status: number) =>
  NextResponse.json({ error: { message } }, { status })

export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return error('No autenticado', 401)

  const body = await req.json().catch(() => null)
  const monto = round2(Number(body?.monto))
  const tipo = body?.tipo === 'ingreso' ? 'ingreso' : 'gasto'
  const walletId = body?.wallet_id

  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  const wallet = walletId
    ? await prisma.wallets.findFirst({ where: { id: walletId, user_id: s.id } })
    : null
  if (!wallet) return error('Selecciona una cartera válida', 400)

  let categoryId: string | null = body?.category_id || null
  if (!categoryId && body?.categoria_sistema) {
    categoryId = await categoriaSistema(String(body.categoria_sistema), tipo)
  }
  if (categoryId) {
    const cat = await prisma.categories.findFirst({
      where: { id: categoryId, ...categoriasVisibles(s.id) },
      select: { id: true },
    })
    if (!cat) return error('Categoría no válida', 400)
  }

  const moneda = body?.moneda || wallet.moneda || 'HNL'
  // Se sella la tasa vigente para que el histórico no dependa de la tasa del
  // día en que se consulte.
  const tasa = body?.tasa_cambio != null ? Number(body.tasa_cambio) : await tasaVigente(s.id)

  const t = await prisma.transactions.create({
    data: {
      user_id: s.id,
      wallet_id: wallet.id,
      category_id: categoryId,
      monto,
      moneda,
      tasa_cambio: tasa,
      tipo,
      descripcion: body?.descripcion || null,
      fecha: toDate(body?.fecha || (await hoyUsuario())),
    },
    include: {
      category: { select: { nombre: true, icono: true, color: true } },
      wallet: { select: { nombre: true, color: true, tipo: true } },
    },
  })

  return NextResponse.json({ transaccion: serializarMovimiento(t) })
}

export async function PUT(req: Request) {
  const s = await getSessionUser()
  if (!s) return error('No autenticado', 401)

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return error('Falta el identificador', 400)

  const actual = await prisma.transactions.findFirst({ where: { id, user_id: s.id } })
  if (!actual) return error('Movimiento no encontrado', 404)

  if (actual.transfer_id || actual.wallet_destino_id || actual.debt_id) {
    return error(
      'Las transferencias y los abonos no se editan aquí: cambiarles el monto dejaría descuadrada su contraparte. Elimínalos y vuelve a registrarlos.',
      409
    )
  }

  const monto = round2(Number(body?.monto))
  if (!(monto > 0)) return error('El monto debe ser mayor a 0', 400)

  const wallet = await prisma.wallets.findFirst({ where: { id: body?.wallet_id, user_id: s.id } })
  if (!wallet) return error('Selecciona una cartera válida', 400)

  if (body?.category_id) {
    const cat = await prisma.categories.findFirst({
      where: { id: body.category_id, ...categoriasVisibles(s.id) },
      select: { id: true },
    })
    if (!cat) return error('Categoría no válida', 400)
  }

  const t = await prisma.transactions.update({
    where: { id },
    data: {
      wallet_id: wallet.id,
      category_id: body?.category_id || null,
      monto,
      descripcion: body?.descripcion || null,
      fecha: toDate(body?.fecha || actual.fecha.toISOString().slice(0, 10)),
    },
    include: {
      category: { select: { nombre: true, icono: true, color: true } },
      wallet: { select: { nombre: true, color: true, tipo: true } },
    },
  })

  return NextResponse.json({ transaccion: serializarMovimiento(t) })
}
