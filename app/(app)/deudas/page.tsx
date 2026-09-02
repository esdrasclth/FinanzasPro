import { exigirPerfil } from '@/app/lib/sesion-server'
import { prisma } from '@/app/lib/prisma'
import { serializarDeuda } from '@/app/api/deudas/route'
import DeudasCliente from './DeudasCliente'

// Server Component: las deudas llegan con el HTML.
export default async function DeudasPage() {
  const { session } = await exigirPerfil()

  const filas = await prisma.debts.findMany({
    where: { user_id: session.id },
    orderBy: [{ completada: 'asc' }, { created_at: 'desc' }],
  })

  return (
    <DeudasCliente
      deudasIniciales={filas.map(serializarDeuda)}
    />
  )
}
