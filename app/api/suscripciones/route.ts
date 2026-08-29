import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// GET    /api/suscripciones          -> lista
// PATCH  /api/suscripciones          -> { id, estado }  cambia activa/pausada
// DELETE /api/suscripciones?id=...   -> elimina
//
// Sustituye al shim en esta pantalla: la lista llega desde el Server Component
// y estas rutas la refrescan tras cada cambio.

const aISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export function serializar(s: any) {
  return {
    ...s,
    monto: Number(s.monto),
    fecha_inicio: aISO(s.fecha_inicio),
    proximo_cobro: aISO(s.proximo_cobro),
    created_at: s.created_at.toISOString(),
  }
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }
  const filas = await prisma.subscriptions.findMany({
    where: { user_id: session.id },
    orderBy: { created_at: 'desc' },
  })
  return NextResponse.json({ suscripciones: filas.map(serializar) })
}

export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const id = body?.id
  const estado = body?.estado
  if (!id || !['activa', 'pausada', 'cancelada'].includes(estado)) {
    return NextResponse.json({ error: { message: 'Estado no válido' } }, { status: 400 })
  }

  const { count } = await prisma.subscriptions.updateMany({
    where: { id, user_id: session.id },
    data: { estado },
  })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Suscripción no encontrada' } }, { status: 404 })
  }
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

  // Los cobros ya confirmados se borran en cascada, pero las transacciones que
  // generaron se conservan: son gastos reales que ya ocurrieron.
  const { count } = await prisma.subscriptions.deleteMany({
    where: { id, user_id: session.id },
  })
  if (count === 0) {
    return NextResponse.json({ error: { message: 'Suscripción no encontrada' } }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

function leerSub(body: any) {
  const nombre = String(body?.nombre || '').trim()
  const monto = Number(body?.monto)
  const fecha = String(body?.fecha_inicio || '').slice(0, 10)
  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!(monto > 0)) return { error: 'El monto debe ser mayor a 0' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha de inicio inválida' }
  const frecuencias = ['semanal', 'mensual', 'trimestral', 'anual']
  return {
    datos: {
      nombre,
      plan: body?.plan || null,
      tipo: body?.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      monto,
      moneda: body?.moneda || 'HNL',
      frecuencia: frecuencias.includes(body?.frecuencia) ? body.frecuencia : 'mensual',
      category_id: body?.category_id || null,
      wallet_id: body?.wallet_id || null,
      fecha_inicio: new Date(`${fecha}T00:00:00.000Z`),
      color: body?.color || null,
      notas: body?.notas || null,
      estado: ['activa', 'pausada', 'cancelada'].includes(body?.estado) ? body.estado : 'activa',
    },
  }
}

export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const r = leerSub(await req.json().catch(() => null))
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const sub = await prisma.subscriptions.create({ data: { user_id: s.id, ...r.datos! } })
  return NextResponse.json({ suscripcion: serializar(sub) })
}

export async function PUT(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })

  const r = leerSub(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const existe = await prisma.subscriptions.findFirst({ where: { id, user_id: s.id }, select: { id: true } })
  if (!existe) return NextResponse.json({ error: { message: 'Recurrente no encontrado' } }, { status: 404 })

  const sub = await prisma.subscriptions.update({ where: { id }, data: r.datos! })
  return NextResponse.json({ suscripcion: serializar(sub) })
}
