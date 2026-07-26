import { prisma } from './prisma'
import { tasaVigente } from './tipoCambio-server'
import { soloMovimientosReales, montoNormalizado } from './finanzas'

// Datos de Reportes resueltos en el servidor.
//
// La pantalla se traía todas las transacciones del periodo al navegador para
// filtrarlas y normalizarlas ahí. Ahora llegan ya filtradas y con el monto en
// la moneda principal.

export interface MovimientoReporte {
  fecha: string
  tipo: string
  monto: number
  categories: { nombre: string | null; icono: string | null; color: string | null } | null
}

export async function datosReportes(
  userId: string,
  meses: number
): Promise<{ transacciones: MovimientoReporte[]; moneda: string }> {
  const perfil = await prisma.profiles.findUnique({ where: { id: userId } })
  const moneda = perfil?.moneda_default || 'HNL'

  const inicio = new Date()
  inicio.setMonth(inicio.getMonth() - meses)
  inicio.setDate(1)
  const desde = new Date(`${inicio.toISOString().slice(0, 10)}T00:00:00.000Z`)

  const [filas, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: { user_id: userId, fecha: { gte: desde } },
      select: {
        fecha: true, tipo: true, monto: true, moneda: true,
        tasa_cambio: true, wallet_destino_id: true,
        category: { select: { nombre: true, icono: true, color: true } },
      },
      orderBy: { fecha: 'asc' },
    }),
    tasaVigente(userId),
  ])

  const conForma = filas.map((t: any) => ({
    ...t,
    categories: t.category,
  }))

  // Descarta transferencias y aperturas, y lleva cada monto a la moneda principal.
  const transacciones = soloMovimientosReales(conForma).map((t: any) => ({
    fecha: t.fecha.toISOString().slice(0, 10),
    tipo: t.tipo,
    monto: montoNormalizado(t, moneda, tasa),
    categories: t.categories,
  }))

  return { transacciones, moneda }
}
