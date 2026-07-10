// Utilidades de fecha en la zona horaria local del usuario.

// Devuelve la fecha de hoy como 'YYYY-MM-DD' según la zona horaria local,
// evitando el desfase de toISOString() que usa UTC.
export function fechaHoyLocal(): string {
  const d = new Date()
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().split('T')[0]
}
