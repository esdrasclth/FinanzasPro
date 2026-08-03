import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { categoriasVisibles } from '../lib/categorias-server'
import CategoriasCliente from './CategoriasCliente'

// Server Component: las categorías llegan con el HTML.
export default async function CategoriasPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const filas = await prisma.categories.findMany({
    where: categoriasVisibles(session.id),
    orderBy: { nombre: 'asc' },
  })

  return (
    <CategoriasCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      // Las archivadas (subcategorías de deudas saldadas) se gestionan en Deudas.
      categoriasIniciales={filas
        .filter(c => !c.archivada)
        .map(c => ({ ...c, created_at: c.created_at.toISOString() }))}
    />
  )
}
