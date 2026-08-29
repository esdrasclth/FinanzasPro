'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import { MonedaProvider } from '../lib/moneda-context'
import { RefreshCw, WifiOff } from 'lucide-react'

// `usuario` llega ya resuelto desde las páginas que son Server Components; en
// ese caso no hay nada que pedir y la pantalla pinta de una vez. Las páginas que
// siguen siendo de cliente lo omiten y se cae al camino de abajo.
export default function AppLayout({
  children,
  usuario: usuarioInicial,
}: {
  children: React.ReactNode
  usuario?: any
}) {
  const [usuario, setUsuario] = useState<any>(usuarioInicial ?? null)
  const [loading, setLoading] = useState(!usuarioInicial)
  const [error, setError] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (usuarioInicial) return

    const checkUser = async () => {
      // El proxy ya bloquea las rutas sin sesión; esto solo cubre que caduque
      // con la pestaña abierta, o que falte completar el onboarding.
      const res = await fetch('/api/perfil')
      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) { setError(true); setLoading(false); return }
      const { perfil } = await res.json()
      if (!perfil || !perfil.onboarding_completado) { router.push('/onboarding'); return }
      setUsuario(perfil)
      setLoading(false)
      setError(false)
    }

    checkUser().catch(() => {
      setError(true)
      setLoading(false)
    })
  }, [router, usuarioInicial])

  if (loading) {
    return (
      <div className="min-h-screen bg-mist">
        <div className="fixed top-0 left-0 hidden w-64 min-h-screen border-r bg-snow border-fog lg:block animate-pulse">
          <div className="p-6 border-b border-fog">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-fog rounded-xl" />
              <div className="space-y-2">
                <div className="w-16 h-3 rounded bg-fog" />
                <div className="w-24 h-2 rounded bg-fog" />
              </div>
            </div>
          </div>
          <div className="p-4 mx-3 mt-4 bg-mist rounded-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-fog" />
              <div className="space-y-2">
                <div className="w-24 h-3 rounded bg-fog" />
                <div className="w-16 h-2 rounded bg-fog" />
              </div>
            </div>
          </div>
          <div className="p-4 mt-2 space-y-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-10 bg-fog rounded-full" />
            ))}
          </div>
        </div>
        <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0">
          <div className="max-w-[1728px] p-4 mx-auto space-y-6 sm:p-6 lg:p-8">
            <div className="w-48 h-8 rounded bg-fog animate-pulse" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-6 border bg-snow border-fog rounded-card animate-pulse">
                  <div className="w-2/3 h-3 mb-4 rounded bg-fog" />
                  <div className="w-1/2 h-8 rounded bg-fog" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-mist">
        <div className="w-full max-w-md p-8 text-center border shadow-soft bg-snow border-fog rounded-card" role="alert">
          <WifiOff size={32} className="mx-auto mb-4 text-steel" aria-hidden="true" />
          <h1 className="mb-2 text-lg font-semibold text-obsidian">No pudimos cargar tu sesión</h1>
          <p className="mb-5 text-sm text-steel">Revisa tu conexión e inténtalo de nuevo.</p>
          <button type="button" onClick={() => { setError(false); setLoading(true); window.location.reload() }} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full bg-obsidian text-snow hover:bg-graphite">
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <MonedaProvider moneda={usuario?.moneda_default}>
      <div className="min-h-screen bg-mist">
        <Sidebar usuario={usuario} />
        {/* Contenido con margen para el sidebar en desktop */}
        <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0">
          {children}
        </main>
      </div>
    </MonedaProvider>
  )
}
