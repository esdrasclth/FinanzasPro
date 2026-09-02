import { exigirPerfil } from '@/app/lib/sesion-server'
import { datosPresupuesto } from '@/app/lib/presupuesto-server'
import { hoyUsuarioPartes } from '@/app/lib/fecha-server'
import PresupuestoCliente from './PresupuestoCliente'

// Server Component: presupuestos con lo gastado ya normalizado, gasto del mes
// anterior, categorías y metas. El traspaso automático del mes también corre
// aquí, en una transacción, en vez de con varias escrituras desde el navegador.
export default async function PresupuestoPage() {
  const { session } = await exigirPerfil()

  const { anio, mes } = await hoyUsuarioPartes()
  const { presupuestos, gastoPrev, categorias, metas } = await datosPresupuesto(
    session.id,
    mes,
    anio,
    true
  )

  return (
    <PresupuestoCliente
      presupuestosIniciales={presupuestos}
      gastoPrevInicial={gastoPrev}
      categoriasIniciales={categorias}
      metasIniciales={metas}
    />
  )
}
