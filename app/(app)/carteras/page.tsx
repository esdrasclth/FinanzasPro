import { exigirPerfil } from '@/app/lib/sesion-server'
import { carterasConSaldo, carterasArchivadas } from '@/app/lib/carteras-server'
import CarterasCliente from './CarterasCliente'

// Server Component: la pantalla llega al navegador con los saldos ya
// calculados. Antes era un componente de cliente que, tras montarse, pedía la
// sesión, el perfil y luego una consulta por cada cartera.
export default async function CarterasPage() {
  const { session } = await exigirPerfil()

  const [carteras, archivadas] = await Promise.all([
    carterasConSaldo(session.id),
    carterasArchivadas(session.id),
  ])

  return (
    <CarterasCliente
      carterasIniciales={carteras}
      archivadasIniciales={archivadas}
    />
  )
}
