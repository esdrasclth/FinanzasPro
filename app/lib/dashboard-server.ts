import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'
import { aFechaUTC, finMesDesplazado, inicioMesDesplazado } from './fecha'
import { hoyUsuario } from './fecha-server'

// Datos del primer render del dashboard, resueltos en el servidor.
//
// Antes la pantalla montaba vacía y luego encadenaba, desde el navegador:
// sesión -> perfil -> (AppLayout) sesión -> perfil -> tipo de cambio ->
// transacciones del mes -> transacciones del mes anterior. Siete viajes en
// serie antes de ver un dato.

// `hoy` es la fecha del usuario ('YYYY-MM-DD'), no la del reloj del servidor:
// en UTC el mes cambia horas antes y el dashboard saltaba de mes.
const rangoMes = (hoy: string, offset: number) => ({
  inicio: inicioMesDesplazado(hoy, offset),
  fin: finMesDesplazado(hoy, offset),
})

// Se devuelven los campos con la misma forma que produce el cliente de datos
// (fecha como 'YYYY-MM-DD' y la categoría bajo `categories`) para que el
// componente de cliente no tenga que distinguir de dónde vinieron.
function serializar(t: any) {
  return {
    ...t,
    monto: Number(t.monto),
    monto_original: t.monto_original === null ? null : Number(t.monto_original),
    tasa_cambio: t.tasa_cambio === null ? null : Number(t.tasa_cambio),
    fecha: t.fecha.toISOString().slice(0, 10),
    created_at: t.created_at.toISOString(),
    categories: t.category
      ? { nombre: t.category.nombre, icono: t.category.icono, color: t.category.color }
      : null,
    category: undefined,
  }
}

export async function datosDashboard(userId: string, offset = 0) {
  const hoy = await hoyUsuario()
  const actual = rangoMes(hoy, offset)
  const previo = rangoMes(hoy, offset - 1)

  const [transacciones, previas, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: {
        user_id: userId,
        fecha: { gte: aFechaUTC(actual.inicio), lte: aFechaUTC(actual.fin) },
      },
      include: { category: { select: { nombre: true, icono: true, color: true } } },
      orderBy: { fecha: 'desc' },
    }),
    prisma.transactions.findMany({
      where: {
        user_id: userId,
        fecha: { gte: aFechaUTC(previo.inicio), lte: aFechaUTC(previo.fin) },
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
      monto: Number(t.monto),
      moneda: t.moneda,
      tasa_cambio: t.tasa_cambio === null ? null : Number(t.tasa_cambio),
      tipo: t.tipo,
      wallet_destino_id: t.wallet_destino_id,
      categories: t.category ? { nombre: t.category.nombre } : null,
    })),
    tasa,
  }
}
