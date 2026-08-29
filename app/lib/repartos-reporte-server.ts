import { prisma } from './prisma'
import { round2 } from './dinero'

// Liquidación de varios repartos en un rango de fechas.
//
// Es el cálculo que el usuario hace a mano al cerrar la quincena: junta los
// gastos del periodo, suma lo que puso cada quien, reparte lo que le toca a
// cada uno y saca quién le debe a quién.
//
// Los participantes son nombres libres (no cuentas), así que se agrupan
// normalizando el nombre: "oscar" y "Oscar " son la misma persona.

const clave = (n: string) => n.trim().toLowerCase()

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
}

export interface LineaGasto {
  fecha: string
  descripcion: string
  lugar: string
  monto: number
  moneda: string
  pagadoPor: string
  metodo: string
  reparto: 'Partes iguales' | 'Montos distintos'
  participantes: { nombre: string; monto: number; pagado: boolean }[]
}

export interface SaldoPersona {
  nombre: string
  puso: number      // lo que adelantó pagando gastos
  leToca: number    // la suma de sus partes
  neto: number      // puso - leToca. Positivo: le deben. Negativo: debe.
}

export interface Traspaso {
  de: string
  a: string
  monto: number
}

export interface ReporteLiquidacion {
  desde: string
  hasta: string
  // Encabezado del documento. En un periodo es el rango; en un reparto suelto,
  // su concepto.
  titulo: string
  moneda: string
  gastos: LineaGasto[]
  total: number
  saldos: SaldoPersona[]
  traspasos: Traspaso[]
  yo: string
}

const aFecha = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`)

// Liquidación de un periodo completo.
export async function reporteLiquidacion(
  userId: string,
  desde: string,
  hasta: string
): Promise<ReporteLiquidacion> {
  const repartos = await prisma.repartos.findMany({
    where: { user_id: userId, fecha: { gte: aFecha(desde), lte: aFecha(hasta) } },
    include: { participantes: { orderBy: { orden: 'asc' } } },
    orderBy: { fecha: 'asc' },
  })
  return calcular(userId, repartos, desde, hasta, null)
}

// Liquidación de un solo reparto, para compartir ese gasto suelto sin esperar
// al cierre del periodo. Devuelve null si no es del usuario.
export async function reporteDeReparto(
  userId: string,
  repartoId: string
): Promise<ReporteLiquidacion | null> {
  const r = await prisma.repartos.findFirst({
    where: { id: repartoId, user_id: userId },
    include: { participantes: { orderBy: { orden: 'asc' } } },
  })
  if (!r) return null

  const fecha = r.fecha.toISOString().slice(0, 10)
  return calcular(userId, [r], fecha, fecha, r.descripcion)
}

async function calcular(
  userId: string,
  repartos: any[],
  desde: string,
  hasta: string,
  titulo: string | null
): Promise<ReporteLiquidacion> {
  const perfil = await prisma.profiles.findUnique({ where: { id: userId } })
  const yo = perfil?.nombre || 'Yo'

  // Nombre visible de cada persona: se conserva la primera forma con la que
  // aparece escrita, para no mostrar todo en minúsculas.
  const visible = new Map<string, string>()
  const puso = new Map<string, number>()
  const leToca = new Map<string, number>()

  const registrar = (mapa: Map<string, number>, nombre: string, monto: number) => {
    const k = clave(nombre)
    if (!visible.has(k)) visible.set(k, nombre.trim())
    mapa.set(k, round2((mapa.get(k) || 0) + monto))
  }

  const gastos: LineaGasto[] = repartos.map((r: any) => {
    // Si no se registró pagador, lo pusiste tú.
    const pagador = r.pagado_por?.trim() || yo

    registrar(puso, pagador, Number(r.monto_total))
    for (const p of r.participantes) registrar(leToca, p.nombre, Number(p.monto_asignado))

    const metodo = r.pagado_por
      ? [METODOS[r.metodo_pago || ''] || 'Sin especificar', r.metodo_detalle].filter(Boolean).join(' · ')
      : 'Pagado por mí'

    return {
      fecha: r.fecha.toISOString().slice(0, 10),
      descripcion: r.descripcion,
      lugar: r.lugar?.trim() || '',
      monto: round2(Number(r.monto_total)),
      moneda: r.moneda,
      pagadoPor: pagador,
      metodo,
      reparto: r.metodo === 'manual' ? 'Montos distintos' : 'Partes iguales',
      participantes: r.participantes.map((p: any) => ({
        nombre: p.nombre,
        monto: round2(Number(p.monto_asignado)),
        pagado: p.pagado,
      })),
    }
  })

  const nombres = new Set<string>([...puso.keys(), ...leToca.keys()])
  const saldos: SaldoPersona[] = [...nombres]
    .map(k => {
      const p = puso.get(k) || 0
      const t = leToca.get(k) || 0
      return { nombre: visible.get(k) || k, puso: round2(p), leToca: round2(t), neto: round2(p - t) }
    })
    .sort((a, b) => b.neto - a.neto)

  return {
    desde,
    hasta,
    titulo: titulo || '',
    // Todos los repartos del periodo deberían compartir moneda; si no, se toma
    // la del primero y se indica en el documento.
    moneda: repartos[0]?.moneda || perfil?.moneda_default || 'HNL',
    gastos,
    total: round2(gastos.reduce((s, g) => s + g.monto, 0)),
    saldos,
    traspasos: calcularTraspasos(saldos),
    yo,
  }
}

// Quién le paga a quién para saldar el periodo, con el mínimo de traspasos:
// se van cruzando el que más debe con el que más le deben.
function calcularTraspasos(saldos: SaldoPersona[]): Traspaso[] {
  const deben = saldos.filter(s => s.neto < -0.005).map(s => ({ ...s, resto: -s.neto }))
  const acreedores = saldos.filter(s => s.neto > 0.005).map(s => ({ ...s, resto: s.neto }))

  const traspasos: Traspaso[] = []
  let i = 0
  let j = 0
  // El bucle avanza siempre porque cada vuelta agota a uno de los dos lados.
  while (i < deben.length && j < acreedores.length) {
    const monto = round2(Math.min(deben[i].resto, acreedores[j].resto))
    if (monto > 0.005) {
      traspasos.push({ de: deben[i].nombre, a: acreedores[j].nombre, monto })
    }
    deben[i].resto = round2(deben[i].resto - monto)
    acreedores[j].resto = round2(acreedores[j].resto - monto)
    if (deben[i].resto <= 0.005) i++
    if (acreedores[j].resto <= 0.005) j++
  }

  return traspasos
}
