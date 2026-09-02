import { exigirPerfil } from '@/app/lib/sesion-server'
import { prisma } from '@/app/lib/prisma'
import { serializar } from '@/app/api/suscripciones/route'
import SuscripcionesCliente from './SuscripcionesCliente'

// Server Component: la lista de recurrentes llega con el HTML.
export default async function SuscripcionesPage() {
  const { session } = await exigirPerfil()

  const filas = await prisma.subscriptions.findMany({
    where: { user_id: session.id },
    orderBy: { created_at: 'desc' },
  })

  return (
    <SuscripcionesCliente
      suscripcionesIniciales={filas.map(serializar)}
    />
  )
}
