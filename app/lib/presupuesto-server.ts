import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'
import { porCategoria } from './finanzas'
import { categoriasVisibles } from './categorias-server'

// Datos de Presupuesto resueltos en el servidor: los presupuestos del mes con
// lo gastado (ya normalizado a la moneda principal), el gasto del mes anterior
// para detectar aumentos, el catálogo de categorías y las metas.
//
// El traspaso automático de presupuestos también vive aquí: antes se hacía con
// varias escrituras encadenadas desde el navegador.

const dosDig = (n: number) => String(n).padStart(2, '0')
const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)

const rango = (anio: number, mes: number) => {
  const ultimo = new Date(anio, mes, 0).getDate()
  return {
    inicio: aFecha(`${anio}-${dosDig(mes)}-01`),
    fin: aFecha(`${anio}-${dosDig(mes)}-${dosDig(ultimo)}`),
  }
}

// Hereda los presupuestos del mes más reciente que tenga alguno. Mirar solo el
// mes anterior hacía que saltarse un mes rompiera la cadena de forma permanente.
async function traspasar(userId: string, mes: number, anio: number): Promise<boolean> {
  const previos = await prisma.budgets.findMany({
    where: { user_id: userId },
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    select: { category_id: true, monto_limite: true, mes: true, anio: true },
  })

  const actual = anio * 12 + mes
  const origen = previos.find(b => b.anio * 12 + b.mes < actual)
  if (!origen) return false

  const aCopiar = previos.filter(b => b.anio === origen.anio && b.mes === origen.mes)
  if (aCopiar.length === 0) return false

  // No se traspasan subcategorías archivadas (deudas ya saldadas).
  const archivadas = await prisma.categories.findMany({
    where: { archivada: true, ...categoriasVisibles(userId) },
    select: { id: true },
  })
  const ids = new Set(archivadas.map(c => c.id))
  const nuevos = aCopiar.filter(b => !ids.has(b.category_id))
  if (nuevos.length === 0) return false

  await prisma.$transaction(async (tx) => {
    await tx.budgets.createMany({
      data: nuevos.map(b => ({
        user_id: userId,
        category_id: b.category_id,
        monto_limite: b.monto_limite,
        mes,
        anio,
      })),
      skipDuplicates: true,
    })
    // La marca solo se escribe si de verdad se copió algo.
    await tx.budget_rollovers.create({ data: { user_id: userId, mes, anio } })
  })

  return true
}

export async function datosPresupuesto(userId: string, mes: number, anio: number, esMesActual: boolean) {
  const perfil = await prisma.profiles.findUnique({ where: { id: userId } })
  const moneda = perfil?.moneda_default || 'HNL'

  const traerBudgets = () =>
    prisma.budgets.findMany({
      where: { user_id: userId, mes, anio },
      include: { category: { select: { nombre: true, icono: true, color: true, tipo: true, parent_id: true } } },
    })

  let budgets = await traerBudgets()

  if (esMesActual && budgets.length === 0) {
    const marca = await prisma.budget_rollovers.findFirst({ where: { user_id: userId, mes, anio } })
    if (!marca && (await traspasar(userId, mes, anio))) {
      budgets = await traerBudgets()
    }
  }

  const act = rango(anio, mes)
  const prevMes = mes === 1 ? 12 : mes - 1
  const prevAnio = mes === 1 ? anio - 1 : anio
  const prev = rango(prevAnio, prevMes)

  const seleccion = {
    monto: true, moneda: true, tasa_cambio: true, tipo: true,
    category_id: true, wallet_destino_id: true,
    category: { select: { nombre: true } },
  }

  const [transMes, transPrev, categorias, metas, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: { user_id: userId, fecha: { gte: act.inicio, lte: act.fin } },
      select: seleccion,
    }),
    prisma.transactions.findMany({
      where: { user_id: userId, tipo: 'gasto', fecha: { gte: prev.inicio, lte: prev.fin } },
      select: seleccion,
    }),
    prisma.categories.findMany({
      where: categoriasVisibles(userId),
      select: { id: true, nombre: true, icono: true, color: true, tipo: true, parent_id: true },
    }),
    prisma.metas.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } }),
    tasaVigente(userId),
  ])

  const conForma = (t: any) => ({ ...t, categories: t.category })
  const movPorCat = porCategoria(transMes.map(conForma), moneda, tasa)
  const prevPorCat = porCategoria(transPrev.map(conForma), moneda, tasa).gasto

  const presupuestos = budgets.map((b: any) => {
    const tipo = b.category?.tipo || 'gasto'
    const gastado = (movPorCat[tipo] || {})[b.category_id] || 0
    const porcentaje = b.monto_limite > 0 ? Math.min((gastado / b.monto_limite) * 100, 100) : 0
    return {
      ...b,
      created_at: b.created_at.toISOString(),
      // La pantalla espera la relación bajo `categories` y el año como `año`.
      categories: b.category,
      año: b.anio,
      category: undefined,
      gastado,
      porcentaje,
    }
  })

  return {
    presupuestos,
    gastoPrev: prevPorCat,
    categorias,
    metas: metas.map(m => ({
      ...m,
      fecha_limite: m.fecha_limite ? m.fecha_limite.toISOString().slice(0, 10) : null,
      created_at: m.created_at.toISOString(),
    })),
  }
}
