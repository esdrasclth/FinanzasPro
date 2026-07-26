import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

// GET /api/perfil  -> perfil y conteos
// PUT /api/perfil  -> { nombre, moneda_default }
//
// Los conteos eran cinco consultas separadas desde el navegador; ahora salen
// en paralelo desde el servidor.

const MONEDAS = new Set(['HNL', 'USD', 'EUR', 'MXN', 'GTQ', 'CRC'])

async function conteos(userId: string) {
  const [transacciones, carteras, categorias, presupuestos, deudas] = await Promise.all([
    prisma.transactions.count({ where: { user_id: userId } }),
    prisma.wallets.count({ where: { user_id: userId, activo: true } }),
    prisma.categories.count({ where: { user_id: userId } }),
    prisma.budgets.count({ where: { user_id: userId } }),
    prisma.debts.count({ where: { user_id: userId } }),
  ])
  return { transacciones, carteras, categorias, presupuestos, deudas }
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const [perfil, stats] = await Promise.all([
    prisma.profiles.findUnique({ where: { id: session.id } }),
    conteos(session.id),
  ])

  return NextResponse.json({
    perfil: perfil ? { ...perfil, created_at: perfil.created_at.toISOString() } : null,
    stats,
  })
}

export async function PUT(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const nombre = String(body?.nombre || '').trim()
  const moneda = String(body?.moneda_default || 'HNL')

  if (!nombre) {
    return NextResponse.json({ error: { message: 'El nombre es obligatorio' } }, { status: 400 })
  }
  if (!MONEDAS.has(moneda)) {
    return NextResponse.json({ error: { message: 'Moneda no soportada' } }, { status: 400 })
  }

  const perfil = await prisma.profiles.upsert({
    where: { id: session.id },
    update: { nombre, moneda_default: moneda },
    create: { id: session.id, nombre, moneda_default: moneda, onboarding_completado: true },
  })

  return NextResponse.json({ perfil: { ...perfil, created_at: perfil.created_at.toISOString() } })
}

export { conteos }
