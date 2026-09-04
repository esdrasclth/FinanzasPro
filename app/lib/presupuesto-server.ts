import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'
import { conHijasAcumuladas, porCategoria } from './finanzas'
import { categoriasVisibles } from './categorias-server'
import { round2 } from './dinero'

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
    // `tipo` hace falta para que porCategoria() reconozca un reembolso: un
    // ingreso con categoría de gasto resta dentro de esa categoría.
    category: { select: { nombre: true, tipo: true } },
  }

  const [transMes, transPrev, categorias, metas, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: { user_id: userId, fecha: { gte: act.inicio, lte: act.fin } },
      select: seleccion,
    }),
    prisma.transactions.findMany({
      // Sin filtrar a `tipo: 'gasto'`: los reembolsos son ingresos y tienen que
      // entrar para restar. Filtrarlos dejaba el mes anterior en bruto y la
      // comparación contra el actual medía dos cosas distintas.
      where: { user_id: userId, fecha: { gte: prev.inicio, lte: prev.fin } },
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
  const directoPorCat = porCategoria(transMes.map(conForma), moneda, tasa)
  const directoPrev = porCategoria(transPrev.map(conForma), moneda, tasa).gasto

  // El gasto se etiqueta en la subcategoría, así que un presupuesto puesto en
  // la categoría padre tiene que sumar lo de sus hijas o se queda en cero.
  const movPorCat = {
    gasto: conHijasAcumuladas(directoPorCat.gasto || {}, categorias),
    ingreso: conHijasAcumuladas(directoPorCat.ingreso || {}, categorias),
  }
  // El mes anterior se acumula igual: si no, la comparación enfrentaría el
  // gasto del grupo contra el de una sola categoría.
  const prevPorCat = conHijasAcumuladas(directoPrev, categorias)

  // El límite de una categoría padre es la suma de las partidas de sus hijas.
  // Se calcula al leer en vez de guardarse: si se guardara, cada alta, edición
  // o baja de una hija tendría que reescribir al padre, y basta con que una se
  // escape para que el grupo muestre una cifra que ya no cuadra.
  //
  // El padre conserva su propio monto por si algún día se queda sin hijas con
  // partida; mientras las tenga, manda la suma.
  const sumaHijas: Record<string, number> = {}
  for (const b of budgets as any[]) {
    const padre = b.category?.parent_id
    if (!padre) continue
    sumaHijas[padre] = round2((sumaHijas[padre] || 0) + Number(b.monto_limite))
  }

  const presupuestos = budgets.map((b: any) => {
    const tipo = b.category?.tipo || 'gasto'
    const gastado = (movPorCat[tipo as 'gasto' | 'ingreso'] || {})[b.category_id] || 0
    const calculado = sumaHijas[b.category_id]
    const limite = calculado ?? Number(b.monto_limite)
    // `gastado` puede quedar negativo: si los reembolsos de un mes superan al
    // gasto —cobras en septiembre lo que pagaste en agosto— la categoría queda
    // en verde. El importe se deja tal cual porque es cierto y vale verlo, pero
    // la barra se acota a [0, 100]: un ancho negativo no se puede pintar.
    const porcentaje = limite > 0
      ? Math.min(Math.max((gastado / limite) * 100, 0), 100)
      : 0
    return {
      ...b,
      monto_limite: limite,
      // La pantalla lo usa para explicar la cifra y bloquear su edición.
      calculado: calculado !== undefined,
      created_at: b.created_at.toISOString(),
      // La pantalla espera la relación bajo `categories` y el año como `año`.
      categories: b.category,
      año: b.anio,
      category: undefined,
      gastado,
      porcentaje,
    }
  })

  // Dónde se está yendo el dinero que nadie presupuestó.
  //
  // La pantalla se construía solo con los presupuestos existentes, así que el
  // gasto en una categoría sin partida no aparecía por ningún lado: ni en la
  // lista, ni en las alertas, ni en la distribución. No había forma de
  // preguntarle a la app en qué se fue lo que no tenías controlado.
  //
  // Se señala la categoría CONCRETA donde cayó el gasto, no su padre: es la que
  // hay que presupuestar y la que responde "¿en qué exactamente?". Se omite la
  // que ya tiene partida propia y la que cuelga de un padre que la tiene,
  // porque con la acumulación de arriba ese gasto ya está contado.
  const conPresupuesto = new Set(budgets.map((b: any) => b.category_id))
  const catPorId = new Map(categorias.map(c => [c.id, c]))

  const sinPresupuesto = (['gasto', 'ingreso'] as const).flatMap(tipo =>
    Object.entries(directoPorCat[tipo] || {})
      .filter(([catId, monto]) => {
        if (!(Number(monto) > 0)) return false
        if (conPresupuesto.has(catId)) return false
        const cat = catPorId.get(catId)
        if (!cat) return false
        return !(cat.parent_id && conPresupuesto.has(cat.parent_id))
      })
      .map(([catId, monto]) => {
        const cat = catPorId.get(catId)!
        return {
          category_id: catId,
          nombre: cat.nombre,
          icono: cat.icono,
          color: cat.color,
          tipo: cat.tipo,
          parent_id: cat.parent_id,
          parent_nombre: cat.parent_id ? catPorId.get(cat.parent_id)?.nombre ?? null : null,
          gastado: round2(Number(monto)),
        }
      })
  ).sort((a, b) => b.gastado - a.gastado)

  return {
    presupuestos,
    sinPresupuesto,
    gastoPrev: prevPorCat,
    categorias,
    metas: metas.map(m => ({
      ...m,
      monto_objetivo: Number(m.monto_objetivo),
      monto_actual: Number(m.monto_actual),
      fecha_limite: m.fecha_limite ? m.fecha_limite.toISOString().slice(0, 10) : null,
      created_at: m.created_at.toISOString(),
    })),
  }
}
