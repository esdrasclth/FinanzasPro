import { exigirPerfil } from '@/app/lib/sesion-server'
import { prisma } from '@/app/lib/prisma'
import { categoriasVisibles } from '@/app/lib/categorias-server'
import CategoriasCliente from './CategoriasCliente'

// Server Component: las categorías llegan con el HTML.
export default async function CategoriasPage() {
  const { session } = await exigirPerfil()

  const filas = await prisma.categories.findMany({
    where: categoriasVisibles(session.id),
    orderBy: { nombre: 'asc' },
  })

  return (
    <CategoriasCliente
      // Las archivadas (subcategorías de deudas saldadas) se gestionan en Deudas.
      categoriasIniciales={filas
        .filter(c => !c.archivada)
        .map(c => ({ ...c, created_at: c.created_at.toISOString() }))}
    />
  )
}
