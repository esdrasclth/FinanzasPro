'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) { router.push('/login'); return }

      const user = session.user

      let { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()

      if (!profile) {
        const nombre = user.user_metadata?.nombre ||
          user.email?.split('@')[0] || 'Usuario'
        await supabase.from('profiles')
          .insert({ id: user.id, nombre, moneda_default: 'HNL' })
        const { data: np } = await supabase
          .from('profiles').select('*').eq('id', user.id).single()
        profile = np
      }

      if (!profile) {
        const nombre = user.user_metadata?.nombre ||
          user.email?.split('@')[0] || 'Usuario'
        await supabase.from('profiles')
          .insert({ id: user.id, nombre, moneda_default: 'HNL', onboarding_completado: false })

        // Redirigir al onboarding
        router.push('/onboarding')
        return
      }

      // Si tiene perfil pero no completó el onboarding
      if (profile && !profile.onboarding_completado) {
        router.push('/onboarding')
        return
      }

      setUsuario(profile)
      setLoading(false)
    }
    checkUser()
  }, [router])

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
          <div className="max-w-[1728px] p-6 mx-auto space-y-6 lg:p-8">
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

  return (
    <div className="min-h-screen bg-mist">
      <Sidebar usuario={usuario} />
      {/* Contenido con margen para el sidebar en desktop */}
      <main className="pb-20 lg:ml-64 lg:pb-0">
        {children}
      </main>
    </div>
  )
}