import { prisma } from './prisma'
import { convertir, parSoportado } from './tipoCambio'
import { round2 } from './dinero'
import { hoyUsuarioUTC } from './fecha-server'

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
  const hoy = await hoyUsuarioUTC()

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

export type ConversionResultado =
  | { ok: true; valor: MontoEnCartera }
  | { ok: false; mensaje: string }

// Se lanza dentro de las transacciones, donde no se puede devolver un 400 a
// medias. Quien abre la transacción la convierte en respuesta.
export class ErrorDeConversion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeConversion'
  }
}

// Expresa un monto de un grupo o reparto en la moneda de la cartera donde se
// refleja. El dinero sale (o entra) en la moneda de la cartera, no en la del
// grupo, así que se convierte y se deja constancia del monto original.
//
// Antes los gastos y liquidaciones de grupo se guardaban sin `moneda`, es decir
// como lempiras, aunque el grupo llevara la cuenta en dólares.
//
// Sin tasa NO se inventa nada. Antes se registraba en la moneda de origen para
// no mentir sobre el monto, pero eso dejaba dólares dentro de carteras en
// lempiras: la cartera acababa con un saldo en una moneda que no es la suya y
// nadie se enteraba. Las transferencias y los aportes a metas ya avisaban en
// ese caso; aquí se hace lo mismo. El usuario puede fijar una tasa manual y
// repetir la operación, así que no queda nada bloqueado de forma permanente.
export function montoParaCartera(
  monto: number,
  monedaGrupo: string | null | undefined,
  monedaCartera: string | null | undefined,
  tasa: number | null
): ConversionResultado {
  const origen = monedaGrupo || 'HNL'
  const destino = monedaCartera || 'HNL'

  if (origen === destino) {
    return {
      ok: true,
      valor: { monto: round2(monto), moneda: destino, monto_original: null, tasa_cambio: tasa },
    }
  }

  // La app solo sabe convertir entre lempiras y dólares.
  if (!parSoportado(origen, destino)) {
    return {
      ok: false,
      mensaje:
        `No se puede convertir de ${origen} a ${destino}: la app solo maneja el cambio entre ` +
        `lempiras y dólares. Usa una cartera en ${origen} para reflejar este monto.`,
    }
  }

  if (!tasa || tasa <= 0) {
    return {
      ok: false,
      mensaje:
        `No hay tasa de cambio para pasar de ${origen} a ${destino}, así que el monto no se puede ` +
        `reflejar en esa cartera. Actualiza el tipo de cambio o fija uno manual y vuelve a intentarlo.`,
    }
  }

  return {
    ok: true,
    valor: {
      monto: convertir(monto, origen, destino, tasa),
      moneda: destino,
      monto_original: round2(monto),
      tasa_cambio: tasa,
    },
  }
}

// Igual que la anterior, para usar dentro de una transacción ya abierta.
export function exigirMontoParaCartera(
  monto: number,
  monedaGrupo: string | null | undefined,
  monedaCartera: string | null | undefined,
  tasa: number | null
): MontoEnCartera {
  const r = montoParaCartera(monto, monedaGrupo, monedaCartera, tasa)
  if (!r.ok) throw new ErrorDeConversion(r.mensaje)
  return r.valor
}
