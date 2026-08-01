import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { aFechaUTC, finMesDesplazado, inicioMesDesplazado } from '../lib/fecha'
import { hoyUsuario } from '../lib/fecha-server'
import ExportarCliente from './ExportarCliente'

// Server Component: el mes en curso y las categorías llegan con el HTML.
export default async function ExportarPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const hoy = await hoyUsuario()
  const mes = hoy.slice(0, 7)

  const [filas, categorias] = await Promise.all([
    prisma.transactions.findMany({
      where: {
        user_id: session.id,
        fecha: {
          gte: aFechaUTC(inicioMesDesplazado(hoy)),
          lte: aFechaUTC(finMesDesplazado(hoy)),
        },
      },
      include: {
        category: { select: { nombre: true } },
        wallet: { select: { nombre: true } },
      },
      orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
    }),
    prisma.categories.findMany({
      where: { OR: [{ user_id: session.id }, { es_sistema: true }] },
      orderBy: { nombre: 'asc' },
    }),
  ])

  return (
    <ExportarCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      mesInicial={mes}
      transaccionesIniciales={filas.map((t: any) => ({
        ...t,
        fecha: t.fecha.toISOString().slice(0, 10),
        created_at: t.created_at.toISOString(),
        categories: t.category,
        wallets: t.wallet,
        category: undefined,
        wallet: undefined,
      }))}
      categoriasIniciales={categorias.map(c => ({ ...c, created_at: c.created_at.toISOString() }))}
    />
  )
}
