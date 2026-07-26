import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { carterasConSaldo, carterasArchivadas } from '../lib/carteras-server'
import CarterasCliente from './CarterasCliente'

// Server Component: la pantalla llega al navegador con los saldos ya
// calculados. Antes era un componente de cliente que, tras montarse, pedía la
// sesión, el perfil y luego una consulta por cada cartera.
export default async function CarterasPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil) redirect('/onboarding')
  if (!perfil.onboarding_completado) redirect('/onboarding')

  const [carteras, archivadas] = await Promise.all([
    carterasConSaldo(session.id),
    carterasArchivadas(session.id),
  ])

  return (
    <CarterasCliente
      carterasIniciales={carteras}
      archivadasIniciales={archivadas}
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
    />
  )
}
