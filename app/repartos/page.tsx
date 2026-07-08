'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/AppLayout'
import FormReparto from '../components/FormReparto'
import { SkeletonCard } from '../components/Skeleton'
import { formatoMoneda } from '../lib/dinero'

interface Reparto {
  id: string
  descripcion: string
  monto_total: number
  moneda: string
  fecha: string
  participantes: number
  pagados: number
  monto_pagado: number
}

export default function Repartos() {
  const router = useRouter()
  const [repartos, setRepartos] = useState<Reparto[]>([])
  const [monedaDefault, setMonedaDefault] = useState('HNL')
  const [loading, setLoading] = useState(true)
  const [showCrear, setShowCrear] = useState(false)

  const cargar = async () => {
    const res = await fetch('/api/repartos')
    if (res.status === 401) { router.push('/login'); return }
    const json = await res.json()
    setRepartos(json.repartos || [])
    setLoading(false)
  }

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('moneda_default').eq('id', user.id).single()
      if (profile?.moneda_default) setMonedaDefault(profile.moneda_default)
      cargar()
    }
    check()
  }, [router])

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] px-6 py-8 mx-auto space-y-6">
          <div className="w-56 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] px-5 py-6 mx-auto sm:px-6 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-xl font-bold text-obsidian sm:text-2xl">Repartos</h1>
          <p className="text-sm text-steel">Divide un gasto entre varias personas y controla quién ya pagó</p>
        </div>

        {repartos.length === 0 ? (
          <div className="p-8 text-center border bg-snow border-fog rounded-card sm:p-12">
            <span className="block mb-4 text-5xl">🧾</span>
            <p className="mb-2 text-steel">Aún no tienes repartos</p>
            <p className="mb-6 text-sm text-ash">Crea uno para dividir un gasto entre varias personas</p>
            <button onClick={() => setShowCrear(true)} className="px-5 py-2.5 rounded-full bg-obsidian text-snow font-medium shadow-pill hover:bg-graphite">
              Crear reparto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {repartos.map(r => {
              const pct = r.monto_total > 0 ? Math.round((r.monto_pagado / r.monto_total) * 100) : 0
              return (
                <button key={r.id} onClick={() => router.push(`/repartos/${r.id}`)}
                  className="p-4 text-left transition-all border bg-snow border-fog rounded-card hover:border-pebble active:scale-[0.99] sm:p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-ink">{r.descripcion}</p>
                      <p className="text-xs text-ash">
                        {r.participantes} {r.participantes === 1 ? 'persona' : 'personas'} · {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-obsidian">{formatoMoneda(r.monto_total, r.moneda)}</span>
                  </div>
                  <div className="w-full h-2 overflow-hidden rounded-full bg-mist">
                    <div className="h-full transition-all rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-steel">{pct}% pagado · {r.pagados}/{r.participantes} personas</p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button onClick={() => setShowCrear(true)}
        className="fixed flex items-center justify-center text-2xl transition-all rounded-full text-snow bg-obsidian hover:bg-graphite shadow-pill bottom-24 right-8 w-14 h-14 hover:scale-110">
        +
      </button>

      {showCrear && (
        <FormReparto monedaDefault={monedaDefault} onClose={() => setShowCrear(false)} onSuccess={(id) => router.push(`/repartos/${id}`)} />
      )}
    </AppLayout>
  )
}
