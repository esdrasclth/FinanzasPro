import { cookies } from 'next/headers'
import {
  COOKIE_ZONA,
  ZONA_POR_DEFECTO,
  fechaEnZona,
  partesFecha,
  zonaValida,
  type PartesFecha,
} from './fecha'

// "Hoy" según el usuario, para Server Components y rutas de API.
//
// El servidor puede estar en UTC (Docker, Vercel) o en cualquier otra zona, así
// que su reloj no sirve para decidir en qué día o mes está el usuario. La zona
// la deja el navegador en una cookie (ZonaHoraria.tsx); mientras no llegue se
// usa ZONA_HORARIA o Tegucigalpa.

export async function zonaUsuario(): Promise<string> {
  const cookieStore = await cookies()
  const respaldo = zonaValida(process.env.ZONA_HORARIA)
  return zonaValida(cookieStore.get(COOKIE_ZONA)?.value, respaldo)
}

// Fecha de hoy como 'YYYY-MM-DD' en la zona del usuario.
export async function hoyUsuario(): Promise<string> {
  return fechaEnZona(await zonaUsuario())
}

export async function hoyUsuarioPartes(): Promise<PartesFecha> {
  return partesFecha(await hoyUsuario())
}

// Mes en curso ('YYYY-MM') para el usuario.
export async function mesUsuario(): Promise<string> {
  return (await hoyUsuario()).slice(0, 7)
}

// Medianoche del día de hoy del usuario, como Date, para comparar contra
// columnas de fecha sin hora (que se guardan a medianoche UTC).
export async function hoyUsuarioUTC(): Promise<Date> {
  return new Date(`${await hoyUsuario()}T00:00:00.000Z`)
}

export { ZONA_POR_DEFECTO }
