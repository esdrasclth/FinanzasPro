'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    // Este efecto corre tras la hidratación, que unas veces llega antes del
    // evento `load` y otras después. Si ya pasó, esperar por él dejaba la app
    // sin service worker: había que registrarlo aquí mismo.
    if (document.readyState === 'complete') {
      registrar()
      return
    }
    window.addEventListener('load', registrar)
    return () => window.removeEventListener('load', registrar)
  }, [])

  return null
}
