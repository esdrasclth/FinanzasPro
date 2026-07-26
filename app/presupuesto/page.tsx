import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { datosPresupuesto } from '../lib/presupuesto-server'
import PresupuestoCliente from './PresupuestoCliente'

// Server Component: presupuestos con lo gastado ya normalizado, gasto del mes
// anterior, categorías y metas. El traspaso automático del mes también corre
// aquí, en una transacción, en vez de con varias escrituras desde el navegador.
export default async function PresupuestoPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const hoy = new Date()
  const { presupuestos, gastoPrev, categorias, metas } = await datosPresupuesto(
    session.id,
    hoy.getMonth() + 1,
    hoy.getFullYear(),
    true
  )

  return (
    <PresupuestoCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      presupuestosIniciales={presupuestos}
      gastoPrevInicial={gastoPrev}
      categoriasIniciales={categorias}
      metasIniciales={metas}
    />
  )
}
