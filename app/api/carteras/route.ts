import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { carterasConSaldo, carterasArchivadas } from '../../lib/carteras-server'
import { tasaVigente } from '../../lib/tipoCambio-server'
import { hoyUsuarioUTC } from '../../lib/fecha-server'
import { categoriaSistema } from '../../lib/categorias-server'

// GET /api/carteras
// Carteras activas con su saldo ya calculado, más las archivadas.
// La pantalla recibe el primer render desde el servidor; esta ruta la usa para
// refrescar después de crear, editar, ajustar o archivar una cartera.
export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const [carteras, archivadas] = await Promise.all([
    carterasConSaldo(session.id),
    carterasArchivadas(session.id),
  ])

  return NextResponse.json({ carteras, archivadas })
}

// PATCH /api/carteras  -> { id, activo } archiva o restaura | { orden: [ids] } reordena
export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  if (Array.isArray(body?.orden)) {
    // El orden manual se guarda de una vez, no con una escritura por cartera.
    await prisma.$transaction(
      body.orden.map((id: string, i: number) =>
        prisma.wallets.updateMany({ where: { id, user_id: session.id }, data: { posicion: i } })
      )
    )
    return NextResponse.json({ ok: true })
  }

  const id = body?.id
  if (!id || typeof body?.activo !== 'boolean') {
    return NextResponse.json({ error: { message: 'Datos incompletos' } }, { status: 400 })
  }
  const { count } = await prisma.wallets.updateMany({
    where: { id, user_id: session.id },
    data: { activo: body.activo },
  })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Cartera no encontrada' } }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/carteras?id=...
// Solo si no tiene movimientos: las carteras tienen ON DELETE CASCADE sobre
// transactions, así que borrar una con historial lo destruiría entero.
export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const cartera = await prisma.wallets.findFirst({ where: { id, user_id: session.id } })
  if (!cartera) {
    return NextResponse.json({ error: { message: 'Cartera no encontrada' } }, { status: 404 })
  }

  const movimientos = await prisma.transactions.count({ where: { wallet_id: id } })
  if (movimientos > 0) {
    return NextResponse.json(
      {
        error: {
          message: `No se puede eliminar "${cartera.nombre}": tiene ${movimientos} ${movimientos === 1 ? 'movimiento asociado' : 'movimientos asociados'} que se perderían. Déjala archivada para conservar el histórico.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.wallets.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// POST /api/carteras -> crea la cartera y su saldo de apertura
// PUT  /api/carteras -> { id, ... } edita
//
// La apertura se registra como una transacción de categoría "Saldo inicial",
// excluida de las gráficas. Crear la cartera y su apertura eran dos escrituras
// sueltas desde el navegador: si fallaba la segunda quedaba una cartera con
// saldo cero y sin rastro del dinero que ya había en ella.

function leerCartera(body: any) {
  const nombre = String(body?.nombre || '').trim()
  const tipo = ['efectivo', 'banco', 'credito', 'ahorro'].includes(body?.tipo) ? body.tipo : 'efectivo'
  if (!nombre) return { error: 'El nombre es obligatorio' }
  const esTarjeta = tipo === 'credito'
  return {
    datos: {
      nombre,
      tipo,
      color: body?.color || null,
      activo: true,
      // Las tarjetas llevan HNL y USD a la vez; su moneda primaria es HNL.
      moneda: esTarjeta ? 'HNL' : (body?.moneda || 'HNL'),
      credito_limite: esTarjeta ? Number(body?.credito_limite) || 0 : null,
      fecha_corte: esTarjeta ? Number(body?.fecha_corte) || 1 : null,
      fecha_pago: esTarjeta ? Number(body?.fecha_pago) || 15 : null,
      numero_tarjeta: esTarjeta ? (body?.numero_tarjeta || null) : null,
      numero_cuenta: tipo === 'banco' ? (body?.numero_cuenta || null) : null,
    },
  }
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const r = leerCartera(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  // Aperturas: una por moneda (las tarjetas pueden tener HNL y USD).
  const aperturas: { monto: number; moneda: string }[] = []
  const hnl = Number(body?.saldo_inicial) || 0
  const usd = Number(body?.saldo_inicial_usd) || 0
  if (hnl !== 0) aperturas.push({ monto: hnl, moneda: r.datos!.tipo === 'credito' ? 'HNL' : r.datos!.moneda })
  if (usd !== 0 && r.datos!.tipo === 'credito') aperturas.push({ monto: usd, moneda: 'USD' })

  const tasa = await tasaVigente(session.id)
  const hoy = await hoyUsuarioUTC()

  // La categoría de apertura es de sistema y global: se resuelve fuera de la
  // transacción para no crearla dentro de ella.
  const catApertura: Record<string, string | null> = {}
  for (const ap of aperturas) {
    const tipoMov = ap.monto > 0 ? 'ingreso' : 'gasto'
    catApertura[tipoMov] ??= await categoriaSistema('Saldo inicial', tipoMov)
  }

  const cartera = await prisma.$transaction(async (tx) => {
    const ultima = await tx.wallets.aggregate({
      where: { user_id: session.id, activo: true },
      _max: { posicion: true },
    })
    const w = await tx.wallets.create({
      data: {
        user_id: session.id,
        saldo_inicial: 0,
        posicion: (ultima._max.posicion ?? 0) + 1,
        ...r.datos!,
      },
    })
    for (const ap of aperturas) {
      const tipoMov = ap.monto > 0 ? 'ingreso' : 'gasto'
      await tx.transactions.create({
        data: {
          user_id: session.id,
          wallet_id: w.id,
          category_id: catApertura[tipoMov],
          monto: Math.abs(ap.monto),
          moneda: ap.moneda,
          tasa_cambio: tasa,
          tipo: tipoMov,
          descripcion: 'Saldo inicial',
          fecha: hoy,
        },
      })
    }
    return w
  })

  return NextResponse.json({ cartera })
}

export async function PUT(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })

  const r = leerCartera(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const { count } = await prisma.wallets.updateMany({
    where: { id, user_id: session.id },
    data: r.datos!,
  })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Cartera no encontrada' } }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
