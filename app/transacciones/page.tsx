import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { datosMesTransacciones } from '../lib/transacciones-mes-server'
import { mesUsuario } from '../lib/fecha-server'
import TransaccionesCliente from './TransaccionesCliente'

// Server Component: los movimientos del mes, las categorías, las carteras y la
// tasa se resuelven en paralelo antes de mandar el HTML.
export default async function TransaccionesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const mes = await mesUsuario()
  const { transacciones, categorias, carteras, tasa } = await datosMesTransacciones(session.id, mes)

  return (
    <TransaccionesCliente
      usuario={{
        id: perfil.id,
        nombre: perfil.nombre,
        moneda_default: perfil.moneda_default,
        onboarding_completado: perfil.onboarding_completado,
      }}
      mesInicial={mes}
      transaccionesIniciales={transacciones}
      categoriasIniciales={categorias}
      carterasIniciales={carteras}
      tasaInicial={tasa}
    />
  )
}
