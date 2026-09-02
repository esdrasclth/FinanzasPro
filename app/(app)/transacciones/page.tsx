import { exigirPerfil } from '@/app/lib/sesion-server'
import { datosMesTransacciones } from '@/app/lib/transacciones-mes-server'
import { mesUsuario } from '@/app/lib/fecha-server'
import TransaccionesCliente from './TransaccionesCliente'

// Server Component: los movimientos del mes, las categorías, las carteras y la
// tasa se resuelven en paralelo antes de mandar el HTML.
export default async function TransaccionesPage() {
  const { session } = await exigirPerfil()

  const mes = await mesUsuario()
  const { transacciones, categorias, carteras, tasa } = await datosMesTransacciones(session.id, mes)

  return (
    <TransaccionesCliente
      mesInicial={mes}
      transaccionesIniciales={transacciones}
      categoriasIniciales={categorias}
      carterasIniciales={carteras}
      tasaInicial={tasa}
    />
  )
}
