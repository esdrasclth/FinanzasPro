import { redirect } from 'next/navigation'
import { getSessionUser } from '../lib/auth-server'
import { prisma } from '../lib/prisma'
import { datosMesTransacciones } from '../lib/transacciones-mes-server'
import TransaccionesCliente from './TransaccionesCliente'

const dosDig = (n: number) => String(n).padStart(2, '0')

// Server Component: los movimientos del mes, las categorías, las carteras y la
// tasa se resuelven en paralelo antes de mandar el HTML.
export default async function TransaccionesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const perfil = await prisma.profiles.findUnique({ where: { id: session.id } })
  if (!perfil || !perfil.onboarding_completado) redirect('/onboarding')

  const hoy = new Date()
  const mes = `${hoy.getFullYear()}-${dosDig(hoy.getMonth() + 1)}`
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
