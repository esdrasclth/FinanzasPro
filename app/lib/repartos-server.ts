import { prisma } from './prisma'
import { getSessionUser } from './auth-server'
import { round2 } from './dinero'

export interface ParticipanteInput {
  nombre: string
  monto_asignado?: number
  es_yo?: boolean
}

export interface RepartoPreparado {
  descripcion: string
  lugar: string | null
  montoTotal: number
  moneda: string
  metodo: string
  fecha: Date
  walletId: string | null
  // Null = pagaste tú. Con nombre, pagó otra persona y no se toca tu dinero.
  pagadoPor: string | null
  metodoPago: string | null
  metodoDetalle: string | null
  participantes: { nombre: string; monto_asignado: number; es_yo: boolean }[]
}

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'otro']

type PrepOk = { ok: true; data: RepartoPreparado }
type PrepErr = { ok: false; status: number; error: string }

// Valida y calcula los montos de cada participante según el método.
export function prepararReparto(body: any): PrepOk | PrepErr {
  const descripcion = String(body?.descripcion || '').trim()
  const lugar = String(body?.lugar || '').trim() || null
  const montoTotal = round2(Number(body?.monto_total) || 0)
  const moneda = String(body?.moneda || 'HNL').trim().toUpperCase().slice(0, 3)
  const metodo = body?.metodo === 'manual' ? 'manual' : 'igual'
  const fechaStr = String(body?.fecha || '').slice(0, 10)
  const walletIdRaw = body?.wallet_id
  const walletId = typeof walletIdRaw === 'string' && walletIdRaw.trim() ? walletIdRaw.trim() : null
  const pagadoPor = String(body?.pagado_por || '').trim() || null
  const metodoPago = METODOS.includes(body?.metodo_pago) ? body.metodo_pago : null
  const metodoDetalle = String(body?.metodo_detalle || '').trim() || null

  if (!descripcion) return { ok: false, status: 400, error: 'La descripción es obligatoria' }
  if (montoTotal <= 0) return { ok: false, status: 400, error: 'Ingresa un monto válido' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return { ok: false, status: 400, error: 'Fecha inválida' }

  const entradas: ParticipanteInput[] = Array.isArray(body?.participantes) ? body.participantes : []
  const limpios = entradas
    .map(p => ({ nombre: String(p?.nombre || '').trim(), monto_asignado: Number(p?.monto_asignado) || 0, es_yo: !!p?.es_yo }))
    .filter(p => p.nombre.length > 0)

  if (limpios.length === 0) return { ok: false, status: 400, error: 'Agrega al menos un participante' }
  if (pagadoPor && !metodoPago) {
    return { ok: false, status: 400, error: 'Indica cómo pagó ' + pagadoPor }
  }

  // Solo un participante puede ser "yo".
  let yaHayYo = false
  for (const p of limpios) {
    if (p.es_yo && yaHayYo) p.es_yo = false
    if (p.es_yo) yaHayYo = true
  }

  let participantes: { nombre: string; monto_asignado: number; es_yo: boolean }[]

  if (metodo === 'igual') {
    const base = round2(montoTotal / limpios.length)
    participantes = limpios.map(p => ({ nombre: p.nombre, monto_asignado: base, es_yo: p.es_yo }))
    const suma = round2(base * limpios.length)
    const residuo = round2(montoTotal - suma)
    if (residuo !== 0) {
      const ultimo = participantes[participantes.length - 1]
      ultimo.monto_asignado = round2(ultimo.monto_asignado + residuo)
    }
  } else {
    participantes = limpios.map(p => ({ nombre: p.nombre, monto_asignado: round2(p.monto_asignado), es_yo: p.es_yo }))
    const suma = round2(participantes.reduce((s, p) => s + p.monto_asignado, 0))
    if (suma !== montoTotal) {
      return { ok: false, status: 400, error: `La suma de los montos (${suma}) no cuadra con el total (${montoTotal})` }
    }
  }

  return {
    ok: true,
    data: {
      descripcion, lugar, montoTotal, moneda, metodo, fecha: new Date(fechaStr),
      walletId, pagadoPor, metodoPago, metodoDetalle, participantes,
    },
  }
}

// Verifica que una cartera pertenezca al usuario. Devuelve id y moneda (la
// moneda hace falta para reflejar el reparto en la moneda de la cartera), o null.
export async function walletDeUsuario(
  userId: string,
  walletId: string | null | undefined
): Promise<{ id: string; moneda: string } | null> {
  if (!walletId) return null
  return prisma.wallets.findFirst({
    where: { id: walletId, user_id: userId },
    select: { id: true, moneda: true },
  })
}

type AuthOk = { ok: true; userId: string; reparto: { id: string; user_id: string } }
type AuthErr = { ok: false; status: number; message: string }

// Verifica sesión y que el reparto pertenezca al usuario.
export async function requireReparto(id: string): Promise<AuthOk | AuthErr> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401, message: 'No autenticado' }

  const reparto = await prisma.repartos.findUnique({ where: { id }, select: { id: true, user_id: true } })
  if (!reparto) return { ok: false, status: 404, message: 'Reparto no encontrado' }
  if (reparto.user_id !== user.id) return { ok: false, status: 403, message: 'No tienes acceso a este reparto' }

  return { ok: true, userId: user.id, reparto }
}
