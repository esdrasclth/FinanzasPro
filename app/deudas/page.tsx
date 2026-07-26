import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { serializarDeuda } from '../api/deudas/route'
import DeudasCliente from './DeudasCliente'

// Server Component: las deudas llegan con el HTML.
export default async function DeudasPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const filas = await prisma.debts.findMany({
    where: { user_id: session.id },
    orderBy: [{ completada: 'asc' }, { created_at: 'desc' }],
  })

  return (
    <DeudasCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      deudasIniciales={filas.map(serializarDeuda)}
    />
  )
}
