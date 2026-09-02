import { exigirPerfil } from '@/app/lib/sesion-server'
import { datosDashboard } from '@/app/lib/dashboard-server'
import { totales } from '@/app/lib/finanzas'
import DashboardCliente from './DashboardCliente'

// Server Component: el mes actual, el mes anterior y la tasa se resuelven aquí,
// en paralelo, antes de mandar el HTML.
export default async function DashboardPage() {
  const { session, perfil } = await exigirPerfil()

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
