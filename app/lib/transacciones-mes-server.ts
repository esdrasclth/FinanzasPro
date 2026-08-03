import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'
import { categoriasVisibles } from './categorias-server'

// Todo lo que la pantalla de Movimientos necesita de un mes, en una sola
// resolución: los movimientos con su categoría y cartera, el catálogo de
// categorías, las carteras activas y la tasa vigente.
//
// Antes eran cuatro consultas encadenadas desde el navegador después de montar
// la pantalla.

const dosDig = (n: number) => String(n).padStart(2, '0')
const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)

export function rangoDeMes(mes: string) {
  const anio = parseInt(mes.slice(0, 4))
  const m = parseInt(mes.slice(5, 7))
  const ultimo = new Date(anio, m, 0).getDate()
  return { inicio: `${mes}-01`, fin: `${mes}-${dosDig(ultimo)}` }
}

// Misma forma que devolvía el cliente de datos, para que la pantalla no tenga
// que distinguir de dónde vinieron las filas.
export function serializarMovimiento(t: any) {
  return {
    ...t,
    fecha: t.fecha.toISOString().slice(0, 10),
    created_at: t.created_at.toISOString(),
    categories: t.category ?? null,
    wallets: t.wallet ?? null,
    category: undefined,
    wallet: undefined,
  }
}

export async function datosMesTransacciones(userId: string, mes: string) {
  const { inicio, fin } = rangoDeMes(mes)

  const [movimientos, categorias, carteras, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: { user_id: userId, fecha: { gte: aFecha(inicio), lte: aFecha(fin) } },
      include: {
        category: { select: { nombre: true, icono: true, color: true } },
        wallet: { select: { nombre: true, color: true, tipo: true } },
      },
      orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
    }),
    prisma.categories.findMany({
      where: categoriasVisibles(userId),
      orderBy: { nombre: 'asc' },
    }),
    prisma.wallets.findMany({
      where: { user_id: userId, activo: true },
      select: { id: true, nombre: true, color: true, tipo: true },
      orderBy: { posicion: 'asc' },
    }),
    tasaVigente(userId),
  ])

  return {
    transacciones: movimientos.map(serializarMovimiento),
    categorias: categorias.map(c => ({ ...c, created_at: c.created_at.toISOString() })),
    carteras,
    tasa,
  }
}
