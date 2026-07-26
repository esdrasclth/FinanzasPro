import { prisma } from './prisma'
import { convertir } from './tipoCambio'
import { round2 } from './dinero'

// Tasa HNL por 1 USD vigente, leída desde el servidor.
//
// Se usa para sellar `transactions.tasa_cambio` al crear movimientos en las
// rutas de API, de modo que el histórico se pueda normalizar después con la
// tasa que realmente estaba vigente y no con la de hoy.
//
// Lee la caché de exchange_rates que /api/tipo-cambio mantiene al día contra el
// BCH. No consulta al BCH por su cuenta: sellar una transacción no debe quedar
// bloqueado por un servicio externo. Si no hay ninguna tasa conocida devuelve
// null y el movimiento se guarda sin sellar (el cálculo caerá al respaldo).

const ORIGEN = 'USD'
const DESTINO = 'HNL'

// `userId` permite respetar el override manual de ese usuario; sin él solo se
// consideran las tasas globales del BCH.
export async function tasaVigente(userId?: string | null): Promise<number | null> {
  const hoy = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)

  // La tasa manual propia del día tiene prioridad sobre la del BCH.
  if (userId) {
    const manual = await prisma.exchange_rates.findFirst({
      where: {
        moneda_origen: ORIGEN, moneda_destino: DESTINO,
        fecha: hoy, fuente: 'manual', user_id: userId,
      },
    })
    if (manual) return Number(manual.tasa) || null
  }

  const global = await prisma.exchange_rates.findFirst({
    where: {
      moneda_origen: ORIGEN, moneda_destino: DESTINO,
      fecha: hoy, fuente: 'BCH', user_id: null,
    },
  })
  if (global) return Number(global.tasa) || null

  const ultima = await prisma.exchange_rates.findFirst({
    where: {
      moneda_origen: ORIGEN,
      moneda_destino: DESTINO,
      OR: [...(userId ? [{ user_id: userId }] : []), { user_id: null, fuente: 'BCH' }],
    },
    orderBy: { fecha: 'desc' },
  })
  return ultima ? Number(ultima.tasa) || null : null
}

export interface MontoEnCartera {
  monto: number
  moneda: string
  monto_original: number | null
  tasa_cambio: number | null
}

// Expresa un monto de un grupo o reparto en la moneda de la cartera donde se
// refleja. El dinero sale (o entra) en la moneda de la cartera, no en la del
// grupo, así que se convierte y se deja constancia del monto original.
//
// Antes los gastos y liquidaciones de grupo se guardaban sin `moneda`, es decir
// como lempiras, aunque el grupo llevara la cuenta en dólares.
export function montoParaCartera(
  monto: number,
  monedaGrupo: string | null | undefined,
  monedaCartera: string | null | undefined,
  tasa: number | null
): MontoEnCartera {
  const origen = monedaGrupo || 'HNL'
  const destino = monedaCartera || 'HNL'

  if (origen === destino) {
    return { monto: round2(monto), moneda: destino, monto_original: null, tasa_cambio: tasa }
  }

  // Sin tasa no se puede convertir: se registra en la moneda de origen antes
  // que mentir sobre en qué moneda está el movimiento.
  if (!tasa || tasa <= 0) {
    return { monto: round2(monto), moneda: origen, monto_original: null, tasa_cambio: null }
  }

  return {
    monto: convertir(monto, origen, destino, tasa),
    moneda: destino,
    monto_original: round2(monto),
    tasa_cambio: tasa,
  }
}
