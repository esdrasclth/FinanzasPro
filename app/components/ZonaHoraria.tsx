'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { COOKIE_ZONA, zonaDelNavegador } from '../lib/fecha'

// Deja la zona horaria del navegador en una cookie para que el servidor sepa
// en qué día está el usuario (ver app/lib/fecha-server.ts). Si el HTML ya se
// pintó con la zona de respaldo y no era la correcta, se rehace.
export default function ZonaHoraria() {
  const router = useRouter()

  useEffect(() => {
    const zona = zonaDelNavegador()
    if (!zona) return

    const guardada = document.cookie
      .split('; ')
      .find(c => c.startsWith(`${COOKIE_ZONA}=`))
      ?.slice(COOKIE_ZONA.length + 1)

    if (guardada && decodeURIComponent(guardada) === zona) return

    // Un año: la zona solo cambia si el usuario viaja.
    document.cookie = `${COOKIE_ZONA}=${encodeURIComponent(zona)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }, [router])

  return null
}
