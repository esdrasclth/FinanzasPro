import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { serializar } from '../api/suscripciones/route'
import SuscripcionesCliente from './SuscripcionesCliente'

// Server Component: la lista de recurrentes llega con el HTML.
export default async function SuscripcionesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const filas = await prisma.subscriptions.findMany({
    where: { user_id: session.id },
    orderBy: { created_at: 'desc' },
  })

  return (
    <SuscripcionesCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      suscripcionesIniciales={filas.map(serializar)}
    />
  )
}
