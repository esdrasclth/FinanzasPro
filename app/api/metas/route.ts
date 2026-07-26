import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// GET  /api/metas        -> lista
// POST /api/metas        -> crea
// PUT  /api/metas        -> { id, ... } edita
//
// El objetivo no puede quedar por debajo de lo ya ahorrado: eso dejaría la meta
// en un estado imposible. Antes no se validaba en ninguna parte.

const aFecha = (s?: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`) : null)

function serializar(m: any) {
  return {
    ...m,
    fecha_limite: m.fecha_limite ? m.fecha_limite.toISOString().slice(0, 10) : null,
    created_at: m.created_at.toISOString(),
  }
}

function leer(body: any) {
  const nombre = String(body?.nombre || '').trim()
  const objetivo = Number(body?.monto_objetivo)
  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!(objetivo > 0)) return { error: 'El objetivo debe ser mayor a 0' }
  return {
    datos: {
      nombre,
      monto_objetivo: objetivo,
      icono: body?.icono || null,
      color: body?.color || null,
      fecha_limite: aFecha(body?.fecha_limite),
    },
  }
}

export async function GET() {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  const filas = await prisma.metas.findMany({ where: { user_id: s.id }, orderBy: { created_at: 'desc' } })
  return NextResponse.json({ metas: filas.map(serializar) })
}

export async function POST(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const r = leer(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const meta = await prisma.metas.create({ data: { user_id: s.id, ...r.datos! } })
  return NextResponse.json({ meta: serializar(meta) })
}

export async function PUT(req: Request) {
  const s = await getSessionUser()
  if (!s) return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: { message: 'Falta el identificador' } }, { status: 400 })

  const r = leer(body)
  if (r.error) return NextResponse.json({ error: { message: r.error } }, { status: 400 })

  const actual = await prisma.metas.findFirst({ where: { id, user_id: s.id } })
  if (!actual) return NextResponse.json({ error: { message: 'Meta no encontrada' } }, { status: 404 })

  if (r.datos!.monto_objetivo < Number(actual.monto_actual)) {
    return NextResponse.json(
      { error: { message: `El objetivo no puede ser menor a lo que ya llevas ahorrado (${Number(actual.monto_actual).toFixed(2)})` } },
      { status: 400 }
    )
  }

  const meta = await prisma.metas.update({
    where: { id },
    data: {
      ...r.datos!,
      completada: Number(actual.monto_actual) >= r.datos!.monto_objetivo,
    },
  })
  return NextResponse.json({ meta: serializar(meta) })
}
