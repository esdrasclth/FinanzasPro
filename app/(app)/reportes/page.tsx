import { exigirPerfil } from '@/app/lib/sesion-server'
import { datosReportes, rangoPorDefecto } from '@/app/lib/reportes-server'
import ReportesCliente from './ReportesCliente'

// Server Component: los movimientos del periodo llegan ya filtrados,
// normalizados a la moneda principal y con los totales del periodo anterior.
export default async function ReportesPage() {
  const { session } = await exigirPerfil()

  const datos = await datosReportes(session.id, await rangoPorDefecto())

  return (
    <ReportesCliente
      datosIniciales={datos}
    />
  )
}
