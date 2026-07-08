'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import AppLayout from '../../components/AppLayout'
import FormReparto from '../../components/FormReparto'
import { formatoMoneda } from '../../lib/dinero'

interface Participante {
  id: string
  nombre: string
  monto_asignado: number
  pagado: boolean
  fecha_pago: string | null
}
interface Reparto {
  id: string
  descripcion: string
  monto_total: number
  moneda: string
  metodo: string
  fecha: string
  monto_pagado: number
  participantes: Participante[]
}

export default function RepartoDetalle() {
  const router = useRouter()
  const params = useParams()
  const repartoId = params.id as string

  const [reparto, setReparto] = useState<Reparto | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditar, setShowEditar] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/repartos/${repartoId}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.status === 403 || res.status === 404) { router.push('/repartos'); return }
    const json = await res.json()
    setReparto(json.reparto)
    setLoading(false)
  }, [repartoId, router])

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargar()
    }
    check()
  }, [router, cargar])

  const togglePago = async (p: Participante) => {
    // Optimista: refleja el cambio de inmediato.
    setReparto(prev => prev && {
      ...prev,
      participantes: prev.participantes.map(x => x.id === p.id ? { ...x, pagado: !x.pagado } : x),
      monto_pagado: Math.round((prev.monto_pagado + (p.pagado ? -p.monto_asignado : p.monto_asignado) + Number.EPSILON) * 100) / 100,
    })
    await fetch(`/api/repartos/${repartoId}/participantes/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: !p.pagado }),
    })
    cargar()
  }

  const eliminar = async () => {
    if (!confirm(`¿Eliminar el reparto "${reparto?.descripcion}"?`)) return
    const res = await fetch(`/api/repartos/${repartoId}`, { method: 'DELETE' })
    if (res.ok) router.push('/repartos')
  }

  const textoCompartir = () => {
    if (!reparto) return ''
    const lineas = reparto.participantes.map(p =>
      `- ${p.nombre}: ${formatoMoneda(p.monto_asignado, reparto.moneda)} ${p.pagado ? '✅' : '⬜'}`
    )
    return `Reparto — ${reparto.descripcion} (${formatoMoneda(reparto.monto_total, reparto.moneda)})\n${lineas.join('\n')}`
  }

  const compartir = async () => {
    const texto = textoCompartir()
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return } catch { /* cancelado */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoCompartir())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* sin permiso */ }
  }

  if (loading || !reparto) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] px-6 py-8 mx-auto space-y-4">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="h-32 rounded-card bg-fog animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  const pct = reparto.monto_total > 0 ? Math.round((reparto.monto_pagado / reparto.monto_total) * 100) : 0
  const pagados = reparto.participantes.filter(p => p.pagado).length

  return (
    <AppLayout>
      <div className="max-w-[1728px] px-5 py-6 mx-auto sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-5 sm:mb-6">
          <div>
            <button onClick={() => router.push('/repartos')} className="mb-1 text-sm text-steel hover:text-ink">← Repartos</button>
            <h1 className="text-xl font-bold text-obsidian sm:text-2xl">{reparto.descripcion}</h1>
            <p className="text-sm text-steel">
              {new Date(reparto.fecha + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })} · {reparto.metodo === 'igual' ? 'Partes iguales' : 'Montos a mano'}
            </p>
          </div>
        </div>

        {/* Total y progreso */}
        <div className="p-5 mb-6 bg-obsidian rounded-card-lg sm:p-6">
          <p className="mb-1 text-xs font-medium text-ash">Total del gasto</p>
          <p className="text-3xl font-bold text-snow sm:text-4xl">{formatoMoneda(reparto.monto_total, reparto.moneda)}</p>
          <div className="w-full h-2.5 mt-4 overflow-hidden rounded-full bg-white/15">
            <div className="h-full transition-all rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-ash">
            {pct}% pagado · {formatoMoneda(reparto.monto_pagado, reparto.moneda)} de {formatoMoneda(reparto.monto_total, reparto.moneda)} · {pagados}/{reparto.participantes.length} personas
          </p>
        </div>

        {/* Participantes */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-graphite">Personas</h2>
          <div className="overflow-hidden border bg-snow border-fog rounded-card">
            {reparto.participantes.map((p, i) => (
              <button key={p.id} onClick={() => togglePago(p)}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-mist active:bg-fog ${i > 0 ? 'border-t border-fog' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all ${p.pagado ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-pebble text-transparent'}`}>
                    ✓
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${p.pagado ? 'text-ash line-through' : 'text-ink'}`}>{p.nombre}</p>
                    <p className="text-xs text-ash">{p.pagado ? 'Pagado' : 'Pendiente'}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${p.pagado ? 'text-emerald-600' : 'text-obsidian'}`}>
                  {formatoMoneda(p.monto_asignado, reparto.moneda)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button onClick={compartir} className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill">
            Compartir
          </button>
          <button onClick={copiar} className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">
            {copiado ? '¡Copiado!' : 'Copiar resumen'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setShowEditar(true)} className="py-3 text-sm font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">
            Editar
          </button>
          <button onClick={eliminar} className="py-3 text-sm font-medium text-red-600 transition-all border rounded-full border-red-200 hover:bg-red-50">
            Eliminar
          </button>
        </div>
      </div>

      {showEditar && (
        <FormReparto reparto={reparto} monedaDefault={reparto.moneda}
          onClose={() => setShowEditar(false)} onSuccess={() => { setShowEditar(false); cargar() }} />
      )}
    </AppLayout>
  )
}
