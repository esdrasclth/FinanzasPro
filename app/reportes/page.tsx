import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { datosReportes } from '../lib/reportes-server'
import ReportesCliente from './ReportesCliente'

// Server Component: los movimientos del periodo llegan ya filtrados y
// normalizados a la moneda principal.
export default async function ReportesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const { transacciones } = await datosReportes(session.id, 3)

  return (
    <ReportesCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      transaccionesIniciales={transacciones}
    />
  )
}
