import { cache } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifyToken, type SessionUser } from './auth-token'
import { prisma } from './prisma'

// Sesión + perfil del usuario en un solo viaje a la base, y una sola vez por
// petición.
//
// Antes cada pantalla resolvía esto por su cuenta y en serie: getSessionUser()
// consultaba `users` para validar la versión del token y, ya con la sesión en
// mano, la página consultaba `profiles`. Dos idas y vueltas encadenadas antes
// de empezar siquiera a pedir los datos de la pantalla. Con la base en otra
// región eso se nota en cada navegación.
//
// `profiles` cuelga de `users` por una relación 1:1, así que ambos salen en la
// misma consulta. Y `cache()` de React deduplica dentro del mismo render, que
// es lo que permite que el layout y la página lo pidan las dos sin pagarlo dos
// veces.

export type PerfilUsuario = {
  id: string
  nombre: string
  moneda_default: string
  onboarding_completado: boolean
}

export type SesionConPerfil = {
  session: SessionUser
  perfil: PerfilUsuario
}

export const sesionConPerfil = cache(async (): Promise<SesionConPerfil | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await verifyToken(token)
  if (!session) return null

  // El JWT sigue siendo autocontenido para que el proxy pueda validarlo en el
  // runtime Edge, pero la versión se comprueba contra la base: cambiar la
  // contraseña o eliminar la cuenta revoca de inmediato las sesiones previas.
  const user = await prisma.users.findUnique({
    where: { id: session.id },
    select: {
      session_version: true,
      deleted_at: true,
      profile: {
        select: {
          id: true,
          nombre: true,
          moneda_default: true,
          onboarding_completado: true,
        },
      },
    },
  })

  if (!user || user.deleted_at || user.session_version !== session.session_version) return null
  if (!user.profile) return null

  return { session, perfil: user.profile }
})

// Lo que usan las pantallas de dentro de (app): si no hay sesión válida o falta
// el onboarding, corta aquí. El destino es el mismo al que ya redirigía cada
// página por separado.
export const exigirPerfil = cache(async (): Promise<SesionConPerfil> => {
  const datos = await sesionConPerfil()
  if (!datos) redirect('/login')
  if (!datos.perfil.onboarding_completado) redirect('/onboarding')
  return datos
})
