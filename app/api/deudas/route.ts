import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// GET    /api/deudas          -> lista
// PATCH  /api/deudas          -> { id, completada }  marca saldada / reabre
// DELETE /api/deudas?id=...   -> elimina la deuda y su subcategoría
//
// El borrado y el cierre se hacen en el servidor dentro de una transacción:
// antes eran dos escrituras sueltas desde el navegador (la deuda y su
// subcategoría), así que un fallo entre ambas dejaba una subcategoría
// huérfana o una deuda sin su categoría.

const aISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export function serializarDeuda(d: any) {
  return {
    ...d,
    fecha_limite: aISO(d.fecha_limite),
    fecha_inicio: aISO(d.fecha_inicio),
    created_at: d.created_at.toISOString(),
  }
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }
  const filas = await prisma.debts.findMany({
    where: { user_id: session.id },
    orderBy: [{ completada: 'asc' }, { created_at: 'desc' }],
  })
  return NextResponse.json({ deudas: filas.map(serializarDeuda) })
}

export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const id = body?.id
  const completada = !!body?.completada
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const deuda = await prisma.debts.findFirst({ where: { id, user_id: session.id } })
  if (!deuda) {
    return NextResponse.json({ error: { message: 'Deuda no encontrada' } }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.debts.update({ where: { id }, data: { completada } })
    // Saldada, su subcategoría se archiva para no seguir presupuestándola;
    // al reabrirla vuelve a estar disponible.
    if (deuda.category_id) {
      await tx.categories.update({ where: { id: deuda.category_id }, data: { archivada: completada } })
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })
  }

  const deuda = await prisma.debts.findFirst({ where: { id, user_id: session.id } })
  if (!deuda) {
    return NextResponse.json({ error: { message: 'Deuda no encontrada' } }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    // Los abonos se borran en cascada. Las transacciones que los reflejaron se
    // conservan: son gastos reales que ya ocurrieron, y quedan con debt_id nulo.
    await tx.debts.delete({ where: { id } })
    if (deuda.category_id) {
      await tx.categories.deleteMany({ where: { id: deuda.category_id, user_id: session.id } })
    }
  })

  return NextResponse.json({ ok: true })
}

const aFechaOpt = (x?: string | null) =>
  x ? new Date(`${String(x).slice(0, 10)}T00:00:00.000Z`) : null

function leerDeuda(body: any) {
  const nombre = String(body?.nombre || '').trim()
  const total = Number(body?.monto_total)
  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!(total > 0)) return { error: 'El monto debe ser mayor a 0' }
  return {
    datos: {
      nombre,
      descripcion: body?.descripcion || null,
      tipo: body?.tipo === 'me_deben' ? 'me_deben' : 'debo',
      monto_total: total,
      fecha_limite: aFechaOpt(body?.fecha_limite),
      fecha_inicio: aFechaOpt(body?.fecha_inicio),
      tasa_interes: body?.tasa_interes != null ? Number(body.tasa_interes) : null,
      tasa_periodo: body?.tasa_periodo || null,
      plazo_meses: body?.plazo_meses != null ? Number(body.plazo_meses) : null,
    },
  }
}

export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const r = leerDeuda(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  // La deuda y su subcategoría se crean juntas: eran dos escrituras sueltas
  // desde el navegador, así que un fallo dejaba la deuda sin categoría y sin
  // forma de presupuestarla.
  const deuda = await prisma.$transaction(async (tx) => {
    const d = await tx.debts.create({ data: { user_id: s.id, monto_pagado: 0, ...r.datos! } })
    if (d.tipo === 'debo') {
      const cat = await crearSubcategoria(tx, s.id, d.nombre)
      return tx.debts.update({ where: { id: d.id }, data: { category_id: cat } })
    }
    return d
  })
  return NextResponse.json({ deuda: serializarDeuda(deuda) })
}

export async function PUT(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })

  const r = leerDeuda(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const actual = await prisma.debts.findFirst({ where: { id, user_id: s.id } })
  if (!actual) return NextResponse.json({ error: { message: 'Deuda no encontrada' } }, { status: 404 })

  // El total no puede quedar por debajo de lo ya abonado.
  if (r.datos!.monto_total < Number(actual.monto_pagado)) {
    return NextResponse.json(
      { error: { message: `El total no puede ser menor a lo ya abonado (${Number(actual.monto_pagado).toFixed(2)})` } },
      { status: 400 }
    )
  }

  const deuda = await prisma.$transaction(async (tx) => {
    const d = await tx.debts.update({
      where: { id },
      data: { ...r.datos!, completada: Number(actual.monto_pagado) >= r.datos!.monto_total },
    })
    // La subcategoría sigue al tipo y al nombre de la deuda.
    if (d.tipo === 'debo') {
      if (actual.category_id) {
        if (d.nombre !== actual.nombre) {
          await tx.categories.updateMany({
            where: { id: actual.category_id, user_id: s.id },
            data: { nombre: d.nombre },
          })
        }
      } else {
        const cat = await crearSubcategoria(tx, s.id, d.nombre)
        return tx.debts.update({ where: { id }, data: { category_id: cat } })
      }
    } else if (actual.category_id) {
      // Pasó de "debo" a "me_deben": ya no aplica una subcategoría de gasto.
      await tx.categories.deleteMany({ where: { id: actual.category_id, user_id: s.id } })
      return tx.debts.update({ where: { id }, data: { category_id: null } })
    }
    return d
  })
  return NextResponse.json({ deuda: serializarDeuda(deuda) })
}

// Cada deuda de tipo 'debo' se refleja como subcategoría bajo la raíz "Deudas",
// para poder asignarle presupuesto mensual.
async function crearSubcategoria(tx: any, userId: string, nombre: string): Promise<string> {
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
  return sub.id
}
