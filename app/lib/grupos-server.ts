import { prisma } from './prisma'
import { getSessionUser, SessionUser } from './auth-server'

export interface GrupoContext {
  user: SessionUser
  miembro: { id: string; grupo_id: string; user_id: string; rol: string }
}

// Valida sesión + que el usuario sea miembro activo del grupo.
// Devuelve el contexto o un código de error para que la ruta responda.
export async function requireMiembro(
  grupoId: string
): Promise<{ ok: true; ctx: GrupoContext } | { ok: false; status: number; message: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401, message: 'No autenticado' }

  const miembro = await prisma.grupo_miembros.findFirst({
    where: { grupo_id: grupoId, user_id: user.id, estado: 'activo' },
  })
  if (!miembro) return { ok: false, status: 403, message: 'No perteneces a este grupo' }

  return { ok: true, ctx: { user, miembro } }
}

// Devuelve id -> { nombre, email } para un conjunto de usuarios.
export async function nombresDeUsuarios(userIds: string[]): Promise<Record<string, { nombre: string; email: string }>> {
  const unicos = [...new Set(userIds)].filter(Boolean)
  if (unicos.length === 0) return {}
  const users = await prisma.users.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true, email: true },
  })
  const map: Record<string, { nombre: string; email: string }> = {}
  for (const u of users) {
    map[u.id] = { nombre: u.nombre || u.email.split('@')[0], email: u.email }
  }
  return map
}

// Genera un código de invitación corto y legible (sin caracteres ambiguos).
export function generarCodigoInvitacion(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return out
}

// Genera un código único (reintenta si colisiona con otro grupo).
export async function generarCodigoUnico(): Promise<string> {
  let codigo = generarCodigoInvitacion()
  for (let i = 0; i < 5; i++) {
    const existe = await prisma.grupos.findUnique({ where: { codigo_invitacion: codigo } })
    if (!existe) break
    codigo = generarCodigoInvitacion()
  }
  return codigo
}
