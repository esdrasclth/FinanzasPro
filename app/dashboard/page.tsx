import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { datosDashboard } from '../lib/dashboard-server'
import { totales } from '../lib/finanzas'
import DashboardCliente from './DashboardCliente'

// Server Component: el mes actual, el mes anterior y la tasa se resuelven aquí,
// en paralelo, antes de mandar el HTML.
export default async function DashboardPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const { transacciones, previas, tasa } = await datosDashboard(session.id)
  const moneda = perfil.moneda_default || 'HNL'

  return (
    <DashboardCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: moneda,
        onboarding_completado: perfil.onboarding_completado,
      }}
      transaccionesIniciales={transacciones}
      resumenInicial={totales(transacciones, moneda, tasa)}
      resumenPrevInicial={totales(previas, moneda, tasa)}
      tasaInicial={tasa}
    />
  )
}
