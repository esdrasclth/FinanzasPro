import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { requireMiembro, nombresDeUsuarios } from '../../../../lib/grupos-server'
import { round2 } from '../../../../lib/dinero'

// GET /api/grupos/[id]/saldos?mes=&anio=
// Calcula el saldo neto de cada miembro y sugiere pagos para saldar.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const url = new URL(req.url)
  const mes = url.searchParams.get('mes')
  const anio = url.searchParams.get('anio')
  const filtroFecha = {
    ...(mes ? { mes: Number(mes) } : {}),
    ...(anio ? { anio: Number(anio) } : {}),
  }

  const gastos = await prisma.gastos_compartidos.findMany({
    where: { grupo_id: id, ...filtroFecha },
    include: { pagos: true, divisiones: true },
  })

  // Liquidaciones del mismo periodo (si se filtra por mes/anio).
  const liquidaciones = await prisma.liquidaciones.findMany({
    where: {
      grupo_id: id,
      ...(mes && anio
        ? {
            fecha: {
              gte: new Date(Date.UTC(Number(anio), Number(mes) - 1, 1)),
              lt: new Date(Date.UTC(Number(anio), Number(mes), 1)),
            },
          }
        : {}),
    },
  })

  const net: Record<string, number> = {}
  const pagado: Record<string, number> = {}
  const tocaba: Record<string, number> = {}
  const add = (obj: Record<string, number>, k: string, v: number) => {
    obj[k] = round2((obj[k] || 0) + v)
  }

  for (const g of gastos) {
    for (const p of g.pagos) {
      add(net, p.user_id, p.monto)
      add(pagado, p.user_id, p.monto)
    }
    for (const d of g.divisiones) {
      add(net, d.user_id, -d.monto_asignado)
      add(tocaba, d.user_id, d.monto_asignado)
    }
  }
  for (const l of liquidaciones) {
    add(net, l.de_user_id, l.monto) // el que pagó reduce su deuda
    add(net, l.a_user_id, -l.monto) // el que cobró reduce lo que le deben
  }

  const miembros = await prisma.grupo_miembros.findMany({
    where: { grupo_id: id, estado: 'activo' },
    orderBy: { created_at: 'asc' },
  })
  const nombres = await nombresDeUsuarios(miembros.map(m => m.user_id))

  const saldos = miembros.map(m => ({
    user_id: m.user_id,
    nombre: nombres[m.user_id]?.nombre || 'Usuario',
    pagado: round2(pagado[m.user_id] || 0),
    tocaba: round2(tocaba[m.user_id] || 0),
    neto: round2(net[m.user_id] || 0), // >0 le deben, <0 debe
  }))

  // Sugerencia de pagos (greedy): deudores pagan a acreedores.
  const deudores = saldos.filter(s => s.neto < -0.005).map(s => ({ ...s, resto: -s.neto }))
  const acreedores = saldos.filter(s => s.neto > 0.005).map(s => ({ ...s, resto: s.neto }))
  const sugerencias: { de_user_id: string; de_nombre: string; a_user_id: string; a_nombre: string; monto: number }[] = []
  let i = 0
  let j = 0
  while (i < deudores.length && j < acreedores.length) {
    const monto = round2(Math.min(deudores[i].resto, acreedores[j].resto))
    if (monto > 0.005) {
      sugerencias.push({
        de_user_id: deudores[i].user_id,
        de_nombre: deudores[i].nombre,
        a_user_id: acreedores[j].user_id,
        a_nombre: acreedores[j].nombre,
        monto,
      })
    }
    deudores[i].resto = round2(deudores[i].resto - monto)
    acreedores[j].resto = round2(acreedores[j].resto - monto)
    if (deudores[i].resto <= 0.005) i++
    if (acreedores[j].resto <= 0.005) j++
  }

  const totalGrupo = round2(gastos.reduce((s, g) => s + g.monto_total, 0))

  return NextResponse.json({ yo: auth.ctx.user.id, moneda: undefined, totalGrupo, saldos, sugerencias })
}
