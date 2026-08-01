// Utilidades de fecha en la zona horaria del usuario.
//
// `toISOString()` devuelve la fecha en UTC, no la del usuario: a las 6 de la
// tarde del 31 de julio en Honduras (UTC-6) en UTC ya es 1 de agosto, así que
// el mes en curso, el calendario y los avisos salían adelantados. Todo lo que
// signifique "hoy" se calcula contra una zona horaria explícita.

// Cookie donde el navegador deja su zona horaria para que el servidor la lea.
// No es httpOnly a propósito: la escribe el cliente.
export const COOKIE_ZONA = 'zona_horaria'

// Zona de respaldo mientras el navegador no ha informado la suya (y para el
// código que corre fuera de una petición). Se puede cambiar con ZONA_HORARIA.
export const ZONA_POR_DEFECTO = 'America/Tegucigalpa'

const formateadores = new Map<string, Intl.DateTimeFormat>()

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formateadores.set(zona, f)
  }
  return f
}

// Descarta zonas que este runtime no conoce (o cookies manipuladas) para que
// una zona inválida no tumbe el render.
export function zonaValida(zona: string | null | undefined, respaldo = ZONA_POR_DEFECTO): string {
  if (!zona) return respaldo
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zona })
    return zona
  } catch {
    return respaldo
  }
}

export interface PartesFecha {
  anio: number
  mes: number // 1-12
  dia: number
}

// 'YYYY-MM-DD' del instante dado visto desde `zona`.
export function fechaEnZona(zona: string, d: Date = new Date()): string {
  const partes = formateador(zona).formatToParts(d)
  const valor = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

export function partesFecha(iso: string): PartesFecha {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return { anio, mes, dia }
}

// Las columnas de fecha sin hora se guardan a medianoche UTC; esta es la única
// forma correcta de construirlas a partir de un 'YYYY-MM-DD'.
export function aFechaUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

// 'YYYY-MM-DD' de n días antes de la fecha dada. La resta va anclada a UTC
// para que no la desvíe el horario de verano de ninguna zona.
export function diasAntes(iso: string, n: number): string {
  return new Date(aFechaUTC(iso).getTime() - n * 86400000).toISOString().slice(0, 10)
}

// Una fecha 'YYYY-MM-DD' como Date al mediodía del reloj del proceso. Los
// cálculos de deudas y suscripciones construyen así todas sus fechas, y el
// mediodía evita que un ajuste de horas cambie el día. Sirve para pasarles la
// fecha del usuario desde el servidor sin que su reloj se meta de por medio.
export function aMediodiaLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

export function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

const dosDig = (n: number) => String(n).padStart(2, '0')

// Primer día ('YYYY-MM-DD') del mes que está `offset` meses de `iso`.
export function inicioMesDesplazado(iso: string, offset = 0): string {
  const { anio, mes } = partesFecha(iso)
  const d = new Date(Date.UTC(anio, mes - 1 + offset, 1))
  return `${d.getUTCFullYear()}-${dosDig(d.getUTCMonth() + 1)}-01`
}

// Último día ('YYYY-MM-DD') del mes que está `offset` meses de `iso`.
export function finMesDesplazado(iso: string, offset = 0): string {
  const inicio = inicioMesDesplazado(iso, offset)
  const { anio, mes } = partesFecha(inicio)
  return `${inicio.slice(0, 7)}-${dosDig(ultimoDiaMes(anio, mes))}`
}

// Zona horaria que reporta el navegador. Solo tiene sentido en el cliente.
export function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ZONA_POR_DEFECTO
  } catch {
    return ZONA_POR_DEFECTO
  }
}

// Devuelve la fecha de hoy como 'YYYY-MM-DD' según la zona horaria local.
// Para usar desde el navegador; en el servidor va `hoyUsuario()` de
// fecha-server.ts, que sí sabe en qué zona está el usuario.
export function fechaHoyLocal(): string {
  return fechaEnZona(zonaDelNavegador())
}
