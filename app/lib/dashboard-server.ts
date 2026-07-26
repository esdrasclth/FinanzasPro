import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'

// Datos del primer render del dashboard, resueltos en el servidor.
//
// Antes la pantalla montaba vacía y luego encadenaba, desde el navegador:
// sesión -> perfil -> (AppLayout) sesión -> perfil -> tipo de cambio ->
// transacciones del mes -> transacciones del mes anterior. Siete viajes en
// serie antes de ver un dato.

const rangoMes = (offset: number) => {
  const base = new Date()
  base.setDate(1)
  base.setMonth(base.getMonth() + offset)
  const anio = base.getFullYear()
  const mes = base.getMonth()
  const dosDig = (n: number) => String(n).padStart(2, '0')
  const ultimo = new Date(anio, mes + 1, 0).getDate()
  return {
    inicio: `${anio}-${dosDig(mes + 1)}-01`,
    fin: `${anio}-${dosDig(mes + 1)}-${dosDig(ultimo)}`,
  }
}

const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)

// Se devuelven los campos con la misma forma que produce el cliente de datos
// (fecha como 'YYYY-MM-DD' y la categoría bajo `categories`) para que el
// componente de cliente no tenga que distinguir de dónde vinieron.
function serializar(t: any) {
  return {
    ...t,
    fecha: t.fecha.toISOString().slice(0, 10),
    created_at: t.created_at.toISOString(),
    categories: t.category
      ? { nombre: t.category.nombre, icono: t.category.icono, color: t.category.color }
      : null,
    category: undefined,
  }
}

export async function datosDashboard(userId: string, offset = 0) {
  const actual = rangoMes(offset)
  const previo = rangoMes(offset - 1)

  const [transacciones, previas, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: {
        user_id: userId,
        fecha: { gte: aFecha(actual.inicio), lte: aFecha(actual.fin) },
      },
      include: { category: { select: { nombre: true, icono: true, color: true } } },
      orderBy: { fecha: 'desc' },
    }),
    prisma.transactions.findMany({
      where: {
        user_id: userId,
        fecha: { gte: aFecha(previo.inicio), lte: aFecha(previo.fin) },
      },
      select: {
        monto: true, moneda: true, tasa_cambio: true, tipo: true,
        wallet_destino_id: true,
        category: { select: { nombre: true } },
      },
    }),
    tasaVigente(userId),
  ])

  return {
    transacciones: transacciones.map(serializar),
    previas: previas.map((t: any) => ({
      monto: t.monto,
      moneda: t.moneda,
      tasa_cambio: t.tasa_cambio,
      tipo: t.tipo,
      wallet_destino_id: t.wallet_destino_id,
      categories: t.category ? { nombre: t.category.nombre } : null,
    })),
    tasa,
  }
}
