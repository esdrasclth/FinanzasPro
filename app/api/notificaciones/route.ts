import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'
import { tasaVigente } from '../../lib/tipoCambio-server'
import { porCategoria } from '../../lib/finanzas'
import { simboloMoneda, round2 } from '../../lib/dinero'
import { aFechaUTC, finMesDesplazado, inicioMesDesplazado, partesFecha, ultimoDiaMes } from '../../lib/fecha'
import { hoyUsuario } from '../../lib/fecha-server'

// Avisos de la campana, calculados en el servidor.
//
// Antes vivían en el cliente y lanzaban una consulta POR PRESUPUESTO; además
// comparaban montos sin convertir la moneda y no se podían descartar.

export interface Aviso {
  id: string
  clave: string
  periodo: string
  tipo: 'advertencia' | 'peligro'
  titulo: string
  mensaje: string
  href: string
}

const fmt = (n: number, moneda: string) =>
  `${simboloMoneda(moneda)} ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  const moneda = perfil?.moneda_default || 'HNL'

  const hoyISO = await hoyUsuario()
  const { anio, mes } = partesFecha(hoyISO)
  const periodoMes = hoyISO.slice(0, 7)
  const inicioMes = inicioMesDesplazado(hoyISO)
  const finMes = finMesDesplazado(hoyISO)

  const [budgets, descartes, deudas, tarjetas, tasa] = await Promise.all([
    prisma.budgets.findMany({
      where: { user_id: session.id, mes, anio },
      include: { category: { select: { nombre: true, icono: true } } },
    }),
    prisma.notificaciones_descartadas.findMany({
      where: { user_id: session.id },
      select: { clave: true, periodo: true },
    }),
    prisma.debts.findMany({
      where: { user_id: session.id, completada: false, fecha_limite: { lt: aFechaUTC(hoyISO) } },
    }),
    prisma.wallets.findMany({
      where: { user_id: session.id, tipo: 'credito', activo: true },
    }),
    tasaVigente(session.id),
  ])

  const avisos: Aviso[] = []

  if (budgets.length > 0) {
    const transMes = await prisma.transactions.findMany({
      where: {
        user_id: session.id,
        fecha: { gte: aFechaUTC(inicioMes), lte: aFechaUTC(finMes) },
      },
      select: {
        monto: true, moneda: true, tasa_cambio: true, tipo: true,
        category_id: true, wallet_destino_id: true,
        category: { select: { nombre: true } },
      },
    })

    const normalizadas = transMes.map((t: any) => ({
      ...t,
      categories: t.category ? { nombre: t.category.nombre } : null,
    }))
    const gastoPorCat = porCategoria(normalizadas, moneda, tasa).gasto

    for (const b of budgets) {
      // Se comparan importes en centavos, no porcentajes: gastar justo el
      // presupuesto no es sobrepasarlo, y así ningún residuo de coma flotante
      // decide de qué lado del límite cae el aviso.
      const gastado = round2(gastoPorCat[b.category_id] || 0)
      const limite = round2(Number(b.monto_limite))
      const pct = limite > 0 ? (gastado / limite) * 100 : 0
      const icono = b.category?.icono || '📦'
      const nombre = b.category?.nombre || 'Categoría'

      if (gastado > limite) {
        avisos.push({
          id: b.id,
          clave: `presupuesto:${b.id}:sobrepasado`,
          periodo: periodoMes,
          tipo: 'peligro',
          titulo: `${icono} Presupuesto sobrepasado`,
          mensaje: `${nombre}: gastaste ${fmt(gastado, moneda)} de ${fmt(limite, moneda)}`,
          href: '/presupuesto',
        })
      } else if (limite > 0 && gastado === limite) {
        avisos.push({
          id: b.id,
          clave: `presupuesto:${b.id}:al-limite`,
          periodo: periodoMes,
          tipo: 'advertencia',
          titulo: `${icono} Presupuesto al límite`,
          mensaje: `${nombre}: gastaste los ${fmt(limite, moneda)} del presupuesto`,
          href: '/presupuesto',
        })
      } else if (pct >= 80) {
        avisos.push({
          id: b.id,
          clave: `presupuesto:${b.id}:aviso`,
          periodo: periodoMes,
          tipo: 'advertencia',
          titulo: `${icono} Presupuesto al ${Math.round(pct)}%`,
          mensaje: `${nombre}: te quedan ${fmt(limite - gastado, moneda)}`,
          href: '/presupuesto',
        })
      }
    }
  }

  for (const d of deudas) {
    const venc = d.fecha_limite ? d.fecha_limite.toISOString().slice(0, 10) : ''
    avisos.push({
      id: 'deuda-' + d.id,
      clave: `deuda:${d.id}`,
      // El descarte dura mientras no cambie la fecha de vencimiento.
      periodo: venc,
      tipo: 'peligro',
      titulo: '🤝 Deuda vencida',
      mensaje: `${d.nombre}: venció el ${new Date(venc + 'T12:00:00').toLocaleDateString('es-HN')}`,
      href: '/deudas',
    })
  }

  const diaHoy = partesFecha(hoyISO).dia
  const diasEnMes = ultimoDiaMes(anio, mes)
  for (const t of tarjetas) {
    if (!t.fecha_pago) continue
    let dias = t.fecha_pago - diaHoy
    if (dias < 0) dias = diasEnMes - diaHoy + t.fecha_pago
    if (dias > 5) continue

    avisos.push({
      id: 'tarjeta-' + t.id,
      clave: `tarjeta:${t.id}`,
      periodo: periodoMes,
      tipo: dias <= 2 ? 'peligro' : 'advertencia',
      titulo: `💳 Pago próximo — ${t.nombre}`,
      mensaje: dias === 0
        ? '¡Hoy es tu fecha de pago!'
        : `Faltan ${dias} días para tu fecha de pago (día ${t.fecha_pago})`,
      href: '/carteras',
    })
  }

  const ocultos = new Set(descartes.map(d => `${d.clave}@${d.periodo}`))
  const visibles = avisos.filter(a => !ocultos.has(`${a.clave}@${a.periodo}`))

  return NextResponse.json({ avisos: visibles, descartados: avisos.length - visibles.length })
}

// POST /api/notificaciones  { clave, periodo }  -> descarta un aviso
// DELETE /api/notificaciones                    -> vuelve a mostrarlos todos
export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const clave = String(body?.clave || '').trim()
  const periodo = String(body?.periodo || '').trim()
  if (!clave || !periodo) {
    return NextResponse.json({ error: { message: 'Aviso inválido' } }, { status: 400 })
  }

  await prisma.notificaciones_descartadas.upsert({
    where: { user_id_clave_periodo: { user_id: session.id, clave, periodo } },
    update: {},
    create: { user_id: session.id, clave, periodo },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }
  await prisma.notificaciones_descartadas.deleteMany({ where: { user_id: session.id } })
  return NextResponse.json({ ok: true })
}
