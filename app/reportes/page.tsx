import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { datosReportes, rangoPorDefecto } from '../lib/reportes-server'
import ReportesCliente from './ReportesCliente'

// Server Component: los movimientos del periodo llegan ya filtrados,
// normalizados a la moneda principal y con los totales del periodo anterior.
export default async function ReportesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const datos = await datosReportes(session.id, await rangoPorDefecto())

  return (
    <ReportesCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      datosIniciales={datos}
    />
  )
}
