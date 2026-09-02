import { exigirPerfil } from '@/app/lib/sesion-server'
import { prisma } from '@/app/lib/prisma'
import { aFechaUTC, finMesDesplazado, inicioMesDesplazado } from '@/app/lib/fecha'
import { hoyUsuario } from '@/app/lib/fecha-server'
import { tasaVigente } from '@/app/lib/tipoCambio-server'
import { categoriasVisibles } from '@/app/lib/categorias-server'
import { serializarMovimiento } from '@/app/lib/transacciones-mes-server'
import ExportarCliente from './ExportarCliente'

// Server Component: el mes en curso, las categorías, las carteras y la tasa
// llegan con el HTML. La tasa hace falta para expresar en la moneda principal
// los movimientos registrados en otra.
export default async function ExportarPage() {
  const { session, perfil } = await exigirPerfil()

  const hoy = await hoyUsuario()
  const desde = inicioMesDesplazado(hoy)
  const hasta = finMesDesplazado(hoy)

  const rango = {
    user_id: session.id,
    fecha: { gte: aFechaUTC(desde), lte: aFechaUTC(hasta) },
  }

  const [filas, total, categorias, carteras, tasa] = await Promise.all([
    prisma.transactions.findMany({
      where: rango,
      include: {
        category: { select: { nombre: true } },
        wallet: { select: { nombre: true } },
      },
      orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
      take: 500,
    }),
    // Para avisar cuando el periodo trae más de lo que cabe en el reporte.
    prisma.transactions.count({ where: rango }),
    prisma.categories.findMany({
      where: categoriasVisibles(session.id),
      orderBy: { nombre: 'asc' },
    }),
    // También las archivadas: los movimientos viejos siguen apuntando a ellas.
    prisma.wallets.findMany({
      where: { user_id: session.id },
      select: { id: true, nombre: true, activo: true },
      orderBy: { nombre: 'asc' },
    }),
    tasaVigente(session.id),
  ])

  return (
    <ExportarCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      desdeInicial={desde}
      hastaInicial={hasta}
      tasa={tasa}
      totalInicial={total}
      transaccionesIniciales={filas.map(serializarMovimiento)}
      categoriasIniciales={categorias.map(c => ({ ...c, created_at: c.created_at.toISOString() }))}
      carterasIniciales={carteras}
    />
  )
}
